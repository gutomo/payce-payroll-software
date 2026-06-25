import { Injectable } from "@nestjs/common";
import type { Prisma } from "@payce/db";
import { getRequestContext } from "../common/request-context";

export type ActorType = "platform" | "user" | "system";

export interface AuditInput {
  tenantId: string;
  actorType: ActorType;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

/**
 * Appends audit events. `record` takes the tenant-scoped transaction client so the audit write is
 * atomic with the mutation it describes and runs under the same RLS context (PLAN.md §8, golden rule 4).
 */
@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, input: AuditInput): Promise<void> {
    const ctx = getRequestContext();
    await tx.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        actorType: input.actorType,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: input.before,
        after: input.after,
        requestId: ctx?.requestId ?? null,
        ip: ctx?.ip ?? null,
      },
    });
  }
}
