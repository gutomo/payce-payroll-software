# ADR-0009: Enterprise SSO login (OIDC relying party + offline test IdP)

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §11 (Phase 7) · [`docs/aws-architecture.md`](../aws-architecture.md) §7 · [`CLAUDE.md`](../../CLAUDE.md) · [ADR-0001](0001-stack.md) · [ADR-0007](0007-infra-sso-waf-dr.md)

## Context

Phase 7's headline acceptance criterion is **"SSO login works against a test IdP"** (PLAN.md §11);
§5.2 specifies enterprise **SSO via SAML/OIDC**. [ADR-0007](0007-infra-sso-waf-dr.md) added the
infrastructure broker (a Cognito user pool federating tenant IdPs) but no application sign-in. This ADR
records the **app-side OIDC login**: how a federated user becomes an authenticated Payce session, built
to be fully testable with no AWS account or external IdP.

## Decision

**The API is the OIDC relying party; the existing cookie/JWT session is reused unchanged.** Rather than
make the browser a public OIDC client, the NestJS API runs the Authorization Code + PKCE flow and, on
success, issues the *same* Payce access/refresh tokens as password login (`AuthService.issueSessionForUserId`,
the single token code path). The web app only redirects and relays the callback; sessions stay in the
existing httpOnly cookies, and middleware refresh is unchanged. Two endpoints: `POST /auth/sso/start`
(resolve the tenant's provider, return the authorization URL + per-attempt `state`/`nonce`/`codeVerifier`)
and `POST /auth/sso/callback` (validate + exchange + link/provision + issue session). The web holds the
per-attempt values in a short-lived httpOnly cookie between the two, so the **CSRF (`state`), replay
(`nonce`), and PKCE** checks are meaningful; the API also re-checks `state == expectedState` server-side.

**A pluggable OIDC provider with an offline fallback — mirroring the Assist provider pattern.** An
`OidcProvider` interface has two implementations: a `StandardOidcProvider` (real Authorization Code +
PKCE; works against Cognito or any compliant issuer; the id_token is verified against the issuer's JWKS
with **`node:crypto` only — no new dependency**, checking signature + `iss`/`aud`/`exp`/`nonce`) and an
`OfflineOidcProvider` — a deterministic, **no-network "test IdP"** that satisfies the AC in dev/demo/CI.
The offline provider short-circuits the browser round-trip with an HMAC-signed assertion (per-provider
key, carries the nonce + an expiry) and is **refused in production** by the factory (fail closed).

**Per-tenant connection config in the data model, no secrets.** An `identity_provider` table (RLS,
tenant-scoped) holds non-secret OIDC connection config; the client secret is **never stored** — only a
`client_secret_ref` naming a Secrets Manager secret (golden rule 3), resolved at exchange time. A
`user_identity` table links a tenant user to their IdP `sub`, unique per `(tenant, provider, subject)`.
Tenant admins manage providers via `identity.sso.manage`-gated endpoints.

**Just-in-time provisioning, opt-in.** On first SSO login: an existing `user_identity` link signs the
user in; otherwise a user matched by email is linked (and an `INVITED` user is activated); otherwise, if
the provider has `allowJitProvisioning`, a new user is created with the provider's `defaultRoleKey`. With
JIT off, only pre-existing users may federate. An optional `emailDomain` allow-list is enforced. Every
SSO sign-in emits an `auth.sso.login` audit event.

## Alternatives considered

- **Browser as a public OIDC/PKCE client (per ADR-0007's app-client note).** Deferred: it would
  introduce a second session model (IdP tokens) alongside the existing cookie/JWT one and duplicate
  token handling in the web app. Letting the API be the RP keeps one session model and one authZ path.
- **A real OIDC library (`openid-client`/`jose`).** Rejected for this slice: `node:crypto` verifies the
  RS256 id_token against the JWKS with zero new dependencies, and the offline provider needs none. A
  library can be revisited if we need discovery/dynamic registration.
- **SAML first.** Deferred: OIDC covers the Cognito-brokered path and is simpler to verify end to end;
  SAML federates *into* Cognito (ADR-0007) and can be added behind the same `OidcProvider` seam.
- **Storing the OIDC client secret in `identity_provider`.** Rejected outright (rule 3) — `client_secret_ref`
  points at Secrets Manager; dev/test may use the `OIDC_CLIENT_SECRET` env var.

## Consequences

- The Phase 7 AC is met and **CI-verified**: a full offline-IdP login (JIT, linking, INVITED activation,
  email-domain enforcement, CSRF rejection, RBAC, audit, tenant isolation) runs green with no AWS.
- One session model; password and SSO both flow through the same token issuance and refresh.
- A real OIDC/Cognito provider is implemented and unit-tested (signature/claims), but **not yet wired to
  a live IdP** — that needs the Secrets Manager client-secret resolution and a configured tenant
  provider, both follow-ups once an account exists.
- SAML and SCIM provisioning (ADR-0007's broker) remain follow-ups; the provider seam accommodates them.
