/**
 * The reporting catalog: the allow-list of datasets, dimensions, and measures the DIY report builder
 * can query. Every `sql` fragment here is authored by us and is the ONLY source of SQL identifiers
 * the compiler ever emits. Report specs reference fields by `key` only; user input never lands in
 * identifier position (filter *values* are bound parameters, see ./compile). This is what makes the
 * no-code builder injection-safe.
 *
 * Tenant isolation is NOT expressed here: it is enforced by Postgres Row-Level Security on every
 * table (the executor runs each query inside `runInTenant`). The catalog assumes a tenant-scoped
 * connection and never adds a tenant predicate.
 */

export type FieldType = "string" | "enum" | "number" | "date";

export type MeasureUnit = "count" | "currency_minor" | "days";

export interface DimensionDef {
  /** Stable API key referenced by report specs (e.g. "department"). */
  readonly key: string;
  readonly label: string;
  /** Allow-listed SQL expression yielding the group value (e.g. "dept.name"). */
  readonly sql: string;
  readonly type: FieldType;
}

export interface MeasureDef {
  readonly key: string;
  readonly label: string;
  /** Allow-listed aggregate SQL expression (e.g. "COUNT(DISTINCT e.id)"). */
  readonly sql: string;
  readonly unit: MeasureUnit;
}

export interface DatasetDef {
  readonly key: string;
  readonly label: string;
  /** Allow-listed FROM + JOINs; aliases here are referenced by dimension/measure `sql`. */
  readonly from: string;
  /** Predicate always applied (e.g. exclude soft-deleted rows). */
  readonly baseWhere?: string;
  readonly dimensions: readonly DimensionDef[];
  readonly measures: readonly MeasureDef[];
}

const EMPLOYEES: DatasetDef = {
  key: "employees",
  label: "Employees",
  // Current compensation = the open record (effective_to IS NULL). RLS filters every joined table.
  from: `"employee" e
    LEFT JOIN "department" dept ON dept.id = e.department_id
    LEFT JOIN "location" loc ON loc.id = e.location_id
    LEFT JOIN "cost_center" cc ON cc.id = e.cost_center_id
    LEFT JOIN "compensation_record" comp ON comp.employee_id = e.id AND comp.effective_to IS NULL`,
  baseWhere: "e.deleted_at IS NULL",
  dimensions: [
    { key: "department", label: "Department", sql: "dept.name", type: "string" },
    { key: "location", label: "Location", sql: "loc.name", type: "string" },
    { key: "costCenter", label: "Cost centre", sql: "cc.name", type: "string" },
    { key: "status", label: "Status", sql: "e.status::text", type: "enum" },
  ],
  measures: [
    // COUNT(DISTINCT e.id) so the compensation LEFT JOIN can never inflate the head count.
    { key: "headcount", label: "Headcount", sql: "COUNT(DISTINCT e.id)", unit: "count" },
    {
      key: "totalCompensationMinor",
      label: "Total compensation",
      sql: "COALESCE(SUM(comp.amount_minor), 0)",
      unit: "currency_minor",
    },
    {
      key: "avgCompensationMinor",
      label: "Average compensation",
      sql: "COALESCE(ROUND(AVG(comp.amount_minor)), 0)",
      unit: "currency_minor",
    },
  ],
};

const LEAVE: DatasetDef = {
  key: "leave",
  label: "Leave requests",
  from: `"leave_request" lr
    JOIN "leave_type" lt ON lt.id = lr.leave_type_id`,
  dimensions: [
    { key: "leaveType", label: "Leave type", sql: "lt.name", type: "string" },
    { key: "status", label: "Status", sql: "lr.status::text", type: "enum" },
  ],
  measures: [
    { key: "requestCount", label: "Requests", sql: "COUNT(*)", unit: "count" },
    { key: "totalDays", label: "Total days", sql: "COALESCE(SUM(lr.days), 0)", unit: "days" },
  ],
};

export const DATASETS: readonly DatasetDef[] = [EMPLOYEES, LEAVE];

export function getDataset(key: string): DatasetDef | undefined {
  return DATASETS.find((d) => d.key === key);
}

export function getDimension(dataset: DatasetDef, key: string): DimensionDef | undefined {
  return dataset.dimensions.find((d) => d.key === key);
}

export function getMeasure(dataset: DatasetDef, key: string): MeasureDef | undefined {
  return dataset.measures.find((m) => m.key === key);
}

/** Catalog projected to plain data for API/UX discovery (no SQL fragments leak to clients). */
export interface DatasetSummary {
  key: string;
  label: string;
  dimensions: { key: string; label: string; type: FieldType }[];
  measures: { key: string; label: string; unit: MeasureUnit }[];
}

export function datasetSummaries(): DatasetSummary[] {
  return DATASETS.map((d) => ({
    key: d.key,
    label: d.label,
    dimensions: d.dimensions.map((dim) => ({ key: dim.key, label: dim.label, type: dim.type })),
    measures: d.measures.map((m) => ({ key: m.key, label: m.label, unit: m.unit })),
  }));
}
