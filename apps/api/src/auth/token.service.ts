import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_CONFIG = Symbol("TOKEN_CONFIG");

export interface TokenConfig {
  accessSecret: string;
  accessTtl: string;
  mfaSecret: string;
  mfaTtl: string;
}

/** Claims embedded in a short-lived access token (stateless authz; perms flattened at login). */
export interface AccessClaims {
  sub: string;
  tenantId: string;
  roles: string[];
  perms: string[];
}

/** Claims in the interim token issued between password and MFA steps of login. */
export interface MfaClaims {
  sub: string;
  tenantId: string;
  typ: "mfa";
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(TOKEN_CONFIG) private readonly config: TokenConfig,
  ) {}

  signAccess(claims: AccessClaims): string {
    return this.jwt.sign(claims, {
      secret: this.config.accessSecret,
      expiresIn: this.config.accessTtl,
    });
  }

  verifyAccess(token: string): AccessClaims {
    return this.jwt.verify<AccessClaims>(token, { secret: this.config.accessSecret });
  }

  signMfa(sub: string, tenantId: string): string {
    const claims: MfaClaims = { sub, tenantId, typ: "mfa" };
    return this.jwt.sign(claims, { secret: this.config.mfaSecret, expiresIn: this.config.mfaTtl });
  }

  verifyMfa(token: string): MfaClaims {
    return this.jwt.verify<MfaClaims>(token, { secret: this.config.mfaSecret });
  }

  /** Opaque, high-entropy refresh token. Only the sha-256 hash is persisted. */
  createRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
