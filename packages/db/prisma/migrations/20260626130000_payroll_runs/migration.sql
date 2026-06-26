-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "payroll_run" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "pay_group_id" TEXT NOT NULL,
    "pay_period_id" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "country_code" TEXT,
    "rule_pack_version" TEXT,
    "currency_code" TEXT,
    "frequency" "PayFrequency",
    "gross_minor" BIGINT,
    "deductions_minor" BIGINT,
    "net_minor" BIGINT,
    "employee_count" INTEGER NOT NULL DEFAULT 0,
    "submitted_by" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "published_by" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "payroll_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_run_line" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "gross_minor" BIGINT NOT NULL,
    "deductions_minor" BIGINT NOT NULL,
    "net_minor" BIGINT NOT NULL,
    "lines" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_run_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_pay_period_id_key" ON "payroll_run"("pay_period_id");

-- CreateIndex
CREATE INDEX "payroll_run_tenant_id_pay_group_id_idx" ON "payroll_run"("tenant_id", "pay_group_id");

-- CreateIndex
CREATE INDEX "payroll_run_line_tenant_id_payroll_run_id_idx" ON "payroll_run_line"("tenant_id", "payroll_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_line_tenant_id_payroll_run_id_employee_id_key" ON "payroll_run_line"("tenant_id", "payroll_run_id", "employee_id");

-- CreateIndex
CREATE INDEX "approval_tenant_id_payroll_run_id_idx" ON "approval"("tenant_id", "payroll_run_id");

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_pay_group_id_fkey" FOREIGN KEY ("pay_group_id") REFERENCES "pay_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "pay_period"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run_line" ADD CONSTRAINT "payroll_run_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run_line" ADD CONSTRAINT "payroll_run_line_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run_line" ADD CONSTRAINT "payroll_run_line_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval" ADD CONSTRAINT "approval_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval" ADD CONSTRAINT "approval_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
