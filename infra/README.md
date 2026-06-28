# `infra/` — Terraform

Infrastructure as code for Payce. **All AWS changes go through Terraform + PR — no console/click-ops**
(golden rule 6), and **no secrets ever live here** (golden rule 3). See
[`docs/aws-architecture.md`](../docs/aws-architecture.md) §12 for the full design and
[ADR-0007](../docs/adr/0007-infra-sso-waf-dr.md) for the Phase 7 security/DR slice.

> **Status: skeleton, not applied.** The modules and the `staging` env validate offline only
> (`fmt`/`validate`/`tfsec`). No remote state, CI OIDC apply role, or live account is wired yet, so there
> is no `terraform apply` in this slice. Real backend config and account-specific inputs are injected in
> CI when those resources land.

## Layout

```
infra/
  modules/            # reusable, env-agnostic building blocks
    waf/              # WAFv2 web ACL (CLOUDFRONT or REGIONAL): managed rules + per-IP rate limit + logging
    sso/              # Cognito user pool as the SAML/OIDC SSO + SCIM broker
    dr/               # AWS Backup plan with cross-region copy (needs an aws.dr provider alias)
  envs/
    staging/          # reference composition wiring the modules; dev & prod mirror it with other tfvars
```

Each module is self-contained: `versions.tf`, `variables.tf`, `main.tf`, `outputs.tf`. Envs add
`providers.tf` (primary + `aws.dr` + `aws.us_east_1` aliases, with `default_tags`) and `backend.tf`.

## Conventions (architecture doc §12.2)

- **Remote state** in S3 + DynamoDB lock, created once by a global bootstrap (not by an env). Per-env state
  key. Backend bucket/region/table are passed via `terraform init -backend-config` in CI — **not** committed
  here (see [`envs/staging/backend.tf`](envs/staging/backend.tf)).
- **Auth** is CI **OIDC role assumption** at apply time. No static keys, ever.
- **Tagging:** `default_tags` stamp `Project`/`Environment`/`ManagedBy`/`Component` on every resource.
- **Secrets:** referenced by Secrets Manager id/ARN and read at plan time (e.g. SSO OIDC client secrets);
  never written into `*.tf`, `*.tfvars`, or variable defaults.
- **Pipeline order:** `terraform fmt -recursive` → `validate` → `tfsec` → `plan` (reviewed) → `apply`
  (staging/prod only via CI with approval).

## Working locally (offline, no apply)

```bash
cd infra/envs/staging
terraform fmt -recursive ..       # format the whole tree
terraform init -backend=false     # no remote state needed to validate
terraform validate
```

`init -backend=false` still downloads providers (needs network). If offline, `terraform fmt` is the only
gate that runs without provider download.

## Adding an environment

Copy `envs/staging`, change `terraform.tfvars` (region, domain prefix, callback URLs, providers,
protected ARNs) and the backend state `key`. Keep module versions and structure identical so envs stay
diff-comparable.
