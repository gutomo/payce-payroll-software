import { describe, expect, it } from "vitest";
import { KNOWLEDGE_ANSWER_FLOOR, TemplateAssistProvider } from "./template-provider";
import type { ComposeInput } from "./types";

const provider = new TemplateAssistProvider();

const base: ComposeInput = { query: "", retrieved: [], toolResults: [] };

describe("TemplateAssistProvider", () => {
  it("answers from a successful tool with high confidence and records the used tool", () => {
    const answer = provider.compose({
      ...base,
      query: "what's my leave balance?",
      toolResults: [
        { tool: "leave_balance", ok: true, summary: "You have 18 days of Annual Leave remaining." },
      ],
    });
    expect(answer.text).toContain("18 days");
    expect(answer.usedTools).toEqual(["leave_balance"]);
    expect(answer.confidence).toBeGreaterThan(0.8);
    expect(answer.citations).toEqual([]);
  });

  it("prefers tool facts over knowledge when both are present", () => {
    const answer = provider.compose({
      ...base,
      query: "when is payday?",
      retrieved: [
        {
          article: { id: "k1", title: "Payday", body: "Paid on the last working day." },
          score: 1,
        },
      ],
      toolResults: [{ tool: "next_payday", ok: true, summary: "Your next payday is 31 Jan 2026." }],
    });
    expect(answer.text).toContain("31 Jan 2026");
    expect(answer.citations).toEqual([]);
  });

  it("answers from a knowledge article (with citation) when no tool produced a fact", () => {
    const answer = provider.compose({
      ...base,
      query: "how do I apply for leave?",
      retrieved: [
        {
          article: {
            id: "k-leave",
            title: "Applying for leave",
            body: "Open MyHR, pick a leave type, and submit your dates. Your manager approves it. Extra detail here.",
          },
          score: 0.8,
        },
      ],
    });
    expect(answer.text).toContain("Open MyHR");
    expect(answer.text).toContain("Source: Applying for leave");
    expect(answer.citations).toEqual([{ articleId: "k-leave", title: "Applying for leave" }]);
    expect(answer.confidence).toBeGreaterThan(KNOWLEDGE_ANSWER_FLOOR);
  });

  it("explains a tool failure (no linked profile) instead of inventing an answer", () => {
    const answer = provider.compose({
      ...base,
      query: "what's my leave balance?",
      toolResults: [{ tool: "leave_balance", ok: false, error: "no_profile" }],
    });
    expect(answer.text.toLowerCase()).toContain("employee profile");
    expect(answer.confidence).toBeLessThan(0.35);
    expect(answer.usedTools).toEqual([]);
  });

  it("admits when it has nothing relevant", () => {
    const answer = provider.compose({ ...base, query: "what's the wifi password?" });
    expect(answer.confidence).toBeLessThan(0.2);
    expect(answer.text.toLowerCase()).toContain("connect you");
  });

  it("ignores knowledge below the answer floor", () => {
    const answer = provider.compose({
      ...base,
      query: "obscure question",
      retrieved: [
        {
          article: { id: "k", title: "Unrelated", body: "..." },
          score: KNOWLEDGE_ANSWER_FLOOR - 0.01,
        },
      ],
    });
    expect(answer.citations).toEqual([]);
    expect(answer.confidence).toBeLessThan(0.2);
  });
});
