import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@payce/rbac";
import type { AuthenticatedRequest, AuthPrincipal } from "./auth.types";

export const PERMISSIONS_METADATA = "required_permissions";

/** Require the caller to hold all listed permissions (enforced by PermissionsGuard). */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

/** Inject the authenticated principal into a handler parameter. */
export const CurrentSubject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.subject) {
      throw new Error("CurrentSubject used on a route without an auth guard");
    }
    return request.subject;
  },
);
