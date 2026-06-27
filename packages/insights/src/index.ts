/**
 * `@payce/insights`, the pure reporting kernel (Phase 5). No I/O: it defines the dataset catalog,
 * validates no-code report specs, and compiles them into parameterised SQL query plans that the API
 * executes inside a tenant-scoped (RLS) transaction. Spec values are always bound parameters, so the
 * builder is injection-safe; tenant isolation is Postgres RLS, never expressed here.
 */

export {
  DATASETS,
  type DatasetDef,
  type DatasetSummary,
  datasetSummaries,
  type DimensionDef,
  type FieldType,
  getDataset,
  getDimension,
  getMeasure,
  type MeasureDef,
  type MeasureUnit,
} from "./catalog";
export {
  DEFAULT_REPORT_LIMIT,
  FILTER_OPERATORS,
  type FilterOperator,
  MAX_REPORT_LIMIT,
  parseReportSpec,
  type ReportFilter,
  ReportFilterSchema,
  type ReportSort,
  ReportSortSchema,
  type ReportSpec,
  ReportSpecSchema,
} from "./report";
export { type CompiledColumn, compileReport, type QueryPlan, ReportCompileError } from "./compile";
export { type CellValue, type ColumnMeta, type ReportResult } from "./result";
export { displayDimension, reportToCsv, reportToMatrix } from "./format";
export { reportToXlsx } from "./xlsx";
export { computeNextRun, type ReportCadence } from "./schedule";
export { getPrebuiltDashboard, PREBUILT_DASHBOARDS, type PrebuiltDashboard } from "./dashboards";
