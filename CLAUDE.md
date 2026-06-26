# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It is the **working agreement** for the repo: read it before doing anything. The **what/why** lives in [`PLAN.md`](PLAN.md); the **infrastructure** in [`docs/aws-architecture.md`](docs/aws-architecture.md). This file is the **how**.

---

## Current repository state (read this first)

**Phase 0 (Foundations) is scaffolded and green.** The repo is a live pnpm + Turborepo monorepo with two runnable skeleton apps and passing CI gates. What exists today:

- `apps/web`, Next.js (App Router) skeleton (home page + `/api/health`). `apps/api`, NestJS skeleton (`GET /api/v1/health`).
- `packages/config`, shared ESLint (flat) / Prettier / Tailwind / TypeScript presets consumed by every workspace.
- Tooling: Turborepo, Vitest, ESLint + Prettier, Husky (pre-commit `lint-staged`, commit-msg `commitlint`), `docker-compose.yml` (Postgres + Redis + LocalStack), GitHub Actions CI, and `docs/adr/0001-stack.md`.
- The **Common commands** below are real and verified: `build`, `lint`, `typecheck`, `test`, and `format:check` all pass.

Not built yet: `services/*`, `workers/*`, the other `packages/*` (contracts, domain, payroll-core, rbac, ui, db), `infra/` (Terraform), and all product features. The repo map and most file paths below still describe the **target** structure (`PLAN.md` §7). **Next up is Phase 1** (`PLAN.md` §11), identity, tenancy, the data spine, built strictly phase by phase; don't begin a phase until the prior phase's AC pass in CI.

**Local pnpm note:** this machine has no global `pnpm`, and `corepack enable` needs write access to the Node install dir (admin). Either run an elevated `corepack enable`, or `corepack enable --install-directory <dir-on-PATH> pnpm`. The pnpm version is pinned via the root `packageManager` field.

---

## What we're building (one paragraph)

A multi-tenant global payroll SaaS, public marketing site, a guided interactive demo, and four product modules (Operations Console, Insights, MyHR, Assist) plus platform services, TypeScript end-to-end (Next.js + NestJS), on AWS ECS Fargate, provisioned with Terraform, built to the AWS Well-Architected Framework. Execute it **phase by phase** per `PLAN.md` §11.

---

## Golden rules (do not violate)

1. **No real PII, ever.** All seed/test/demo data is synthetic (faker). Never paste real personal data into code, fixtures, logs, or prompts.
2. **No copyrighted assets.** Do not copy Ramco/Payce branding, names, customer/partner logos, analyst imagery, award badges, or marketing copy. Use the placeholder brand and original copy (`PLAN.md` §2). Record any third-party asset in `ATTRIBUTIONS.md`.
3. **No secrets in the repo.** No keys, passwords, tokens in code, env files, or images. Use AWS Secrets Manager / SSM. `gitleaks` runs in CI and will fail the build.
4. **Security & tenancy are not optional.** Every tenant-owned query is tenant-scoped (middleware + Postgres RLS). Every sensitive mutation emits an audit event. AuthZ is enforced **server-side**.
5. **Don't skip the acceptance criteria.** A phase isn't done until its AC in `PLAN.md` pass in CI. Don't start a later phase early.
6. **No console/click-ops on AWS.** All infrastructure changes go through Terraform + PR.
7. **Maker-checker for payroll.** Publishing a payroll run always requires a second approver; never bypass it.

---

## Tech stack (authoritative)

- **Monorepo:** pnpm workspaces + Turborepo.
- **Frontend & marketing:** Next.js (App Router) + React + TypeScript + Tailwind + shadcn/ui.
- **API/services:** NestJS (TypeScript), REST, OpenAPI-generated. Zod at boundaries.
- **Data:** Aurora PostgreSQL via Prisma; Redis (ElastiCache); S3 for documents.
- **Async:** SQS workers; Step Functions for payroll orchestration.
- **Payroll engine:** `packages/payroll-core`, pure, deterministic, no I/O.
- **Infra:** Terraform (ECS Fargate, Aurora, ALB, CloudFront, WAF, …). See architecture doc.
- **CI/CD:** GitHub Actions; deploy to ECS via CodeDeploy blue/green; AWS auth via OIDC.
- **AI (Assist):** Amazon Bedrock behind a provider abstraction.

If you believe a deviation is warranted, write an ADR in `docs/adr/` and get it approved before coding it.

---

## Repo map

See `PLAN.md` §7 for the full tree. Key locations: `apps/web`, `apps/api`, `services/*`, `workers/*`, `packages/{contracts,domain,payroll-core,rbac,ui,db,config}`, `infra/`, `docs/`.

---

## Common commands

> These are the intended scripts; create/maintain them as part of Phase 0.

```bash
pnpm install                 # install workspace deps
pnpm dev                     # run web + api + local deps (docker compose: postgres, redis, localstack)
pnpm build                   # turbo build all
pnpm lint                    # eslint
pnpm typecheck               # tsc --noEmit across workspace
pnpm test                    # unit + integration (Vitest/Jest + Testcontainers)
pnpm test:e2e                # Playwright
pnpm db:migrate              # prisma migrate
pnpm db:seed                 # synthetic seed data

# Infra
cd infra/envs/<env>
terraform fmt -recursive && terraform validate
terraform plan               # review before apply
terraform apply              # only via CI with approval in staging/prod
```

---

## Conventions

- **Language:** TypeScript strict mode; no `any` without justification; prefer pure functions in the domain layer.
- **Money:** integer minor units + ISO currency code. Never floats for money.
- **Time:** UTC everywhere; localize only at the view layer.
- **IDs:** UUID v7. **Audit columns** on every table (`created_at/by`, `updated_at/by`).
- **Errors:** consistent error envelope; never leak internals/PII in messages.
- **API:** versioned `/api/v1`; cursor pagination; idempotency keys on money/job-creating POSTs; OpenAPI is the source of truth; regenerate clients in `packages/contracts`.
- **Commits:** Conventional Commits. **Branches:** short-lived feature branches → PR → `main`. **PRs:** small, with tests; green CI + review required.
- **Tests live with code.** New feature ⇒ new tests. Multi-tenant isolation tests are mandatory for any data-access change.
- **Telemetry:** add structured logs (with request-id + tenant-id), metrics, and traces for new endpoints/jobs.

---

## Definition of done (every feature/PR)

- [ ] Tests written and passing (unit/integration/e2e as appropriate), including tenant-isolation tests.
- [ ] RBAC + scope enforced server-side; authZ tested.
- [ ] Audit events emitted for sensitive actions.
- [ ] OpenAPI + generated clients updated; types shared via `packages/contracts`.
- [ ] Logs/metrics/traces added; no PII in telemetry.
- [ ] Docs/ADR updated; `PLAN.md` AC for the phase still hold.
- [ ] Security scans (SAST/dep/secret/IaC) pass; no new high findings.
- [ ] If infra changed: Terraform `fmt`/`validate`/`tfsec` clean; plan reviewed.

---

## How to approach a phase

1. Read the phase + its AC in `PLAN.md` §11 and the relevant architecture section.
2. Sketch the slice (data model → contract/OpenAPI → service → UI → tests → telemetry). Write/adjust an ADR if you're making a non-trivial decision.
3. Build vertically (a thin end-to-end slice first), keeping tenancy/authZ/audit in from the start, not as a later pass.
4. Provision matching infra via Terraform in parallel (architecture §12.3 sequence).
5. Open a PR; get CI green; verify the phase AC; only then move on.

---

## Guardrails when unsure

- If a change touches **payroll calculation**, **tenant isolation**, **auth**, **money movement**, or **IAM/security**, prefer the conservative option and call it out explicitly in the PR description.
- If something here conflicts with `PLAN.md`/architecture doc, **stop and flag it** rather than guessing.
- Never weaken a security control to make a test pass; fix the test or the design.
```
