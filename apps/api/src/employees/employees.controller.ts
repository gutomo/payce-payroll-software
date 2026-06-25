import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { type ListEmployeesQuery, ListEmployeesSchema } from "./employees.dto";
import { EmployeesService } from "./employees.service";

@Controller("employees")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.ORG_EMPLOYEE_READ)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(
    @CurrentSubject() subject: AuthPrincipal,
    @Query(new ZodValidationPipe(ListEmployeesSchema)) query: ListEmployeesQuery,
  ) {
    return this.employees.list(subject, query);
  }

  @Get(":id")
  getById(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.employees.getById(subject, id);
  }
}
