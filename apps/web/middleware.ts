import { type NextRequest, NextResponse } from "next/server";
import { refresh } from "@/lib/api/endpoints";
import type { SessionTokens } from "@/lib/api/types";
import {
  ACCESS_MAX_AGE,
  AT_COOKIE,
  cookieOptions,
  REFRESH_MAX_AGE,
  RT_COOKIE,
} from "@/lib/auth/cookies";
import { isExpiring } from "@/lib/auth/jwt";

/**
 * Gate the authenticated app and keep its access token fresh. Running here means a request never
 * reaches a page render with a dead access token (page renders can't rotate cookies: only Server
 * Actions, Route Handlers, and middleware can). On an expiring token we refresh once, writing the
 * new pair onto both the forwarded request (so this render sees it) and the response (so the browser
 * keeps it). No valid refresh token ⇒ redirect to login.
 */

function loginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // Remember where the user was headed so login can return them there.
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(AT_COOKIE)?.value;
  const refreshToken = request.cookies.get(RT_COOKIE)?.value;

  if (accessToken && !isExpiring(accessToken)) {
    return NextResponse.next();
  }
  if (!refreshToken) {
    return loginRedirect(request);
  }

  let tokens: SessionTokens;
  try {
    tokens = await refresh(refreshToken);
  } catch {
    const response = loginRedirect(request);
    response.cookies.delete(AT_COOKIE);
    response.cookies.delete(RT_COOKIE);
    return response;
  }

  request.cookies.set(AT_COOKIE, tokens.accessToken);
  request.cookies.set(RT_COOKIE, tokens.refreshToken);
  const response = NextResponse.next({ request });
  response.cookies.set(AT_COOKIE, tokens.accessToken, cookieOptions(ACCESS_MAX_AGE));
  response.cookies.set(RT_COOKIE, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE));
  return response;
}

export const config = {
  // Only the authenticated app needs a session; marketing, auth, and the /demo tour stay public.
  matcher: ["/myhr/:path*", "/org/:path*", "/insights/:path*", "/assist/:path*"],
};
