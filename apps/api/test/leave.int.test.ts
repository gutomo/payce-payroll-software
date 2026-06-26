/**
 * Leave management integration tests (Phase 4).
 *
 * Exercises the headline acceptance criterion end-to-end:
 *   employee applies leave → manager approves → balance updates → appears as a payroll input.
 * Plus authZ (an employee cannot approve their own request) and tenant isolation.
 */
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { createPrismaClient, type PrismaClient, runInTenant } from "@payce/db";
import { periodsPerYear, roundToMinor } from "@payce/payroll-core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { truncateAll } from "./helpers/db";

const PLATFORM_KEY = "dev-platform-admin-key";
const ADMIN = {
  email: "leave-admin@acme.test",
  displayName: "Leave Admin",
  password: "Leave-Adm1n-123",
};
const EMP = {
  email: "leave-emp@acme.test",
  displayName: "Leah Employee",
  password: "Leave-Emp1-456",
};

// $120,000.00 / year in minor units (cents); monthly gross = $10,000.00.
const ANNUAL_MINOR = 120_000_00;
const LEAVE_YEAR = 2026;

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;

let tenantId: string;
let adminToken: string;
let empToken: string;
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

async function login(account: { email: string; password: string }): Promise<string> {
  const res = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: "leaveco", email: account.email, password: account.password });
  return res.body.accessToken as string;
}

beforeAll(async () => {
  prisma = createPrismaClient();
  await truncateAll(prisma);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  await app.init();
  server = app.getHttpServer();

  const created = await request(server)
    .post("/api/v1/tenants")
    .set("x-platform-admin-key", PLATFORM_KEY)
    .send({ name: "LeaveCo", slug: "leaveco", admin: ADMIN });
  tenantId = created.body.id;
  adminToken = await login(ADMIN);

  await runInTenant(prisma, tenantId, async (tx) => {
    const empUserId = await makeUser(tx, "employee", EMP);

    const entity = await tx.legalEntity.create({
      data: { tenantId, name: "LeaveCo US", countryCode: "US" },
    });
    const group = await tx.payGroup.create({
      data: {
        tenantId,
        code: "LV-US-M",
        name: "LeaveCo US Monthly",
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
        employeeNumber: "LV-1",
        userId: empUserId,
        firstName: "Leah",
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
        amountMinor: BigInt(ANNUAL_MINOR),
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

  empToken = await login(EMP);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("leave lifecycle → payroll input (Phase 4)", () => {
  let unpaidTypeId: string;
  let requestId: string;

  it("HR configures an unpaid leave type and initialises the employee's balance", async () => {
    const type = await request(server)
      .post("/api/v1/leave/types")
      .set(auth(adminToken))
      .send({ code: "UNPAID", name: "Unpaid Leave", isPaid: false, accrualDays: 30 });
    expect(type.status).toBe(201);
    unpaidTypeId = type.body.id;

    const balance = await request(server)
      .post("/api/v1/leave/balances")
      .set(auth(adminToken))
      .send({ employeeId, leaveTypeId: unpaidTypeId, year: LEAVE_YEAR, entitledDays: 30 });
    expect(balance.status).toBe(201);
    expect(balance.body.entitledDays).toBe(30);
  });

  it("employee applies for 2 working days; the balance reserves them as pending", async () => {
    const res = await request(server)
      .post("/api/v1/leave/requests")
      .set(auth(empToken))
      .send({ leaveTypeId: unpaidTypeId, startDate: "2026-01-05", endDate: "2026-01-06" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.days).toBe(2);
    requestId = res.body.id;

    const balances = await request(server).get("/api/v1/leave/balances/me").set(auth(empToken));
    const balance = balances.body.data.find(
      (b: { leaveTypeId: string }) => b.leaveTypeId === unpaidTypeId,
    );
    expect(balance.pendingDays).toBe(2);
    expect(balance.usedDays).toBe(0);
  });

  it("an employee cannot approve a leave request (authZ, server-side)", async () => {
    const res = await request(server)
      .post(`/api/v1/leave/requests/${requestId}/approve`)
      .set(auth(empToken))
      .send({});
    expect(res.status).toBe(403);
  });

  it("manager approves; the balance moves pending → used", async () => {
    const res = await request(server)
      .post(`/api/v1/leave/requests/${requestId}/approve`)
      .set(auth(adminToken))
      .send({ note: "Approved" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.reviewedBy).toBeTruthy();

    const balances = await request(server).get("/api/v1/leave/balances/me").set(auth(empToken));
    const balance = balances.body.data.find(
      (b: { leaveTypeId: string }) => b.leaveTypeId === unpaidTypeId,
    );
    expect(balance.pendingDays).toBe(0);
    expect(balance.usedDays).toBe(2);
  });

  it("approved unpaid leave shows up as a deduction line in the payroll run", async () => {
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
    expect(line).toBeTruthy();

    // Expected dock: monthly gross prorated over the standard working-day basis (260 / 12) × 2 days.
    const periodGross = roundToMinor((ANNUAL_MINOR * periodsPerYear("ANNUAL")) / 12);
    const expectedDock = roundToMinor((periodGross * 2) / (260 / 12));
    const unpaid = line.lines.find((e: { code: string }) => e.code === "unpaid_leave");
    expect(unpaid).toBeTruthy();
    expect(unpaid.type).toBe("DEDUCTION");
    expect(unpaid.amountMinor).toBe(expectedDock);

    // Net reflects the dock: it is strictly less than gross, and the accounting balances.
    expect(line.deductionsMinor).toBeGreaterThanOrEqual(expectedDock);
    expect(line.netMinor).toBe(line.grossMinor - line.deductionsMinor);
  });

  it("rejects an application that exceeds the available balance", async () => {
    const res = await request(server)
      .post("/api/v1/leave/requests")
      .set(auth(empToken))
      // 30-day entitlement, 2 used → applying for a whole working month (>28 days) overdraws it.
      .send({ leaveTypeId: unpaidTypeId, startDate: "2026-03-02", endDate: "2026-04-30" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_BALANCE");
  });

  it("isolates leave requests across tenants (RLS)", async () => {
    await request(server)
      .post("/api/v1/tenants")
      .set("x-platform-admin-key", PLATFORM_KEY)
      .send({
        name: "OtherLeave",
        slug: "other-leave",
        admin: {
          email: "admin@other-leave.test",
          displayName: "Other",
          password: "Other-Pass-123",
        },
      });
    const otherToken = await (async () => {
      const res = await request(server).post("/api/v1/auth/login").send({
        tenantSlug: "other-leave",
        email: "admin@other-leave.test",
        password: "Other-Pass-123",
      });
      return res.body.accessToken as string;
    })();

    const list = await request(server).get("/api/v1/leave/requests").set(auth(otherToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);

    const byId = await request(server)
      .get(`/api/v1/leave/requests/${requestId}`)
      .set(auth(otherToken));
    expect(byId.status).toBe(404);
  });
});
