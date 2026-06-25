import { describe, expect, it } from "vitest";
import { validateEnv } from "./env";

const base = { DATABASE_URL: "postgresql://localhost:5432/db" };

const REAL_SECRETS = {
  JWT_ACCESS_SECRET: "prod-access-secret-at-least-16",
  JWT_MFA_SECRET: "prod-mfa-secret-at-least-16-ch",
  PLATFORM_ADMIN_KEY: "prod-platform-admin-key",
};

describe("validateEnv", () => {
  it("allows the committed dev placeholder secrets outside production", () => {
    const env = validateEnv({ ...base, NODE_ENV: "development" });
    expect(env.JWT_ACCESS_SECRET).toBe("dev-access-secret-change-me-please");
    expect(env.PLATFORM_ADMIN_KEY).toBe("dev-platform-admin-key");
  });

  it("fails closed in production when secrets are unset (fall back to public defaults)", () => {
    expect(() => validateEnv({ ...base, NODE_ENV: "production" })).toThrow();
  });

  it("rejects a secret explicitly set to the committed dev placeholder in production", () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: "production",
        ...REAL_SECRETS,
        JWT_MFA_SECRET: "dev-mfa-secret-change-me-please!!",
      }),
    ).toThrow(/JWT_MFA_SECRET/);
  });

  it("accepts explicit non-default secrets in production", () => {
    const env = validateEnv({ ...base, NODE_ENV: "production", ...REAL_SECRETS });
    expect(env.NODE_ENV).toBe("production");
    expect(env.JWT_ACCESS_SECRET).toBe(REAL_SECRETS.JWT_ACCESS_SECRET);
  });
});
