import { describe, expect, it } from "vitest";
import { compileReport } from "./compile";
import { getPrebuiltDashboard, PREBUILT_DASHBOARDS } from "./dashboards";
import { parseReportSpec } from "./report";

describe("prebuilt dashboards", () => {
  it("expose unique keys", () => {
    const keys = PREBUILT_DASHBOARDS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(PREBUILT_DASHBOARDS.map((d) => [d.key, d] as const))(
    "'%s' has a catalog-valid spec that compiles",
    (_key, dashboard) => {
      // Round-trips through the schema, then compiles against the catalog without throwing.
      const parsed = parseReportSpec(dashboard.spec);
      expect(() => compileReport(parsed)).not.toThrow();
    },
  );

  it("are retrievable by key", () => {
    expect(getPrebuiltDashboard("headcount-by-department")?.title).toBe("Headcount by department");
    expect(getPrebuiltDashboard("nope")).toBeUndefined();
  });
});
