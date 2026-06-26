import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { type Prisma, runInTenant } from "@payce/db";
import { AuditService } from "../audit/audit.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ApplyLeaveDto,
  CreateLeaveTypeDto,
  LeaveDecisionDto,
  UpsertLeaveBalanceDto,
} from "./leave.dto";
import { countWorkingDays, parseIsoDate } from "./leave.util";

type Decision = "APPROVE" | "REJECT";

// Mirror of the Prisma LeaveRequestStatus enum, used to validate query filters.
const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── Leave types (HR config) ───────────────────────────

  async createType(principal: AuthPrincipal, dto: CreateLeaveTypeDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      let type: { id: string };
      try {
        type = await tx.leaveType.create({
          data: {
            tenantId,
            code: dto.code,
            name: dto.name,
            isPaid: dto.isPaid,
            accrualDays: dto.accrualDays ?? null,
            carryOverMax: dto.carryOverMax ?? null,
            createdBy: userId,
          },
          select: { id: true },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException({
            code: "LEAVE_TYPE_EXISTS",
            message: `A leave type with code ${dto.code} already exists`,
          });
        }
        throw err;
      }
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "leave_type.created",
        entityType: "LeaveType",
        entityId: type.id,
        after: { code: dto.code, isPaid: dto.isPaid },
      });
      return this.findType(tx, type.id);
    });
  }

  async listTypes(principal: AuthPrincipal) {
    const tenantId = this.requireTenant(principal);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.leaveType.findMany({ orderBy: { code: "asc" } }),
    );
    return { data };
  }

  // ─────────────────────────── Balances ───────────────────────────

  async upsertBalance(principal: AuthPrincipal, dto: UpsertLeaveBalanceDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      await this.assertEmployee(tx, dto.employeeId);
      await this.assertType(tx, dto.leaveTypeId);
      const balance = await tx.leaveBalance.upsert({
        where: {
          tenantId_employeeId_leaveTypeId_year: {
            tenantId,
            employeeId: dto.employeeId,
            leaveTypeId: dto.leaveTypeId,
            year: dto.year,
          },
        },
        update: { entitledDays: dto.entitledDays },
        create: {
          tenantId,
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          year: dto.year,
          entitledDays: dto.entitledDays,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "leave_balance.set",
        entityType: "LeaveBalance",
        entityId: balance.id,
        after: { employeeId: dto.employeeId, year: dto.year, entitledDays: dto.entitledDays },
      });
      return balance;
    });
  }

  async listBalances(principal: AuthPrincipal, employeeId?: string) {
    const tenantId = this.requireTenant(principal);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.leaveBalance.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: [{ employeeId: "asc" }, { year: "desc" }],
      }),
    );
    return { data };
  }

  /** The caller's own balances (employee self-service). */
  async myBalances(principal: AuthPrincipal) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const employee = await this.resolveSelf(tx, userId);
      const data = await tx.leaveBalance.findMany({
        where: { employeeId: employee.id },
        orderBy: { year: "desc" },
      });
      return { data };
    });
  }

  // ─────────────────────────── Requests (apply → approve/reject) ───────────────────────────

  /** Employee applies for leave on their own behalf; reserves the days against their balance. */
  async apply(principal: AuthPrincipal, dto: ApplyLeaveDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const employee = await this.resolveSelf(tx, userId);
      const type = await this.assertType(tx, dto.leaveTypeId);

      const start = parseIsoDate(dto.startDate);
      const end = parseIsoDate(dto.endDate);
      const days = countWorkingDays(start, end);
      if (days <= 0) {
        throw new BadRequestException({
          code: "NO_WORKING_DAYS",
          message: "The requested range contains no working days",
        });
      }

      const year = start.getUTCFullYear();
      const balance = await this.getOrCreateBalance(
        tx,
        tenantId,
        employee.id,
        type.id,
        year,
        type.accrualDays ?? 0,
      );
      const available = balance.entitledDays - balance.usedDays - balance.pendingDays;
      if (days > available) {
        throw new ConflictException({
          code: "INSUFFICIENT_BALANCE",
          message: `Requested ${days} day(s) but only ${available} available`,
        });
      }

      const request = await tx.leaveRequest.create({
        data: {
          tenantId,
          employeeId: employee.id,
          leaveTypeId: type.id,
          startDate: start,
          endDate: end,
          days,
          note: dto.note ?? null,
          status: "PENDING",
          createdBy: userId,
        },
        select: { id: true },
      });
      // Reserve the days so concurrent requests can't oversubscribe the balance.
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { pendingDays: { increment: days } },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "leave_request.created",
        entityType: "LeaveRequest",
        entityId: request.id,
        after: { leaveTypeId: type.id, days, startDate: dto.startDate, endDate: dto.endDate },
      });
      return this.findRequest(tx, request.id);
    });
  }

  /** Approver decides a pending request; settles the reserved days on the balance. */
  async decide(principal: AuthPrincipal, id: string, decision: Decision, dto: LeaveDecisionDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const request = await tx.leaveRequest.findFirst({
        where: { id },
        select: {
          id: true,
          status: true,
          days: true,
          employeeId: true,
          leaveTypeId: true,
          startDate: true,
        },
      });
      if (!request) throw requestNotFound();
      if (request.status !== "PENDING") {
        throw new ConflictException({
          code: "REQUEST_NOT_PENDING",
          message: `Cannot decide a request in status ${request.status}`,
        });
      }

      const balance = await tx.leaveBalance.findFirst({
        where: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year: request.startDate.getUTCFullYear(),
        },
        select: { id: true },
      });
      if (balance) {
        // Release the reservation either way; on approval move it into used days.
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: { decrement: request.days },
            ...(decision === "APPROVE" ? { usedDays: { increment: request.days } } : {}),
          },
        });
      }

      const updated = await tx.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNote: dto.note ?? null,
          updatedBy: userId,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: decision === "APPROVE" ? "leave_request.approved" : "leave_request.rejected",
        entityType: "LeaveRequest",
        entityId: request.id,
        after: dto.note ? { note: dto.note } : undefined,
      });
      return this.findRequest(tx, updated.id);
    });
  }

  /** The requester cancels their own still-pending request, releasing the reserved days. */
  async cancel(principal: AuthPrincipal, id: string) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const employee = await this.resolveSelf(tx, userId);
      const request = await tx.leaveRequest.findFirst({
        where: { id, employeeId: employee.id },
        select: { id: true, status: true, days: true, leaveTypeId: true, startDate: true },
      });
      if (!request) throw requestNotFound();
      if (request.status !== "PENDING") {
        throw new ConflictException({
          code: "REQUEST_NOT_PENDING",
          message: `Cannot cancel a request in status ${request.status}`,
        });
      }
      const balance = await tx.leaveBalance.findFirst({
        where: {
          employeeId: employee.id,
          leaveTypeId: request.leaveTypeId,
          year: request.startDate.getUTCFullYear(),
        },
        select: { id: true },
      });
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { pendingDays: { decrement: request.days } },
        });
      }
      const updated = await tx.leaveRequest.update({
        where: { id: request.id },
        data: { status: "CANCELLED", updatedBy: userId },
        select: { id: true },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "leave_request.cancelled",
        entityType: "LeaveRequest",
        entityId: request.id,
      });
      return this.findRequest(tx, updated.id);
    });
  }

  async listRequests(principal: AuthPrincipal, status?: string) {
    const tenantId = this.requireTenant(principal);
    // Only filter on a recognised status; an unknown value is treated as "no filter".
    const statusFilter = LEAVE_STATUSES.find((s) => s === status);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.leaveRequest.findMany({
        where: statusFilter ? { status: statusFilter } : undefined,
        orderBy: { createdAt: "desc" },
      }),
    );
    return { data };
  }

  async myRequests(principal: AuthPrincipal) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const employee = await this.resolveSelf(tx, userId);
      const data = await tx.leaveRequest.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: "desc" },
      });
      return { data };
    });
  }

  async getRequest(principal: AuthPrincipal, id: string) {
    const tenantId = this.requireTenant(principal);
    const request = await runInTenant(this.prisma, tenantId, (tx) => this.findRequest(tx, id));
    if (!request) throw requestNotFound();
    return request;
  }

  // ─────────────────────────── helpers ───────────────────────────

  private findType(tx: Prisma.TransactionClient, id: string) {
    return tx.leaveType.findUniqueOrThrow({ where: { id } });
  }

  private findRequest(tx: Prisma.TransactionClient, id: string) {
    return tx.leaveRequest.findFirst({ where: { id } });
  }

  private async assertEmployee(tx: Prisma.TransactionClient, employeeId: string) {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Employee not found" });
    }
    return employee;
  }

  private async assertType(tx: Prisma.TransactionClient, leaveTypeId: string) {
    const type = await tx.leaveType.findFirst({
      where: { id: leaveTypeId, isActive: true },
      select: { id: true, accrualDays: true, isPaid: true },
    });
    if (!type) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Leave type not found" });
    }
    return type;
  }

  private async resolveSelf(tx: Prisma.TransactionClient, userId: string) {
    const employee = await tx.employee.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException({
        code: "NO_EMPLOYEE_PROFILE",
        message: "No employee profile for this user",
      });
    }
    return employee;
  }

  private async getOrCreateBalance(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    fallbackEntitledDays: number,
  ) {
    const existing = await tx.leaveBalance.findFirst({
      where: { employeeId, leaveTypeId, year },
    });
    if (existing) return existing;
    return tx.leaveBalance.create({
      data: { tenantId, employeeId, leaveTypeId, year, entitledDays: fallbackEntitledDays },
    });
  }

  private requireTenant(principal: AuthPrincipal): string {
    if (!principal.tenantId) {
      throw new BadRequestException({ code: "BAD_REQUEST", message: "Tenant context required" });
    }
    return principal.tenantId;
  }

  private requireUser(principal: AuthPrincipal): { tenantId: string; userId: string } {
    if (!principal.tenantId || !principal.userId) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Tenant user required" });
    }
    return { tenantId: principal.tenantId, userId: principal.userId };
  }
}

function requestNotFound(): NotFoundException {
  return new NotFoundException({ code: "NOT_FOUND", message: "Leave request not found" });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}
