/** Format an ISO date string as e.g. "Mar 5, 2021". Fixed locale + UTC so server-rendered output is
 *  stable regardless of the server's timezone. Returns a hyphen for null/empty/invalid input. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
