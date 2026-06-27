/**
 * The LLM provider abstraction (PLAN.md §5.4 / §6.1). A provider turns the gathered context — the
 * question, retrieved knowledge snippets, and scoped tool results — into phrased prose plus a
 * self-assessed confidence. Amazon Bedrock is the default in deployment; the kernel ships a pure
 * {@link TemplateAssistProvider} so dev/test/CI run offline and deterministically. Either way the
 * factual content comes from {@link ComposeInput} (RBAC/RLS-scoped data), never from model recall —
 * so swapping providers can change phrasing but can never leak another tenant's or user's data.
 */
import type { Citation, ComposeInput, ToolName } from "./types";

/** A provider's phrasing of a turn, before the escalation policy is applied (see orchestrate.ts). */
export interface ProviderAnswer {
  text: string;
  /** The provider's confidence the answer is correct and grounded, in [0, 1]. */
  confidence: number;
  citations: Citation[];
  usedTools: ToolName[];
}

export interface AssistProvider {
  /** Stable identifier for telemetry (e.g. "template", "bedrock"). */
  readonly name: string;
  compose(input: ComposeInput): Promise<ProviderAnswer> | ProviderAnswer;
}
