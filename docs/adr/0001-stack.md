# ADR-0001 — Stack & monorepo foundations

- **Status:** Accepted
- **Date:** 2026-06-24
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §6–7 · [`docs/aws-architecture.md`](../aws-architecture.md) · [`CLAUDE.md`](../../CLAUDE.md)

## Context

We are building a multi-tenant global payroll SaaS (marketing site, guided demo, four product modules,
platform services) on AWS to the Well-Architected Framework. Phase 0 must establish the repository,
toolchain, CI, and a runnable skeleton that every later phase builds on. This ADR records the foundational
technology choices so later decisions have a fixed starting point. The choices themselves are mandated by
`PLAN.md`; this ADR captures the _why_ and the concrete versions/layout we standardized on.

## Decision

**Language & types.** TypeScript end-to-end, `strict` mode, `noUncheckedIndexedAccess`. `any` requires
written justification. Domain logic favors pure functions (notably the future `packages/payroll-core`).

**Monorepo.** pnpm workspaces + Turborepo. Workspace globs: `apps/*`, `packages/*`, `services/*`,
`workers/*`. Rationale: app, services, and shared contracts evolve together; Turborepo gives cached,
task-graph-aware builds. pnpm is pinned via `packageManager` (Corepack) for reproducibility.

**Frontend & marketing.** Next.js (App Router) + React + Tailwind CSS (+ shadcn/ui in later phases).
SSR/SSG for marketing/SEO; server/client components for the app.

**API/services.** NestJS (REST, OpenAPI-generated, DI, modular). Start as a **modular monolith** already
split into bounded contexts (`identity`, `org`, `payroll`, `time-leave`, `insights`, `assist`, plus
supporting services), deployed as a small number of ECS services and carved out further as load dictates.
Zod validates at the edges; OpenAPI is the source of truth for contracts.

**Data (later phases).** Aurora PostgreSQL via Prisma; Redis (ElastiCache); S3 for documents. Async via
SQS workers; Step Functions orchestrate multi-stage payroll runs.

**Shared config.** A single `@payce/config` package centralizes ESLint (flat config + typescript-eslint),
Prettier, Tailwind, and TypeScript presets so every workspace is consistent and DRY.

**Quality gates.** ESLint + Prettier; Vitest for unit tests; Husky hooks running lint-staged (pre-commit)
and commitlint (commit-msg) to enforce Conventional Commits. CI (GitHub Actions) runs
install → format:check → lint → typecheck → test → build on every PR.

**Local dev.** Docker Compose provides Postgres, Redis, and LocalStack so `pnpm dev` runs the stack
offline. AWS infra is provisioned exclusively via Terraform (no console click-ops).

### Pinned baseline (Phase 0)

| Tool | Version |
| ---- | ------- |
| Node.js | 22.x (`.nvmrc`) |
| pnpm | 9.15.4 (Corepack) |
| Turborepo | 2.x |
| TypeScript | 5.7.x |
| Next.js / React | 15.x / 19.x |
| NestJS | 10.x |
| Vitest | 2.x |
| ESLint / typescript-eslint | 9.x / 8.x |

## Alternatives considered

- **tRPC instead of REST/OpenAPI** — great internal type-safety, but REST + OpenAPI is friendlier for
  external/integration consumers and contract testing. Rejected for the public API; may be used internally.
- **Nx instead of Turborepo** — more batteries-included, heavier. Turborepo is sufficient and simpler.
- **npm/yarn instead of pnpm** — pnpm's content-addressed store and strict node_modules best fit a
  many-package monorepo.
- **Microservices from day one** — premature operational overhead. The modular monolith keeps clean
  boundaries so extraction is mechanical later.

## Consequences

- Later phases extend this skeleton; they do not re-litigate these choices. A material change requires a
  superseding ADR.
- `corepack enable` (or `corepack pnpm@<version>`) is required locally; the global pnpm shim needs write
  access to the Node install dir.
- Type-aware ESLint rules are intentionally off in the base config to keep lint fast and project-config
  free; individual packages can opt into stricter, type-checked rules where the signal is worth it.
- Next.js-specific lint rules (`eslint-config-next`) are deferred to keep the Phase 0 flat-config setup
  minimal; revisit when the marketing/app UI grows.
