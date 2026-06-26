/**
 * Payslip PDF endpoint integration tests (Phase 3 slice 7).
 *
 * StorageService is replaced with an in-memory mock so no S3 / LocalStack is required.
 * The mock captures uploaded buffers in a Map, which lets us assert that a real PDF was
 * produced and stored before the presigned URL is served.
 */
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { createPrismaClient, type PrismaClient, runInTenant } from "@payce/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { StorageService } from "../src/storage/storage.service";
import { truncateAll } from "./helpers/db";

// ─── In-memory S3 stub ───────────────────────────────────────────────────────

class InMemoryStorageService {
  private readonly store = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer): Promise<void> {
    this.store.set(key, body);
  }

  async presignedUrl(key: string): Promise<string> {
    return `https://s3.test/payce-payslips/${key}?signature=test`;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  get(key: string): Buffer | undefined {
    return this.store.get(key);
  }

  size(): number {
    return this.store.size;
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ADMIN = {
  email: "slips-admin@acme.test",
  displayName: "Slips Admin",
  password: "Slip5-Pass-123",
};
const APPROVER = {
  email: "slips-checker@acme.test",
  displayName: "Slips Checker",
  password: "Slips-Check-456",
};
const PLATFORM_KEY = "dev-platform-admin-key";

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;
let storage: InMemoryStorageService;

let tenantId: string;
let adminToken: string;
let approverToken: string;
let groupId: string;
let periodId: string;

// IDs of the two employees created in beforeAll
const employeeIds: string[] = [];

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

  // Tenant + admin
  const created = await request(server)
    .post("/api/v1/tenants")
    .set("x-platform-admin-key", PLATFORM_KEY)
    .send({ name: "SlipsCo", slug: "slipsco", admin: ADMIN });
  tenantId = created.body.id;

  const login = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: "slipsco", email: ADMIN.email, password: ADMIN.password });
  adminToken = login.body.accessToken;

  // Approver user (payroll_approver role)
  const passwordHash = await hash(APPROVER.password);
  await runInTenant(prisma, tenantId, async (tx) => {
    const role = await tx.role.findFirstOrThrow({ where: { key: "payroll_approver" } });
    const user = await tx.user.create({
      data: {
        tenantId,
        email: APPROVER.email,
        displayName: APPROVER.displayName,
        status: "ACTIVE",
      },
    });
    await tx.credential.create({ data: { tenantId, userId: user.id, passwordHash } });
    await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });
  });
  const approverLogin = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: "slipsco", email: APPROVER.email, password: APPROVER.password });
  approverToken = approverLogin.body.accessToken;

  // Pay group + employees + period
  await runInTenant(prisma, tenantId, async (tx) => {
    const entity = await tx.legalEntity.create({
      data: { tenantId, name: "SlipsCo US", countryCode: "US" },
    });
    const group = await tx.payGroup.create({
      data: {
        tenantId,
        code: "SLIPS-US-M",
        name: "Slips US Monthly",
        countryCode: "US",
        currencyCode: "USD",
        frequency: "MONTHLY",
        legalEntityId: entity.id,
      },
    });
    groupId = group.id;

    for (let i = 1; i <= 2; i++) {
      const emp = await tx.employee.create({
        data: {
          tenantId,
          employeeNumber: `S-${i}`,
          firstName: "Alice",
          lastName: `Slip${i}`,
          hireDate: new Date("2024-01-01"),
          payGroupId: groupId,
        },
      });
      employeeIds.push(emp.id);
      await tx.compensationRecord.create({
        data: {
          tenantId,
          employeeId: emp.id,
          amountMinor: BigInt(600000_00),
          currencyCode: "USD",
          frequency: "ANNUAL",
          effectiveFrom: new Date("2024-01-01"),
        },
      });
    }

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
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const auth = (token = adminToken) => ({ authorization: `Bearer ${token}` });

describe("payslip PDF endpoint (Phase 3 slice 7)", () => {
  let runId: string;

  it("returns 404 before the run is published (no payslip generated yet)", async () => {
    // Create a fresh run but don't publish it.
    const run = (
      await request(server)
        .post("/api/v1/payroll/runs")
        .set(auth())
        .send({ payGroupId: groupId, payPeriodId: periodId })
    ).body;
    runId = run.id;

    const res = await request(server)
      .get(`/api/v1/payroll/runs/${runId}/payslips/${employeeIds[0]!}`)
      .set(auth());
    expect(res.status).toBe(404);
  });

  // Drive the run through the full lifecycle so payslips get generated on publish.
  it("generates payslips on publish (one PDF per employee in storage)", async () => {
    await request(server).post(`/api/v1/payroll/runs/${runId}/calculate`).set(auth());
    await request(server).post(`/api/v1/payroll/runs/${runId}/submit`).set(auth());
    await request(server)
      .post(`/api/v1/payroll/runs/${runId}/approve`)
      .set({ authorization: `Bearer ${approverToken}` })
      .send({ note: "LGTM" });
    const res = await request(server).post(`/api/v1/payroll/runs/${runId}/publish`).set(auth());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PUBLISHED");

    // Both employees should have a PDF in the in-memory store.
    expect(storage.size()).toBe(2);
    for (const empId of employeeIds) {
      const key = `payslips/${tenantId}/${runId}/${empId}.pdf`;
      expect(storage.has(key)).toBe(true);
      // PDF magic bytes: %PDF
      const bytes = storage.get(key)!;
      expect(bytes.slice(0, 4).toString("ascii")).toBe("%PDF");
    }
  });

  it("GET /:id/payslips/:employeeId returns 200 with url + expiresAt after publish", async () => {
    const empId = employeeIds[0]!;
    const res = await request(server)
      .get(`/api/v1/payroll/runs/${runId}/payslips/${empId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(typeof res.body.url).toBe("string");
    expect(res.body.url).toContain(empId);
    expect(typeof res.body.expiresAt).toBe("string");
    // expiresAt should be ~1 hour from now
    const expiresAt = new Date(res.body.expiresAt as string).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now() + 3500_000);
  });

  it("returns 404 for an employee not part of this run", async () => {
    const res = await request(server)
      .get(`/api/v1/payroll/runs/${runId}/payslips/${randomUUID()}`)
      .set(auth());
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-existent run", async () => {
    const res = await request(server)
      .get(`/api/v1/payroll/runs/${randomUUID()}/payslips/${employeeIds[0]!}`)
      .set(auth());
    expect(res.status).toBe(404);
  });

  it("another tenant cannot access payslips (RLS isolation)", async () => {
    // Create a second tenant with its own admin and verify it gets 404 on the first tenant's run.
    await request(server)
      .post("/api/v1/tenants")
      .set("x-platform-admin-key", PLATFORM_KEY)
      .send({
        name: "Other",
        slug: "other-slips",
        admin: {
          email: "admin@other.test",
          displayName: "Other Admin",
          password: "Other-Pass-789",
        },
      });
    const otherLogin = await request(server)
      .post("/api/v1/auth/login")
      .send({ tenantSlug: "other-slips", email: "admin@other.test", password: "Other-Pass-789" });
    const otherToken = otherLogin.body.accessToken as string;

    const res = await request(server)
      .get(`/api/v1/payroll/runs/${runId}/payslips/${employeeIds[0]!}`)
      .set({ authorization: `Bearer ${otherToken}` });
    expect(res.status).toBe(404);
  });
});
