# Global Payroll SaaS — Build Plan & Handoff

A handoff package for building a production-grade, multi-tenant **global payroll SaaS**, modeled on the information architecture and UX of the Ramco *Payce* product site, and hosted on **AWS** to the **Well-Architected Framework** — high availability, horizontal scalability, and security/compliance best practices for payroll-grade (PII + financial) data.

> **Not an affiliate or clone of Ramco.** We replicate structure, layout, and functional concepts only — never Ramco's branding, names, logos, or copy. Use original branding and synthetic data (see `PLAN.md` §2).

## The three documents

| Doc | Purpose |
|---|---|
| **[PLAN.md](PLAN.md)** | Master implementation plan — scope, product modules, data model, API surface, phased milestones with acceptance criteria, testing & CI/CD. The **what & why**. |
| **[docs/aws-architecture.md](docs/aws-architecture.md)** | AWS design — VPC/multi-AZ network, ECS Fargate, Aurora, edge/CDN, security, observability, DR, cost, the **6 Well-Architected pillars**, and the **Terraform** layout. The **infrastructure**. |
| **[CLAUDE.md](CLAUDE.md)** | Working agreement for Claude Code — stack, commands, conventions, golden rules, definition of done. The **how**. |

## Chosen approach (from intake)

- **Scope:** full multi-tenant payroll SaaS (not just the marketing site).
- **Stack:** Next.js + React + TypeScript (front end & marketing); NestJS services.
- **AWS compute:** containers on **ECS Fargate**, multi-AZ.
- **IaC:** **Terraform**.

## How to start (for Claude Code)

1. Read **CLAUDE.md**, then **PLAN.md**, then **docs/aws-architecture.md**.
2. Execute **Phase 0** (`PLAN.md` §11): monorepo, tooling, CI, local stack. Open a PR; get CI green.
3. Record stack decisions in `docs/adr/0001-stack.md`.
4. Proceed through phases **in order** — don't start a phase until the previous phase's acceptance criteria pass in CI.
5. Build the matching infrastructure in parallel, following the Terraform sequence in `docs/aws-architecture.md` §12.3.

## Status

**Phases 0–1 complete (merged); Phase 2 in review.**

- **Phase 0 — Foundations (merged).** pnpm + Turborepo monorepo with two runnable apps (`apps/web` Next.js, `apps/api` NestJS), shared presets (`packages/config`), local dev stack (`docker-compose.yml`), Git hooks, GitHub Actions CI, and [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md).
- **Phase 1 — Platform core (merged).** Identity, tenancy, auth (password + MFA), RBAC, and audit, plus the marketing site shell — with Postgres RLS tenant isolation enforced server-side.
- **Phase 2 — Org & employee management (in review).** Org/employee data model, tenant-scoped read API (employees, org tree, self-profile), CSV bulk import with row-level validation, and the MyHR web app (login, profile, org chart). All Phase 2 acceptance criteria met; see [`PLAN.md`](PLAN.md) §11.

All quality gates pass (`pnpm lint`/`typecheck`/`test`/`build`/`format:check`). Next: **Phase 3** (payroll engine) per [`PLAN.md`](PLAN.md) §11.
