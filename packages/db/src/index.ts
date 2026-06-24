export * from "./client";
export { forTenant, runInTenant } from "./tenant";
export type { TenantPrismaClient } from "./tenant";

/**
 * Tenant-owned tables that carry RLS policies (keep in sync with the `*_rls` migration).
 * Exposed so the isolation test suite can assert coverage rather than hard-coding the list twice.
 */
export const RLS_TABLES = [
  "app_user",
  "credential",
  "role",
  "user_role",
  "refresh_token",
  "legal_entity",
  "department",
  "audit_event",
] as const;
