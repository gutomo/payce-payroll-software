import { describe, expect, it } from "vitest";
import { runAssist } from "./orchestrate";
import type { AssistProvider, ProviderAnswer } from "./provider";
import { TemplateAssistProvider } from "./template-provider";
import type { ComposeInput } from "./types";

const base: ComposeInput = { query: "", retrieved: [], toolResults: [] };

/** A provider stubbed to a fixed phrasing/confidence so we can test the policy layer in isolation. */
function fixedProvider(answer: ProviderAnswer): AssistProvider {
  return { name: "fixed", compose: () => answer };
}

describe("runAssist", () => {
  it("passes through a confident, non-sensitive answer without escalating", async () => {
    const answer = await runAssist(new TemplateAssistProvider(), {
      ...base,
      query: "what's my leave balance?",
      toolResults: [{ tool: "leave_balance", ok: true, summary: "You have 18 days left." }],
    });
    expect(answer.escalate).toBe(false);
    expect(answer.escalationReason).toBeUndefined();
    expect(answer.text).toBe("You have 18 days left.");
  });

  it("escalates a sensitive topic even when the provider is confident, appending a hand-off", async () => {
    const provider = fixedProvider({
      text: "Here is the resignation policy.",
      confidence: 0.95,
      citations: [],
      usedTools: [],
    });
    const answer = await runAssist(provider, { ...base, query: "I want to resign" });
    expect(answer.escalate).toBe(true);
    expect(answer.escalationReason).toBe("sensitive_topic");
    expect(answer.text).toContain("Here is the resignation policy.");
    expect(answer.text).toContain("member of the team");
  });

  it("escalates low-confidence answers with a hand-off line", async () => {
    const answer = await runAssist(new TemplateAssistProvider(), {
      ...base,
      query: "what's the wifi password?",
    });
    expect(answer.escalate).toBe(true);
    expect(answer.escalationReason).toBe("low_confidence");
    expect(answer.text).toContain("flagged this for a member of the team");
  });

  it("awaits an async provider", async () => {
    const provider: AssistProvider = {
      name: "async",
      compose: () =>
        Promise.resolve({ text: "async ok", confidence: 0.9, citations: [], usedTools: [] }),
    };
    const answer = await runAssist(provider, { ...base, query: "hello there" });
    expect(answer.text).toBe("async ok");
    expect(answer.escalate).toBe(false);
  });
});
