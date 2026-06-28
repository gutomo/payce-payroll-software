import type { DemoMetricRow } from "./fixtures";

export interface Bar {
  label: string;
  value: number;
  /** Width as a percentage of the largest bar, 0–100. */
  pct: number;
}

/** Project metric rows into bars sized relative to the largest value (for the demo bar charts). */
export function toBars(rows: readonly DemoMetricRow[]): Bar[] {
  const max = rows.reduce((m, row) => Math.max(m, row.value), 0);
  return rows.map((row) => ({
    label: row.department,
    value: row.value,
    pct: max === 0 ? 0 : Math.round((row.value / max) * 100),
  }));
}
