/**
 * Glue the kernel together: phrase a turn with the chosen {@link AssistProvider}, then apply the
 * escalation policy on top. The provider decides *what* to say and how confident it is; the policy
 * decides whether a human should also be looped in. Sensitive topics always escalate even when the
 * provider is confident, and an escalation appends a short hand-off line so the user knows help is
 * available. Pure: the only async edge is the (possibly remote) provider call.
 */
import { decideEscalation } from "./escalation";
import type { AssistProvider } from "./provider";
import type { AssistAnswer, ComposeInput, EscalationReason } from "./types";

const HANDOFF_LINES: Record<EscalationReason, string> = {
  sensitive_topic:
    "This looks like something best handled by a person — I've flagged it so a member of the team can follow up with you.",
  low_confidence: "I'm not fully sure, so I've flagged this for a member of the team to follow up.",
};

/**
 * Produce the final answer for a turn: compose with the provider, then layer the escalation verdict
 * (and hand-off message) on top. The returned {@link AssistAnswer} is what the API persists and
 * returns to the client.
 */
export async function runAssist(
  provider: AssistProvider,
  input: ComposeInput,
): Promise<AssistAnswer> {
  const answer = await provider.compose(input);
  const verdict = decideEscalation({ query: input.query, confidence: answer.confidence });

  const text = verdict.escalate
    ? `${answer.text}\n\n${HANDOFF_LINES[verdict.reason ?? "low_confidence"]}`
    : answer.text;

  return {
    text,
    confidence: answer.confidence,
    citations: answer.citations,
    usedTools: answer.usedTools,
    escalate: verdict.escalate,
    ...(verdict.reason ? { escalationReason: verdict.reason } : {}),
  };
}
