import { describe, expect, it } from "vitest";
import { PayrollError } from "./errors";
import {
  add,
  format,
  isZero,
  money,
  multiply,
  negate,
  roundToMinor,
  subtract,
  sum,
  zero,
} from "./money";

describe("money construction", () => {
  it("normalizes the currency code to uppercase", () => {
    expect(money(100, "usd")).toEqual({ minor: 100, currency: "USD" });
  });

  it("rejects non-integer minor units", () => {
    expect(() => money(1.5, "USD")).toThrow(PayrollError);
  });

  it("rejects values outside the safe integer range", () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, "USD")).toThrow(PayrollError);
  });

  it("zero/isZero", () => {
    expect(zero("USD")).toEqual({ minor: 0, currency: "USD" });
    expect(isZero(zero("USD"))).toBe(true);
    expect(isZero(money(1, "USD"))).toBe(false);
  });
});

describe("money arithmetic", () => {
  it("adds, subtracts, and negates within a currency", () => {
    expect(add(money(100, "USD"), money(250, "USD")).minor).toBe(350);
    expect(subtract(money(250, "USD"), money(100, "USD")).minor).toBe(150);
    expect(negate(money(100, "USD")).minor).toBe(-100);
  });

  it("rejects mixing currencies", () => {
    expect(() => add(money(1, "USD"), money(1, "EUR"))).toThrow(PayrollError);
    expect(() => subtract(money(1, "USD"), money(1, "EUR"))).toThrow(PayrollError);
  });

  it("sums a list, defaulting the empty list to the given currency", () => {
    expect(sum([money(100, "USD"), money(200, "USD")], "USD").minor).toBe(300);
    expect(sum([], "USD")).toEqual({ minor: 0, currency: "USD" });
  });
});

describe("roundToMinor", () => {
  it("HALF_UP rounds halves away from zero", () => {
    expect(roundToMinor(2.5, "HALF_UP")).toBe(3);
    expect(roundToMinor(-2.5, "HALF_UP")).toBe(-3);
    expect(roundToMinor(2.4, "HALF_UP")).toBe(2);
    expect(roundToMinor(2.6, "HALF_UP")).toBe(3);
  });

  it("HALF_EVEN rounds halves to the nearest even integer", () => {
    expect(roundToMinor(2.5, "HALF_EVEN")).toBe(2);
    expect(roundToMinor(3.5, "HALF_EVEN")).toBe(4);
    expect(roundToMinor(2.4, "HALF_EVEN")).toBe(2);
  });

  it("FLOOR, CEIL, and TRUNC", () => {
    expect(roundToMinor(2.9, "FLOOR")).toBe(2);
    expect(roundToMinor(-2.1, "FLOOR")).toBe(-3);
    expect(roundToMinor(2.1, "CEIL")).toBe(3);
    expect(roundToMinor(-2.9, "CEIL")).toBe(-2);
    expect(roundToMinor(2.9, "TRUNC")).toBe(2);
    expect(roundToMinor(-2.9, "TRUNC")).toBe(-2);
  });

  it("sheds floating-point dust before rounding", () => {
    expect(roundToMinor(4999.9999999997)).toBe(5000);
    expect(roundToMinor(5000.0000000003)).toBe(5000);
  });
});

describe("multiply", () => {
  it("applies a percentage and rounds to an integer minor unit", () => {
    expect(multiply(money(100000, "USD"), 0.0825).minor).toBe(8250);
  });

  it("uses the requested rounding mode on a half value", () => {
    expect(multiply(money(5, "USD"), 0.5, "HALF_UP").minor).toBe(3);
    expect(multiply(money(5, "USD"), 0.5, "HALF_EVEN").minor).toBe(2);
  });
});

describe("format", () => {
  it("renders minor units as major units with the currency", () => {
    expect(format(money(123456, "USD"))).toBe("1234.56 USD");
    expect(format(money(0, "GBP"))).toBe("0.00 GBP");
  });
});
