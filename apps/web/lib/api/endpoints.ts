import { apiFetch } from "./client";
import type {
  CreateReportInput,
  CreateScheduleInput,
  DatasetSummary,
  EmployeeProfile,
  LoginResult,
  Me,
  OrgNode,
  PrebuiltDashboardData,
  PrebuiltDashboardMeta,
  ReportResult,
  ReportSchedule,
  ReportSpec,
  SavedReport,
  SessionTokens,
} from "./types";

/** Typed wrappers over the API endpoints this slice uses. Auth'd reads take the caller's access token. */

export function login(credentials: {
  tenantSlug: string;
  email: string;
  password: string;
}): Promise<LoginResult> {
  return apiFetch<LoginResult>("/auth/login", { method: "POST", body: credentials });
}

export function verifyMfa(input: { mfaToken: string; code: string }): Promise<SessionTokens> {
  return apiFetch<SessionTokens>("/auth/mfa/verify", { method: "POST", body: input });
}

export function refresh(refreshToken: string): Promise<SessionTokens> {
  return apiFetch<SessionTokens>("/auth/refresh", { method: "POST", body: { refreshToken } });
}

export function getMe(token: string): Promise<Me> {
  return apiFetch<Me>("/me", { token });
}

export function getMyProfile(token: string): Promise<EmployeeProfile> {
  return apiFetch<EmployeeProfile>("/me/employee", { token });
}

export function getOrgTree(token: string): Promise<OrgNode[]> {
  return apiFetch<OrgNode[]>("/org/tree", { token });
}

// ── Insights ──

export async function getDatasets(token: string): Promise<DatasetSummary[]> {
  const res = await apiFetch<{ data: DatasetSummary[] }>("/insights/datasets", { token });
  return res.data;
}

export function runReport(token: string, spec: ReportSpec): Promise<ReportResult> {
  return apiFetch<ReportResult>("/insights/reports/run", { method: "POST", token, body: spec });
}

export function runSavedReport(token: string, id: string): Promise<ReportResult> {
  return apiFetch<ReportResult>(`/insights/reports/${id}/run`, { method: "POST", token });
}

export async function listReports(token: string): Promise<SavedReport[]> {
  const res = await apiFetch<{ data: SavedReport[] }>("/insights/reports", { token });
  return res.data;
}

export function createReport(token: string, input: CreateReportInput): Promise<SavedReport> {
  return apiFetch<SavedReport>("/insights/reports", { method: "POST", token, body: input });
}

export function deleteReport(token: string, id: string): Promise<void> {
  return apiFetch<void>(`/insights/reports/${id}`, { method: "DELETE", token });
}

// ── Scheduled deliveries ──

export async function listSchedules(token: string, reportId?: string): Promise<ReportSchedule[]> {
  const path = reportId
    ? `/insights/schedules?reportId=${encodeURIComponent(reportId)}`
    : "/insights/schedules";
  const res = await apiFetch<{ data: ReportSchedule[] }>(path, { token });
  return res.data;
}

export function createSchedule(
  token: string,
  reportId: string,
  input: CreateScheduleInput,
): Promise<ReportSchedule> {
  return apiFetch<ReportSchedule>(`/insights/reports/${reportId}/schedules`, {
    method: "POST",
    token,
    body: input,
  });
}

export function updateSchedule(
  token: string,
  id: string,
  patch: Partial<CreateScheduleInput> & { isActive?: boolean },
): Promise<ReportSchedule> {
  return apiFetch<ReportSchedule>(`/insights/schedules/${id}`, {
    method: "PATCH",
    token,
    body: patch,
  });
}

export function deleteSchedule(token: string, id: string): Promise<void> {
  return apiFetch<void>(`/insights/schedules/${id}`, { method: "DELETE", token });
}

export async function listPrebuiltDashboards(token: string): Promise<PrebuiltDashboardMeta[]> {
  const res = await apiFetch<{ data: PrebuiltDashboardMeta[] }>("/insights/dashboards/prebuilt", {
    token,
  });
  return res.data;
}

export function runPrebuiltDashboard(token: string, key: string): Promise<PrebuiltDashboardData> {
  return apiFetch<PrebuiltDashboardData>(`/insights/dashboards/prebuilt/${key}`, { token });
}
