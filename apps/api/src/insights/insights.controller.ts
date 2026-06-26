import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import type { Response } from "express";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  type CreateReportDto,
  CreateReportSchema,
  type CreateScheduleDto,
  CreateScheduleSchema,
  type ExportFormat,
  ExportFormatSchema,
  type RunReportDto,
  RunReportSchema,
  type UpdateReportDto,
  UpdateReportSchema,
  type UpdateScheduleDto,
  UpdateScheduleSchema,
} from "./insights.dto";
import { InsightsService } from "./insights.service";

@Controller("insights")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  // ── Catalog discovery ──
  @Get("datasets")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_READ)
  listDatasets() {
    return this.insights.listDatasets();
  }

  // ── Dashboards (static routes before any ":id" report routes) ──
  @Get("dashboards/prebuilt")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_READ)
  listPrebuiltDashboards() {
    return this.insights.listPrebuiltDashboards();
  }

  @Get("dashboards/prebuilt/:key")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_READ)
  runPrebuiltDashboard(@CurrentSubject() subject: AuthPrincipal, @Param("key") key: string) {
    return this.insights.runPrebuiltDashboard(subject, key);
  }

  // ── Ad-hoc run (no-code builder preview) ──
  @Post("reports/run")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_READ)
  runReport(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(RunReportSchema)) spec: RunReportDto,
  ) {
    return this.insights.runReport(subject, spec);
  }

  // ── Saved reports ──
  @Post("reports")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_MANAGE)
  createReport(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateReportSchema)) dto: CreateReportDto,
  ) {
    return this.insights.createReport(subject, dto);
  }

  @Get("reports")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_READ)
  listReports(@CurrentSubject() subject: AuthPrincipal) {
    return this.insights.listReports(subject);
  }

  @Get("reports/:id")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_READ)
  getReport(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.insights.getReport(subject, id);
  }

  @Patch("reports/:id")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_MANAGE)
  updateReport(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateReportSchema)) dto: UpdateReportDto,
  ) {
    return this.insights.updateReport(subject, id, dto);
  }

  @Delete("reports/:id")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_MANAGE)
  deleteReport(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.insights.deleteReport(subject, id);
  }

  @Post("reports/:id/run")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_READ)
  runSavedReport(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.insights.runSavedReport(subject, id);
  }

  @Get("reports/:id/export")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_READ)
  async exportReport(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Query("format", new ZodValidationPipe(ExportFormatSchema)) format: ExportFormat,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.insights.exportSavedReport(subject, id, format);
    res.set({
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    });
    return new StreamableFile(file.body);
  }

  // ── Schedules ──
  @Post("reports/:id/schedules")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_MANAGE)
  createSchedule(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CreateScheduleSchema)) dto: CreateScheduleDto,
  ) {
    return this.insights.createSchedule(subject, id, dto);
  }

  @Get("schedules")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_READ)
  listSchedules(@CurrentSubject() subject: AuthPrincipal, @Query("reportId") reportId?: string) {
    return this.insights.listSchedules(subject, reportId);
  }

  @Patch("schedules/:id")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_MANAGE)
  updateSchedule(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateScheduleSchema)) dto: UpdateScheduleDto,
  ) {
    return this.insights.updateSchedule(subject, id, dto);
  }

  @Delete("schedules/:id")
  @RequirePermissions(PERMISSIONS.INSIGHTS_REPORT_MANAGE)
  deleteSchedule(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.insights.deleteSchedule(subject, id);
  }
}
