-- Phase 7 (Integrations framework): configured connector instances, idempotent runs, and outbound
-- webhooks with per-delivery records. Tenant-scoped tables; Row-Level Security is added in the
-- companion *_rls migration.

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "IntegrationRunDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "IntegrationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "integration" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "connector_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_run" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "direction" "IntegrationRunDirection" NOT NULL,
    "status" "IntegrationRunStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "stats" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "integration_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "status" "WebhookStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "status_code" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_tenant_id_idx" ON "integration"("tenant_id");

-- CreateIndex
CREATE INDEX "integration_run_tenant_id_integration_id_idx" ON "integration_run"("tenant_id", "integration_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_run_tenant_id_integration_id_idempotency_key_key" ON "integration_run"("tenant_id", "integration_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "webhook_tenant_id_idx" ON "webhook"("tenant_id");

-- CreateIndex
CREATE INDEX "webhook_delivery_tenant_id_webhook_id_idx" ON "webhook_delivery"("tenant_id", "webhook_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_webhook_id_event_id_key" ON "webhook_delivery"("webhook_id", "event_id");

-- AddForeignKey
ALTER TABLE "integration" ADD CONSTRAINT "integration_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_run" ADD CONSTRAINT "integration_run_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_run" ADD CONSTRAINT "integration_run_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
