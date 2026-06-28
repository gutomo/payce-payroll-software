import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  BuildAuthRequestInput,
  ExchangeInput,
  OidcAuthRequest,
  OidcIdentity,
  OidcProvider,
} from "./oidc.types";

interface OfflineAssertion {
  sub: string;
  email: string;
  name?: string;
  nonce: string;
  /** epoch seconds */
  exp: number;
}

/**
 * A deterministic, no-network OIDC provider — the "test IdP" Phase 7's AC calls for (PLAN.md §11).
 * It short-circuits the browser round-trip: `buildAuthRequest` returns the relying-party callback URL
 * with a self-signed assertion as the `code`, "authenticating" whoever the login hint names. The
 * assertion is HMAC-signed with a per-provider key (derived in the factory), so it cannot be forged or
 * replayed across providers, and it carries the nonce + an expiry. NEVER enabled in production — the
 * factory refuses OFFLINE providers when NODE_ENV=production.
 */
export class OfflineOidcProvider implements OidcProvider {
  readonly kind = "OFFLINE" as const;
  private readonly key: Buffer;

  constructor(
    secret: string,
    private readonly ttlSeconds = 300,
  ) {
    this.key = Buffer.from(secret, "utf8");
  }

  buildAuthRequest(input: BuildAuthRequestInput): OidcAuthRequest {
    const email = (input.loginHint ?? "").trim().toLowerCase();
    if (!email) {
      throw new Error("offline IdP requires a login hint (the email to authenticate as)");
    }
    const state = randomBytes(16).toString("base64url");
    const nonce = randomBytes(16).toString("base64url");
    const assertion: OfflineAssertion = {
      sub: `offline:${email}`,
      email,
      nonce,
      exp: nowSeconds() + this.ttlSeconds,
    };
    const url = new URL(input.redirectUri);
    url.searchParams.set("code", this.sign(assertion));
    url.searchParams.set("state", state);
    return {
      authorizationUrl: url.toString(),
      state,
      nonce,
      // PKCE is meaningless for the offline provider; keep a value for interface symmetry.
      codeVerifier: randomBytes(16).toString("base64url"),
    };
  }

  // async so any validation failure surfaces as a rejected promise (the interface contract), not a
  // synchronous throw.
  async exchange(input: ExchangeInput): Promise<OidcIdentity> {
    const assertion = this.verify(input.code);
    if (assertion.exp < nowSeconds()) {
      throw new Error("offline assertion expired");
    }
    if (assertion.nonce !== input.nonce) {
      throw new Error("offline assertion nonce mismatch");
    }
    return {
      subject: assertion.sub,
      email: assertion.email,
      emailVerified: true,
      displayName: assertion.name,
    };
  }

  private sign(assertion: OfflineAssertion): string {
    const payload = Buffer.from(JSON.stringify(assertion), "utf8").toString("base64url");
    const mac = createHmac("sha256", this.key).update(payload).digest("base64url");
    return `${payload}.${mac}`;
  }

  private verify(code: string): OfflineAssertion {
    const dot = code.indexOf(".");
    if (dot <= 0) {
      throw new Error("malformed offline code");
    }
    const payload = code.slice(0, dot);
    const expected = createHmac("sha256", this.key).update(payload).digest("base64url");
    const got = Buffer.from(code.slice(dot + 1));
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new Error("offline code signature mismatch");
    }
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OfflineAssertion;
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
