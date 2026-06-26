import { describe, expect, it } from "vitest";
import { FormulaError } from "./errors";
import { compile, evaluate, evaluateFormula } from "./formula";

const evalf = (src: string, ctx: Record<string, number> = {}) => evaluateFormula(src, ctx);

describe("arithmetic", () => {
  it("evaluates literals and decimals", () => {
    expect(evalf("42")).toBe(42);
    expect(evalf("3.14")).toBeCloseTo(3.14);
  });

  it("honours operator precedence and parentheses", () => {
    expect(evalf("2 + 3 * 4")).toBe(14);
    expect(evalf("(2 + 3) * 4")).toBe(20);
    expect(evalf("10 - 2 - 3")).toBe(5); // left-associative
    expect(evalf("20 / 4 / 5")).toBe(1);
  });

  it("handles unary plus and minus", () => {
    expect(evalf("-5")).toBe(-5);
    expect(evalf("3 + -2")).toBe(1);
    expect(evalf("-(2 + 3)")).toBe(-5);
  });
});

describe("variables", () => {
  it("resolves identifiers from the context", () => {
    expect(evalf("base * 0.1", { base: 500000 })).toBe(50000);
    expect(evalf("rate * hours", { rate: 2500, hours: 160 })).toBe(400000);
  });

  it("throws on an unknown variable", () => {
    expect(() => evalf("base + bonus", { base: 1 })).toThrow(FormulaError);
  });

  it("throws on a non-finite variable", () => {
    expect(() => evalf("x", { x: Infinity })).toThrow(FormulaError);
  });
});

describe("functions", () => {
  it("supports the whitelisted functions", () => {
    expect(evalf("min(3, 7, 2)")).toBe(2);
    expect(evalf("max(3, 7, 2)")).toBe(7);
    expect(evalf("abs(-9)")).toBe(9);
    expect(evalf("floor(2.9)")).toBe(2);
    expect(evalf("ceil(2.1)")).toBe(3);
    expect(evalf("round(2.5)")).toBe(3);
    expect(evalf("clamp(15, 0, 10)")).toBe(10);
    expect(evalf("clamp(-3, 0, 10)")).toBe(0);
  });

  it("caps a percentage with min()", () => {
    expect(evalf("min(base * 0.05, 50000)", { base: 2000000 })).toBe(50000);
  });

  it("rejects unknown functions and wrong arity", () => {
    expect(() => evalf("sqrt(4)")).toThrow(FormulaError);
    expect(() => evalf("abs(1, 2)")).toThrow(FormulaError);
    expect(() => evalf("min()")).toThrow(FormulaError);
  });
});

describe("errors", () => {
  it("throws on division by zero", () => {
    expect(() => evalf("1 / 0")).toThrow(/Division by zero/);
  });

  it("throws on a non-finite result", () => {
    expect(() => evalf("x * x", { x: 1e200 })).toThrow(FormulaError);
  });

  it("throws on syntax errors", () => {
    expect(() => evalf("")).toThrow(FormulaError);
    expect(() => evalf("2 +")).toThrow(FormulaError);
    expect(() => evalf("(2 + 3")).toThrow(FormulaError);
    expect(() => evalf("2 3")).toThrow(FormulaError);
    expect(() => evalf("2 @ 3")).toThrow(FormulaError);
    expect(() => evalf("1.2.3")).toThrow(FormulaError);
  });
});

describe("sandbox safety", () => {
  it("treats JS globals/prototype names as ordinary (unknown) variables, never code", () => {
    expect(() => evalf("constructor")).toThrow(FormulaError);
    expect(() => evalf("__proto__")).toThrow(FormulaError);
    expect(() => evalf("process")).toThrow(FormulaError);
  });
});

describe("compile + evaluate reuse", () => {
  it("compiles once and evaluates against many contexts", () => {
    const f = compile("base * rate");
    expect(evaluate(f, { base: 100, rate: 2 })).toBe(200);
    expect(evaluate(f, { base: 100, rate: 3 })).toBe(300);
    expect(f.source).toBe("base * rate");
  });
});
