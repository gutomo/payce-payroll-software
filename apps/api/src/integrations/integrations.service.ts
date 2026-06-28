import { randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { type Prisma, runInTenant } from "@payce/db";
import {
  connectorSummaries,
  getConnector,
  hashSeed,
  isWebhookEvent,
  recordsToCsv,
  signPayload,
  type WebhookEvent,
} from "@payce/integrations";
import { AuditService } from "../audit/audit.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { EmployeesImportService } from "../employees/employees-import.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateIntegrationDto, CreateWebhookDto, TriggerRunDto } from "./integrations.dto";

const DEFAULT_RUN_COUNT = 25;

/** Webhook fields safe to return on reads (the signing secret is shown only once, on creation). */
const WEBHOOK_PUBLIC_SELECT = {
  id: true,
  url: true,
  events: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WebhookSelect;

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employeesImport: EmployeesImportService,
  ) {}

  /** The connectors available to configure (catalog; no DB). */
  listConnectors() {
    return { data: connectorSummaries() };
  }

  // ─────────────────────────── Integrations ───────────────────────────

  async createIntegration(principal: AuthPrincipal, dto: CreateIntegrationDto) {
    const { tenantId, userId } = this.requireUser(principal);
    if (!getConnector(dto.connectorKey)) {
      throw new BadRequestException({
        code: "UNKNOWN_CONNECTOR",
        message: `Unknown connector: ${dto.connectorKey}`,
      });
    }
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const integration = await tx.integration.create({
        data: {
          tenantId,
          connectorKey: dto.connectorKey,
          name: dto.name,
          config: dto.config ?? {},
          createdBy: userId,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "integration.created",
        entityType: "Integration",
        entityId: integration.id,
        after: { connectorKey: dto.connectorKey, name: dto.name },
      });
      return integration;
    });
  }

  async listIntegrations(principal: AuthPrincipal) {
    const tenantId = this.requireTenant(principal);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.integration.findMany({ orderBy: { createdAt: "desc" } }),
    );
    return { data };
  }

  async getIntegration(principal: AuthPrincipal, id: string) {
    const tenantId = this.requireTenant(principal);
    const integration = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.integration.findFirst({ where: { id } }),
    );
    if (!integration) throw integrationNotFound();
    return integration;
  }

  async listRuns(principal: AuthPrincipal, integrationId: string) {
    const tenantId = this.requireTenant(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const integration = await tx.integration.findFirst({
        where: { id: integrationId },
        select: { id: true },
      });
      if (!integration) throw integrationNotFound();
      const data = await tx.integrationRun.findMany({
        where: { integrationId },
        orderBy: { createdAt: "desc" },
      });
      return { data };
    });
  }

  /**
   * Trigger an inbound sync. Idempotent: the same `idempotencyKey` returns the existing run instead of
   * importing again. The connector yields synthetic records (seeded from the key, so the batch is
   * reproducible), which are normalised to CSV and fed through the existing validated employee-import
   * pipeline. On success, subscribed webhooks receive a signed delivery.
   */
  async triggerRun(principal: AuthPrincipal, integrationId: string, dto: TriggerRunDto) {
    const { tenantId, userId } = this.requireUser(principal);
    const idempotencyKey = dto.idempotencyKey ?? randomUUID();

    // 1. Resolve the integration and short-circuit if this key already produced a run.
    const ctx = await runInTenant(this.prisma, tenantId, async (tx) => {
      const integration = await tx.integration.findFirst({
        where: { id: integrationId },
        select: { id: true, connectorKey: true, status: true, config: true },
      });
      if (!integration) throw integrationNotFound();
      if (integration.status !== "ACTIVE") {
        throw new ConflictException({
          code: "INTEGRATION_DISABLED",
          message: "Integration is disabled",
        });
      }
      const existing = await tx.integrationRun.findFirst({
        where: { integrationId, idempotencyKey },
      });
      return { integration, existing };
    });
    if (ctx.existing) return ctx.existing;

    // 2. Reserve the run row. A concurrent duplicate loses the unique race and returns the winner's run.
    let run: { id: string };
    try {
      run = await runInTenant(this.prisma, tenantId, (tx) =>
        tx.integrationRun.create({
          data: {
            tenantId,
            integrationId,
            direction: "INBOUND",
            status: "RUNNING",
            idempotencyKey,
            startedAt: new Date(),
            createdBy: userId,
          },
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        return runInTenant(this.prisma, tenantId, (tx) =>
          tx.integrationRun.findFirstOrThrow({ where: { integrationId, idempotencyKey } }),
        );
      }
      throw err;
    }

    // 3. Pull → normalise → import, then finalise the run and notify webhooks.
    const connector = getConnector(ctx.integration.connectorKey);
    if (!connector) {
      return this.failRun(tenantId, run.id, `Unknown connector: ${ctx.integration.connectorKey}`);
    }
    try {
      const count = dto.count ?? readConfigCount(ctx.integration.config) ?? DEFAULT_RUN_COUNT;
      const seed = hashSeed(`${integrationId}:${idempotencyKey}`);
      const records = connector.fetchEmployees({ seed, count });
      const result = await this.employeesImport.importCsv(
        principal,
        Buffer.from(recordsToCsv(records), "utf-8"),
        true,
      );
      const stats = {
        fetched: records.length,
        total: result.total,
        valid: result.valid,
        imported: result.imported,
        errors: result.errors.length,
      };
      const finished = await runInTenant(this.prisma, tenantId, async (tx) => {
        const updated = await tx.integrationRun.update({
          where: { id: run.id },
          data: { status: "SUCCEEDED", stats, finishedAt: new Date() },
        });
        await this.audit.record(tx, {
          tenantId,
          actorType: "user",
          actorUserId: userId,
          action: "integration.run.succeeded",
          entityType: "IntegrationRun",
          entityId: updated.id,
          after: stats,
        });
        return updated;
      });
      await this.emit(tenantId, "integration.run.succeeded", {
        integrationId,
        runId: finished.id,
        stats,
      });
      if (result.imported > 0) {
        await this.emit(tenantId, "employee.imported", {
          integrationId,
          runId: finished.id,
          imported: result.imported,
        });
      }
      return finished;
    } catch (err) {
      return this.failRun(tenantId, run.id, err instanceof Error ? err.message : "import failed");
    }
  }

  // ─────────────────────────── Webhooks ───────────────────────────

  async createWebhook(principal: AuthPrincipal, dto: CreateWebhookDto) {
    const { tenantId, userId } = this.requireUser(principal);
    const events = this.validateEvents(dto.events);
    // Generated server-side and returned exactly once; receivers use it to verify delivery signatures.
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const webhook = await tx.webhook.create({
        data: { tenantId, url: dto.url, secret, events, createdBy: userId },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "webhook.created",
        entityType: "Webhook",
        entityId: webhook.id,
        after: { url: dto.url, events },
      });
      // Include the secret this once so the caller can store it.
      return {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        status: webhook.status,
        secret,
        createdAt: webhook.createdAt,
      };
    });
  }

  async listWebhooks(principal: AuthPrincipal) {
    const tenantId = this.requireTenant(principal);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.webhook.findMany({ orderBy: { createdAt: "desc" }, select: WEBHOOK_PUBLIC_SELECT }),
    );
    return { data };
  }

  async deleteWebhook(principal: AuthPrincipal, id: string) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.webhook.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw webhookNotFound();
      await tx.webhook.delete({ where: { id } });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "webhook.deleted",
        entityType: "Webhook",
        entityId: id,
      });
      return { id };
    });
  }

  async listDeliveries(principal: AuthPrincipal, webhookId: string) {
    const tenantId = this.requireTenant(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const webhook = await tx.webhook.findFirst({
        where: { id: webhookId },
        select: { id: true },
      });
      if (!webhook) throw webhookNotFound();
      const data = await tx.webhookDelivery.findMany({
        where: { webhookId },
        orderBy: { createdAt: "desc" },
      });
      return { data };
    });
  }

  // ─────────────────────────── helpers ───────────────────────────

  /**
   * Deliver an event to every active webhook subscribed to it. v1 delivery is simulated in-process
   * (sign + record as DELIVERED); production routes this through an SQS-backed worker that POSTs to the
   * URL with retries + a DLQ. Idempotent per (webhook, eventId).
   */
  private async emit(
    tenantId: string,
    eventType: WebhookEvent,
    data: Prisma.InputJsonValue,
  ): Promise<void> {
    const eventId = randomUUID();
    const payload = {
      id: eventId,
      type: eventType,
      createdAt: new Date().toISOString(),
      data,
    } satisfies Prisma.InputJsonObject;
    const body = JSON.stringify(payload);
    await runInTenant(this.prisma, tenantId, async (tx) => {
      const webhooks = await tx.webhook.findMany({
        where: { status: "ACTIVE", events: { has: eventType } },
        select: { id: true, secret: true },
      });
      for (const webhook of webhooks) {
        await tx.webhookDelivery.create({
          data: {
            tenantId,
            webhookId: webhook.id,
            eventId,
            eventType,
            payload,
            signature: signPayload(webhook.secret, body),
            status: "DELIVERED",
            statusCode: 200,
            attempts: 1,
            deliveredAt: new Date(),
          },
        });
      }
    });
  }

  private async failRun(tenantId: string, runId: string, message: string) {
    const run = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.integrationRun.update({
        where: { id: runId },
        data: { status: "FAILED", error: message.slice(0, 1000), finishedAt: new Date() },
      }),
    );
    await this.emit(tenantId, "integration.run.failed", { runId, error: message });
    return run;
  }

  private validateEvents(events: string[]): WebhookEvent[] {
    const unknown = events.filter((event) => !isWebhookEvent(event));
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: "UNKNOWN_EVENT",
        message: `Unknown webhook event(s): ${unknown.join(", ")}`,
      });
    }
    return [...new Set(events as WebhookEvent[])];
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

/** Read the optional per-integration record count from its stored config JSON. */
function readConfigCount(config: Prisma.JsonValue | null): number | undefined {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    const value = (config as Record<string, unknown>).count;
    if (typeof value === "number") return value;
  }
  return undefined;
}

function integrationNotFound(): NotFoundException {
  return new NotFoundException({ code: "NOT_FOUND", message: "Integration not found" });
}

function webhookNotFound(): NotFoundException {
  return new NotFoundException({ code: "NOT_FOUND", message: "Webhook not found" });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}
