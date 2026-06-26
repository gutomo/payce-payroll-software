import { describe, expect, it } from "vitest";
import type { RulePackContext } from "../rule-pack";
import { usRulePack } from "./us";

/** Helpers to read a statutory deduction amount by code from the pack output. */
function amounts(ctx: RulePackContext): Record<string, number> {
  return Object.fromEntries(usRulePack.statutory(ctx).map((l) => [l.code, l.amountMinor]));
}

const monthly = (over: Partial<RulePackContext>): RulePackContext => ({
  currency: "USD",
  grossMinor: 600_000,
  taxableMinor: 600_000,
  input: { periodsPerYear: 12 },
  ...over,
});

describe("US rule pack — identity", () => {
  it("declares country, currency, and a version", () => {
    expect(usRulePack.country).toBe("US");
    expect(usRulePack.currency).toBe("USD");
    expect(usRulePack.version).toMatch(/synthetic/);
  });
});

describe("US rule pack — golden master (single, monthly, $6,000 gross)", () => {
  it("computes FIT, Social Security, and Medicare exactly", () => {
    // FIT: annualTaxable = 600000*12 - 1,500,000 = 5,700,000 → tax 784,750/yr → 65,396/mo
    // SS: 600,000 * 6.2% = 37,200 ; Medicare: 600,000 * 1.45% = 8,700
    expect(amounts(monthly({}))).toEqual({
      us_fit: 65_396,
      us_ss: 37_200,
      us_medicare: 8_700,
    });
  });
});

describe("US rule pack — Social Security wage-base cap", () => {
  it("only taxes the wages remaining under the annual cap", () => {
    // ytd 17,900,000 leaves 100,000 of cap → SS = 100,000 * 6.2% = 6,200
    expect(
      amounts(monthly({ input: { periodsPerYear: 12, ytdWagesMinor: 17_900_000 } })).us_ss,
    ).toBe(6_200);
  });

  it("is zero once the cap is reached", () => {
    expect(
      amounts(monthly({ input: { periodsPerYear: 12, ytdWagesMinor: 18_000_000 } })).us_ss,
    ).toBe(0);
  });
});

describe("US rule pack — pre-tax income and filing status", () => {
  it("taxes the reduced taxable income (pre-tax 401k)", () => {
    // taxable 540,000/mo → annualTaxable 4,980,000 → tax 626,350/yr → 52,196/mo
    expect(amounts(monthly({ taxableMinor: 540_000 })).us_fit).toBe(52_196);
  });

  it("uses the married schedule and standard deduction", () => {
    // married: annualTaxable = 7,200,000 - 3,000,000 = 4,200,000 → tax 460,000/yr → 38,333/mo
    const married = monthly({ input: { periodsPerYear: 12, filingStatus: "married" } });
    expect(amounts(married).us_fit).toBe(38_333);
  });
});
