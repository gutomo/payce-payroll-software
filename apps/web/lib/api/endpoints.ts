import { apiFetch } from "./client";
import type { EmployeeProfile, LoginResult, Me, OrgNode, SessionTokens } from "./types";

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
