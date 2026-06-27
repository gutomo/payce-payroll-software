/**
 * Escalation policy: when should a turn be handed to a human instead of answered by the bot? Two
 * triggers (PLAN.md §5.4): the assistant is not confident enough, or the topic is sensitive (an
 * action with legal/financial/HR weight that L1 automation must not attempt). Pure and deterministic.
 */
import type { EscalationReason } from "./types";

/** Below this confidence the assistant should offer a human hand-off rather than guess. */
export const CONFIDENCE_ESCALATION_THRESHOLD = 0.35;

/**
 * Topics we never auto-handle: terminations, grievances, identity/banking changes, garnishments,
 * legal matters. Matched as whole tokens (see {@link isSensitive}) so "fired" triggers but
 * "configured" does not.
 */
const SENSITIVE_KEYWORDS = new Set([
  "terminate",
  "termination",
  "fired",
  "fire",
  "resign",
  "resignation",
  "quit",
  "redundancy",
  "redundant",
  "layoff",
  "grievance",
  "harassment",
  "harassed",
  "discrimination",
  "discriminated",
  "discriminate",
  "lawsuit",
  "legal",
  "garnish",
  "garnishment",
  "ssn",
  "passport",
  "lawyer",
  "dispute",
  "complaint",
]);

/** True when the question touches a sensitive topic (whole-token match, case-insensitive). */
export function isSensitive(query: string): boolean {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/);
  return tokens.some((token) => SENSITIVE_KEYWORDS.has(token));
}

export interface EscalationVerdict {
  escalate: boolean;
  reason?: EscalationReason;
}

/**
 * Decide whether to escalate. Sensitivity wins regardless of confidence (we don't want a confident
 * wrong answer on an HR matter); otherwise escalate only when confidence is below threshold.
 */
export function decideEscalation(input: { query: string; confidence: number }): EscalationVerdict {
  if (isSensitive(input.query)) return { escalate: true, reason: "sensitive_topic" };
  if (input.confidence < CONFIDENCE_ESCALATION_THRESHOLD) {
    return { escalate: true, reason: "low_confidence" };
  }
  return { escalate: false };
}
