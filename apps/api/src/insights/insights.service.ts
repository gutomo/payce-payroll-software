import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { type Prisma, runInTenant } from "@payce/db";
import {
  type CellValue,
  type CompiledColumn,
  compileReport,
  computeNextRun,
  datasetSummaries,
  getPrebuiltDashboard,
  parseReportSpec,
  PREBUILT_DASHBOARDS,
  type QueryPlan,
  ReportCompileError,
  reportToCsv,
  type ReportResult,
  type ReportSpec,
  reportToXlsx,
} from "@payce/insights";
import { AuditService } from "../audit/audit.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateReportDto,
  CreateScheduleDto,
  ExportFormat,
  UpdateReportDto,
  UpdateScheduleDto,
} from "./insights.dto";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface ReportExport {
  filename: string;
  contentType: string;
  body: Buffer;
}

@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── Catalog discovery (no DB) ───────────────────────────

  /** The dataset catalog (dimensions/measures) the no-code builder offers; no SQL leaks to clients. */
  listDatasets() {
    return { data: datasetSummaries() };
  }

  /** Prebuilt, code-defined dashboards (metadata only; data comes from runPrebuiltDashboard). */
  listPrebuiltDashboards() {
    return {
      data: PREBUILT_DASHBOARDS.map(({ key, title, description, chart }) => ({
        key,
        title,
        description,
        chart,
      })),
    };
  }

  // ─────────────────────────── Running reports ───────────────────────────

  /** Compile + execute an ad-hoc spec under the caller's tenant (RLS). */
  async runReport(principal: AuthPrincipal, spec: ReportSpec): Promise<ReportResult> {
    const tenantId = this.requireTenant(principal);
    const plan = this.compile(spec);
    return runInTenant(this.prisma, tenantId, (tx) => this.execute(tx, plan));
  }

  async runSavedReport(principal: AuthPrincipal, id: string): Promise<ReportResult> {
    const tenantId = this.requireTenant(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const spec = await this.loadSpec(tx, id);
      return this.execute(tx, this.compile(spec));
    });
  }

  /** Run a prebuilt dashboard's spec and return its data plus presentation metadata. */
  async runPrebuiltDashboard(principal: AuthPrincipal, key: string) {
    const tenantId = this.requireTenant(principal);
    const dashboard = getPrebuiltDashboard(key);
    if (!dashboard) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Unknown dashboard" });
    }
    const plan = this.compile(dashboard.spec);
    const result = await runInTenant(this.prisma, tenantId, (tx) => this.execute(tx, plan));
    return { key: dashboard.key, title: dashboard.title, chart: dashboard.chart, result };
  }

  /** Run a saved report and serialise it to a downloadable CSV/XLSX (export is audited: data egress). */
  async exportSavedReport(
    principal: AuthPrincipal,
    id: string,
    format: ExportFormat,
  ): Promise<ReportExport> {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const def = await tx.reportDefinition.findFirst({
        where: { id },
        select: { id: true, name: true, definition: true },
      });
      if (!def) throw reportNotFound();

      const result = await this.execute(tx, this.compile(this.parseStored(def.definition)));
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "report.exported",
        entityType: "ReportDefinition",
        entityId: def.id,
        after: { format, rows: result.rows.length },
      });

      const slug = slugify(def.name);
      if (format === "csv") {
        return {
          filename: `${slug}.csv`,
          contentType: "text/csv; charset=utf-8",
          body: Buffer.from(reportToCsv(result), "utf-8"),
        };
      }
      return {
        filename: `${slug}.xlsx`,
        contentType: XLSX_CONTENT_TYPE,
        body: Buffer.from(reportToXlsx(result, { sheetName: def.name })),
      };
    });
  }

  // ─────────────────────────── Saved report CRUD ───────────────────────────

  async createReport(principal: AuthPrincipal, dto: CreateReportDto) {
    const { tenantId, userId } = this.requireUser(principal);
    // Reject specs that don't compile before persisting; we never store an unrunnable report.
    this.compile(dto.spec);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      let def: { id: string };
      try {
        def = await tx.reportDefinition.create({
          data: {
            tenantId,
            name: dto.name,
            description: dto.description ?? null,
            dataset: dto.spec.dataset,
            definition: dto.spec,
            createdBy: userId,
          },
          select: { id: true },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw reportExists(dto.name);
        throw err;
      }
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "report.created",
        entityType: "ReportDefinition",
        entityId: def.id,
        after: { name: dto.name, dataset: dto.spec.dataset },
      });
      return this.findReport(tx, def.id);
    });
  }

  async listReports(principal: AuthPrincipal) {
    const tenantId = this.requireTenant(principal);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.reportDefinition.findMany({ orderBy: { name: "asc" } }),
    );
    return { data };
  }

  async getReport(principal: AuthPrincipal, id: string) {
    const tenantId = this.requireTenant(principal);
    const report = await runInTenant(this.prisma, tenantId, (tx) => this.findReport(tx, id));
    if (!report) throw reportNotFound();
    return report;
  }

  async updateReport(principal: AuthPrincipal, id: string, dto: UpdateReportDto) {
    const { tenantId, userId } = this.requireUser(principal);
    if (dto.spec) this.compile(dto.spec);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.reportDefinition.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw reportNotFound();
      try {
        await tx.reportDefinition.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.spec ? { dataset: dto.spec.dataset, definition: dto.spec } : {}),
            updatedBy: userId,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw reportExists(dto.name ?? "");
        throw err;
      }
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "report.updated",
        entityType: "ReportDefinition",
        entityId: id,
        after: { name: dto.name, specChanged: dto.spec !== undefined },
      });
      return this.findReport(tx, id);
    });
  }

  async deleteReport(principal: AuthPrincipal, id: string) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.reportDefinition.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw reportNotFound();
      // Cascades to the report's schedules (FK onDelete: Cascade).
      await tx.reportDefinition.delete({ where: { id } });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "report.deleted",
        entityType: "ReportDefinition",
        entityId: id,
      });
      return { id };
    });
  }

  // ─────────────────────────── Schedules ───────────────────────────

  async createSchedule(principal: AuthPrincipal, reportId: string, dto: CreateScheduleDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const report = await tx.reportDefinition.findFirst({
        where: { id: reportId },
        select: { id: true },
      });
      if (!report) throw reportNotFound();

      const nextRunAt = computeNextRun(dto.cadence, dto.hourUtc, new Date());
      const schedule = await tx.reportSchedule.create({
        data: {
          tenantId,
          reportDefinitionId: reportId,
          cadence: dto.cadence,
          format: dto.format,
          hourUtc: dto.hourUtc,
          recipients: dto.recipients,
          nextRunAt,
          createdBy: userId,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "report_schedule.created",
        entityType: "ReportSchedule",
        entityId: schedule.id,
        after: { reportDefinitionId: reportId, cadence: dto.cadence, hourUtc: dto.hourUtc },
      });
      return schedule;
    });
  }

  async listSchedules(principal: AuthPrincipal, reportDefinitionId?: string) {
    const tenantId = this.requireTenant(principal);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.reportSchedule.findMany({
        where: reportDefinitionId ? { reportDefinitionId } : undefined,
        orderBy: { nextRunAt: "asc" },
      }),
    );
    return { data };
  }

  async updateSchedule(principal: AuthPrincipal, id: string, dto: UpdateScheduleDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.reportSchedule.findFirst({
        where: { id },
        select: { cadence: true, hourUtc: true },
      });
      if (!existing) throw scheduleNotFound();

      // Recompute the next run when the cadence or hour-of-day changes.
      const cadence = dto.cadence ?? existing.cadence;
      const hourUtc = dto.hourUtc ?? existing.hourUtc;
      const cadenceChanged = dto.cadence !== undefined || dto.hourUtc !== undefined;

      const schedule = await tx.reportSchedule.update({
        where: { id },
        data: {
          ...(dto.cadence !== undefined ? { cadence: dto.cadence } : {}),
          ...(dto.format !== undefined ? { format: dto.format } : {}),
          ...(dto.hourUtc !== undefined ? { hourUtc: dto.hourUtc } : {}),
          ...(dto.recipients !== undefined ? { recipients: dto.recipients } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(cadenceChanged ? { nextRunAt: computeNextRun(cadence, hourUtc, new Date()) } : {}),
          updatedBy: userId,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "report_schedule.updated",
        entityType: "ReportSchedule",
        entityId: id,
        after: { cadence, hourUtc, isActive: schedule.isActive },
      });
      return schedule;
    });
  }

  async deleteSchedule(principal: AuthPrincipal, id: string) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.reportSchedule.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw scheduleNotFound();
      await tx.reportSchedule.delete({ where: { id } });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "report_schedule.deleted",
        entityType: "ReportSchedule",
        entityId: id,
      });
      return { id };
    });
  }

  // ─────────────────────────── helpers ───────────────────────────

  /** Run a compiled plan and project DB rows into a typed ReportResult (no BigInt/Decimal leaks). */
  private async execute(tx: Prisma.TransactionClient, plan: QueryPlan): Promise<ReportResult> {
    const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(plan.sql, ...plan.params);
    return projectRows(plan.columns, rows);
  }

  /** Compile a spec, mapping catalog-validation failures to a 400 (not a 500). */
  private compile(spec: ReportSpec): QueryPlan {
    try {
      return compileReport(spec);
    } catch (err) {
      if (err instanceof ReportCompileError) {
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }

  private async loadSpec(tx: Prisma.TransactionClient, id: string): Promise<ReportSpec> {
    const def = await tx.reportDefinition.findFirst({
      where: { id },
      select: { definition: true },
    });
    if (!def) throw reportNotFound();
    return this.parseStored(def.definition);
  }

  /** Parse a stored `definition` defensively; a corrupt spec is an internal data fault, not a 400. */
  private parseStored(definition: unknown): ReportSpec {
    try {
      return parseReportSpec(definition);
    } catch {
      throw new UnprocessableEntityException({
        code: "REPORT_DEFINITION_INVALID",
        message: "Stored report definition is invalid",
      });
    }
  }

  private findReport(tx: Prisma.TransactionClient, id: string) {
    return tx.reportDefinition.findFirst({ where: { id } });
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

/** Map raw DB rows (keyed by SELECT alias) back to column keys, coercing DB types to JSON-safe cells. */
function projectRows(
  columns: CompiledColumn[],
  rows: Array<Record<string, unknown>>,
): ReportResult {
  const meta = columns.map(({ alias: _alias, ...rest }) => rest);
  const projected = rows.map((row) => {
    const out: Record<string, CellValue> = {};
    for (const col of columns) {
      out[col.key] = coerceCell(row[col.alias], col.kind);
    }
    return out;
  });
  return { columns: meta, rows: projected };
}

interface DecimalLike {
  toNumber: () => number;
}

function isDecimalLike(value: object): value is DecimalLike {
  return typeof (value as { toNumber?: unknown }).toNumber === "function";
}

/** Coerce a raw DB value to a ReportResult cell: bigint/Decimal → number, Date → ISO, null → 0/null. */
function coerceCell(raw: unknown, kind: "dimension" | "measure"): CellValue {
  if (raw === null || raw === undefined) return kind === "measure" ? 0 : null;
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "number") return raw;
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string") return kind === "measure" ? Number(raw) : raw;
  if (typeof raw === "object" && isDecimalLike(raw)) return raw.toNumber();
  return String(raw);
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug.length > 0 ? slug : "report";
}

function reportNotFound(): NotFoundException {
  return new NotFoundException({ code: "NOT_FOUND", message: "Report not found" });
}

function scheduleNotFound(): NotFoundException {
  return new NotFoundException({ code: "NOT_FOUND", message: "Schedule not found" });
}

function reportExists(name: string): ConflictException {
  return new ConflictException({
    code: "REPORT_EXISTS",
    message: `A report named ${name} already exists`,
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}
