import { BadRequestException, Injectable } from "@nestjs/common";
import { runInTenant } from "@payce/db";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

const RowSchema = z.object({
  employeeNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]),
  jobTitle: z.string().min(1),
  workEmail: z.string().email().optional(),
  departmentName: z.string().min(1).optional(),
  locationName: z.string().min(1).optional(),
  managerEmployeeNumber: z.string().min(1).optional(),
});
type ImportRow = z.infer<typeof RowSchema>;

export interface ImportError {
  row: number;
  column?: string;
  message: string;
}
export interface ImportResult {
  total: number;
  valid: number;
  imported: number;
  errors: ImportError[];
}

interface Candidate extends ImportRow {
  rowNum: number;
  departmentId?: string;
  locationId?: string;
}

/** Bulk employee import from CSV with per-row validation. dryRun (default) only reports; commit
 *  inserts the valid rows atomically. Invalid rows are always reported and skipped. */
@Injectable()
export class EmployeesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async importCsv(
    principal: AuthPrincipal,
    buffer: Buffer,
    commit: boolean,
  ): Promise<ImportResult> {
    const tenantId = principal.tenantId;
    if (!tenantId) {
      throw new BadRequestException({ code: "BAD_REQUEST", message: "Tenant context required" });
    }

    const rows = this.parseCsv(buffer);
    const errors: ImportError[] = [];

    // 1) Structural validation + in-file duplicate detection.
    const candidates: Candidate[] = [];
    const seen = new Set<string>();
    rows.forEach((raw, i) => {
      const rowNum = i + 1;
      const parsed = RowSchema.safeParse(cleanRow(raw));
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push({ row: rowNum, column: String(issue.path[0] ?? ""), message: issue.message });
        }
        return;
      }
      if (seen.has(parsed.data.employeeNumber)) {
        errors.push({
          row: rowNum,
          column: "employeeNumber",
          message: "duplicate employeeNumber within file",
        });
        return;
      }
      seen.add(parsed.data.employeeNumber);
      candidates.push({ ...parsed.data, rowNum });
    });

    // 2) Reference resolution (and optional write) in one tenant-scoped transaction.
    const { valid, imported } = await runInTenant(this.prisma, tenantId, async (tx) => {
      const [departments, locations, existing] = await Promise.all([
        tx.department.findMany({ select: { id: true, name: true } }),
        tx.location.findMany({ select: { id: true, name: true } }),
        tx.employee.findMany({ select: { id: true, employeeNumber: true } }),
      ]);
      const deptByName = new Map(departments.map((d) => [d.name, d.id]));
      const locByName = new Map(locations.map((l) => [l.name, l.id]));
      const existingIdByNum = new Map(existing.map((e) => [e.employeeNumber, e.id]));
      const candidateNumbers = new Set(candidates.map((c) => c.employeeNumber));

      const validRows: Candidate[] = [];
      for (const c of candidates) {
        let ok = true;
        if (existingIdByNum.has(c.employeeNumber)) {
          errors.push({
            row: c.rowNum,
            column: "employeeNumber",
            message: "employeeNumber already exists",
          });
          ok = false;
        }
        if (c.departmentName) {
          const id = deptByName.get(c.departmentName);
          if (!id) {
            errors.push({
              row: c.rowNum,
              column: "departmentName",
              message: `unknown department: ${c.departmentName}`,
            });
            ok = false;
          } else {
            c.departmentId = id;
          }
        }
        if (c.locationName) {
          const id = locByName.get(c.locationName);
          if (!id) {
            errors.push({
              row: c.rowNum,
              column: "locationName",
              message: `unknown location: ${c.locationName}`,
            });
            ok = false;
          } else {
            c.locationId = id;
          }
        }
        if (
          c.managerEmployeeNumber &&
          !existingIdByNum.has(c.managerEmployeeNumber) &&
          !candidateNumbers.has(c.managerEmployeeNumber)
        ) {
          errors.push({
            row: c.rowNum,
            column: "managerEmployeeNumber",
            message: `unknown manager: ${c.managerEmployeeNumber}`,
          });
          ok = false;
        }
        if (ok) validRows.push(c);
      }

      if (!commit || validRows.length === 0) {
        return { valid: validRows.length, imported: 0 };
      }

      // Bulk insert, then resolve ids for employment records and manager linkage.
      await tx.employee.createMany({
        data: validRows.map((v) => ({
          tenantId,
          employeeNumber: v.employeeNumber,
          firstName: v.firstName,
          lastName: v.lastName,
          workEmail: v.workEmail,
          status: "ACTIVE" as const,
          hireDate: new Date(v.hireDate),
          departmentId: v.departmentId,
          locationId: v.locationId,
          createdBy: principal.userId,
        })),
      });
      const created = await tx.employee.findMany({
        where: { employeeNumber: { in: validRows.map((v) => v.employeeNumber) } },
        select: { id: true, employeeNumber: true },
      });
      const idByNum = new Map(created.map((e) => [e.employeeNumber, e.id]));

      const employmentData = [];
      for (const v of validRows) {
        const employeeId = idByNum.get(v.employeeNumber);
        if (!employeeId) continue;
        employmentData.push({
          tenantId,
          employeeId,
          employmentType: v.employmentType,
          jobTitle: v.jobTitle,
          effectiveFrom: new Date(v.hireDate),
          createdBy: principal.userId,
        });
      }
      await tx.employmentRecord.createMany({ data: employmentData });

      // Link managers, grouped per manager so it's a handful of updateMany calls, not one-per-row.
      const reportsByManager = new Map<string, string[]>();
      for (const v of validRows) {
        if (!v.managerEmployeeNumber) continue;
        const list = reportsByManager.get(v.managerEmployeeNumber) ?? [];
        list.push(v.employeeNumber);
        reportsByManager.set(v.managerEmployeeNumber, list);
      }
      for (const [managerNumber, reportNumbers] of reportsByManager) {
        const managerId = idByNum.get(managerNumber) ?? existingIdByNum.get(managerNumber);
        if (managerId) {
          await tx.employee.updateMany({
            where: { employeeNumber: { in: reportNumbers } },
            data: { managerId },
          });
        }
      }

      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: principal.userId,
        action: "employee.imported",
        entityType: "EmployeeImport",
        after: { imported: validRows.length },
      });
      return { valid: validRows.length, imported: validRows.length };
    });

    errors.sort((a, b) => a.row - b.row);
    return { total: rows.length, valid, imported, errors };
  }

  private parseCsv(buffer: Buffer): Record<string, string>[] {
    try {
      return parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }) as Record<string, string>[];
    } catch (error) {
      throw new BadRequestException({
        code: "INVALID_CSV",
        message: "Could not parse CSV",
        details: error instanceof Error ? error.message : "parse error",
      });
    }
  }
}

/** Trim cells and treat empty strings as absent, so optional columns validate as undefined. */
function cleanRow(raw: Record<string, string>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    const trimmed = typeof value === "string" ? value.trim() : value;
    out[key] = trimmed === "" ? undefined : trimmed;
  }
  return out;
}
