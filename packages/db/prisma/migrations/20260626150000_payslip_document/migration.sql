-- PayslipDocument: one PDF record per (run, employee). The s3_key is used to generate presigned
-- download URLs on demand. Created on publish; immutable thereafter.

CREATE TABLE "payslip_document" (
  "id"             TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      TEXT        NOT NULL,
  "payroll_run_id" TEXT        NOT NULL,
  "employee_id"    TEXT        NOT NULL,
  "s3_key"         TEXT        NOT NULL,
  "size_bytes"     INTEGER     NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payslip_document_pkey"                      PRIMARY KEY ("id"),
  CONSTRAINT "payslip_document_payroll_run_id_employee_id_key"
    UNIQUE ("payroll_run_id", "employee_id"),
  CONSTRAINT "payslip_document_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")      REFERENCES "tenant"("id")      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payslip_document_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payslip_document_employee_id_fkey"
    FOREIGN KEY ("employee_id")    REFERENCES "employee"("id")    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "payslip_document_tenant_id_payroll_run_id_idx"
  ON "payslip_document"("tenant_id", "payroll_run_id");
