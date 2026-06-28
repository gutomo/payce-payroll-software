# ADR-0010: Security review, threat model & automated security gates

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §11 (Phase 7), §12 · [`CLAUDE.md`](../../CLAUDE.md) · [threat model](../security/threat-model.md) · [ADR-0007](0007-infra-sso-waf-dr.md) · [ADR-0008](0008-tf-state-and-ci-oidc.md) · [ADR-0009](0009-sso-login.md)

## Context

Phase 7 calls for a **security review & threat model** and for SAST/dependency/secret scanning in CI
(PLAN.md §11–§12). The controls themselves (RLS, server-side RBAC, maker-checker, argon2/MFA, SSO
CSRF/nonce/PKCE, audit, no-secrets) already exist across earlier phases; what was missing was (a) a
written, design-level **threat model** that maps threats to those controls and surfaces residual risk,
and (b) the **automated security gates** in CI. CLAUDE.md already asserts a gitleaks gate "runs in CI" —
but no security workflow existed yet. This ADR records the review approach and the gate choices.

## Decision

**A living STRIDE threat model** at [`docs/security/threat-model.md`](../security/threat-model.md):
assets + data classification, trust boundaries, a STRIDE table per boundary mapping each threat to the
control, **where it is enforced**, and **how it is verified**, plus a residual-risk register. It is a
design artifact reviewed per phase, not a one-off.

**Automated security gates in a `Security` workflow**, chosen to be free for a public repo and to need no
external accounts/tokens:

- **SAST — CodeQL** (`security-extended` queries, `javascript-typescript`). Native to GitHub, results land
  in the Security tab / PR. The repo is **public**, so CodeQL analysis + upload work without Advanced
  Security. Blocking on analysis error.
- **Secret scan — gitleaks** with a committed [`.gitleaks.toml`](../../.gitleaks.toml) that extends the
  default rules and **allowlists the repo's synthetic dev-only placeholders** (the documented public dev
  defaults in `env.ts`, the `docker-compose`/`.env.example` dev passwords, the demo webhook secret, and
  test fixtures). This finally wires the gate CLAUDE.md assumes, as a **blocking** check, without
  tripping on intentional non-secrets.
- **Dependency review (SCA)** via `dependency-review-action` on PRs, failing on **high**-severity
  advisories or newly-introduced vulnerable dependencies.

These compose with the existing gates: tenant-isolation integration tests (`ci.yml`) and the IaC `tfsec`
scan (`terraform.yml`).

## Alternatives considered

- **Semgrep instead of CodeQL.** Either satisfies §12. CodeQL is native to GitHub, free for this public
  repo, and needs no token; Semgrep adds value but overlaps. CodeQL chosen; Semgrep can be added later for
  custom rules.
- **gitleaks as report-only (like tfsec).** Rejected: secret leakage is a golden-rule violation, so the
  gate should **block**. The synthetic-value allowlist keeps it from false-positiving on dev defaults
  while still catching real secrets — so blocking is safe.
- **`dependency-review` failing on any severity.** Rejected as too noisy for a moving lockfile; `high` is
  the actionable threshold, with the full report surfaced on failure.
- **Skip the threat model, rely on code + tests.** Rejected: the controls exist but were never written
  down against a threat taxonomy, so gaps (e.g. tfsec still report-only, DAST/load/DR-game-day not yet
  run) were implicit. The document makes residual risk explicit and trackable.

## Consequences

- Every PR is now scanned for SAST findings, leaked secrets, and vulnerable dependencies, on top of the
  tenant-isolation and IaC gates — defense in depth in CI.
- The threat model gives reviewers a single place to check "is this threat already mitigated, and where",
  and a residual-risk list that names the remaining Phase 7 work (DAST, k6 load test, DR game-day, tfsec
  hardening, real Cognito/SAML/SCIM wiring).
- gitleaks blocks on real secrets; the allowlist must be kept honest — a new synthetic value goes in the
  allowlist with a comment, a real secret never gets committed.
