import { HttpException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ToolName, ToolResult } from "@payce/assist";
import { runInTenant } from "@payce/db";
import { PERMISSIONS, type PermissionKey } from "@payce/rbac";
import type { AuthPrincipal } from "../auth/auth.types";
import { ClaimsService } from "../claims/claims.service";
import { EmployeesService } from "../employees/employees.service";
import { LeaveService } from "../leave/leave.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The permission each scoped tool requires, or `null` when it reads only the caller's own record
 * (self-service, already gated by `assist.use` on the route). The orchestrator checks this before
 * running a tool, so a caller can never reach data their role wouldn't otherwise grant.
 */
const TOOL_PERMISSION: Record<ToolName, PermissionKey | null> = {
  leave_balance: PERMISSIONS.ORG_LEAVE_READ,
  leave_requests: PERMISSIONS.ORG_LEAVE_READ,
  claims_status: PERMISSIONS.ORG_CLAIM_READ,
  next_payday: null,
  latest_payslip: null,
  my_profile: null,
};

/** A tool's result minus the tool name, which {@link AssistToolsService.run} stamps on. */
type ToolOutcome = Omit<ToolResult, "tool">;

/**
 * Executes Assist's scoped data tools. Every tool either delegates to an existing tenant-scoped
 * service (which resolves the caller's own employee by `userId` and reads under Postgres RLS) or
 * runs an equivalent self-scoped query here. There is no code path that takes a tenant id or
 * employee id from the question, so a tool can never read another tenant's or another user's data —
 * the property the Phase 6 acceptance criterion verifies.
 */
@Injectable()
export class AssistToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
    private readonly claims: ClaimsService,
    private readonly employees: EmployeesService,
  ) {}

  /** The permission a tool needs, for the orchestrator's pre-execution check. */
  permissionFor(tool: ToolName): PermissionKey | null {
    return TOOL_PERMISSION[tool];
  }

  /** Run one tool for the caller, mapping "no linked employee" to a friendly `no_profile` outcome. */
  async run(principal: AuthPrincipal, tool: ToolName): Promise<ToolResult> {
    try {
      return { tool, ...(await this.execute(principal, tool)) };
    } catch (err) {
      return { tool, ok: false, error: classifyError(err) };
    }
  }

  private execute(principal: AuthPrincipal, tool: ToolName): Promise<ToolOutcome> {
    switch (tool) {
      case "leave_balance":
        return this.leaveBalance(principal);
      case "leave_requests":
        return this.leaveRequests(principal);
      case "claims_status":
        return this.claimsStatus(principal);
      case "next_payday":
        return this.nextPayday(principal);
      case "latest_payslip":
        return this.latestPayslip(principal);
      case "my_profile":
        return this.myProfile(principal);
    }
  }

  private async leaveBalance(principal: AuthPrincipal): Promise<ToolOutcome> {
    const [{ data: balances }, { data: types }] = await Promise.all([
      this.leave.myBalances(principal),
      this.leave.listTypes(principal),
    ]);
    if (balances.length === 0) {
      return { ok: true, summary: "You don't have any leave balances on record yet.", data: [] };
    }
    const typeName = new Map(types.map((t) => [t.id, t.name]));
    const year = Math.max(...balances.map((b) => b.year));
    const lines = balances
      .filter((b) => b.year === year)
      .map((b) => ({
        leaveType: typeName.get(b.leaveTypeId) ?? "Leave",
        remaining: round1(b.entitledDays - b.usedDays - b.pendingDays),
        entitled: b.entitledDays,
        used: b.usedDays,
        pending: b.pendingDays,
      }));
    const summary = `You have ${joinList(
      lines.map((l) => `${formatDays(l.remaining)} of ${l.leaveType}`),
    )} remaining.`;
    return { ok: true, summary, data: { year, balances: lines } };
  }

  private async leaveRequests(principal: AuthPrincipal): Promise<ToolOutcome> {
    const { data } = await this.leave.myRequests(principal);
    const latest = data[0]; // myRequests orders newest-first
    if (!latest) {
      return { ok: true, summary: "You don't have any leave requests on record." };
    }
    const pending = data.filter((r) => r.status === "PENDING").length;
    const approved = data.filter((r) => r.status === "APPROVED").length;
    const summary =
      `You have ${data.length} leave request(s): ${pending} pending and ${approved} approved. ` +
      `Your most recent is ${latest.status.toLowerCase()} for ${formatDays(latest.days)} from ${fmtDate(latest.startDate)}.`;
    return { ok: true, summary, data: { total: data.length, pending, approved } };
  }

  private async claimsStatus(principal: AuthPrincipal): Promise<ToolOutcome> {
    const { data } = await this.claims.myClaims(principal);
    if (data.length === 0) {
      return { ok: true, summary: "You don't have any expense claims on record." };
    }
    const count = (status: string) => data.filter((c) => c.status === status).length;
    const pending = count("PENDING");
    const approved = count("APPROVED");
    const paid = count("PAID");
    const summary = `You have ${data.length} claim(s): ${pending} pending, ${approved} approved, and ${paid} paid.`;
    return { ok: true, summary, data: { total: data.length, pending, approved, paid } };
  }

  private nextPayday(principal: AuthPrincipal): Promise<ToolOutcome> {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { userId, deletedAt: null },
        select: { payGroupId: true },
      });
      if (!employee) return { ok: false, error: "no_profile" };
      if (!employee.payGroupId) {
        return {
          ok: true,
          summary:
            "You're not assigned to a pay group yet, so I don't have a payday scheduled for you.",
        };
      }
      const next = await tx.payPeriod.findFirst({
        where: { payGroupId: employee.payGroupId, payDate: { gte: startOfTodayUtc() } },
        orderBy: { payDate: "asc" },
        select: { payDate: true },
      });
      if (!next) {
        return {
          ok: true,
          summary: "I couldn't find an upcoming payday scheduled for your pay group.",
        };
      }
      return {
        ok: true,
        summary: `Your next payday is ${fmtDate(next.payDate)}.`,
        data: { payDate: next.payDate },
      };
    });
  }

  private latestPayslip(principal: AuthPrincipal): Promise<ToolOutcome> {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { userId, deletedAt: null },
        select: { id: true },
      });
      if (!employee) return { ok: false, error: "no_profile" };
      const slip = await tx.payslipDocument.findFirst({
        where: { employeeId: employee.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          payrollRun: { select: { payPeriod: { select: { endDate: true } } } },
        },
      });
      if (!slip) {
        return {
          ok: true,
          summary:
            "You don't have any published payslips yet. They'll appear in MyHR once your first pay run is published.",
        };
      }
      const periodEnd = slip.payrollRun?.payPeriod?.endDate ?? null;
      const summary = periodEnd
        ? `Your latest payslip (pay period ending ${fmtDate(periodEnd)}) is available to download in MyHR.`
        : "Your latest payslip is available to download in MyHR.";
      return { ok: true, summary, data: { payslipId: slip.id, periodEnd } };
    });
  }

  private async myProfile(principal: AuthPrincipal): Promise<ToolOutcome> {
    const profile = await this.employees.myProfile(principal);
    const department = profile.department?.name ?? null;
    const manager = profile.manager
      ? `${profile.manager.firstName} ${profile.manager.lastName}`
      : null;
    const summary =
      `You're ${profile.firstName} ${profile.lastName} (employee ${profile.employeeNumber})` +
      `${department ? ` in ${department}` : ""}.${manager ? ` Your manager is ${manager}.` : ""}`;
    return {
      ok: true,
      summary,
      data: { employeeNumber: profile.employeeNumber, department, manager },
    };
  }

  private requireUser(principal: AuthPrincipal): { tenantId: string; userId: string } {
    if (!principal.tenantId || !principal.userId) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Tenant user required" });
    }
    return { tenantId: principal.tenantId, userId: principal.userId };
  }
}

/** Map a thrown service error to a tool error code; "no linked employee" reads as `no_profile`. */
function classifyError(err: unknown): string {
  if (err instanceof HttpException) {
    const res = err.getResponse();
    const code = typeof res === "object" && res !== null && "code" in res ? String(res.code) : "";
    const message =
      typeof res === "object" && res !== null && "message" in res ? String(res.message) : "";
    if (/PROFILE/i.test(code) || /employee profile/i.test(message)) return "no_profile";
  }
  return "not_found";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatDays(value: number): string {
  return `${value} ${value === 1 ? "day" : "days"}`;
}

/** "a", "a and b", "a, b, and c" — an Oxford-comma list for human-readable summaries. */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function fmtDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
