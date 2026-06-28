import type { AssistCitation } from "@/lib/api/types";

/**
 * Client-side chat shapes for Assist. Kept out of the "use server" actions module (which may only
 * export async functions) so the client component and the action can share them.
 */

export interface AssistTurn {
  role: "user" | "assistant";
  content: string;
  citations?: AssistCitation[];
  escalated?: boolean;
}

export type SendResult =
  | { ok: true; conversationId: string; reply: AssistTurn }
  | { ok: false; error: string };

/** A few starter questions surfaced when the chat is empty. */
export const STARTER_PROMPTS = [
  "What's my leave balance?",
  "When is payday?",
  "How do I apply for a claim?",
  "Where can I find my payslips?",
] as const;
