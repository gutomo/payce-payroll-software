/**
 * `@payce/assist`, the pure Assist kernel (Phase 6). No I/O: it routes a question to scoped data
 * tools, ranks tenant knowledge articles lexically, phrases an answer through a pluggable provider
 * (deterministic {@link TemplateAssistProvider} by default; Amazon Bedrock in deployment), and
 * applies the escalation policy. Personal data enters only as tool results the API computes from
 * RBAC/RLS-scoped services, so the kernel can never widen a caller's scope or cross tenants.
 */

export type {
  AssistAnswer,
  AssistRole,
  Citation,
  ComposeInput,
  EscalationReason,
  KnowledgeArticle,
  RetrievedArticle,
  ToolName,
  ToolResult,
} from "./types";
export { TOOL_NAMES } from "./types";
export { retrieve, tokenize } from "./knowledge";
export { ASSIST_TOOLS, type AssistToolDef, routeTools } from "./tools";
export {
  CONFIDENCE_ESCALATION_THRESHOLD,
  decideEscalation,
  type EscalationVerdict,
  isSensitive,
} from "./escalation";
export { redactPii } from "./redact";
export type { AssistProvider, ProviderAnswer } from "./provider";
export { KNOWLEDGE_ANSWER_FLOOR, TemplateAssistProvider } from "./template-provider";
export { runAssist } from "./orchestrate";
