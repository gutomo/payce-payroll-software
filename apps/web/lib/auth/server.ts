import { redirect } from "next/navigation";
import { getMe } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import type { Me } from "@/lib/api/types";
import { getAccessToken } from "./session";

/**
 * Server-side auth guards for the authenticated app. Middleware refreshes tokens proactively before
 * a request reaches these, so a missing/rejected token here means the session is genuinely gone —
 * bounce to login rather than render a broken page.
 */

/** The current access token, or a redirect to login if absent. */
export async function requireAccessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) redirect("/login");
  return token;
}

/** The authenticated user plus their token, or a redirect to login on any auth failure. Drives the
 *  app shell (nav gating, identity). */
export async function requireMe(): Promise<{ token: string; me: Me }> {
  const token = await requireAccessToken();
  try {
    return { token, me: await getMe(token) };
  } catch (error) {
    if (error instanceof ApiError && (error.isUnauthorized || error.isForbidden)) {
      redirect("/login");
    }
    throw error;
  }
}
