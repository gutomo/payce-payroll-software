import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import type { AuthPrincipal } from "../auth.types";
import { CurrentSubject, RequirePermissions } from "../decorators";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { PermissionsGuard } from "../guards/permissions.guard";
import {
  type CreateProviderDto,
  CreateProviderSchema,
  type SsoCallbackDto,
  SsoCallbackSchema,
  type SsoStartDto,
  SsoStartSchema,
} from "./sso.dto";
import { SsoService } from "./sso.service";

@Controller("auth/sso")
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  // ── Public sign-in flow (no session yet) ──

  @Post("start")
  @HttpCode(HttpStatus.OK)
  start(@Body(new ZodValidationPipe(SsoStartSchema)) dto: SsoStartDto) {
    return this.sso.start(dto);
  }

  @Post("callback")
  @HttpCode(HttpStatus.OK)
  callback(@Body(new ZodValidationPipe(SsoCallbackSchema)) dto: SsoCallbackDto) {
    return this.sso.callback(dto);
  }

  // ── Provider administration (tenant admin) ──

  @Get("providers")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.IDENTITY_SSO_MANAGE)
  listProviders(@CurrentSubject() subject: AuthPrincipal) {
    return this.sso.listProviders(subject);
  }

  @Post("providers")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.IDENTITY_SSO_MANAGE)
  createProvider(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateProviderSchema)) dto: CreateProviderDto,
  ) {
    return this.sso.createProvider(subject, dto);
  }

  @Delete("providers/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.IDENTITY_SSO_MANAGE)
  deleteProvider(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.sso.deleteProvider(subject, id);
  }

  // ── SCIM provisioning credential ──

  @Post("providers/:id/scim-token")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.IDENTITY_SSO_MANAGE)
  rotateScimToken(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.sso.regenerateScimToken(subject, id);
  }

  @Delete("providers/:id/scim-token")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.IDENTITY_SSO_MANAGE)
  disableScim(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.sso.disableScim(subject, id);
  }
}
