import http from "k6/http";
import { check, group, sleep } from "k6";
import { BASE_URL, profile, THRESHOLDS } from "../lib/config.js";
import { authHeaders, login } from "../lib/auth.js";

// A representative authenticated workload: a read-heavy mix (the common case) plus a compute-heavy
// Insights aggregate (idempotent, so safe to repeat under load). Thresholds assert the SLOs.
//
//   k6 run load/scenarios/api-mix.js                  # smoke (default)
//   PROFILE=load k6 run load/scenarios/api-mix.js     # steady load
//   PROFILE=stress BASE_URL=https://staging.example.com/api/v1 k6 run load/scenarios/api-mix.js

export const options = {
  ...profile(),
  thresholds: THRESHOLDS,
};

export function setup() {
  return { token: login() };
}

export default function (data) {
  const auth = authHeaders(data.token);

  group("reads", () => {
    const me = http.get(`${BASE_URL}/me`, { ...auth, tags: { kind: "read", ep: "me" } });
    check(me, { "me → 200": (r) => r.status === 200 });

    const org = http.get(`${BASE_URL}/org/tree`, {
      ...auth,
      tags: { kind: "read", ep: "org-tree" },
    });
    check(org, { "org tree → 200": (r) => r.status === 200 });

    const dashboards = http.get(`${BASE_URL}/insights/dashboards/prebuilt`, {
      ...auth,
      tags: { kind: "read", ep: "dashboards" },
    });
    check(dashboards, { "dashboards → 200": (r) => r.status === 200 });
  });

  group("compute", () => {
    // An ad-hoc Insights report aggregates over the employee dataset — a realistic compute-heavy,
    // side-effect-free request to gauge throughput under load.
    const spec = JSON.stringify({
      dataset: "employees",
      dimensions: ["department"],
      measures: ["headcount"],
      sort: { key: "headcount", direction: "desc" },
      limit: 100,
    });
    const report = http.post(`${BASE_URL}/insights/reports/run`, spec, {
      headers: { ...auth.headers, "content-type": "application/json" },
      tags: { kind: "compute", ep: "report-run" },
    });
    check(report, { "report run → 200": (r) => r.status === 200 });
  });

  sleep(1);
}
