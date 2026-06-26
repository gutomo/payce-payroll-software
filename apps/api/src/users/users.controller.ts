import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { type InviteUserDto, InviteUserSchema } from "./users.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  // Invite always attaches >=1 role (InviteUserSchema requires roleKeys), so granting roles here
  // requires the dedicated role-assignment permission in addition to the invite permission;
  // otherwise an invite-only principal could mint a tenant_admin. Both are AND-enforced by the guard.
  @RequirePermissions(PERMISSIONS.IDENTITY_USER_INVITE, PERMISSIONS.IDENTITY_ROLE_ASSIGN)
  invite(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(InviteUserSchema)) dto: InviteUserDto,
  ) {
    return this.users.invite(subject, dto);
  }
}
