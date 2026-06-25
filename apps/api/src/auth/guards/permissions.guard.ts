import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PermissionKey } from "@payce/rbac";
import type { AuthenticatedRequest } from "../auth.types";
import { PERMISSIONS_METADATA } from "../decorators";

/** Enforces @RequirePermissions metadata against the authenticated principal's permission set. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (required.length === 0) {
      return true;
    }

    const subject = context.switchToHttp().getRequest<AuthenticatedRequest>().subject;
    if (!subject) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "No authenticated principal" });
    }

    for (const permission of required) {
      if (!subject.permissions.has(permission)) {
        throw new ForbiddenException({
          code: "FORBIDDEN",
          message: `Missing required permission: ${permission}`,
        });
      }
    }
    return true;
  }
}
