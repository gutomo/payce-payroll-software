import { describe, expect, it } from "vitest";
import { ASSIST_TOOLS, routeTools } from "./tools";
import { TOOL_NAMES } from "./types";

describe("ASSIST_TOOLS catalog", () => {
  it("covers every declared tool name exactly once", () => {
    const names = ASSIST_TOOLS.map((tool) => tool.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
  });
});

describe("routeTools", () => {
  it("routes a leave-balance question to the leave_balance tool", () => {
    expect(routeTools("what's my leave balance?")).toContain("leave_balance");
  });

  it("routes a payday question to next_payday", () => {
    expect(routeTools("when is payday?")).toContain("next_payday");
  });

  it("routes a payslip question to latest_payslip and not next_payday", () => {
    const tools = routeTools("can I see my latest payslip?");
    expect(tools).toContain("latest_payslip");
    expect(tools).not.toContain("next_payday");
  });

  it("routes a claims question to claims_status", () => {
    expect(routeTools("what's the status of my expense claim?")).toContain("claims_status");
  });

  it("returns tools in catalog (priority) order, de-duplicated", () => {
    const tools = routeTools("my leave balance and my payslip");
    expect(tools).toEqual(["leave_balance", "latest_payslip"]);
  });

  it("returns no tools for a purely informational question", () => {
    expect(routeTools("what is the company dress code?")).toEqual([]);
  });
});
