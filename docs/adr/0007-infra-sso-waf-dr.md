# ADR-0007: Phase 7 infra skeleton — enterprise SSO, WAF & cross-region DR

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §11 (Phase 7) · [`docs/aws-architecture.md`](../aws-architecture.md) §6, §7, §10, §12 · [`CLAUDE.md`](../../CLAUDE.md) · [ADR-0001](0001-stack.md)

## Context

Phase 7 hardens the platform: enterprise **SSO/SCIM**, an edge/regional **WAF**, and **disaster
recovery** with cross-region durability. The architecture doc already prescribes the shapes (§6 WAF on
CloudFront + ALB with AWS Managed Rules and rate limiting; §7 Cognito SSO over SAML/OIDC, secrets in
Secrets Manager, OIDC auth for CI; §10 Aurora PITR with RPO ≤ 5 min / RTO ≤ 1 hr and cross-region
copies; §12 the Terraform layout and remote-state/tagging conventions). This ADR records the **first
infra slice**: reusable Terraform modules plus a staging composition. It is a **skeleton — not
applied.** Golden rule 6 (no console/click-ops; all infra via Terraform + PR) and rule 3 (no secrets in
the repo) bound every choice here.

## Decision

**Three reusable modules under `infra/modules/`, wired by a per-env composition under
`infra/envs/staging/`.** Dev and prod will mirror staging with different tfvars; staging is the
reference. CI gates the HCL with `fmt` → `validate` (init `-backend=false`) → `tfsec`; **no apply runs
in this slice** (there is no live AWS account wired yet).

**WAF (`modules/waf`).** One module, parameterised by `scope`, instantiated twice in staging: a
`CLOUDFRONT` ACL (created via a us-east-1 provider alias, as required) and a `REGIONAL` ACL for the ALB.
Default action is **allow** with explicit block rules: a per-IP **rate-based rule** (default 2000/5 min)
plus the AWS **Managed Rule Groups** (common/OWASP, known-bad-inputs, SQLi, IP-reputation, anonymous-IP).
Each managed group supports a `count_only` flag so a new rule set can be observed before it blocks real
traffic, and per-rule `excluded_rules` overrides to COUNT. Logs go to a CloudWatch group whose name is
forced to the required `aws-waf-logs-` prefix, with **Authorization and Cookie headers redacted** (no
secrets/PII in telemetry).

**SSO (`modules/sso`).** A **Cognito user pool** is the single SSO/SCIM broker: the web app speaks OIDC
to Cognito, and Cognito federates each tenant via **SAML or OIDC**. MFA is **ON** (TOTP; SMS deliberately
off), advanced security is **ENFORCED**, and the web app client is a **public PKCE client** (no client
secret to leak). SAML providers carry only a metadata URL (safe in tfvars). **OIDC client secrets are
never in HCL/tfvars/state inputs** — the module takes a Secrets Manager secret *id* and reads the value
at plan/apply time via a `data` source (golden rule 3). A SCIM bearer-token secret *container* is created
here; its value is set out-of-band.

**DR (`modules/dr`).** **AWS Backup** with a primary-region vault, an hourly plan, and a **`copy_action`
to a vault in a second region** (a `configuration_aliases = [aws, aws.dr]` provider pair). Aurora's
continuous **PITR** remains the fine-grained RPO mechanism (≤ 5 min); this plan adds scheduled recovery
points and, crucially, the **cross-region copy** so a full-region loss is survivable within the RTO ≤ 1 hr
target. Resources are selected by explicit ARN list **and** by a `backup=true` tag. A companion runbook
([`docs/runbooks/dr-restore.md`](../runbooks/dr-restore.md)) documents the restore drill.

## Alternatives considered

- **Per-tenant IdP wiring in the app instead of a Cognito broker.** Rejected: it would scatter SAML/OIDC
  and SCIM handling across the app and re-implement token validation. Cognito centralises federation and
  gives hosted-UI + advanced security for free.
- **Cognito app client *with* a generated secret.** Rejected: the Next.js app is a browser/public client;
  PKCE avoids holding a secret that could leak. A confidential client buys nothing here.
- **OIDC secrets in tfvars / SSM plaintext.** Rejected outright (rule 3) — read from Secrets Manager.
- **DR via manual cross-region snapshot copies.** Rejected: AWS Backup gives a policy-driven plan, copy,
  lifecycle, and audit in one place; hand-rolled snapshot copying is click-ops-adjacent and easy to drift.
- **A live `terraform apply` in this slice.** Out of scope: no account/remote-state is wired and apply
  needs CI OIDC + reviewed plan. The skeleton is validated offline only.

## Consequences

- Reusable, `fmt`/`validate`/`tfsec`-clean modules exist for WAF, SSO, and DR; staging composes them and
  dev/prod can mirror it via tfvars.
- No secrets enter the repo or state inputs; OIDC secrets resolve from Secrets Manager at plan time.
- **Nothing is provisioned yet.** Real backend/remote-state config, the CI OIDC apply role, the ALB ARN,
  the Aurora ARN, and real tenant providers are filled in when those resources land in later Phase 7 work.
- The DR copy doubles storage cost for protected resources; retention is tunable per env (default 35 days).
