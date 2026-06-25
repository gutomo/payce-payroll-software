-- Grant the least-privilege application role (payce_app) DML access to the schema.
-- The role itself (LOGIN + password) is provisioned by infrastructure — the docker init script
-- locally, Terraform + Secrets Manager in the cloud — NOT by this migration, so no credential
-- lives in the repo. RLS is enforced for payce_app because it is neither the table owner nor a
-- superuser/BYPASSRLS role. This migration runs as the owner (via directUrl).

GRANT USAGE ON SCHEMA public TO payce_app;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO payce_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO payce_app;

-- Future tables/sequences created by the owner are granted automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO payce_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO payce_app;
