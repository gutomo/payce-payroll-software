-- Phase 7 (SAML + SCIM): add a SAML provider kind, SCIM enablement + SAML metadata to identity_provider,
-- and a platform-plane scim_credential table holding the SHA-256 hash of each provider's SCIM bearer
-- token. scim_credential is INTENTIONALLY NOT RLS-protected: the SCIM auth guard resolves a bearer token
-- to its tenant before any tenant context exists (like login resolving a tenant by slug). Every SCIM
-- operation that follows is tenant-scoped via runInTenant.

-- AlterEnum
ALTER TYPE "IdentityProviderKind" ADD VALUE 'SAML';

-- AlterTable
ALTER TABLE "identity_provider"
    ADD COLUMN "saml_metadata_url" TEXT,
    ADD COLUMN "scim_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "scim_credential" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "scim_credential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scim_credential_provider_id_key" ON "scim_credential"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "scim_credential_token_hash_key" ON "scim_credential"("token_hash");

-- AddForeignKey
ALTER TABLE "scim_credential" ADD CONSTRAINT "scim_credential_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scim_credential" ADD CONSTRAINT "scim_credential_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "identity_provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
