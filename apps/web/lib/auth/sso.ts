import { cookies } from "next/headers";
import { cookieOptions, SSO_COOKIE, SSO_MAX_AGE } from "./cookies";

/**
 * The SSO round-trip state, held in a short-lived httpOnly cookie between `start` and the IdP callback.
 * Keeping `state`, `nonce`, and `codeVerifier` out of the URL (and unreadable to client JS) is what
 * makes the callback's CSRF/replay/PKCE checks meaningful. The cookie is cleared once consumed.
 */
export interface SsoPending {
  tenantSlug: string;
  providerId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
}

export async function setSsoPending(pending: SsoPending): Promise<void> {
  (await cookies()).set(SSO_COOKIE, JSON.stringify(pending), cookieOptions(SSO_MAX_AGE));
}

export async function getSsoPending(): Promise<SsoPending | null> {
  const raw = (await cookies()).get(SSO_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SsoPending;
  } catch {
    return null;
  }
}

export async function clearSsoPending(): Promise<void> {
  (await cookies()).delete(SSO_COOKIE);
}
