"use client";

import { useRef, useState, useTransition } from "react";
import { buttonClasses } from "@/components/ui/button";
import { sendAssistTurn } from "@/lib/assist/actions";
import { type AssistTurn, STARTER_PROMPTS } from "@/lib/assist/chat-state";

/**
 * The Assist chat. The browser holds no access token, so each turn is sent through a server action
 * ({@link sendAssistTurn}); the API answers only from the caller's own scoped data and the tenant's
 * help articles. The transcript lives in client state and is appended to as replies arrive.
 */
export function AssistChat() {
  const [turns, setTurns] = useState<AssistTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);

  function ask(message: string) {
    const text = message.trim();
    if (!text || pending) return;
    setError(null);
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: text }]);

    startTransition(async () => {
      const res = await sendAssistTurn({ message: text, conversationId });
      if (res.ok) {
        setConversationId(res.conversationId);
        setTurns((prev) => [...prev, res.reply]);
      } else {
        setError(res.error);
      }
      // Scroll the newest turn into view.
      requestAnimationFrame(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight }));
    });
  }

  return (
    <div className="flex h-[32rem] flex-col rounded-card border border-gray-200 bg-white">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        className="flex-1 space-y-4 overflow-y-auto p-5"
      >
        {turns.length === 0 ? (
          <EmptyChat onPick={ask} disabled={pending} />
        ) : (
          turns.map((turn, i) => <Bubble key={i} turn={turn} />)
        )}
        {pending && <p className="text-sm text-gray-500">Assist is thinking…</p>}
      </div>

      {error && (
        <p
          role="alert"
          className="border-t border-red-100 bg-red-50 px-5 py-2 text-sm text-red-600"
        >
          {error}
        </p>
      )}

      <form
        className="flex items-center gap-2 border-t border-gray-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <label className="sr-only" htmlFor="assist-input">
          Ask Assist
        </label>
        <input
          id="assist-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder="Ask about leave, pay, claims, or policies…"
          className="flex-1 rounded-card border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className={buttonClasses("primary")}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function EmptyChat({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Ask Assist a question. It answers from your own data and your company&rsquo;s help articles,
        and escalates to a person when it isn&rsquo;t sure.
      </p>
      <div className="flex flex-wrap gap-2">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className="rounded-card border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ turn }: { turn: AssistTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[80%] rounded-card bg-brand-600 px-4 py-2 text-sm text-white"
            : "max-w-[80%] space-y-2 rounded-card bg-gray-100 px-4 py-2 text-sm text-gray-900"
        }
      >
        <p className="whitespace-pre-wrap">{turn.content}</p>
        {turn.citations && turn.citations.length > 0 && (
          <p className="text-xs text-gray-500">
            Source: {turn.citations.map((c) => c.title).join(", ")}
          </p>
        )}
        {turn.escalated && (
          <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Flagged for a team member
          </span>
        )}
      </div>
    </div>
  );
}
