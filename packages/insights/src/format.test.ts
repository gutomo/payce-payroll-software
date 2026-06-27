import { describe, expect, it } from "vitest";
import { displayDimension, reportToCsv, reportToMatrix } from "./format";
import type { ReportResult } from "./result";

const result: ReportResult = {
  columns: [
    { key: "department", label: "Department", kind: "dimension", type: "string" },
    { key: "headcount", label: "Headcount", kind: "measure", unit: "count" },
  ],
  rows: [
    { department: "Engineering", headcount: 5 },
    { department: null, headcount: 2 },
    { department: "Finance, EU", headcount: 1 },
  ],
};

describe("displayDimension", () => {
  it("renders null and empty as a readable placeholder", () => {
    expect(displayDimension(null)).toBe("(none)");
    expect(displayDimension("")).toBe("(none)");
    expect(displayDimension("Engineering")).toBe("Engineering");
    expect(displayDimension(0)).toBe("0");
  });
});

describe("reportToCsv", () => {
  it("writes a header of labels and one row per record", () => {
    const csv = reportToCsv(result);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Department,Headcount");
    expect(lines[1]).toBe("Engineering,5");
    expect(lines).toHaveLength(4);
  });

  it("renders a null dimension as the placeholder", () => {
    const csv = reportToCsv(result);
    expect(csv.split("\r\n")[2]).toBe("(none),2");
  });

  it("escapes fields containing a comma per RFC 4180", () => {
    const csv = reportToCsv(result);
    expect(csv.split("\r\n")[3]).toBe('"Finance, EU",1');
  });
});

describe("reportToMatrix", () => {
  it("returns ordered header and string body cells", () => {
    const matrix = reportToMatrix(result);
    expect(matrix.header).toEqual(["Department", "Headcount"]);
    expect(matrix.body[1]).toEqual(["(none)", "2"]);
  });
});
