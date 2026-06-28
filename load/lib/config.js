// Shared config + load profiles for the k6 suite. Everything is overridable via env so the same
// scripts run against local dev or staging: BASE_URL, PROFILE, TENANT, USER_EMAIL, USER_PASSWORD.
//
// This directory is intentionally NOT a pnpm workspace: k6 scripts run on the k6 (goja) runtime, not
// Node, and import from `k6/*`. They are formatted by Prettier but not linted/typechecked/built.

export const BASE_URL = __ENV.BASE_URL || "http://localhost:4000/api/v1";

// Defaults match the synthetic demo seed (packages/db/prisma/seed.ts). Never put real creds here.
export const CREDENTIALS = {
  tenantSlug: __ENV.TENANT || "demo",
  email: __ENV.USER_EMAIL || "admin@demo.test",
  password: __ENV.USER_PASSWORD || "Demo-Passw0rd-123",
};

// Profiles tune VUs/duration. `smoke` is a fast correctness check (CI-friendly); `load` approximates a
// steady target load; `stress` ramps past it to find the knee. Select with PROFILE=<name>.
const PROFILES = {
  smoke: { vus: 1, duration: "30s" },
  load: {
    stages: [
      { duration: "30s", target: 20 },
      { duration: "2m", target: 20 },
      { duration: "30s", target: 0 },
    ],
  },
  stress: {
    stages: [
      { duration: "1m", target: 50 },
      { duration: "2m", target: 100 },
      { duration: "1m", target: 0 },
    ],
  },
};

export function profile() {
  return PROFILES[__ENV.PROFILE || "smoke"] || PROFILES.smoke;
}

// Service-level objectives (PLAN.md §6 NFRs, §11 load AC). These encode the targets the run must meet;
// tune as the real ECS/Aurora infra and autoscaling land. Tagged thresholds let reads and compute-heavy
// requests have different budgets.
export const THRESHOLDS = {
  http_req_failed: ["rate<0.01"], // < 1% errors
  http_req_duration: ["p(95)<800"], // overall API p95 < 800ms
  "http_req_duration{kind:read}": ["p(95)<500"], // simple reads < 500ms
  "http_req_duration{kind:compute}": ["p(95)<1500"], // aggregate/report < 1.5s
};
