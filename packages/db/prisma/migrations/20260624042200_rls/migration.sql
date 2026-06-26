-- Tenant isolation via PostgreSQL Row-Level Security (defense-in-depth alongside the tenant_id columns).
-- Every tenant-owned table is constrained to rows whose tenant_id equals the `app.current_tenant_id`
-- GUC, which the tenant-scoped Prisma client (forTenant / runInTenant) sets per transaction.
-- FORCE ROW LEVEL SECURITY ensures even the table owner (the app's DB role) is subject to the policy,
-- so an un-scoped query (no GUC set) sees zero rows, fail closed.

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'app_user', 'credential', 'role', 'user_role',
    'refresh_token', 'legal_entity', 'department', 'audit_event'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (tenant_id = current_setting(''app.current_tenant_id'', true)) '
      || 'WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true));',
      t
    );
  END LOOP;
END $$;
