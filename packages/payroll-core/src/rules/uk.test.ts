import { describe, expect, it } from "vitest";
import type { RulePackContext } from "../rule-pack";
import { ukRulePack } from "./uk";

/** Read statutory deduction amounts by code from the pack output. */
function statutory(ctx: RulePackContext): Record<string, number> {
  return Object.fromEntries(ukRulePack.statutory(ctx).map((l) => [l.code, l.amountMinor]));
}
function deductions(ctx: RulePackContext): Record<string, number> {
  return Object.fromEntries(ukRulePack.deductions(ctx).map((l) => [l.code, l.amountMinor]));
}

// £4,000/mo gross; taxable is £3,800 after the 5% workplace pension (a pre-tax deduction).
const monthly = (over: Partial<RulePackContext>): RulePackContext => ({
  currency: "GBP",
  grossMinor: 400_000,
  taxableMinor: 380_000,
  input: { periodsPerYear: 12 },
  ...over,
});

describe("UK rule pack, identity", () => {
  it("declares country GB, currency GBP, and a synthetic version", () => {
    expect(ukRulePack.country).toBe("GB");
    expect(ukRulePack.currency).toBe("GBP");
    expect(ukRulePack.version).toMatch(/synthetic/);
  });
});

describe("UK rule pack, pre-tax workplace pension", () => {
  it("deducts 5% of gross before income tax", () => {
    expect(deductions(monthly({})).uk_pension).toBe(20_000);
  });
});

describe("UK rule pack, golden master (£4,000 gross / £3,800 taxable, monthly)", () => {
  it("computes PAYE on taxable pay and NI on gross", () => {
    // PAYE: annual taxable 4,560,000p → basic-rate tax 660,600/yr → 55,050/mo
    // NI:   (400,000 − 104,750) × 8% = 23,620 (all below the upper earnings limit)
    expect(statutory(monthly({}))).toEqual({
      uk_paye: 55_050,
      uk_ni: 23_620,
    });
  });
});

describe("UK rule pack, higher earners", () => {
  it("applies the 40% PAYE band above the higher-rate threshold", () => {
    // taxable 500,000/mo → annual 6,000,000 → 754,000 (20%) + 389,200 (40%) = 1,143,200/yr → 95,267/mo
    expect(statutory(monthly({ taxableMinor: 500_000 })).uk_paye).toBe(95_267);
  });

  it("applies the 2% NI upper band above the upper earnings limit", () => {
    // gross 600,000/mo: main band 25,133.33 + upper band 3,621.67 → 28,755
    expect(statutory(monthly({ grossMinor: 600_000 })).uk_ni).toBe(28_755);
  });
});
