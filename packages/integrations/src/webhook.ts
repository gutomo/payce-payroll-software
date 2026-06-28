/**
 * Outbound webhook helpers. Events are delivered with an HMAC-SHA256 signature over the raw JSON body
 * so receivers can verify the payload originated from us and wasn't tampered with. Deterministic and
 * dependency-free (Node's `crypto`), so it's unit-testable.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** The outbound event types a tenant can subscribe a webhook to. */
export const WEBHOOK_EVENTS = [
  "employee.imported",
  "integration.run.succeeded",
  "integration.run.failed",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

const SIGNATURE_PREFIX = "sha256=";

/** Sign a raw payload. Receivers recompute this over the exact bytes they receive to verify origin. */
export function signPayload(secret: string, payload: string): string {
  return SIGNATURE_PREFIX + createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time check of a presented signature against the expected one. */
export function verifySignature(secret: string, payload: string, signature: string): boolean {
  const expected = signPayload(secret, payload);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
