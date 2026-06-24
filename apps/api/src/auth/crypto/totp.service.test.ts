import { authenticator } from "otplib";
import { describe, expect, it } from "vitest";
import { TotpService } from "./totp.service";

describe("TotpService", () => {
  const svc = new TotpService();

  it("verifies a freshly generated code", () => {
    const secret = svc.generateSecret();
    const code = authenticator.generate(secret);
    expect(svc.verify(code, secret)).toBe(true);
  });

  it("rejects an incorrect code", () => {
    const secret = svc.generateSecret();
    const valid = authenticator.generate(secret);
    const wrong = valid === "000000" ? "111111" : "000000";
    expect(svc.verify(wrong, secret)).toBe(false);
  });

  it("builds an otpauth enrolment URI", () => {
    const secret = svc.generateSecret();
    const uri = svc.keyUri("user@example.com", "Payce", secret);
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("Payce");
  });
});
