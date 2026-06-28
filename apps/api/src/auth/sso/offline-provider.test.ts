import { describe, expect, it } from "vitest";
import { OfflineOidcProvider } from "./offline-provider";

const REDIRECT = "http://localhost:3000/login/sso/callback";

/** Pull the `code` and `state` the offline IdP put on the callback URL. */
function parse(url: string): { code: string; state: string } {
  const u = new URL(url);
  return { code: u.searchParams.get("code") ?? "", state: u.searchParams.get("state") ?? "" };
}

describe("OfflineOidcProvider", () => {
  it("round-trips: buildAuthRequest → exchange yields the hinted identity", async () => {
    const provider = new OfflineOidcProvider("test-secret");
    const auth = provider.buildAuthRequest({ redirectUri: REDIRECT, loginHint: "Sam@Acme.test" });

    expect(auth.authorizationUrl.startsWith(REDIRECT)).toBe(true);
    const { code, state } = parse(auth.authorizationUrl);
    expect(state).toBe(auth.state);

    const identity = await provider.exchange({
      code,
      redirectUri: REDIRECT,
      nonce: auth.nonce,
      codeVerifier: auth.codeVerifier,
    });
    expect(identity).toEqual({
      subject: "offline:sam@acme.test",
      email: "sam@acme.test",
      emailVerified: true,
      displayName: undefined,
    });
  });

  it("requires a login hint (it has no login UI)", () => {
    const provider = new OfflineOidcProvider("test-secret");
    expect(() => provider.buildAuthRequest({ redirectUri: REDIRECT })).toThrow(/login hint/);
  });

  it("rejects a tampered code (signature mismatch)", async () => {
    const provider = new OfflineOidcProvider("test-secret");
    const auth = provider.buildAuthRequest({ redirectUri: REDIRECT, loginHint: "sam@acme.test" });
    const { code } = parse(auth.authorizationUrl);
    const tampered = `${code.slice(0, -2)}xy`;
    await expect(
      provider.exchange({
        code: tampered,
        redirectUri: REDIRECT,
        nonce: auth.nonce,
        codeVerifier: auth.codeVerifier,
      }),
    ).rejects.toThrow();
  });

  it("rejects a code minted with a different per-provider key", async () => {
    const a = new OfflineOidcProvider("provider-a-key");
    const b = new OfflineOidcProvider("provider-b-key");
    const auth = a.buildAuthRequest({ redirectUri: REDIRECT, loginHint: "sam@acme.test" });
    const { code } = parse(auth.authorizationUrl);
    await expect(
      b.exchange({
        code,
        redirectUri: REDIRECT,
        nonce: auth.nonce,
        codeVerifier: auth.codeVerifier,
      }),
    ).rejects.toThrow(/signature mismatch/);
  });

  it("rejects a nonce mismatch (replay guard)", async () => {
    const provider = new OfflineOidcProvider("test-secret");
    const auth = provider.buildAuthRequest({ redirectUri: REDIRECT, loginHint: "sam@acme.test" });
    const { code } = parse(auth.authorizationUrl);
    await expect(
      provider.exchange({
        code,
        redirectUri: REDIRECT,
        nonce: "not-the-nonce",
        codeVerifier: auth.codeVerifier,
      }),
    ).rejects.toThrow(/nonce mismatch/);
  });

  it("rejects an expired assertion", async () => {
    const provider = new OfflineOidcProvider("test-secret", -1); // already expired
    const auth = provider.buildAuthRequest({ redirectUri: REDIRECT, loginHint: "sam@acme.test" });
    const { code } = parse(auth.authorizationUrl);
    await expect(
      provider.exchange({
        code,
        redirectUri: REDIRECT,
        nonce: auth.nonce,
        codeVerifier: auth.codeVerifier,
      }),
    ).rejects.toThrow(/expired/);
  });
});
