import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  type AssistAnswer,
  type EscalationReason,
  type KnowledgeArticle,
  redactPii,
  retrieve,
  routeTools,
  runAssist,
  type ToolResult,
} from "@payce/assist";
import { type Prisma, runInTenant } from "@payce/db";
import { AuditService } from "../audit/audit.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { AssistToolsService } from "./assist.tools";
import type { CreateKnowledgeDto, SendMessageDto, UpdateKnowledgeDto } from "./assist.dto";
import { AssistProviderService } from "./provider";

const REASON_TO_ENUM: Record<EscalationReason, "LOW_CONFIDENCE" | "SENSITIVE_TOPIC"> = {
  low_confidence: "LOW_CONFIDENCE",
  sensitive_topic: "SENSITIVE_TOPIC",
};

@Injectable()
export class AssistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly providers: AssistProviderService,
    private readonly tools: AssistToolsService,
  ) {}

  /**
   * Answer one turn. The factual content comes only from (a) the tenant's knowledge base (RLS) and
   * (b) scoped tools that read the caller's own data — so the reply can never include another tenant's
   * or another user's data (the Phase 6 AC). The interaction is persisted and audit-logged (with the
   * question PII-redacted); a low-confidence or sensitive turn also opens an escalation ticket.
   */
  async ask(principal: AuthPrincipal, dto: SendMessageDto) {
    const { tenantId, userId } = this.requireUser(principal);

    // 1. Gather grounding: tenant knowledge + the caller's permitted scoped tools.
    const articles = await this.loadKnowledge(tenantId);
    const toolResults = await this.runTools(principal, dto.message);
    const retrieved = retrieve(articles, dto.message, 3);

    // 2. Phrase + decide escalation (pure kernel + provider; no data access here).
    const answer = await runAssist(this.providers.get(), {
      query: dto.message,
      retrieved,
      toolResults,
    });

    // 3. Persist the turn, the escalation (if any), and an audit event — atomically.
    return runInTenant(this.prisma, tenantId, (tx) =>
      this.persist(tx, { tenantId, userId, dto, answer }),
    );
  }

  async listConversations(principal: AuthPrincipal) {
    const { tenantId, userId } = this.requireUser(principal);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.assistConversation.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, createdAt: true, updatedAt: true },
      }),
    );
    return { data };
  }

  /** Fetch a conversation and its messages. Restricted to the caller's own conversations. */
  async getConversation(principal: AuthPrincipal, id: string) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const conversation = await tx.assistConversation.findFirst({
        where: { id, userId },
        select: { id: true, title: true, createdAt: true, updatedAt: true },
      });
      if (!conversation) throw conversationNotFound();
      const messages = await tx.assistMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
        select: MESSAGE_SELECT,
      });
      return { ...conversation, messages };
    });
  }

  // ─────────────────────────── Knowledge base CRUD ───────────────────────────

  async listKnowledge(principal: AuthPrincipal) {
    const tenantId = this.requireTenant(principal);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.knowledgeArticle.findMany({ orderBy: { title: "asc" } }),
    );
    return { data };
  }

  async createKnowledge(principal: AuthPrincipal, dto: CreateKnowledgeDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      let article: { id: string };
      try {
        article = await tx.knowledgeArticle.create({
          data: {
            tenantId,
            slug: dto.slug,
            title: dto.title,
            body: dto.body,
            category: dto.category ?? null,
            tags: dto.tags ?? [],
            createdBy: userId,
          },
          select: { id: true },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw knowledgeExists(dto.slug);
        throw err;
      }
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "knowledge_article.created",
        entityType: "KnowledgeArticle",
        entityId: article.id,
        after: { slug: dto.slug, title: dto.title },
      });
      return tx.knowledgeArticle.findUniqueOrThrow({ where: { id: article.id } });
    });
  }

  async updateKnowledge(principal: AuthPrincipal, id: string, dto: UpdateKnowledgeDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.knowledgeArticle.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw knowledgeNotFound();
      await tx.knowledgeArticle.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedBy: userId,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "knowledge_article.updated",
        entityType: "KnowledgeArticle",
        entityId: id,
      });
      return tx.knowledgeArticle.findUniqueOrThrow({ where: { id } });
    });
  }

  async deleteKnowledge(principal: AuthPrincipal, id: string) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.knowledgeArticle.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw knowledgeNotFound();
      await tx.knowledgeArticle.delete({ where: { id } });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "knowledge_article.deleted",
        entityType: "KnowledgeArticle",
        entityId: id,
      });
      return { id };
    });
  }

  // ─────────────────────────── helpers ───────────────────────────

  private async loadKnowledge(tenantId: string): Promise<KnowledgeArticle[]> {
    const rows = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.knowledgeArticle.findMany({
        where: { isActive: true },
        select: { id: true, title: true, body: true, category: true, tags: true },
      }),
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      ...(row.category ? { category: row.category } : {}),
      tags: row.tags,
    }));
  }

  /** Run only the tools the caller's role permits; a denied tool yields a `forbidden` ToolResult. */
  private async runTools(principal: AuthPrincipal, message: string): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const tool of routeTools(message)) {
      const permission = this.tools.permissionFor(tool);
      if (permission && !principal.permissions.has(permission)) {
        results.push({ tool, ok: false, error: "forbidden" });
        continue;
      }
      results.push(await this.tools.run(principal, tool));
    }
    return results;
  }

  private async persist(
    tx: Prisma.TransactionClient,
    args: { tenantId: string; userId: string; dto: SendMessageDto; answer: AssistAnswer },
  ) {
    const { tenantId, userId, dto, answer } = args;
    const conversationId = await this.resolveConversation(tx, tenantId, userId, dto);

    await tx.assistMessage.create({
      data: { tenantId, conversationId, role: "USER", content: dto.message },
    });
    const assistant = await tx.assistMessage.create({
      data: {
        tenantId,
        conversationId,
        role: "ASSISTANT",
        content: answer.text,
        usedTools: answer.usedTools,
        citations: answer.citations as unknown as Prisma.InputJsonValue,
        confidence: answer.confidence,
        escalated: answer.escalate,
        escalationReason: answer.escalationReason ? REASON_TO_ENUM[answer.escalationReason] : null,
        provider: this.providers.get().name,
      },
      select: MESSAGE_SELECT,
    });
    // Touch the conversation so it sorts to the top of the caller's recents.
    await tx.assistConversation.update({ where: { id: conversationId }, data: {} });

    let escalationId: string | null = null;
    if (answer.escalate && answer.escalationReason) {
      const escalation = await tx.assistEscalation.create({
        data: {
          tenantId,
          conversationId,
          userId,
          reason: REASON_TO_ENUM[answer.escalationReason],
          question: redactPii(dto.message),
        },
        select: { id: true },
      });
      escalationId = escalation.id;
    }

    await this.audit.record(tx, {
      tenantId,
      actorType: "user",
      actorUserId: userId,
      action: "assist.message",
      entityType: "AssistConversation",
      entityId: conversationId,
      // PII-redacted: the audit trail must not become a PII sink (golden rule 1).
      after: {
        question: redactPii(dto.message),
        usedTools: answer.usedTools,
        confidence: answer.confidence,
        escalated: answer.escalate,
        provider: this.providers.get().name,
      },
    });

    return { conversationId, message: assistant, escalated: answer.escalate, escalationId };
  }

  /** Continue the caller's existing conversation (ownership-checked) or start a new one. */
  private async resolveConversation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: SendMessageDto,
  ): Promise<string> {
    if (dto.conversationId) {
      const existing = await tx.assistConversation.findFirst({
        where: { id: dto.conversationId, userId },
        select: { id: true },
      });
      if (!existing) throw conversationNotFound();
      return existing.id;
    }
    const created = await tx.assistConversation.create({
      data: { tenantId, userId, title: deriveTitle(dto.message) },
      select: { id: true },
    });
    return created.id;
  }

  private requireTenant(principal: AuthPrincipal): string {
    if (!principal.tenantId) {
      throw new BadRequestException({ code: "BAD_REQUEST", message: "Tenant context required" });
    }
    return principal.tenantId;
  }

  private requireUser(principal: AuthPrincipal): { tenantId: string; userId: string } {
    if (!principal.tenantId || !principal.userId) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Tenant user required" });
    }
    return { tenantId: principal.tenantId, userId: principal.userId };
  }
}

const MESSAGE_SELECT = {
  id: true,
  role: true,
  content: true,
  usedTools: true,
  citations: true,
  confidence: true,
  escalated: true,
  escalationReason: true,
  createdAt: true,
} satisfies Prisma.AssistMessageSelect;

/** A short conversation title from the opening message (first ~60 chars). */
function deriveTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57)}…`;
}

function conversationNotFound(): NotFoundException {
  return new NotFoundException({ code: "NOT_FOUND", message: "Conversation not found" });
}

function knowledgeNotFound(): NotFoundException {
  return new NotFoundException({ code: "NOT_FOUND", message: "Knowledge article not found" });
}

function knowledgeExists(slug: string): ConflictException {
  return new ConflictException({
    code: "KNOWLEDGE_EXISTS",
    message: `A knowledge article with slug ${slug} already exists`,
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}
