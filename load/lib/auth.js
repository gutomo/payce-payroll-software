import http from "k6/http";
import { check } from "k6";
import { BASE_URL, CREDENTIALS } from "./config.js";

/**
 * Log in and return the access token. The demo admin has no MFA, so password login returns tokens
 * directly. Throws (failing setup) if no token comes back — usually because the API isn't up or the DB
 * wasn't seeded (`pnpm db:seed`).
 */
export function login(creds = CREDENTIALS) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(creds), {
    headers: { "content-type": "application/json" },
    tags: { kind: "auth", ep: "login" },
  });
  check(res, { "login → 200": (r) => r.status === 200 });
  const token = res.json("accessToken");
  if (!token) {
    throw new Error(
      `login failed (status ${res.status}). Is the API up at ${BASE_URL} and the DB seeded?`,
    );
  }
  return token;
}

export function authHeaders(token) {
  return { headers: { authorization: `Bearer ${token}`, accept: "application/json" } };
}
