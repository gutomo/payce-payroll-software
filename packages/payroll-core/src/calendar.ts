import { PayrollError } from "./errors";

/**
 * Pure pay-period scheduling. Given a frequency and an anchor (the first period's start), deterministically
 * derive successive period boundaries and pay dates. No I/O, no clock, no `Date.now()`; dates are plain
 * `YYYY-MM-DD` strings computed in UTC, so the same inputs always yield the same calendar. The API layer
 * persists the result as `PayPeriod` rows; this module owns the date math so it can be golden-mastered.
 */

export type PayFrequency = "ANNUAL" | "MONTHLY" | "SEMI_MONTHLY" | "BIWEEKLY" | "WEEKLY";

const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  ANNUAL: 1,
  MONTHLY: 12,
  SEMI_MONTHLY: 24,
  BIWEEKLY: 26,
  WEEKLY: 52,
};

/** Number of pay periods in a year for a frequency, used to annualize/de-annualize pay and tax. */
export function periodsPerYear(frequency: PayFrequency): number {
  return PERIODS_PER_YEAR[frequency];
}

export interface GeneratedPeriod {
  /** 1-based ordinal within the pay group (offset by `startSequence`). */
  sequence: number;
  /** Inclusive period start, `YYYY-MM-DD`. */
  startDate: string;
  /** Inclusive period end, `YYYY-MM-DD`. */
  endDate: string;
  /** Pay date = period end + `payDateOffsetDays`, `YYYY-MM-DD`. */
  payDate: string;
}

export interface GeneratePeriodsInput {
  frequency: PayFrequency;
  /** First period's start date, `YYYY-MM-DD`. For SEMI_MONTHLY it is normalized to the 1st of its month. */
  anchorDate: string;
  /** How many periods to generate (>= 0). */
  count: number;
  /** Days after a period's end that pay lands (default 0). */
  payDateOffsetDays?: number;
  /** Sequence number of the first generated period (default 1); use to append further periods later. */
  startSequence?: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function generatePayPeriods(input: GeneratePeriodsInput): GeneratedPeriod[] {
  const offset = input.payDateOffsetDays ?? 0;
  const startSeq = input.startSequence ?? 1;
  assertInt(input.count, "count");
  if (input.count < 0) throw new PayrollError(`count must be >= 0, got ${input.count}`);
  assertInt(offset, "payDateOffsetDays");
  assertInt(startSeq, "startSequence");
  if (startSeq < 1) throw new PayrollError(`startSequence must be >= 1, got ${startSeq}`);
  parse(input.anchorDate); // validates the anchor up front

  const periods: GeneratedPeriod[] = [];
  for (let i = 0; i < input.count; i++) {
    const { start, end } = boundary(input.frequency, input.anchorDate, i);
    periods.push({
      sequence: startSeq + i,
      startDate: start,
      endDate: end,
      payDate: addDays(end, offset),
    });
  }
  return periods;
}

/** Period [start, end] for the i-th period (0-based) of `frequency` anchored at `anchor`. */
function boundary(
  frequency: PayFrequency,
  anchor: string,
  i: number,
): { start: string; end: string } {
  switch (frequency) {
    case "WEEKLY": {
      const start = addDays(anchor, 7 * i);
      return { start, end: addDays(start, 6) };
    }
    case "BIWEEKLY": {
      const start = addDays(anchor, 14 * i);
      return { start, end: addDays(start, 13) };
    }
    case "MONTHLY": {
      const start = addMonths(anchor, i);
      return { start, end: addDays(addMonths(anchor, i + 1), -1) };
    }
    case "ANNUAL": {
      const start = addMonths(anchor, 12 * i);
      return { start, end: addDays(addMonths(anchor, 12 * (i + 1)), -1) };
    }
    case "SEMI_MONTHLY":
      return semiMonthly(anchor, i);
  }
}

/** Twice-monthly periods split 1st–15th and 16th–end-of-month; the anchor's day is normalized to the 1st. */
function semiMonthly(anchor: string, i: number): { start: string; end: string } {
  const a = parse(anchor);
  const month = addMonths(fmt(a.y, a.m, 1), Math.floor(i / 2));
  const { y, m } = parse(month);
  return i % 2 === 0
    ? { start: fmt(y, m, 1), end: fmt(y, m, 15) }
    : { start: fmt(y, m, 16), end: fmt(y, m, daysInMonth(y, m)) };
}

// ─────────────────────────── UTC date helpers (no tz, no clock) ───────────────────────────

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parse(dateStr: string): Ymd {
  const match = DATE_RE.exec(dateStr);
  if (!match) throw new PayrollError(`Invalid date "${dateStr}": expected YYYY-MM-DD`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new PayrollError(`Invalid calendar date "${dateStr}"`);
  }
  return { y, m, d };
}

function fmt(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(dateStr: string, n: number): string {
  const { y, m, d } = parse(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Add `n` calendar months, clamping the day to the target month's length (Jan 31 + 1mo → Feb 28/29). */
function addMonths(dateStr: string, n: number): string {
  const { y, m, d } = parse(dateStr);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return fmt(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Last day of month `m` (1-based) in year `y`. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function assertInt(value: number, name: string): void {
  if (!Number.isInteger(value)) throw new PayrollError(`${name} must be an integer, got ${value}`);
}
