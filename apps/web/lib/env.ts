/**
 * Server-only configuration for the web app. The browser never talks to the API directly, every
 * call is proxied through Next.js server code, so the API base URL is plain server config, not a
 * `NEXT_PUBLIC_*` value (which would ship to the client). Importing this from a Client Component is
 * a bug; keep it on the server.
 */

const DEFAULT_API_BASE_URL = "http://localhost:4000/api/v1";

/** Base URL for the API, including the `/api/v1` version prefix and no trailing slash. */
export function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
}
