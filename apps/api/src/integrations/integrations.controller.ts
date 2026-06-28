import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  type CreateIntegrationDto,
  CreateIntegrationSchema,
  type CreateWebhookDto,
  CreateWebhookSchema,
  type TriggerRunDto,
  TriggerRunSchema,
} from "./integrations.dto";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  // Static route before any ":id" route.
  @Get("connectors")
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  listConnectors() {
    return this.integrations.listConnectors();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  create(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateIntegrationSchema)) dto: CreateIntegrationDto,
  ) {
    return this.integrations.createIntegration(subject, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  list(@CurrentSubject() subject: AuthPrincipal) {
    return this.integrations.listIntegrations(subject);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  get(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.integrations.getIntegration(subject, id);
  }

  @Post(":id/runs")
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  trigger(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(TriggerRunSchema)) dto: TriggerRunDto,
  ) {
    return this.integrations.triggerRun(subject, id, dto);
  }

  @Get(":id/runs")
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  listRuns(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.integrations.listRuns(subject, id);
  }
}

@Controller("webhooks")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WebhooksController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  create(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateWebhookSchema)) dto: CreateWebhookDto,
  ) {
    return this.integrations.createWebhook(subject, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  list(@CurrentSubject() subject: AuthPrincipal) {
    return this.integrations.listWebhooks(subject);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  remove(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.integrations.deleteWebhook(subject, id);
  }

  @Get(":id/deliveries")
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  deliveries(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.integrations.listDeliveries(subject, id);
  }
}
