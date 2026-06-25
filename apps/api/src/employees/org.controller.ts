import { Controller, Get, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { EmployeesService } from "./employees.service";

@Controller("org")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrgController {
  constructor(private readonly employees: EmployeesService) {}

  @Get("tree")
  @RequirePermissions(PERMISSIONS.ORG_EMPLOYEE_READ)
  tree(@CurrentSubject() subject: AuthPrincipal) {
    return this.employees.orgTree(subject);
  }
}
