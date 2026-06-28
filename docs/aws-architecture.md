# AWS Architecture: Global Payroll SaaS

> Infrastructure design for the platform described in [`../PLAN.md`](../PLAN.md).
> **Compute:** ECS Fargate · **IaC:** Terraform · **Framework:** AWS Well-Architected (6 pillars).
> Targets: 99.9% availability, horizontal scale with user growth, payroll-grade security & compliance.
> See the [Well-Architected review](well-architected-review.md) for the current per-pillar self-assessment.

---

## 1. Design principles

1. **Everything as code:** no console changes; all infra in Terraform, all app in CI/CD.
2. **Multi-AZ by default, no single points of failure:** every tier spans ≥2 Availability Zones.
3. **Least privilege everywhere:** scoped IAM roles per service/task; no shared god-roles; no long-lived keys.
4. **Private by default:** workloads in private subnets; only the edge is public; data tier never internet-reachable.
5. **Encrypt in transit and at rest, always:** TLS 1.2+ end to end; KMS CMKs for all data stores.
6. **Stateless compute, durable state in managed services:** so any task can be replaced/scaled freely.
7. **Defense in depth:** WAF → ALB → service auth → app authZ → DB RLS; multiple independent layers.
8. **Design for 10×:** autoscaling, async decoupling, read/write separation, caching from day one.

---

## 2. High-level topology

```
                            Internet
                               │
                      ┌────────▼────────┐
                      │   Route 53      │  (DNS, health checks, failover)
                      └────────┬────────┘
                               │
                      ┌────────▼────────┐
                      │ CloudFront (CDN)│  ── ACM TLS, OAC ──► S3 (static/assets, payslips via signed URLs)
                      │  + AWS WAF       │
                      └────────┬────────┘
                               │ (HTTPS)
          ┌────────────────────▼─────────────────────┐  Region (e.g. us-east-1)
          │                  VPC                       │
          │  Public subnets (AZ-a / AZ-b / AZ-c)       │
          │    └── Application Load Balancer (ALB)      │
          │            │ path/host routing             │
          │  Private app subnets (AZ-a/b/c)            │
          │    ├── ECS Fargate: web (Next.js)          │
          │    ├── ECS Fargate: api / identity / org / │
          │    │     payroll / insights / assist ...    │
          │    └── ECS Fargate: workers (SQS consumers)│
          │  Private data subnets (AZ-a/b/c)          │
          │    ├── Aurora PostgreSQL (writer + replicas)│
          │    │     via RDS Proxy                      │
          │    ├── ElastiCache Redis (Multi-AZ)         │
          │    └── VPC endpoints (S3, ECR, Secrets,     │
          │          KMS, CloudWatch, SQS, Bedrock...)  │
          └────────────────────────────────────────────┘
              │            │            │           │
            SQS/SNS   Step Functions  Secrets Mgr   KMS
           EventBridge  (payroll)      + SES        + S3
```

Async/eventing, Step Functions, SQS, SES, Bedrock, etc. are regional managed services accessed from private subnets via VPC endpoints (no NAT egress for AWS APIs).

---

## 3. Network (VPC)

- **One VPC per environment** (`dev`/`staging`/`prod`), ideally per **separate AWS account** (Organizations) for blast-radius isolation. Non-overlapping CIDRs (e.g. `10.0.0.0/16`) to allow future peering.
- **Three subnet tiers across 3 AZs** (9 subnets):
  - **Public:** ALB + NAT gateways only.
  - **Private-app:** ECS Fargate tasks (web, services, workers). No public IPs.
  - **Private-data:** Aurora, ElastiCache, RDS Proxy. No route to the internet.
- **NAT gateways**: one per AZ in prod (HA); single NAT acceptable in dev (cost). Egress is restricted and primarily replaced by **VPC interface/gateway endpoints** for S3, ECR (api+dkr), Secrets Manager, KMS, CloudWatch Logs, SQS, SNS, STS, Bedrock, keeps AWS traffic on the AWS backbone, cheaper and more secure.
- **Security groups** are the primary firewall, referenced by SG-ID (not CIDR): ALB-SG → web/api-SG → data-SG, each allowing only the needed port from the specific upstream SG. NACLs as a coarse secondary layer.
- **No SSH / no bastion:** operational access via **SSM Session Manager** only (audited, keyless).

---

## 4. Compute: ECS Fargate

- **Why Fargate:** serverless containers, no EC2 to patch, per-task isolation, native multi-AZ, scales fast. Matches the "high availability + low ops + expandable" goal without EKS complexity.
- **One ECS service per bounded context** (web, identity, org, payroll, insights, assist, notifications, documents, integrations, audit, and `worker-*`), each with its own task definition, task IAM role, autoscaling policy, and ALB target group (workers have no target group).
- **Placement:** tasks spread across 3 AZs; minimum 2 tasks per service in prod (so an AZ loss never drops a service); `maximumPercent/minimumHealthyPercent` tuned for zero-downtime rolling deploys.
- **Autoscaling (Application Auto Scaling):**
  - Web/API services: **target tracking** on CPU (~60%) and ALB **requests-per-target**; step scaling for spikes.
  - Workers: scale on **SQS queue depth / age of oldest message** (backlog → more consumers) and scale to a low floor when idle.
  - Schedule-aware: pre-warm capacity around known payroll run windows (scheduled scaling).
- **Capacity providers:** `FARGATE` for steady baseline + **`FARGATE_SPOT`** for fault-tolerant workers/batch to cut cost (with on-demand fallback).
- **Health checks:** ALB health checks + ECS container health checks; unhealthy tasks are drained and replaced automatically.
- **Images:** built in CI, scanned, stored in **ECR** (immutable tags, scan-on-push, lifecycle policy to expire old images).

---

## 5. Data layer

### 5.1 Aurora PostgreSQL (primary OLTP)
- **Aurora PostgreSQL**, **Multi-AZ**: 1 writer + ≥1 reader in different AZs; storage is auto-replicated across 3 AZs.
- **RDS Proxy** in front for connection pooling (Fargate task churn) + faster failover + credentials from Secrets Manager.
- **Read replicas** serve Insights/reporting and heavy reads; app routes reads→replica, writes→writer.
- **Scaling path:** start with right-sized provisioned instances; **Aurora Auto Scaling** adds read replicas on load. (Aurora Serverless v2 is a viable alternative for spiky/unpredictable load; keep the option open.)
- **Backups:** continuous backup + **PITR**; automated snapshots retained per policy; **cross-region snapshot copy** for DR.
- **Encryption:** at rest with KMS CMK; in transit with TLS (enforced). **Row-Level Security** enforces tenant isolation at the engine.
- **Schema/migrations:** Prisma migrations run as a gated CI/CD step (expand/contract pattern, reversible).

### 5.2 ElastiCache for Redis
- Multi-AZ with automatic failover; used for session/token cache, rate limiting, hot-data cache, and ephemeral job coordination. Encryption in transit + at rest; AUTH token in Secrets Manager.

### 5.3 S3
- Buckets: `assets` (served via CloudFront OAC), `documents` (payslips/attachments, private, served via short-lived signed URLs), `reports`, `logs`, `tf-state`, `backups/exports`.
- All buckets: **Block Public Access on**, default **SSE-KMS**, versioning, lifecycle (transition to IA/Glacier, expire), access logging. Object Lock (WORM) on audit/payslip archives where retention/immutability is required.

### 5.4 Reporting/analytics
- Phase 5 reads from **read replicas** + a denormalized reporting schema. Future scale-out path: stream changes to **S3 + Athena/Redshift** for heavy analytics without touching OLTP. Keep the Insights data-access layer abstracted so this swap is non-breaking.

---

## 6. Edge, DNS, TLS

- **Route 53:** hosted zone, latency/failover routing, health checks. Enables future multi-region active-passive.
- **CloudFront:** CDN for the Next.js app + static assets; caches static, forwards dynamic to ALB; **Origin Access Control** to S3; TLS via **ACM**; HTTP/2+3; sensible cache policies (no-cache for authenticated API/HTML, long TTL for hashed assets).
- **AWS WAF** on CloudFront (and/or ALB): AWS Managed Rules (OWASP common, SQLi, bad inputs, IP reputation, anonymous-IP), per-tenant/IP **rate-based rules**, optional geo rules, bot control. Log to S3/CloudWatch.
- **AWS Shield Standard** included; consider **Shield Advanced** for prod DDoS protection + cost protection.

---

## 7. Security (defense in depth)

| Layer | Controls |
|---|---|
| **Identity & access (AWS)** | IAM Identity Center (SSO) for humans; **per-task IAM roles**, least privilege, no static keys; GitHub **OIDC** for CI; permission boundaries; regular Access Analyzer review |
| **Network** | Private subnets, SG-to-SG rules, no inbound except ALB, no bastion (SSM only), VPC endpoints, WAF, Shield |
| **App authN/Z** | Short-lived JWT + rotating refresh, **MFA (TOTP)**, enterprise **SSO (SAML/OIDC)**, RBAC + scope checks server-side, maker-checker for payroll |
| **Data protection** | KMS CMKs (per data class, key rotation on); TLS everywhere; **field-level encryption** for bank/tax IDs & other sensitive PII; tokenization where feasible; **multi-tenant isolation via Postgres RLS + app middleware** |
| **Secrets** | **AWS Secrets Manager** (DB creds, API keys, JWT signing keys) with rotation; **nothing** in env files or images; SSM Parameter Store for non-secret config |
| **Detection** | **GuardDuty** (threat detection), **Security Hub** (CIS/AWS FSBP conformance), **AWS Config** (drift/compliance rules), **CloudTrail** (org-wide, immutable, log-file validation) → central logging account |
| **Vuln management** | ECR scan-on-push + **Inspector**; SAST/DAST/dep/secret/IaC scans in CI (see PLAN §12); patch via image rebuilds (Fargate platform patched by AWS) |
| **Data lifecycle / privacy** | Data classification, retention policies, S3 Object Lock for immutable records, data-subject access/erasure tooling, audit of all PII access |
| **Compliance posture** | Control mapping toward **SOC 2 / ISO 27001**, **GDPR** data-subject rights, region-pinned deployments for **data residency**; Config conformance packs to evidence controls |

> **Threat model & security review** is an explicit Phase 7 deliverable, but these controls are built in from Phase 0. Security is not bolted on at the end.

---

## 8. Observability & operations

- **Metrics:** CloudWatch (ECS, ALB, Aurora, Redis, SQS, custom app/business metrics e.g. payroll-run duration, anomaly counts). Dashboards per service + a platform overview.
- **Logs:** structured JSON to CloudWatch Logs (and/or OpenSearch for search) with request-id/tenant-id correlation; sensitive fields redacted; shipped to a central logging account; retention + S3 archive.
- **Tracing:** OpenTelemetry → **AWS X-Ray** (or ADOT) for end-to-end request tracing across services and async hops.
- **Alarms:** SLO-based (availability, p95 latency, 5xx rate, queue age, DB CPU/connections, failover events) → SNS → PagerDuty/Slack/email. Composite alarms reduce noise. **Synthetic canaries** (CloudWatch Synthetics) probe critical journeys.
- **Runbooks & game-days:** documented runbooks per alarm; quarterly DR game-day; chaos/failure drills (AZ loss, task kill) before GA.

---

## 9. CI/CD pipeline

- **Source/CI:** GitHub + **GitHub Actions** (Turborepo remote cache). PR pipeline: install → lint → typecheck → unit+integration (Testcontainers) → build → **SAST (CodeQL/Semgrep) + dep scan + IaC scan (tfsec/Checkov) + secret scan (gitleaks)**. Branch protection: green checks + review required.
- **Build & publish:** build per-service container images, scan (Trivy/Inspector), push to **ECR** with immutable tags.
- **Deploy:** `terraform plan` (gated, posted to PR) → apply; app deploy to **staging** → smoke + Playwright E2E → manual approval → **blue/green to prod via AWS CodeDeploy** (ECS), with automatic rollback on CloudWatch alarms.
- **DB migrations:** run as a discrete, reversible, gated step (expand/contract) before app cutover.
- **Auth:** GitHub **OIDC → AWS role** (no stored cloud keys). Separate roles/accounts per environment.

---

## 10. Reliability & disaster recovery

- **In-region HA:** multi-AZ for every tier; ≥2 tasks/service; Aurora writer+reader across AZs; Multi-AZ Redis/NAT; automatic failover throughout. Survives a full AZ outage with no manual action.
- **Backups:** Aurora PITR (RPO ≤ 5 min) + daily snapshots; **cross-region snapshot/replica copy**; S3 versioning + cross-region replication for critical buckets; **AWS Backup** governs and tests restores centrally.
- **DR strategy:** **warm-standby / pilot-light in a second region** (Route 53 failover). Targets **RPO ≤ 5 min, RTO ≤ 1 hr**; Terraform makes the standby region reproducible. Restores are **tested** (a restore you haven't tested isn't a backup).
- **Resilience practices:** idempotent jobs + DLQs on every queue, circuit breakers/retries with backoff between services, graceful degradation (e.g. Assist offline ≠ payroll offline).

---

## 11. Cost optimization

- **Right-size + autoscale** (scale to a low floor off-hours; scale up for payroll windows). Avoid idle over-provisioning.
- **Fargate Spot** for workers/batch; **Compute Savings Plans** for steady baseline; **Aurora/RDS reserved or Serverless v2** as usage stabilizes.
- **VPC endpoints** to cut NAT data-processing costs; consolidate NAT in non-prod.
- **S3 lifecycle** (IA/Glacier) for logs, old payslips, exports; **CloudFront** offloads origin.
- **Cost guardrails:** AWS Budgets + anomaly detection; mandatory **tagging** (env, service, cost-center, tenant-tier) for showback; Trusted Advisor + Compute Optimizer reviews; per-env teardown of ephemeral stacks.

---

## 12. Terraform structure & delivery

### 12.1 Layout
```
infra/
├── modules/                  # reusable, single-responsibility modules
│   ├── network/              # VPC, subnets, NAT, endpoints, SGs
│   ├── ecs-cluster/          # cluster, capacity providers, exec/logging
│   ├── ecs-service/          # task def, service, autoscaling, target group  (parameterized, reused per service)
│   ├── alb/                  # ALB, listeners, WAF association
│   ├── aurora/               # cluster, instances, RDS Proxy, params
│   ├── elasticache/          # Redis replication group
│   ├── s3-bucket/            # hardened bucket (BPA, SSE-KMS, versioning, lifecycle)
│   ├── cloudfront/           # distribution, OAC, cache policies
│   ├── waf/                  # web ACL + rules
│   ├── messaging/            # SQS/SNS/EventBridge, DLQs
│   ├── stepfunctions/        # payroll orchestration
│   ├── observability/        # dashboards, alarms, log groups, canaries
│   ├── security/             # KMS keys, Secrets, GuardDuty/SecurityHub/Config
│   └── iam/                  # roles, policies, OIDC provider, boundaries
├── envs/
│   ├── dev/                  # backend.tf + *.tfvars + composition of modules
│   ├── staging/
│   └── prod/
└── global/                   # Route 53 zones, org-level CloudTrail, ECR, tf-state bootstrap
```

### 12.2 State & workflow
- **Remote state in S3 + native S3 state locking** (or DynamoDB lock table), one state per env, encrypted with KMS, versioned. Bootstrap (`global/`) creates state bucket, ECR, OIDC provider first.
- **One reusable `ecs-service` module** instantiated per bounded context; keeps services consistent and DRY.
- **Per-env tfvars**; no hardcoded secrets (pull from Secrets Manager / SSM data sources).
- **CI for infra:** `fmt` → `validate` → `tfsec`/`checkov` → `plan` (commented on PR) → manual-approved `apply`. Same OIDC-based auth as app CD.
- **Tagging policy** enforced via default tags on the AWS provider.

### 12.3 Build sequence (tracks PLAN.md phases)
1. **`global/` bootstrap:** state backend, ECR, OIDC, Route 53, org CloudTrail/Config (Phase 0).
2. **`network/`:** VPC, subnets, endpoints, SGs (Phase 0–1).
3. **`security/`:** KMS, Secrets, GuardDuty/SecurityHub/Config (Phase 1).
4. **Data:** Aurora, RDS Proxy, ElastiCache, S3 (Phase 1).
5. **Compute:** ECS cluster, ALB, first services + autoscaling (Phase 1, expand each phase).
6. **Edge:** CloudFront, WAF, ACM, DNS (Phase 1–2).
7. **Messaging/orchestration:** SQS/SNS/EventBridge, Step Functions (Phase 3).
8. **Observability:** dashboards, alarms, canaries (every phase; hardened Phase 7).
9. **DR:** cross-region backups + standby (Phase 7).

---

## 13. Well-Architected Framework: pillar mapping

### Operational Excellence
IaC for 100% of infra; CI/CD with automated tests, gated plans, blue/green + auto-rollback; structured observability, dashboards, SLO alarms, synthetic canaries; documented runbooks; ADRs; DR game-days; small, reversible, frequent deployments.

### Security
Least-privilege per-task IAM + OIDC (no static keys); private subnets, SG-to-SG, WAF, Shield, SSM-only access; KMS encryption at rest + TLS in transit + field-level encryption for sensitive PII; Secrets Manager with rotation; GuardDuty + Security Hub + Config + org CloudTrail; multi-tenant isolation via Postgres RLS + middleware + isolation test suite; SAST/DAST/dep/IaC/secret scanning in CI; threat model in Phase 7.

### Reliability
Multi-AZ on every tier, ≥2 tasks/service, automatic failover; autoscaling on demand signals; decoupling via SQS with DLQs + idempotency; Aurora PITR + cross-region backups; warm-standby DR with tested RPO≤5min/RTO≤1hr; health checks, circuit breakers, graceful degradation; tested restores and failure drills.

### Performance Efficiency
Fargate right-sized + target-tracking autoscaling; CloudFront edge caching; Redis hot-path cache; read replicas + denormalized reporting store separating reads from writes; chunked parallel payroll runs; async/event-driven for heavy work; selection of purpose-built managed services; load testing to validate p95 targets.

### Cost Optimization
Autoscaling to low floors + scheduled scaling for payroll windows; Fargate Spot for batch; Savings Plans / reserved / Aurora Serverless v2 for baseline; VPC endpoints to cut NAT cost; S3 lifecycle tiering; mandatory tagging + Budgets + anomaly detection + Compute Optimizer; ephemeral non-prod teardown.

### Sustainability
Scale-to-minimum and Spot reduce idle capacity and energy draw; serverless Fargate improves utilization vs idle EC2; efficient autoscaling and caching reduce compute per request; data lifecycle tiering moves cold data to lower-energy storage; right-sizing and region selection (lower-carbon regions where latency/residency allow) reduce footprint.

---

## 14. Future scaling levers (beyond v1)

- Extract hottest bounded contexts from the modular monolith into independent ECS services (the module boundaries make this mechanical).
- **Active-active multi-region** with per-region data residency for global tenants (Route 53 latency routing + regional data planes).
- Dedicated database/schema per very large or highly regulated tenant.
- Stream-based analytics (Kinesis/MSK → S3/Redshift) for Insights at scale.
- Cell-based architecture to cap blast radius as tenant count grows.
```
