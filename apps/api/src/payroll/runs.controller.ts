import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { type CreateRunDto, CreateRunSchema, type DecisionDto, DecisionSchema } from "./runs.dto";
import { RunsService } from "./runs.service";

@Controller("payroll/runs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_MANAGE)
  create(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateRunSchema)) dto: CreateRunDto,
  ) {
    return this.runs.create(subject, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_READ)
  list(@CurrentSubject() subject: AuthPrincipal) {
    return this.runs.list(subject);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_READ)
  getById(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.runs.getById(subject, id);
  }

  @Get(":id/lines")
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_READ)
  listLines(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.runs.listLines(subject, id);
  }

  @Get(":id/anomalies")
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_READ)
  listAnomalies(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.runs.listAnomalies(subject, id);
  }

  @Get(":id/bank-file")
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_READ)
  getBankFile(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.runs.getBankFileUrl(subject, id);
  }

  @Get(":id/payslips/:employeeId")
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_READ)
  getPayslip(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Param("employeeId") employeeId: string,
  ) {
    return this.runs.getPayslipUrl(subject, id, employeeId);
  }

  @Post(":id/calculate")
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_MANAGE)
  calculate(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.runs.calculate(subject, id);
  }

  @Post(":id/submit")
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_MANAGE)
  submit(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.runs.submit(subject, id);
  }

  @Post(":id/approve")
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_APPROVE)
  approve(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(DecisionSchema)) dto: DecisionDto,
  ) {
    return this.runs.decide(subject, id, "APPROVE", dto);
  }

  @Post(":id/reject")
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_APPROVE)
  reject(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(DecisionSchema)) dto: DecisionDto,
  ) {
    return this.runs.decide(subject, id, "REJECT", dto);
  }

  @Post(":id/publish")
  @RequirePermissions(PERMISSIONS.PAYROLL_RUN_MANAGE)
  publish(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.runs.publish(subject, id);
  }
}
