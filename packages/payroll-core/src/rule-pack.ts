import type { PayslipLine } from "./calculate";

/**
 * Country rule packs (ADR-0002): statutory logic as versioned, pluggable strategies. Unlike
 * data-driven pay elements (simple formulas), statutory rules — progressive brackets, capped
 * contributions, YTD-dependent logic — are real code, so they live in a pack rather than a formula.
 *
 * A pack exposes three strategies (`EarningsRules`, `DeductionRules`, `StatutoryRules`) run in that
 * order by {@link runPayroll}. Each returns payslip lines computed from the {@link RulePackContext}.
 * Packs are pure: same context in, same lines out. Versioning is explicit so a historical run
 * reproduces under the pack version it was computed with.
 */

/** Per-employee statutory facts a pack needs beyond gross pay. */
export interface StatutoryInput {
  /** Pay periods in the year — used to annualize/de-annualize bracket tables (12 monthly, 26 biweekly…). */
  periodsPerYear: number;
  /** YTD wages before this period, for wage-base caps (e.g. US Social Security). Minor units. */
  ytdWagesMinor?: number;
  /** Pre-tax deductions this period that reduce taxable income (e.g. 401(k)). Minor units. */
  preTaxMinor?: number;
  /** Filing status / region selector understood by the pack. */
  filingStatus?: string;
}

export interface RulePackContext {
  currency: string;
  /** Gross pay for the period (sum of earnings), minor units. */
  grossMinor: number;
  /** Taxable income for the period (gross − pre-tax deductions), minor units. */
  taxableMinor: number;
  input: StatutoryInput;
}

/** Rule-pack-defined earnings (statutory top-ups, etc.). */
export interface EarningsRules {
  (ctx: RulePackContext): PayslipLine[];
}
/** Pre-tax statutory deductions (e.g. a mandatory pension). */
export interface DeductionRules {
  (ctx: RulePackContext): PayslipLine[];
}
/** Taxes and statutory contributions (income tax, social security, medicare…). */
export interface StatutoryRules {
  (ctx: RulePackContext): PayslipLine[];
}

export interface CountryRulePack {
  /** ISO 3166-1 alpha-2 country code, uppercase. */
  country: string;
  /** Pack version, e.g. "2026.0". A run records this for reproducibility. */
  version: string;
  /** Currency the pack computes in; must match the run currency. */
  currency: string;
  earnings: EarningsRules;
  deductions: DeductionRules;
  statutory: StatutoryRules;
}

/** A progressive tax bracket: `rate` applies to the slice of income from `fromMinor` up to the next
 *  bracket's `fromMinor` (or +∞ for the last). Brackets must be ascending by `fromMinor`. */
export interface TaxBracket {
  fromMinor: number;
  rate: number;
}

/**
 * Progressive tax over ascending brackets. Returns the (possibly fractional) tax in minor units; the
 * caller rounds. Each bracket's rate applies only to the portion of `amountMinor` within that band.
 */
export function bracketTax(amountMinor: number, brackets: readonly TaxBracket[]): number {
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const band = brackets[i] as TaxBracket;
    if (amountMinor <= band.fromMinor) break;
    const upper = i + 1 < brackets.length ? (brackets[i + 1] as TaxBracket).fromMinor : Infinity;
    const slice = Math.min(amountMinor, upper) - band.fromMinor;
    if (slice > 0) tax += slice * band.rate;
  }
  return tax;
}
