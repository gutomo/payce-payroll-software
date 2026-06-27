import { describe, expect, it } from "vitest";
import type { ReportResult, ReportSchedule } from "@/lib/api/types";
import {
  describeSchedule,
  displayDimension,
  formatCell,
  formatMeasure,
  formatRunAt,
  parseRecipients,
  rowKey,
  toBars,
} from "./format";

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

const SCHEDULE: ReportSchedule = {
  id: "s1",
  reportDefinitionId: "r1",
  cadence: "DAILY",
  format: "XLSX",
  hourUtc: 6,
  recipients: ["people-ops@demo.test"],
  isActive: true,
  nextRunAt: "2026-06-28T06:00:00.000Z",
  lastRunAt: null,
  createdAt: "2026-06-27T00:00:00.000Z",
  updatedAt: "2026-06-27T00:00:00.000Z",
};

describe("parseRecipients", () => {
  it("splits on commas, semicolons, and whitespace, trims, and de-duplicates", () => {
    expect(parseRecipients("a@demo.test, b@demo.test\n  a@demo.test ;c@demo.test")).toEqual([
      "a@demo.test",
      "b@demo.test",
      "c@demo.test",
    ]);
  });

  it("returns an empty list for blank input", () => {
    expect(parseRecipients("   \n  ")).toEqual([]);
  });
});

describe("describeSchedule", () => {
  it("summarises cadence, hour, format, and recipient count", () => {
    expect(describeSchedule(SCHEDULE)).toBe("Daily at 06:00 UTC · XLSX · 1 recipient");
  });

  it("pluralises recipients and pads the hour", () => {
    expect(
      describeSchedule({
        ...SCHEDULE,
        cadence: "WEEKLY",
        format: "CSV",
        hourUtc: 14,
        recipients: ["a@demo.test", "b@demo.test"],
      }),
    ).toBe("Weekly at 14:00 UTC · CSV · 2 recipients");
  });
});

describe("formatRunAt", () => {
  it("renders an ISO instant as a readable UTC time regardless of host timezone", () => {
    expect(formatRunAt("2026-06-28T06:00:00.000Z")).toBe("28 Jun 2026, 06:00 UTC");
  });
});
