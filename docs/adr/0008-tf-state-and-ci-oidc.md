# ADR-0008: Terraform remote-state backend & GitHub Actions OIDC CI roles

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §11 (Phase 7) · [`docs/aws-architecture.md`](../aws-architecture.md) §7, §12 · [`CLAUDE.md`](../../CLAUDE.md) · [ADR-0007](0007-infra-sso-waf-dr.md)

## Context

ADR-0007 added the first Terraform modules but deferred two things it depends on: **where state lives**
and **how CI authenticates to AWS**. Without them there is no safe shared state and no way to run a real
`terraform plan`/`apply` from CI. The architecture doc (§12.2) prescribes S3 + DynamoDB remote state and
**OIDC** auth for CI (no static keys); golden rules 3 (no secrets) and 6 (no click-ops) bound the design.
This ADR records the **bootstrap** that provisions both, plus the CI workflow that uses them. It remains a
**skeleton — validated offline, not applied.**

## Decision

**A `global` bootstrap stack** (`infra/global`) creates the account-wide prerequisites via two new
reusable modules:

- **`modules/tf-state-backend`** — a **versioned, KMS-encrypted** S3 bucket (public access fully blocked,
  a bucket policy denying non-TLS access, lifecycle expiry of noncurrent versions) and a **DynamoDB lock
  table** (encrypted, PITR on). This is the backend the per-env `backend "s3"` blocks point at.
- **`modules/github-oidc`** — an IAM role whose trust policy federates **GitHub Actions via OIDC**,
  pinning both the `aud` claim and the `sub` claim to specific repo refs/environments. No long-lived AWS
  keys exist in the repo or in GitHub secrets.

The bootstrap wires these into **one OIDC provider** and **two CI roles**:

- **`payce-ci-plan`** — `ReadOnlyAccess` + state read/lock/decrypt. Assumable from **pull requests and
  `main`** so PRs get a real plan.
- **`payce-ci-apply`** — `ReadOnlyAccess` + state read/write + a scoped write policy for the resources the
  envs manage (WAF, Cognito, AWS Backup, the `payce-*` service roles, the `payce-*` SSO secrets, the
  `aws-waf-logs-*` log groups, and the state KMS key). Assumable **only from gated GitHub deployment
  environments** (`staging`, `production`) — adding required reviewers there preserves **maker-checker**.

**Chicken-and-egg:** the bootstrap can't store its own creation in the bucket it's creating, so it starts
with **local state** and migrates into the bucket afterward (`init -migrate-state`), documented in
[`infra/README.md`](../../infra/README.md).

**A `Terraform` CI workflow** gates every `infra/**` change with `fmt -check` → `validate`
(`init -backend=false`) → **tfsec**. A `plan` job (OIDC, no keys) is included but **dormant** until repo
variables (`TF_PLAN_ENABLED`, `TF_PLAN_ROLE_ARN`, region, bucket, table) are set — so it activates the
moment an account is wired, with no code change.

## Alternatives considered

- **Static IAM access keys in GitHub secrets.** Rejected (rule 3 + §12.2): long-lived keys leak and rotate
  poorly. OIDC issues short-lived, claim-scoped credentials per run.
- **One CI role for plan and apply.** Rejected: a PR-triggered role with apply rights is a privilege-
  escalation path (any PR could mutate infra). Splitting plan (PR) from apply (gated environment) keeps
  least privilege and maker-checker.
- **`sub` scoped to `repo:org/*`.** Rejected: that would let any branch/PR assume the role. We pin exact
  refs/environments; the module even rejects an empty `subject_claims` list.
- **tfsec as a hard gate now.** Deferred to `soft_fail`: the apply policy is still a broad starter with
  unavoidable wildcards for create-time actions (ARNs don't exist pre-create). Findings are surfaced;
  tightening to a blocking gate is a follow-up once scopes stabilise.
- **Terraform Cloud / S3-native lockfile.** Rejected for now: S3 + DynamoDB is the doc's choice and needs
  no third-party account; the DynamoDB lock is still the broadly-supported option for this provider range.

## Consequences

- Shared, encrypted, locked remote state exists, and CI can authenticate to AWS with **no static keys**.
- PRs can run a real `plan` (once enabled) under read-only credentials; apply is environment-gated.
- Bootstrap is a one-time **local-state → migrate** dance, clearly documented.
- The apply policy is intentionally broad to start and is flagged for tightening; tfsec is report-only
  until then. Nothing is applied yet — account id, real bucket name, and the repo variables are filled in
  when an account is provisioned.
