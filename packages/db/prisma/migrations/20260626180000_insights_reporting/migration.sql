-- Phase 5 (Insights): saved reports, recurring schedules, and dashboard layouts.
-- Tenant-scoped tables; Row-Level Security is added in the companion *_rls migration.

-- CreateEnum
CREATE TYPE "ReportCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('CSV', 'XLSX');

-- CreateTable
CREATE TABLE "report_definition" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataset" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "report_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedule" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "report_definition_id" TEXT NOT NULL,
    "cadence" "ReportCadence" NOT NULL,
    "format" "ReportFormat" NOT NULL DEFAULT 'XLSX',
    "hour_utc" INTEGER NOT NULL DEFAULT 6,
    "recipients" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "report_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_config" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "layout" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "dashboard_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_definition_tenant_id_idx" ON "report_definition"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_definition_tenant_id_name_key" ON "report_definition"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "report_schedule_tenant_id_idx" ON "report_schedule"("tenant_id");

-- CreateIndex
CREATE INDEX "report_schedule_tenant_id_report_definition_id_idx" ON "report_schedule"("tenant_id", "report_definition_id");

-- CreateIndex
CREATE INDEX "report_schedule_is_active_next_run_at_idx" ON "report_schedule"("is_active", "next_run_at");

-- CreateIndex
CREATE INDEX "dashboard_config_tenant_id_idx" ON "dashboard_config"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_config_tenant_id_name_key" ON "dashboard_config"("tenant_id", "name");

-- AddForeignKey
ALTER TABLE "report_definition" ADD CONSTRAINT "report_definition_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedule" ADD CONSTRAINT "report_schedule_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedule" ADD CONSTRAINT "report_schedule_report_definition_id_fkey" FOREIGN KEY ("report_definition_id") REFERENCES "report_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_config" ADD CONSTRAINT "dashboard_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
