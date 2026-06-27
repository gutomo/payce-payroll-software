import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@payce/rbac";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AssistService } from "./assist.service";
import {
  type CreateKnowledgeDto,
  CreateKnowledgeSchema,
  type SendMessageDto,
  SendMessageSchema,
  type UpdateKnowledgeDto,
  UpdateKnowledgeSchema,
} from "./assist.dto";

@Controller("assist")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssistController {
  constructor(private readonly assist: AssistService) {}

  // ── Chat ──
  @Post("messages")
  @RequirePermissions(PERMISSIONS.ASSIST_USE)
  send(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(SendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.assist.ask(subject, dto);
  }

  @Get("conversations")
  @RequirePermissions(PERMISSIONS.ASSIST_USE)
  listConversations(@CurrentSubject() subject: AuthPrincipal) {
    return this.assist.listConversations(subject);
  }

  @Get("conversations/:id")
  @RequirePermissions(PERMISSIONS.ASSIST_USE)
  getConversation(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.assist.getConversation(subject, id);
  }

  // ── Knowledge base ──
  @Get("knowledge")
  @RequirePermissions(PERMISSIONS.ASSIST_USE)
  listKnowledge(@CurrentSubject() subject: AuthPrincipal) {
    return this.assist.listKnowledge(subject);
  }

  @Post("knowledge")
  @RequirePermissions(PERMISSIONS.ASSIST_KNOWLEDGE_MANAGE)
  createKnowledge(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateKnowledgeSchema)) dto: CreateKnowledgeDto,
  ) {
    return this.assist.createKnowledge(subject, dto);
  }

  @Patch("knowledge/:id")
  @RequirePermissions(PERMISSIONS.ASSIST_KNOWLEDGE_MANAGE)
  updateKnowledge(
    @CurrentSubject() subject: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateKnowledgeSchema)) dto: UpdateKnowledgeDto,
  ) {
    return this.assist.updateKnowledge(subject, id, dto);
  }

  @Delete("knowledge/:id")
  @RequirePermissions(PERMISSIONS.ASSIST_KNOWLEDGE_MANAGE)
  deleteKnowledge(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.assist.deleteKnowledge(subject, id);
  }
}
