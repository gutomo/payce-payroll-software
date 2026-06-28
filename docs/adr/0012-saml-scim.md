# ADR-0012: SAML federation & SCIM user provisioning

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §5.2, §11 (Phase 7) · [`docs/aws-architecture.md`](../aws-architecture.md) §7 · [`CLAUDE.md`](../../CLAUDE.md) · [ADR-0007](0007-infra-sso-waf-dr.md) · [ADR-0009](0009-sso-login.md)

## Context

Phase 7 calls for enterprise **SSO via SAML/OIDC + SCIM provisioning** (PLAN.md §5.2, §11). [ADR-0009](0009-sso-login.md)
delivered OIDC login behind a provider seam; this ADR adds the remaining two: **SAML** federation and
**SCIM** joiner/mover/leaver provisioning, reusing the `identity_provider` / `user_identity` model.

## Decision

**SAML is Cognito-brokered, not parsed app-side.** Per [ADR-0007](0007-infra-sso-waf-dr.md), the Cognito
user pool is the SAML/OIDC broker; the app speaks **OIDC to the pool** and never handles raw SAML
assertions. So a `SAML` provider kind is **config-only**: it stores the IdP metadata URL
(`samlMetadataUrl`) — which an operator provisions into Cognito (the Terraform `sso` module's
`saml_providers`) — and the provider factory **refuses to start a SAML provider directly** (`/auth/sso/start`
returns 400 for SAML). This avoids building and maintaining a fragile, security-critical SAML SP (XML
signature verification, binding handling) that the architecture explicitly delegates to Cognito.

**SCIM 2.0 Users API** (`/scim/v2/Users`), authenticated by a **per-provider bearer token**:

- The token's SHA-256 hash lives in a **platform-plane `scim_credential` table (no RLS)**. The
  `ScimAuthGuard` resolves a token to its tenant **before** any tenant context exists — exactly as login
  resolves a tenant by slug — then every operation runs `runInTenant`. Disabling SCIM **deletes** the
  credential, so a missing credential simply fails auth; the token value is shown **once** on rotation.
- Provisioning maps SCIM ↔ Payce: **joiner** (`POST`) creates/links an `app_user` + `user_identity` and
  grants the provider's `defaultRoleKey`; **mover** (`PUT`/`PATCH`) updates name/`active`; **leaver**
  (`PATCH active=false` / `DELETE`) **soft-disables** the user and **revokes refresh tokens** — never a
  hard delete, so payroll history survives. `DELETE` additionally removes the provisioning link so the
  SCIM resource is "gone" (a later `GET` 404s) while the disabled user persists.
- It assumes a provider's SCIM **`externalId` equals its federation `sub`** (true for Okta/Entra), so a
  SCIM-provisioned user and that user's SSO login converge on **one** `user_identity`.
- Every action emits a tenant-scoped audit event (`scim.user.*`); SCIM management is gated by the existing
  `identity.sso.manage` permission.

## Alternatives considered

- **Direct SAML SP in the app.** Rejected: duplicates what Cognito brokers (ADR-0007), and a hand-rolled
  SAML SP is a large, error-prone security surface. SAML federates *into* Cognito; the app stays OIDC-only.
- **SCIM token hashed on `identity_provider` (RLS) instead of a platform table.** Rejected: the guard must
  resolve the tenant from the token with no tenant context, which RLS (fail-closed) blocks. A platform-plane
  credential table is the same pattern as `tenant`/`plan` and keeps the secret out of tenant-scoped rows.
- **Hard delete on SCIM `DELETE`.** Rejected: payroll/audit history must survive a leaver. We soft-disable
  + unlink, which preserves history while presenting correct SCIM semantics (resource gone).
- **Full SCIM compliance now** (filters beyond `eq`, pagination, Groups, SCIM-shaped error bodies).
  Deferred: the implemented subset (Users CRUD, `userName`/`externalId eq` filters, `active`/displayName
  patch) covers Okta/Entra provisioning. Errors use the standard envelope with correct SCIM status codes;
  SCIM-schema error bodies, Groups, and pagination are follow-ups.

## Consequences

- SAML-federated tenants are supported end-to-end (Cognito brokers login; the app provisions via SCIM),
  and OIDC, SAML, and the offline test IdP all share one data model and admin surface.
- Automated **JML** provisioning works and is **CI-verified** (10-case integration test: joiner with
  default role, conflict, get/filter, **tenant isolation**, leaver + session revocation, deprovision,
  audit) with no external IdP.
- The platform-plane `scim_credential` table holds auth material (token hashes) outside RLS by design —
  documented and analogous to other platform tables.
- Real SAML wiring still needs the Cognito pool + metadata pushed via Terraform; SCIM Groups, pagination,
  and SCIM-shaped errors remain follow-ups.
