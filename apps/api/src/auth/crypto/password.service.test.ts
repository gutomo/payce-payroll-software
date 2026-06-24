import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const svc = new PasswordService();

  it("hashes a password to something other than the plaintext", async () => {
    const hashed = await svc.hash("S3cure-Passw0rd!");
    expect(hashed).not.toBe("S3cure-Passw0rd!");
    expect(hashed.startsWith("$argon2")).toBe(true);
  });

  it("verifies the correct password", async () => {
    const hashed = await svc.hash("S3cure-Passw0rd!");
    expect(await svc.verify(hashed, "S3cure-Passw0rd!")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hashed = await svc.hash("S3cure-Passw0rd!");
    expect(await svc.verify(hashed, "wrong-password")).toBe(false);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    expect(await svc.verify("not-a-hash", "whatever")).toBe(false);
  });
});
