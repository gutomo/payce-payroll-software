/** Normalised identity asserted by an IdP after a successful OIDC exchange. */
export interface OidcIdentity {
  /** The IdP `sub` claim — stable, opaque, unique per user at that provider. */
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
}

/**
 * A pending authorization request: the URL to send the browser to, plus the per-attempt secrets the
 * relying party must remember to validate the callback. The web app holds these in a short-lived
 * httpOnly cookie between `start` and `callback`; the API is stateless across the two.
 */
export interface OidcAuthRequest {
  authorizationUrl: string;
  /** CSRF guard: the IdP echoes it back unchanged. */
  state: string;
  /** Replay guard: bound into the id_token, checked on exchange. */
  nonce: string;
  /** PKCE: proves the token-exchange caller is the one who started the flow. */
  codeVerifier: string;
}

export interface BuildAuthRequestInput {
  /** The relying-party callback URL the IdP redirects back to (must match at exchange time). */
  redirectUri: string;
  /** Optional email hint; the OFFLINE provider requires it (it has no login UI). */
  loginHint?: string;
}

export interface ExchangeInput {
  code: string;
  redirectUri: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * Pluggable OIDC relying-party. Two implementations mirror the Assist provider abstraction:
 * {@link StandardOidcProvider} (real OIDC; works against Cognito or any compliant issuer) and the
 * {@link OfflineOidcProvider} (deterministic, no-network test IdP for dev/demo/CI).
 */
export interface OidcProvider {
  readonly kind: "OIDC" | "OFFLINE";
  buildAuthRequest(input: BuildAuthRequestInput): Promise<OidcAuthRequest> | OidcAuthRequest;
  exchange(input: ExchangeInput): Promise<OidcIdentity>;
}
