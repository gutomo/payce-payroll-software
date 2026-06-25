/**
 * Cookie names and options shared between the server-action session helpers (which use
 * `next/headers`) and the middleware (which uses `NextResponse`). Kept free of `server-only` and
 * `next/headers` imports so it loads cleanly in both the Node and Edge runtimes.
 *
 * Tokens live in httpOnly cookies so client-side JS can never read them (XSS can't exfiltrate the
 * session). Lifetimes mirror the API's token TTLs.
 */

export const AT_COOKIE = "payce_at";
export const RT_COOKIE = "payce_rt";
export const MFA_COOKIE = "payce_mfa";

export const ACCESS_MAX_AGE = 15 * 60; // API ACCESS_TOKEN_TTL = 15m
export const REFRESH_MAX_AGE = 30 * 24 * 60 * 60; // API REFRESH_TOKEN_TTL_DAYS = 30d
export const MFA_MAX_AGE = 5 * 60; // API MFA_TOKEN_TTL = 5m

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

/** httpOnly, lax, host-wide cookie options. `secure` only outside dev so cookies work over plain
 *  http on localhost but require https everywhere else. */
export function cookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}
