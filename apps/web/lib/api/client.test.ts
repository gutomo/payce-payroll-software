import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client";
import { ApiError } from "./errors";

const BASE = "http://api.test/api/v1";

interface CapturedInit {
  method: string;
  cache: string;
  headers: Record<string, string>;
  body?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** First fetch call as `[url, init]`, typed to what the client actually passes. */
function firstCall(fetchMock: ReturnType<typeof vi.fn>): [string, CapturedInit] {
  const call = fetchMock.mock.calls[0];
  expect(call).toBeDefined();
  return call as [string, CapturedInit];
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.stubEnv("API_BASE_URL", BASE);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("issues a GET to the versioned base URL and decodes JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: boolean }>("/me");

    expect(result).toEqual({ ok: true });
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe(`${BASE}/me`);
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(init.headers.authorization).toBeUndefined();
  });

  it("attaches the bearer token and serializes a JSON body on POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "1" }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/auth/login", { method: "POST", token: "tok", body: { a: 1 } });

    const [, init] = firstCall(fetchMock);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("throws a typed ApiError carrying the envelope code and status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "NOT_FOUND", message: "nope" } }, 404));
    vi.stubGlobal("fetch", fetchMock);

    const error = (await apiFetch("/me/employee").catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.isNotFound).toBe(true);
  });

  it("falls back to a generic ApiError when the body is not the expected envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const error = (await apiFetch("/me").catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.code).toBe("ERROR");
  });
});
