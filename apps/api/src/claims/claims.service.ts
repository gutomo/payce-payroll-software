import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { type Prisma, runInTenant } from "@payce/db";
import { AuditService } from "../audit/audit.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { AddAttachmentDto, ClaimDecisionDto, CreateClaimDto } from "./claims.dto";

type Decision = "APPROVE" | "REJECT";

const CLAIM_STATUSES = ["PENDING", "APPROVED", "REJECTED", "PAID"] as const;

const CLAIM_SELECT = {
  id: true,
  employeeId: true,
  category: true,
  title: true,
  amountMinor: true,
  currencyCode: true,
  incurredOn: true,
  status: true,
  note: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNote: true,
  payrollRunId: true,
  createdAt: true,
  attachments: {
    select: { id: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
  },
} satisfies Prisma.ClaimSelect;

@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** Employee submits a claim on their own behalf. */
  async create(principal: AuthPrincipal, dto: CreateClaimDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const employee = await this.resolveSelf(tx, userId);
      const claim = await tx.claim.create({
        data: {
          tenantId,
          employeeId: employee.id,
          category: dto.category,
          title: dto.title,
          amountMinor: BigInt(dto.amountMinor),
          currencyCode: dto.currencyCode,
          incurredOn: new Date(`${dto.incurredOn}T00:00:00.000Z`),
          note: dto.note ?? null,
          status: "PENDING",
          createdBy: userId,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "claim.created",
        entityType: "Claim",
        entityId: claim.id,
        after: {
          category: dto.category,
          amountMinor: dto.amountMinor,
          currencyCode: dto.currencyCode,
        },
      });
      return this.find(tx, claim.id);
    });
  }

  /** Attach a receipt to one's own still-pending claim. Binary goes to S3; metadata to the DB. */
  async addAttachment(principal: AuthPrincipal, claimId: string, dto: AddAttachmentDto) {
    const { tenantId, userId } = this.requireUser(principal);

    const body = Buffer.from(dto.contentBase64, "base64");
    if (body.length === 0) {
      throw new BadRequestException({ code: "EMPTY_ATTACHMENT", message: "Attachment is empty" });
    }
    const safeName = dto.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    const s3Key = `claims/${tenantId}/${claimId}/${randomUUID()}-${safeName}`;

    // Validate ownership/state, upload the binary, then record metadata — all under the tenant GUC
    // (which is transaction-scoped, so the S3 PUT must live inside runInTenant).
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const claim = await tx.claim.findFirst({
        where: { id: claimId },
        select: { id: true, status: true, employeeId: true },
      });
      if (!claim) throw claimNotFound();
      const employee = await this.resolveSelf(tx, userId);
      if (claim.employeeId !== employee.id) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Claim not found" });
      }
      if (claim.status !== "PENDING") {
        throw new ConflictException({
          code: "CLAIM_NOT_PENDING",
          message: `Cannot attach to a claim in status ${claim.status}`,
        });
      }

      await this.storage.putObject(s3Key, body, dto.contentType);
      const attachment = await tx.claimAttachment.create({
        data: {
          tenantId,
          claimId,
          s3Key,
          fileName: dto.fileName,
          contentType: dto.contentType,
          sizeBytes: body.length,
          createdBy: userId,
        },
        select: { id: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: "claim_attachment.added",
        entityType: "ClaimAttachment",
        entityId: attachment.id,
        after: { claimId, fileName: dto.fileName, sizeBytes: body.length },
      });
      return attachment;
    });
  }

  /** Presigned download URL for an attachment. */
  async getAttachmentUrl(principal: AuthPrincipal, claimId: string, attachmentId: string) {
    const tenantId = this.requireTenant(principal);
    const attachment = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.claimAttachment.findFirst({
        where: { id: attachmentId, claimId },
        select: { id: true, s3Key: true, fileName: true, contentType: true },
      }),
    );
    if (!attachment) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Attachment not found" });
    }
    const url = await this.storage.presignedUrl(attachment.s3Key);
    return { fileName: attachment.fileName, contentType: attachment.contentType, url };
  }

  /** Approver decides a pending claim. Approved claims become payroll reimbursement inputs. */
  async decide(principal: AuthPrincipal, id: string, decision: Decision, dto: ClaimDecisionDto) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const claim = await tx.claim.findFirst({ where: { id }, select: { id: true, status: true } });
      if (!claim) throw claimNotFound();
      if (claim.status !== "PENDING") {
        throw new ConflictException({
          code: "CLAIM_NOT_PENDING",
          message: `Cannot decide a claim in status ${claim.status}`,
        });
      }
      await tx.claim.update({
        where: { id: claim.id },
        data: {
          status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNote: dto.note ?? null,
          updatedBy: userId,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: "user",
        actorUserId: userId,
        action: decision === "APPROVE" ? "claim.approved" : "claim.rejected",
        entityType: "Claim",
        entityId: claim.id,
        after: dto.note ? { note: dto.note } : undefined,
      });
      return this.find(tx, claim.id);
    });
  }

  async list(principal: AuthPrincipal, status?: string) {
    const tenantId = this.requireTenant(principal);
    const statusFilter = CLAIM_STATUSES.find((s) => s === status);
    const data = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.claim.findMany({
        where: statusFilter ? { status: statusFilter } : undefined,
        orderBy: { createdAt: "desc" },
        select: CLAIM_SELECT,
      }),
    );
    return { data: data.map(serializeClaim) };
  }

  async myClaims(principal: AuthPrincipal) {
    const { tenantId, userId } = this.requireUser(principal);
    return runInTenant(this.prisma, tenantId, async (tx) => {
      const employee = await this.resolveSelf(tx, userId);
      const data = await tx.claim.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: "desc" },
        select: CLAIM_SELECT,
      });
      return { data: data.map(serializeClaim) };
    });
  }

  async getById(principal: AuthPrincipal, id: string) {
    const tenantId = this.requireTenant(principal);
    const claim = await runInTenant(this.prisma, tenantId, (tx) => this.find(tx, id));
    if (!claim) throw claimNotFound();
    return claim;
  }

  // ─────────────────────────── helpers ───────────────────────────

  private async find(tx: Prisma.TransactionClient, id: string) {
    const claim = await tx.claim.findFirst({ where: { id }, select: CLAIM_SELECT });
    return claim ? serializeClaim(claim) : null;
  }

  private async resolveSelf(tx: Prisma.TransactionClient, userId: string) {
    const employee = await tx.employee.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException({
        code: "NO_EMPLOYEE_PROFILE",
        message: "No employee profile for this user",
      });
    }
    return employee;
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

type ClaimRow = Prisma.ClaimGetPayload<{ select: typeof CLAIM_SELECT }>;

// BigInt money can't be JSON-serialised directly; expose minor units as a number at the boundary.
function serializeClaim(claim: ClaimRow) {
  return { ...claim, amountMinor: Number(claim.amountMinor) };
}

function claimNotFound(): NotFoundException {
  return new NotFoundException({ code: "NOT_FOUND", message: "Claim not found" });
}
