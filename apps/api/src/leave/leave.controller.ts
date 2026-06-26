import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  type ApplyLeaveDto,
  ApplyLeaveSchema,
  type CreateLeaveTypeDto,
  CreateLeaveTypeSchema,
  type LeaveDecisionDto,
  LeaveDecisionSchema,
  type UpsertLeaveBalanceDto,
  UpsertLeaveBalanceSchema,
} from "./leave.dto";
import { LeaveService } from "./leave.service";

@Controller("leave")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  // ── Leave types (HR config) ──
  @Post("types")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_MANAGE)
  createType(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateLeaveTypeSchema)) dto: CreateLeaveTypeDto,
  ) {
    return this.leave.createType(subject, dto);
  }

  @Get("types")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_READ)
  listTypes(@CurrentSubject() subject: AuthPrincipal) {
    return this.leave.listTypes(subject);
  }

  // ── Balances ──
  @Post("balances")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_MANAGE)
  upsertBalance(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(UpsertLeaveBalanceSchema)) dto: UpsertLeaveBalanceDto,
  ) {
    return this.leave.upsertBalance(subject, dto);
  }

  @Get("balances/me")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_READ)
  myBalances(@CurrentSubject() subject: AuthPrincipal) {
    return this.leave.myBalances(subject);
  }

  @Get("balances")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_READ)
  listBalances(@CurrentSubject() subject: AuthPrincipal, @Query("employeeId") employeeId?: string) {
    return this.leave.listBalances(subject, employeeId);
  }

  // ── Requests (apply → approve/reject) ──
  @Post("requests")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_REQUEST)
  apply(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(ApplyLeaveSchema)) dto: ApplyLeaveDto,
  ) {
    return this.leave.apply(subject, dto);
  }

  @Get("requests/me")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_READ)
  myRequests(@CurrentSubject() subject: AuthPrincipal) {
    return this.leave.myRequests(subject);
  }

  @Get("requests")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_READ)
  listRequests(@CurrentSubject() subject: AuthPrincipal, @Query("status") status?: string) {
    return this.leave.listRequests(subject, status);
  }

  @Get("requests/:id")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_READ)
  getRequest(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.leave.getRequest(subject, id);
  }

  @Post("requests/:id/approve")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_APPROVE)
  approve(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(LeaveDecisionSchema)) dto: LeaveDecisionDto,
  ) {
    return this.leave.decide(subject, id, "APPROVE", dto);
  }

  @Post("requests/:id/reject")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_APPROVE)
  reject(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(LeaveDecisionSchema)) dto: LeaveDecisionDto,
  ) {
    return this.leave.decide(subject, id, "REJECT", dto);
  }

  @Post("requests/:id/cancel")
  @RequirePermissions(PERMISSIONS.ORG_LEAVE_REQUEST)
  cancel(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.leave.cancel(subject, id);
  }
}
