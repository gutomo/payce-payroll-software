import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { EmployeesService } from "../employees/employees.service";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly employees: EmployeesService,
  ) {}

  @Get()
  me(@CurrentSubject() subject: AuthPrincipal) {
    return this.auth.me(subject);
  }

  /** The caller's own employee record (MyHR profile). Self-access: no extra permission required. */
  @Get("employee")
  employee(@CurrentSubject() subject: AuthPrincipal) {
    return this.employees.myProfile(subject);
  }
}
