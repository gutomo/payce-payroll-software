# ADR-0002 — Payroll calculation engine (`packages/payroll-core`)

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §6.3, §11 (Phase 3) · [`CLAUDE.md`](../../CLAUDE.md) · [ADR-0001](0001-stack.md)

## Context

Phase 3 builds the payroll calculation engine — "the crown jewels" (`PLAN.md` §6.3). Correctness here
is non-negotiable: wrong numbers mean wrong pay. The engine must be deterministic and reproducible
(`rerun is deterministic`, `≥90% unit coverage`, `golden-master tests per rule pack` — Phase 3 AC), and
it touches a guardrail area (payroll calculation, money), so we favor the conservative, well-tested design.

This ADR records the design of the **pure core** (`packages/payroll-core`). It is deliberately scoped to
the calculation kernel; the orchestration (SQS workers, Step Functions, chunking), persistence
(immutable versioned `PayrollRun`/`PayrollRunLine` rows), anomaly detection, maker-checker approvals, and
PDF/bank-file outputs are separate Phase 3 slices that *consume* this package.

## Decision

**Pure, no-I/O kernel.** `payroll-core` is a pure-function library — no DB, network, clock, randomness, or
environment access. Given the same inputs it returns the same outputs, which makes it exhaustively
unit-testable and makes a published run reproducible from its stored input snapshot. (No `Date.now()`,
no `Math.random()`; any "as-of" date is passed in as data.)

**Money as integer minor units.** Amounts are integer **minor units** (e.g. cents) plus an ISO currency
code — never floats (CLAUDE.md money rule). All sums are integer-exact. The only place fractional values
arise is when a formula multiplies by a rate; the result is rounded back to an integer minor unit at the
**pay-element boundary** using an explicit rounding mode (default **HALF_UP**, away from zero — the common
payroll/statutory convention). Rounding mode is a parameter so rule packs can override per element.

**Data-driven pay elements via a sandboxed formula language.** Pay elements (earnings/deductions) are
*data*, not code: each carries a `formula` string evaluated against a numeric context. We ship a tiny
purpose-built expression language — number literals, the four arithmetic operators with standard
precedence, parentheses, unary minus, whitelisted functions (`min`, `max`, `round`, `floor`, `ceil`,
`abs`, `clamp`), and identifiers resolved from the context. It is implemented as a hand-written
tokenizer → recursive-descent parser → AST evaluator. **It never uses `eval`/`new Function`**, so a
formula cannot reach JavaScript, the filesystem, or any global — the only things it can name are the
context variables and whitelisted functions; anything else is a compile/eval error. Formulas compile once
and evaluate many times (per employee), which matters at 10k-employee scale.

**Ordered, data-driven evaluation.** Elements evaluate in their configured order. Each element's rounded
result is exposed to subsequent formulas under its `code`, alongside running `gross`, `deductions`, and
`earnings` totals. This lets a deduction reference `gross` or an earning reference `base` without a
general dependency graph; order is explicit and part of the configuration. Duplicate element codes are
rejected (ambiguous references).

**Pluggable country rule packs.** Statutory logic is a versioned, pluggable strategy
(`EarningsRules` / `DeductionRules` / `StatutoryRules` composed into a `CountryRulePack` carrying
`country` + `version`). The interface is defined here; the US/UK/IN reference packs and golden-master
fixtures land in subsequent slices. Versioning is explicit so a historical run reproduces under the rule
pack version it was computed with.

## Alternatives considered

- **Evaluate formulas with `new Function`/`eval` (or a JS sandbox like `vm2`/`isolated-vm`).** Fastest to
  build, but executes arbitrary JS — an injection and supply-chain risk on a money path, and heavier to
  make deterministic. A whitelisted mini-language is safe by construction and trivially deterministic.
- **`decimal.js` / `big.js` for money.** Robust, but integer minor units cover payroll needs with zero
  float exposure and no dependency; we round explicitly at element boundaries. Revisit if a rule pack
  needs sub-cent intermediate precision.
- **Full dependency-graph resolution between elements.** More flexible but more complex and easier to get
  subtly wrong; explicit ordering is sufficient and auditable for the reference packs.

## Consequences

- The engine is a leaf dependency: services/workers call it; it calls nothing. Persistence and
  orchestration wrap it.
- Reproducibility requires storing the **full input snapshot** (context + element definitions + rule pack
  version) with each run — enforced by the run-persistence slice, not this package.
- The formula language is intentionally minimal; new needs extend the whitelist via a reviewed change
  (and tests), never by opening up to arbitrary code.
- Rounding policy is centralized and explicit; changing a default is a reviewed decision because it moves
  real money.
