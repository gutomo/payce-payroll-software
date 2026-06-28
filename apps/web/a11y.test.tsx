/**
 * Accessibility regression tests (Phase 7). Renders representative surfaces and asserts no WCAG 2.1
 * A/AA violations via axe-core. Colour-contrast is disabled because jsdom has no layout engine to
 * compute it; structural rules (names, roles, labels, ARIA, headings) are fully checked here, and
 * contrast is handled by using AA-compliant tokens in the components.
 */
import axe from "axe-core";
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(marketing)/page";
import { AppHeader } from "@/components/app/app-header";
import { ProfileCard } from "@/components/app/profile-card";
import { GuidedTour } from "@/components/demo/guided-tour";
import type { EmployeeProfile, Me } from "@/lib/api/types";
import { getTour } from "@/lib/demo/tours";

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  if (results.violations.length > 0) {
    const summary = results.violations
      .map((v) => `${v.id}: ${v.help} — ${v.nodes.length} node(s)`)
      .join("\n");
    throw new Error(`axe found ${results.violations.length} violation(s):\n${summary}`);
  }
  expect(results.violations).toEqual([]);
}

const me: Me = {
  id: "u1",
  tenantId: "t1",
  email: "ada@demo.test",
  displayName: "Ada Lovelace",
  status: "ACTIVE",
  roles: ["tenant_admin"],
  permissions: ["org.employee.read", "insights.report.read", "assist.use"],
};

const profile: EmployeeProfile = {
  id: "1",
  employeeNumber: "E-0001",
  firstName: "Ada",
  lastName: "Lovelace",
  workEmail: "ada@demo.test",
  status: "ACTIVE",
  hireDate: "2024-01-01",
  terminationDate: null,
  department: { id: "d1", name: "Engineering" },
  location: { id: "l1", name: "Remote" },
  costCenter: { id: "c1", code: "CC-ENG", name: "Engineering" },
  manager: { id: "m1", employeeNumber: "E-0002", firstName: "Sam", lastName: "Rivera" },
};

describe("accessibility (axe, WCAG 2.1 A/AA)", () => {
  beforeAll(() => {
    // jsdom doesn't implement scrollIntoView, which the guided tour calls on open.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("marketing home page has no violations", async () => {
    const { container } = render(<HomePage />);
    await expectNoViolations(container);
  });

  it("authenticated app header has no violations", async () => {
    const { container } = render(<AppHeader me={me} locale="en-US" />);
    await expectNoViolations(container);
  });

  it("MyHR profile card has no violations", async () => {
    const { container } = render(<ProfileCard profile={profile} locale="en-US" />);
    await expectNoViolations(container);
  });

  it("guided-tour dialog has an accessible name and no violations", async () => {
    const tour = getTour("myhr");
    if (!tour) throw new Error("expected the myhr tour");
    const { container, getByRole } = render(<GuidedTour tour={tour} />);
    expect(getByRole("dialog")).toHaveAccessibleName(tour.steps[0]?.title ?? "");
    await expectNoViolations(container);
  });
});
