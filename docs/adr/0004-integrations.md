# ADR-0004: Integrations framework, connectors & webhooks

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §5.5, §11 (Phase 7) · [`CLAUDE.md`](../../CLAUDE.md) · [ADR-0001](0001-stack.md)

## Context

Phase 7 builds the **integrations framework** (`PLAN.md` §5.5, §11): a typed connector interface,
inbound/outbound flows, webhooks, and idempotent jobs, plus one mock HCM connector. v1 ships the
framework and a synthetic connector — real HCM/ERP connectors and a SaaS delivery worker are deferred
(`PLAN.md` §3.2). The rest of Phase 7 (SSO/SCIM, load/DR/pen-test, WAF) is infra/ops that lands with
the AWS environment; this ADR covers the application-layer framework.

## Decision

**Pure kernel + thin API shell**, mirroring `payroll-core`/`insights`/`assist`. A dependency-free
`@payce/integrations` package holds the typed `Connector` interface + registry, the mock HCM
connector, CSV normalisation, deterministic idempotency seeding, and HMAC webhook signing. The API
module wires it to tenant-scoped persistence and the existing import pipeline.

**Inbound syncs reuse the Phase 2 employee-import pipeline.** A connector normalises its source into
the canonical `EmployeeImportRecord` shape; the integrations service serialises that to the exact CSV
the Phase 2 importer accepts and calls `EmployeesImportService.importCsv`. This reuses all of that
path's validation, reference resolution, bulk insert, and audit — a connector is a *normaliser*, not
a parallel write path. It also means tenancy/authZ/audit are inherited, not re-implemented.

**Runs are idempotent via a unique key.** `integration_run` has a unique `(tenant, integration,
idempotency_key)`; triggering with the same key returns the existing run instead of importing again,
and a concurrent duplicate loses the unique race and returns the winner's run. The connector seed is
derived from the key (`hashSeed("<integrationId>:<key>")`), so a given run is reproducible and
distinct runs generate distinct, non-colliding employee numbers. This satisfies the resilience
posture (idempotent jobs, architecture §6/§10) without a queue in v1.

**Webhooks are signed; delivery is simulated in-process for v1.** Registering a webhook generates an
HMAC secret returned exactly once (never on subsequent reads). When a run event fires, each subscribed
active webhook gets a `webhook_delivery` row carrying the payload and an HMAC-SHA256 signature over the
raw body — idempotent per `(webhook, event_id)`. v1 records the delivery as `DELIVERED` synchronously
rather than making outbound HTTP calls (no arbitrary external requests from the app; hermetic tests).
Production routes delivery through an SQS-backed worker that POSTs to the URL with retries and a DLQ
(architecture §6.1/§10) — the data model (status, attempts, status_code, delivered_at) already supports
that without schema change.

**Secrets posture.** Connector *credentials* live in Secrets Manager and are never stored on the
`integration` row (golden rule 3); `config` holds non-secret settings only. The webhook *signing
secret* is per-webhook runtime data (like Stripe's `whsec_`), generated server-side and stored on the
row; the column would be KMS-encrypted at rest in production.

## Alternatives considered

- **A bespoke connector write path** instead of reusing the CSV importer. Rejected: it would duplicate
  validation/reference-resolution/audit and drift from the upload path. Normalising to the importer's
  contract keeps one code path.
- **A real outbound HTTP delivery in v1.** Rejected for now: it adds an external-request attack surface
  and makes tests non-hermetic. Simulated delivery proves the framework (events fire, deliveries are
  recorded and signed) and the worker is a drop-in later.
- **Idempotency via an `Idempotency-Key` header** rather than a body field. Either works; a body field
  keeps it explicit and testable. The unique constraint is the actual guarantee regardless of transport.
- **A queue (SQS) for runs in v1.** Deferred: synchronous runs are simpler and adequate at demo scale;
  the run row + status model already fits an async executor when load demands it.

## Consequences

- New connectors are added by implementing `Connector` (and registering it); they inherit the import
  pipeline, idempotency, and webhook plumbing for free.
- Inbound syncs are reproducible and safe to retry; the same key never double-imports.
- Webhook receivers can verify authenticity today (`verifySignature`); turning on real delivery is a
  worker + the existing delivery rows, not a schema or API change.
- Outbound delivery is not yet real, so end-to-end "did the receiver get it" isn't exercised until the
  worker lands — an accepted v1 limitation, called out in `log`/docs.
