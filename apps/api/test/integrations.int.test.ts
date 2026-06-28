/**
 * Integrations framework integration tests (Phase 7).
 *
 * Exercises the framework end-to-end:
 *   configure the mock HCM connector → trigger an idempotent inbound sync that imports synthetic
 *   employees through the existing import pipeline → re-triggering with the same key does NOT
 *   re-import → a registered webhook receives signed deliveries for the events.
 * Plus authZ (an employee can't manage integrations) and tenant isolation.
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
const ADMIN = { email: "admin@intco.test", displayName: "Int Admin", password: "Int-Adm1n-123" };
const EMP = { email: "emp@intco.test", displayName: "Emma Employee", password: "Emp-Empl0yee-12" };

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;

let tenantA: string;
let adminToken: string;
let empToken: string;
let otherToken: string;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function createTenant(name: string, slug: string, admin: typeof ADMIN): Promise<string> {
  const res = await request(server)
    .post("/api/v1/tenants")
    .set("x-platform-admin-key", PLATFORM_KEY)
    .send({ name, slug, admin });
  return res.body.id as string;
}

async function login(slug: string, account: { email: string; password: string }): Promise<string> {
  const res = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: slug, email: account.email, password: account.password });
  return res.body.accessToken as string;
}

function countEmployees(tenantId: string): Promise<number> {
  return runInTenant(prisma, tenantId, (tx) => tx.employee.count());
}

beforeAll(async () => {
  prisma = createPrismaClient();
  await truncateAll(prisma);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  await app.init();
  server = app.getHttpServer();

  tenantA = await createTenant("IntCo", "intco", ADMIN);
  adminToken = await login("intco", ADMIN);

  // An employee account (tenant_admin's segregation: employees can't manage integrations).
  await runInTenant(prisma, tenantA, async (tx) => {
    const role = await tx.role.findFirstOrThrow({ where: { key: "employee" } });
    const user = await tx.user.create({
      data: { tenantId: tenantA, email: EMP.email, displayName: EMP.displayName, status: "ACTIVE" },
    });
    await tx.credential.create({
      data: { tenantId: tenantA, userId: user.id, passwordHash: await hash(EMP.password) },
    });
    await tx.userRole.create({ data: { tenantId: tenantA, userId: user.id, roleId: role.id } });
  });
  empToken = await login("intco", EMP);

  await createTenant("OtherCo", "otherco", {
    email: "admin@otherco.test",
    displayName: "Other Admin",
    password: "Other-Adm1n-12",
  });
  otherToken = await login("otherco", {
    email: "admin@otherco.test",
    password: "Other-Adm1n-12",
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("Integrations framework (Phase 7)", () => {
  let integrationId: string;
  let webhookId: string;
  let webhookSecret: string;
  let firstRunId: string;

  it("lists the connector catalog", async () => {
    const res = await request(server).get("/api/v1/integrations/connectors").set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { key: string }) => c.key)).toContain("mock-hcm");
  });

  it("configures a mock HCM integration", async () => {
    const res = await request(server)
      .post("/api/v1/integrations")
      .set(auth(adminToken))
      .send({ connectorKey: "mock-hcm", name: "HR system", config: { count: 25 } });
    expect(res.status).toBe(201);
    expect(res.body.connectorKey).toBe("mock-hcm");
    integrationId = res.body.id;
  });

  it("rejects an unknown connector", async () => {
    const res = await request(server)
      .post("/api/v1/integrations")
      .set(auth(adminToken))
      .send({ connectorKey: "sap-nonexistent", name: "Nope" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNKNOWN_CONNECTOR");
  });

  it("registers a webhook and returns the signing secret once", async () => {
    const res = await request(server)
      .post("/api/v1/webhooks")
      .set(auth(adminToken))
      .send({
        url: "https://hooks.example.test/payce",
        events: ["integration.run.succeeded", "employee.imported"],
      });
    expect(res.status).toBe(201);
    expect(res.body.secret).toMatch(/^whsec_[0-9a-f]+$/);
    webhookId = res.body.id;
    webhookSecret = res.body.secret;

    // The secret is not exposed on subsequent reads.
    const list = await request(server).get("/api/v1/webhooks").set(auth(adminToken));
    expect(list.body.data[0].secret).toBeUndefined();
  });

  it("triggers a run that imports synthetic employees through the import pipeline", async () => {
    expect(await countEmployees(tenantA)).toBe(0);

    const res = await request(server)
      .post(`/api/v1/integrations/${integrationId}/runs`)
      .set(auth(adminToken))
      .send({ idempotencyKey: "key-1" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SUCCEEDED");
    expect(res.body.direction).toBe("INBOUND");
    expect(res.body.stats.imported).toBe(25);
    expect(res.body.stats.errors).toBe(0);
    firstRunId = res.body.id;

    expect(await countEmployees(tenantA)).toBe(25);
  });

  it("is idempotent: re-triggering with the same key returns the same run and imports nothing new", async () => {
    const res = await request(server)
      .post(`/api/v1/integrations/${integrationId}/runs`)
      .set(auth(adminToken))
      .send({ idempotencyKey: "key-1" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(firstRunId);
    expect(await countEmployees(tenantA)).toBe(25); // unchanged
  });

  it("a new key starts a fresh run with a distinct, non-colliding batch", async () => {
    const res = await request(server)
      .post(`/api/v1/integrations/${integrationId}/runs`)
      .set(auth(adminToken))
      .send({ idempotencyKey: "key-2", count: 10 });

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(firstRunId);
    expect(res.body.stats.imported).toBe(10);
    expect(res.body.stats.errors).toBe(0);
    expect(await countEmployees(tenantA)).toBe(35);
  });

  it("delivers signed webhook events for the run", async () => {
    const res = await request(server)
      .get(`/api/v1/webhooks/${webhookId}/deliveries`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);

    const types = res.body.data.map((d: { eventType: string }) => d.eventType);
    expect(types).toContain("integration.run.succeeded");
    expect(types).toContain("employee.imported");

    for (const delivery of res.body.data) {
      expect(delivery.status).toBe("DELIVERED");
      expect(delivery.signature).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(delivery.payload.type).toBe(delivery.eventType);
    }
    expect(webhookSecret).toMatch(/^whsec_/); // captured at creation, used by receivers to verify
  });

  it("records the runs in history", async () => {
    const res = await request(server)
      .get(`/api/v1/integrations/${integrationId}/runs`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("forbids an employee from managing integrations (authZ)", async () => {
    const create = await request(server)
      .post("/api/v1/integrations")
      .set(auth(empToken))
      .send({ connectorKey: "mock-hcm", name: "nope" });
    expect(create.status).toBe(403);

    const trigger = await request(server)
      .post(`/api/v1/integrations/${integrationId}/runs`)
      .set(auth(empToken))
      .send({});
    expect(trigger.status).toBe(403);
  });

  it("isolates integrations across tenants (RLS)", async () => {
    const list = await request(server).get("/api/v1/integrations").set(auth(otherToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);

    const byId = await request(server)
      .get(`/api/v1/integrations/${integrationId}`)
      .set(auth(otherToken));
    expect(byId.status).toBe(404);
  });
});
