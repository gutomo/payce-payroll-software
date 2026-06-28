# Architecture Decision Records (ADRs)

Each ADR captures one significant, hard-to-reverse decision: its context, the choice, and the consequences.
Keep them short. Number them sequentially (`NNNN-title.md`). A superseded ADR stays in the repo and links
to the ADR that replaces it.

Status values: `Proposed` · `Accepted` · `Superseded by NNNN` · `Deprecated`.

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](0001-stack.md) | Stack & monorepo foundations | Accepted |
| [0002](0002-payroll-engine.md) | Payroll calculation engine (`packages/payroll-core`) | Accepted |
| [0003](0003-assist.md) | Assist (AI assistant) architecture & the interactive demo | Accepted |
| [0004](0004-integrations.md) | Integrations framework, connectors & webhooks | Accepted |
| [0005](0005-i18n.md) | Internationalization, localization & multi-currency | Accepted |
| [0006](0006-accessibility.md) | Accessibility (WCAG 2.1 AA) approach | Accepted |
| [0007](0007-infra-sso-waf-dr.md) | Phase 7 infra skeleton — enterprise SSO, WAF & cross-region DR | Accepted |
| [0008](0008-tf-state-and-ci-oidc.md) | Terraform remote-state backend & GitHub Actions OIDC CI roles | Accepted |
| [0009](0009-sso-login.md) | Enterprise SSO login (OIDC relying party + offline test IdP) | Accepted |
| [0010](0010-security-gates.md) | Security review, threat model & automated security gates | Accepted |
