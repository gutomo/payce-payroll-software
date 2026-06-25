import { createPrismaClient, forTenant, type PrismaClient, runInTenant } from "@payce/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { truncateAll } from "./helpers/db";

let prisma: PrismaClient;
const tenantA = randomUUID();
const tenantB = randomUUID();

beforeAll(async () => {
  prisma = createPrismaClient();
  await truncateAll(prisma);

  await prisma.tenant.createMany({
    data: [
      { id: tenantA, slug: "tenant-a", name: "Tenant A", status: "ACTIVE" },
      { id: tenantB, slug: "tenant-b", name: "Tenant B", status: "ACTIVE" },
    ],
  });

  await runInTenant(prisma, tenantA, (tx) =>
    tx.user.create({ data: { tenantId: tenantA, email: "a@a.test", displayName: "A" } }),
  );
  await runInTenant(prisma, tenantB, (tx) =>
    tx.user.create({ data: { tenantId: tenantB, email: "b@b.test", displayName: "B" } }),
  );

  // Phase 2 org tables are RLS-protected too.
  await runInTenant(prisma, tenantA, (tx) =>
    tx.employee.create({
      data: {
        tenantId: tenantA,
        employeeNumber: "E-A1",
        firstName: "Ada",
        lastName: "Alpha",
        hireDate: new Date("2024-01-15"),
      },
    }),
  );
  await runInTenant(prisma, tenantB, (tx) =>
    tx.employee.create({
      data: {
        tenantId: tenantB,
        employeeNumber: "E-B1",
        firstName: "Ben",
        lastName: "Bravo",
        hireDate: new Date("2024-02-20"),
      },
    }),
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("tenant isolation via RLS", () => {
  it("scopes reads to the active tenant", async () => {
    const a = await runInTenant(prisma, tenantA, (tx) => tx.user.findMany());
    const b = await runInTenant(prisma, tenantB, (tx) => tx.user.findMany());
    expect(a.map((u) => u.email)).toEqual(["a@a.test"]);
    expect(b.map((u) => u.email)).toEqual(["b@b.test"]);
  });

  it("blocks reading another tenant's row by id", async () => {
    const aUser = await runInTenant(prisma, tenantA, (tx) => tx.user.findFirstOrThrow());
    const leaked = await runInTenant(prisma, tenantB, (tx) =>
      tx.user.findUnique({ where: { id: aUser.id } }),
    );
    expect(leaked).toBeNull();
  });

  it("returns zero rows when no tenant context is set (fail closed)", async () => {
    expect(await prisma.user.findMany()).toEqual([]);
  });

  it("rejects writing a row whose tenant_id differs from the active context", async () => {
    await expect(
      runInTenant(prisma, tenantA, (tx) =>
        tx.user.create({ data: { tenantId: tenantB, email: "x@x.test", displayName: "X" } }),
      ),
    ).rejects.toThrow();
  });

  it("enforces isolation through the forTenant client too", async () => {
    const scoped = forTenant(prisma, tenantA);
    const users = await scoped.user.findMany();
    expect(users.map((u) => u.email)).toEqual(["a@a.test"]);
  });

  it("scopes Phase 2 employee rows to the active tenant (RLS)", async () => {
    const a = await runInTenant(prisma, tenantA, (tx) => tx.employee.findMany());
    const b = await runInTenant(prisma, tenantB, (tx) => tx.employee.findMany());
    expect(a.map((e) => e.employeeNumber)).toEqual(["E-A1"]);
    expect(b.map((e) => e.employeeNumber)).toEqual(["E-B1"]);
    // fail closed with no tenant context
    expect(await prisma.employee.findMany()).toEqual([]);
  });
});
