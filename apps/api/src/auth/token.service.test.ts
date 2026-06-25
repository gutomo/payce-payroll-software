import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import { type TokenConfig, TokenService } from "./token.service";

const config: TokenConfig = {
  accessSecret: "access-secret-0123456789abcd",
  accessTtl: "15m",
  mfaSecret: "mfa-secret-0123456789abcd",
  mfaTtl: "5m",
};

function makeService(): TokenService {
  return new TokenService(new JwtService(), config);
}

describe("TokenService", () => {
  it("round-trips an access token", () => {
    const svc = makeService();
    const token = svc.signAccess({
      sub: "u1",
      tenantId: "t1",
      roles: ["tenant_admin"],
      perms: ["self.read", "audit.read"],
    });
    const claims = svc.verifyAccess(token);
    expect(claims.sub).toBe("u1");
    expect(claims.tenantId).toBe("t1");
    expect(claims.perms).toContain("audit.read");
  });

  it("does not accept an MFA token where an access token is required", () => {
    const svc = makeService();
    const mfa = svc.signMfa("u1", "t1");
    expect(() => svc.verifyAccess(mfa)).toThrow();
  });

  it("creates a refresh token whose sha-256 hash is reproducible and not the token itself", () => {
    const svc = makeService();
    const { token, hash } = svc.createRefreshToken();
    expect(hash).toBe(svc.hashRefreshToken(token));
    expect(hash).not.toBe(token);
  });
});
