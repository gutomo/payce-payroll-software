import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  type AssignMembersDto,
  AssignMembersSchema,
  type CreatePayGroupDto,
  CreatePayGroupSchema,
  type GeneratePeriodsDto,
  GeneratePeriodsSchema,
} from "./pay-groups.dto";
import { PayGroupsService } from "./pay-groups.service";

@Controller("payroll/pay-groups")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayGroupsController {
  constructor(private readonly payGroups: PayGroupsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.PAYROLL_PAYGROUP_MANAGE)
  create(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(CreatePayGroupSchema)) dto: CreatePayGroupDto,
  ) {
    return this.payGroups.create(subject, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PAYROLL_PAYGROUP_READ)
  list(@CurrentSubject() subject: AuthPrincipal) {
    return this.payGroups.list(subject);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PAYROLL_PAYGROUP_READ)
  getById(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.payGroups.getById(subject, id);
  }

  @Post(":id/periods")
  @RequirePermissions(PERMISSIONS.PAYROLL_PAYGROUP_MANAGE)
  generatePeriods(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(GeneratePeriodsSchema)) dto: GeneratePeriodsDto,
  ) {
    return this.payGroups.generatePeriods(subject, id, dto);
  }

  @Get(":id/periods")
  @RequirePermissions(PERMISSIONS.PAYROLL_PAYGROUP_READ)
  listPeriods(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.payGroups.listPeriods(subject, id);
  }

  @Post(":id/members")
  @RequirePermissions(PERMISSIONS.PAYROLL_PAYGROUP_MANAGE)
  assignMembers(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AssignMembersSchema)) dto: AssignMembersDto,
  ) {
    return this.payGroups.assignMembers(subject, id, dto);
  }
}
