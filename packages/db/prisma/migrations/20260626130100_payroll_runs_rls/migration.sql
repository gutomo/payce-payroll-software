-- Extend tenant isolation (Row-Level Security) to the Phase 3 payroll run tables.
-- Same posture as the earlier *_rls migrations: ENABLE + FORCE RLS so even the table owner is
-- subject to the policy, and a tenant_isolation policy keyed on the `app.current_tenant_id` GUC.
-- An un-scoped query (no GUC set) sees zero rows — fail closed. DML grants to payce_app come from
-- the ALTER DEFAULT PRIVILEGES set in the *_app_role migration (these tables are owner-created).

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'payroll_run', 'payroll_run_line', 'approval'
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
