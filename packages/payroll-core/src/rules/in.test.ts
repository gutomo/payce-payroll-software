import { describe, expect, it } from "vitest";
import type { RulePackContext } from "../rule-pack";
import { inRulePack } from "./in";

/** Read statutory deduction amounts by code from the pack output. */
function amounts(ctx: RulePackContext): Record<string, number> {
  return Object.fromEntries(inRulePack.statutory(ctx).map((l) => [l.code, l.amountMinor]));
}

// ₹80,000/mo gross (paise). EPF is a statutory contribution, so it does not reduce taxable pay.
const monthly = (over: Partial<RulePackContext>): RulePackContext => ({
  currency: "INR",
  grossMinor: 8_000_000,
  taxableMinor: 8_000_000,
  input: { periodsPerYear: 12 },
  ...over,
});

describe("India rule pack, identity", () => {
  it("declares country IN, currency INR, and a synthetic version", () => {
    expect(inRulePack.country).toBe("IN");
    expect(inRulePack.currency).toBe("INR");
    expect(inRulePack.version).toMatch(/synthetic/);
  });
});

describe("India rule pack, golden master (₹80,000 gross, monthly)", () => {
  it("computes new-regime income tax (incl. 4% cess) and EPF exactly", () => {
    // annual taxable 91,00,000p → slab tax 46,50,000 + 4% cess = 48,36,000/yr → 4,03,000/mo
    // EPF: 12% of the ₹15,000 monthly wage ceiling = 1,80,000 paise
    expect(amounts(monthly({}))).toEqual({
      in_tax: 403_000,
      in_epf: 180_000,
    });
  });
});

describe("India rule pack, slabs and EPF ceiling", () => {
  it("charges no income tax when annual taxable pay sits in the zero slab", () => {
    // ₹20,000/mo → annual taxable 1,90,00,000p, below the ₹3,00,000 first slab
    expect(amounts(monthly({ grossMinor: 2_000_000, taxableMinor: 2_000_000 })).in_tax).toBe(0);
  });

  it("caps EPF at the wage ceiling above it, but tracks pay below it", () => {
    // ₹10,000/mo is under the ₹15,000 ceiling → EPF on full pay: 12% of 1,000,000 = 120,000
    expect(amounts(monthly({ grossMinor: 1_000_000, taxableMinor: 1_000_000 })).in_epf).toBe(
      120_000,
    );
    // ₹80,000/mo is over the ceiling → EPF capped: 12% of 1,500,000 = 180,000
    expect(amounts(monthly({})).in_epf).toBe(180_000);
  });
});
