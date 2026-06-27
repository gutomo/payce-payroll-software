import { describe, expect, it } from "vitest";
import { compileReport, ReportCompileError } from "./compile";
import { parseReportSpec, type ReportSpec } from "./report";

function spec(overrides: Partial<ReportSpec>): ReportSpec {
  return parseReportSpec({
    dataset: "employees",
    dimensions: ["department"],
    measures: ["headcount"],
    ...overrides,
  });
}

describe("compileReport — happy path", () => {
  it("compiles headcount by department into grouped, ordered SQL", () => {
    const plan = compileReport(spec({ sort: { key: "headcount", direction: "desc" }, limit: 50 }));

    expect(plan.sql).toContain('dept.name AS "d0"');
    expect(plan.sql).toContain('COUNT(DISTINCT e.id) AS "m0"');
    expect(plan.sql).toContain('FROM "employee" e');
    expect(plan.sql).toContain("WHERE e.deleted_at IS NULL");
    expect(plan.sql).toContain("GROUP BY dept.name");
    expect(plan.sql).toContain('ORDER BY "m0" DESC');
    expect(plan.sql).toContain("LIMIT 50");
    expect(plan.params).toEqual([]);
    expect(plan.columns).toEqual([
      { key: "department", label: "Department", kind: "dimension", type: "string", alias: "d0" },
      { key: "headcount", label: "Headcount", kind: "measure", unit: "count", alias: "m0" },
    ]);
  });

  it("supports a grand-total report with no dimensions (no GROUP BY)", () => {
    const plan = compileReport(spec({ dimensions: [], measures: ["headcount"] }));
    expect(plan.sql).not.toContain("GROUP BY");
    expect(plan.sql).toContain('ORDER BY "m0" DESC');
    expect(plan.columns).toHaveLength(1);
  });

  it("appends a deterministic tiebreaker on the first dimension", () => {
    const plan = compileReport(spec({ sort: { key: "headcount", direction: "desc" } }));
    expect(plan.sql).toContain('ORDER BY "m0" DESC, "d0" ASC');
  });

  it("defaults ordering to the first measure descending when no sort is given", () => {
    const plan = compileReport(spec({ sort: undefined }));
    expect(plan.sql).toContain('ORDER BY "m0" DESC, "d0" ASC');
  });

  it("clamps to the parsed default limit", () => {
    const plan = compileReport(spec({}));
    expect(plan.sql).toContain("LIMIT 100");
  });
});

describe("compileReport — filters bind values as parameters", () => {
  it("emits an equality filter as a bound parameter, never inline SQL", () => {
    const plan = compileReport(spec({ filters: [{ field: "status", op: "eq", value: "ACTIVE" }] }));
    expect(plan.sql).toContain("e.status::text = $1");
    expect(plan.params).toEqual(["ACTIVE"]);
  });

  it("expands an `in` filter into one placeholder per value", () => {
    const plan = compileReport(
      spec({ filters: [{ field: "department", op: "in", value: ["Eng", "Finance"] }] }),
    );
    expect(plan.sql).toContain("dept.name IN ($1, $2)");
    expect(plan.params).toEqual(["Eng", "Finance"]);
  });

  it("binds a `contains` operand instead of concatenating it into the query text", () => {
    const plan = compileReport(
      spec({ filters: [{ field: "department", op: "contains", value: "eng" }] }),
    );
    expect(plan.sql).toContain("dept.name ILIKE '%' || $1 || '%'");
    expect(plan.params).toEqual(["eng"]);
  });

  it("keeps a SQL-injection attempt inert as a parameter (no identifier leak)", () => {
    const evil = "'; DROP TABLE employee; --";
    const plan = compileReport(spec({ filters: [{ field: "department", op: "eq", value: evil }] }));
    // The payload appears only in params, never in the SQL string.
    expect(plan.sql).not.toContain("DROP TABLE");
    expect(plan.sql).toContain("dept.name = $1");
    expect(plan.params).toEqual([evil]);
  });
});

describe("compileReport — catalog validation rejects unknown / illegal input", () => {
  it("rejects an unknown dataset", () => {
    expect(() => compileReport(spec({ dataset: "secrets" }))).toThrowError(ReportCompileError);
    expect(() => compileReport(spec({ dataset: "secrets" }))).toThrowError(/Unknown dataset/);
  });

  it("rejects an unknown dimension", () => {
    expect(() => compileReport(spec({ dimensions: ["ssn"] }))).toThrowError(/Unknown dimension/);
  });

  it("rejects an unknown measure", () => {
    expect(() => compileReport(spec({ measures: ["salary"] }))).toThrowError(/Unknown measure/);
  });

  it("rejects an unknown filter field", () => {
    expect(() =>
      compileReport(spec({ filters: [{ field: "ssn", op: "eq", value: "x" }] })),
    ).toThrowError(/Unknown filter field/);
  });

  it("rejects an operator illegal for the field type (contains on an enum)", () => {
    expect(() =>
      compileReport(spec({ filters: [{ field: "status", op: "contains", value: "AC" }] })),
    ).toThrowError(/not allowed/);
  });

  it("rejects a sort key that is not a selected dimension or measure", () => {
    expect(() =>
      compileReport(spec({ sort: { key: "avgCompensationMinor", direction: "asc" } })),
    ).toThrowError(/not a selected/);
  });

  it("carries a machine-readable code on the error", () => {
    try {
      compileReport(spec({ measures: ["salary"] }));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ReportCompileError);
      expect((err as ReportCompileError).code).toBe("UNKNOWN_MEASURE");
    }
  });
});
