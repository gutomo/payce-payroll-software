# ADR-0006: Accessibility (WCAG 2.1 AA) approach

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Platform engineering
- **Context docs:** [`PLAN.md`](../../PLAN.md) §10, §11 (Phase 7) · [`CLAUDE.md`](../../CLAUDE.md) · [ADR-0001](0001-stack.md) · [ADR-0005](0005-i18n.md)

## Context

`PLAN.md` §10 sets **WCAG 2.1 AA** for the app and marketing site, and Phase 7 includes an accessibility
audit. This ADR records the approach taken in the first a11y slice and a deliberate trade-off.

## Decision

**Automated a11y regression via axe-core, scoped to WCAG 2.1 A/AA.** A test suite renders representative
surfaces (marketing home, app header, MyHR profile card, the guided-tour dialog) and asserts zero axe
violations under the `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` tags. This makes accessibility a repeatable
CI gate, not a one-off manual pass. The `color-contrast` rule is **disabled in the test** because jsdom has
no layout/paint engine to evaluate it; contrast is instead handled by choosing AA-compliant tokens in the
components (e.g. helper text moved from `gray-400` ≈ 2.8:1 to `gray-500` ≈ 4.6:1). Structural rules (names,
roles, labels, ARIA, headings, dialog semantics) are fully enforced by the test.

**The guided-tour overlay is a real modal dialog.** It uses `role="dialog"` + `aria-modal`, is labelled by
its heading and described by its body, moves focus into itself on open and on each step change (so screen
readers announce the new step), traps Tab within itself, closes on Escape, and restores focus to the prior
element on close. This is the standard modal pattern; the tour is the one bit of rich interactive UI where
getting focus management wrong would strand keyboard/screen-reader users.

**Skip-to-content links** on every shell (marketing already had one; added to the app and demo shells), so
keyboard users can bypass the header nav.

## Deliberate trade-off: document `lang` stays static

Ideally `<html lang>` reflects the active locale (ADR-0005). But the locale is request data (cookie /
`Accept-Language`); reading it in the **root** layout would opt the entire site — including the static
marketing pages — into dynamic rendering, conflicting with the SSG/LCP NFR (`PLAN.md` §6.1, §10). We keep
the root `<html lang="en">` static (the document's default language) and accept that screen readers
announce non-English UI with the document default for now. Revisiting options (per-segment root layouts, or
a build-time language split) is deferred; the localized *content* and *formatting* already adapt (ADR-0005).

## Alternatives considered

- **Manual-only audit.** Rejected: not repeatable; regressions creep back. axe in CI catches the structural
  classes of issue continuously, with manual review for the rest.
- **A full a11y framework / browser-based axe (Playwright).** Deferred: jsdom + axe-core covers structural
  rules cheaply in the existing unit-test run. A browser pass (which would also cover real contrast and
  focus-visibility) can be added with the Phase 7 E2E/DAST work.
- **Deopting marketing to dynamic for `<html lang>`.** Rejected for now — see the trade-off above.

## Consequences

- Accessibility is gated in CI for the covered surfaces; new violations on them fail the build.
- The tour is keyboard- and screen-reader-operable.
- Colour contrast is not automatically verified (jsdom limit) — covered by token choices now and a browser
  pass later; and `<html lang>` is not yet per-locale, an accepted limitation traded against SSG.
