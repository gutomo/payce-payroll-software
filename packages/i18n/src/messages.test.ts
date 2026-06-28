import { describe, expect, it } from "vitest";
import { createTranslator } from "./messages";

const t = createTranslator({
  "nav.profile": "My profile",
  greeting: "Hello, {name}",
});

describe("createTranslator", () => {
  it("looks up a key", () => {
    expect(t("nav.profile")).toBe("My profile");
  });

  it("interpolates named placeholders", () => {
    expect(t("greeting", { name: "Ada" })).toBe("Hello, Ada");
  });

  it("returns the key for an unknown message", () => {
    expect(t("nav.missing")).toBe("nav.missing");
  });

  it("leaves a placeholder intact when no value is supplied", () => {
    expect(t("greeting")).toBe("Hello, {name}");
    expect(t("greeting", { other: "x" })).toBe("Hello, {name}");
  });
});
