-- Dev-only provisioning of the least-privilege application role.
-- Runs once on first container init (empty data dir). NOT used in cloud environments.
-- There the role + rotated password come from Terraform + AWS Secrets Manager.
-- The password here is a throwaway dev placeholder (same posture as POSTGRES_PASSWORD in compose).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payce_app') THEN
    CREATE ROLE payce_app LOGIN PASSWORD 'payce_app_dev_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB;
  END IF;
END $$;
