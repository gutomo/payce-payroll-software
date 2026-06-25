import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Prisma, runInTenant } from "@payce/db";
import { collectPermissions } from "@payce/rbac";
import { randomUUID } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type { LoginDto, MfaActivateDto, MfaVerifyDto, RefreshDto } from "./auth.dto";
import type { AuthPrincipal, LoginResult, SessionTokens } from "./auth.types";
import { PasswordService } from "./crypto/password.service";
import { TotpService } from "./crypto/totp.service";
import { TokenService } from "./token.service";

const INVALID_CREDENTIALS = { code: "INVALID_CREDENTIALS", message: "Invalid credentials" };

type LoadedUser = Prisma.UserGetPayload<{
  include: { credential: true; userRoles: { include: { role: true } } };
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get refreshTtlMs(): number {
    return this.config.get("REFRESH_TOKEN_TTL_DAYS", { infer: true }) * 24 * 60 * 60 * 1000;
  }

  private loadUser(
    tx: Prisma.TransactionClient,
    where: Prisma.UserWhereInput,
  ): Promise<LoadedUser | null> {
    return tx.user.findFirst({
      where,
      include: { credential: true, userRoles: { include: { role: true } } },
    });
  }

  private rolesOf(user: LoadedUser): string[] {
    return user.userRoles.map((ur) => ur.role.key);
  }

  private permsOf(user: LoadedUser): string[] {
    return [
      ...collectPermissions(
        user.userRoles.map((ur) => ({ permissionKeys: ur.role.permissionKeys })),
      ),
    ];
  }

  private async issueSession(
    tx: Prisma.TransactionClient,
    tenantId: string,
    user: LoadedUser,
  ): Promise<SessionTokens> {
    const accessToken = this.tokens.signAccess({
      sub: user.id,
      tenantId,
      roles: this.rolesOf(user),
      perms: this.permsOf(user),
    });
    const { token: secret, hash } = this.tokens.createRefreshToken();
    await tx.refreshToken.create({
      data: {
        tenantId,
        userId: user.id,
        tokenHash: hash,
        family: randomUUID(),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    return { accessToken, refreshToken: `${tenantId}.${secret}`, tokenType: "Bearer" };
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (!tenant || tenant.status !== "ACTIVE") {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const user = await runInTenant(this.prisma, tenant.id, (tx) =>
      this.loadUser(tx, { email: dto.email }),
    );
    if (!user || !user.credential || user.status !== "ACTIVE") {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordOk = await this.passwords.verify(user.credential.passwordHash, dto.password);
    if (!passwordOk) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.credential.mfaEnabled) {
      return { mfaRequired: true, mfaToken: this.tokens.signMfa(user.id, tenant.id) };
    }

    return runInTenant(this.prisma, tenant.id, async (tx) => {
      const session = await this.issueSession(tx, tenant.id, user);
      await this.audit.record(tx, {
        tenantId: tenant.id,
        actorType: "user",
        actorUserId: user.id,
        action: "auth.login",
        entityType: "User",
        entityId: user.id,
      });
      return { mfaRequired: false, ...session };
    });
  }

  async verifyMfa(dto: MfaVerifyDto): Promise<SessionTokens> {
    let claims;
    try {
      claims = this.tokens.verifyMfa(dto.mfaToken);
    } catch {
      throw new UnauthorizedException({
        code: "INVALID_TOKEN",
        message: "Invalid or expired MFA token",
      });
    }

    return runInTenant(this.prisma, claims.tenantId, async (tx) => {
      const user = await this.loadUser(tx, { id: claims.sub });
      if (!user?.credential?.mfaEnabled || !user.credential.mfaSecret) {
        throw new UnauthorizedException(INVALID_CREDENTIALS);
      }
      if (!this.totp.verify(dto.code, user.credential.mfaSecret)) {
        throw new UnauthorizedException({ code: "INVALID_MFA_CODE", message: "Invalid MFA code" });
      }
      const session = await this.issueSession(tx, claims.tenantId, user);
      await this.audit.record(tx, {
        tenantId: claims.tenantId,
        actorType: "user",
        actorUserId: user.id,
        action: "auth.login.mfa",
        entityType: "User",
        entityId: user.id,
      });
      return session;
    });
  }

  async enrollMfa(principal: AuthPrincipal): Promise<{ secret: string; otpauthUrl: string }> {
    const { tenantId, userId } = this.requireTenantUser(principal);
    const secret = this.totp.generateSecret();
    const issuer = this.config.get("TOTP_ISSUER", { infer: true });

    const account = await runInTenant(this.prisma, tenantId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { credential: true },
      });
      if (!user?.credential) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Credential not found" });
      }
      await tx.credential.update({
        where: { userId },
        data: { mfaSecret: secret, mfaEnabled: false },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "auth.mfa.enroll",
        entityType: "Credential",
        entityId: userId,
      });
      return user.email;
    });

    return { secret, otpauthUrl: this.totp.keyUri(account, issuer, secret) };
  }

  async activateMfa(principal: AuthPrincipal, dto: MfaActivateDto): Promise<{ mfaEnabled: true }> {
    const { tenantId, userId } = this.requireTenantUser(principal);

    return runInTenant(this.prisma, tenantId, async (tx) => {
      const credential = await tx.credential.findUnique({ where: { userId } });
      if (!credential?.mfaSecret) {
        throw new BadRequestException({ code: "MFA_NOT_ENROLLED", message: "Enroll MFA first" });
      }
      if (!this.totp.verify(dto.code, credential.mfaSecret)) {
        throw new UnauthorizedException({ code: "INVALID_MFA_CODE", message: "Invalid MFA code" });
      }
      await tx.credential.update({ where: { userId }, data: { mfaEnabled: true } });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "auth.mfa.activate",
        entityType: "Credential",
        entityId: userId,
      });
      return { mfaEnabled: true };
    });
  }

  async refresh(dto: RefreshDto): Promise<SessionTokens> {
    const separator = dto.refreshToken.indexOf(".");
    if (separator <= 0) {
      throw new UnauthorizedException({
        code: "INVALID_REFRESH",
        message: "Invalid refresh token",
      });
    }
    const tenantId = dto.refreshToken.slice(0, separator);
    const secret = dto.refreshToken.slice(separator + 1);
    const tokenHash = this.tokens.hashRefreshToken(secret);

    return runInTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
        // Reuse of an already-rotated token => revoke the whole family (breach response).
        if (existing?.revokedAt) {
          await tx.refreshToken.updateMany({
            where: { family: existing.family, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        throw new UnauthorizedException({
          code: "INVALID_REFRESH",
          message: "Invalid refresh token",
        });
      }

      const user = await this.loadUser(tx, { id: existing.userId });
      if (!user || user.status !== "ACTIVE") {
        throw new UnauthorizedException(INVALID_CREDENTIALS);
      }

      await tx.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
      const accessToken = this.tokens.signAccess({
        sub: user.id,
        tenantId,
        roles: this.rolesOf(user),
        perms: this.permsOf(user),
      });
      const { token: newSecret, hash: newHash } = this.tokens.createRefreshToken();
      await tx.refreshToken.create({
        data: {
          tenantId,
          userId: user.id,
          tokenHash: newHash,
          family: existing.family,
          expiresAt: new Date(Date.now() + this.refreshTtlMs),
        },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: user.id,
        action: "auth.refresh",
        entityType: "User",
        entityId: user.id,
      });
      return { accessToken, refreshToken: `${tenantId}.${newSecret}`, tokenType: "Bearer" };
    });
  }

  async me(principal: AuthPrincipal) {
    const { tenantId, userId } = this.requireTenantUser(principal);
    const user = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      }),
    );
    if (!user) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "User not found" });
    }
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      roles: user.userRoles.map((ur) => ur.role.key),
      permissions: [...principal.permissions],
    };
  }

  private requireTenantUser(principal: AuthPrincipal): { tenantId: string; userId: string } {
    if (!principal.tenantId || !principal.userId) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Tenant user required" });
    }
    return { tenantId: principal.tenantId, userId: principal.userId };
  }
}
