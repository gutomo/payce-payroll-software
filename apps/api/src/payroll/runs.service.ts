import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { type Prisma, runInTenant } from "@payce/db";
import {
  detectAnomalies,
  type AnomalyInput,
  type PayElementDef,
  type PayFrequency,
  periodsPerYear,
  roundToMinor,
  rulePacks,
  runPayroll,
} from "@payce/payroll-core";
import { AuditService } from "../audit/audit.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateRunDto, DecisionDto } from "./runs.dto";
import { BankFileService } from "./bank-file.service";
import { PayslipService } from "./payslip.service";

// A run is editable (recalculable) only before it enters the approval flow.
const RECALCULABLE: ReadonlyArray<string> = ["DRAFT", "CALCULATED", "REJECTED"];

// Until data-driven pay elements land (a later slice), gross is the employee's base salary prorated to
// the pay-group frequency; the country rule pack then layers statutory deductions on top.
const BASIC_ELEMENT: PayElementDef = {
  code: "basic",
  name: "Basic salary",
  type: "EARNING",
  formula: "baseSalary",
};

const RUN_SELECT = {
  id: true,
  status: true,
  payGroupId: true,
  payPeriodId: true,
  countryCode: true,
  rulePackVersion: true,
  currencyCode: true,
  frequency: true,
  grossMinor: true,
  deductionsMinor: true,
  netMinor: true,
  employeeCount: true,
  submittedBy: true,
  submittedAt: true,
  approvedBy: true,
  approvedAt: true,
  publishedBy: true,
  publishedAt: true,
  createdAt: true,
  payGroup: { select: { code: true, name: true } },
  payPeriod: {
    select: { sequence: true, startDate: true, endDate: true, payDate: true, status: true },
  },
} satisfies Prisma.PayrollRunSelect;

type RunRow = Prisma.PayrollRunGetPayload<{ select: typeof RUN_SELECT }>;

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payslip: PayslipService,
    private readonly bankFile: BankFileService,
  ) {}

  /** Open a DRAFT run for a pay group + one of its periods. One run per period (unique). */
  async create(principal: AuthPrincipal, dto: CreateRunDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const period = await tx.payPeriod.findFirst({
        where: { id: dto.payPeriodId, payGroupId: dto.payGroupId },
        select: { id: true },
      });
      if (!period) {
        throw new BadRequestException({
          code: "INVALID_PERIOD",
          message: "Pay period not found for this pay group",
        });
      }
      let run: RunRow;
      try {
        run = await tx.payrollRun.create({
          data: {
            tenantId,
            payGroupId: dto.payGroupId,
            payPeriodId: dto.payPeriodId,
            createdBy: userId,
          },
          select: RUN_SELECT,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException({
            code: "RUN_EXISTS",
            message: "A run already exists for this pay period",
          });
        }
        throw err;
      }
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "payroll_run.created",
        entityType: "PayrollRun",
        entityId: run.id,
        after: { payGroupId: dto.payGroupId, payPeriodId: dto.payPeriodId },
      });
      return serializeRun(run);
    });
  }

  /**
   * Compute every member's payslip via the pure engine and persist the lines, replacing any prior
   * calculation. Freezes the reproducibility snapshot (country, rule-pack version, currency, frequency)
   * and the aggregate totals. Allowed only before approval.
   */
  async calculate(principal: AuthPrincipal, runId: string) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId },
        select: {
          id: true,
          status: true,
          payGroup: {
            select: { id: true, countryCode: true, currencyCode: true, frequency: true },
          },
          payPeriod: { select: { startDate: true, endDate: true } },
        },
      });
      if (!run) throw notFound();
      if (!RECALCULABLE.includes(run.status)) {
        throw new ConflictException({
          code: "RUN_LOCKED",
          message: `Cannot recalculate a run in status ${run.status}`,
        });
      }

      const group = run.payGroup;
      const pack = rulePacks[group.countryCode];
      if (!pack) {
        throw new BadRequestException({
          code: "UNKNOWN_RULE_PACK",
          message: `No rule pack for country ${group.countryCode}`,
        });
      }
      if (pack.currency !== group.currencyCode) {
        throw new BadRequestException({
          code: "CURRENCY_MISMATCH",
          message: `Rule pack pays in ${pack.currency}, pay group in ${group.currencyCode}`,
        });
      }
      const groupPpy = periodsPerYear(group.frequency as PayFrequency);

      const [members, priorRunLines] = await Promise.all([
        tx.employee.findMany({
          where: { payGroupId: group.id, deletedAt: null },
          select: {
            id: true,
            compensationRecords: {
              where: {
                effectiveFrom: { lte: run.payPeriod.endDate },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.payPeriod.startDate } }],
              },
              orderBy: { effectiveFrom: "desc" },
              take: 1,
              select: { amountMinor: true, currencyCode: true, frequency: true },
            },
          },
        }),
        // Fetch prior run lines for PAY_VARIANCE detection (most recent run for this group, not this run).
        tx.payrollRun
          .findFirst({
            where: {
              payGroupId: group.id,
              id: { not: runId },
              status: { in: ["CALCULATED", "PENDING_APPROVAL", "APPROVED", "PUBLISHED"] },
            },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          })
          .then((prior) =>
            prior
              ? tx.payrollRunLine.findMany({
                  where: { payrollRunId: prior.id },
                  select: { employeeId: true, grossMinor: true },
                })
              : [],
          ),
      ]);

      const lineData: Prisma.PayrollRunLineCreateManyInput[] = [];
      const anomalyInputs: AnomalyInput[] = [];
      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      for (const member of members) {
        const comp = member.compensationRecords[0];
        if (!comp || comp.currencyCode !== group.currencyCode) {
          anomalyInputs.push({
            employeeId: member.id,
            grossMinor: 0,
            deductionsMinor: 0,
            netMinor: 0,
            skipped: true,
          });
          continue;
        }
        const periodGross = roundToMinor(
          (Number(comp.amountMinor) * periodsPerYear(comp.frequency as PayFrequency)) / groupPpy,
        );
        const result = runPayroll({
          currency: group.currencyCode,
          variables: { baseSalary: periodGross },
          elements: [BASIC_ELEMENT],
          rulePack: pack,
          statutory: { periodsPerYear: groupPpy },
        });
        lineData.push({
          tenantId,
          payrollRunId: runId,
          employeeId: member.id,
          currencyCode: group.currencyCode,
          grossMinor: BigInt(result.grossMinor),
          deductionsMinor: BigInt(result.deductionsMinor),
          netMinor: BigInt(result.netMinor),
          lines: result.lines as unknown as Prisma.InputJsonValue,
        });
        anomalyInputs.push({
          employeeId: member.id,
          grossMinor: result.grossMinor,
          deductionsMinor: result.deductionsMinor,
          netMinor: result.netMinor,
        });
        totalGross += result.grossMinor;
        totalDeductions += result.deductionsMinor;
        totalNet += result.netMinor;
      }

      const priorByEmployee = priorRunLines.map((l) => ({
        employeeId: l.employeeId,
        grossMinor: Number(l.grossMinor),
      }));
      const anomalies = detectAnomalies(anomalyInputs, priorByEmployee);

      await tx.payrollRunLine.deleteMany({ where: { payrollRunId: runId } });
      await tx.anomaly.deleteMany({ where: { payrollRunId: runId } });
      if (lineData.length > 0) await tx.payrollRunLine.createMany({ data: lineData });
      if (anomalies.length > 0) {
        await tx.anomaly.createMany({
          data: anomalies.map((a) => ({
            tenantId,
            payrollRunId: runId,
            employeeId: a.employeeId,
            type: a.type,
            severity: a.severity,
            detail: a.detail as Prisma.InputJsonValue,
          })),
        });
      }

      const updated = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: "CALCULATED",
          countryCode: group.countryCode,
          rulePackVersion: pack.version,
          currencyCode: group.currencyCode,
          frequency: group.frequency,
          grossMinor: BigInt(totalGross),
          deductionsMinor: BigInt(totalDeductions),
          netMinor: BigInt(totalNet),
          employeeCount: lineData.length,
          updatedBy: userId,
        },
        select: RUN_SELECT,
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "payroll_run.calculated",
        entityType: "PayrollRun",
        entityId: runId,
        after: {
          employeeCount: lineData.length,
          netMinor: totalNet,
          rulePackVersion: pack.version,
        },
      });
      return serializeRun(updated);
    });
  }

  /** Maker submits a calculated run for approval. */
  async submit(principal: AuthPrincipal, runId: string) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId },
        select: { id: true, status: true, employeeCount: true },
      });
      if (!run) throw notFound();
      if (run.status !== "CALCULATED" && run.status !== "REJECTED") {
        throw invalidState(run.status, "submit");
      }
      if (run.employeeCount === 0) {
        throw new BadRequestException({
          code: "EMPTY_RUN",
          message: "Run has no calculated lines to submit",
        });
      }
      const updated = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: "PENDING_APPROVAL",
          submittedBy: userId,
          submittedAt: new Date(),
          updatedBy: userId,
        },
        select: RUN_SELECT,
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "payroll_run.submitted",
        entityType: "PayrollRun",
        entityId: runId,
      });
      return serializeRun(updated);
    });
  }

  /** Checker approves or rejects. Maker-checker: the checker must differ from the submitter. */
  async decide(
    principal: AuthPrincipal,
    runId: string,
    decision: "APPROVE" | "REJECT",
    dto: DecisionDto,
  ) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId },
        select: { id: true, status: true, submittedBy: true },
      });
      if (!run) throw notFound();
      if (run.status !== "PENDING_APPROVAL") throw invalidState(run.status, decision.toLowerCase());
      if (run.submittedBy && run.submittedBy === userId) {
        throw new ConflictException({
          code: "SELF_APPROVAL_FORBIDDEN",
          message: "A run must be approved or rejected by a different user than the submitter",
        });
      }

      const approve = decision === "APPROVE";
      const updated = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: approve ? "APPROVED" : "REJECTED",
          updatedBy: userId,
          ...(approve ? { approvedBy: userId, approvedAt: new Date() } : {}),
        },
        select: RUN_SELECT,
      });
      await tx.approval.create({
        data: {
          tenantId,
          payrollRunId: runId,
          decision,
          actorUserId: userId,
          note: dto.note ?? null,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: approve ? "payroll_run.approved" : "payroll_run.rejected",
        entityType: "PayrollRun",
        entityId: runId,
        after: dto.note ? { note: dto.note } : undefined,
      });
      return serializeRun(updated);
    });
  }

  /** Publish an approved run (disburse). Hard-gated on a distinct second approver (golden rule 7). */
  async publish(principal: AuthPrincipal, runId: string) {
    const { tenantId, userId } = this.requireUser(principal);
    const result = await runInTenant(this.prisma, tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId },
        select: { id: true, status: true, submittedBy: true, approvedBy: true, payPeriodId: true },
      });
      if (!run) throw notFound();
      if (run.status !== "APPROVED") throw invalidState(run.status, "publish");
      // Defense in depth: never disburse without a second approver who is not the submitter.
      if (!run.approvedBy || (run.submittedBy && run.approvedBy === run.submittedBy)) {
        throw new ConflictException({
          code: "MAKER_CHECKER_VIOLATION",
          message: "Run must be approved by a different user before publishing",
        });
      }
      const updated = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: "PUBLISHED",
          publishedBy: userId,
          publishedAt: new Date(),
          updatedBy: userId,
        },
        select: RUN_SELECT,
      });
      // Lock the period: it has been paid.
      await tx.payPeriod.update({
        where: { id: run.payPeriodId },
        data: { status: "PAID", updatedBy: userId },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "payroll_run.published",
        entityType: "PayrollRun",
        entityId: runId,
      });
      return serializeRun(updated);
    });
    // PDF and bank file generation happen after the DB transaction commits (S3 is not transactional).
    await Promise.all([
      this.payslip.generateAll(tenantId, runId),
      this.bankFile.generate(tenantId, runId),
    ]);
    return result;
  }

  async list(principal: AuthPrincipal) {
    const tenantId = this.requireTenant(principal);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.payrollRun.findMany({ select: RUN_SELECT, orderBy: { createdAt: "desc" } }),
    );
    return { data: data.map(serializeRun) };
  }

  async getById(principal: AuthPrincipal, runId: string) {
    const tenantId = this.requireTenant(principal);
    const run = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.payrollRun.findFirst({ where: { id: runId }, select: RUN_SELECT }),
    );
    if (!run) throw notFound();
    return serializeRun(run);
  }

  /** Per-employee result lines for a run. */
  async listLines(principal: AuthPrincipal, runId: string) {
    const tenantId = this.requireTenant(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id: runId }, select: { id: true } });
      if (!run) throw notFound();
      const lines = await tx.payrollRunLine.findMany({
        where: { payrollRunId: runId },
        select: {
          id: true,
          employeeId: true,
          currencyCode: true,
          grossMinor: true,
          deductionsMinor: true,
          netMinor: true,
          lines: true,
          employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
        },
        orderBy: { employee: { employeeNumber: "asc" } },
      });
      return {
        data: lines.map((l) => ({
          id: l.id,
          employeeId: l.employeeId,
          employeeNumber: l.employee.employeeNumber,
          name: `${l.employee.firstName} ${l.employee.lastName}`,
          currencyCode: l.currencyCode,
          grossMinor: Number(l.grossMinor),
          deductionsMinor: Number(l.deductionsMinor),
          netMinor: Number(l.netMinor),
          lines: l.lines,
        })),
      };
    });
  }

  async getBankFileUrl(principal: AuthPrincipal, runId: string) {
    const tenantId = this.requireTenant(principal);
    const run = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.payrollRun.findFirst({ where: { id: runId }, select: { id: true } }),
    );
    if (!run) throw notFound();
    return this.bankFile.getSignedUrl(tenantId, runId);
  }

  async getPayslipUrl(principal: AuthPrincipal, runId: string, employeeId: string) {
    const tenantId = this.requireTenant(principal);
    // Verify the run exists and belongs to this tenant (RLS enforces isolation).
    const run = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.payrollRun.findFirst({ where: { id: runId }, select: { id: true } }),
    );
    if (!run) throw notFound();
    return this.payslip.getSignedUrl(tenantId, runId, employeeId);
  }

  async listAnomalies(principal: AuthPrincipal, runId: string) {
    const tenantId = this.requireTenant(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id: runId }, select: { id: true } });
      if (!run) throw notFound();
      const anomalies = await tx.anomaly.findMany({
        where: { payrollRunId: runId },
        select: {
          id: true,
          employeeId: true,
          type: true,
          severity: true,
          detail: true,
          createdAt: true,
          employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
        },
        orderBy: [{ severity: "asc" }, { type: "asc" }],
      });
      return { data: anomalies };
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

function notFound(): NotFoundException {
  return new NotFoundException({ code: "NOT_FOUND", message: "Payroll run not found" });
}

function invalidState(status: string, action: string): ConflictException {
  return new ConflictException({
    code: "INVALID_STATE",
    message: `Cannot ${action} a run in status ${status}`,
  });
}

/** BigInt minor-unit totals → JSON-safe numbers (payroll amounts are well within Number's safe range). */
function serializeRun(run: RunRow) {
  return {
    ...run,
    grossMinor: bigToNum(run.grossMinor),
    deductionsMinor: bigToNum(run.deductionsMinor),
    netMinor: bigToNum(run.netMinor),
  };
}

function bigToNum(value: bigint | null): number | null {
  return value === null ? null : Number(value);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}
