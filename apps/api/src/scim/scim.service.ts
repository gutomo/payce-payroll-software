import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { type Prisma, runInTenant } from "@payce/db";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { displayNameOf, primaryEmail, type ScimPatchDto, type ScimUserDto } from "./scim.dto";
import type { ScimPrincipal } from "./scim-auth.guard";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};
type IdentityRow = { subject: string };

/**
 * SCIM 2.0 Users provisioning (RFC 7643/7644). Maps an IdP's user lifecycle (joiner/mover/leaver) onto
 * Payce `app_user` + `user_identity`, all tenant-scoped via the resolved SCIM principal. Deprovisioning
 * is a soft disable (status DISABLED + session revocation), never a hard delete — payroll history must
 * survive. Assumes a provider's SCIM `externalId` equals its federation `sub` (true for Okta/Entra), so
 * a SCIM-provisioned user and the same user's SSO login share one `user_identity`.
 */
@Injectable()
export class ScimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createUser(scim: ScimPrincipal, dto: ScimUserDto) {
    const email = primaryEmail(dto);
    const displayName = displayNameOf(dto);
    const active = dto.active ?? true;
    const subject = dto.externalId ?? `scim:${email}`;

    return runInTenant(this.prisma, scim.tenantId, async (tx) => {
      const provider = await tx.identityProvider.findFirst({ where: { id: scim.providerId } });
      if (!provider) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Provider not found" });
      }
      if (await tx.userIdentity.findFirst({ where: { providerId: scim.providerId, subject } })) {
        throw new ConflictException({ code: "SCIM_CONFLICT", message: "User already provisioned" });
      }

      let user = await tx.user.findFirst({ where: { email } });
      if (user) {
        if (
          await tx.userIdentity.findFirst({
            where: { providerId: scim.providerId, userId: user.id },
          })
        ) {
          throw new ConflictException({
            code: "SCIM_CONFLICT",
            message: "User already provisioned",
          });
        }
        user = await tx.user.update({
          where: { id: user.id },
          data: { status: active ? "ACTIVE" : "DISABLED", displayName },
        });
      } else {
        user = await tx.user.create({
          data: {
            tenantId: scim.tenantId,
            email,
            displayName,
            status: active ? "ACTIVE" : "DISABLED",
          },
        });
        if (provider.defaultRoleKey) {
          const role = await tx.role.findFirst({ where: { key: provider.defaultRoleKey } });
          if (role) {
            await tx.userRole.create({
              data: { tenantId: scim.tenantId, userId: user.id, roleId: role.id },
            });
          }
        }
      }

      const identity = await tx.userIdentity.create({
        data: {
          tenantId: scim.tenantId,
          providerId: scim.providerId,
          userId: user.id,
          subject,
          email,
        },
      });
      if (!active) {
        await revokeSessions(tx, user.id);
      }
      await this.record(tx, scim.tenantId, "scim.user.provisioned", user.id, { subject, active });
      return toScimUser(user, identity);
    });
  }

  getUser(scim: ScimPrincipal, id: string) {
    return runInTenant(this.prisma, scim.tenantId, async (tx) => {
      const { user, identity } = await this.linked(tx, scim.providerId, id);
      return toScimUser(user, identity);
    });
  }

  listUsers(scim: ScimPrincipal, filter?: string) {
    return runInTenant(this.prisma, scim.tenantId, async (tx) => {
      const identities = await tx.userIdentity.findMany({
        where: { providerId: scim.providerId },
        include: { user: true },
      });
      const parsed = filter ? parseFilter(filter) : null;
      const matched = identities.filter((i) => {
        if (!parsed) return true;
        if (parsed.attr === "userName") return i.user.email === parsed.value.toLowerCase();
        if (parsed.attr === "externalId") return i.subject === parsed.value;
        return false; // unsupported attribute → no match (the IdP then POSTs to create)
      });
      return listResponse(matched.map((i) => toScimUser(i.user, i)));
    });
  }

  replaceUser(scim: ScimPrincipal, id: string, dto: ScimUserDto) {
    const active = dto.active ?? true;
    const displayName = displayNameOf(dto);
    return runInTenant(this.prisma, scim.tenantId, async (tx) => {
      const { identity } = await this.linked(tx, scim.providerId, id);
      const user = await tx.user.update({
        where: { id },
        data: { status: active ? "ACTIVE" : "DISABLED", displayName },
      });
      if (!active) {
        await revokeSessions(tx, id);
      }
      await this.record(tx, scim.tenantId, "scim.user.replaced", id, { active });
      return toScimUser(user, identity);
    });
  }

  patchUser(scim: ScimPrincipal, id: string, patch: ScimPatchDto) {
    return runInTenant(this.prisma, scim.tenantId, async (tx) => {
      const { identity } = await this.linked(tx, scim.providerId, id);
      const change = readPatch(patch);
      const data: Prisma.UserUpdateInput = {};
      if (change.active !== undefined) data.status = change.active ? "ACTIVE" : "DISABLED";
      if (change.displayName !== undefined) data.displayName = change.displayName;

      const user = Object.keys(data).length
        ? await tx.user.update({ where: { id }, data })
        : await tx.user.findUniqueOrThrow({ where: { id } });
      if (change.active === false) {
        await revokeSessions(tx, id);
      }
      await this.record(tx, scim.tenantId, "scim.user.patched", id, { active: change.active });
      return toScimUser(user, identity);
    });
  }

  deleteUser(scim: ScimPrincipal, id: string): Promise<void> {
    return runInTenant(this.prisma, scim.tenantId, async (tx) => {
      await this.linked(tx, scim.providerId, id);
      // Soft delete: disable the user and revoke sessions (payroll history must survive), but remove the
      // provisioning link so the resource is gone from SCIM's view (a later GET 404s; re-hire re-POSTs).
      await tx.user.update({ where: { id }, data: { status: "DISABLED" } });
      await revokeSessions(tx, id);
      await tx.userIdentity.deleteMany({ where: { providerId: scim.providerId, userId: id } });
      await this.record(tx, scim.tenantId, "scim.user.deprovisioned", id, {});
    });
  }

  /** Load a user that is linked to this provider, or 404. */
  private async linked(tx: Prisma.TransactionClient, providerId: string, userId: string) {
    const identity = await tx.userIdentity.findFirst({ where: { providerId, userId } });
    const user = identity ? await tx.user.findUnique({ where: { id: userId } }) : null;
    if (!identity || !user) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "User not found" });
    }
    return { user, identity };
  }

  private record(
    tx: Prisma.TransactionClient,
    tenantId: string,
    action: string,
    entityId: string,
    after: Prisma.InputJsonValue,
  ) {
    return this.audit.record(tx, {
      tenantId,
      actorType: "system",
      actorUserId: null,
      action,
      entityType: "User",
      entityId,
      after,
    });
  }
}

function revokeSessions(tx: Prisma.TransactionClient, userId: string) {
  return tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Parse the one SCIM filter form provisioning clients use: `attr eq "value"`. */
function parseFilter(filter: string): { attr: string; value: string } | null {
  const m = /^\s*(\w+)\s+eq\s+"(.+)"\s*$/i.exec(filter);
  return m ? { attr: m[1] as string, value: m[2] as string } : null;
}

/** Pull the `active` / `displayName` changes out of a PatchOp (path-based or value-object form). */
function readPatch(patch: ScimPatchDto): { active?: boolean; displayName?: string } {
  const out: { active?: boolean; displayName?: string } = {};
  for (const op of patch.Operations) {
    const verb = op.op.toLowerCase();
    if (verb !== "replace" && verb !== "add") continue;
    const path = op.path?.toLowerCase();
    if (path === "active") {
      out.active = Boolean(op.value);
    } else if (path === "displayname") {
      out.displayName = String(op.value);
    } else if (!op.path && op.value && typeof op.value === "object") {
      const v = op.value as Record<string, unknown>;
      if ("active" in v) out.active = Boolean(v.active);
      if ("displayName" in v) out.displayName = String(v.displayName);
    }
  }
  return out;
}

function toScimUser(user: UserRow, identity: IdentityRow) {
  return {
    schemas: [USER_SCHEMA],
    id: user.id,
    externalId: identity.subject,
    userName: user.email,
    displayName: user.displayName,
    name: { formatted: user.displayName },
    emails: [{ value: user.email, primary: true, type: "work" }],
    active: user.status === "ACTIVE",
    meta: {
      resourceType: "User",
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      location: `/scim/v2/Users/${user.id}`,
    },
  };
}

function listResponse(resources: ReturnType<typeof toScimUser>[]) {
  return {
    schemas: [LIST_SCHEMA],
    totalResults: resources.length,
    startIndex: 1,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}
