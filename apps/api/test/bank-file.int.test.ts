/**
 * Bank file export integration tests (Phase 3 slice 8).
 *
 * StorageService is replaced with an in-memory stub (same pattern as payslips.int.test.ts) so
 * no S3 / LocalStack dependency is needed in CI.
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
  private readonly store = new Map<string, { body: Buffer; contentType: string }>();

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    this.store.set(key, { body, contentType });
  }

  async presignedUrl(key: string): Promise<string> {
    return `https://s3.test/payce/${key}?signature=test`;
  }

  get(key: string): { body: Buffer; contentType: string } | undefined {
    return this.store.get(key);
  }

  keys(): string[] {
    return [...this.store.keys()];
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PLATFORM_KEY = "dev-platform-admin-key";
const ADMIN = {
  email: "bf-admin@corp.test",
  displayName: "BF Admin",
  password: "BfAdmin-Pass-123",
};
const APPROVER = {
  email: "bf-checker@corp.test",
  displayName: "BF Checker",
  password: "BfCheck-Pass-456",
};

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;
let storage: InMemoryStorageService;

let tenantId: string;
let adminToken: string;
let approverToken: string;
let groupId: string;
let periodId: string;
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
    .send({ name: "CorpHQ", slug: "corp-hq", admin: ADMIN });
  tenantId = created.body.id;

  const login = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: "corp-hq", email: ADMIN.email, password: ADMIN.password });
  adminToken = login.body.accessToken;

  // Approver
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
    .send({ tenantSlug: "corp-hq", email: APPROVER.email, password: APPROVER.password });
  approverToken = approverLogin.body.accessToken;

  // Pay group + two employees + one pay period
  await runInTenant(prisma, tenantId, async (tx) => {
    const entity = await tx.legalEntity.create({
      data: { tenantId, name: "CorpHQ US", countryCode: "US" },
    });
    const group = await tx.payGroup.create({
      data: {
        tenantId,
        code: "BF-US-M",
        name: "BF US Monthly",
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
          employeeNumber: `BF-${i}`,
          firstName: "Bob",
          lastName: `Finance${i}`,
          hireDate: new Date("2024-01-01"),
          payGroupId: groupId,
        },
      });
      employeeIds.push(emp.id);
      await tx.compensationRecord.create({
        data: {
          tenantId,
          employeeId: emp.id,
          amountMinor: BigInt(720000_00), // $72,000/yr
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

describe("bank file export (Phase 3 slice 8)", () => {
  let runId: string;

  it("returns 404 before the run is published (bank file not generated yet)", async () => {
    const run = (
      await request(server)
        .post("/api/v1/payroll/runs")
        .set(auth())
        .send({ payGroupId: groupId, payPeriodId: periodId })
    ).body;
    runId = run.id;

    const res = await request(server).get(`/api/v1/payroll/runs/${runId}/bank-file`).set(auth());
    expect(res.status).toBe(404);
  });

  it("generates the bank file CSV on publish and stores it in S3", async () => {
    await request(server).post(`/api/v1/payroll/runs/${runId}/calculate`).set(auth());
    await request(server).post(`/api/v1/payroll/runs/${runId}/submit`).set(auth());
    await request(server)
      .post(`/api/v1/payroll/runs/${runId}/approve`)
      .set({ authorization: `Bearer ${approverToken}` })
      .send({ note: "Approved" });
    const pub = await request(server).post(`/api/v1/payroll/runs/${runId}/publish`).set(auth());
    expect(pub.status).toBe(201);

    // Exactly one bank file key should have been uploaded.
    const bankKeys = storage.keys().filter((k) => k.startsWith("bank-files/"));
    expect(bankKeys).toHaveLength(1);

    const expected = `bank-files/${tenantId}/${runId}/payment-instructions.csv`;
    expect(bankKeys[0]).toBe(expected);

    const stored = storage.get(expected)!;
    expect(stored.contentType).toBe("text/csv");

    // Verify CSV shape: header row + one row per employee.
    const csv = stored.body.toString("utf8");
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3); // header + 2 employees
    expect(lines[0]).toContain("reference");
    expect(lines[0]).toContain("net_pay_minor");
    expect(lines[0]).toContain("pay_date");

    // Each data row should contain the pay date and USD currency.
    for (const row of lines.slice(1)) {
      expect(row).toContain("2026-02-05");
      expect(row).toContain("USD");
      expect(row).toContain("PAYROLL/2026-01/BF-");
    }
  });

  it("GET /:id/bank-file returns 200 with url + expiresAt + format after publish", async () => {
    const res = await request(server).get(`/api/v1/payroll/runs/${runId}/bank-file`).set(auth());
    expect(res.status).toBe(200);
    expect(typeof res.body.url).toBe("string");
    expect(res.body.url).toContain("payment-instructions.csv");
    expect(typeof res.body.expiresAt).toBe("string");
    expect(res.body.format).toBe("CSV");
    // expiresAt ~1 hour out
    const expiresAt = new Date(res.body.expiresAt as string).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now() + 3500_000);
  });

  it("returns 404 for a non-existent run", async () => {
    const res = await request(server)
      .get(`/api/v1/payroll/runs/${randomUUID()}/bank-file`)
      .set(auth());
    expect(res.status).toBe(404);
  });

  it("another tenant cannot access the bank file (RLS isolation)", async () => {
    await request(server)
      .post("/api/v1/tenants")
      .set("x-platform-admin-key", PLATFORM_KEY)
      .send({
        name: "Other",
        slug: "other-bf",
        admin: { email: "admin@other-bf.test", displayName: "Other", password: "OtherBf-Pass-789" },
      });
    const otherLogin = await request(server)
      .post("/api/v1/auth/login")
      .send({ tenantSlug: "other-bf", email: "admin@other-bf.test", password: "OtherBf-Pass-789" });
    const otherToken = otherLogin.body.accessToken as string;

    const res = await request(server)
      .get(`/api/v1/payroll/runs/${runId}/bank-file`)
      .set({ authorization: `Bearer ${otherToken}` });
    expect(res.status).toBe(404);
  });

  it("net pay values in the CSV match the run lines", async () => {
    const linesRes = await request(server).get(`/api/v1/payroll/runs/${runId}/lines`).set(auth());
    expect(linesRes.status).toBe(200);

    const stored = storage.get(`bank-files/${tenantId}/${runId}/payment-instructions.csv`)!;
    const csv = stored.body.toString("utf8");
    const dataRows = csv.trim().split("\n").slice(1);

    for (const apiLine of linesRes.body.data as Array<{
      netMinor: number;
      employeeNumber: string;
    }>) {
      const matchingRow = dataRows.find((r) => r.includes(apiLine.employeeNumber));
      expect(matchingRow).toBeDefined();
      expect(matchingRow).toContain(apiLine.netMinor.toString());
    }
  });
});
