/**
 * Shared domain types for the Assist kernel. The kernel is pure (no I/O): the API fetches the
 * caller's scoped data and tenant knowledge, hands them here, and gets back a phrased answer plus a
 * confidence/escalation verdict. Personal data only ever enters through {@link ToolResult.data}
 * (computed by the API from RBAC-scoped, RLS-bound services), never invented by the kernel.
 */

/** A conversational turn's author. */
export type AssistRole = "user" | "assistant";

/**
 * A tenant knowledge/FAQ/policy document the assistant can answer from (RAG source). Synthetic,
 * original copy only (golden rule 1/2). The kernel scores these lexically; it never stores them.
 */
export interface KnowledgeArticle {
  id: string;
  title: string;
  body: string;
  category?: string;
  tags?: string[];
}

/** A knowledge article matched to a query, with its relevance score in [0, 1]. */
export interface RetrievedArticle {
  article: KnowledgeArticle;
  score: number;
}

/**
 * The scoped data tools Assist can invoke. Each maps (in the API's registry) to a required RBAC
 * permission and an executor that calls an existing tenant-scoped service with the caller's
 * principal — so a tool can never read another tenant's or another user's data.
 */
export type ToolName =
  | "leave_balance"
  | "leave_requests"
  | "next_payday"
  | "latest_payslip"
  | "claims_status"
  | "my_profile";

export const TOOL_NAMES: readonly ToolName[] = [
  "leave_balance",
  "leave_requests",
  "next_payday",
  "latest_payslip",
  "claims_status",
  "my_profile",
] as const;

/** The outcome of executing one scoped tool. `summary` is a short, already-phrased fact the provider
 *  can weave into prose; `data` is the structured payload for clients that want it. */
export interface ToolResult {
  tool: ToolName;
  /** True when the tool ran and produced an answer; false when denied, not-applicable, or errored. */
  ok: boolean;
  /** One-sentence, PII-light phrasing of the result (e.g. "You have 18 days of Annual Leave left"). */
  summary?: string;
  /** Structured result for the UI; JSON-serialisable. */
  data?: unknown;
  /** Machine-readable reason when `ok` is false: e.g. "forbidden", "no_profile", "not_found". */
  error?: string;
}

/** A source attribution returned alongside an answer so the UI can show "answered from <doc>". */
export interface Citation {
  articleId: string;
  title: string;
}

/** What the kernel needs to phrase a turn: the question plus everything the API gathered for it. */
export interface ComposeInput {
  query: string;
  retrieved: RetrievedArticle[];
  toolResults: ToolResult[];
}

/** A composed assistant turn. `confidence` is in [0, 1]; `escalate` is set by the escalation policy. */
export interface AssistAnswer {
  text: string;
  confidence: number;
  escalate: boolean;
  escalationReason?: EscalationReason;
  citations: Citation[];
  usedTools: ToolName[];
}

/** Why a turn was flagged for human follow-up. */
export type EscalationReason = "low_confidence" | "sensitive_topic";
