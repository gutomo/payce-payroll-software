import { cookies } from "next/headers";
import type { SessionTokens } from "@/lib/api/types";
import {
  ACCESS_MAX_AGE,
  AT_COOKIE,
  cookieOptions,
  MFA_COOKIE,
  MFA_MAX_AGE,
  REFRESH_MAX_AGE,
  RT_COOKIE,
} from "./cookies";

/**
 * Server-only session cookie helpers, built on `next/headers`. Mutating cookies is only allowed in
 * Server Actions and Route Handlers; these are called from the auth actions, never during a plain
 * page render. (Proactive refresh that rotates cookies lives in middleware; see `middleware.ts`.)
 */

/** Persist a freshly issued session and clear any pending MFA challenge. */
export async function setSession(tokens: SessionTokens): Promise<void> {
  const jar = await cookies();
  jar.set(AT_COOKIE, tokens.accessToken, cookieOptions(ACCESS_MAX_AGE));
  jar.set(RT_COOKIE, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE));
  jar.delete(MFA_COOKIE);
}

/** Drop every session cookie (sign out / failed refresh). */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(AT_COOKIE);
  jar.delete(RT_COOKIE);
  jar.delete(MFA_COOKIE);
}

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(AT_COOKIE)?.value;
}

/** Stash the short-lived MFA token between the password step and the code step. */
export async function setMfaToken(token: string): Promise<void> {
  (await cookies()).set(MFA_COOKIE, token, cookieOptions(MFA_MAX_AGE));
}

export async function getMfaToken(): Promise<string | undefined> {
  return (await cookies()).get(MFA_COOKIE)?.value;
}
