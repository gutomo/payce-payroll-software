import type { CellValue, ReportResult } from "./result";

/** Render a dimension value for display; null/empty groups become a readable placeholder. */
export function displayDimension(value: CellValue): string {
  if (value === null || value === "") return "(none)";
  return String(value);
}

/** Render any cell to a plain string (measures as-is; dimensions via the placeholder rule). */
function cellToString(value: CellValue, kind: "dimension" | "measure"): string {
  if (kind === "dimension") return displayDimension(value);
  if (value === null) return "0";
  return String(value);
}

/** RFC 4180 field escaping: quote when the value contains a comma, quote, CR, or LF. */
function escapeCsv(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Serialise an executed report to CSV (header = column labels). Pure string building; the API wraps
 * this for the `text/csv` download and as the row source for the XLSX export.
 */
export function reportToCsv(result: ReportResult): string {
  const header = result.columns.map((c) => escapeCsv(c.label)).join(",");
  const lines = result.rows.map((row) =>
    result.columns.map((c) => escapeCsv(cellToString(row[c.key] ?? null, c.kind))).join(","),
  );
  return [header, ...lines].join("\r\n");
}

/** Rows reduced to ordered string matrices (header + body), for renderers that want plain cells. */
export function reportToMatrix(result: ReportResult): { header: string[]; body: string[][] } {
  return {
    header: result.columns.map((c) => c.label),
    body: result.rows.map((row) =>
      result.columns.map((c) => cellToString(row[c.key] ?? null, c.kind)),
    ),
  };
}
