import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { PermissionKey } from "@payce/rbac";
import { getRequestContext } from "../../common/request-context";
import type { AuthenticatedRequest } from "../auth.types";
import { TokenService } from "../token.service";

/** Authenticates a request from its bearer access token and attaches the resolved principal. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Missing bearer token" });
    }

    try {
      const claims = this.tokens.verifyAccess(header.slice("Bearer ".length));
      request.subject = {
        userId: claims.sub,
        tenantId: claims.tenantId,
        isPlatform: false,
        roles: claims.roles,
        permissions: new Set(claims.perms as PermissionKey[]),
      };
      const ctx = getRequestContext();
      if (ctx) {
        ctx.tenantId = claims.tenantId;
        ctx.userId = claims.sub;
      }
      return true;
    } catch {
      throw new UnauthorizedException({
        code: "INVALID_TOKEN",
        message: "Invalid or expired token",
      });
    }
  }
}
