import type { PermissionKey } from "@payce/rbac";
import type { Request } from "express";

/** The authenticated principal attached to a request by the auth guards. Satisfies rbac's AccessSubject. */
export interface AuthPrincipal {
  userId: string | null;
  tenantId: string | null;
  isPlatform: boolean;
  roles: string[];
  permissions: ReadonlySet<PermissionKey>;
}

export interface AuthenticatedRequest extends Request {
  subject?: AuthPrincipal;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
}

export type LoginResult =
  | ({ mfaRequired: false } & SessionTokens)
  | { mfaRequired: true; mfaToken: string };
