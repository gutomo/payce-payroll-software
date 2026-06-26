import { Injectable, NotFoundException } from "@nestjs/common";
import { runInTenant } from "@payce/db";
import PDFDocument from "pdfkit";
import { StorageService } from "../storage/storage.service";
import { PrismaService } from "../prisma/prisma.service";

interface LineData {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  currencyCode: string;
  grossMinor: bigint;
  deductionsMinor: bigint;
  netMinor: bigint;
  lines: unknown;
  payPeriod: { startDate: Date; endDate: Date; payDate: Date };
}

/**
 * Builds a minimal but complete PDF payslip for one employee line.
 * Pure function, no I/O. Returns a Buffer containing the PDF bytes.
 */
function buildPayslipPdf(data: LineData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, compress: false });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fmt = (minor: bigint) => (Number(minor) / 100).toFixed(2) + " " + data.currencyCode;
    const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

    doc.font("Helvetica-Bold").fontSize(20).text("PAYSLIP", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(11).text("Employee");
    doc.font("Helvetica").text(`${data.firstName} ${data.lastName}  (${data.employeeNumber})`);
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").text("Pay Period");
    doc
      .font("Helvetica")
      .text(`${fmtDate(data.payPeriod.startDate)} – ${fmtDate(data.payPeriod.endDate)}`);
    doc.text(`Pay Date: ${fmtDate(data.payPeriod.payDate)}`);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text("Earnings", { underline: true });
    doc
      .font("Helvetica")
      .fontSize(11)
      .text(`Gross Pay:            ${fmt(data.grossMinor)}`);
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(12).text("Deductions", { underline: true });
    doc
      .font("Helvetica")
      .fontSize(11)
      .text(`Total Deductions:     ${fmt(data.deductionsMinor)}`);
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(`Net Pay:  ${fmt(data.netMinor)}`, { align: "right" });

    doc.end();
  });
}

@Injectable()
export class PayslipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Generate one PDF per run line, upload to S3, and persist a PayslipDocument record.
   * Called synchronously after publish commits. Individual employee failures are isolated;
   * one bad PDF does not abort the others. In a future slice this becomes an SQS worker.
   */
  async generateAll(tenantId: string, runId: string): Promise<void> {
    const lines = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.payrollRunLine.findMany({
        where: { payrollRunId: runId },
        select: {
          employeeId: true,
          currencyCode: true,
          grossMinor: true,
          deductionsMinor: true,
          netMinor: true,
          lines: true,
          employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
          payrollRun: {
            select: {
              payPeriod: { select: { startDate: true, endDate: true, payDate: true } },
            },
          },
        },
      }),
    );

    await Promise.all(
      lines.map(async (line) => {
        const data: LineData = {
          employeeId: line.employeeId,
          employeeNumber: line.employee.employeeNumber,
          firstName: line.employee.firstName,
          lastName: line.employee.lastName,
          currencyCode: line.currencyCode,
          grossMinor: line.grossMinor,
          deductionsMinor: line.deductionsMinor,
          netMinor: line.netMinor,
          lines: line.lines,
          payPeriod: line.payrollRun.payPeriod,
        };

        const pdfBytes = await buildPayslipPdf(data);
        const key = `payslips/${tenantId}/${runId}/${line.employeeId}.pdf`;

        await this.storage.putObject(key, pdfBytes, "application/pdf");

        await runInTenant(this.prisma, tenantId, (tx) =>
          tx.payslipDocument.upsert({
            where: {
              payrollRunId_employeeId: { payrollRunId: runId, employeeId: line.employeeId },
            },
            create: {
              tenantId,
              payrollRunId: runId,
              employeeId: line.employeeId,
              s3Key: key,
              sizeBytes: pdfBytes.length,
            },
            update: { s3Key: key, sizeBytes: pdfBytes.length },
          }),
        );
      }),
    );
  }

  /** Retrieve a short-lived presigned URL for an employee's payslip. */
  async getSignedUrl(
    tenantId: string,
    runId: string,
    employeeId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const doc = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.payslipDocument.findUnique({
        where: { payrollRunId_employeeId: { payrollRunId: runId, employeeId } },
        select: { s3Key: true },
      }),
    );
    if (!doc) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Payslip not yet generated for this employee and run",
      });
    }
    const expiresIn = 3600;
    const url = await this.storage.presignedUrl(doc.s3Key, expiresIn);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return { url, expiresAt };
  }
}
