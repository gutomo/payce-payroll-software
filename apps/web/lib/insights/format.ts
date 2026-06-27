/**
 * Pure presentation helpers for executed reports: how a cell is shown, and how a result reduces to
 * horizontal-bar data. No React, no I/O, fully unit-tested. Money arrives as integer minor units
 * (CLAUDE.md money rule) and is shown as major units with two decimals; the currency symbol is
 * intentionally omitted because a report can span pay groups in different currencies.
 */

import type {
  CellValue,
  ColumnMeta,
  MeasureUnit,
  ReportCadence,
  ReportSchedule,
  ReportResult,
} from "@/lib/api/types";

/** Render a dimension value; null/empty groups become a readable placeholder (mirrors the API/CSV). */
export function displayDimension(value: CellValue): string {
  if (value === null || value === "") return "(none)";
  return String(value);
}

function toNumber(value: CellValue): number {
  if (typeof value === "number") return value;
  if (value === null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Format a measure for display, honouring its unit (count, money minor units, or days). */
export function formatMeasure(value: CellValue, unit: MeasureUnit | undefined): string {
  const n = toNumber(value);
  if (unit === "currency_minor") {
    return (n / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (unit === "days") {
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return n.toLocaleString("en-US");
}

/** Format any cell by its column kind: dimensions via the placeholder rule, measures by unit. */
export function formatCell(value: CellValue, column: ColumnMeta): string {
  return column.kind === "measure" ? formatMeasure(value, column.unit) : displayDimension(value);
}

export function primaryMeasure(result: ReportResult): ColumnMeta | undefined {
  return result.columns.find((c) => c.kind === "measure");
}

export function primaryDimension(result: ReportResult): ColumnMeta | undefined {
  return result.columns.find((c) => c.kind === "dimension");
}

export interface Bar {
  label: string;
  value: string;
  /** 0..1 share of the largest absolute value in the series; drives the bar width. */
  ratio: number;
}

/**
 * Reduce a result to bars for the first measure across the first dimension. Ratios are relative to
 * the largest magnitude so a single tall bar doesn't dwarf the rest into invisibility; negative
 * values (rare for these measures) still get a visible width via the absolute magnitude.
 */
export function toBars(result: ReportResult): Bar[] {
  const measure = primaryMeasure(result);
  if (!measure) return [];
  const dimension = primaryDimension(result);

  const rows = result.rows.map((row) => ({
    label: dimension ? displayDimension(row[dimension.key] ?? null) : measure.label,
    raw: toNumber(row[measure.key] ?? null),
  }));
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.raw)), 0);

  return rows.map((r) => ({
    label: r.label,
    value: formatMeasure(r.raw, measure.unit),
    ratio: max > 0 ? Math.abs(r.raw) / max : 0,
  }));
}

// ── Schedules ──

const CADENCE_LABEL: Record<ReportCadence, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

/**
 * Split a free-text recipients field into a clean, de-duplicated list. Recipients are entered one per
 * line or comma/semicolon separated; this just tidies the input, the API is the authority on whether
 * each is a valid (synthetic) email address.
 */
export function parseRecipients(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim();
    if (email) seen.add(email);
  }
  return [...seen];
}

/** A one-line human summary of a schedule, e.g. "Daily at 06:00 UTC · XLSX · 2 recipients". */
export function describeSchedule(schedule: ReportSchedule): string {
  const hour = String(schedule.hourUtc).padStart(2, "0");
  const count = schedule.recipients.length;
  const recipients = `${count} recipient${count === 1 ? "" : "s"}`;
  return `${CADENCE_LABEL[schedule.cadence]} at ${hour}:00 UTC · ${schedule.format} · ${recipients}`;
}

/** Format an ISO timestamp as a readable UTC instant, e.g. "27 Jun 2026, 06:00 UTC". */
export function formatRunAt(iso: string): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return `${formatted} UTC`;
}

/** A stable React key for a result row: its dimension values joined, or "total" when ungrouped. */
export function rowKey(result: ReportResult, row: Record<string, CellValue>): string {
  const dims = result.columns.filter((c) => c.kind === "dimension");
  if (dims.length === 0) return "total";
  return dims.map((c) => String(row[c.key] ?? "")).join("");
}
