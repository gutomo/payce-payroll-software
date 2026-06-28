import { createHash, createPublicKey, type KeyObject, randomBytes, verify } from "node:crypto";
import type {
  BuildAuthRequestInput,
  ExchangeInput,
  OidcAuthRequest,
  OidcIdentity,
  OidcProvider,
} from "./oidc.types";

export interface StandardOidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  scope?: string;
}

interface JwksKey {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface IdTokenClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/**
 * A standards-compliant OIDC relying party (Authorization Code + PKCE). Works against Amazon Cognito or
 * any compliant issuer (architecture doc §7). The id_token is verified with `node:crypto` against the
 * issuer's JWKS — no extra dependency — and its `iss`/`aud`/`exp`/`nonce` are all checked. The token
 * endpoint and JWKS are fetched via an injectable `fetchFn` so the exchange path is unit-testable
 * offline with a local key set.
 */
export class StandardOidcProvider implements OidcProvider {
  readonly kind = "OIDC" as const;

  constructor(
    private readonly cfg: StandardOidcConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  buildAuthRequest(input: BuildAuthRequestInput): OidcAuthRequest {
    const state = randomBytes(16).toString("base64url");
    const nonce = randomBytes(16).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    const url = new URL(this.cfg.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.cfg.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("scope", this.cfg.scope ?? "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (input.loginHint) {
      url.searchParams.set("login_hint", input.loginHint);
    }
    return { authorizationUrl: url.toString(), state, nonce, codeVerifier };
  }

  async exchange(input: ExchangeInput): Promise<OidcIdentity> {
    const idToken = await this.requestIdToken(input);
    const claims = await this.verifyIdToken(idToken, input.nonce);

    if (!claims.sub || !claims.email) {
      throw new Error("id_token is missing the sub or email claim");
    }
    return {
      subject: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true,
      displayName: claims.name,
    };
  }

  private async requestIdToken(input: ExchangeInput): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: this.cfg.clientId,
      code_verifier: input.codeVerifier,
    });
    if (this.cfg.clientSecret) {
      body.set("client_secret", this.cfg.clientSecret);
    }

    const res = await this.fetchFn(this.cfg.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`token endpoint returned ${res.status}`);
    }
    const json = (await res.json()) as { id_token?: string };
    if (!json.id_token) {
      throw new Error("token response did not include an id_token");
    }
    return json.id_token;
  }

  private async verifyIdToken(idToken: string, expectedNonce: string): Promise<IdTokenClaims> {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new Error("malformed id_token");
    }
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
    const header = decodeJson<{ alg?: string; kid?: string }>(headerB64);
    if (header.alg !== "RS256") {
      throw new Error(`unsupported id_token alg: ${header.alg ?? "none"}`);
    }

    const key = await this.resolveSigningKey(header.kid);
    const signed = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(signatureB64, "base64url");
    if (!verify("RSA-SHA256", signed, key, signature)) {
      throw new Error("id_token signature verification failed");
    }

    const claims = decodeJson<IdTokenClaims>(payloadB64);
    if (claims.iss !== this.cfg.issuer) {
      throw new Error("id_token issuer mismatch");
    }
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(this.cfg.clientId)) {
      throw new Error("id_token audience mismatch");
    }
    if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) {
      throw new Error("id_token is expired");
    }
    if (claims.nonce !== expectedNonce) {
      throw new Error("id_token nonce mismatch");
    }
    return claims;
  }

  private async resolveSigningKey(kid: string | undefined): Promise<KeyObject> {
    const res = await this.fetchFn(this.cfg.jwksUri, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`JWKS endpoint returned ${res.status}`);
    }
    const { keys } = (await res.json()) as { keys?: JwksKey[] };
    const jwk = (keys ?? []).find(
      (k) => k.kty === "RSA" && (kid ? k.kid === kid : true) && (k.alg ? k.alg === "RS256" : true),
    );
    if (!jwk) {
      throw new Error("no matching RS256 signing key in JWKS");
    }
    // The JWK is a valid public-key input; cast through the function's param type to avoid depending on
    // the DOM `JsonWebKey` global (this tsconfig has no DOM lib).
    return createPublicKey({ key: jwk, format: "jwk" } as unknown as Parameters<
      typeof createPublicKey
    >[0]);
  }
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}
