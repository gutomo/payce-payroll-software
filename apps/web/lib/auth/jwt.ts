/**
 * Minimal, signature-free JWT inspection. The API is the sole authority on token validity; here we
 * only peek at `exp` to decide whether to refresh proactively in middleware. Uses `atob` (no Node
 * Buffer) so it runs in the Edge runtime as well as Node.
 */

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
  return atob(padded);
}

/** The `exp` claim (seconds since epoch), or null if the token is malformed or has no numeric exp. */
export function jwtExp(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(base64UrlDecode(payload)) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

/**
 * True if the token is missing, unparseable, or expires within `skewSeconds`. The skew gives a
 * margin so a request never reaches the API with an access token about to die mid-flight.
 */
export function isExpiring(
  token: string | undefined,
  skewSeconds = 30,
  nowMs: number = Date.now(),
): boolean {
  if (!token) return true;
  const exp = jwtExp(token);
  if (exp === null) return true;
  return exp * 1000 - nowMs <= skewSeconds * 1000;
}
