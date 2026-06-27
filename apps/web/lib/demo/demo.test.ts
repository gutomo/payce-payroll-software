import { describe, expect, it } from "vitest";
import { toBars } from "./chart";
import { demoHeadcountByDept, type DemoMetricRow, sumMetric } from "./fixtures";
import { tooltipPosition } from "./tour-position";
import { getTour, TOURS } from "./tours";

describe("tours", () => {
  it("defines the MyHR and Insights starter tours", () => {
    expect(TOURS.map((t) => t.id).sort()).toEqual(["insights", "myhr"]);
  });

  it("every step targets a data-tour selector and has copy", () => {
    for (const tour of TOURS) {
      expect(tour.steps.length).toBeGreaterThan(0);
      for (const step of tour.steps) {
        expect(step.target).toMatch(/^\[data-tour="[a-z-]+"\]$/);
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body.length).toBeGreaterThan(0);
      }
    }
  });

  it("getTour resolves by id and returns undefined for unknown", () => {
    expect(getTour("myhr")?.path).toBe("/demo/myhr");
    expect(getTour("nope")).toBeUndefined();
  });
});

describe("fixtures + chart", () => {
  it("sums metric rows", () => {
    expect(sumMetric(demoHeadcountByDept)).toBe(65);
    expect(sumMetric([])).toBe(0);
  });

  it("sizes bars relative to the largest value", () => {
    const rows: DemoMetricRow[] = [
      { department: "A", value: 10 },
      { department: "B", value: 5 },
    ];
    const bars = toBars(rows);
    expect(bars[0]).toMatchObject({ label: "A", value: 10, pct: 100 });
    expect(bars[1]?.pct).toBe(50);
  });

  it("handles an all-zero series without dividing by zero", () => {
    const bars = toBars([{ department: "A", value: 0 }]);
    expect(bars[0]?.pct).toBe(0);
  });
});

describe("tooltipPosition", () => {
  const viewport = { width: 1000, height: 800 };
  const tooltip = { width: 280, height: 120 };

  it("keeps the preferred side when it fits", () => {
    const target = { top: 400, left: 400, width: 100, height: 40 };
    const pos = tooltipPosition(target, tooltip, viewport, "bottom");
    expect(pos.placement).toBe("bottom");
    expect(pos.top).toBe(400 + 40 + 12);
  });

  it("flips to the opposite side when the preferred side overflows", () => {
    // Target near the bottom edge: "bottom" can't fit, so it flips to "top".
    const target = { top: 760, left: 400, width: 100, height: 40 };
    const pos = tooltipPosition(target, tooltip, viewport, "bottom");
    expect(pos.placement).toBe("top");
  });

  it("clamps the tooltip within the viewport", () => {
    const target = { top: 10, left: 980, width: 20, height: 20 };
    const pos = tooltipPosition(target, tooltip, viewport, "right");
    expect(pos.left).toBeLessThanOrEqual(viewport.width - tooltip.width - 12);
    expect(pos.left).toBeGreaterThanOrEqual(12);
    expect(pos.top).toBeGreaterThanOrEqual(12);
  });
});
