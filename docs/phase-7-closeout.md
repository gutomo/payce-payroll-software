# Phase 7 closeout — hardening, integrations & launch readiness

**Date:** 2026-06-28 · **Phase:** 7 (PLAN.md §11) · **Status:** no-AWS scope complete; remaining items are
account-gated (the deploy phase).

Phase 7 hardens the platform and adds the launch-readiness capabilities. This note records what shipped,
how it maps to the phase acceptance criteria, and exactly what is left — which requires a provisioned AWS
account and therefore was held behind the project's "no live apply / no real cloud cost" stance.

## What shipped

| Theme                  | Delivered                                                                                        | PR                                                              | ADR                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------- |
| Integrations framework | Connector framework + mock HCM connector + idempotent runs + signed webhooks                     | [#9](https://github.com/gutomo/payce-payroll-software/pull/9)   | [0004](adr/0004-integrations.md)         |
| i18n / l10n            | Intl-based formatting, locale negotiation, multi-currency                                        | [#10](https://github.com/gutomo/payce-payroll-software/pull/10) | [0005](adr/0005-i18n.md)                 |
| Accessibility          | WCAG 2.1 AA pass + axe CI gate                                                                   | [#11](https://github.com/gutomo/payce-payroll-software/pull/11) | [0006](adr/0006-accessibility.md)        |
| Security/DR infra      | Terraform modules: WAF, Cognito SSO broker, AWS Backup cross-region DR                           | [#12](https://github.com/gutomo/payce-payroll-software/pull/12) | [0007](adr/0007-infra-sso-waf-dr.md)     |
| State + CI auth        | Remote-state backend (S3+KMS+DynamoDB), GitHub OIDC plan/apply roles, `terraform` CI             | [#13](https://github.com/gutomo/payce-payroll-software/pull/13) | [0008](adr/0008-tf-state-and-ci-oidc.md) |
| Enterprise SSO login   | OIDC relying party (PKCE/nonce/state) + offline test IdP; JIT provisioning                       | [#14](https://github.com/gutomo/payce-payroll-software/pull/14) | [0009](adr/0009-sso-login.md)            |
| Security review        | STRIDE [threat model](security/threat-model.md) + CI gates (CodeQL, gitleaks, dependency review) | [#15](https://github.com/gutomo/payce-payroll-software/pull/15) | [0010](adr/0010-security-gates.md)       |
| Load testing           | k6 harness ([`load/`](../load/)) with SLO thresholds + profiles                                  | [#16](https://github.com/gutomo/payce-payroll-software/pull/16) | [0011](adr/0011-load-testing.md)         |
| Well-Architected       | Six-pillar [self-assessment](well-architected-review.md)                                         | [#17](https://github.com/gutomo/payce-payroll-software/pull/17) | —                                        |
| SAML + SCIM            | SAML provider kind (Cognito-brokered) + SCIM 2.0 user provisioning (JML)                         | [#18](https://github.com/gutomo/payce-payroll-software/pull/18) | [0012](adr/0012-saml-scim.md)            |

Every PR shipped with tests (including tenant-isolation assertions), server-side authZ, audit events,
and docs/ADRs, and merged green through the CI gates (lint/typecheck/test/build, integration+RLS,
Terraform fmt/validate/tfsec, and SAST/secret/SCA).

## Acceptance criteria (PLAN.md §11)

| AC                                             | Status        | Notes                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSO login works against a test IdP             | ✅ **Met**    | Full offline-IdP login is CI-verified ([#14](https://github.com/gutomo/payce-payroll-software/pull/14)); real OIDC path unit-tested; SAML/SCIM added ([#18](https://github.com/gutomo/payce-payroll-software/pull/18)) |
| Pen-test / automated-scan high findings = 0    | ◑ **Partial** | SAST (CodeQL) + secret (gitleaks) + SCA gates green; **DAST against staging pending** (needs a deployed env)                                                                                                           |
| Documented, _tested_ restore meets RPO/RTO     | ◑ **Partial** | DR module + [restore runbook](runbooks/dr-restore.md) designed to RPO≤5m/RTO≤1h; **game-day not yet run** (needs real infra)                                                                                           |
| Load test sustains target RPS with autoscaling | ◑ **Partial** | k6 harness + SLO thresholds ready ([#16](https://github.com/gutomo/payce-payroll-software/pull/16)); **baseline + autoscaling unproven** (single local instance ≠ prod)                                                |
| WAF rules tuned                                | ◑ **Partial** | WAF module with managed rules + rate limiting validated; **not yet applied/tuned against real traffic**                                                                                                                |

The four partials share one blocker: **no production AWS environment exists yet.** The code and IaC are
written and validated; they have not been _applied_.

## Remaining (the deploy phase — account-gated)

These need a real AWS account and incur real cost, so they start the provisioning/deploy phase:

1. **Provision accounts & apply Terraform** — bootstrap remote state, then `global` + `envs/staging`
   (WAF, Cognito, DR) via the CI OIDC apply role; enable the dormant `plan` job and make tfsec blocking.
2. **Stand up the runtime** — multi-AZ Aurora + Fargate, ALB/CloudFront, autoscaling, CloudWatch
   dashboards/alarms, CD (ECR → plan/apply → blue/green).
3. **Wire real SSO** — a live Cognito pool, OIDC client secret from Secrets Manager, SAML metadata +
   SCIM token rotation against a real IdP.
4. **Prove the ACs** — run the **DR game-day** (measure RPO/RTO), **DAST** against staging, and a **k6
   load baseline** with autoscaling; tune WAF on observed traffic.

See the [Well-Architected review](well-architected-review.md) for the full per-pillar gap list and the
[threat model](security/threat-model.md) for the residual-risk register.

## Bottom line

Phase 7's application and infrastructure-as-code scope is **complete and green**. What remains is
**deployment**: applying the validated IaC to a real account and exercising the runtime ACs there.
