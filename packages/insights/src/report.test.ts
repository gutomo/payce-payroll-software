import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_LIMIT, parseReportSpec } from "./report";

describe("ReportSpecSchema", () => {
  it("applies defaults for dimensions, filters, and limit", () => {
    const parsed = parseReportSpec({ dataset: "employees", measures: ["headcount"] });
    expect(parsed.dimensions).toEqual([]);
    expect(parsed.filters).toEqual([]);
    expect(parsed.limit).toBe(DEFAULT_REPORT_LIMIT);
  });

  it("requires at least one measure", () => {
    expect(() => parseReportSpec({ dataset: "employees", measures: [] })).toThrow();
  });

  it("rejects an over-large limit", () => {
    expect(() =>
      parseReportSpec({ dataset: "employees", measures: ["headcount"], limit: 100_000 }),
    ).toThrow();
  });

  it("rejects unknown keys (strict)", () => {
    expect(() =>
      parseReportSpec({ dataset: "employees", measures: ["headcount"], rogue: true }),
    ).toThrow();
  });

  it("defaults a sort direction to asc", () => {
    const parsed = parseReportSpec({
      dataset: "employees",
      measures: ["headcount"],
      sort: { key: "headcount" },
    });
    expect(parsed.sort).toEqual({ key: "headcount", direction: "asc" });
  });

  it("accepts a list value only within bounds", () => {
    expect(() =>
      parseReportSpec({
        dataset: "employees",
        measures: ["headcount"],
        filters: [{ field: "department", op: "in", value: [] }],
      }),
    ).toThrow();
  });
});
