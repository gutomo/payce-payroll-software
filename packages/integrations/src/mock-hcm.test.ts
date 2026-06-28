import { describe, expect, it } from "vitest";
import { MOCK_HCM } from "./mock-hcm";
import { hashSeed } from "./seed";

describe("MOCK_HCM connector", () => {
  it("generates the requested number of records", () => {
    expect(MOCK_HCM.fetchEmployees({ seed: 1, count: 25 })).toHaveLength(25);
    expect(MOCK_HCM.fetchEmployees({ seed: 1, count: 0 })).toHaveLength(0);
  });

  it("is deterministic for a given seed", () => {
    const a = MOCK_HCM.fetchEmployees({ seed: 42, count: 10 });
    const b = MOCK_HCM.fetchEmployees({ seed: 42, count: 10 });
    expect(a).toEqual(b);
  });

  it("produces distinct employee numbers across seeds and within a batch", () => {
    const batch = MOCK_HCM.fetchEmployees({ seed: 7, count: 50 });
    expect(new Set(batch.map((r) => r.employeeNumber)).size).toBe(50);

    const other = MOCK_HCM.fetchEmployees({ seed: 8, count: 50 });
    const overlap = new Set(batch.map((r) => r.employeeNumber));
    expect(other.some((r) => overlap.has(r.employeeNumber))).toBe(false);
  });

  it("emits import-ready, self-contained rows (valid dates, emails, enum types; no refs)", () => {
    for (const r of MOCK_HCM.fetchEmployees({ seed: 3, count: 30 })) {
      expect(r.hireDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.workEmail).toMatch(/^[a-z0-9.]+@hcm\.example$/);
      expect(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]).toContain(r.employmentType);
      expect(r.jobTitle.length).toBeGreaterThan(0);
      // No ref fields that the import would need to resolve.
      expect(r.departmentName).toBeUndefined();
      expect(r.managerEmployeeNumber).toBeUndefined();
    }
  });

  it("works with a seed derived from an idempotency key", () => {
    const seed = hashSeed("integration-123:run-key-abc");
    expect(MOCK_HCM.fetchEmployees({ seed, count: 5 })).toHaveLength(5);
  });
});
