# Threat model & security review

**Status:** living document · **Last reviewed:** 2026-06-28 · **Owner:** Platform engineering
**Method:** STRIDE per trust boundary, mapped to controls already enforced in code/infra and to the
Phase 7 security AC (PLAN.md §11) and testing strategy (PLAN.md §12).

This is a design-level review of the multi-tenant payroll SaaS. It records the assets, the trust
boundaries, the STRIDE threats at each boundary, the control that mitigates each, **where that control
is enforced**, and how it is **verified**. Residual risks and follow-ups are listed at the end.

## 1. Assets & data classification

| Asset                                      | Class              | Notes                                              |
| ------------------------------------------ | ------------------ | -------------------------------------------------- |
| Employee PII (names, emails, employment)   | Confidential       | Synthetic only outside prod (golden rule 1)        |
| Compensation & payroll results (money)     | Confidential       | Integer minor units; maker-checker to publish      |
| Credentials (argon2 hashes, TOTP secrets)  | Secret             | Never returned by the API                          |
| Session tokens (access JWT, refresh)       | Secret             | httpOnly cookies; refresh hashed at rest           |
| SSO connection config / client-secret refs | Sensitive          | Secret itself in Secrets Manager, never in DB/repo |
| Audit trail                                | Integrity-critical | Append-only; tenant-scoped                         |
| Tenant isolation boundary (`tenant_id`)    | Integrity-critical | Enforced by RLS + middleware                       |
| Cloud control plane (IAM, state, infra)    | Secret/critical    | Terraform + OIDC; no static keys                   |

## 2. Architecture & trust boundaries

```
[Browser] --TLS--> [Web (Next.js BFF)] --server-side--> [API (NestJS)] --> [Postgres (RLS)]
   |  httpOnly cookies          |  no token in client JS        |            [Redis] [S3]
   |                            |                               +--> [SSO IdP (OIDC)]  (B5)
   B1 (user↔web)            B2 (web↔api)                 B3 (api↔data)   B4 (platform plane)
                                                          B6 (api↔integrations/webhooks)
```

- **B1 user ↔ web** — public internet; the browser never holds raw tokens (cookies are httpOnly).
- **B2 web ↔ API** — the web is a backend-for-frontend; all API calls are server-side (`apiFetch`).
- **B3 API ↔ data** — every tenant-owned row is RLS-scoped on `app.current_tenant_id`.
- **B4 platform plane** — tenant provisioning, gated by the platform admin key (separate from tenants).
- **B5 API ↔ SSO IdP** — OIDC Authorization Code + PKCE; the API is the relying party (ADR-0009).
- **B6 API ↔ integrations/webhooks** — outbound HMAC-signed deliveries; connector secrets out-of-band.

## 3. STRIDE by boundary

### Spoofing (authentication)

| Threat                              | Control                                                                                                        | Enforced in                                     | Verified by                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Forged/guessed login                | argon2id password hashing; generic `INVALID_CREDENTIALS` (no user enumeration)                                 | `auth.service.ts`, `crypto/password.service.ts` | `auth-flow.int.test.ts`                         |
| Stolen password reuse               | TOTP MFA (second factor); short-lived MFA token                                                                | `auth.service.ts`, `crypto/totp.service.ts`     | `auth-flow.int.test.ts`                         |
| SSO sign-in forgery / CSRF / replay | `state` (CSRF, re-checked server-side), `nonce` (replay), PKCE; id_token signature + `iss`/`aud`/`exp`/`nonce` | `sso/sso.service.ts`, `sso/oidc-provider.ts`    | `sso-flow.int.test.ts`, `oidc-provider.test.ts` |
| Offline test IdP abused in prod     | factory refuses `OFFLINE` providers when `NODE_ENV=production`                                                 | `sso/sso-provider.factory.ts`                   | unit (factory), ADR-0009                        |
| Platform-plane impersonation        | platform admin key, separate principal, not a tenant role                                                      | `guards/platform.guard.ts`                      | `auth-flow.int.test.ts`                         |

### Tampering (integrity)

| Threat                         | Control                                                                              | Enforced in                            | Verified by                       |
| ------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------- | --------------------------------- |
| Cross-tenant write             | Postgres RLS (ENABLE+FORCE) `WITH CHECK` on `tenant_id`; tenant-scoped Prisma client | `*_rls` migrations, `db/src/tenant.ts` | isolation assertions in int tests |
| Token tampering                | signed JWT (access), opaque refresh stored only as SHA-256 hash                      | `token.service.ts`                     | `token.service.test.ts`           |
| Unauthorized payroll publish   | maker-checker (second approver required), immutable published runs                   | payroll module                         | payroll int tests                 |
| Webhook payload tampering      | HMAC signature per delivery                                                          | integrations module                    | integrations int tests            |
| Money rounding/precision abuse | integer minor units + ISO currency, never floats                                     | `payroll-core`, schema (`BigInt`)      | payroll-core unit tests           |

### Repudiation (auditability)

| Threat                             | Control                                                                                                                      | Enforced in                    | Verified by                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------- |
| Deny performing a sensitive action | append-only `audit_event` (actor, action, request-id, ip), tenant-scoped, on every sensitive mutation incl. `auth.sso.login` | `audit.service.ts`, call sites | audit assertions in int tests |

### Information disclosure (confidentiality)

| Threat                           | Control                                                                         | Enforced in                                     | Verified by           |
| -------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------- |
| Cross-tenant read                | RLS (fail-closed: no GUC ⇒ zero rows)                                           | `*_rls` migrations                              | isolation tests       |
| Secrets in repo                  | no secrets committed; Secrets Manager refs only; **gitleaks** secret-scan in CI | `.gitleaks.toml`, `security.yml`, ADR-0007/0009 | `security.yml`        |
| Token theft via XSS              | tokens in httpOnly cookies; client JS cannot read them                          | web `lib/auth/*`                                | `web` a11y/auth tests |
| PII in logs/telemetry            | structured logs without PII; Assist redacts PII before audit                    | logging, `assist`                               | assist int tests      |
| WAF logs leaking auth data       | `Authorization`/`Cookie` headers redacted in WAF logs                           | `infra/modules/waf`                             | `terraform validate`  |
| Verbose errors leaking internals | consistent error envelope, no internals/PII                                     | `common/http-exception.filter.ts`               | int tests             |

### Denial of service (availability)

| Threat                     | Control                                                   | Enforced in                 | Verified by                                     |
| -------------------------- | --------------------------------------------------------- | --------------------------- | ----------------------------------------------- |
| Volumetric / per-IP floods | WAF rate-based rule + AWS managed rule groups             | `infra/modules/waf`         | `terraform validate`; **load test (follow-up)** |
| Expensive endpoints        | cursor pagination; scoped queries                         | API modules                 | int tests                                       |
| Region loss                | AWS Backup cross-region copy; Aurora PITR (RPO≤5m/RTO≤1h) | `infra/modules/dr`, runbook | DR game-day (follow-up)                         |

### Elevation of privilege (authorization)

| Threat                              | Control                                                                                               | Enforced in                   | Verified by                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| Acting beyond granted role          | server-side RBAC: `@RequirePermissions` + `PermissionsGuard`; perms flattened into the token at login | `guards/permissions.guard.ts` | RBAC 403 assertions (incl. `sso-flow.int.test.ts`) |
| Self-escalation via role assignment | assignment itself gated by `identity.role.assign`                                                     | users module                  | `auth-flow.int.test.ts`                            |
| SSO JIT over-provisioning           | JIT is opt-in per provider; `defaultRoleKey` is least-privilege; optional `emailDomain` allow-list    | `sso/sso.service.ts`          | `sso-flow.int.test.ts`                             |
| CI assuming more than needed        | split plan (read-only, PRs) vs apply (gated environments) OIDC roles                                  | `infra/global`                | ADR-0008                                           |

## 4. Top risks & residual risks

1. **Real OIDC/Cognito not yet wired** — the `StandardOidcProvider` is implemented and unit-tested, but
   client-secret resolution from Secrets Manager and a live tenant provider are follow-ups. _Until then,
   real SSO requires `OIDC_CLIENT_SECRET` in a trusted env; OFFLINE providers are dev/demo only._
2. **tfsec is report-only** — the CI IaC scan is `soft_fail` while the apply policy is a broad starter
   (ADR-0008). _Follow-up: tighten the apply policy and make tfsec blocking._
3. **DAST / load test / DR game-day not yet run** — required by the Phase 7 AC; tracked as follow-ups.
4. **No per-tenant request rate limiting at the app layer** — WAF provides per-IP limiting; an
   authenticated-tenant quota is a follow-up.
5. **SAML & SCIM** — only OIDC is implemented; SAML/SCIM federate into the Cognito broker (ADR-0007) and
   remain follow-ups behind the same provider seam.

## 5. Security gates in CI (defense in depth)

| Gate                    | Tool                                            | Workflow            | Posture                                             |
| ----------------------- | ----------------------------------------------- | ------------------- | --------------------------------------------------- |
| SAST                    | CodeQL (`security-extended`)                    | `security.yml`      | blocking on analysis error; findings → Security tab |
| Secret scan             | gitleaks (+ allowlist for synthetic dev values) | `security.yml`      | blocking                                            |
| Dependency review (SCA) | `dependency-review-action`                      | `security.yml` (PR) | blocking ≥ high                                     |
| IaC scan                | tfsec                                           | `terraform.yml`     | report-only (follow-up: blocking)                   |
| Tenant isolation        | dedicated int-test assertions                   | `ci.yml`            | blocking                                            |

Planned/expected for launch readiness (PLAN.md §12): container scan (Trivy on ECR images), DAST against
staging, and k6 load tests — added as the compute/edge infra lands.

## 6. Assumptions

- Synthetic data only outside production; no real PII enters lower environments (golden rule 1).
- All cloud changes go through Terraform + PR; no console/click-ops (golden rule 6).
- Secrets live in AWS Secrets Manager / SSM; nothing secret is committed (golden rule 3).
- TLS terminates at the edge (CloudFront/ALB); internal traffic is within the VPC.
