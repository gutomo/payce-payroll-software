/**
 * The deterministic, offline {@link AssistProvider}. It phrases an answer by precedence:
 *   1. a scoped tool produced a fact  → answer from the tool summaries (highest confidence),
 *   2. otherwise a knowledge article matched → answer from its snippet, with a citation,
 *   3. otherwise a relevant tool failed → explain why we couldn't look it up,
 *   4. otherwise → admit we don't know and invite a hand-off.
 * Because the factual content is always the tool/knowledge input (never invented), this provider is
 * safe to ground the AC test on and doubles as the production fallback when Bedrock is unconfigured.
 */
import type { AssistProvider, ProviderAnswer } from "./provider";
import type { Citation, ComposeInput, RetrievedArticle, ToolResult } from "./types";

/** Minimum retrieval score at which we'll answer from a knowledge article rather than give up. */
export const KNOWLEDGE_ANSWER_FLOOR = 0.25;

const CONFIDENCE = {
  tool: 0.92,
  toolFailure: 0.3,
  unknown: 0.1,
} as const;

export class TemplateAssistProvider implements AssistProvider {
  readonly name = "template";

  compose(input: ComposeInput): ProviderAnswer {
    const answered = input.toolResults.filter((result) => result.ok && result.summary);
    if (answered.length > 0) {
      return {
        text: joinSummaries(answered),
        confidence: CONFIDENCE.tool,
        citations: [],
        usedTools: answered.map((result) => result.tool),
      };
    }

    const top = input.retrieved[0];
    if (top && top.score >= KNOWLEDGE_ANSWER_FLOOR) {
      return {
        text: answerFromArticle(top),
        // Scale into [0.4, 0.85] so a decent match clears the escalation threshold but a weak one
        // (just above the floor) still reads as tentative.
        confidence: Math.min(0.85, 0.4 + top.score * 0.5),
        citations: [citation(top)],
        usedTools: [],
      };
    }

    const failed = input.toolResults.find((result) => !result.ok);
    if (failed) {
      return {
        text: explainFailure(failed),
        confidence: CONFIDENCE.toolFailure,
        citations: [],
        usedTools: [],
      };
    }

    return {
      text: "I'm not sure about that yet, but I can connect you with someone on the team who can help.",
      confidence: CONFIDENCE.unknown,
      citations: [],
      usedTools: [],
    };
  }
}

function joinSummaries(results: ToolResult[]): string {
  return results.map((result) => result.summary).join(" ");
}

function answerFromArticle(match: RetrievedArticle): string {
  return `${snippet(match.article.body)}\n\nSource: ${match.article.title}`;
}

function citation(match: RetrievedArticle): Citation {
  return { articleId: match.article.id, title: match.article.title };
}

const FAILURE_MESSAGES: Record<string, string> = {
  forbidden: "You don't have access to that information, so I can't look it up for you.",
  no_profile:
    "I couldn't find an employee profile linked to your account, so I can't look that up. An administrator can link it for you.",
  not_found: "I couldn't find any records for that yet.",
};

function explainFailure(result: ToolResult): string {
  return (
    FAILURE_MESSAGES[result.error ?? "not_found"] ??
    "I wasn't able to look that up just now. Let me connect you with someone who can help."
  );
}

const MAX_SNIPPET_SENTENCES = 2;
const MAX_SNIPPET_CHARS = 360;

/** Take the first sentence or two of an article body, trimmed to a readable length. */
function snippet(body: string): string {
  const text = body.trim().replace(/\s+/g, " ");
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .slice(0, MAX_SNIPPET_SENTENCES)
    .join(" ");
  if (sentences.length <= MAX_SNIPPET_CHARS) return sentences;
  return `${sentences.slice(0, MAX_SNIPPET_CHARS).trimEnd()}…`;
}
