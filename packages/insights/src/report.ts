import { z } from "zod";
import type { ColumnMeta } from "./result";

/**
 * The structured, no-code report spec produced by the DIY builder and stored in
 * `report_definition.definition`. It is plain data (field *keys* + filter *values*), never SQL.
 * Shape-validation lives here; semantic validation against the catalog (do these keys exist? is this
 * operator legal for the field's type?) lives in ./compile.
 */

export const FILTER_OPERATORS = ["eq", "ne", "in", "contains", "gt", "gte", "lt", "lte"] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

const scalar = z.union([z.string(), z.number()]);

export const ReportFilterSchema = z
  .object({
    field: z.string().min(1),
    op: z.enum(FILTER_OPERATORS),
    value: z.union([scalar, z.array(scalar).min(1).max(100)]),
  })
  .strict();
export type ReportFilter = z.infer<typeof ReportFilterSchema>;

export const ReportSortSchema = z
  .object({
    key: z.string().min(1),
    direction: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
export type ReportSort = z.infer<typeof ReportSortSchema>;

export const MAX_REPORT_LIMIT = 1000;
export const DEFAULT_REPORT_LIMIT = 100;

export const ReportSpecSchema = z
  .object({
    dataset: z.string().min(1),
    // A report aggregates: at least one measure. Zero dimensions = a single grand-total row.
    dimensions: z.array(z.string().min(1)).max(5).default([]),
    measures: z.array(z.string().min(1)).min(1).max(10),
    filters: z.array(ReportFilterSchema).max(20).default([]),
    sort: ReportSortSchema.optional(),
    limit: z.number().int().min(1).max(MAX_REPORT_LIMIT).default(DEFAULT_REPORT_LIMIT),
  })
  .strict();
export type ReportSpec = z.infer<typeof ReportSpecSchema>;

/** Parse unknown JSON (e.g. a stored `definition`) into a validated spec; throws on shape errors. */
export function parseReportSpec(input: unknown): ReportSpec {
  return ReportSpecSchema.parse(input);
}

export type { ColumnMeta };
