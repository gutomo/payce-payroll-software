import type { PayslipLine } from "../calculate";
import { roundToMinor } from "../money";
import {
  bracketTax,
  type CountryRulePack,
  type RulePackContext,
  type TaxBracket,
} from "../rule-pack";

/**
 * US reference rule pack — a *synthetic, illustrative* model of federal withholding, NOT tax advice
 * and NOT the authoritative IRS schedule. It exists to exercise the pluggable-rule-pack design and
 * provide a golden-master target. It models three statutory deductions:
 *
 * - **Federal income tax** via the annualized percentage method: annualize the period's taxable pay,
 *   subtract the standard deduction, apply progressive brackets, then divide back by the pay frequency.
 * - **Social Security** at a flat rate up to an annual wage-base cap (using YTD wages to stop at the cap).
 * - **Medicare** at a flat, uncapped rate (the additional-Medicare surtax is intentionally omitted).
 *
 * All constants below are round, made-up figures — replace with a maintained, dated statutory table
 * (and bring a payroll SME) before any real use.
 */

const SS_RATE = 0.062;
const SS_WAGE_BASE_MINOR = 18_000_000; // $180,000 annual cap (illustrative)
const MEDICARE_RATE = 0.0145;

const STANDARD_DEDUCTION_MINOR: Record<FilingStatus, number> = {
  single: 1_500_000, // $15,000 (illustrative)
  married: 3_000_000, // $30,000 (illustrative)
};

// Annual progressive brackets (illustrative), in minor units (cents).
const BRACKETS: Record<FilingStatus, TaxBracket[]> = {
  single: [
    { fromMinor: 0, rate: 0.1 },
    { fromMinor: 1_100_000, rate: 0.12 },
    { fromMinor: 4_472_500, rate: 0.22 },
    { fromMinor: 9_537_500, rate: 0.24 },
    { fromMinor: 18_210_000, rate: 0.32 },
    { fromMinor: 23_125_000, rate: 0.35 },
    { fromMinor: 57_812_500, rate: 0.37 },
  ],
  married: [
    { fromMinor: 0, rate: 0.1 },
    { fromMinor: 2_200_000, rate: 0.12 },
    { fromMinor: 8_945_000, rate: 0.22 },
    { fromMinor: 19_075_000, rate: 0.24 },
    { fromMinor: 36_420_000, rate: 0.32 },
    { fromMinor: 46_250_000, rate: 0.35 },
    { fromMinor: 69_375_000, rate: 0.37 },
  ],
};

type FilingStatus = "single" | "married";

function filingStatusOf(input: { filingStatus?: string }): FilingStatus {
  return input.filingStatus === "married" ? "married" : "single";
}

function federalIncomeTax(ctx: RulePackContext): number {
  const status = filingStatusOf(ctx.input);
  const periods = ctx.input.periodsPerYear;
  const annualTaxable = Math.max(0, ctx.taxableMinor * periods - STANDARD_DEDUCTION_MINOR[status]);
  const annualTax = bracketTax(annualTaxable, BRACKETS[status]);
  return roundToMinor(annualTax / periods);
}

function socialSecurity(ctx: RulePackContext): number {
  const remainingCap = Math.max(0, SS_WAGE_BASE_MINOR - (ctx.input.ytdWagesMinor ?? 0));
  const taxableThisPeriod = Math.min(ctx.grossMinor, remainingCap);
  return roundToMinor(taxableThisPeriod * SS_RATE);
}

function medicare(ctx: RulePackContext): number {
  return roundToMinor(ctx.grossMinor * MEDICARE_RATE);
}

function statutory(ctx: RulePackContext): PayslipLine[] {
  return [
    {
      code: "us_fit",
      name: "Federal income tax",
      type: "DEDUCTION",
      amountMinor: federalIncomeTax(ctx),
    },
    { code: "us_ss", name: "Social Security", type: "DEDUCTION", amountMinor: socialSecurity(ctx) },
    { code: "us_medicare", name: "Medicare", type: "DEDUCTION", amountMinor: medicare(ctx) },
  ];
}

const none = (): PayslipLine[] => [];

export const usRulePack: CountryRulePack = {
  country: "US",
  version: "2026.0-synthetic",
  currency: "USD",
  earnings: none,
  deductions: none,
  statutory,
};
