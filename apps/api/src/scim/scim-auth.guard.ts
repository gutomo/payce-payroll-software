import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { getRequestContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";

/** The tenant + provider a valid SCIM bearer token resolves to. */
export interface ScimPrincipal {
  tenantId: string;
  providerId: string;
}

export interface ScimRequest extends Request {
  scim?: ScimPrincipal;
}

/**
 * Authenticates a SCIM request from its bearer token. The token's SHA-256 hash is looked up in the
 * platform-plane scim_credential table (NOT RLS) — this resolves the tenant BEFORE any tenant context
 * exists, exactly as login resolves a tenant by slug. Disabling SCIM deletes the credential, so a
 * missing credential simply fails authentication. Every operation downstream is tenant-scoped.
 */
@Injectable()
export class ScimAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ScimRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Missing bearer token" });
    }
    const tokenHash = createHash("sha256").update(header.slice("Bearer ".length)).digest("hex");
    const credential = await this.prisma.scimCredential.findUnique({ where: { tokenHash } });
    if (!credential) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Invalid SCIM token" });
    }

    request.scim = { tenantId: credential.tenantId, providerId: credential.providerId };
    const ctx = getRequestContext();
    if (ctx) {
      ctx.tenantId = credential.tenantId;
    }
    return true;
  }
}

/** Inject the resolved {@link ScimPrincipal} into a handler. */
export const CurrentScim = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ScimPrincipal => {
    const request = ctx.switchToHttp().getRequest<ScimRequest>();
    if (!request.scim) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "No SCIM principal" });
    }
    return request.scim;
  },
);
