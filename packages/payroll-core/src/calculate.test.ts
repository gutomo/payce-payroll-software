import { describe, expect, it } from "vitest";
import { calculate, calculatePayslip, compileElements, type PayrollInput } from "./calculate";
import { PayrollError } from "./errors";
import type { PayElementDef } from "./pay-element";

describe("calculatePayslip — basics", () => {
  it("computes gross, deductions, and net for a simple slip", () => {
    const result = calculatePayslip({
      currency: "USD",
      variables: { base: 500000 },
      elements: [
        { code: "basic", name: "Basic", type: "EARNING", formula: "base" },
        { code: "tax", name: "Tax", type: "DEDUCTION", formula: "gross * 0.2" },
      ],
    });
    expect(result.grossMinor).toBe(500000);
    expect(result.deductionsMinor).toBe(100000);
    expect(result.netMinor).toBe(400000);
    expect(result.lines.map((l) => l.amountMinor)).toEqual([500000, 100000]);
  });

  it("returns zeroes for an empty element set", () => {
    const result = calculatePayslip({ currency: "USD", variables: {}, elements: [] });
    expect(result).toEqual({
      currency: "USD",
      lines: [],
      grossMinor: 0,
      deductionsMinor: 0,
      netMinor: 0,
    });
  });
});

describe("ordered, data-driven references", () => {
  it("lets later formulas reference earlier element results and running totals", () => {
    const result = calculatePayslip({
      currency: "USD",
      variables: { base: 600000 },
      elements: [
        { code: "basic", name: "Basic", type: "EARNING", formula: "base" },
        { code: "bonus", name: "Bonus", type: "EARNING", formula: "basic * 0.1" },
        { code: "pension", name: "Pension", type: "DEDUCTION", formula: "gross * 0.05" },
        { code: "tax", name: "Tax", type: "DEDUCTION", formula: "net * 0.2" },
      ],
    });
    // gross = 600000 + 60000 = 660000; pension = 33000; net pre-tax = 627000; tax = 125400.
    expect(result.grossMinor).toBe(660000);
    expect(result.deductionsMinor).toBe(158400);
    expect(result.netMinor).toBe(501600);
  });

  it("prorates with rounding", () => {
    const result = calculatePayslip({
      currency: "USD",
      variables: { base: 100000, daysWorked: 10, totalDays: 30 },
      elements: [
        { code: "basic", name: "Basic", type: "EARNING", formula: "base / totalDays * daysWorked" },
      ],
    });
    // 100000 / 30 * 10 = 33333.33 -> HALF_UP -> 33333
    expect(result.lines[0]?.amountMinor).toBe(33333);
  });

  it("honours a per-element rounding override", () => {
    const elements: PayElementDef[] = [
      { code: "half", name: "Half", type: "EARNING", formula: "base * 0.5", rounding: "HALF_EVEN" },
    ];
    expect(calculatePayslip({ currency: "USD", variables: { base: 5 }, elements }).netMinor).toBe(
      2,
    );
    elements[0]!.rounding = "HALF_UP";
    expect(calculatePayslip({ currency: "USD", variables: { base: 5 }, elements }).netMinor).toBe(
      3,
    );
  });
});

describe("golden master — monthly salaried payslip", () => {
  const input: PayrollInput = {
    currency: "USD",
    variables: { base: 600000 },
    elements: [
      { code: "basic", name: "Basic salary", type: "EARNING", formula: "base" },
      { code: "housing", name: "Housing allowance", type: "EARNING", formula: "base * 0.10" },
      { code: "transport", name: "Transport allowance", type: "EARNING", formula: "20000" },
      { code: "pension", name: "Pension", type: "DEDUCTION", formula: "gross * 0.05" },
      { code: "tax", name: "Income tax", type: "DEDUCTION", formula: "net * 0.20" },
    ],
  };

  it("matches the expected line items and totals exactly", () => {
    expect(calculatePayslip(input)).toEqual({
      currency: "USD",
      lines: [
        { code: "basic", name: "Basic salary", type: "EARNING", amountMinor: 600000 },
        { code: "housing", name: "Housing allowance", type: "EARNING", amountMinor: 60000 },
        { code: "transport", name: "Transport allowance", type: "EARNING", amountMinor: 20000 },
        { code: "pension", name: "Pension", type: "DEDUCTION", amountMinor: 34000 },
        { code: "tax", name: "Income tax", type: "DEDUCTION", amountMinor: 129200 },
      ],
      grossMinor: 680000,
      deductionsMinor: 163200,
      netMinor: 516800,
    });
  });

  it("is deterministic — re-running yields identical output", () => {
    expect(calculatePayslip(input)).toEqual(calculatePayslip(input));
  });
});

describe("compile once, evaluate per employee", () => {
  it("reuses a compiled element set across employees", () => {
    const compiled = compileElements([
      { code: "basic", name: "Basic", type: "EARNING", formula: "base" },
      { code: "tax", name: "Tax", type: "DEDUCTION", formula: "gross * 0.1" },
    ]);
    const a = calculate("USD", { base: 100000 }, compiled);
    const b = calculate("USD", { base: 250000 }, compiled);
    expect(a.netMinor).toBe(90000);
    expect(b.netMinor).toBe(225000);
  });
});

describe("validation", () => {
  it("rejects duplicate element codes", () => {
    expect(() =>
      compileElements([
        { code: "x", name: "X", type: "EARNING", formula: "1" },
        { code: "x", name: "X2", type: "EARNING", formula: "2" },
      ]),
    ).toThrow(PayrollError);
  });

  it("rejects reserved element codes", () => {
    expect(() =>
      compileElements([{ code: "gross", name: "G", type: "EARNING", formula: "1" }]),
    ).toThrow(/reserved/);
  });

  it("rejects reserved variable names", () => {
    expect(() =>
      calculatePayslip({
        currency: "USD",
        variables: { gross: 1 },
        elements: [{ code: "basic", name: "Basic", type: "EARNING", formula: "1" }],
      }),
    ).toThrow(/reserved/);
  });

  it("rejects a variable that collides with an element code", () => {
    expect(() =>
      calculatePayslip({
        currency: "USD",
        variables: { basic: 1 },
        elements: [{ code: "basic", name: "Basic", type: "EARNING", formula: "1" }],
      }),
    ).toThrow(/ambiguous/);
  });
});
