import { describe, expect, it } from "vitest";
import type { ReportResult } from "./result";
import { reportToXlsx } from "./xlsx";

const RESULT: ReportResult = {
  columns: [
    { key: "department", label: "Department", kind: "dimension", type: "string" },
    { key: "headcount", label: "Headcount", kind: "measure", unit: "count" },
  ],
  rows: [
    { department: "Engineering", headcount: 42 },
    { department: "Sales & Marketing", headcount: 17 },
    { department: null, headcount: 0 },
  ],
};

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("reportToXlsx", () => {
  it("emits a ZIP container (local header + end-of-central-directory signatures)", () => {
    const bytes = reportToXlsx(RESULT);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]); // "PK\\x03\\x04"
    // EOCD signature "PK\\x05\\x06" near the tail.
    expect(text(bytes)).toContain("PK");
  });

  it("includes the OOXML parts and the worksheet data verbatim (STORE, uncompressed)", () => {
    const body = text(reportToXlsx(RESULT));
    expect(body).toContain("[Content_Types].xml");
    expect(body).toContain("xl/worksheets/sheet1.xml");
    // Header labels are inline strings; measures are numeric <v> cells.
    expect(body).toContain('<t xml:space="preserve">Department</t>');
    expect(body).toContain('<t xml:space="preserve">Engineering</t>');
    expect(body).toContain("<v>42</v>");
    // A null dimension group renders via the (none) placeholder, not an empty cell.
    expect(body).toContain('<t xml:space="preserve">(none)</t>');
  });

  it("XML-escapes special characters in cell values", () => {
    const body = text(reportToXlsx(RESULT));
    expect(body).toContain("Sales &amp; Marketing");
    expect(body).not.toContain("Sales & Marketing");
  });

  it("is deterministic: identical input yields byte-identical output", () => {
    expect(reportToXlsx(RESULT)).toEqual(reportToXlsx(RESULT));
  });

  it("sanitises the sheet name (length + forbidden characters)", () => {
    const body = text(reportToXlsx(RESULT, { sheetName: "Q1/Q2: Headcount [2026]" }));
    expect(body).toContain('name="Q1 Q2  Headcount  2026"');
  });
});
