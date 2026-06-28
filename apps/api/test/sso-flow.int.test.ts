import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createPrismaClient, type PrismaClient, runInTenant } from "@payce/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { truncateAll } from "./helpers/db";

const PLATFORM_KEY = "dev-platform-admin-key";
const ADMIN = { email: "admin@acme.test", displayName: "Acme Admin", password: "Sup3r-Secret-123" };
const REDIRECT = "http://localhost:3000/login/sso/callback";

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

/** Drive the offline-IdP SSO flow end to end and return the callback response. */
async function ssoLogin(email: string, opts: { tamperState?: boolean } = {}) {
  const start = await request(server)
    .post("/api/v1/auth/sso/start")
    .send({ tenantSlug: "acme", email, redirectUri: REDIRECT });
  expect(start.status).toBe(200);
  const url = new URL(start.body.authorizationUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  return request(server)
    .post("/api/v1/auth/sso/callback")
    .send({
      tenantSlug: "acme",
      providerId: start.body.providerId,
      code,
      state,
      expectedState: opts.tamperState ? "not-the-state" : state,
      nonce: start.body.nonce,
      codeVerifier: start.body.codeVerifier,
      redirectUri: REDIRECT,
    });
}

describe("enterprise SSO login (offline test IdP)", () => {
  let tenantId: string;
  let adminToken: string;
  let providerId: string;

  it("sets up a tenant and an OFFLINE identity provider", async () => {
    const tenant = await request(server)
      .post("/api/v1/tenants")
      .set("x-platform-admin-key", PLATFORM_KEY)
      .send({ name: "Acme", slug: "acme", admin: ADMIN });
    expect(tenant.status).toBe(201);
    tenantId = tenant.body.id;

    const login = await request(server)
      .post("/api/v1/auth/login")
      .send({ tenantSlug: "acme", email: ADMIN.email, password: ADMIN.password });
    adminToken = login.body.accessToken;

    const created = await request(server)
      .post("/api/v1/auth/sso/providers")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        name: "Acme SSO",
        kind: "OFFLINE",
        allowJitProvisioning: true,
        defaultRoleKey: "employee",
        emailDomain: "acme.test",
      });
    expect(created.status).toBe(201);
    expect(created.body.kind).toBe("OFFLINE");
    providerId = created.body.id;
  });

  it("requires identity.sso.manage to configure providers (server-side RBAC)", async () => {
    // Sign a fresh employee in via SSO, then try to manage providers with their token.
    const emp = await ssoLogin("rbac-check@acme.test");
    const forbidden = await request(server)
      .post("/api/v1/auth/sso/providers")
      .set("authorization", `Bearer ${emp.body.accessToken}`)
      .send({ name: "Nope", kind: "OFFLINE" });
    expect(forbidden.status).toBe(403);
  });

  it("just-in-time provisions a first-time SSO user and issues a session", async () => {
    const res = await ssoLogin("sso-user@acme.test");
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();

    const me = await request(server)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("sso-user@acme.test");
    expect(me.body.roles).toContain("employee");
    expect(me.body.status).toBe("ACTIVE");
  });

  it("links the same federated subject to one user on repeat logins (no duplicate)", async () => {
    const again = await ssoLogin("sso-user@acme.test");
    expect(again.status).toBe(200);

    const links = await runInTenant(prisma, tenantId, (tx) =>
      tx.userIdentity.findMany({ where: { subject: "offline:sso-user@acme.test" } }),
    );
    expect(links).toHaveLength(1);
  });

  it("links and activates a pre-existing INVITED user on first SSO login", async () => {
    const invite = await request(server)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ email: "invited@acme.test", displayName: "Invited", roleKeys: ["employee"] });
    expect(invite.status).toBe(201);
    expect(invite.body.status).toBe("INVITED");

    const res = await ssoLogin("invited@acme.test");
    expect(res.status).toBe(200);

    const me = await request(server)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${res.body.accessToken}`);
    expect(me.body.email).toBe("invited@acme.test");
    expect(me.body.status).toBe("ACTIVE");
  });

  it("rejects an email outside the provider's allowed domain", async () => {
    const res = await ssoLogin("outsider@other.test");
    expect(res.status).toBe(401);
  });

  it("rejects a CSRF state mismatch on the callback", async () => {
    const res = await ssoLogin("csrf@acme.test", { tamperState: true });
    expect(res.status).toBe(401);
  });

  it("lists the configured provider for an admin", async () => {
    const res = await request(server)
      .get("/api/v1/auth/sso/providers")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { id: string }) => p.id)).toContain(providerId);
  });

  it("recorded tenant-scoped SSO audit events; no leakage", async () => {
    const events = await runInTenant(prisma, tenantId, (tx) =>
      tx.auditEvent.findMany({ where: { action: "auth.sso.login" } }),
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.every((e) => e.tenantId === tenantId)).toBe(true);
  });
});
