"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { login, ssoStart, verifyMfa } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import type { AuthFormState } from "./form-state";
import { clearSession, getMfaToken, setMfaToken, setSession } from "./session";
import { setSsoPending } from "./sso";

/**
 * Auth server actions. They own the only writes to session cookies and the post-auth redirects.
 * `redirect()` throws internally, so it is always called *after* the try/catch, never inside it,
 * where the redirect signal would be swallowed.
 */

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!tenantSlug || !email || !password) {
    return { error: "Workspace, email, and password are all required." };
  }

  let result;
  try {
    result = await login({ tenantSlug, email, password });
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      return { error: "Invalid credentials." };
    }
    return { error: "Something went wrong. Please try again." };
  }

  if (result.mfaRequired) {
    await setMfaToken(result.mfaToken);
    redirect("/login/mfa");
  }
  await setSession(result);
  redirect("/myhr");
}

export async function verifyMfaAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const code = String(formData.get("code") ?? "").trim();
  const mfaToken = await getMfaToken();
  if (!mfaToken) {
    return { error: "Your sign-in attempt expired. Please sign in again." };
  }
  if (!/^\d{6,8}$/.test(code)) {
    return { error: "Enter the 6-digit code from your authenticator app." };
  }

  let tokens;
  try {
    tokens = await verifyMfa({ mfaToken, code });
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      return { error: "Invalid code. Please try again." };
    }
    return { error: "Something went wrong. Please try again." };
  }
  await setSession(tokens);
  redirect("/myhr");
}

/**
 * Begin enterprise SSO. Resolves the workspace's identity provider, stashes the CSRF/replay/PKCE
 * values in a short-lived httpOnly cookie, and redirects the browser to the IdP. The IdP returns to
 * `/login/sso/callback` (the route handler), which completes the exchange.
 */
export async function ssoStartAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!tenantSlug) {
    return { error: "Enter your workspace to continue with SSO." };
  }

  const redirectUri = `${await appOrigin()}/login/sso/callback`;
  let result;
  try {
    result = await ssoStart({ tenantSlug, email: email || undefined, redirectUri });
  } catch (error) {
    if (error instanceof ApiError && (error.isUnauthorized || error.isNotFound)) {
      return { error: "Single sign-on isn't set up for that workspace." };
    }
    return { error: "Something went wrong. Please try again." };
  }

  await setSsoPending({
    tenantSlug,
    providerId: result.providerId,
    state: result.state,
    nonce: result.nonce,
    codeVerifier: result.codeVerifier,
    redirectUri,
  });
  redirect(result.authorizationUrl);
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}

/** Origin of this web app, derived from the (proxied) request headers. */
async function appOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}
