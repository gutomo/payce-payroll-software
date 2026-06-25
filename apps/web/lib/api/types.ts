/**
 * Hand-written mirrors of the API response shapes this slice consumes. These are the de-facto
 * contract between web and API for now; when OpenAPI codegen lands (CLAUDE.md DoD) they move to
 * `packages/contracts` and these get deleted. Dates cross the wire as ISO strings (JSON has no Date),
 * and money is intentionally absent here — compensation is a separate, permissioned endpoint.
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

/** The caller's own employee record — `GET /me/employee` (DETAIL_SELECT on the API). */
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

/** A node in the reporting tree — `GET /org/tree`. Recursive: each node carries its direct reports. */
export interface OrgNode {
  id: string;
  employeeNumber: string;
  name: string;
  reports: OrgNode[];
}

/** The authenticated user — `GET /me`. `permissions` gates what the UI offers (server still enforces). */
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

/** `POST /auth/login` — either issues a session or demands a second factor. */
export type LoginResult =
  | ({ mfaRequired: false } & SessionTokens)
  | { mfaRequired: true; mfaToken: string };
