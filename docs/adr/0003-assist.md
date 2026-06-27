# ADR-0003: Assist (AI assistant) architecture & the interactive demo

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §5.4, §6.4, §11 (Phase 6) · [`CLAUDE.md`](../../CLAUDE.md) · [ADR-0001](0001-stack.md)

## Context

Phase 6 delivers **Assist** — an in-app L1 assistant that answers everyday questions ("what's my leave
balance?", "when is payday?", "how do I apply for a claim?") — and the **interactive demo** (`/demo`).
The headline acceptance criterion is a security property: Assist must answer using **only the caller's
own scoped data**, with provably **no cross-tenant (or cross-user) leakage**, and the demo must run
**end-to-end with no login**. Assist is also explicitly retrieval-augmented over tenant FAQ/policy docs,
must escalate to a human when unsure or when the topic is sensitive, and must use a **pluggable LLM
provider** (Amazon Bedrock by default) so it can be swapped (`PLAN.md` §5.4, §15).

## Decision

**Pure kernel + thin I/O shell.** A new dependency-free package `@payce/assist` holds all the logic that
can be pure: lexical knowledge retrieval, deterministic tool routing (question → which scoped tools),
the escalation policy, PII redaction, and the provider abstraction with an offline `TemplateAssistProvider`
default. The API module (`apps/api/src/assist`) is the only place that touches the database or the network.
This mirrors `payroll-core`/`insights`: pure logic is unit-tested in isolation; the shell wires it to data.

**Scoped data tools reuse existing tenant-scoped services — the no-leak guarantee.** Each data tool either
delegates to an existing service (`LeaveService.myBalances`, `ClaimsService.myClaims`,
`EmployeesService.myProfile`) or runs an equivalent self-scoped query, always resolving the caller's own
employee by `userId` under Postgres RLS. **No code path takes a tenant id or employee id from the
question.** Tools that map to a permission are gated on the caller's permission set before they run. The
LLM never receives a tenant id and never decides *what* data to surface — it only phrases facts the API
already fetched. Therefore changing or compromising the model cannot widen scope or cross tenants; the
isolation is a property of the data layer, not the prompt. The Phase 6 integration test proves this with a
second tenant asking the same question and never seeing the first tenant's figures.

**Provider abstraction with a deterministic fallback.** `AssistProvider.compose()` turns gathered context
(question + retrieved knowledge + tool results) into prose plus a self-assessed confidence. The default
`TemplateAssistProvider` is pure and offline, so dev/test/CI need no network or credentials and the AC test
is deterministic. `BedrockAssistProvider` (selected when `BEDROCK_MODEL_ID` is set, mirroring
`StorageService`'s "configured → real client, else local" pattern) is a **phrasing layer only**: it wraps
the template provider, so confidence, citations, and which facts to show remain deterministic, and any
Bedrock error degrades silently to the template wording. We use the Bedrock **Converse** API via
`@aws-sdk/client-bedrock-runtime` (consistent with the repo's existing AWS-SDK usage) and send no
`temperature`/`thinking` params (rejected by current Claude models; we only need faithful rephrasing).

**Knowledge base as tenant data (RAG source).** `KnowledgeArticle` is a tenant-scoped, RLS-protected table
the assistant ranks lexically (TF-style token overlap, title/tag-weighted). No embeddings in v1 — adequate
for L1 FAQ routing, dependency-free, and trivially testable. The provider only ever phrases from retrieved
snippets, so even the Bedrock path cannot hallucinate policy.

**Escalation & audit.** A turn escalates (and opens an `AssistEscalation` ticket) when the topic is
sensitive (HR/legal/identity — wins regardless of confidence) or confidence is below threshold. Every turn
is persisted and audit-logged with the question **PII-redacted**, so the audit trail isn't a PII sink.

**Interactive demo = static synthetic fixtures, no API.** `/demo` is its own login-free route group that
renders synthetic mock MyHR and Insights screens (fixtures baked into the web app) with an in-house
guided-tour overlay. Tours are **JSON-defined** (target selector + copy) so non-engineers can add them.

## Alternatives considered

- **Let the LLM call tools / receive identifiers and decide scope.** Rejected: it makes tenant isolation a
  property of prompt-engineering rather than the data layer. Computing scoped results in the API and giving
  the model only the answers keeps the security boundary where it is enforced and tested.
- **Embeddings/vector search for retrieval.** Deferred: lexical retrieval is sufficient for L1 FAQs, adds
  no infra, and stays pure/testable. The `AssistProvider`/retrieval seams make an upgrade local.
- **Anthropic Bedrock SDK (`AnthropicBedrockMantle`) instead of `@aws-sdk` Converse.** Reasonable, but the
  Converse path keeps the dependency family consistent with `StorageService` and is provider-agnostic; the
  provider is a thin, swappable seam regardless.
- **A live read-only "demo tenant" behind the API for `/demo`.** Rejected for v1: static fixtures guarantee
  no-login, no PII, deterministic E2E, and zero new public attack surface.

## Consequences

- Swapping or upgrading the LLM changes phrasing only; it cannot change which data a caller sees.
- Assist works fully offline by default; Bedrock is an opt-in enhancement gated by one env var.
- New scoped tools are added by writing a self-scoped read + a permission mapping; they inherit RLS for free.
- The demo carries no real data and needs no auth, at the cost of not exercising the live API paths (an
  acceptable trade for a public, isolated tour).
