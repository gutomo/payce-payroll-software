import { PayrollError } from "./errors";

/**
 * Money as integer **minor units** (e.g. cents) plus an ISO 4217 currency code, never floats
 * (CLAUDE.md money rule). Sums of Money are integer-exact. Fractional values only ever appear
 * transiently when multiplying by a rate, and are rounded back to an integer minor unit immediately
 * via {@link roundToMinor}.
 */
export interface Money {
  /** Integer amount in the currency's minor unit (cents for USD, pence for GBP, paise for INR…). */
  readonly minor: number;
  /** ISO 4217 currency code, uppercase (e.g. "USD"). */
  readonly currency: string;
}

/**
 * Rounding strategy applied when converting a fractional minor-unit value to an integer.
 * - `HALF_UP` rounds halves away from zero (2.5 → 3, -2.5 → -3), the common payroll/statutory default.
 * - `HALF_EVEN` (banker's) rounds halves to the nearest even integer (2.5 → 2, 3.5 → 4); reduces bias.
 * - `FLOOR` / `CEIL` / `TRUNC` round toward -∞ / +∞ / zero respectively.
 */
export type RoundingMode = "HALF_UP" | "HALF_EVEN" | "FLOOR" | "CEIL" | "TRUNC";

export const DEFAULT_ROUNDING: RoundingMode = "HALF_UP";

function assertInteger(minor: number): void {
  if (!Number.isInteger(minor)) {
    throw new PayrollError(`Money.minor must be an integer minor unit, got ${minor}`);
  }
  if (!Number.isSafeInteger(minor)) {
    throw new PayrollError(`Money.minor ${minor} exceeds the safe integer range`);
  }
}

/** Construct Money, validating that `minor` is a safe integer and normalizing the currency code. */
export function money(minor: number, currency: string): Money {
  assertInteger(minor);
  return { minor, currency: currency.toUpperCase() };
}

export function zero(currency: string): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new PayrollError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.minor, a.currency);
}

export function isZero(a: Money): boolean {
  return a.minor === 0;
}

/** Sum a list of Money values; all must share `currency` (also used for the empty-list result). */
export function sum(values: readonly Money[], currency: string): Money {
  return values.reduce<Money>((acc, v) => add(acc, v), zero(currency));
}

/**
 * Round a fractional minor-unit value to an integer using `mode`. Input is first snapped to 6 decimal
 * places to shed IEEE-754 dust (e.g. 4999.9999999997 → 5000) so rounding is stable and deterministic.
 */
export function roundToMinor(value: number, mode: RoundingMode = DEFAULT_ROUNDING): number {
  const snapped = Number(value.toFixed(6));
  switch (mode) {
    case "FLOOR":
      return Math.floor(snapped);
    case "CEIL":
      return Math.ceil(snapped);
    case "TRUNC":
      return Math.trunc(snapped);
    case "HALF_EVEN":
      return roundHalfEven(snapped);
    case "HALF_UP":
      return roundHalfUp(snapped);
  }
}

function roundHalfUp(value: number): number {
  // Away from zero on a tie: Math.round on |value| gives .5 → up, then restore the sign.
  return Math.sign(value) * Math.round(Math.abs(value));
}

function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  // Exactly halfway → pick the even neighbour.
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Multiply Money by a (possibly fractional) factor and round back to an integer minor unit. Used for
 * rate-based elements (percentages, proration). The multiply happens in float; {@link roundToMinor}
 * removes FP dust before rounding.
 */
export function multiply(
  value: Money,
  factor: number,
  mode: RoundingMode = DEFAULT_ROUNDING,
): Money {
  return money(roundToMinor(value.minor * factor, mode), value.currency);
}

/** Format Money for display/debug, e.g. `{ minor: 123456, currency: "USD" }` → "1234.56 USD". */
export function format(value: Money, fractionDigits = 2): string {
  const major = value.minor / 10 ** fractionDigits;
  return `${major.toFixed(fractionDigits)} ${value.currency}`;
}
