# `load/` — performance & load tests (k6)

[k6](https://k6.io) load tests for the API, covering the Phase 7 load AC (PLAN.md §11: _"load test
sustains target RPS with autoscaling"_) and the latency NFRs (PLAN.md §6). Scripts run on the k6 runtime
(not Node), so this folder is **not a pnpm workspace** — it's formatted by Prettier but not
linted/typechecked/built. See [ADR-0011](../docs/adr/0011-load-testing.md).

## Prerequisites

1. **Install k6** — https://k6.io/docs/get-started/installation/ (`winget install k6`, `brew install k6`, …).
2. **API running + seeded** with synthetic data:
   ```bash
   pnpm dev            # brings up Postgres/Redis + the API (and web)
   pnpm db:seed        # seeds the "demo" tenant (admin@demo.test, 12 employees)
   ```

## Run

```bash
# Smoke (1 VU, 30s) — fast correctness check of the harness + SLOs
k6 run load/scenarios/api-mix.js

# Steady load (ramped to 20 VUs) / stress (ramped to 100 VUs)
PROFILE=load   k6 run load/scenarios/api-mix.js
PROFILE=stress k6 run load/scenarios/api-mix.js

# Point at another environment / user
BASE_URL=https://staging.example.com/api/v1 PROFILE=load k6 run load/scenarios/api-mix.js
```

Overridable env: `BASE_URL`, `PROFILE` (`smoke`|`load`|`stress`), `TENANT`, `USER_EMAIL`, `USER_PASSWORD`.

## What it measures

`scenarios/api-mix.js` drives a realistic authenticated mix — a read group (`/me`, `/org/tree`,
`/insights/dashboards/prebuilt`) and a compute group (an ad-hoc Insights aggregate via
`POST /insights/reports/run`, which is idempotent so it's safe to repeat under load). Requests are tagged
`kind:read` / `kind:compute` so each gets its own latency budget.

## SLOs (thresholds)

Defined in [`lib/config.js`](lib/config.js); a run **fails** if any is breached:

| Metric | Target |
| --- | --- |
| Error rate (`http_req_failed`) | < 1% |
| Overall `http_req_duration` p95 | < 800 ms |
| Reads p95 (`kind:read`) | < 500 ms |
| Compute p95 (`kind:compute`) | < 1.5 s |

These encode the launch targets; tune them as the real ECS Fargate + Aurora infra and autoscaling land
(a single local API instance is not representative of production capacity).

## Not a PR gate (yet)

These tests need a **running, seeded API**, so they are not wired into the per-PR CI (which would be slow
and flaky). Run them locally before performance-sensitive changes, and against **staging** for the
release readiness check. A CI **smoke** job (boot the API + seed + `PROFILE=smoke`) is a follow-up once
the staging deploy pipeline exists.

## Extending

- **Payroll-run throughput** (PLAN.md §12): script a pay-group calculation lifecycle against a seeded pay
  period. It mutates state and depends on maker-checker, so it needs per-iteration setup/teardown — kept
  out of the read/compute mix on purpose; add it as a dedicated scenario with its own dataset.
- Add per-endpoint `Trend` metrics or `scenarios` (k6 executors) for mixed open/closed-model workloads.
