import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import type { Env } from "../../config/env";
import { OfflineOidcProvider } from "./offline-provider";
import type { OidcProvider } from "./oidc.types";
import { StandardOidcProvider } from "./oidc-provider";

/** The IdentityProvider fields the factory needs, decoupled from the Prisma row shape. */
export interface SsoProviderConfig {
  id: string;
  kind: "OIDC" | "OFFLINE";
  issuer: string | null;
  clientId: string | null;
  clientSecretRef: string | null;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
  jwksUri: string | null;
}

/**
 * Builds the right {@link OidcProvider} for a configured tenant identity provider, mirroring the Assist
 * provider-selection pattern. OFFLINE providers are refused in production (fail closed). For a real
 * OIDC provider the client secret is resolved out-of-band: in dev/test from the OIDC_CLIENT_SECRET env
 * var; in production it would be read from the Secrets Manager secret named by `clientSecretRef`
 * (golden rule 3 — never stored in the DB or repo). Secrets-Manager resolution is wired when an account
 * exists; until then a real OIDC provider needs OIDC_CLIENT_SECRET set.
 */
@Injectable()
export class SsoProviderFactory {
  constructor(private readonly config: ConfigService<Env, true>) {}

  create(provider: SsoProviderConfig): OidcProvider {
    if (provider.kind === "OFFLINE") {
      if (this.config.get("NODE_ENV", { infer: true }) === "production") {
        throw new Error("OFFLINE identity providers are not permitted in production");
      }
      return new OfflineOidcProvider(this.offlineKey(provider.id));
    }

    const { issuer, clientId, authorizationEndpoint, tokenEndpoint, jwksUri } = provider;
    if (!issuer || !clientId || !authorizationEndpoint || !tokenEndpoint || !jwksUri) {
      throw new Error("OIDC identity provider is missing required connection fields");
    }
    return new StandardOidcProvider({
      issuer,
      clientId,
      clientSecret: this.config.get("OIDC_CLIENT_SECRET", { infer: true }) || undefined,
      authorizationEndpoint,
      tokenEndpoint,
      jwksUri,
    });
  }

  /** Per-provider HMAC key for the offline assertion, derived from the access secret. */
  private offlineKey(providerId: string): string {
    const base = this.config.get("JWT_ACCESS_SECRET", { infer: true });
    return createHmac("sha256", base).update(`sso-offline:${providerId}`).digest("base64url");
  }
}
