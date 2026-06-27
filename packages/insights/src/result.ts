import type { FieldType, MeasureUnit } from "./catalog";

/** Metadata describing one output column of a compiled/executed report. */
export interface ColumnMeta {
  key: string;
  label: string;
  kind: "dimension" | "measure";
  /** Set for dimensions. */
  type?: FieldType;
  /** Set for measures. */
  unit?: MeasureUnit;
}

/** A cell value after the executor has coerced DB types (bigint/Decimal → number). */
export type CellValue = string | number | null;

/** The executed result of a report: ordered columns + rows keyed by column `key`. */
export interface ReportResult {
  columns: ColumnMeta[];
  rows: Array<Record<string, CellValue>>;
}
