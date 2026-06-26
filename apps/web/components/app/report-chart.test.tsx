import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReportResult } from "@/lib/api/types";
import { ReportChart } from "./report-chart";

const RESULT: ReportResult = {
  columns: [
    { key: "department", label: "Department", kind: "dimension", type: "string" },
    { key: "headcount", label: "Headcount", kind: "measure", unit: "count" },
  ],
  rows: [
    { department: "Engineering", headcount: 40 },
    { department: "Sales", headcount: 10 },
  ],
};

describe("ReportChart", () => {
  it("renders a row per group with formatted measures, in both chart and table", () => {
    render(<ReportChart result={RESULT} />);
    // Bars + table both carry the labels; the measure header appears once in the table head.
    expect(screen.getAllByText("Engineering").length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Headcount" })).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("40")).toBeInTheDocument();
  });

  it("scales the largest bar to full width", () => {
    const { container } = render(<ReportChart result={RESULT} />);
    const fills = container.querySelectorAll<HTMLElement>(".bg-brand-600");
    expect(fills[0]?.style.width).toBe("100%");
    expect(fills[1]?.style.width).toBe("25%");
  });

  it("omits the bar chart but keeps the table when chart='table'", () => {
    const { container } = render(<ReportChart result={RESULT} chart="table" />);
    expect(container.querySelectorAll(".bg-brand-600")).toHaveLength(0);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows an empty state when there are no rows", () => {
    render(<ReportChart result={{ columns: RESULT.columns, rows: [] }} />);
    expect(screen.getByText("No data")).toBeInTheDocument();
  });
});
