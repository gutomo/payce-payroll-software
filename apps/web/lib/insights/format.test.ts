import { describe, expect, it } from "vitest";
import type { ReportResult } from "@/lib/api/types";
import { displayDimension, formatCell, formatMeasure, rowKey, toBars } from "./format";

const RESULT: ReportResult = {
  columns: [
    { key: "department", label: "Department", kind: "dimension", type: "string" },
    { key: "headcount", label: "Headcount", kind: "measure", unit: "count" },
  ],
  rows: [
    { department: "Engineering", headcount: 40 },
    { department: "Sales", headcount: 10 },
    { department: null, headcount: 0 },
  ],
};

describe("displayDimension", () => {
  it("renders a placeholder for null/empty groups", () => {
    expect(displayDimension(null)).toBe("(none)");
    expect(displayDimension("")).toBe("(none)");
    expect(displayDimension("Engineering")).toBe("Engineering");
  });
});

describe("formatMeasure", () => {
  it("formats counts with thousands separators", () => {
    expect(formatMeasure(12345, "count")).toBe("12,345");
  });

  it("formats currency minor units as major units with two decimals", () => {
    expect(formatMeasure(123456, "currency_minor")).toBe("1,234.56");
    expect(formatMeasure(null, "currency_minor")).toBe("0.00");
  });

  it("formats days", () => {
    expect(formatMeasure(7.5, "days")).toBe("7.5");
  });
});

describe("formatCell", () => {
  it("uses the dimension placeholder rule for dimension columns", () => {
    const col = RESULT.columns[0]!;
    expect(formatCell(null, col)).toBe("(none)");
  });

  it("formats a measure cell by its unit", () => {
    const col = RESULT.columns[1]!;
    expect(formatCell(1000, col)).toBe("1,000");
  });
});

describe("toBars", () => {
  it("builds bars for the first measure across the first dimension, scaled to the max", () => {
    const bars = toBars(RESULT);
    expect(bars).toEqual([
      { label: "Engineering", value: "40", ratio: 1 },
      { label: "Sales", value: "10", ratio: 0.25 },
      { label: "(none)", value: "0", ratio: 0 },
    ]);
  });

  it("returns no bars when there is no measure", () => {
    expect(toBars({ columns: [], rows: [] })).toEqual([]);
  });

  it("labels by the measure when the report has no dimensions (grand total)", () => {
    const total: ReportResult = {
      columns: [{ key: "headcount", label: "Headcount", kind: "measure", unit: "count" }],
      rows: [{ headcount: 99 }],
    };
    expect(toBars(total)).toEqual([{ label: "Headcount", value: "99", ratio: 1 }]);
  });
});

describe("rowKey", () => {
  it("joins dimension values, or returns 'total' when ungrouped", () => {
    expect(rowKey(RESULT, RESULT.rows[0]!)).toBe("Engineering");
    expect(rowKey({ columns: [], rows: [] }, {})).toBe("total");
  });
});
