import { describe, expect, it } from "vitest";
import { IMPORT_COLUMNS, recordsToCsv } from "./csv";
import type { EmployeeImportRecord } from "./types";

const record: EmployeeImportRecord = {
  employeeNumber: "HCM-1-0001",
  firstName: "Alex",
  lastName: "Avery",
  hireDate: "2022-03-04",
  employmentType: "FULL_TIME",
  jobTitle: "Software Engineer",
  workEmail: "alex.avery.1@hcm.example",
};

describe("recordsToCsv", () => {
  it("emits a header row of the import columns followed by one row per record", () => {
    const csv = recordsToCsv([record, record]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(IMPORT_COLUMNS.join(","));
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it("leaves omitted optional columns as empty cells", () => {
    const [, row] = recordsToCsv([record]).split("\n");
    // Trailing department/location/manager columns are blank.
    expect(row?.endsWith(",,,")).toBe(true);
  });

  it("RFC-4180-quotes cells containing commas, quotes, or newlines", () => {
    const tricky: EmployeeImportRecord = {
      ...record,
      jobTitle: 'Engineer, "Senior"',
    };
    const csv = recordsToCsv([tricky]);
    expect(csv).toContain('"Engineer, ""Senior"""');
  });
});
