import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StandardOidcProvider, type StandardOidcConfig } from "./oidc-provider";

const ISSUER = "https://issuer.example.com";
const CLIENT_ID = "payce-client";
const REDIRECT = "http://localhost:3000/login/sso/callback";

const CFG: StandardOidcConfig = {
  issuer: ISSUER,
  clientId: CLIENT_ID,
  authorizationEndpoint: `${ISSUER}/authorize`,
  tokenEndpoint: `${ISSUER}/token`,
  jwksUri: `${ISSUER}/jwks`,
};

const KID = "test-key-1";
const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function signIdToken(claims: Record<string, unknown>, signer = keyPair.privateKey): string {
  const header = b64url({ alg: "RS256", typ: "JWT", kid: KID });
  const payload = b64url(claims);
  const signature = cryptoSign("RSA-SHA256", Buffer.from(`${header}.${payload}`), signer).toString(
    "base64url",
  );
  return `${header}.${payload}.${signature}`;
}

function jwks(): { keys: unknown[] } {
  return {
    keys: [{ ...keyPair.publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" }],
  };
}

/** Serves the JWKS, and the given id_token (or a 400) from the token endpoint. */
function fakeFetch(idToken: string | null): typeof fetch {
  return (async (url: string | URL): Promise<Response> => {
    const u = url.toString();
    const body = u === CFG.tokenEndpoint ? { id_token: idToken } : u === CFG.jwksUri ? jwks() : {};
    const ok = u === CFG.jwksUri || (u === CFG.tokenEndpoint && idToken !== null);
    return {
      ok,
      status: ok ? 200 : 400,
      json: () => Promise.resolve(body),
    } as Response;
  }) as unknown as typeof fetch;
}

function baseClaims(nonce: string): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce,
    sub: "idp-sub-123",
    email: "user@acme.test",
    email_verified: true,
    name: "Acme User",
  };
}

function exchangeWith(idToken: string, nonce: string) {
  const provider = new StandardOidcProvider(CFG, fakeFetch(idToken));
  return provider.exchange({
    code: "auth-code",
    redirectUri: REDIRECT,
    nonce,
    codeVerifier: "verifier",
  });
}

describe("StandardOidcProvider", () => {
  it("builds an authorization-code + PKCE request", () => {
    const provider = new StandardOidcProvider(CFG);
    const auth = provider.buildAuthRequest({ redirectUri: REDIRECT, loginHint: "user@acme.test" });
    const url = new URL(auth.authorizationUrl);

    expect(url.origin + url.pathname).toBe(CFG.authorizationEndpoint);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe(auth.state);
    expect(url.searchParams.get("nonce")).toBe(auth.nonce);
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("login_hint")).toBe("user@acme.test");
    expect(auth.codeVerifier).toBeTruthy();
  });

  it("exchanges a code and verifies the id_token signature + claims", async () => {
    const identity = await exchangeWith(signIdToken(baseClaims("nonce-1")), "nonce-1");
    expect(identity).toEqual({
      subject: "idp-sub-123",
      email: "user@acme.test",
      emailVerified: true,
      displayName: "Acme User",
    });
  });

  it("rejects a nonce mismatch", async () => {
    await expect(exchangeWith(signIdToken(baseClaims("nonce-1")), "different")).rejects.toThrow(
      /nonce mismatch/,
    );
  });

  it("rejects an audience mismatch", async () => {
    const claims = { ...baseClaims("nonce-1"), aud: "someone-else" };
    await expect(exchangeWith(signIdToken(claims), "nonce-1")).rejects.toThrow(/audience mismatch/);
  });

  it("rejects an issuer mismatch", async () => {
    const claims = { ...baseClaims("nonce-1"), iss: "https://evil.example.com" };
    await expect(exchangeWith(signIdToken(claims), "nonce-1")).rejects.toThrow(/issuer mismatch/);
  });

  it("rejects an expired id_token", async () => {
    const claims = { ...baseClaims("nonce-1"), exp: Math.floor(Date.now() / 1000) - 10 };
    await expect(exchangeWith(signIdToken(claims), "nonce-1")).rejects.toThrow(/expired/);
  });

  it("rejects a token signed by a key not in the JWKS", async () => {
    const forged = signIdToken(baseClaims("nonce-1"), otherKeyPair.privateKey);
    await expect(exchangeWith(forged, "nonce-1")).rejects.toThrow(/signature verification failed/);
  });

  it("rejects when the token endpoint returns no id_token", async () => {
    const provider = new StandardOidcProvider(CFG, fakeFetch(null));
    await expect(
      provider.exchange({ code: "c", redirectUri: REDIRECT, nonce: "n", codeVerifier: "v" }),
    ).rejects.toThrow();
  });
});
