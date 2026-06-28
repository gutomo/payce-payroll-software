-- Phase 6 (Assist): tenant knowledge base (RAG source) + per-user assistant conversations,
-- messages, and human-escalation tickets. Tenant-scoped tables; Row-Level Security is added in the
-- companion *_rls migration.

-- CreateEnum
CREATE TYPE "AssistMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AssistEscalationReason" AS ENUM ('LOW_CONFIDENCE', 'SENSITIVE_TOPIC');

-- CreateEnum
CREATE TYPE "AssistEscalationStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "knowledge_article" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "knowledge_article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_conversation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assist_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_message" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "AssistMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "used_tools" TEXT[],
    "citations" JSONB,
    "confidence" DOUBLE PRECISION,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "escalation_reason" "AssistEscalationReason",
    "provider" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assist_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_escalation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" "AssistEscalationReason" NOT NULL,
    "status" "AssistEscalationStatus" NOT NULL DEFAULT 'OPEN',
    "question" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assist_escalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_article_tenant_id_idx" ON "knowledge_article"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_article_tenant_id_slug_key" ON "knowledge_article"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "assist_conversation_tenant_id_user_id_idx" ON "assist_conversation"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "assist_message_tenant_id_conversation_id_idx" ON "assist_message"("tenant_id", "conversation_id");

-- CreateIndex
CREATE INDEX "assist_escalation_tenant_id_status_idx" ON "assist_escalation"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "knowledge_article" ADD CONSTRAINT "knowledge_article_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assist_conversation" ADD CONSTRAINT "assist_conversation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assist_conversation" ADD CONSTRAINT "assist_conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assist_message" ADD CONSTRAINT "assist_message_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assist_message" ADD CONSTRAINT "assist_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assist_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assist_escalation" ADD CONSTRAINT "assist_escalation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assist_escalation" ADD CONSTRAINT "assist_escalation_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assist_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
