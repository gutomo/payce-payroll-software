import { describe, expect, it } from "vitest";
import { calculatePayslip } from "./calculate";
import { PayrollError } from "./errors";
import type { PayElementDef } from "./pay-element";
import { runPayroll } from "./run";
import { usRulePack } from "./rules/us";

const basic: PayElementDef = { code: "basic", name: "Basic", type: "EARNING", formula: "base" };

function lineAmount(lines: { code: string; amountMinor: number }[], code: string): number {
  return lines.find((l) => l.code === code)?.amountMinor ?? Number.NaN;
}

describe("runPayroll, without a rule pack", () => {
  it("is exactly calculatePayslip", () => {
    const input = { currency: "USD", variables: { base: 500_000 }, elements: [basic] };
    expect(runPayroll(input)).toEqual(calculatePayslip(input));
  });
});

describe("runPayroll, with the US rule pack", () => {
  it("layers statutory deductions onto the configured earnings and recomputes net", () => {
    const result = runPayroll({
      currency: "USD",
      variables: { base: 600_000 },
      elements: [basic],
      rulePack: usRulePack,
      statutory: { periodsPerYear: 12 },
    });
    expect(result.grossMinor).toBe(600_000);
    expect(lineAmount(result.lines, "us_fit")).toBe(65_396);
    expect(lineAmount(result.lines, "us_ss")).toBe(37_200);
    expect(lineAmount(result.lines, "us_medicare")).toBe(8_700);
    // deductions = 65,396 + 37,200 + 8,700 = 111,296 → net 488,704
    expect(result.deductionsMinor).toBe(111_296);
    expect(result.netMinor).toBe(488_704);
  });

  it("reduces taxable income by a pre-tax deduction", () => {
    const result = runPayroll({
      currency: "USD",
      variables: { base: 600_000, contribution: 60_000 },
      elements: [
        basic,
        { code: "k401", name: "401(k)", type: "DEDUCTION", formula: "contribution" },
      ],
      rulePack: usRulePack,
      statutory: { periodsPerYear: 12, preTaxMinor: 60_000 },
    });
    // taxable 540,000 → FIT 52,196; deductions = 60,000 + 52,196 + 37,200 + 8,700 = 158,096
    expect(lineAmount(result.lines, "us_fit")).toBe(52_196);
    expect(result.deductionsMinor).toBe(158_096);
    expect(result.netMinor).toBe(441_904);
  });

  it("is deterministic", () => {
    const input = {
      currency: "USD",
      variables: { base: 600_000 },
      elements: [basic],
      rulePack: usRulePack,
      statutory: { periodsPerYear: 12 },
    };
    expect(runPayroll(input)).toEqual(runPayroll(input));
  });
});

describe("runPayroll, validation", () => {
  it("rejects a rule pack whose currency differs from the run", () => {
    expect(() =>
      runPayroll({
        currency: "EUR",
        variables: { base: 1 },
        elements: [basic],
        rulePack: usRulePack,
      }),
    ).toThrow(PayrollError);
  });

  it("rejects a configured element code that collides with a statutory line", () => {
    expect(() =>
      runPayroll({
        currency: "USD",
        variables: { base: 600_000 },
        elements: [basic, { code: "us_ss", name: "Clash", type: "DEDUCTION", formula: "1" }],
        rulePack: usRulePack,
      }),
    ).toThrow(/duplicate line code/);
  });
});
