/** Parse a `YYYY-MM-DD` string to a UTC-midnight Date (matches Prisma `@db.Date` semantics). */
export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Count working days (Mon–Fri) between two dates, inclusive, in UTC. Weekends are excluded so a
 * leave request's day count lines up with the working-day basis payroll uses to dock unpaid leave.
 * Deterministic and pure, no holiday calendar yet (a later enhancement).
 */
export function countWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cursor.getTime() <= last) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
