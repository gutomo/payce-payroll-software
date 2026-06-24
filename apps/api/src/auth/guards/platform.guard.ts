import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PLATFORM_PERMISSIONS, ROLES } from "@payce/rbac";
import { safeEqual } from "../../common/timing-safe";
import type { Env } from "../../config/env";
import type { AuthenticatedRequest } from "../auth.types";

/**
 * Authenticates platform-plane requests via the `x-platform-admin-key` header. This is the only
 * non-tenant principal; it stands in for a platform Super Admin until full platform auth lands.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers["x-platform-admin-key"];
    const provided = Array.isArray(header) ? header[0] : header;
    const expected = this.config.get("PLATFORM_ADMIN_KEY", { infer: true });

    if (!provided || !safeEqual(provided, expected)) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Invalid platform credentials",
      });
    }

    request.subject = {
      userId: null,
      tenantId: null,
      isPlatform: true,
      roles: [ROLES.SUPER_ADMIN],
      permissions: new Set(PLATFORM_PERMISSIONS),
    };
    return true;
  }
}
