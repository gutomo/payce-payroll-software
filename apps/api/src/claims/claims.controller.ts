import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  type AddAttachmentDto,
  AddAttachmentSchema,
  type ClaimDecisionDto,
  ClaimDecisionSchema,
  type CreateClaimDto,
  CreateClaimSchema,
} from "./claims.dto";
import { ClaimsService } from "./claims.service";

@Controller("claims")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.ORG_CLAIM_REQUEST)
  create(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateClaimSchema)) dto: CreateClaimDto,
  ) {
    return this.claims.create(subject, dto);
  }

  @Get("me")
  @RequirePermissions(PERMISSIONS.ORG_CLAIM_READ)
  myClaims(@CurrentSubject() subject: AuthPrincipal) {
    return this.claims.myClaims(subject);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_CLAIM_READ)
  list(@CurrentSubject() subject: AuthPrincipal, @Query("status") status?: string) {
    return this.claims.list(subject, status);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.ORG_CLAIM_READ)
  getById(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.claims.getById(subject, id);
  }

  @Post(":id/attachments")
  @RequirePermissions(PERMISSIONS.ORG_CLAIM_REQUEST)
  addAttachment(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AddAttachmentSchema)) dto: AddAttachmentDto,
  ) {
    return this.claims.addAttachment(subject, id, dto);
  }

  @Get(":id/attachments/:attachmentId")
  @RequirePermissions(PERMISSIONS.ORG_CLAIM_READ)
  getAttachment(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    return this.claims.getAttachmentUrl(subject, id, attachmentId);
  }

  @Post(":id/approve")
  @RequirePermissions(PERMISSIONS.ORG_CLAIM_APPROVE)
  approve(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ClaimDecisionSchema)) dto: ClaimDecisionDto,
  ) {
    return this.claims.decide(subject, id, "APPROVE", dto);
  }

  @Post(":id/reject")
  @RequirePermissions(PERMISSIONS.ORG_CLAIM_APPROVE)
  reject(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ClaimDecisionSchema)) dto: ClaimDecisionDto,
  ) {
    return this.claims.decide(subject, id, "REJECT", dto);
  }
}
