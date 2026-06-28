import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createPrismaClient, type PrismaClient, runInTenant } from "@payce/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { truncateAll } from "./helpers/db";

const PLATFORM_KEY = "dev-platform-admin-key";

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

/** Provision a tenant with an admin, a SAML provider, and an issued SCIM token. */
async function setupTenant(slug: string) {
  const admin = { email: `admin@${slug}.test`, displayName: "Admin", password: "Sup3r-Secret-123" };
  const tenant = await request(server)
    .post("/api/v1/tenants")
    .set("x-platform-admin-key", PLATFORM_KEY)
    .send({ name: slug, slug, admin });
  const login = await request(server)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: slug, email: admin.email, password: admin.password });
  const token = login.body.accessToken;

  const provider = await request(server)
    .post("/api/v1/auth/sso/providers")
    .set("authorization", `Bearer ${token}`)
    .send({
      name: `${slug} SAML`,
      kind: "SAML",
      samlMetadataUrl: `https://idp.${slug}.test/saml/metadata`,
      allowJitProvisioning: true,
      defaultRoleKey: "employee",
    });
  const scim = await request(server)
    .post(`/api/v1/auth/sso/providers/${provider.body.id}/scim-token`)
    .set("authorization", `Bearer ${token}`);

  return {
    adminToken: token,
    tenantId: tenant.body.id,
    providerId: provider.body.id,
    scimToken: scim.body.token,
  };
}

function scimReq(
  method: "post" | "get" | "put" | "patch" | "delete",
  path: string,
  scimToken: string,
) {
  const agent = request(server);
  return agent[method](`/api/v1${path}`)
    .set("authorization", `Bearer ${scimToken}`)
    .set("content-type", "application/json");
}

describe("SCIM provisioning + SAML provider", () => {
  let acme: Awaited<ReturnType<typeof setupTenant>>;
  let globex: Awaited<ReturnType<typeof setupTenant>>;
  let aliceId: string;

  it("configures a SAML provider and issues a SCIM token", async () => {
    acme = await setupTenant("acme");
    globex = await setupTenant("globex");
    expect(acme.scimToken).toMatch(/^scim_/);

    const list = await request(server)
      .get("/api/v1/auth/sso/providers")
      .set("authorization", `Bearer ${acme.adminToken}`);
    const provider = list.body.data.find((p: { id: string }) => p.id === acme.providerId);
    expect(provider.kind).toBe("SAML");
    expect(provider.scimEnabled).toBe(true);
    expect(provider.samlMetadataUrl).toContain("saml/metadata");
  });

  it("rejects direct SSO start for a SAML provider (Cognito-brokered)", async () => {
    const res = await request(server)
      .post("/api/v1/auth/sso/start")
      .send({ tenantSlug: "acme", email: "x@acme.test", redirectUri: "http://localhost/cb" });
    expect(res.status).toBe(400);
  });

  it("rejects SCIM without / with a bad token", async () => {
    expect((await request(server).get("/api/v1/scim/v2/Users")).status).toBe(401);
    expect((await scimReq("get", "/scim/v2/Users", "scim_bogus")).status).toBe(401);
  });

  it("provisions a user (joiner) with the provider's default role", async () => {
    const res = await scimReq("post", "/scim/v2/Users", acme.scimToken).send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName: "alice@acme.test",
      externalId: "ext-alice",
      name: { givenName: "Alice", familyName: "Smith" },
      emails: [{ value: "alice@acme.test", primary: true }],
      active: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.userName).toBe("alice@acme.test");
    expect(res.body.active).toBe(true);
    expect(res.body.externalId).toBe("ext-alice");
    aliceId = res.body.id;

    const stored = await runInTenant(prisma, acme.tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: aliceId },
        include: { userRoles: { include: { role: true } }, identities: true },
      }),
    );
    expect(stored?.status).toBe("ACTIVE");
    expect(stored?.userRoles.map((r) => r.role.key)).toContain("employee");
    expect(stored?.identities[0]?.subject).toBe("ext-alice");
  });

  it("409s on re-provisioning the same subject", async () => {
    const res = await scimReq("post", "/scim/v2/Users", acme.scimToken).send({
      userName: "alice@acme.test",
      externalId: "ext-alice",
    });
    expect(res.status).toBe(409);
  });

  it("gets and filters provisioned users", async () => {
    const byId = await scimReq("get", `/scim/v2/Users/${aliceId}`, acme.scimToken);
    expect(byId.status).toBe(200);
    expect(byId.body.userName).toBe("alice@acme.test");

    const filtered = await scimReq(
      "get",
      `/scim/v2/Users?filter=${encodeURIComponent('userName eq "alice@acme.test"')}`,
      acme.scimToken,
    );
    expect(filtered.body.totalResults).toBe(1);
    expect(filtered.body.Resources[0].id).toBe(aliceId);
  });

  it("isolates tenants: globex's token cannot see acme's user", async () => {
    const res = await scimReq("get", `/scim/v2/Users/${aliceId}`, globex.scimToken);
    expect(res.status).toBe(404);
  });

  it("deactivates a user (leaver) via PATCH active=false and revokes sessions", async () => {
    // Give the user a live refresh token to prove deactivation revokes it.
    await runInTenant(prisma, acme.tenantId, (tx) =>
      tx.refreshToken.create({
        data: {
          tenantId: acme.tenantId,
          userId: aliceId,
          tokenHash: "live-token-hash",
          family: "fam",
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    );

    const res = await scimReq("patch", `/scim/v2/Users/${aliceId}`, acme.scimToken).send({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [{ op: "replace", path: "active", value: false }],
    });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);

    const stored = await runInTenant(prisma, acme.tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: aliceId },
        include: { refreshTokens: true },
      }),
    );
    expect(stored?.status).toBe("DISABLED");
    expect(stored?.refreshTokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it("deprovisions (DELETE) — resource gone from SCIM, user soft-disabled", async () => {
    expect((await scimReq("delete", `/scim/v2/Users/${aliceId}`, acme.scimToken)).status).toBe(204);
    expect((await scimReq("get", `/scim/v2/Users/${aliceId}`, acme.scimToken)).status).toBe(404);

    const stored = await runInTenant(prisma, acme.tenantId, (tx) =>
      tx.user.findUnique({ where: { id: aliceId } }),
    );
    expect(stored?.status).toBe("DISABLED"); // user kept (payroll history), link removed
  });

  it("recorded tenant-scoped SCIM audit events", async () => {
    const events = await runInTenant(prisma, acme.tenantId, (tx) =>
      tx.auditEvent.findMany({ where: { action: { startsWith: "scim." } } }),
    );
    const actions = events.map((e) => e.action);
    expect(actions).toContain("scim.user.provisioned");
    expect(actions).toContain("scim.user.patched");
    expect(actions).toContain("scim.user.deprovisioned");
    expect(events.every((e) => e.tenantId === acme.tenantId)).toBe(true);
  });
});
