import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { ssoCallback } from "@/lib/api/endpoints";
import { setSession } from "@/lib/auth/session";
import { clearSsoPending, getSsoPending } from "@/lib/auth/sso";

/**
 * OIDC redirect target. The IdP sends the browser here with `code` + `state`; we pair them with the
 * `state`/`nonce`/`codeVerifier` stashed at `start` (httpOnly cookie) and ask the API to complete the
 * exchange. On success we hold the issued session in the usual cookies and land on MyHR; any failure
 * (missing/expired pending state, bad code, CSRF mismatch) routes back to the login page.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const pending = await getSsoPending();
  await clearSsoPending();

  let tokens = null;
  if (code && state && pending) {
    try {
      tokens = await ssoCallback({
        tenantSlug: pending.tenantSlug,
        providerId: pending.providerId,
        code,
        state,
        expectedState: pending.state,
        nonce: pending.nonce,
        codeVerifier: pending.codeVerifier,
        redirectUri: pending.redirectUri,
      });
    } catch {
      tokens = null;
    }
  }

  if (!tokens) {
    redirect("/login?error=sso");
  }
  await setSession(tokens);
  redirect("/myhr");
}
