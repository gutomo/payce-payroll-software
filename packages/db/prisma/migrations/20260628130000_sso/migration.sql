-- Phase 7 (Enterprise SSO): per-tenant identity-provider connections (OIDC, or an OFFLINE test IdP)
-- and the links from tenant users to their external IdP subjects. Tenant-scoped tables; Row-Level
-- Security is added in the companion *_rls migration. No client secrets are stored here (golden rule
-- 3): client_secret_ref names a Secrets Manager secret resolved at exchange time.

-- CreateEnum
CREATE TYPE "IdentityProviderKind" AS ENUM ('OIDC', 'OFFLINE');

-- CreateTable
CREATE TABLE "identity_provider" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "IdentityProviderKind" NOT NULL DEFAULT 'OIDC',
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "issuer" TEXT,
    "client_id" TEXT,
    "client_secret_ref" TEXT,
    "authorization_endpoint" TEXT,
    "token_endpoint" TEXT,
    "jwks_uri" TEXT,
    "allow_jit_provisioning" BOOLEAN NOT NULL DEFAULT false,
    "default_role_key" TEXT,
    "email_domain" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "identity_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identity" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identity_provider_tenant_id_idx" ON "identity_provider"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_provider_tenant_id_name_key" ON "identity_provider"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "user_identity_tenant_id_idx" ON "user_identity"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identity_tenant_id_provider_id_subject_key" ON "user_identity"("tenant_id", "provider_id", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "user_identity_tenant_id_provider_id_user_id_key" ON "user_identity"("tenant_id", "provider_id", "user_id");

-- AddForeignKey
ALTER TABLE "identity_provider" ADD CONSTRAINT "identity_provider_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identity" ADD CONSTRAINT "user_identity_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identity" ADD CONSTRAINT "user_identity_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "identity_provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identity" ADD CONSTRAINT "user_identity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
