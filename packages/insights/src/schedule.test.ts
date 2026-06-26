import { describe, expect, it } from "vitest";
import { computeNextRun } from "./schedule";

const iso = (d: Date) => d.toISOString();

describe("computeNextRun", () => {
  it("DAILY: returns today's hour when it is still ahead", () => {
    const from = new Date("2026-06-27T03:00:00.000Z");
    expect(iso(computeNextRun("DAILY", 6, from))).toBe("2026-06-27T06:00:00.000Z");
  });

  it("DAILY: rolls to tomorrow once the hour has passed", () => {
    const from = new Date("2026-06-27T09:00:00.000Z");
    expect(iso(computeNextRun("DAILY", 6, from))).toBe("2026-06-28T06:00:00.000Z");
  });

  it("DAILY: a run exactly at the boundary advances (strictly after `from`)", () => {
    const from = new Date("2026-06-27T06:00:00.000Z");
    expect(iso(computeNextRun("DAILY", 6, from))).toBe("2026-06-28T06:00:00.000Z");
  });

  it("WEEKLY: keeps today when the hour is ahead, else jumps a week", () => {
    expect(iso(computeNextRun("WEEKLY", 6, new Date("2026-06-27T03:00:00.000Z")))).toBe(
      "2026-06-27T06:00:00.000Z",
    );
    expect(iso(computeNextRun("WEEKLY", 6, new Date("2026-06-27T09:00:00.000Z")))).toBe(
      "2026-07-04T06:00:00.000Z",
    );
  });

  it("MONTHLY: advances by a calendar month, preserving day-of-month", () => {
    const from = new Date("2026-06-27T09:00:00.000Z");
    expect(iso(computeNextRun("MONTHLY", 6, from))).toBe("2026-07-27T06:00:00.000Z");
  });

  it("normalises minutes/seconds to the top of the hour", () => {
    const from = new Date("2026-06-27T05:45:30.500Z");
    expect(iso(computeNextRun("DAILY", 6, from))).toBe("2026-06-27T06:00:00.000Z");
  });
});
