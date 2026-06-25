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
  email: "admin@import.test",
  displayName: "Import Admin",
  password: "Sup3r-Secret-123",
};
const HEADER =
  "employeeNumber,firstName,lastName,hireDate,employmentType,jobTitle,workEmail,departmentName,locationName,managerEmployeeNumber";

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;
let tenantId: string;
let adminToken: string;

const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join("\n"));
const countWithPrefix = (prefix: string) =>
  runInTenant(prisma, tenantId, (tx) =>
    tx.employee.count({ where: { employeeNumber: { startsWith: prefix } } }),
  );

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
    .send({ name: "ImportCo", slug: "importco", admin: ADMIN });
  tenantId = created.body.id;

  const login = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: "importco", email: ADMIN.email, password: ADMIN.password });
  adminToken = login.body.accessToken;

  // Reference data the CSV rows point at by name.
  await runInTenant(prisma, tenantId, async (tx) => {
    await tx.department.create({ data: { tenantId, name: "Engineering" } });
    await tx.location.create({ data: { tenantId, name: "HQ", countryCode: "US" } });
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("employee bulk import (Phase 2)", () => {
  const auth = () => ({ authorization: `Bearer ${adminToken}` });

  it("dry-run surfaces per-row validation errors and writes nothing", async () => {
    const file = csv(
      "D-001,Ann,Lee,2023-01-02,FULL_TIME,Engineer,ann@x.test,Engineering,HQ,",
      "D-002,,Lee,2023-01-02,FULL_TIME,Engineer,,,,", // missing firstName
      "D-003,Bob,Kim,2023-01-02,WIZARD,Engineer,,,,", // bad employmentType
      "D-001,Dup,Again,2023-01-02,FULL_TIME,Engineer,,,,", // duplicate employeeNumber in file
      "D-004,Cara,Ng,2023-01-02,FULL_TIME,Engineer,,Marketing,,", // unknown department
      "D-005,Dan,Oh,01/02/2023,FULL_TIME,Engineer,,,,", // bad hireDate
    );
    const res = await request(server)
      .post("/api/v1/employees/import")
      .set(auth())
      .attach("file", file, "employees.csv");

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(6);
    expect(res.body.valid).toBe(1);
    expect(res.body.imported).toBe(0);
    const cols = res.body.errors.map((e: { column: string }) => e.column);
    expect(cols).toEqual(
      expect.arrayContaining([
        "firstName",
        "employmentType",
        "employeeNumber",
        "departmentName",
        "hireDate",
      ]),
    );
    expect(await countWithPrefix("D-")).toBe(0);
  });

  it("commit imports the valid rows and skips invalid ones", async () => {
    const file = csv(
      "E2-0001,Ada,Stone,2021-05-01,FULL_TIME,Engineer,,Engineering,HQ,",
      "E2-0002,Ben,Park,2021-06-01,PART_TIME,Analyst,,,,",
      "E2-0003,Cal,Reed,bad-date,FULL_TIME,Engineer,,,,", // invalid -> skipped
    );
    const res = await request(server)
      .post("/api/v1/employees/import?commit=true")
      .set(auth())
      .attach("file", file, "employees.csv");

    expect(res.status).toBe(201);
    expect(res.body.valid).toBe(2);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors).toHaveLength(1);
    expect(await countWithPrefix("E2-")).toBe(2);
  });

  it("links managers referenced within the same file", async () => {
    const file = csv(
      "M-001,Boss,One,2019-01-01,FULL_TIME,Director,,,,",
      "M-002,Report,Two,2022-01-01,FULL_TIME,Engineer,,,,M-001",
    );
    const res = await request(server)
      .post("/api/v1/employees/import?commit=true")
      .set(auth())
      .attach("file", file, "employees.csv");
    expect(res.body.imported).toBe(2);

    const report = await runInTenant(prisma, tenantId, (tx) =>
      tx.employee.findFirst({
        where: { employeeNumber: "M-002" },
        select: { manager: { select: { employeeNumber: true } } },
      }),
    );
    expect(report?.manager?.employeeNumber).toBe("M-001");
  });

  it("imports 1,000 employees in one upload (AC scale)", async () => {
    const rows: string[] = [];
    for (let i = 1; i <= 1000; i++) {
      rows.push(
        `BULK-${String(i).padStart(5, "0")},First${i},Last${i},2022-03-15,FULL_TIME,Staff,,,,`,
      );
    }
    const res = await request(server)
      .post("/api/v1/employees/import?commit=true")
      .set(auth())
      .attach("file", csv(...rows), "bulk.csv");

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(1000);
    expect(res.body.imported).toBe(1000);
    expect(res.body.errors).toHaveLength(0);
    expect(await countWithPrefix("BULK-")).toBe(1000);
  });

  it("blocks import for a principal lacking org.employee.manage (RBAC)", async () => {
    // payroll_operator has org.employee.read but NOT org.employee.manage.
    const password = "Operator-Pass-123";
    const passwordHash = await hash(password);
    await runInTenant(prisma, tenantId, async (tx) => {
      const role = await tx.role.findFirstOrThrow({ where: { key: "payroll_operator" } });
      const user = await tx.user.create({
        data: { tenantId, email: "operator@import.test", displayName: "Op", status: "ACTIVE" },
      });
      await tx.credential.create({ data: { tenantId, userId: user.id, passwordHash } });
      await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });
    });
    const login = await request(server)
      .post("/api/v1/auth/login")
      .send({ tenantSlug: "importco", email: "operator@import.test", password });

    const res = await request(server)
      .post("/api/v1/employees/import?commit=true")
      .set("authorization", `Bearer ${login.body.accessToken}`)
      .attach("file", csv("Z-1,No,Go,2023-01-01,FULL_TIME,Staff,,,,"), "x.csv");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
