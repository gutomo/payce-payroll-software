import { describe, expect, it } from "vitest";
import { generatePayPeriods, periodsPerYear } from "./calendar";

describe("periodsPerYear", () => {
  it("maps each frequency to its number of periods", () => {
    expect(periodsPerYear("ANNUAL")).toBe(1);
    expect(periodsPerYear("MONTHLY")).toBe(12);
    expect(periodsPerYear("SEMI_MONTHLY")).toBe(24);
    expect(periodsPerYear("BIWEEKLY")).toBe(26);
    expect(periodsPerYear("WEEKLY")).toBe(52);
  });
});

describe("generatePayPeriods, monthly", () => {
  it("walks calendar months with an offset pay date (golden master)", () => {
    expect(
      generatePayPeriods({
        frequency: "MONTHLY",
        anchorDate: "2026-01-01",
        count: 3,
        payDateOffsetDays: 5,
      }),
    ).toEqual([
      { sequence: 1, startDate: "2026-01-01", endDate: "2026-01-31", payDate: "2026-02-05" },
      { sequence: 2, startDate: "2026-02-01", endDate: "2026-02-28", payDate: "2026-03-05" },
      { sequence: 3, startDate: "2026-03-01", endDate: "2026-03-31", payDate: "2026-04-05" },
    ]);
  });

  it("clamps the day when a month is shorter (Jan 31 → Feb)", () => {
    const [p1] = generatePayPeriods({ frequency: "MONTHLY", anchorDate: "2026-01-31", count: 1 });
    // Next period starts Feb 28 (2026 is not a leap year), so this period ends the day before.
    expect(p1).toEqual({
      sequence: 1,
      startDate: "2026-01-31",
      endDate: "2026-02-27",
      payDate: "2026-02-27",
    });
  });
});

describe("generatePayPeriods, weekly & biweekly", () => {
  it("weekly periods are 7 days, pay date offset applied", () => {
    expect(
      generatePayPeriods({
        frequency: "WEEKLY",
        anchorDate: "2026-01-05",
        count: 2,
        payDateOffsetDays: 2,
      }),
    ).toEqual([
      { sequence: 1, startDate: "2026-01-05", endDate: "2026-01-11", payDate: "2026-01-13" },
      { sequence: 2, startDate: "2026-01-12", endDate: "2026-01-18", payDate: "2026-01-20" },
    ]);
  });

  it("biweekly periods are 14 days", () => {
    expect(
      generatePayPeriods({ frequency: "BIWEEKLY", anchorDate: "2026-01-01", count: 2 }),
    ).toEqual([
      { sequence: 1, startDate: "2026-01-01", endDate: "2026-01-14", payDate: "2026-01-14" },
      { sequence: 2, startDate: "2026-01-15", endDate: "2026-01-28", payDate: "2026-01-28" },
    ]);
  });
});

describe("generatePayPeriods, semi-monthly & annual", () => {
  it("splits each month 1st–15th and 16th–end (Feb honours length)", () => {
    expect(
      generatePayPeriods({ frequency: "SEMI_MONTHLY", anchorDate: "2026-01-01", count: 4 }),
    ).toEqual([
      { sequence: 1, startDate: "2026-01-01", endDate: "2026-01-15", payDate: "2026-01-15" },
      { sequence: 2, startDate: "2026-01-16", endDate: "2026-01-31", payDate: "2026-01-31" },
      { sequence: 3, startDate: "2026-02-01", endDate: "2026-02-15", payDate: "2026-02-15" },
      { sequence: 4, startDate: "2026-02-16", endDate: "2026-02-28", payDate: "2026-02-28" },
    ]);
  });

  it("annual periods span a full calendar year", () => {
    expect(generatePayPeriods({ frequency: "ANNUAL", anchorDate: "2026-01-01", count: 2 })).toEqual(
      [
        { sequence: 1, startDate: "2026-01-01", endDate: "2026-12-31", payDate: "2026-12-31" },
        { sequence: 2, startDate: "2027-01-01", endDate: "2027-12-31", payDate: "2027-12-31" },
      ],
    );
  });
});

describe("generatePayPeriods, sequencing, determinism, validation", () => {
  it("starts numbering at startSequence (for appending periods later)", () => {
    const periods = generatePayPeriods({
      frequency: "MONTHLY",
      anchorDate: "2026-01-01",
      count: 2,
      startSequence: 4,
    });
    expect(periods.map((p) => p.sequence)).toEqual([4, 5]);
  });

  it("is deterministic: identical inputs yield identical output", () => {
    const args = { frequency: "BIWEEKLY", anchorDate: "2026-03-09", count: 26 } as const;
    expect(generatePayPeriods(args)).toEqual(generatePayPeriods(args));
  });

  it("returns nothing for a zero count", () => {
    expect(
      generatePayPeriods({ frequency: "MONTHLY", anchorDate: "2026-01-01", count: 0 }),
    ).toEqual([]);
  });

  it("rejects a malformed anchor date and a non-integer count", () => {
    expect(() =>
      generatePayPeriods({ frequency: "MONTHLY", anchorDate: "2026-13-01", count: 1 }),
    ).toThrow(/Invalid calendar date/);
    expect(() =>
      generatePayPeriods({ frequency: "MONTHLY", anchorDate: "01/01/2026", count: 1 }),
    ).toThrow(/expected YYYY-MM-DD/);
    expect(() =>
      generatePayPeriods({ frequency: "MONTHLY", anchorDate: "2026-01-01", count: 1.5 }),
    ).toThrow(/count must be an integer/);
  });
});
