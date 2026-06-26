import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EmployeeProfile } from "@/lib/api/types";
import { ProfileCard } from "./profile-card";

const base: EmployeeProfile = {
  id: "1",
  employeeNumber: "E-0001",
  firstName: "Ada",
  lastName: "Lovelace",
  workEmail: "ada@demo.test",
  status: "ACTIVE",
  hireDate: "2021-03-05T00:00:00.000Z",
  terminationDate: null,
  department: { id: "d", name: "Engineering" },
  location: { id: "l", name: "HQ, New York" },
  costCenter: { id: "c", code: "CC-ENG", name: "Engineering Ops" },
  manager: { id: "m", employeeNumber: "E-0000", firstName: "Grace", lastName: "Hopper" },
};

describe("ProfileCard", () => {
  it("renders identity, status, and key fields", () => {
    render(<ProfileCard profile={base} />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("E-0001")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("ada@demo.test")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Mar 5, 2021")).toBeInTheDocument();
  });

  it("shows a hyphen for missing optional fields", () => {
    render(
      <ProfileCard
        profile={{
          ...base,
          workEmail: null,
          manager: null,
          department: null,
          location: null,
          costCenter: null,
        }}
      />,
    );
    // work email, manager, department, location, cost center → five unknown fields.
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(5);
  });

  it("does not render a termination row for active employees", () => {
    render(<ProfileCard profile={base} />);
    expect(screen.queryByText("Termination date")).not.toBeInTheDocument();
  });
});
