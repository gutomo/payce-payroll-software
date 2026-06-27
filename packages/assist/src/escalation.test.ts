import { describe, expect, it } from "vitest";
import { CONFIDENCE_ESCALATION_THRESHOLD, decideEscalation, isSensitive } from "./escalation";

describe("isSensitive", () => {
  it("flags HR/legal/identity topics on whole-token match", () => {
    expect(isSensitive("I want to resign")).toBe(true);
    expect(isSensitive("I think I was discriminated against")).toBe(true);
    expect(isSensitive("update my passport number")).toBe(true);
  });

  it("does not flag benign questions that merely contain substrings", () => {
    // "configured" contains "fig" not "fire"; "legalese" is not a token here.
    expect(isSensitive("how do I get my account configured?")).toBe(false);
    expect(isSensitive("what's my leave balance?")).toBe(false);
  });
});

describe("decideEscalation", () => {
  it("escalates sensitive topics regardless of confidence", () => {
    expect(decideEscalation({ query: "I want to resign", confidence: 0.99 })).toEqual({
      escalate: true,
      reason: "sensitive_topic",
    });
  });

  it("escalates low-confidence answers on non-sensitive topics", () => {
    const verdict = decideEscalation({
      query: "what is the parking policy?",
      confidence: CONFIDENCE_ESCALATION_THRESHOLD - 0.01,
    });
    expect(verdict).toEqual({ escalate: true, reason: "low_confidence" });
  });

  it("does not escalate confident, non-sensitive answers", () => {
    expect(decideEscalation({ query: "what's my leave balance?", confidence: 0.9 })).toEqual({
      escalate: false,
    });
  });
});
