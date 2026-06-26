import { apiFetch } from "./client";
import type {
  DatasetSummary,
  EmployeeProfile,
  LoginResult,
  Me,
  OrgNode,
  PrebuiltDashboardData,
  PrebuiltDashboardMeta,
  ReportResult,
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

export async function listPrebuiltDashboards(token: string): Promise<PrebuiltDashboardMeta[]> {
  const res = await apiFetch<{ data: PrebuiltDashboardMeta[] }>("/insights/dashboards/prebuilt", {
    token,
  });
  return res.data;
}

export function runPrebuiltDashboard(token: string, key: string): Promise<PrebuiltDashboardData> {
  return apiFetch<PrebuiltDashboardData>(`/insights/dashboards/prebuilt/${key}`, { token });
}
