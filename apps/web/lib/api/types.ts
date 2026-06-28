/**
 * Hand-written mirrors of the API response shapes this slice consumes. These are the de-facto
 * contract between web and API for now; when OpenAPI codegen lands (CLAUDE.md DoD) they move to
 * `packages/contracts` and these get deleted. Dates cross the wire as ISO strings (JSON has no Date),
 * and money is intentionally absent here; compensation is a separate, permissioned endpoint.
 */

export type EmployeeStatus = "ACTIVE" | "ON_LEAVE" | "TERMINATED";

export interface NamedRef {
  id: string;
  name: string;
}

export interface CostCenterRef {
  id: string;
  code: string;
  name: string;
}

export interface ManagerRef {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
}

/** The caller's own employee record: `GET /me/employee` (DETAIL_SELECT on the API). */
export interface EmployeeProfile {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  workEmail: string | null;
  status: EmployeeStatus;
  hireDate: string;
  terminationDate: string | null;
  department: NamedRef | null;
  location: NamedRef | null;
  costCenter: CostCenterRef | null;
  manager: ManagerRef | null;
}

/** A node in the reporting tree: `GET /org/tree`. Recursive: each node carries its direct reports. */
export interface OrgNode {
  id: string;
  employeeNumber: string;
  name: string;
  reports: OrgNode[];
}

/** The authenticated user: `GET /me`. `permissions` gates what the UI offers (server still enforces). */
export interface Me {
  id: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
}

/** `POST /auth/login`: either issues a session or demands a second factor. */
export type LoginResult =
  | ({ mfaRequired: false } & SessionTokens)
  | { mfaRequired: true; mfaToken: string };

// ─────────────────────────── Insights (reporting) ───────────────────────────

export type FieldType = "string" | "enum" | "number" | "date";
export type MeasureUnit = "count" | "currency_minor" | "days";

/** The no-code builder's catalog: `GET /insights/datasets`. No SQL ever crosses the wire. */
export interface DatasetSummary {
  key: string;
  label: string;
  dimensions: { key: string; label: string; type: FieldType }[];
  measures: { key: string; label: string; unit: MeasureUnit }[];
}

/** A coerced report cell: bigint/Decimal money are already numbers by the time they reach us. */
export type CellValue = string | number | null;

export interface ColumnMeta {
  key: string;
  label: string;
  kind: "dimension" | "measure";
  /** Set for dimensions. */
  type?: FieldType;
  /** Set for measures (drives display formatting). */
  unit?: MeasureUnit;
}

/** An executed report: `POST /insights/reports/run` (ad-hoc) or `.../reports/:id/run` (saved). */
export interface ReportResult {
  columns: ColumnMeta[];
  rows: Record<string, CellValue>[];
}

export interface ReportSort {
  key: string;
  direction: "asc" | "desc";
}

/** The structured, no-code spec the builder posts; values are data, never SQL. */
export interface ReportSpec {
  dataset: string;
  dimensions: string[];
  measures: string[];
  sort?: ReportSort;
  limit?: number;
}

/** A saved report definition: `GET /insights/reports`. */
export interface SavedReport {
  id: string;
  name: string;
  description: string | null;
  dataset: string;
  definition: ReportSpec;
  createdAt: string;
  updatedAt: string;
}

export type ReportCadence = "DAILY" | "WEEKLY" | "MONTHLY";
export type ReportFormat = "CSV" | "XLSX";

/** A recurring delivery of a saved report: `GET /insights/schedules`. */
export interface ReportSchedule {
  id: string;
  reportDefinitionId: string;
  cadence: ReportCadence;
  format: ReportFormat;
  hourUtc: number;
  recipients: string[];
  isActive: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body for `POST /insights/reports` (save a built report). */
export interface CreateReportInput {
  name: string;
  description?: string;
  spec: ReportSpec;
}

/** Body for `POST /insights/reports/:id/schedules`. */
export interface CreateScheduleInput {
  cadence: ReportCadence;
  format: ReportFormat;
  hourUtc: number;
  recipients: string[];
}

export interface PrebuiltDashboardMeta {
  key: string;
  title: string;
  description: string;
  chart: "bar" | "table";
}

/** A prebuilt dashboard with its executed data: `GET /insights/dashboards/prebuilt/:key`. */
export interface PrebuiltDashboardData {
  key: string;
  title: string;
  chart: "bar" | "table";
  result: ReportResult;
}

// ─────────────────────────── Assist (AI assistant) ───────────────────────────

export type AssistRole = "USER" | "ASSISTANT";

export interface AssistCitation {
  articleId: string;
  title: string;
}

/** One persisted turn: part of `POST /assist/messages` and `GET /assist/conversations/:id`. */
export interface AssistMessage {
  id: string;
  role: AssistRole;
  content: string;
  usedTools: string[];
  citations: AssistCitation[] | null;
  confidence: number | null;
  escalated: boolean;
  escalationReason: "LOW_CONFIDENCE" | "SENSITIVE_TOPIC" | null;
  createdAt: string;
}

/** `POST /assist/messages`: the assistant's reply plus where it landed. */
export interface SendMessageResponse {
  conversationId: string;
  message: AssistMessage;
  escalated: boolean;
  escalationId: string | null;
}
