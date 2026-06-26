import {
  type DatasetDef,
  type DimensionDef,
  type FieldType,
  getDataset,
  getDimension,
  getMeasure,
  type MeasureDef,
} from "./catalog";
import { type FilterOperator, type ReportFilter, type ReportSpec } from "./report";
import type { ColumnMeta } from "./result";

/** Thrown when a spec references unknown fields or uses an operator illegal for a field's type. */
export class ReportCompileError extends Error {
  constructor(
    message: string,
    readonly code = "REPORT_INVALID",
  ) {
    super(message);
    this.name = "ReportCompileError";
  }
}

export interface CompiledColumn extends ColumnMeta {
  /** The SELECT alias this column is emitted under (e.g. "d0", "m1"). */
  alias: string;
}

/**
 * A fully-resolved, parameterised query. `sql` contains ONLY allow-listed identifiers from the
 * catalog; every value from the spec (filter operands) is a bound parameter in `params`. Safe to
 * hand to the executor, which runs it inside a tenant-scoped (RLS) transaction.
 */
export interface QueryPlan {
  sql: string;
  params: Array<string | number>;
  columns: CompiledColumn[];
}

const OPERATORS_BY_TYPE: Record<FieldType, readonly FilterOperator[]> = {
  string: ["eq", "ne", "in", "contains"],
  enum: ["eq", "ne", "in"],
  number: ["eq", "ne", "in", "gt", "gte", "lt", "lte"],
  date: ["eq", "ne", "in", "gt", "gte", "lt", "lte"],
};

const COMPARATORS: Partial<Record<FilterOperator, string>> = {
  eq: "=",
  ne: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

/** Compile a validated spec into a parameterised SQL query plan, checked against the catalog. */
export function compileReport(spec: ReportSpec): QueryPlan {
  const dataset = getDataset(spec.dataset);
  if (!dataset) {
    throw new ReportCompileError(`Unknown dataset: ${spec.dataset}`, "UNKNOWN_DATASET");
  }

  const dimensions = spec.dimensions.map((key) => requireDimension(dataset, key));
  const measures = spec.measures.map((key) => requireMeasure(dataset, key));

  const columns: CompiledColumn[] = [
    ...dimensions.map<CompiledColumn>((dim, i) => ({
      key: dim.key,
      label: dim.label,
      kind: "dimension",
      type: dim.type,
      alias: `d${i}`,
    })),
    ...measures.map<CompiledColumn>((m, i) => ({
      key: m.key,
      label: m.label,
      kind: "measure",
      unit: m.unit,
      alias: `m${i}`,
    })),
  ];

  const selectParts = [
    ...dimensions.map((dim, i) => `${dim.sql} AS "d${i}"`),
    ...measures.map((m, i) => `${m.sql} AS "m${i}"`),
  ];

  const params: Array<string | number> = [];
  const bind = (value: string | number): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const whereParts: string[] = [];
  if (dataset.baseWhere) whereParts.push(dataset.baseWhere);
  for (const filter of spec.filters) {
    whereParts.push(compileFilter(dataset, filter, bind));
  }

  const groupBy = dimensions.map((dim) => dim.sql);
  const orderBy = compileOrderBy(spec, dimensions, measures);

  const sql = [
    `SELECT ${selectParts.join(", ")}`,
    `FROM ${dataset.from}`,
    whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "",
    groupBy.length ? `GROUP BY ${groupBy.join(", ")}` : "",
    orderBy.length ? `ORDER BY ${orderBy.join(", ")}` : "",
    `LIMIT ${spec.limit}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { sql, params, columns };
}

function requireDimension(dataset: DatasetDef, key: string): DimensionDef {
  const dim = getDimension(dataset, key);
  if (!dim) {
    throw new ReportCompileError(
      `Unknown dimension '${key}' for dataset '${dataset.key}'`,
      "UNKNOWN_DIMENSION",
    );
  }
  return dim;
}

function requireMeasure(dataset: DatasetDef, key: string): MeasureDef {
  const measure = getMeasure(dataset, key);
  if (!measure) {
    throw new ReportCompileError(
      `Unknown measure '${key}' for dataset '${dataset.key}'`,
      "UNKNOWN_MEASURE",
    );
  }
  return measure;
}

function compileFilter(
  dataset: DatasetDef,
  filter: ReportFilter,
  bind: (value: string | number) => string,
): string {
  // Filters apply to dimension fields (WHERE); aggregate measures are never filtered (no HAVING).
  const dim = getDimension(dataset, filter.field);
  if (!dim) {
    throw new ReportCompileError(
      `Unknown filter field '${filter.field}' for dataset '${dataset.key}'`,
      "UNKNOWN_FILTER_FIELD",
    );
  }
  if (!OPERATORS_BY_TYPE[dim.type].includes(filter.op)) {
    throw new ReportCompileError(
      `Operator '${filter.op}' is not allowed on '${filter.field}' (${dim.type})`,
      "INVALID_OPERATOR",
    );
  }

  const expr = dim.sql;
  const value = filter.value;

  if (filter.op === "in") {
    const values = Array.isArray(value) ? value : [value];
    const placeholders = values.map((v) => bind(v));
    return `${expr} IN (${placeholders.join(", ")})`;
  }

  if (Array.isArray(value)) {
    throw new ReportCompileError(
      `Operator '${filter.op}' expects a single value, not a list`,
      "INVALID_OPERATOR",
    );
  }

  if (filter.op === "contains") {
    // Case-insensitive substring; the operand is bound, never concatenated into the SQL text.
    return `${expr} ILIKE '%' || ${bind(value)} || '%'`;
  }

  const comparator = COMPARATORS[filter.op];
  // Unreachable given the per-type allow-list above, but keep the compiler total.
  if (!comparator) {
    throw new ReportCompileError(`Unsupported operator '${filter.op}'`, "INVALID_OPERATOR");
  }
  return `${expr} ${comparator} ${bind(value)}`;
}

function compileOrderBy(
  spec: ReportSpec,
  dimensions: DimensionDef[],
  measures: MeasureDef[],
): string[] {
  const aliasFor = (key: string): string | undefined => {
    const di = dimensions.findIndex((d) => d.key === key);
    if (di >= 0) return `d${di}`;
    const mi = measures.findIndex((m) => m.key === key);
    if (mi >= 0) return `m${mi}`;
    return undefined;
  };

  const order: string[] = [];
  if (spec.sort) {
    const alias = aliasFor(spec.sort.key);
    if (!alias) {
      throw new ReportCompileError(
        `Sort key '${spec.sort.key}' is not a selected dimension or measure`,
        "INVALID_SORT",
      );
    }
    order.push(`"${alias}" ${spec.sort.direction === "desc" ? "DESC" : "ASC"}`);
  } else if (measures.length > 0) {
    // Sensible default for an analytic report: biggest measure first.
    order.push(`"m0" DESC`);
  } else if (dimensions.length > 0) {
    order.push(`"d0" ASC`);
  }

  // Deterministic tiebreaker so equal-measure groups (and tests) have a stable order.
  if (dimensions.length > 0) {
    const tiebreaker = `"d0" ASC`;
    if (!order.includes(tiebreaker)) order.push(tiebreaker);
  }
  return order;
}
