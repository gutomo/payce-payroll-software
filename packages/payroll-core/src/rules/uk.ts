import type { PayslipLine } from "../calculate";
import { roundToMinor } from "../money";
import {
  bracketTax,
  type CountryRulePack,
  type RulePackContext,
  type TaxBracket,
} from "../rule-pack";

/**
 * UK reference rule pack, a *synthetic, illustrative* model of PAYE income tax and National
 * Insurance, NOT HMRC tables and NOT tax advice. It demonstrates the pre-tax `deductions` strategy:
 *
 * - **Workplace pension** (employee): a pre-tax deduction (net-pay arrangement) that reduces taxable
 *   pay for income tax.
 * - **Income tax (PAYE)** via the annualized method, with the personal allowance modelled as a 0%
 *   first band, computed on *taxable* pay (after pension).
 * - **National Insurance** (employee, per period) on *gross* pay; the pension is not salary-sacrifice
 *   here, so it does not reduce NI.
 *
 * All figures are round, made-up values; replace with maintained, dated statutory tables before use.
 */

const PAYE_BRACKETS: TaxBracket[] = [
  { fromMinor: 0, rate: 0 }, // personal allowance (£12,570 @ 0%)
  { fromMinor: 1_257_000, rate: 0.2 }, // basic rate
  { fromMinor: 5_027_000, rate: 0.4 }, // higher rate (£50,270+)
  { fromMinor: 12_514_000, rate: 0.45 }, // additional rate (£125,140+)
];

const NI_PRIMARY_THRESHOLD_MINOR = 1_257_000; // £12,570/yr
const NI_UPPER_EARNINGS_LIMIT_MINOR = 5_027_000; // £50,270/yr
const NI_MAIN_RATE = 0.08; // between PT and UEL
const NI_UPPER_RATE = 0.02; // above UEL
const PENSION_RATE = 0.05; // employee workplace pension, pre-tax

function paye(ctx: RulePackContext): number {
  const annualTax = bracketTax(ctx.taxableMinor * ctx.input.periodsPerYear, PAYE_BRACKETS);
  return roundToMinor(annualTax / ctx.input.periodsPerYear);
}

function nationalInsurance(ctx: RulePackContext): number {
  const periods = ctx.input.periodsPerYear;
  const pt = NI_PRIMARY_THRESHOLD_MINOR / periods;
  const uel = NI_UPPER_EARNINGS_LIMIT_MINOR / periods;
  const gross = ctx.grossMinor;
  const main = Math.max(0, Math.min(gross, uel) - pt) * NI_MAIN_RATE;
  const upper = Math.max(0, gross - uel) * NI_UPPER_RATE;
  // Round the combined contribution once so per-period values stay exact.
  return roundToMinor(main + upper);
}

function statutory(ctx: RulePackContext): PayslipLine[] {
  return [
    { code: "uk_paye", name: "Income tax (PAYE)", type: "DEDUCTION", amountMinor: paye(ctx) },
    {
      code: "uk_ni",
      name: "National Insurance",
      type: "DEDUCTION",
      amountMinor: nationalInsurance(ctx),
    },
  ];
}

function deductions(ctx: RulePackContext): PayslipLine[] {
  return [
    {
      code: "uk_pension",
      name: "Workplace pension",
      type: "DEDUCTION",
      amountMinor: roundToMinor(ctx.grossMinor * PENSION_RATE),
    },
  ];
}

const none = (): PayslipLine[] => [];

export const ukRulePack: CountryRulePack = {
  country: "GB",
  version: "2026.0-synthetic",
  currency: "GBP",
  earnings: none,
  deductions,
  statutory,
};
