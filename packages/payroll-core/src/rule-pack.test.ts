import { describe, expect, it } from "vitest";
import { bracketTax, type TaxBracket } from "./rule-pack";

const BRACKETS: TaxBracket[] = [
  { fromMinor: 0, rate: 0.1 },
  { fromMinor: 1_100_000, rate: 0.12 },
  { fromMinor: 4_472_500, rate: 0.22 },
];

describe("bracketTax", () => {
  it("is zero at or below zero income", () => {
    expect(bracketTax(0, BRACKETS)).toBe(0);
  });

  it("taxes only within the first band below the next threshold", () => {
    expect(bracketTax(500_000, BRACKETS)).toBe(50_000);
    expect(bracketTax(1_100_000, BRACKETS)).toBe(110_000);
  });

  it("applies each rate to its own slice across bands", () => {
    // 1,100,000@10% + 3,372,500@12% + 1,227,500@22% = 110,000 + 404,700 + 270,050
    expect(bracketTax(5_700_000, BRACKETS)).toBe(784_750);
  });

  it("is monotonic in income", () => {
    expect(bracketTax(2_000_000, BRACKETS)).toBeGreaterThan(bracketTax(1_500_000, BRACKETS));
  });
});
