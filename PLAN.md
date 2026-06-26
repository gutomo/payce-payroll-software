# Global Payroll SaaS: Implementation Plan (Claude Code Handoff)

> **Working title:** `Payce-style Payroll Platform` (replace with your own product name before launch).
> **Status:** Ready for Claude Code to execute, phase by phase.
> **Companion docs:** [`docs/aws-architecture.md`](docs/aws-architecture.md) (infrastructure) · [`CLAUDE.md`](CLAUDE.md) (working agreement).

---

## 0. How to use this document

This is the master plan. It is written to be handed to Claude Code and executed **phase by phase** (Section 11). Each phase has concrete deliverables and acceptance criteria. Do not jump ahead; earlier phases set up the scaffolding, contracts, and CI that later phases depend on.

When in doubt about conventions, commands, or guardrails, read [`CLAUDE.md`](CLAUDE.md). For anything infrastructure/AWS, read [`docs/aws-architecture.md`](docs/aws-architecture.md).

---

## 1. Objective

Build a production-grade, **multi-tenant global payroll SaaS** modeled on the information architecture and UX of the Ramco *Payce* product site (a public marketing site, a guided interactive demo, and four functional product modules), hosted on **AWS** following the **Well-Architected Framework**, designed for **high availability**, **horizontal scalability with user growth**, and **security/compliance best practices** appropriate to payroll (PII + financial data).

Success means: a new enterprise tenant can be onboarded, employees and payroll operators can log in, a payroll cycle can be configured and run on sample data, payslips and analytics are produced, and the whole thing runs on resilient, observable, least-privilege AWS infrastructure provisioned entirely via Terraform.

---

## 2. Intellectual-property & branding guardrails (read first)

The reference site belongs to Ramco. We are cloning **structure, layout patterns, navigation, and functional concepts**, **not** their intellectual property. Therefore:

- **Do not** copy Ramco/Payce logos, the "Payce"/"Ramco"/"BInGO"/"CHIA" names, customer logos (GE, Coca-Cola, Nissan, Standard Chartered, Johnson Controls, etc.), analyst-report imagery, award badges, or marketing copy verbatim.
- **Do** use a placeholder brand and original copy. Module working names below are generic; rename freely:
  - *Payroll Workspace* → **Operations Console**
  - *BInGO* → **Insights** (analytics & report builder)
  - *Daily HR* → **MyHR** (employee self-service)
  - *CHIA* → **Assist** (AI assistant)
- Use royalty-free or self-generated imagery and icons (e.g., open-licensed icon sets). Keep an `ATTRIBUTIONS.md` for any third-party assets.
- Treat all sample employee/payroll data as **synthetic** (faker-generated). Never seed with real personal data.

---

## 3. Scope

### 3.1 In scope
1. **Public marketing site**: landing page + module pages + Resources/Partners/Compliance/FAQ/Contact, SEO-ready, responsive.
2. **Interactive guided demo**: a self-serve, click-through product tour (the "Take a Tour" equivalent) using mock data, no login required. Implemented in-app (see 6.4) rather than a third-party tool so it is part of our codebase.
3. **The application (multi-tenant SaaS)** with four modules:
   - **Operations Console**: payroll operators run end-to-end cycles.
   - **Insights**: self-serve analytics, dashboards, and report builder.
   - **MyHR**: employee self-service (payslips, leave, claims, profile).
   - **Assist**: AI assistant for L1 queries across the app.
4. **Platform services**: tenant management, authentication/SSO, RBAC, notifications, audit, document storage, integrations framework.
5. **Infrastructure**: full AWS environment as code (Terraform), CI/CD, observability, DR.

### 3.2 Out of scope (v1, explicitly deferred)
- Real statutory/tax compliance engines for 150+ countries (we build the **framework** + 2–3 reference country rule packs, e.g. US, UK, IN, as pluggable modules, not full legal coverage).
- Native mobile apps (the web app is responsive/PWA-ready instead).
- Production HCM/ERP connectors (we build the **integration framework** + mock connectors).
- Real banking/payment disbursement (we generate bank files / mock the payment gateway).

> These deferrals keep v1 achievable while leaving clean extension points. Section 11 Phase 7 lists the extension hooks.

---

## 4. Personas & roles (RBAC)

| Role | Module access | Representative permissions |
|---|---|---|
| **Super Admin** (platform) | All tenants (platform plane) | Manage tenants, plans, feature flags, platform health |
| **Tenant Admin** | All tenant modules | Manage org structure, users, roles, integrations, settings |
| **Payroll Operator** | Operations Console, Insights | Configure pay groups, run cycles, resolve anomalies, approve, publish payslips |
| **Payroll Approver** | Operations Console | Review & approve/reject payroll runs (maker-checker) |
| **HR Manager** | MyHR (team), Insights | Approve leave/claims, view team analytics |
| **Employee** | MyHR, Assist | View payslips, apply leave/claims, update permitted profile fields |
| **Auditor** (read-only) | All, read-only | Read data + full audit trail, no mutations |

RBAC is **role + scope** (scope = tenant, and optionally legal-entity / pay-group). Enforce on the server for every request; never trust the client. Maker-checker (segregation of duties) is mandatory for payroll publish.

---

## 5. Product modules: feature breakdown

### 5.1 Operations Console (payroll operator hub)
End-to-end payroll processing in one workspace:
- **Pay cycle setup**: pay groups, pay periods, calendars, pay elements (earnings/deductions), formulas.
- **Inputs**: bulk upload (CSV/XLSX) with validation, manual adjustments, variable pay imports, integration inputs.
- **Pre-payroll checks**: input validation, missing-data flags, integration error queue.
- **Run engine**: calculate gross→net, apply pay elements + country rule pack, proration, arrears, retro.
- **Anomaly detection**: variance vs prior period, threshold rules, outlier flags requiring sign-off.
- **Approvals**: maker-checker workflow, audit-logged, with comments.
- **Outputs**: payslip generation (PDF), bank/disbursement file export, GL/journal export, statutory report stubs.
- **Reprocessing**: off-cycle runs, corrections, rollback of an unpublished run.

### 5.2 Insights (analytics & DIY report builder)
- Prebuilt dashboards: headcount, total cost to company, salary distribution, leave summary, overtime, period-over-period trends.
- **Report builder**: pick dimensions/measures, filter, group, pivot; no SQL required.
- Export to XLSX/CSV/PDF; schedule recurring reports (email/notification).
- Drill-down from chart → underlying records (respecting RBAC scope).
- Data served from a read-optimized reporting store (see architecture doc), not the OLTP hot path.

### 5.3 MyHR (employee self-service)
- Dashboard: latest payslip, leave balance, pending tasks, announcements.
- Payslips: list + PDF download, YTD summaries, tax documents.
- Leave: balances, apply/cancel, approval status, team calendar.
- Claims/reimbursements: submit with attachments, track status.
- Profile: view/update permitted fields (with approval workflow for sensitive fields).
- Notifications & tasks inbox.

### 5.4 Assist (AI assistant)
- In-app chat assistant for L1 queries ("when is payday?", "what's my leave balance?", "how do I apply for a claim?").
- **Retrieval-augmented**: answers from (a) tenant policy docs/FAQs and (b) the user's own permitted data via scoped, audited tool calls, never cross-tenant, never beyond the caller's RBAC scope.
- Escalation to a human/ticket when confidence is low or action is sensitive.
- Pluggable LLM provider (Amazon Bedrock by default; provider-abstraction so it can be swapped). All prompts/responses audit-logged with PII handling rules.

### 5.5 Platform / cross-cutting
- **Tenant management**: provision/suspend tenants, plans, feature flags, per-tenant config & branding.
- **AuthN**: email/password + TOTP MFA, plus enterprise **SSO via SAML/OIDC**; SCIM user provisioning (Phase 7).
- **Org model**: legal entities, departments, locations, pay groups, cost centers, reporting lines.
- **Notifications**: email (SES) + in-app; templated, localized.
- **Documents**: encrypted object storage for payslips, attachments, policy docs.
- **Audit**: immutable, queryable audit log of every sensitive action (who/what/when/where/before→after).
- **Integrations framework**: typed connector interface, inbound/outbound, webhooks, idempotent jobs.
- **i18n / l10n**: multi-language UI, multi-currency, locale-aware dates/numbers.

---

## 6. Application architecture (app-level)

> Infrastructure (VPC, ECS, Aurora, etc.) lives in [`docs/aws-architecture.md`](docs/aws-architecture.md). This section is the application shape.

### 6.1 Stack
- **Language:** TypeScript end-to-end.
- **Frontend & marketing:** **Next.js (App Router)** + React + Tailwind CSS + shadcn/ui. SSR/SSG for marketing & SEO; client/server components for the app.
- **API:** **NestJS** (Node, TypeScript) REST services: modular, DI, OpenAPI auto-gen. (Alternative considered: tRPC for internal type-safety; REST chosen for external/integration friendliness + OpenAPI.)
- **Async workers:** Node workers consuming SQS (payroll runs, report generation, notifications, integrations).
- **Data:** PostgreSQL (Aurora) via **Prisma** ORM; **Redis** (ElastiCache) for cache/session/rate-limit; **S3** for documents; reporting reads from replicas / a denormalized schema.
- **AuthN/AuthZ:** Auth service issuing short-lived JWT access + rotating refresh tokens; **CASL**-style policy layer for RBAC; SSO via SAML/OIDC.
- **Validation/contracts:** Zod at the edges; OpenAPI as the source of truth for the API; shared types package.

### 6.2 Service decomposition (deploy as separate ECS Fargate services)
Start as a **modular monolith API** that is *already split into bounded modules*, deployed initially as 2–3 services, and carved into more services as load dictates. Bounded contexts:
1. `identity`: auth, users, tenants, RBAC, SSO.
2. `org`: legal entities, structure, employees (employment records).
3. `payroll`: pay elements, cycles, calculation engine, approvals, outputs.
4. `time-leave`: leave, claims, attendance inputs.
5. `insights`: reporting/analytics read APIs + report builder.
6. `assist`: AI assistant orchestration.
7. `notifications`, `documents`, `integrations`, `audit`: supporting services.
8. `worker-*`: async job processors per domain.

> **Why modular-monolith-first:** preserves clean boundaries (so extraction to microservices is mechanical later) without paying microservice operational overhead on day one. The ECS task definitions and ALB routing in the architecture doc support both shapes.

### 6.3 The payroll calculation engine (the crown jewels)
- Deterministic, **pure-function** calculation core (no I/O) so it is unit-testable and reproducible.
- **Country rule packs** as versioned, pluggable strategies (interface: `EarningsRules`, `DeductionRules`, `StatutoryRules`). Ship US/UK/IN reference packs.
- **Pay elements** are data-driven (formula expressions evaluated in a sandbox), not hard-coded.
- Every run is **versioned and immutable** once published; corrections create new versions. Full input snapshot stored for reproducibility/audit.
- Runs execute as **idempotent async jobs** (SQS + worker), chunked per employee for horizontal scale; orchestration via Step Functions for multi-stage runs (validate → calculate → review → publish).

### 6.4 Interactive demo ("Take a Tour")
- A `/demo` experience in the Next.js app: a scripted, step-by-step overlay (spotlight + tooltips, e.g. `react-joyride`-style) driving a **seeded, read-only mock tenant** with synthetic data.
- Two starter tours mirroring the reference: an **MyHR/ESS tour** and an **Insights dashboard tour**. Tours are JSON-defined (steps, target selectors, copy) so non-engineers can add tours.
- No auth, no real data, isolated `demo` tenant; resettable.

---

## 7. Monorepo structure

Use a **pnpm + Turborepo** monorepo so app, services, and shared contracts live together with cached builds.

```
repo/
├── apps/
│   ├── web/                 # Next.js: marketing site + authenticated app + /demo
│   └── api/                 # NestJS gateway (or modular monolith entry)
├── services/               # bounded-context services (extracted from api as needed)
│   ├── identity/
│   ├── org/
│   ├── payroll/
│   ├── time-leave/
│   ├── insights/
│   ├── assist/
│   ├── notifications/
│   ├── documents/
│   ├── integrations/
│   └── audit/
├── workers/                # SQS consumers (payroll-runner, report-gen, notifier, integrator)
├── packages/
│   ├── contracts/          # OpenAPI + generated TS clients/types (source of truth)
│   ├── domain/             # shared domain types, value objects
│   ├── payroll-core/       # pure calculation engine + country rule packs
│   ├── rbac/               # policy definitions & enforcement helpers
│   ├── ui/                 # shared React component library (shadcn-based)
│   ├── db/                 # Prisma schema, migrations, seed (synthetic data)
│   └── config/             # shared eslint/tsconfig/tailwind/test presets
├── infra/                  # Terraform (see docs/aws-architecture.md §12)
│   ├── modules/
│   └── envs/{dev,staging,prod}/
├── .github/workflows/      # CI/CD pipelines
├── docs/
│   ├── aws-architecture.md
│   ├── data-model.md
│   └── adr/                # architecture decision records
├── CLAUDE.md
└── PLAN.md
```

---

## 8. Data model (core entities)

Multi-tenancy strategy: **shared database, shared schema, mandatory `tenant_id` on every tenant-owned row**, enforced by (a) Prisma middleware that injects/asserts `tenant_id`, and (b) **PostgreSQL Row-Level Security** policies as defense-in-depth. (Large/regulated tenants can be promoted to a dedicated schema or database later; keep the data-access layer tenant-strategy-agnostic.)

Core entities (non-exhaustive; full ERD in `docs/data-model.md`, authored in Phase 1):

- **Platform plane:** `Tenant`, `Plan`, `Subscription`, `FeatureFlag`, `PlatformUser`.
- **Identity:** `User`, `Credential`, `Role`, `Permission`, `UserRole`, `Session`, `SsoConnection`, `ApiKey`.
- **Org:** `LegalEntity`, `Department`, `Location`, `CostCenter`, `Employee`, `EmploymentRecord`, `CompensationRecord`, `BankAccount` (encrypted).
- **Payroll:** `PayGroup`, `PayCalendar`, `PayPeriod`, `PayElement`, `PayElementFormula`, `PayrollRun`, `PayrollRunLine` (per-employee result), `PayslipDocument`, `Approval`, `Anomaly`, `CountryRulePackVersion`.
- **Time & leave:** `LeaveType`, `LeaveBalance`, `LeaveRequest`, `ClaimType`, `Claim`, `Attachment`.
- **Insights:** `ReportDefinition`, `ReportSchedule`, `DashboardConfig` (reads come from replicas / reporting schema).
- **Cross-cutting:** `Notification`, `Document`, `Integration`, `IntegrationRun`, `Webhook`, `AuditEvent` (append-only).

Conventions: UUID v7 PKs, `created_at/updated_at/created_by/updated_by`, soft-delete where audit requires it, money stored as integer **minor units + currency code** (never floats), all timestamps UTC.

---

## 9. API surface (representative)

REST, versioned under `/api/v1`, OpenAPI-described, JWT-authenticated, tenant-scoped. Examples:

```
POST   /api/v1/auth/login | /auth/refresh | /auth/mfa/verify
GET    /api/v1/me
POST   /api/v1/tenants                         (platform)
GET    /api/v1/employees?dept=&status=         (paginated, scoped)
POST   /api/v1/payroll/pay-groups
POST   /api/v1/payroll/runs                    (create+enqueue a run)
GET    /api/v1/payroll/runs/{id}               (status, totals, anomalies)
POST   /api/v1/payroll/runs/{id}/approve|reject|publish
GET    /api/v1/payroll/runs/{id}/payslips/{employeeId}.pdf
POST   /api/v1/leave/requests | /claims
GET    /api/v1/insights/reports/{id}/run
POST   /api/v1/assist/messages                 (RAG + scoped tool calls)
GET    /api/v1/audit/events?actor=&entity=
```

Cross-cutting API rules: pagination (cursor), idempotency keys on all POSTs that create money/jobs, rate limiting per tenant + per user, consistent error envelope, request-id propagation, field-level authorization.

---

## 10. Non-functional requirements

| Area | Target |
|---|---|
| **Availability** | 99.9% app SLO (multi-AZ, ≥2 tasks/service, rolling/blue-green deploys, no single AZ dependency) |
| **Scalability** | Stateless services autoscale on CPU/RPS/queue-depth; payroll runs chunked & parallel; reads off replicas; designed to 10× users without re-architecture |
| **Performance** | Marketing LCP < 2.5s; app API p95 < 300ms for reads, < 800ms for writes; a 10k-employee payroll run completes < 10 min |
| **Security** | Encryption in transit (TLS1.2+) & at rest (KMS) everywhere; least-privilege IAM; secrets in Secrets Manager; WAF; MFA; full audit; see architecture §7 |
| **Compliance posture** | Designed toward SOC 2 / ISO 27001 controls + GDPR data-subject rights; data-residency-ready via per-region deployment; DPA-friendly data handling |
| **Recoverability** | RPO ≤ 5 min (Aurora continuous backup/PITR), RTO ≤ 1 hr; automated, tested restores |
| **Observability** | Centralized logs/metrics/traces, actionable alarms, dashboards, audit trail |
| **Accessibility** | WCAG 2.1 AA for the app & marketing site |

---

## 11. Delivery phases & milestones

Each phase ends with working, tested, deployable software and explicit **acceptance criteria (AC)**. Estimates assume one focused Claude Code workstream; adjust as needed.

### Phase 0: Foundations (week 1)
Monorepo (pnpm+Turborepo), TypeScript/ESLint/Prettier presets, shared `config` package, commit hooks, base CI (lint+typecheck+test), `CLAUDE.md`, ADR folder. Skeleton `web` and `api` apps that build and run locally via Docker Compose (Postgres+Redis+LocalStack).
**AC:** `pnpm dev` boots web+api+deps; CI green on a trivial PR; ADR-0001 records the stack decision.

### Phase 1: Platform core, identity, tenancy, data spine (weeks 2–4)
Prisma schema + migrations for identity/tenant/org; `docs/data-model.md` ERD; tenant context middleware + Postgres RLS; auth (login, refresh, TOTP MFA); RBAC policy layer; audit log primitive; synthetic seed. Marketing site shell + design system.
**AC:** create tenant → invite user → login with MFA → role-gated `GET /me`; cross-tenant access is provably blocked (test); every mutation writes an audit event.

### Phase 2: Org & employee management (week 5)
Legal entities, departments, locations, cost centers, employees, employment & compensation records; bulk employee import (CSV/XLSX) with validation; MyHR profile views.
**AC:** import 1,000 synthetic employees with validation errors surfaced; employee can view their profile; org tree renders.

### Phase 3: Payroll engine (weeks 6–9) ⟵ *highest-risk, most value*
`payroll-core` pure engine + formula sandbox; data-driven pay elements; US/UK/IN reference rule packs; pay groups/calendars/periods; run orchestration (Step Functions + SQS workers, chunked); anomaly detection; maker-checker approvals; payslip PDF generation; bank/GL file export.
**AC:** configure a pay group, run a cycle on 10k synthetic employees, review anomalies, approve via second user, publish, download a payslip PDF and a bank file; engine has ≥90% unit coverage and golden-master tests per rule pack; rerun is deterministic.

### Phase 4: Time, leave & claims (week 10)
Leave types/balances/requests with approval workflow; claims with attachments; feed approved variable inputs into payroll.
**AC:** employee applies leave → manager approves → balance updates → appears as payroll input; claim with attachment flows end-to-end.

### Phase 5: Insights (weeks 11–12)
Reporting reads off replicas/denormalized schema; prebuilt dashboards; DIY report builder (dimensions/measures/filters); export + scheduled reports; RBAC-scoped drill-down.
**AC:** build a custom headcount-by-department report without code, export XLSX, schedule it; dashboards load p95 < 1s on 10k-employee dataset.

### Phase 6: Assist (AI) + interactive demo (week 13)
Bedrock-backed assistant with RAG over tenant FAQ/policy docs + scoped, audited data tools; escalation path; `/demo` guided tours (MyHR + Insights) on an isolated synthetic tenant.
**AC:** assistant answers "what's my leave balance?" using only the caller's scoped data (verified no cross-tenant leakage); demo tour runs end-to-end with no login.

### Phase 7: Hardening, integrations framework, launch readiness (weeks 14–16)
SSO (SAML/OIDC) + SCIM; integrations framework + one mock HCM connector + webhooks; i18n/l10n + multi-currency polish; accessibility audit; performance/load testing; security review & threat model; runbooks; DR game-day; full Well-Architected review.
**AC:** SSO login works against a test IdP; load test sustains target RPS with autoscaling; pen-test/automated-scan high findings = 0; documented, *tested* restore meets RPO/RTO; WAF rules tuned.

> **Infra is built in parallel from Phase 0**, not at the end. See architecture doc §12 for the Terraform delivery sequence (network → data → compute → edge → pipelines), which should track these app phases.

---

## 12. Testing strategy

- **Unit** (Vitest/Jest): pure logic, especially `payroll-core` (golden-master per rule pack, property-based tests for formula evaluation).
- **Integration** (Testcontainers: Postgres+Redis+LocalStack): repository, RLS, queue, S3 behaviors.
- **Contract** (OpenAPI + generated clients; Pact for inter-service): API stays in sync with consumers.
- **E2E** (Playwright): critical journeys: onboarding, login+MFA, run+approve+publish payroll, leave→payroll, build report, demo tour.
- **Security**: SAST (CodeQL/Semgrep), dependency scan (Dependabot/Snyk), container scan (ECR/Trivy), IaC scan (tfsec/Checkov), secret scan (gitleaks), DAST against staging.
- **Load** (k6): payroll-run throughput, API p95, autoscaling behavior.
- **Multi-tenant isolation tests** are a first-class, non-negotiable suite.
- **Definition of done** for every feature: tests written, RBAC enforced, audit events emitted, OpenAPI updated, telemetry added, docs/ADR updated.

---

## 13. CI/CD (summary; full pipeline in architecture §9)

- **CI** (GitHub Actions): on PR → install (cached) → lint → typecheck → unit+integration → build → SAST/dep/IaC/secret scans → preview where feasible. Branch protection requires green + review.
- **CD**: on merge to `main` → build & scan container images → push to **ECR** → Terraform plan (gated) → deploy to **staging** → smoke/E2E → manual approval → **blue/green** to prod via CodeDeploy. Auto-rollback on alarms.
- **Auth to AWS** via GitHub OIDC (no long-lived keys). DB migrations run as a gated, reversible step before app rollout.

---

## 14. Environments

`dev` → `staging` → `prod`, ideally **separate AWS accounts** (AWS Organizations) for blast-radius isolation; identical Terraform, per-env tfvars. Ephemeral PR preview environments optional (namespaced ECS services or a lightweight stack). Synthetic data only outside prod; prod has no copied real data into lower envs.

---

## 15. Assumptions & risks

- **Assumption:** v1 ships reference compliance packs (US/UK/IN), not full 150-country coverage. **Risk:** statutory complexity is underestimated → mitigate with the pluggable rule-pack interface and golden-master tests; bring a payroll SME for any country you actually launch.
- **Risk:** multi-tenant data leakage → mitigate with RLS + middleware + dedicated isolation test suite + auditor role.
- **Risk:** payroll correctness → deterministic pure engine, immutable versioned runs, maker-checker, full input snapshots, reconciliation reports.
- **Risk:** PII/regulatory exposure → encryption everywhere, field-level encryption for bank/tax IDs, data-subject tooling, least privilege, audit.
- **Risk:** scope creep from "clone everything" → stick to phased AC; defer per Section 3.2.
- **Assumption:** Bedrock available in target region for Assist; otherwise swap provider via the abstraction.

---

## 16. First actions for Claude Code

1. Read [`CLAUDE.md`](CLAUDE.md) and [`docs/aws-architecture.md`](docs/aws-architecture.md).
2. Execute **Phase 0** exactly; open a PR; get CI green.
3. Write `docs/adr/0001-stack.md` capturing the stack decisions in Sections 6–7.
4. Start **Phase 1**; in parallel, scaffold `infra/` network + remote state per architecture §12.
5. Do not begin a later phase until the prior phase's acceptance criteria pass in CI.
```
