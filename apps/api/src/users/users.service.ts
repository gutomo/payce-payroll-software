import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { runInTenant } from "@payce/db";
import { AuditService } from "../audit/audit.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { InviteUserDto } from "./users.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Invite a user into the caller's tenant with the requested roles. Status starts as INVITED. */
  async invite(principal: AuthPrincipal, dto: InviteUserDto) {
    const tenantId = principal.tenantId;
    if (!tenantId) {
      throw new BadRequestException({ code: "BAD_REQUEST", message: "Tenant context required" });
    }

    return runInTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.user.findFirst({ where: { email: dto.email } });
      if (existing) {
        throw new ConflictException({ code: "USER_EXISTS", message: "User already exists" });
      }

      const roles = await tx.role.findMany({ where: { key: { in: dto.roleKeys } } });
      if (roles.length !== dto.roleKeys.length) {
        throw new BadRequestException({
          code: "UNKNOWN_ROLE",
          message: "One or more roles do not exist",
        });
      }

      const user = await tx.user.create({
        data: {
          tenantId,
          email: dto.email,
          displayName: dto.displayName,
          status: "INVITED",
          createdBy: principal.userId,
        },
      });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ tenantId, userId: user.id, roleId: role.id })),
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: principal.userId,
        action: "user.invited",
        entityType: "User",
        entityId: user.id,
        after: { email: dto.email, roleKeys: dto.roleKeys },
      });

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
        roleKeys: dto.roleKeys,
      };
    });
  }
}
