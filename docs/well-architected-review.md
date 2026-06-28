# AWS Well-Architected review

**Reviewed:** 2026-06-28 · **Scope:** Payce multi-tenant payroll SaaS (end of Phase 7) · **Owner:** Platform engineering
**Framework:** AWS Well-Architected, six pillars. **Companion docs:** [`aws-architecture.md`](aws-architecture.md) · [`security/threat-model.md`](security/threat-model.md) · [`runbooks/dr-restore.md`](runbooks/dr-restore.md) · [ADRs](adr/README.md).

This is a design-level self-assessment against the six pillars: the posture today, what is in place (with
references), the gaps, and prioritized actions. It consolidates the infra/security/reliability/performance
work delivered through Phase 7. **Status reflects code + IaC in the repo; the production AWS account is not
yet provisioned**, so several controls are "designed/validated, not yet applied" — called out per pillar.

## Maturity snapshot

| Pillar                 | Posture                                                      | Headline gap                                             |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| Operational Excellence | Solid in CI/CD & telemetry design; runtime ops pending infra | No deployed env / dashboards yet                         |
| Security               | Strong, layered, enforced in code                            | tfsec report-only; DAST + real SSO secret wiring pending |
| Reliability            | DR designed (RPO≤5m/RTO≤1h); not yet exercised               | DR game-day not run; multi-AZ unprovisioned              |
| Performance Efficiency | Deterministic engine, pagination, load harness               | Targets unbaselined on real infra                        |
| Cost Optimization      | Serverless-leaning design, tagging, lifecycle                | No budgets/alerts; right-sizing TBD                      |
| Sustainability         | Fargate + serverless data reduce idle                        | Not yet measured                                         |

## 1. Operational Excellence

**Posture:** the delivery pipeline and observability _design_ are strong; runtime operations await a deployed
environment.

**In place**

- Everything-as-code: pnpm + Turborepo monorepo; infra as **Terraform modules + envs** ([`infra/`](../infra/), [ADR-0007](adr/0007-infra-sso-waf-dr.md)/[0008](adr/0008-tf-state-and-ci-oidc.md)); no console/click-ops (golden rule 6).
- CI gates on every PR: lint/typecheck/test/build, **integration + tenant-isolation** ([`ci.yml`](../.github/workflows/ci.yml)), **Terraform fmt/validate/tfsec** ([`terraform.yml`](../.github/workflows/terraform.yml)), **SAST/secret/SCA** ([`security.yml`](../.github/workflows/security.yml)).
- Conventional Commits, ADRs for every significant decision ([0001–0011](adr/README.md)), runbooks ([`runbooks/dr-restore.md`](runbooks/dr-restore.md)).
- Observability **by design**: structured logs with request-id + tenant-id, metrics/traces per endpoint, an append-only **audit trail** ([`audit.service.ts`](../apps/api/src/audit/audit.service.ts)).
- Keyless CI→AWS via **GitHub OIDC**; plan/apply split, apply gated behind environments ([ADR-0008](adr/0008-tf-state-and-ci-oidc.md)).

**Gaps / actions**

| Action                                                                                             | Priority |
| -------------------------------------------------------------------------------------------------- | -------- |
| Stand up dev/staging/prod accounts; wire CD (ECR → Terraform plan/apply → CodeDeploy blue/green)   | High     |
| Ship CloudWatch dashboards + alarms (SLOs, error rates, queue depth) and on-call runbooks          | High     |
| Add a CI smoke that boots the API + runs `PROFILE=smoke` k6 ([ADR-0011](adr/0011-load-testing.md)) | Medium   |

## 2. Security

**Posture:** strong and layered, enforced **server-side** and verified by tests; see the full
[STRIDE threat model](security/threat-model.md).

**In place**

- **Tenant isolation**: shared schema + mandatory `tenant_id` + Postgres **RLS** (ENABLE+FORCE, fail-closed), tenant-scoped Prisma client; dedicated isolation tests.
- **AuthN/Z**: argon2id + TOTP MFA; enterprise **SSO (OIDC + PKCE/nonce/state)** ([ADR-0009](adr/0009-sso-login.md)); server-side **RBAC** (`@RequirePermissions`); **maker-checker** for payroll publish.
- **Edge**: WAF (managed rules + per-IP rate limit, redacted logs) ([`infra/modules/waf`](../infra/modules/waf)).
- **Secrets**: none in repo; Secrets Manager refs only (golden rule 3); **gitleaks** + **CodeQL** + dependency review in CI ([ADR-0010](adr/0010-security-gates.md)).
- **Data**: KMS-encrypted state bucket; PII synthetic outside prod; no PII in telemetry/WAF logs.

**Gaps / actions**

| Action                                                                                                                              | Priority |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Resolve real OIDC client secret from Secrets Manager; wire a live Cognito tenant; add SAML + SCIM                                   | High     |
| Make **tfsec blocking** once the CI apply policy is tightened from its starter scope ([ADR-0008](adr/0008-tf-state-and-ci-oidc.md)) | Medium   |
| Add **DAST** against staging and container (Trivy) scanning of ECR images                                                           | Medium   |
| App-layer per-tenant rate limiting (WAF covers per-IP only)                                                                         | Low      |

## 3. Reliability

**Posture:** DR is **designed** to the targets but **not yet exercised**; HA depends on unprovisioned infra.

**In place**

- **DR**: AWS Backup with **cross-region copy** + Aurora PITR — RPO ≤ 5 min / RTO ≤ 1 hr ([`infra/modules/dr`](../infra/modules/dr)); a documented [restore runbook](runbooks/dr-restore.md).
- **Correctness as reliability**: deterministic, pure payroll engine; immutable, versioned published runs; **idempotency keys** on money/job POSTs; refresh-token reuse detection.
- Remote state with **locking** (S3 + DynamoDB) so infra changes can't race ([ADR-0008](adr/0008-tf-state-and-ci-oidc.md)).

**Gaps / actions**

| Action                                                                                          | Priority |
| ----------------------------------------------------------------------------------------------- | -------- |
| Provision multi-AZ Aurora + ≥2 Fargate AZs; health checks + auto-rollback alarms                | High     |
| Run a **DR game-day** and record measured RPO/RTO vs target ([runbook](runbooks/dr-restore.md)) | High     |
| Add SQS DLQs + retry policy for async workers; chaos/failure-injection tests                    | Medium   |

## 4. Performance Efficiency

**Posture:** sound algorithmic + data-access design; absolute targets must be **baselined on real infra**.

**In place**

- Pure, deterministic `payroll-core` (no I/O); cursor pagination; tenant-scoped, indexed queries.
- Marketing SSG/edge for LCP; the API as a BFF boundary (no chatty client calls).
- **k6 load harness** with SLO thresholds (p95/error budgets), `smoke`/`load`/`stress` profiles ([`load/`](../load/), [ADR-0011](adr/0011-load-testing.md)).

**Gaps / actions**

| Action                                                                               | Priority |
| ------------------------------------------------------------------------------------ | -------- |
| Re-baseline thresholds against staging (single local instance under-represents prod) | High     |
| Add Redis caching for hot reads (org tree, dashboards); profile N+1s                 | Medium   |
| Move payroll calculation to Step Functions fan-out; load-test run throughput         | Medium   |

## 5. Cost Optimization

**Posture:** the architecture leans serverless/elastic; cost **governance** is not yet wired.

**In place**

- Fargate + Aurora + serverless data services scale with load (no idle fleet); DynamoDB **PAY_PER_REQUEST** for the lock table.
- **`default_tags`** on every resource (Project/Env/ManagedBy/Component) for cost allocation ([`infra/envs/staging`](../infra/envs/staging)).
- S3 lifecycle expiry for noncurrent state versions; tunable backup retention.

**Gaps / actions**

| Action                                                                                           | Priority |
| ------------------------------------------------------------------------------------------------ | -------- |
| AWS Budgets + anomaly alerts per env; cost dashboards by tag                                     | High     |
| Right-size Fargate tasks / Aurora from load tests; evaluate Aurora Serverless v2 + Savings Plans | Medium   |
| S3/CloudWatch log retention tiering; Graviton (arm64) for tasks                                  | Low      |

## 6. Sustainability

**Posture:** the serverless/elastic design minimizes idle capacity; impact is not yet measured.

**In place**

- Scale-to-need compute (Fargate) and managed data services avoid always-on over-provisioning.
- Efficient, deterministic compute in the payroll engine; static delivery at the edge.

**Gaps / actions**

| Action                                                                      | Priority |
| --------------------------------------------------------------------------- | -------- |
| Prefer **Graviton (arm64)** tasks; right-size to cut idle                   | Medium   |
| Region choice factoring carbon; aggressive auto-scale-to-zero in lower envs | Low      |
| Track the AWS customer carbon tool once deployed                            | Low      |

## Top risks (cross-pillar)

1. **Nothing is deployed yet** — the strongest controls (DR, WAF, autoscaling, dashboards) are designed and
   IaC-validated but unproven until an account exists. _Standing up dev/staging is the unlock for half this list._
2. **DR untested** — RPO/RTO are targets until a game-day measures them.
3. **Real SSO not wired** — OIDC verified offline; live Cognito + Secrets Manager resolution + SAML/SCIM pending.
4. **tfsec report-only** — IaC scan is advisory until the apply policy is tightened and made blocking.

## Next review

Re-run this review after the first **staging deployment** (validates Reliability/Performance/Cost with real
numbers) and again before GA. Keep it beside the [threat model](security/threat-model.md) as the two living
design-assurance docs.
