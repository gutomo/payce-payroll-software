import { describe, expect, it } from "vitest";
import { hashSeed, mulberry32 } from "./seed";

describe("hashSeed", () => {
  it("is deterministic and unsigned 32-bit", () => {
    const a = hashSeed("integration-1:key-a");
    expect(a).toBe(hashSeed("integration-1:key-a"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(a)).toBe(true);
  });

  it("differs for different inputs", () => {
    expect(hashSeed("key-a")).not.toBe(hashSeed("key-b"));
  });
});

describe("mulberry32", () => {
  it("produces a deterministic stream in [0, 1)", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
