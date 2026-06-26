import type { ReportSpec } from "./report";

/**
 * Prebuilt, code-defined dashboards. Each is a named report spec with a default visualisation. The
 * `key` is referenced by saved DashboardConfig layouts (see @payce/db). Specs here are catalog-valid
 * by construction; a unit test compiles every one to guarantee that stays true.
 */
export interface PrebuiltDashboard {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly chart: "bar" | "table";
  readonly spec: ReportSpec;
}

export const PREBUILT_DASHBOARDS: readonly PrebuiltDashboard[] = [
  {
    key: "headcount-by-department",
    title: "Headcount by department",
    description: "Active employees grouped by department.",
    chart: "bar",
    spec: {
      dataset: "employees",
      dimensions: ["department"],
      measures: ["headcount"],
      filters: [],
      sort: { key: "headcount", direction: "desc" },
      limit: 50,
    },
  },
  {
    key: "headcount-by-status",
    title: "Headcount by status",
    description: "Active, on-leave, and terminated employees.",
    chart: "bar",
    spec: {
      dataset: "employees",
      dimensions: ["status"],
      measures: ["headcount"],
      filters: [],
      sort: { key: "headcount", direction: "desc" },
      limit: 50,
    },
  },
  {
    key: "cost-by-department",
    title: "Cost to company by department",
    description: "Total annualised compensation (minor units) per department.",
    chart: "bar",
    spec: {
      dataset: "employees",
      dimensions: ["department"],
      measures: ["totalCompensationMinor"],
      filters: [],
      sort: { key: "totalCompensationMinor", direction: "desc" },
      limit: 50,
    },
  },
  {
    key: "leave-by-type",
    title: "Leave by type",
    description: "Leave requests and total days by leave type.",
    chart: "bar",
    spec: {
      dataset: "leave",
      dimensions: ["leaveType"],
      measures: ["requestCount", "totalDays"],
      filters: [],
      sort: { key: "requestCount", direction: "desc" },
      limit: 50,
    },
  },
];

export function getPrebuiltDashboard(key: string): PrebuiltDashboard | undefined {
  return PREBUILT_DASHBOARDS.find((d) => d.key === key);
}
