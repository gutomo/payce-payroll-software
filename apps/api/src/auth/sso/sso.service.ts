import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { type Prisma, runInTenant } from "@payce/db";
import { createHash, randomBytes } from "node:crypto";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthPrincipal, SessionTokens } from "../auth.types";
import { AuthService } from "../auth.service";
import type { CreateProviderDto, SsoCallbackDto, SsoStartDto } from "./sso.dto";
import { SsoProviderFactory, type SsoProviderConfig } from "./sso-provider.factory";
import type { OidcIdentity } from "./oidc.types";

const SSO_FAILED = { code: "SSO_FAILED", message: "SSO sign-in failed" };

export interface SsoStartResult {
  providerId: string;
  authorizationUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

@Injectable()
export class SsoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: SsoProviderFactory,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /** Resolve the tenant's identity provider and build the authorization request to redirect to. */
  async start(dto: SsoStartDto): Promise<SsoStartResult> {
    const tenant = await this.activeTenant(dto.tenantSlug);

    const row = await runInTenant(this.prisma, tenant.id, (tx) =>
      this.resolveProvider(tx, dto.providerName),
    );
    if (row.kind === "SAML") {
      throw new BadRequestException({
        code: "SSO_SAML_BROKERED",
        message: "SAML sign-in is brokered via the OIDC connection to the user pool",
      });
    }
    const provider = this.providers.create(toProviderConfig(row));
    const auth = await provider.buildAuthRequest({
      redirectUri: dto.redirectUri,
      loginHint: dto.email,
    });
    return {
      providerId: row.id,
      authorizationUrl: auth.authorizationUrl,
      state: auth.state,
      nonce: auth.nonce,
      codeVerifier: auth.codeVerifier,
    };
  }

  /** Validate the callback, exchange the code, link/provision the user, and issue a session. */
  async callback(dto: SsoCallbackDto): Promise<SessionTokens> {
    // CSRF: the state echoed by the IdP must equal the one we issued at start.
    if (dto.state !== dto.expectedState) {
      throw new UnauthorizedException(SSO_FAILED);
    }
    const tenant = await this.activeTenant(dto.tenantSlug);

    // 1) Load the provider config (short, scoped read) — not while doing network I/O.
    const row = await runInTenant(this.prisma, tenant.id, async (tx) => {
      const provider = await tx.identityProvider.findFirst({
        where: { id: dto.providerId, enabled: true },
      });
      if (!provider) {
        throw new UnauthorizedException(SSO_FAILED);
      }
      return provider;
    });

    // 2) Exchange the code OUTSIDE any DB transaction (it may do network I/O).
    let identity: OidcIdentity;
    try {
      identity = await this.providers.create(toProviderConfig(row)).exchange({
        code: dto.code,
        redirectUri: dto.redirectUri,
        nonce: dto.nonce,
        codeVerifier: dto.codeVerifier,
      });
    } catch {
      throw new UnauthorizedException(SSO_FAILED);
    }

    const email = identity.email.trim().toLowerCase();
    if (row.emailDomain && !email.endsWith(`@${row.emailDomain.toLowerCase()}`)) {
      throw new UnauthorizedException(SSO_FAILED);
    }

    // 3) Resolve/link/provision the user and issue the session, all tenant-scoped.
    return runInTenant(this.prisma, tenant.id, async (tx) => {
      const { userId, jit } = await this.resolveUser(tx, tenant.id, row, identity, email);
      const session = await this.auth.issueSessionForUserId(tx, tenant.id, userId);
      await this.audit.record(tx, {
        tenantId: tenant.id,
        actorType: "user",
        actorUserId: userId,
        action: "auth.sso.login",
        entityType: "User",
        entityId: userId,
        after: { providerId: row.id, kind: row.kind, subject: identity.subject, jit },
      });
      return session;
    });
  }

  // ── Provider administration ──

  async listProviders(subject: AuthPrincipal) {
    const tenantId = this.requireTenant(subject);
    const rows = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.identityProvider.findMany({ orderBy: { createdAt: "asc" } }),
    );
    return { data: rows.map(sanitize) };
  }

  async createProvider(subject: AuthPrincipal, dto: CreateProviderDto) {
    const tenantId = this.requireTenant(subject);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const created = await tx.identityProvider.create({
        data: {
          tenantId,
          kind: dto.kind,
          name: dto.name,
          enabled: dto.enabled,
          issuer: dto.issuer ?? null,
          clientId: dto.clientId ?? null,
          clientSecretRef: dto.clientSecretRef ?? null,
          authorizationEndpoint: dto.authorizationEndpoint ?? null,
          tokenEndpoint: dto.tokenEndpoint ?? null,
          jwksUri: dto.jwksUri ?? null,
          samlMetadataUrl: dto.samlMetadataUrl ?? null,
          allowJitProvisioning: dto.allowJitProvisioning,
          defaultRoleKey: dto.defaultRoleKey ?? null,
          emailDomain: dto.emailDomain ?? null,
          createdBy: subject.userId,
          updatedBy: subject.userId,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: subject.userId,
        action: "sso.provider.created",
        entityType: "IdentityProvider",
        entityId: created.id,
        after: { name: created.name, kind: created.kind, enabled: created.enabled },
      });
      return sanitize(created);
    });
  }

  async deleteProvider(subject: AuthPrincipal, id: string): Promise<void> {
    const tenantId = this.requireTenant(subject);
    await runInTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.identityProvider.findFirst({ where: { id } });
      if (!existing) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Identity provider not found" });
      }
      await tx.identityProvider.delete({ where: { id } });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: subject.userId,
        action: "sso.provider.deleted",
        entityType: "IdentityProvider",
        entityId: id,
        before: { name: existing.name, kind: existing.kind },
      });
    });
  }

  // ── SCIM provisioning credential (admin) ──

  /**
   * Enable SCIM for a provider and (re)issue its bearer token, returned ONCE. Only the SHA-256 hash is
   * stored (in the platform-plane scim_credential table); rotating replaces the previous token.
   */
  async regenerateScimToken(
    subject: AuthPrincipal,
    providerId: string,
  ): Promise<{ token: string }> {
    const tenantId = this.requireTenant(subject);
    const token = `scim_${randomBytes(32).toString("base64url")}`;
    const tokenHash = hashToken(token);

    await runInTenant(this.prisma, tenantId, async (tx) => {
      const provider = await tx.identityProvider.findFirst({ where: { id: providerId } });
      if (!provider) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Identity provider not found" });
      }
      await tx.identityProvider.update({ where: { id: providerId }, data: { scimEnabled: true } });
      await tx.scimCredential.upsert({
        where: { providerId },
        update: { tokenHash, tenantId, createdBy: subject.userId },
        create: { tenantId, providerId, tokenHash, createdBy: subject.userId },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: subject.userId,
        action: "sso.scim.token.rotated",
        entityType: "IdentityProvider",
        entityId: providerId,
      });
    });
    return { token };
  }

  async disableScim(subject: AuthPrincipal, providerId: string): Promise<void> {
    const tenantId = this.requireTenant(subject);
    await runInTenant(this.prisma, tenantId, async (tx) => {
      const provider = await tx.identityProvider.findFirst({ where: { id: providerId } });
      if (!provider) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Identity provider not found" });
      }
      await tx.identityProvider.update({ where: { id: providerId }, data: { scimEnabled: false } });
      await tx.scimCredential.deleteMany({ where: { providerId } });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: subject.userId,
        action: "sso.scim.disabled",
        entityType: "IdentityProvider",
        entityId: providerId,
      });
    });
  }

  // ── helpers ──

  private async activeTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || tenant.status !== "ACTIVE") {
      throw new UnauthorizedException(SSO_FAILED);
    }
    return tenant;
  }

  private async resolveProvider(tx: Prisma.TransactionClient, name?: string) {
    if (name) {
      const named = await tx.identityProvider.findFirst({ where: { name, enabled: true } });
      if (!named) {
        throw new NotFoundException({
          code: "SSO_NOT_CONFIGURED",
          message: "No such SSO provider",
        });
      }
      return named;
    }
    const enabled = await tx.identityProvider.findMany({ where: { enabled: true } });
    const [first, second] = enabled;
    if (!first) {
      throw new NotFoundException({ code: "SSO_NOT_CONFIGURED", message: "SSO is not configured" });
    }
    if (second) {
      throw new BadRequestException({
        code: "SSO_AMBIGUOUS",
        message: "Multiple providers; specify providerName",
      });
    }
    return first;
  }

  private async resolveUser(
    tx: Prisma.TransactionClient,
    tenantId: string,
    provider: { id: string; allowJitProvisioning: boolean; defaultRoleKey: string | null },
    identity: OidcIdentity,
    email: string,
  ): Promise<{ userId: string; jit: boolean }> {
    const link = await tx.userIdentity.findFirst({
      where: { providerId: provider.id, subject: identity.subject },
    });
    if (link) {
      await tx.userIdentity.update({
        where: { id: link.id },
        data: { lastLoginAt: new Date(), email },
      });
      await this.activateIfInvited(tx, link.userId);
      return { userId: link.userId, jit: false };
    }

    const existing = await tx.user.findFirst({ where: { email } });
    if (existing) {
      await this.activateIfInvited(tx, existing.id);
      await this.linkIdentity(tx, tenantId, provider.id, existing.id, identity.subject, email);
      return { userId: existing.id, jit: false };
    }

    if (!provider.allowJitProvisioning) {
      throw new UnauthorizedException(SSO_FAILED);
    }
    const created = await tx.user.create({
      data: {
        tenantId,
        email,
        displayName: identity.displayName?.trim() || email,
        status: "ACTIVE",
      },
    });
    if (provider.defaultRoleKey) {
      const role = await tx.role.findFirst({ where: { key: provider.defaultRoleKey } });
      if (role) {
        await tx.userRole.create({ data: { tenantId, userId: created.id, roleId: role.id } });
      }
    }
    await this.linkIdentity(tx, tenantId, provider.id, created.id, identity.subject, email);
    return { userId: created.id, jit: true };
  }

  private linkIdentity(
    tx: Prisma.TransactionClient,
    tenantId: string,
    providerId: string,
    userId: string,
    subject: string,
    email: string,
  ) {
    return tx.userIdentity.create({
      data: { tenantId, providerId, userId, subject, email },
    });
  }

  private async activateIfInvited(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.user.updateMany({
      where: { id: userId, status: "INVITED" },
      data: { status: "ACTIVE" },
    });
  }

  private requireTenant(subject: AuthPrincipal): string {
    if (!subject.tenantId) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Tenant user required" });
    }
    return subject.tenantId;
  }
}

/** SHA-256 hex of a token; only the hash is ever persisted. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Drop nothing secret (none is stored) but present a clean shape for the admin API. */
function sanitize(row: {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  issuer: string | null;
  clientId: string | null;
  samlMetadataUrl: string | null;
  allowJitProvisioning: boolean;
  defaultRoleKey: string | null;
  emailDomain: string | null;
  scimEnabled: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    enabled: row.enabled,
    issuer: row.issuer,
    clientId: row.clientId,
    samlMetadataUrl: row.samlMetadataUrl,
    allowJitProvisioning: row.allowJitProvisioning,
    defaultRoleKey: row.defaultRoleKey,
    emailDomain: row.emailDomain,
    scimEnabled: row.scimEnabled,
    createdAt: row.createdAt,
  };
}

function toProviderConfig(row: {
  id: string;
  kind: string;
  issuer: string | null;
  clientId: string | null;
  clientSecretRef: string | null;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
  jwksUri: string | null;
}): SsoProviderConfig {
  const kind = row.kind === "SAML" ? "SAML" : row.kind === "OFFLINE" ? "OFFLINE" : "OIDC";
  return {
    id: row.id,
    kind,
    issuer: row.issuer,
    clientId: row.clientId,
    clientSecretRef: row.clientSecretRef,
    authorizationEndpoint: row.authorizationEndpoint,
    tokenEndpoint: row.tokenEndpoint,
    jwksUri: row.jwksUri,
  };
}
