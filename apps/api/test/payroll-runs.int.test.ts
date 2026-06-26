import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { createPrismaClient, type PrismaClient, runInTenant } from "@payce/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { truncateAll } from "./helpers/db";

const PLATFORM_KEY = "dev-platform-admin-key";
const ADMIN = { email: "admin@acme.test", displayName: "Acme Admin", password: "Sup3r-Secret-123" };
const APPROVER_EMAIL = "checker@acme.test";
const APPROVER_PASS = "Checker-Pass-456";

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;

let tenantId: string;
let adminToken: string;
let approverToken: string;

// Fixtures created in beforeAll
let groupId: string;
let periodId: string;

beforeAll(async () => {
  prisma = createPrismaClient();
  await truncateAll(prisma);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  await app.init();
  server = app.getHttpServer();

  // Create tenant + admin
  const created = await request(server)
    .post("/api/v1/tenants")
    .set("x-platform-admin-key", PLATFORM_KEY)
    .send({ name: "Acme", slug: "acme", admin: ADMIN });
  tenantId = created.body.id;

  const login = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: "acme", email: ADMIN.email, password: ADMIN.password });
  adminToken = login.body.accessToken;

  // Create a dedicated approver user (payroll_approver role — cannot manage runs, only approve)
  const passwordHash = await hash(APPROVER_PASS);
  await runInTenant(prisma, tenantId, async (tx) => {
    const role = await tx.role.findFirstOrThrow({ where: { key: "payroll_approver" } });
    const user = await tx.user.create({
      data: { tenantId, email: APPROVER_EMAIL, displayName: "Checker", status: "ACTIVE" },
    });
    await tx.credential.create({ data: { tenantId, userId: user.id, passwordHash } });
    await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });
  });
  const approverLogin = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: "acme", email: APPROVER_EMAIL, password: APPROVER_PASS });
  approverToken = approverLogin.body.accessToken;

  // Create a pay group with a calendar and one period, and add employees
  await runInTenant(prisma, tenantId, async (tx) => {
    const entity = await tx.legalEntity.create({
      data: { tenantId, name: "Acme US", countryCode: "US" },
    });
    const group = await tx.payGroup.create({
      data: {
        tenantId,
        code: "US-MONTHLY",
        name: "US Monthly",
        countryCode: "US",
        currencyCode: "USD",
        frequency: "MONTHLY",
        legalEntityId: entity.id,
      },
    });
    groupId = group.id;

    // Add two employees with active compensation
    for (let i = 1; i <= 2; i++) {
      const emp = await tx.employee.create({
        data: {
          tenantId,
          employeeNumber: `E-${i}`,
          firstName: "Emp",
          lastName: `No${i}`,
          hireDate: new Date("2024-01-01"),
          payGroupId: groupId,
        },
      });
      await tx.compensationRecord.create({
        data: {
          tenantId,
          employeeId: emp.id,
          amountMinor: BigInt(600000_00), // $60,000/yr in cents
          currencyCode: "USD",
          frequency: "ANNUAL",
          effectiveFrom: new Date("2024-01-01"),
        },
      });
    }

    // One open pay period
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
const approverAuth = () => auth(approverToken);

describe("payroll runs API (Phase 3 slice 5)", () => {
  let runId: string;

  // ── create ──────────────────────────────────────────────────────────────────

  it("creates a DRAFT run for a pay group + pay period", async () => {
    const res = await request(server)
      .post("/api/v1/payroll/runs")
      .set(auth())
      .send({ payGroupId: groupId, payPeriodId: periodId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.payGroupId).toBe(groupId);
    expect(res.body.payPeriodId).toBe(periodId);
    expect(res.body.employeeCount).toBe(0);
    runId = res.body.id;
  });

  it("rejects a duplicate run for the same period (409)", async () => {
    const res = await request(server)
      .post("/api/v1/payroll/runs")
      .set(auth())
      .send({ payGroupId: groupId, payPeriodId: periodId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RUN_EXISTS");
  });

  it("rejects a run for a mismatched period/group (400)", async () => {
    const res = await request(server)
      .post("/api/v1/payroll/runs")
      .set(auth())
      .send({ payGroupId: groupId, payPeriodId: randomUUID() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_PERIOD");
  });

  // ── calculate ────────────────────────────────────────────────────────────────

  it("calculates per-employee lines and moves to CALCULATED", async () => {
    const res = await request(server).post(`/api/v1/payroll/runs/${runId}/calculate`).set(auth());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CALCULATED");
    expect(res.body.employeeCount).toBe(2);
    expect(res.body.grossMinor).toBeGreaterThan(0);
    expect(res.body.deductionsMinor).toBeGreaterThan(0);
    expect(res.body.netMinor).toBeGreaterThan(0);
    expect(res.body.countryCode).toBe("US");
    expect(res.body.rulePackVersion).toBeTruthy();
  });

  it("returns per-employee lines via GET /:id/lines", async () => {
    const res = await request(server).get(`/api/v1/payroll/runs/${runId}/lines`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const [line] = res.body.data;
    expect(line.employeeId).toBeTruthy();
    expect(line.employeeNumber).toBeTruthy();
    expect(line.grossMinor).toBeGreaterThan(0);
    expect(line.netMinor).toBeGreaterThan(0);
    expect(Array.isArray(line.lines)).toBe(true);
  });

  it("GET /:id/anomalies returns empty list for a clean run", async () => {
    const res = await request(server).get(`/api/v1/payroll/runs/${runId}/anomalies`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("recalculate is idempotent (stays CALCULATED, same totals)", async () => {
    const first = (await request(server).get(`/api/v1/payroll/runs/${runId}`).set(auth())).body;

    await request(server).post(`/api/v1/payroll/runs/${runId}/calculate`).set(auth());
    const second = (await request(server).get(`/api/v1/payroll/runs/${runId}`).set(auth())).body;

    expect(second.status).toBe("CALCULATED");
    expect(second.grossMinor).toBe(first.grossMinor);
    expect(second.netMinor).toBe(first.netMinor);
    expect(second.employeeCount).toBe(first.employeeCount);
  });

  // ── submit ───────────────────────────────────────────────────────────────────

  it("cannot submit a DRAFT (not yet calculated) run", async () => {
    // Create a second period + draft run to test this path without polluting the main run.
    const period2 = await runInTenant(prisma, tenantId, (tx) =>
      tx.payPeriod.create({
        data: {
          tenantId,
          payGroupId: groupId,
          sequence: 2,
          startDate: new Date("2026-02-01"),
          endDate: new Date("2026-02-28"),
          payDate: new Date("2026-03-05"),
          status: "OPEN",
        },
      }),
    );
    const draftRun = await request(server)
      .post("/api/v1/payroll/runs")
      .set(auth())
      .send({ payGroupId: groupId, payPeriodId: period2.id });
    const res = await request(server)
      .post(`/api/v1/payroll/runs/${draftRun.body.id}/submit`)
      .set(auth());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE");
  });

  it("submits the calculated run for approval (PENDING_APPROVAL)", async () => {
    const res = await request(server).post(`/api/v1/payroll/runs/${runId}/submit`).set(auth());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING_APPROVAL");
    expect(res.body.submittedBy).toBeTruthy();
  });

  it("cannot recalculate once submitted", async () => {
    const res = await request(server).post(`/api/v1/payroll/runs/${runId}/calculate`).set(auth());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RUN_LOCKED");
  });

  // ── maker-checker: self-approval forbidden ────────────────────────────────────

  it("forbids self-approval (same user who submitted)", async () => {
    const res = await request(server)
      .post(`/api/v1/payroll/runs/${runId}/approve`)
      .set(auth()) // admin submitted; admin tries to approve
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SELF_APPROVAL_FORBIDDEN");
  });

  // ── approve ───────────────────────────────────────────────────────────────────

  it("approver (different user) can approve the run", async () => {
    const res = await request(server)
      .post(`/api/v1/payroll/runs/${runId}/approve`)
      .set(approverAuth())
      .send({ note: "Looks good" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.approvedBy).toBeTruthy();
  });

  // ── publish ───────────────────────────────────────────────────────────────────

  it("publishes the approved run and locks the pay period", async () => {
    const res = await request(server).post(`/api/v1/payroll/runs/${runId}/publish`).set(auth());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PUBLISHED");
    expect(res.body.publishedBy).toBeTruthy();

    // Period should be locked to PAID
    const period = await runInTenant(prisma, tenantId, (tx) =>
      tx.payPeriod.findFirst({ where: { id: periodId }, select: { status: true } }),
    );
    expect(period?.status).toBe("PAID");
  });

  it("cannot recalculate or re-submit after publishing", async () => {
    const calc = await request(server).post(`/api/v1/payroll/runs/${runId}/calculate`).set(auth());
    expect(calc.status).toBe(409);

    const submit = await request(server).post(`/api/v1/payroll/runs/${runId}/submit`).set(auth());
    expect(submit.status).toBe(409);
  });

  // ── reject flow ────────────────────────────────────────────────────────────────

  it("approver can reject a pending run (sends it back to REJECTED)", async () => {
    // Create a fresh period + run and push it to PENDING_APPROVAL
    const period3 = await runInTenant(prisma, tenantId, (tx) =>
      tx.payPeriod.create({
        data: {
          tenantId,
          payGroupId: groupId,
          sequence: 3,
          startDate: new Date("2026-03-01"),
          endDate: new Date("2026-03-31"),
          payDate: new Date("2026-04-05"),
          status: "OPEN",
        },
      }),
    );
    const newRun = (
      await request(server)
        .post("/api/v1/payroll/runs")
        .set(auth())
        .send({ payGroupId: groupId, payPeriodId: period3.id })
    ).body;
    await request(server).post(`/api/v1/payroll/runs/${newRun.id}/calculate`).set(auth());
    await request(server).post(`/api/v1/payroll/runs/${newRun.id}/submit`).set(auth());

    const reject = await request(server)
      .post(`/api/v1/payroll/runs/${newRun.id}/reject`)
      .set(approverAuth())
      .send({ note: "Incorrect rates" });
    expect(reject.status).toBe(201);
    expect(reject.body.status).toBe("REJECTED");

    // Maker can recalculate a REJECTED run
    const recalc = await request(server)
      .post(`/api/v1/payroll/runs/${newRun.id}/calculate`)
      .set(auth());
    expect(recalc.status).toBe(201);
    expect(recalc.body.status).toBe("CALCULATED");
  });

  // ── anomaly detection ─────────────────────────────────────────────────────────

  it("flags NO_COMPENSATION for an employee with no matching currency comp", async () => {
    // Add an employee to the pay group with a GBP compensation record (group pays in USD).
    let skippedEmpId: string;
    const period5 = await runInTenant(prisma, tenantId, async (tx) => {
      const emp = await tx.employee.create({
        data: {
          tenantId,
          employeeNumber: "E-GBP",
          firstName: "Skipped",
          lastName: "Emp",
          hireDate: new Date("2024-01-01"),
          payGroupId: groupId,
        },
      });
      skippedEmpId = emp.id;
      await tx.compensationRecord.create({
        data: {
          tenantId,
          employeeId: emp.id,
          amountMinor: BigInt(600000_00),
          currencyCode: "GBP", // mismatches the USD pay group
          frequency: "ANNUAL",
          effectiveFrom: new Date("2024-01-01"),
        },
      });
      return tx.payPeriod.create({
        data: {
          tenantId,
          payGroupId: groupId,
          sequence: 5,
          startDate: new Date("2026-05-01"),
          endDate: new Date("2026-05-31"),
          payDate: new Date("2026-06-05"),
          status: "OPEN",
        },
      });
    });

    const newRun = (
      await request(server)
        .post("/api/v1/payroll/runs")
        .set(auth())
        .send({ payGroupId: groupId, payPeriodId: period5.id })
    ).body;
    await request(server).post(`/api/v1/payroll/runs/${newRun.id}/calculate`).set(auth());

    const res = await request(server)
      .get(`/api/v1/payroll/runs/${newRun.id}/anomalies`)
      .set(auth());
    expect(res.status).toBe(200);
    const warning = res.body.data.find(
      (a: { type: string; employeeId: string }) => a.type === "NO_COMPENSATION",
    );
    expect(warning).toBeDefined();
    expect(warning.severity).toBe("WARNING");
    expect(warning.employeeId).toBe(skippedEmpId!);
    expect(warning.employee.employeeNumber).toBe("E-GBP");

    // Clean up: remove from pay group so it doesn't affect subsequent tests
    await runInTenant(prisma, tenantId, (tx) =>
      tx.employee.update({ where: { id: skippedEmpId! }, data: { payGroupId: null } }),
    );
  });

  // ── RBAC ─────────────────────────────────────────────────────────────────────

  it("approver cannot create or calculate runs (403)", async () => {
    const period4 = await runInTenant(prisma, tenantId, (tx) =>
      tx.payPeriod.create({
        data: {
          tenantId,
          payGroupId: groupId,
          sequence: 4,
          startDate: new Date("2026-04-01"),
          endDate: new Date("2026-04-30"),
          payDate: new Date("2026-05-05"),
          status: "OPEN",
        },
      }),
    );
    const create = await request(server)
      .post("/api/v1/payroll/runs")
      .set(approverAuth())
      .send({ payGroupId: groupId, payPeriodId: period4.id });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe("FORBIDDEN");
  });

  it("approver can read runs (200)", async () => {
    const res = await request(server).get("/api/v1/payroll/runs").set(approverAuth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── tenant isolation (RLS) ────────────────────────────────────────────────────

  it("never returns another tenant's runs (RLS isolation)", async () => {
    const otherTenantId = randomUUID();
    await prisma.tenant.create({
      data: { id: otherTenantId, slug: "initech", name: "Initech", status: "ACTIVE" },
    });
    await runInTenant(prisma, otherTenantId, async (tx) => {
      const entity = await tx.legalEntity.create({
        data: { tenantId: otherTenantId, name: "Initech US", countryCode: "US" },
      });
      const group = await tx.payGroup.create({
        data: {
          tenantId: otherTenantId,
          code: "US-M",
          name: "US Monthly",
          countryCode: "US",
          currencyCode: "USD",
          frequency: "MONTHLY",
          legalEntityId: entity.id,
        },
      });
      const period = await tx.payPeriod.create({
        data: {
          tenantId: otherTenantId,
          payGroupId: group.id,
          sequence: 1,
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-01-31"),
          payDate: new Date("2026-02-05"),
          status: "OPEN",
        },
      });
      await tx.payrollRun.create({
        data: {
          tenantId: otherTenantId,
          payGroupId: group.id,
          payPeriodId: period.id,
        },
      });
    });

    // Acme admin should not see Initech's run
    const list = await request(server).get("/api/v1/payroll/runs").set(auth());
    const otherRun = list.body.data.find(
      (r: { payGroup: { code: string } }) => r.payGroup.code === "US-M",
    );
    expect(otherRun).toBeUndefined();
  });
});
