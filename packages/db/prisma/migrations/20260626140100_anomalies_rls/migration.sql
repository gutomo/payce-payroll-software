-- Extend tenant isolation (Row-Level Security) to the anomaly table.
-- Same posture as prior *_rls migrations: ENABLE + FORCE so even the table owner is subject to the
-- policy. An un-scoped query (no GUC set) sees zero rows — fail closed.

ALTER TABLE "anomaly" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "anomaly" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "anomaly"
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
