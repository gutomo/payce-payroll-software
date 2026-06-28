import { describe, expect, it } from "vitest";
import { redactPii } from "./redact";

describe("redactPii", () => {
  it("masks email addresses", () => {
    expect(redactPii("email me at jane.doe@example.com please")).toBe(
      "email me at [redacted-email] please",
    );
  });

  it("masks long digit runs (tax/bank/account numbers)", () => {
    expect(redactPii("my account is 12345678")).toBe("my account is [redacted-number]");
    expect(redactPii("sort code 12-34-56")).toBe("sort code [redacted-number]");
  });

  it("leaves short numbers and ordinary text intact", () => {
    expect(redactPii("I have 18 days of leave")).toBe("I have 18 days of leave");
  });

  it("is idempotent", () => {
    const once = redactPii("contact admin@demo.test or call 5551234");
    expect(redactPii(once)).toBe(once);
  });
});
