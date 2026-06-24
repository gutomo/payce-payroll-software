import { ConflictException, Injectable } from "@nestjs/common";
import { runInTenant } from "@payce/db";
import { ROLES, TENANT_SYSTEM_ROLES } from "@payce/rbac";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../auth/crypto/password.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateTenantDto } from "./tenants.dto";

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Platform-plane onboarding: create the tenant (no RLS), then — inside the tenant's RLS context —
   * seed its system roles, first admin user + credential, role assignment, and audit events.
   */
  async create(dto: CreateTenantDto) {
    const clash = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (clash) {
      throw new ConflictException({ code: "TENANT_EXISTS", message: "Tenant slug already in use" });
    }

    const passwordHash = await this.passwords.hash(dto.admin.password);

    const tenant = await this.prisma.tenant.create({
      data: { name: dto.name, slug: dto.slug, status: "ACTIVE", createdBy: "platform" },
    });

    const { adminUserId } = await runInTenant(this.prisma, tenant.id, async (tx) => {
      await tx.role.createMany({
        data: TENANT_SYSTEM_ROLES.map((role) => ({
          tenantId: tenant.id,
          key: role.key,
          name: role.name,
          isSystem: true,
          permissionKeys: [...role.permissions],
        })),
      });
      const adminRole = await tx.role.findFirstOrThrow({ where: { key: ROLES.TENANT_ADMIN } });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.admin.email,
          displayName: dto.admin.displayName,
          status: "ACTIVE",
          createdBy: "platform",
        },
      });
      await tx.credential.create({ data: { tenantId: tenant.id, userId: user.id, passwordHash } });
      await tx.userRole.create({
        data: { tenantId: tenant.id, userId: user.id, roleId: adminRole.id },
      });

      await this.audit.record(tx, {
        tenantId: tenant.id,
        actorType: "platform",
        action: "tenant.created",
        entityType: "Tenant",
        entityId: tenant.id,
        after: { slug: tenant.slug, name: tenant.name },
      });
      await this.audit.record(tx, {
        tenantId: tenant.id,
        actorType: "platform",
        action: "user.created",
        entityType: "User",
        entityId: user.id,
        after: { email: user.email, role: ROLES.TENANT_ADMIN },
      });

      return { adminUserId: user.id };
    });

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      adminUserId,
    };
  }
}
