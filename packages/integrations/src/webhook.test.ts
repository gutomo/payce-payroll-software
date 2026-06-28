import { describe, expect, it } from "vitest";
import { isWebhookEvent, signPayload, verifySignature, WEBHOOK_EVENTS } from "./webhook";

const secret = "whsec_test_secret";
const payload = JSON.stringify({ event: "employee.imported", data: { imported: 25 } });

describe("webhook signing", () => {
  it("signs deterministically with a sha256= prefix", () => {
    const sig = signPayload(secret, payload);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(sig).toBe(signPayload(secret, payload));
  });

  it("verifies a correct signature and rejects tampering", () => {
    const sig = signPayload(secret, payload);
    expect(verifySignature(secret, payload, sig)).toBe(true);
    expect(verifySignature(secret, payload + " ", sig)).toBe(false);
    expect(verifySignature("wrong-secret", payload, sig)).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifySignature(secret, payload, "sha256=deadbeef")).toBe(false);
  });

  it("recognises the known event types", () => {
    for (const event of WEBHOOK_EVENTS) expect(isWebhookEvent(event)).toBe(true);
    expect(isWebhookEvent("totally.unknown")).toBe(false);
  });
});
