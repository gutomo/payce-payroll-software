"use server";

import { redirect } from "next/navigation";
import { login, verifyMfa } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import type { AuthFormState } from "./form-state";
import { clearSession, getMfaToken, setMfaToken, setSession } from "./session";

/**
 * Auth server actions. They own the only writes to session cookies and the post-auth redirects.
 * `redirect()` throws internally, so it is always called *after* the try/catch — never inside it,
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

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
