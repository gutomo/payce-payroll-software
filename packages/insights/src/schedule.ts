/**
 * Pure scheduling arithmetic for recurring report deliveries. The reporting data model stores a
 * `cadence` + `hourUtc`; this computes the next delivery instant from a reference time. Kept pure
 * (the reference `from` is always passed in, never read from the clock) so it is unit-testable and
 * deterministic. The Phase 7 notifications worker calls this with `from = now` at create time and
 * with `from = lastRunAt` after each delivery to advance the schedule.
 */

export type ReportCadence = "DAILY" | "WEEKLY" | "MONTHLY";

/** Days between runs for the fixed-interval cadences; MONTHLY steps by calendar month instead. */
const STEP_DAYS: Record<Exclude<ReportCadence, "MONTHLY">, number> = {
  DAILY: 1,
  WEEKLY: 7,
};

/**
 * The earliest UTC instant at `hourUtc:00:00` on the cadence grid that is strictly after `from`.
 * Starts from today's anchor (today at `hourUtc`) and steps by the cadence until it is in the future:
 * DAILY lands within 24h, WEEKLY/MONTHLY keep today's run if its hour is still ahead, else advance a
 * week / calendar month. Monthly preserves the day-of-month, with JS month-overflow for short months
 * (e.g. the 31st rolls into the following month), acceptable for v1.
 */
export function computeNextRun(cadence: ReportCadence, hourUtc: number, from: Date): Date {
  const candidate = new Date(from.getTime());
  candidate.setUTCHours(hourUtc, 0, 0, 0);

  while (candidate.getTime() <= from.getTime()) {
    if (cadence === "MONTHLY") {
      candidate.setUTCMonth(candidate.getUTCMonth() + 1);
    } else {
      candidate.setUTCDate(candidate.getUTCDate() + STEP_DAYS[cadence]);
    }
  }
  return candidate;
}
