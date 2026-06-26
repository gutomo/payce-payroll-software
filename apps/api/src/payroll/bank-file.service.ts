import { Injectable, NotFoundException } from "@nestjs/common";
import { runInTenant } from "@payce/db";
import { StorageService } from "../storage/storage.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Build a payment-instruction CSV for a published payroll run.
 *
 * Columns (all RFC 4180 quoted):
 *   reference        – unique per-employee payment reference for bank reconciliation
 *   pay_date         – from the pay period
 *   employee_number  – canonical identifier
 *   employee_name    – full name (first + last)
 *   currency_code    – ISO 4217
 *   net_pay_minor    – integer minor units (cents/pence/paise): for automated bank import
 *   net_pay_display  – decimal formatted string                : for human review
 *
 * Bank account numbers are not yet captured (Phase 4 bank-account slice); this file serves as a
 * treasury instruction that operators can enrich before submission to their bank's bulk-pay portal.
 */
function buildBankFileCsv(rows: BankRow[]): Buffer {
  const header =
    '"reference","pay_date","employee_number","employee_name","currency_code","net_pay_minor","net_pay_display"\n';
  const body = rows
    .map((r) => {
      const display = (Number(r.netPayMinor) / 100).toFixed(2);
      return [
        csvEscape(r.reference),
        csvEscape(r.payDate),
        csvEscape(r.employeeNumber),
        csvEscape(r.employeeName),
        csvEscape(r.currencyCode),
        r.netPayMinor.toString(),
        csvEscape(display),
      ].join(",");
    })
    .join("\n");
  return Buffer.from(header + body, "utf8");
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

interface BankRow {
  reference: string;
  payDate: string;
  employeeNumber: string;
  employeeName: string;
  currencyCode: string;
  netPayMinor: bigint;
}

@Injectable()
export class BankFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Generate the bank payment-instruction CSV for a published run, upload to S3, and persist a
   * BankFile record. Idempotent via upsert: safe to call on republish/retry.
   */
  async generate(tenantId: string, runId: string): Promise<void> {
    const runData = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.payrollRun.findFirst({
        where: { id: runId },
        select: {
          payPeriod: { select: { payDate: true, startDate: true } },
          lines: {
            select: {
              netMinor: true,
              currencyCode: true,
              employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
            },
            orderBy: { employee: { employeeNumber: "asc" } },
          },
        },
      }),
    );
    if (!runData) return;

    const payDate = runData.payPeriod.payDate.toISOString().slice(0, 10);
    // Reference is keyed off the pay-period month (the period the run belongs to), not the pay
    // date. A Jan period paid in early Feb still reconciles under Jan. Stable across pay-date shifts.
    const yyyyMm = runData.payPeriod.startDate.toISOString().slice(0, 7);

    const rows: BankRow[] = runData.lines.map((line) => ({
      reference: `PAYROLL/${yyyyMm}/${line.employee.employeeNumber}`,
      payDate,
      employeeNumber: line.employee.employeeNumber,
      employeeName: `${line.employee.firstName} ${line.employee.lastName}`,
      currencyCode: line.currencyCode,
      netPayMinor: line.netMinor,
    }));

    const csv = buildBankFileCsv(rows);
    const key = `bank-files/${tenantId}/${runId}/payment-instructions.csv`;

    await this.storage.putObject(key, csv, "text/csv");

    await runInTenant(this.prisma, tenantId, (tx) =>
      tx.bankFile.upsert({
        where: { payrollRunId: runId },
        create: { tenantId, payrollRunId: runId, s3Key: key, sizeBytes: csv.length, format: "CSV" },
        update: { s3Key: key, sizeBytes: csv.length },
      }),
    );
  }

  /** Return a short-lived presigned URL for the run's bank file. */
  async getSignedUrl(
    tenantId: string,
    runId: string,
  ): Promise<{ url: string; expiresAt: string; format: string }> {
    const record = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.bankFile.findUnique({
        where: { payrollRunId: runId },
        select: { s3Key: true, format: true },
      }),
    );
    if (!record) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Bank file not yet generated for this run",
      });
    }
    const expiresIn = 3600;
    const url = await this.storage.presignedUrl(record.s3Key, expiresIn);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return { url, expiresAt, format: record.format };
  }
}
