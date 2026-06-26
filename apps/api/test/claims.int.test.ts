/**
 * Expense-claim integration tests (Phase 4).
 *
 * Exercises the acceptance criterion "claim with attachment flows end-to-end": an employee submits a
 * claim, attaches a receipt, an approver approves it, the receipt is downloadable, and on publish the
 * approved claim is reimbursed as a payroll input and marked PAID.
 *
 * StorageService is replaced with an in-memory stub so no S3 / LocalStack is needed.
 */
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { createPrismaClient, type PrismaClient, runInTenant } from "@payce/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { StorageService } from "../src/storage/storage.service";
import { truncateAll } from "./helpers/db";

class InMemoryStorageService {
  private readonly store = new Map<string, Buffer>();
  async putObject(key: string, body: Buffer): Promise<void> {
    this.store.set(key, body);
  }
  async presignedUrl(key: string): Promise<string> {
    return `https://s3.test/payce/${key}?signature=test`;
  }
  has(key: string): boolean {
    return this.store.has(key);
  }
  get(key: string): Buffer | undefined {
    return this.store.get(key);
  }
  keys(): string[] {
    return [...this.store.keys()];
  }
}

const PLATFORM_KEY = "dev-platform-admin-key";
const ADMIN = {
  email: "claim-admin@acme.test",
  displayName: "Claim Admin",
  password: "Claim-Adm1n-123",
};
const EMP = {
  email: "claim-emp@acme.test",
  displayName: "Cam Employee",
  password: "Claim-Emp1-456",
};
const APPROVER = {
  email: "claim-chk@acme.test",
  displayName: "Claim Checker",
  password: "Claim-Chk1-789",
};

const CLAIM_AMOUNT_MINOR = 250_00; // $250.00
const RECEIPT = Buffer.from("%PDF-1.4 synthetic receipt body");

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;
let storage: InMemoryStorageService;

let tenantId: string;
let adminToken: string;
let empToken: string;
let approverToken: string;
let employeeId: string;
let groupId: string;
let periodId: string;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function makeUser(
  tx: Parameters<Parameters<typeof runInTenant>[2]>[0],
  roleKey: string,
  account: { email: string; displayName: string; password: string },
): Promise<string> {
  const role = await tx.role.findFirstOrThrow({ where: { key: roleKey } });
  const user = await tx.user.create({
    data: { tenantId, email: account.email, displayName: account.displayName, status: "ACTIVE" },
  });
  await tx.credential.create({
    data: { tenantId, userId: user.id, passwordHash: await hash(account.password) },
  });
  await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });
  return user.id;
}

async function login(slug: string, account: { email: string; password: string }): Promise<string> {
  const res = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: slug, email: account.email, password: account.password });
  return res.body.accessToken as string;
}

beforeAll(async () => {
  prisma = createPrismaClient();
  await truncateAll(prisma);
  storage = new InMemoryStorageService();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(storage)
    .compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  await app.init();
  server = app.getHttpServer();

  const created = await request(server)
    .post("/api/v1/tenants")
    .set("x-platform-admin-key", PLATFORM_KEY)
    .send({ name: "ClaimCo", slug: "claimco", admin: ADMIN });
  tenantId = created.body.id;
  adminToken = await login("claimco", ADMIN);

  await runInTenant(prisma, tenantId, async (tx) => {
    const empUserId = await makeUser(tx, "employee", EMP);
    await makeUser(tx, "payroll_approver", APPROVER);

    const entity = await tx.legalEntity.create({
      data: { tenantId, name: "ClaimCo US", countryCode: "US" },
    });
    const group = await tx.payGroup.create({
      data: {
        tenantId,
        code: "CL-US-M",
        name: "ClaimCo US Monthly",
        countryCode: "US",
        currencyCode: "USD",
        frequency: "MONTHLY",
        legalEntityId: entity.id,
      },
    });
    groupId = group.id;

    const emp = await tx.employee.create({
      data: {
        tenantId,
        employeeNumber: "CL-1",
        userId: empUserId,
        firstName: "Cam",
        lastName: "Employee",
        hireDate: new Date("2024-01-01"),
        payGroupId: groupId,
      },
    });
    employeeId = emp.id;
    await tx.compensationRecord.create({
      data: {
        tenantId,
        employeeId: emp.id,
        amountMinor: BigInt(120_000_00),
        currencyCode: "USD",
        frequency: "ANNUAL",
        effectiveFrom: new Date("2024-01-01"),
      },
    });

    const period = await tx.payPeriod.create({
      data: {
        tenantId,
        payGroupId: groupId,
        sequence: 1,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
        payDate: new Date("2026-02-05"),
        status: "OPEN",
      },
    });
    periodId = period.id;
  });

  empToken = await login("claimco", EMP);
  approverToken = await login("claimco", APPROVER);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("claim with attachment → payroll reimbursement (Phase 4)", () => {
  let claimId: string;
  let attachmentId: string;

  it("employee submits a claim", async () => {
    const res = await request(server).post("/api/v1/claims").set(auth(empToken)).send({
      category: "TRAVEL",
      title: "Taxi to client site",
      amountMinor: CLAIM_AMOUNT_MINOR,
      currencyCode: "USD",
      incurredOn: "2026-01-10",
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.amountMinor).toBe(CLAIM_AMOUNT_MINOR);
    claimId = res.body.id;
  });

  it("employee attaches a receipt; the binary lands in storage", async () => {
    const res = await request(server)
      .post(`/api/v1/claims/${claimId}/attachments`)
      .set(auth(empToken))
      .send({
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        contentBase64: RECEIPT.toString("base64"),
      });
    expect(res.status).toBe(201);
    expect(res.body.sizeBytes).toBe(RECEIPT.length);
    attachmentId = res.body.id;

    const key = storage.keys().find((k) => k.startsWith(`claims/${tenantId}/${claimId}/`));
    expect(key).toBeTruthy();
    expect(storage.get(key!)).toEqual(RECEIPT);
  });

  it("serves a presigned download URL for the receipt", async () => {
    const res = await request(server)
      .get(`/api/v1/claims/${claimId}/attachments/${attachmentId}`)
      .set(auth(empToken));
    expect(res.status).toBe(200);
    expect(res.body.fileName).toBe("receipt.pdf");
    expect(typeof res.body.url).toBe("string");
  });

  it("an employee cannot approve a claim (authZ, server-side)", async () => {
    const res = await request(server)
      .post(`/api/v1/claims/${claimId}/approve`)
      .set(auth(empToken))
      .send({});
    expect(res.status).toBe(403);
  });

  it("cannot attach to a claim once it is decided", async () => {
    await request(server).post(`/api/v1/claims/${claimId}/approve`).set(auth(adminToken)).send({});
    const res = await request(server)
      .post(`/api/v1/claims/${claimId}/attachments`)
      .set(auth(empToken))
      .send({
        fileName: "late.pdf",
        contentType: "application/pdf",
        contentBase64: RECEIPT.toString("base64"),
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CLAIM_NOT_PENDING");
  });

  it("reimburses the approved claim as a payroll input and marks it PAID on publish", async () => {
    const run = (
      await request(server)
        .post("/api/v1/payroll/runs")
        .set(auth(adminToken))
        .send({ payGroupId: groupId, payPeriodId: periodId })
    ).body;
    await request(server).post(`/api/v1/payroll/runs/${run.id}/calculate`).set(auth(adminToken));

    const lines = await request(server)
      .get(`/api/v1/payroll/runs/${run.id}/lines`)
      .set(auth(adminToken));
    const line = lines.body.data.find((l: { employeeId: string }) => l.employeeId === employeeId);
    const reimbursement = line.lines.find((e: { code: string }) => e.code === "reimbursement");
    expect(reimbursement).toBeTruthy();
    expect(reimbursement.type).toBe("EARNING");
    expect(reimbursement.amountMinor).toBe(CLAIM_AMOUNT_MINOR);

    // Drive the run to PUBLISHED (maker-checker: a distinct approver).
    await request(server).post(`/api/v1/payroll/runs/${run.id}/submit`).set(auth(adminToken));
    await request(server)
      .post(`/api/v1/payroll/runs/${run.id}/approve`)
      .set(auth(approverToken))
      .send({ note: "ok" });
    const published = await request(server)
      .post(`/api/v1/payroll/runs/${run.id}/publish`)
      .set(auth(adminToken));
    expect(published.status).toBe(201);

    const claim = await request(server).get(`/api/v1/claims/${claimId}`).set(auth(adminToken));
    expect(claim.body.status).toBe("PAID");
    expect(claim.body.payrollRunId).toBe(run.id);
  });

  it("isolates claims across tenants (RLS)", async () => {
    await request(server)
      .post("/api/v1/tenants")
      .set("x-platform-admin-key", PLATFORM_KEY)
      .send({
        name: "OtherClaim",
        slug: "other-claim",
        admin: {
          email: "admin@other-claim.test",
          displayName: "Other",
          password: "Other-Pass-123",
        },
      });
    const otherToken = await login("other-claim", {
      email: "admin@other-claim.test",
      password: "Other-Pass-123",
    });

    const list = await request(server).get("/api/v1/claims").set(auth(otherToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);

    const byId = await request(server).get(`/api/v1/claims/${claimId}`).set(auth(otherToken));
    expect(byId.status).toBe(404);
  });
});
