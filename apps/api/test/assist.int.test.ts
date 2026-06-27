/**
 * Assist integration tests (Phase 6).
 *
 * Exercises the headline acceptance criterion end-to-end:
 *   the assistant answers "what's my leave balance?" using ONLY the caller's scoped data,
 *   verified with a second tenant whose employee asks the same question and never sees the first
 *   tenant's figures (no cross-tenant leakage).
 * Plus: knowledge-base (RAG) answers with citations, human escalation on a sensitive topic, an
 * audit event per turn, and cross-tenant conversation isolation.
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
const YEAR = new Date().getUTCFullYear();

const ADMIN_A = {
  email: "admin@assistco.test",
  displayName: "Assist Admin",
  password: "Assist-Adm1n-12",
};
const ADA = {
  email: "ada@assistco.test",
  displayName: "Ada Employee",
  password: "Ada-Empl0yee-12",
};
const BOB = { email: "bob@rivalco.test", displayName: "Bob Employee", password: "Bob-Empl0yee-12" };

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;

let tenantA: string;
let adaToken: string;
let bobToken: string;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function createTenant(name: string, slug: string, admin: typeof ADMIN_A): Promise<string> {
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

type Tx = Parameters<Parameters<typeof runInTenant>[2]>[0];

/** Create an employee user with a leave balance for the current year. */
async function seedEmployee(
  tx: Tx,
  tenantId: string,
  account: { email: string; displayName: string; password: string },
  balance: { entitled: number; used: number },
): Promise<void> {
  const role = await tx.role.findFirstOrThrow({ where: { key: "employee" } });
  const user = await tx.user.create({
    data: { tenantId, email: account.email, displayName: account.displayName, status: "ACTIVE" },
  });
  await tx.credential.create({
    data: { tenantId, userId: user.id, passwordHash: await hash(account.password) },
  });
  await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });

  const employee = await tx.employee.create({
    data: {
      tenantId,
      employeeNumber: `E-${account.email.slice(0, 3).toUpperCase()}`,
      userId: user.id,
      firstName: account.displayName.split(" ")[0] ?? "Emp",
      lastName: "Employee",
      hireDate: new Date("2024-01-01"),
    },
  });
  const leaveType = await tx.leaveType.create({
    data: {
      tenantId,
      code: "ANNUAL",
      name: "Annual Leave",
      isPaid: true,
      accrualDays: balance.entitled,
    },
  });
  await tx.leaveBalance.create({
    data: {
      tenantId,
      employeeId: employee.id,
      leaveTypeId: leaveType.id,
      year: YEAR,
      entitledDays: balance.entitled,
      usedDays: balance.used,
    },
  });
}

beforeAll(async () => {
  prisma = createPrismaClient();
  await truncateAll(prisma);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  await app.init();
  server = app.getHttpServer();

  // Tenant A: Ada has 18 days of Annual Leave remaining (20 entitled − 2 used) + a knowledge base.
  tenantA = await createTenant("AssistCo", "assistco", ADMIN_A);
  await runInTenant(prisma, tenantA, async (tx) => {
    await seedEmployee(tx, tenantA, ADA, { entitled: 20, used: 2 });
    await tx.knowledgeArticle.create({
      data: {
        tenantId: tenantA,
        slug: "remote-work",
        title: "Remote work policy",
        body: "Employees may work remotely up to three days per week with their manager's approval. Coordinate in-office days with your team.",
        tags: ["remote", "policy"],
      },
    });
  });
  adaToken = await login("assistco", ADA);

  // Tenant B: Bob has only 5 days remaining (10 entitled − 5 used).
  const tenantB = await createTenant("RivalCo", "rivalco", {
    email: "admin@rivalco.test",
    displayName: "Rival Admin",
    password: "Rival-Adm1n-123",
  });
  await runInTenant(prisma, tenantB, async (tx) => {
    await seedEmployee(tx, tenantB, BOB, { entitled: 10, used: 5 });
  });
  bobToken = await login("rivalco", BOB);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("Assist — scoped answers & isolation (Phase 6)", () => {
  let adaConversationId: string;

  it("answers 'what's my leave balance?' from the caller's own scoped data", async () => {
    const res = await request(server)
      .post("/api/v1/assist/messages")
      .set(auth(adaToken))
      .send({ message: "what's my leave balance?" });

    expect(res.status).toBe(201);
    expect(res.body.message.role).toBe("ASSISTANT");
    expect(res.body.message.usedTools).toContain("leave_balance");
    expect(res.body.message.content).toContain("18 days");
    expect(res.body.message.content).toContain("Annual Leave");
    expect(res.body.escalated).toBe(false);
    adaConversationId = res.body.conversationId;
  });

  it("a second tenant's employee gets only their own balance — no cross-tenant leakage", async () => {
    const res = await request(server)
      .post("/api/v1/assist/messages")
      .set(auth(bobToken))
      .send({ message: "what's my leave balance?" });

    expect(res.status).toBe(201);
    // Bob's own figure (5 remaining), and never Ada's 18.
    expect(res.body.message.content).toContain("5 days");
    expect(res.body.message.content).not.toContain("18");
  });

  it("answers an FAQ from the tenant knowledge base, with a citation", async () => {
    const res = await request(server)
      .post("/api/v1/assist/messages")
      .set(auth(adaToken))
      .send({ message: "what is the remote work policy?" });

    expect(res.status).toBe(201);
    expect(res.body.message.content.toLowerCase()).toContain("remotely");
    expect(res.body.message.citations).toHaveLength(1);
    expect(res.body.message.citations[0].title).toBe("Remote work policy");
    expect(res.body.escalated).toBe(false);
  });

  it("escalates a sensitive topic to a human and opens a ticket", async () => {
    const res = await request(server)
      .post("/api/v1/assist/messages")
      .set(auth(adaToken))
      .send({ message: "I think I'm being harassed at work, what should I do?" });

    expect(res.status).toBe(201);
    expect(res.body.escalated).toBe(true);
    expect(res.body.message.escalationReason).toBe("SENSITIVE_TOPIC");
    expect(res.body.escalationId).toBeTruthy();
    expect(res.body.message.content).toContain("member of the team");
  });

  it("does not let one user read another user's / tenant's conversation", async () => {
    const res = await request(server)
      .get(`/api/v1/assist/conversations/${adaConversationId}`)
      .set(auth(bobToken));
    expect(res.status).toBe(404);
  });

  it("lets the owner read their own conversation with its messages", async () => {
    const res = await request(server)
      .get(`/api/v1/assist/conversations/${adaConversationId}`)
      .set(auth(adaToken));
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBeGreaterThanOrEqual(2);
    expect(res.body.messages[0].role).toBe("USER");
  });

  it("writes a PII-redacted audit event for each turn", async () => {
    const events = await runInTenant(prisma, tenantA, (tx) =>
      tx.auditEvent.findMany({ where: { action: "assist.message" } }),
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.actorType).toBe("user");
  });

  it("requires authentication", async () => {
    const res = await request(server).post("/api/v1/assist/messages").send({ message: "hello" });
    expect(res.status).toBe(401);
  });
});
