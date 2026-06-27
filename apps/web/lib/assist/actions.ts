"use server";

import { sendAssistMessage } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import { requireAccessToken } from "@/lib/auth/server";
import type { SendResult } from "./chat-state";

/**
 * Server action behind the Assist chat. The browser never holds the access token, so each turn is
 * sent to the API server-side; the API enforces the caller's `assist.use` permission and tenant
 * scope (RLS) and only ever reads the caller's own data. Returns the assistant's reply (or a friendly
 * error) for the client to append to the transcript.
 */
export async function sendAssistTurn(input: {
  message: string;
  conversationId?: string;
}): Promise<SendResult> {
  const message = input.message.trim();
  if (!message) return { ok: false, error: "Type a question first." };

  const token = await requireAccessToken();
  try {
    const res = await sendAssistMessage(token, {
      message,
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    });
    return {
      ok: true,
      conversationId: res.conversationId,
      reply: {
        role: "assistant",
        content: res.message.content,
        citations: res.message.citations ?? undefined,
        escalated: res.message.escalated,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isForbidden) return { ok: false, error: "You don't have access to Assist." };
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
