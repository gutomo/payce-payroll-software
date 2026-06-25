import { describe, expect, it } from "vitest";
import { isExpiring, jwtExp } from "./jwt";

function tokenWithExp(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ sub: "u", exp })).toString("base64url");
  return `header.${payload}.signature`;
}

describe("jwtExp", () => {
  it("reads the exp claim from a well-formed token", () => {
    expect(jwtExp(tokenWithExp(1_700_000_000))).toBe(1_700_000_000);
  });

  it("returns null for malformed input", () => {
    expect(jwtExp("")).toBeNull();
    expect(jwtExp("not-a-jwt")).toBeNull();
    expect(jwtExp("a.b.c")).toBeNull();
  });
});

describe("isExpiring", () => {
  const now = 1_000_000_000 * 1000; // fixed "now" in ms

  it("treats a missing or unparseable token as expiring", () => {
    expect(isExpiring(undefined, 30, now)).toBe(true);
    expect(isExpiring("garbage", 30, now)).toBe(true);
  });

  it("is false for a token comfortably in the future", () => {
    expect(isExpiring(tokenWithExp(now / 1000 + 600), 30, now)).toBe(false);
  });

  it("is true within the skew window", () => {
    expect(isExpiring(tokenWithExp(now / 1000 + 10), 30, now)).toBe(true);
  });

  it("is true for an already-expired token", () => {
    expect(isExpiring(tokenWithExp(now / 1000 - 5), 30, now)).toBe(true);
  });
});
