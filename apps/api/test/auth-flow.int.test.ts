import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createPrismaClient, type PrismaClient, runInTenant } from "@payce/db";
import { hash } from "@node-rs/argon2";
import { authenticator } from "otplib";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { truncateAll } from "./helpers/db";

const PLATFORM_KEY = "dev-platform-admin-key";
const ADMIN = { email: "admin@acme.test", displayName: "Acme Admin", password: "Sup3r-Secret-123" };

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaClient;

beforeAll(async () => {
  prisma = createPrismaClient();
  await truncateAll(prisma);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  await app.init();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("identity & tenancy end-to-end", () => {
  let tenantId: string;
  let accessToken: string;
  let refreshToken: string;

  it("creates a tenant via the platform plane", async () => {
    const res = await request(server)
      .post("/api/v1/tenants")
      .set("x-platform-admin-key", PLATFORM_KEY)
      .send({ name: "Acme", slug: "acme", admin: ADMIN });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe("acme");
    expect(res.body.adminUserId).toBeTruthy();
    tenantId = res.body.id;
  });

  it("rejects tenant creation without the platform key", async () => {
    const res = await request(server)
      .post("/api/v1/tenants")
      .send({ name: "Nope", slug: "nope", admin: ADMIN });
    expect(res.status).toBe(401);
  });

  it("logs in (no MFA yet) and returns tokens", async () => {
    const res = await request(server)
      .post("/api/v1/auth/login")
      .send({ tenantSlug: "acme", email: ADMIN.email, password: ADMIN.password });
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(false);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
    expect(accessToken).toBeTruthy();
  });

  it("rejects login with a wrong password", async () => {
    const res = await request(server)
      .post("/api/v1/auth/login")
      .send({ tenantSlug: "acme", email: ADMIN.email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("serves the profile from role-gated GET /me", async () => {
    const res = await request(server)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(ADMIN.email);
    expect(res.body.roles).toContain("tenant_admin");
    expect(res.body.permissions).toContain("identity.user.invite");
  });

  it("rejects GET /me without a token", async () => {
    expect((await request(server).get("/api/v1/me")).status).toBe(401);
  });

  it("rotates the refresh token", async () => {
    const res = await request(server).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(refreshToken);
    accessToken = res.body.accessToken;
  });

  it("enrolls + activates MFA, then requires it on the next login", async () => {
    const enroll = await request(server)
      .post("/api/v1/auth/mfa/enroll")
      .set("authorization", `Bearer ${accessToken}`);
    expect(enroll.status).toBe(200);
    const secret: string = enroll.body.secret;
    expect(enroll.body.otpauthUrl).toContain("otpauth://totp/");

    const activate = await request(server)
      .post("/api/v1/auth/mfa/activate")
      .set("authorization", `Bearer ${accessToken}`)
      .send({ code: authenticator.generate(secret) });
    expect(activate.status).toBe(200);

    const login = await request(server)
      .post("/api/v1/auth/login")
      .send({ tenantSlug: "acme", email: ADMIN.email, password: ADMIN.password });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBe(true);
    expect(login.body.mfaToken).toBeTruthy();

    const verify = await request(server)
      .post("/api/v1/auth/mfa/verify")
      .send({ mfaToken: login.body.mfaToken, code: authenticator.generate(secret) });
    expect(verify.status).toBe(200);
    expect(verify.body.accessToken).toBeTruthy();
    accessToken = verify.body.accessToken;
  });

  it("invites a user when the caller holds the permission", async () => {
    const res = await request(server)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${accessToken}`)
      .send({ email: "ops@acme.test", displayName: "Ops", roleKeys: ["payroll_operator"] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("INVITED");
  });

  it("blocks an action the caller lacks permission for (server-side RBAC)", async () => {
    const password = "Employee-Pass-123";
    const passwordHash = await hash(password);
    await runInTenant(prisma, tenantId, async (tx) => {
      const role = await tx.role.findFirstOrThrow({ where: { key: "employee" } });
      const user = await tx.user.create({
        data: { tenantId, email: "emp@acme.test", displayName: "Emp", status: "ACTIVE" },
      });
      await tx.credential.create({ data: { tenantId, userId: user.id, passwordHash } });
      await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });
    });

    const login = await request(server)
      .post("/api/v1/auth/login")
      .send({ tenantSlug: "acme", email: "emp@acme.test", password });
    expect(login.status).toBe(200);

    const forbidden = await request(server)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${login.body.accessToken}`)
      .send({ email: "x@acme.test", displayName: "X", roleKeys: ["employee"] });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");
  });

  it("recorded an audit trail for the sensitive mutations", async () => {
    const events = await runInTenant(prisma, tenantId, (tx) =>
      tx.auditEvent.findMany({ orderBy: { createdAt: "asc" } }),
    );
    const actions = events.map((e) => e.action);
    expect(actions).toContain("tenant.created");
    expect(actions).toContain("user.created");
    expect(actions).toContain("auth.login");
    expect(actions).toContain("user.invited");
    // every event is bound to this tenant — no leakage
    expect(events.every((e) => e.tenantId === tenantId)).toBe(true);
  });
});
