-- CreateEnum
CREATE TYPE "PayPeriodStatus" AS ENUM ('OPEN', 'LOCKED', 'PAID');

-- CreateTable
CREATE TABLE "pay_group" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "legal_entity_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "frequency" "PayFrequency" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "pay_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_calendar" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "pay_group_id" TEXT NOT NULL,
    "anchor_date" DATE NOT NULL,
    "pay_date_offset_days" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "pay_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_period" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "pay_group_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "pay_date" DATE NOT NULL,
    "status" "PayPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "pay_period_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "employee" ADD COLUMN "pay_group_id" TEXT;

-- CreateIndex
CREATE INDEX "pay_group_tenant_id_idx" ON "pay_group"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pay_group_tenant_id_code_key" ON "pay_group"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "pay_calendar_pay_group_id_key" ON "pay_calendar"("pay_group_id");

-- CreateIndex
CREATE INDEX "pay_calendar_tenant_id_idx" ON "pay_calendar"("tenant_id");

-- CreateIndex
CREATE INDEX "pay_period_tenant_id_pay_group_id_idx" ON "pay_period"("tenant_id", "pay_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "pay_period_tenant_id_pay_group_id_sequence_key" ON "pay_period"("tenant_id", "pay_group_id", "sequence");

-- CreateIndex
CREATE INDEX "employee_tenant_id_pay_group_id_idx" ON "employee"("tenant_id", "pay_group_id");

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_pay_group_id_fkey" FOREIGN KEY ("pay_group_id") REFERENCES "pay_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_group" ADD CONSTRAINT "pay_group_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_group" ADD CONSTRAINT "pay_group_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_calendar" ADD CONSTRAINT "pay_calendar_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_calendar" ADD CONSTRAINT "pay_calendar_pay_group_id_fkey" FOREIGN KEY ("pay_group_id") REFERENCES "pay_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_period" ADD CONSTRAINT "pay_period_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_period" ADD CONSTRAINT "pay_period_pay_group_id_fkey" FOREIGN KEY ("pay_group_id") REFERENCES "pay_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
