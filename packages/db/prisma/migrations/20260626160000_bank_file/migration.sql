-- BankFile: one payment-instruction CSV per published payroll run. s3Key is used to generate
-- presigned download URLs on demand. Created on publish; immutable thereafter.

CREATE TABLE "bank_file" (
  "id"             TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      TEXT        NOT NULL,
  "payroll_run_id" TEXT        NOT NULL,
  "s3_key"         TEXT        NOT NULL,
  "size_bytes"     INTEGER     NOT NULL,
  "format"         TEXT        NOT NULL DEFAULT 'CSV',
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bank_file_pkey"            PRIMARY KEY ("id"),
  CONSTRAINT "bank_file_payroll_run_id_key" UNIQUE ("payroll_run_id"),
  CONSTRAINT "bank_file_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")      REFERENCES "tenant"("id")      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bank_file_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "bank_file_tenant_id_idx" ON "bank_file"("tenant_id");
