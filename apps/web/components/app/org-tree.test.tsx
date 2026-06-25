import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OrgNode } from "@/lib/api/types";
import { OrgTree } from "./org-tree";

const tree: OrgNode[] = [
  {
    id: "1",
    employeeNumber: "E-0001",
    name: "Ada Manager",
    reports: [
      { id: "2", employeeNumber: "E-0002", name: "Grace Report", reports: [] },
      { id: "3", employeeNumber: "E-0003", name: "Alan Report", reports: [] },
    ],
  },
];

describe("OrgTree", () => {
  it("renders managers, reports, and employee numbers", () => {
    render(<OrgTree nodes={tree} />);
    expect(screen.getByText("Ada Manager")).toBeInTheDocument();
    expect(screen.getByText("Grace Report")).toBeInTheDocument();
    expect(screen.getByText("Alan Report")).toBeInTheDocument();
    expect(screen.getByText("E-0001")).toBeInTheDocument();
  });

  it("nests reports under their manager", () => {
    render(<OrgTree nodes={tree} />);
    const manager = screen.getByText("Ada Manager").closest('[role="treeitem"]');
    expect(manager).not.toBeNull();
    const group = within(manager as HTMLElement).getByRole("group");
    expect(within(group).getByText("Grace Report")).toBeInTheDocument();
    expect(within(group).getByText("Alan Report")).toBeInTheDocument();
  });

  it("shows a pluralized report count for managers", () => {
    render(<OrgTree nodes={tree} />);
    expect(screen.getByText("2 reports")).toBeInTheDocument();
  });

  it("renders an empty state when there are no nodes", () => {
    render(<OrgTree nodes={[]} />);
    expect(screen.getByText("No employees to display.")).toBeInTheDocument();
  });
});
