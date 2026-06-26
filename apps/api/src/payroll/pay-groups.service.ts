import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { type Prisma, runInTenant } from "@payce/db";
import { generatePayPeriods, type PayFrequency, rulePacks } from "@payce/payroll-core";
import { AuditService } from "../audit/audit.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { AssignMembersDto, CreatePayGroupDto, GeneratePeriodsDto } from "./pay-groups.dto";

const GROUP_SELECT = {
  id: true,
  code: true,
  name: true,
  countryCode: true,
  currencyCode: true,
  frequency: true,
  legalEntityId: true,
  calendar: {
    select: { anchorDate: true, payDateOffsetDays: true, timezone: true },
  },
  _count: { select: { periods: true, members: true } },
} satisfies Prisma.PayGroupSelect;

/** Convert a `YYYY-MM-DD` calendar string to a UTC-midnight Date for a Prisma `@db.Date` column. */
function toDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

@Injectable()
export class PayGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Create a pay group and its calendar. Validates the country rule pack and currency up front. */
  async create(principal: AuthPrincipal, dto: CreatePayGroupDto) {
    const tenantId = this.requireTenant(principal);

    const pack = rulePacks[dto.countryCode];
    if (!pack) {
      throw new BadRequestException({
        code: "UNKNOWN_RULE_PACK",
        message: `No rule pack for country ${dto.countryCode} (have: ${Object.keys(rulePacks).join(", ")})`,
      });
    }
    if (pack.currency !== dto.currencyCode) {
      throw new BadRequestException({
        code: "CURRENCY_MISMATCH",
        message: `Country ${dto.countryCode} rule pack pays in ${pack.currency}, not ${dto.currencyCode}`,
      });
    }

    return runInTenant(this.prisma, tenantId, async (tx) => {
      if (dto.legalEntityId) {
        const entity = await tx.legalEntity.findFirst({ where: { id: dto.legalEntityId } });
        if (!entity) {
          throw new BadRequestException({
            code: "UNKNOWN_LEGAL_ENTITY",
            message: "legalEntityId does not exist in this tenant",
          });
        }
      }

      let group;
      try {
        group = await tx.payGroup.create({
          data: {
            tenantId,
            code: dto.code,
            name: dto.name,
            countryCode: dto.countryCode,
            currencyCode: dto.currencyCode,
            frequency: dto.frequency,
            legalEntityId: dto.legalEntityId ?? null,
            createdBy: principal.userId,
            calendar: {
              create: {
                tenantId,
                anchorDate: toDate(dto.calendar.anchorDate),
                payDateOffsetDays: dto.calendar.payDateOffsetDays,
                timezone: dto.calendar.timezone ?? null,
                createdBy: principal.userId,
              },
            },
          },
          select: GROUP_SELECT,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException({
            code: "PAY_GROUP_EXISTS",
            message: `A pay group with code "${dto.code}" already exists`,
          });
        }
        throw err;
      }

      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: principal.userId,
        action: "pay_group.created",
        entityType: "PayGroup",
        entityId: group.id,
        after: {
          code: dto.code,
          countryCode: dto.countryCode,
          currencyCode: dto.currencyCode,
          frequency: dto.frequency,
        },
      });

      return group;
    });
  }

  /** All pay groups in the tenant, with calendar and period/member counts. */
  async list(principal: AuthPrincipal) {
    const tenantId = this.requireTenant(principal);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.payGroup.findMany({ select: GROUP_SELECT, orderBy: { code: "asc" } }),
    );
    return { data };
  }

  async getById(principal: AuthPrincipal, id: string) {
    const tenantId = this.requireTenant(principal);
    const group = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.payGroup.findFirst({ where: { id }, select: GROUP_SELECT }),
    );
    if (!group) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Pay group not found" });
    }
    return group;
  }

  /**
   * Materialize the next `count` pay periods from the calendar. Periods are generated from the anchor
   * with stable sequence numbers, so this is safe to call repeatedly — it only inserts sequences beyond
   * those already present, and a unique (tenant, group, sequence) index backstops any race.
   */
  async generatePeriods(principal: AuthPrincipal, id: string, dto: GeneratePeriodsDto) {
    const tenantId = this.requireTenant(principal);

    return runInTenant(this.prisma, tenantId, async (tx) => {
      const group = await tx.payGroup.findFirst({
        where: { id },
        select: { id: true, frequency: true, calendar: true },
      });
      if (!group) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Pay group not found" });
      }
      if (!group.calendar) {
        throw new BadRequestException({
          code: "NO_CALENDAR",
          message: "Pay group has no calendar",
        });
      }

      const existing = await tx.payPeriod.count({ where: { payGroupId: id } });
      const anchor = group.calendar.anchorDate.toISOString().slice(0, 10);
      const all = generatePayPeriods({
        frequency: group.frequency as PayFrequency,
        anchorDate: anchor,
        count: existing + dto.count,
        payDateOffsetDays: group.calendar.payDateOffsetDays,
      });
      const toInsert = all.filter((p) => p.sequence > existing);

      await tx.payPeriod.createMany({
        data: toInsert.map((p) => ({
          tenantId,
          payGroupId: id,
          sequence: p.sequence,
          startDate: toDate(p.startDate),
          endDate: toDate(p.endDate),
          payDate: toDate(p.payDate),
          createdBy: principal.userId,
        })),
      });

      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: principal.userId,
        action: "pay_group.periods_generated",
        entityType: "PayGroup",
        entityId: id,
        after: { generated: toInsert.length, fromSequence: existing + 1 },
      });

      return { generated: toInsert.length, totalPeriods: existing + toInsert.length };
    });
  }

  /** Pay periods for a group, ordered by sequence. */
  async listPeriods(principal: AuthPrincipal, id: string) {
    const tenantId = this.requireTenant(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const group = await tx.payGroup.findFirst({ where: { id }, select: { id: true } });
      if (!group) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Pay group not found" });
      }
      const data = await tx.payPeriod.findMany({
        where: { payGroupId: id },
        select: {
          id: true,
          sequence: true,
          startDate: true,
          endDate: true,
          payDate: true,
          status: true,
        },
        orderBy: { sequence: "asc" },
      });
      return { data };
    });
  }

  /** Assign employees to the pay group (tenant-scoped). Returns how many rows changed. */
  async assignMembers(principal: AuthPrincipal, id: string, dto: AssignMembersDto) {
    const tenantId = this.requireTenant(principal);

    return runInTenant(this.prisma, tenantId, async (tx) => {
      const group = await tx.payGroup.findFirst({ where: { id }, select: { id: true } });
      if (!group) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Pay group not found" });
      }
      const { count } = await tx.employee.updateMany({
        where: { id: { in: dto.employeeIds }, deletedAt: null },
        data: { payGroupId: id, updatedBy: principal.userId },
      });

      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: principal.userId,
        action: "pay_group.members_assigned",
        entityType: "PayGroup",
        entityId: id,
        after: { assigned: count, requested: dto.employeeIds.length },
      });

      return { assigned: count };
    });
  }

  private requireTenant(principal: AuthPrincipal): string {
    if (!principal.tenantId) {
      throw new BadRequestException({ code: "BAD_REQUEST", message: "Tenant context required" });
    }
    return principal.tenantId;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}
