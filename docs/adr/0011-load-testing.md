# ADR-0011: Performance & load testing with k6

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §6 (NFRs), §11 (Phase 7), §12 · [`CLAUDE.md`](../../CLAUDE.md) · [`load/README.md`](../../load/README.md)

## Context

The Phase 7 AC requires that "load test sustains target RPS with autoscaling" (PLAN.md §11), and §12
names **k6** for "payroll-run throughput, API p95, autoscaling behavior". This ADR records the load-test
harness and how it fits CI, given that the production compute tier (ECS Fargate + Aurora + autoscaling)
isn't provisioned yet.

## Decision

**A k6 harness under `load/`**, parameterised by env (`BASE_URL`, `PROFILE`, credentials) so the same
scripts run against local dev or staging. Three **profiles** — `smoke` (1 VU, fast), `load` (ramp to a
steady target), `stress` (ramp past it to find the knee) — selectable with `PROFILE=`. The main scenario
(`api-mix.js`) drives a realistic authenticated workload: a **read** group plus a **compute** group (an
idempotent Insights aggregate), tagged so each gets its own latency budget.

**SLOs are encoded as k6 thresholds** (in `lib/config.js`): < 1% errors, overall p95 < 800 ms, reads p95
< 500 ms, compute p95 < 1.5 s. A breach fails the run. They encode the launch targets and are tuned as
the real infra lands.

**`load/` is deliberately outside the pnpm workspace.** k6 scripts run on k6's own (goja) runtime and
import from `k6/*`, which Node/ESLint/tsc can't resolve. Keeping the folder out of the workspace avoids
forcing those tools onto runtime-incompatible code; Prettier still formats it (root glob), so style stays
consistent.

**Not a per-PR CI gate.** The tests need a running, seeded API; booting that for every PR would be slow
and flaky. They run **locally** before performance-sensitive changes and against **staging** for release
readiness. A CI `smoke` job (boot API + seed + `PROFILE=smoke`) is a follow-up once the staging deploy
pipeline exists.

## Alternatives considered

- **Artillery / Gatling / Locust.** k6 is the tool §12 names; it's scriptable in JS (consistent with the
  stack), has first-class thresholds/tags, and a clean CLI. No reason to deviate.
- **Wire k6 into per-PR CI now.** Rejected: without a booted server in CI it can't run, and a full load
  run per PR is the wrong place — load belongs against staging. A smoke check is the most that fits CI,
  deferred until there's a server to point it at.
- **Make `load/` a workspace package.** Rejected: it would drag ESLint/tsc/build onto k6-runtime scripts
  that legitimately import `k6/http` etc. Prettier-only is the right amount of tooling.
- **Script payroll-run throughput in this slice.** Deferred: a run lifecycle mutates state and depends on
  maker-checker, needing per-iteration setup/teardown; it belongs in its own scenario with a dedicated
  dataset rather than the idempotent read/compute mix. Documented as an extension.

## Consequences

- A runnable, env-parameterised load harness exists with SLO thresholds that encode the targets; the
  read/compute mix gives an API p95 + throughput signal today against local/staging.
- Thresholds are provisional until the production ECS/Aurora tier and autoscaling exist — a single local
  instance under-represents production capacity, so absolute numbers will be re-baselined on staging.
- Payroll-run throughput and a CI smoke job remain documented follow-ups.
