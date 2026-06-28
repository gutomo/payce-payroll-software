# `infra/` — Terraform

Infrastructure as code for Payce. **All AWS changes go through Terraform + PR — no console/click-ops**
(golden rule 6), and **no secrets ever live here** (golden rule 3). See
[`docs/aws-architecture.md`](../docs/aws-architecture.md) §12 for the full design,
[ADR-0007](../docs/adr/0007-infra-sso-waf-dr.md) for the Phase 7 security/DR slice, and
[ADR-0008](../docs/adr/0008-tf-state-and-ci-oidc.md) for the remote-state backend & CI OIDC roles.

> **Status: skeleton, not applied.** The modules, the `global` bootstrap, and the `staging` env validate
> offline only (`fmt`/`validate`/`tfsec`). No live account is wired yet, so there is no `terraform apply`
> in this slice. The `Terraform` CI workflow gates every `infra/**` change with fmt + validate + tfsec; a
> real `plan` job is present but **dormant** until an account is wired (see below).

## Layout

```
infra/
  modules/            # reusable, env-agnostic building blocks
    waf/              # WAFv2 web ACL (CLOUDFRONT or REGIONAL): managed rules + per-IP rate limit + logging
    sso/              # Cognito user pool as the SAML/OIDC SSO + SCIM broker
    dr/               # AWS Backup plan with cross-region copy (needs an aws.dr provider alias)
    tf-state-backend/ # S3 (versioned, KMS) + DynamoDB lock table for remote state
    github-oidc/      # IAM role assumable by GitHub Actions via OIDC (no static keys)
  global/             # account-wide bootstrap: state backend + OIDC provider + CI plan/apply roles
  envs/
    staging/          # reference composition wiring the modules; dev & prod mirror it with other tfvars
```

Each module is self-contained: `versions.tf`, `variables.tf`, `main.tf`, `outputs.tf`. Envs add
`providers.tf` (primary + `aws.dr` + `aws.us_east_1` aliases, with `default_tags`) and `backend.tf`.

## Bootstrap (run once per account)

The `global` stack creates the resources everything else depends on: the remote-state S3 bucket + KMS key
+ DynamoDB lock table, the **GitHub Actions OIDC provider**, and two CI roles — **`payce-ci-plan`**
(read-only, assumable from PRs/main) and **`payce-ci-apply`** (write, assumable only from gated GitHub
deployment environments → maker-checker). It starts with **local state** (it can't store its own creation
in the bucket it's creating), then migrates into that bucket:

```bash
cd infra/global
cp terraform.tfvars.example terraform.tfvars   # set a globally-unique state_bucket_name (gitignored)
terraform init
terraform apply                                 # creates bucket, lock table, OIDC provider, CI roles
# then uncomment the S3 backend in backend.tf and:
terraform init -migrate-state
```

After bootstrap, set the repo variables the CI `plan` job needs: `TF_PLAN_ENABLED=true`,
`TF_PLAN_ROLE_ARN` (the `ci_plan_role_arn` output), `AWS_REGION`, `TF_STATE_BUCKET`, `TF_LOCK_TABLE`.

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
