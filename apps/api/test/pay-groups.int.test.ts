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
const ADMIN = {
  email: "admin@globex.test",
  displayName: "Globex Admin",
  password: "Sup3r-Secret-123",
};

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;

let tenantId: string;
let adminToken: string;
let legalEntityId: string;
const employeeIds: string[] = [];

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
    .send({ name: "Globex", slug: "globex", admin: ADMIN });
  tenantId = created.body.id;

  const login = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: "globex", email: ADMIN.email, password: ADMIN.password });
  adminToken = login.body.accessToken;

  await runInTenant(prisma, tenantId, async (tx) => {
    const entity = await tx.legalEntity.create({
      data: { tenantId, name: "Globex US", countryCode: "US" },
    });
    legalEntityId = entity.id;
    for (let i = 1; i <= 3; i++) {
      const emp = await tx.employee.create({
        data: {
          tenantId,
          employeeNumber: `E-${i}`,
          firstName: "Emp",
          lastName: `No${i}`,
          hireDate: new Date("2024-01-01"),
        },
      });
      employeeIds.push(emp.id);
    }
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const auth = () => ({ authorization: `Bearer ${adminToken}` });
const newGroup = (over: Record<string, unknown> = {}) => ({
  code: "US-MONTHLY",
  name: "US Monthly",
  countryCode: "US",
  currencyCode: "USD",
  frequency: "MONTHLY",
  legalEntityId,
  calendar: { anchorDate: "2026-01-01", payDateOffsetDays: 5 },
  ...over,
});

describe("pay groups API (Phase 3)", () => {
  let groupId: string;

  it("creates a pay group with its calendar", async () => {
    const res = await request(server)
      .post("/api/v1/payroll/pay-groups")
      .set(auth())
      .send(newGroup());
    expect(res.status).toBe(201);
    expect(res.body.code).toBe("US-MONTHLY");
    expect(res.body.currencyCode).toBe("USD");
    expect(res.body.calendar.payDateOffsetDays).toBe(5);
    expect(res.body._count).toEqual({ periods: 0, members: 0 });
    groupId = res.body.id;
  });

  it("rejects a country with no rule pack", async () => {
    const res = await request(server)
      .post("/api/v1/payroll/pay-groups")
      .set(auth())
      .send(newGroup({ code: "FR-X", countryCode: "FR", currencyCode: "EUR" }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNKNOWN_RULE_PACK");
  });

  it("rejects a currency that does not match the rule pack", async () => {
    const res = await request(server)
      .post("/api/v1/payroll/pay-groups")
      .set(auth())
      .send(newGroup({ code: "US-EUR", currencyCode: "EUR" }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CURRENCY_MISMATCH");
  });

  it("rejects a duplicate code (409)", async () => {
    const res = await request(server)
      .post("/api/v1/payroll/pay-groups")
      .set(auth())
      .send(newGroup());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PAY_GROUP_EXISTS");
  });

  it("generates pay periods from the calendar and is idempotent on re-run", async () => {
    const gen = await request(server)
      .post(`/api/v1/payroll/pay-groups/${groupId}/periods`)
      .set(auth())
      .send({ count: 3 });
    expect(gen.status).toBe(201);
    expect(gen.body).toEqual({ generated: 3, totalPeriods: 3 });

    const list = await request(server)
      .get(`/api/v1/payroll/pay-groups/${groupId}/periods`)
      .set(auth());
    expect(list.body.data).toHaveLength(3);
    const [p1] = list.body.data;
    expect(p1.sequence).toBe(1);
    expect(p1.startDate.slice(0, 10)).toBe("2026-01-01");
    expect(p1.endDate.slice(0, 10)).toBe("2026-01-31");
    expect(p1.payDate.slice(0, 10)).toBe("2026-02-05");
    expect(p1.status).toBe("OPEN");

    // Appending 2 more continues the sequence without duplicating the first 3.
    const more = await request(server)
      .post(`/api/v1/payroll/pay-groups/${groupId}/periods`)
      .set(auth())
      .send({ count: 2 });
    expect(more.body).toEqual({ generated: 2, totalPeriods: 5 });
    const seqs = (
      await request(server).get(`/api/v1/payroll/pay-groups/${groupId}/periods`).set(auth())
    ).body.data.map((p: { sequence: number }) => p.sequence);
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
  });

  it("assigns employees to the pay group", async () => {
    const res = await request(server)
      .post(`/api/v1/payroll/pay-groups/${groupId}/members`)
      .set(auth())
      .send({ employeeIds: employeeIds.slice(0, 2) });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ assigned: 2 });

    const assigned = await runInTenant(prisma, tenantId, (tx) =>
      tx.employee.count({ where: { payGroupId: groupId } }),
    );
    expect(assigned).toBe(2);

    const detail = await request(server).get(`/api/v1/payroll/pay-groups/${groupId}`).set(auth());
    expect(detail.body._count.members).toBe(2);
  });

  it("forbids creating a pay group without the manage permission (RBAC)", async () => {
    const password = "Approver-Pass-123";
    const passwordHash = await hash(password);
    await runInTenant(prisma, tenantId, async (tx) => {
      const role = await tx.role.findFirstOrThrow({ where: { key: "payroll_approver" } });
      const user = await tx.user.create({
        data: {
          tenantId,
          email: "approver@globex.test",
          displayName: "Approver",
          status: "ACTIVE",
        },
      });
      await tx.credential.create({ data: { tenantId, userId: user.id, passwordHash } });
      await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });
    });
    const login = await request(server)
      .post("/api/v1/auth/login")
      .send({ tenantSlug: "globex", email: "approver@globex.test", password });
    const approver = { authorization: `Bearer ${login.body.accessToken}` };

    // Approver has read but not manage: can list, cannot create.
    expect((await request(server).get("/api/v1/payroll/pay-groups").set(approver)).status).toBe(
      200,
    );
    const create = await request(server)
      .post("/api/v1/payroll/pay-groups")
      .set(approver)
      .send(newGroup({ code: "NOPE" }));
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe("FORBIDDEN");
  });

  it("never returns another tenant's pay groups (RLS isolation)", async () => {
    const otherTenant = randomUUID();
    await prisma.tenant.create({
      data: { id: otherTenant, slug: "initech", name: "Initech", status: "ACTIVE" },
    });
    const otherGroup = await runInTenant(prisma, otherTenant, (tx) =>
      tx.payGroup.create({
        data: {
          tenantId: otherTenant,
          code: "OTHER",
          name: "Other Co",
          countryCode: "US",
          currencyCode: "USD",
          frequency: "MONTHLY",
        },
      }),
    );

    const list = await request(server).get("/api/v1/payroll/pay-groups").set(auth());
    expect(list.body.data.some((g: { id: string }) => g.id === otherGroup.id)).toBe(false);

    const get = await request(server)
      .get(`/api/v1/payroll/pay-groups/${otherGroup.id}`)
      .set(auth());
    expect(get.status).toBe(404);
  });
});
