/**
 * Insights (reporting) integration tests (Phase 5).
 *
 * Exercises the headline acceptance criterion end-to-end: build a custom headcount-by-department
 * report with no code, run it, export it to XLSX/CSV, and schedule it. Plus authZ (a plain employee
 * has no Insights permission), tenant isolation (RLS), and a prebuilt dashboard load.
 */
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { createPrismaClient, type PrismaClient, runInTenant } from "@payce/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { truncateAll } from "./helpers/db";

const PLATFORM_KEY = "dev-platform-admin-key";
const ADMIN = {
  email: "insights-admin@acme.test",
  displayName: "Ingrid Admin",
  password: "Insite-Adm1n-123",
};
const EMP = {
  email: "insights-emp@acme.test",
  displayName: "Ed Employee",
  password: "Insite-Emp1-456",
};

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;

let tenantId: string;
let adminToken: string;
let empToken: string;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const HEADCOUNT_SPEC = {
  dataset: "employees",
  dimensions: ["department"],
  measures: ["headcount"],
  sort: { key: "headcount", direction: "desc" as const },
};

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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  await app.init();
  server = app.getHttpServer();

  const created = await request(server)
    .post("/api/v1/tenants")
    .set("x-platform-admin-key", PLATFORM_KEY)
    .send({ name: "InsightsCo", slug: "insightsco", admin: ADMIN });
  tenantId = created.body.id;
  adminToken = await login("insightsco", ADMIN);

  // Synthetic workforce: 2 in Engineering, 1 in Sales, each with an open compensation record.
  await runInTenant(prisma, tenantId, async (tx) => {
    await makeUser(tx, "employee", EMP);

    const eng = await tx.department.create({ data: { tenantId, name: "Engineering" } });
    const sales = await tx.department.create({ data: { tenantId, name: "Sales" } });

    const roster: Array<[string, string, number]> = [
      ["ENG-1", eng.id, 120_000_00],
      ["ENG-2", eng.id, 100_000_00],
      ["SAL-1", sales.id, 90_000_00],
    ];
    let i = 0;
    for (const [number, departmentId, annualMinor] of roster) {
      i += 1;
      const emp = await tx.employee.create({
        data: {
          tenantId,
          employeeNumber: number,
          firstName: `First${i}`,
          lastName: `Last${i}`,
          hireDate: new Date("2024-01-01"),
          departmentId,
        },
      });
      await tx.compensationRecord.create({
        data: {
          tenantId,
          employeeId: emp.id,
          amountMinor: BigInt(annualMinor),
          currencyCode: "USD",
          frequency: "ANNUAL",
          effectiveFrom: new Date("2024-01-01"),
        },
      });
    }
  });

  empToken = await login("insightsco", EMP);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("Insights reporting (Phase 5)", () => {
  let reportId: string;

  it("exposes the dataset catalog without leaking SQL", async () => {
    const res = await request(server).get("/api/v1/insights/datasets").set(auth(adminToken));
    expect(res.status).toBe(200);
    const employees = res.body.data.find((d: { key: string }) => d.key === "employees");
    expect(employees).toBeTruthy();
    expect(employees.dimensions.map((x: { key: string }) => x.key)).toContain("department");
    expect(employees.measures.map((x: { key: string }) => x.key)).toContain("headcount");
    // The allow-listed SQL fragments must never reach a client.
    expect(JSON.stringify(res.body)).not.toContain("COUNT(");
  });

  it("runs an ad-hoc headcount-by-department report (no code)", async () => {
    const res = await request(server)
      .post("/api/v1/insights/reports/run")
      .set(auth(adminToken))
      .send(HEADCOUNT_SPEC);
    expect(res.status).toBe(201);
    expect(res.body.rows).toEqual([
      { department: "Engineering", headcount: 2 },
      { department: "Sales", headcount: 1 },
    ]);
  });

  it("rejects an unknown field with a 400, not a 500 (catalog validation)", async () => {
    const res = await request(server)
      .post("/api/v1/insights/reports/run")
      .set(auth(adminToken))
      .send({ dataset: "employees", dimensions: ["nonsense"], measures: ["headcount"] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNKNOWN_DIMENSION");
  });

  it("denies a plain employee (no Insights permission, server-side authZ)", async () => {
    const run = await request(server)
      .post("/api/v1/insights/reports/run")
      .set(auth(empToken))
      .send(HEADCOUNT_SPEC);
    expect(run.status).toBe(403);

    const create = await request(server)
      .post("/api/v1/insights/reports")
      .set(auth(empToken))
      .send({ name: "sneaky", spec: HEADCOUNT_SPEC });
    expect(create.status).toBe(403);
  });

  it("saves a no-code report and enforces unique names", async () => {
    const res = await request(server).post("/api/v1/insights/reports").set(auth(adminToken)).send({
      name: "Headcount by department",
      description: "Active employees grouped by department.",
      spec: HEADCOUNT_SPEC,
    });
    expect(res.status).toBe(201);
    expect(res.body.dataset).toBe("employees");
    reportId = res.body.id;

    const dupe = await request(server)
      .post("/api/v1/insights/reports")
      .set(auth(adminToken))
      .send({ name: "Headcount by department", spec: HEADCOUNT_SPEC });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.code).toBe("REPORT_EXISTS");
  });

  it("runs the saved report", async () => {
    const res = await request(server)
      .post(`/api/v1/insights/reports/${reportId}/run`)
      .set(auth(adminToken));
    expect(res.status).toBe(201);
    expect(res.body.rows[0]).toEqual({ department: "Engineering", headcount: 2 });
  });

  it("exports the saved report to XLSX (a real ZIP/OOXML workbook) and audits the egress", async () => {
    const res = await request(server)
      .get(`/api/v1/insights/reports/${reportId}/export?format=xlsx`)
      .set(auth(adminToken))
      .responseType("blob");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers["content-disposition"]).toContain("headcount-by-department.xlsx");
    // ZIP local-file-header magic "PK\x03\x04".
    expect(Array.from(res.body.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const exports = await runInTenant(prisma, tenantId, (tx) =>
      tx.auditEvent.findMany({ where: { action: "report.exported" } }),
    );
    expect(exports).toHaveLength(1);
  });

  it("exports the saved report to CSV", async () => {
    const res = await request(server)
      .get(`/api/v1/insights/reports/${reportId}/export?format=csv`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Department,Headcount");
    expect(res.text).toContain("Engineering,2");
  });

  it("schedules the report and computes a future next-run", async () => {
    const before = Date.now();
    const res = await request(server)
      .post(`/api/v1/insights/reports/${reportId}/schedules`)
      .set(auth(adminToken))
      .send({
        cadence: "WEEKLY",
        format: "XLSX",
        hourUtc: 6,
        recipients: ["people-ops@demo.test"],
      });
    expect(res.status).toBe(201);
    expect(res.body.isActive).toBe(true);
    expect(res.body.recipients).toEqual(["people-ops@demo.test"]);
    expect(new Date(res.body.nextRunAt).getTime()).toBeGreaterThan(before);

    const scheduleId = res.body.id;
    const list = await request(server)
      .get(`/api/v1/insights/schedules?reportId=${reportId}`)
      .set(auth(adminToken));
    expect(list.body.data).toHaveLength(1);

    const paused = await request(server)
      .patch(`/api/v1/insights/schedules/${scheduleId}`)
      .set(auth(adminToken))
      .send({ isActive: false });
    expect(paused.body.isActive).toBe(false);
  });

  it("rejects a schedule with a non-email recipient (no PII, validated)", async () => {
    const res = await request(server)
      .post(`/api/v1/insights/reports/${reportId}/schedules`)
      .set(auth(adminToken))
      .send({ cadence: "DAILY", recipients: ["not-an-email"] });
    expect(res.status).toBe(400);
  });

  it("loads a prebuilt dashboard with data", async () => {
    const list = await request(server)
      .get("/api/v1/insights/dashboards/prebuilt")
      .set(auth(adminToken));
    expect(list.body.data.map((d: { key: string }) => d.key)).toContain("headcount-by-department");

    const res = await request(server)
      .get("/api/v1/insights/dashboards/prebuilt/headcount-by-department")
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.chart).toBe("bar");
    expect(res.body.result.rows[0]).toEqual({ department: "Engineering", headcount: 2 });
  });

  it("isolates reports across tenants (RLS)", async () => {
    await request(server)
      .post("/api/v1/tenants")
      .set("x-platform-admin-key", PLATFORM_KEY)
      .send({
        name: "OtherInsights",
        slug: "other-insights",
        admin: {
          email: "admin@other-insights.test",
          displayName: "Other Admin",
          password: "Other-Pass-123",
        },
      });
    const otherToken = await login("other-insights", {
      email: "admin@other-insights.test",
      password: "Other-Pass-123",
    });

    const list = await request(server).get("/api/v1/insights/reports").set(auth(otherToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);

    const byId = await request(server)
      .get(`/api/v1/insights/reports/${reportId}`)
      .set(auth(otherToken));
    expect(byId.status).toBe(404);

    // The other tenant's dashboard query sees its own (empty) workforce, never InsightsCo's.
    const dash = await request(server)
      .get("/api/v1/insights/dashboards/prebuilt/headcount-by-department")
      .set(auth(otherToken));
    expect(dash.status).toBe(200);
    expect(dash.body.result.rows).toHaveLength(0);
  });
});
