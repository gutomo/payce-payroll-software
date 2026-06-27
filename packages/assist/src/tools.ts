/**
 * Tool routing: decide which scoped data tools a question wants. Deterministic keyword matching, no
 * model call — the API then executes only the tools the caller is permitted to (its registry maps
 * each {@link ToolName} to an RBAC permission + an executor over a tenant-scoped service). Keeping
 * the routing here, pure, makes "which tool fires for this phrasing" unit-testable.
 */
import type { ToolName } from "./types";
import { tokenize } from "./knowledge";

/** A tool the assistant can offer, with the phrasings that trigger it. `description` is surfaced to
 *  the UI / model; `keywords` are matched against the tokenised query. */
export interface AssistToolDef {
  name: ToolName;
  description: string;
  keywords: string[];
}

/**
 * The tool catalog. Order matters: routing preserves it, so the most specific intents
 * (payslip before payday before generic pay) are listed in priority order.
 */
export const ASSIST_TOOLS: readonly AssistToolDef[] = [
  {
    name: "leave_balance",
    description: "The caller's remaining leave balance per leave type.",
    keywords: ["leave", "balance", "holiday", "holidays", "vacation", "pto", "days", "annual"],
  },
  {
    name: "leave_requests",
    description: "The status of the caller's own leave requests.",
    keywords: ["request", "requests", "application", "applied", "pending", "approved"],
  },
  {
    name: "claims_status",
    description: "The status of the caller's expense/reimbursement claims.",
    keywords: ["claim", "claims", "expense", "expenses", "reimburse", "reimbursement", "receipt"],
  },
  {
    name: "latest_payslip",
    description: "The caller's most recent published payslip.",
    keywords: ["payslip", "payslips", "stub", "slip", "net", "earnings"],
  },
  {
    name: "next_payday",
    description: "When the caller is next paid (their pay group's next pay date).",
    keywords: ["payday", "paid", "payment", "salary", "wage", "wages", "pay", "payroll"],
  },
  {
    name: "my_profile",
    description: "The caller's own employee profile (department, manager, employee number).",
    keywords: ["profile", "department", "manager", "designation", "details"],
  },
];

/**
 * Map a free-text question to the scoped tools it implies, in catalog (priority) order, de-duplicated.
 * A tool matches when any of its keywords appears among the query's tokens. Returns `[]` when the
 * question is purely informational (answered from knowledge) or unrelated.
 */
export function routeTools(query: string): ToolName[] {
  const tokens = new Set(tokenize(query));
  // "pay" appears in "payslip"/"payday"; tokenize already split those, so match on whole tokens only.
  const matched: ToolName[] = [];
  for (const tool of ASSIST_TOOLS) {
    if (tool.keywords.some((keyword) => tokens.has(keyword))) {
      matched.push(tool.name);
    }
  }
  return matched;
}
