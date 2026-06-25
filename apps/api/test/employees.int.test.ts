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
let adminUserId: string;
let adminToken: string;
let deptId: string;

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
  adminUserId = created.body.adminUserId;

  const login = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: "globex", email: ADMIN.email, password: ADMIN.password });
  adminToken = login.body.accessToken;

  // One manager (linked to the admin user, for the self-profile test) + 29 reports = 30 employees.
  await runInTenant(prisma, tenantId, async (tx) => {
    const dept = await tx.department.create({ data: { tenantId, name: "Engineering" } });
    deptId = dept.id;
    const manager = await tx.employee.create({
      data: {
        tenantId,
        employeeNumber: "E-0001",
        userId: adminUserId,
        firstName: "Mona",
        lastName: "Manager",
        departmentId: deptId,
        hireDate: new Date("2020-01-01"),
      },
    });
    for (let i = 2; i <= 30; i++) {
      await tx.employee.create({
        data: {
          tenantId,
          employeeNumber: `E-${String(i).padStart(4, "0")}`,
          firstName: "Emp",
          lastName: `No${i}`,
          departmentId: deptId,
          managerId: manager.id,
          hireDate: new Date("2022-06-01"),
        },
      });
    }
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("employees API (Phase 2)", () => {
  const auth = () => ({ authorization: `Bearer ${adminToken}` });

  it("lists employees with cursor pagination", async () => {
    const p1 = await request(server).get("/api/v1/employees").set(auth());
    expect(p1.status).toBe(200);
    expect(p1.body.data).toHaveLength(25);
    expect(p1.body.nextCursor).toBeTruthy();

    const p2 = await request(server)
      .get(`/api/v1/employees?cursor=${p1.body.nextCursor}`)
      .set(auth());
    expect(p2.status).toBe(200);
    expect(p2.body.data).toHaveLength(5);
    expect(p2.body.nextCursor).toBeNull();

    const ids = new Set([...p1.body.data, ...p2.body.data].map((e: { id: string }) => e.id));
    expect(ids.size).toBe(30);
  });

  it("filters by department", async () => {
    const res = await request(server)
      .get(`/api/v1/employees?departmentId=${deptId}&limit=100`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(30);
    expect(
      res.body.data.every((e: { department: { id: string } }) => e.department.id === deptId),
    ).toBe(true);
  });

  it("returns a single employee with manager detail", async () => {
    const list = await request(server).get("/api/v1/employees?limit=100").set(auth());
    const report = list.body.data.find(
      (e: { employeeNumber: string }) => e.employeeNumber === "E-0002",
    );
    const res = await request(server).get(`/api/v1/employees/${report.id}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.employeeNumber).toBe("E-0002");
    expect(res.body.manager.employeeNumber).toBe("E-0001");
  });

  it("404s for an unknown employee id", async () => {
    const res = await request(server).get(`/api/v1/employees/${randomUUID()}`).set(auth());
    expect(res.status).toBe(404);
  });

  it("renders the reporting org tree", async () => {
    const res = await request(server).get("/api/v1/org/tree").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].employeeNumber).toBe("E-0001");
    expect(res.body[0].reports).toHaveLength(29);
  });

  it("serves the caller's own profile at GET /me/employee", async () => {
    const res = await request(server).get("/api/v1/me/employee").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.employeeNumber).toBe("E-0001");
  });

  it("blocks the employees list for a principal lacking org.employee.read (RBAC)", async () => {
    const password = "Drone-Pass-123";
    const passwordHash = await hash(password);
    await runInTenant(prisma, tenantId, async (tx) => {
      const role = await tx.role.findFirstOrThrow({ where: { key: "employee" } });
      const user = await tx.user.create({
        data: { tenantId, email: "drone@globex.test", displayName: "Drone", status: "ACTIVE" },
      });
      await tx.credential.create({ data: { tenantId, userId: user.id, passwordHash } });
      await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });
    });

    const login = await request(server)
      .post("/api/v1/auth/login")
      .send({ tenantSlug: "globex", email: "drone@globex.test", password });
    const res = await request(server)
      .get("/api/v1/employees")
      .set("authorization", `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("never returns another tenant's employees (RLS isolation)", async () => {
    const otherTenant = randomUUID();
    await prisma.tenant.create({
      data: { id: otherTenant, slug: "initech", name: "Initech", status: "ACTIVE" },
    });
    const otherEmp = await runInTenant(prisma, otherTenant, (tx) =>
      tx.employee.create({
        data: {
          tenantId: otherTenant,
          employeeNumber: "X-1",
          firstName: "Other",
          lastName: "Co",
          hireDate: new Date("2024-01-01"),
        },
      }),
    );

    const list = await request(server).get("/api/v1/employees?limit=100").set(auth());
    expect(list.body.data.some((e: { id: string }) => e.id === otherEmp.id)).toBe(false);

    const get = await request(server).get(`/api/v1/employees/${otherEmp.id}`).set(auth());
    expect(get.status).toBe(404);
  });
});
