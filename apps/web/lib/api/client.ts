import { apiBaseUrl } from "@/lib/env";
import { ApiError } from "./errors";

export interface ApiRequest {
  method?: "GET" | "POST";
  /** Bearer access token for authenticated calls. Omit for public endpoints (login, refresh). */
  token?: string;
  /** Request body; JSON-serialized automatically. */
  body?: unknown;
}

/** Shape of the API's error envelope: `{ error: { code, message, requestId } }`. */
interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown };
}

function parseError(status: number, payload: unknown): ApiError {
  const envelope = (payload ?? {}) as ErrorEnvelope;
  const code = typeof envelope.error?.code === "string" ? envelope.error.code : "ERROR";
  const message =
    typeof envelope.error?.message === "string" ? envelope.error.message : "Request failed";
  return new ApiError(status, code, message);
}

/**
 * The single choke point for talking to the API. Attaches the bearer token, never caches (auth'd
 * reads must be live), and converts the JSON error envelope into a typed {@link ApiError}. Returns
 * the decoded body as `T`. Server-side only; it reads the server-only API base URL.
 */
export async function apiFetch<T>(path: string, req: ApiRequest = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (req.token) headers.authorization = `Bearer ${req.token}`;
  if (req.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: req.method ?? "GET",
    headers,
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
    // Per-user, permission-scoped data must never be served from a shared cache.
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw parseError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
