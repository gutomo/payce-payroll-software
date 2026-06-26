import type { PayslipLine } from "../calculate";
import { roundToMinor } from "../money";
import {
  bracketTax,
  type CountryRulePack,
  type RulePackContext,
  type TaxBracket,
} from "../rule-pack";

/**
 * India reference rule pack, a *synthetic, illustrative* model under the new tax regime, NOT the
 * authoritative schedule and NOT tax advice. Amounts are in paise (INR minor unit). It models:
 *
 * - **Income tax** via the annualized method: annualize taxable pay, subtract the standard deduction,
 *   apply the new-regime slabs, add a 4% health & education cess, then divide back by the frequency.
 * - **Provident fund (EPF)**: employee 12% of pay up to a monthly wage ceiling. Under the new regime
 *   this is not deductible, so it is modelled as a statutory contribution that does not reduce taxable
 *   income (hence it lives in `statutory`, not the pre-tax `deductions` strategy).
 *
 * All figures are round, made-up values; replace with maintained, dated statutory tables before use.
 */

const STANDARD_DEDUCTION_MINOR = 5_000_000; // ₹50,000/yr (illustrative)

// New-regime annual slabs (illustrative), in paise.
const SLABS: TaxBracket[] = [
  { fromMinor: 0, rate: 0 }, // up to ₹3,00,000
  { fromMinor: 30_000_000, rate: 0.05 }, // ₹3L–₹6L
  { fromMinor: 60_000_000, rate: 0.1 }, // ₹6L–₹9L
  { fromMinor: 90_000_000, rate: 0.15 }, // ₹9L–₹12L
  { fromMinor: 120_000_000, rate: 0.2 }, // ₹12L–₹15L
  { fromMinor: 150_000_000, rate: 0.3 }, // ₹15L+
];

const CESS_RATE = 0.04; // health & education cess on income tax
const EPF_RATE = 0.12; // employee contribution
const EPF_WAGE_CEILING_ANNUAL_MINOR = 18_000_000; // ₹15,000/mo → ₹1,80,000/yr (illustrative)

function incomeTax(ctx: RulePackContext): number {
  const periods = ctx.input.periodsPerYear;
  const annualTaxable = Math.max(0, ctx.taxableMinor * periods - STANDARD_DEDUCTION_MINOR);
  const annualTax = bracketTax(annualTaxable, SLABS) * (1 + CESS_RATE);
  return roundToMinor(annualTax / periods);
}

function providentFund(ctx: RulePackContext): number {
  const ceilingPerPeriod = EPF_WAGE_CEILING_ANNUAL_MINOR / ctx.input.periodsPerYear;
  return roundToMinor(Math.min(ctx.grossMinor, ceilingPerPeriod) * EPF_RATE);
}

function statutory(ctx: RulePackContext): PayslipLine[] {
  return [
    { code: "in_tax", name: "Income tax", type: "DEDUCTION", amountMinor: incomeTax(ctx) },
    {
      code: "in_epf",
      name: "Provident fund (EPF)",
      type: "DEDUCTION",
      amountMinor: providentFund(ctx),
    },
  ];
}

const none = (): PayslipLine[] => [];

export const inRulePack: CountryRulePack = {
  country: "IN",
  version: "2026.0-synthetic",
  currency: "INR",
  earnings: none,
  deductions: none,
  statutory,
};
