import { describe, expect, it } from "vitest";
import { isSupportedLocale, parseAcceptLanguage, resolveLocale } from "./locale";

describe("isSupportedLocale", () => {
  it("recognises supported locales and rejects others", () => {
    expect(isSupportedLocale("en-US")).toBe(true);
    expect(isSupportedLocale("ja-JP")).toBe(true);
    expect(isSupportedLocale("es-MX")).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe("parseAcceptLanguage", () => {
  it("orders tags by descending q-weight", () => {
    expect(parseAcceptLanguage("en;q=0.8,es-ES,es;q=0.9")).toEqual(["es-ES", "es", "en"]);
  });

  it("drops q=0 and malformed entries", () => {
    expect(parseAcceptLanguage("en;q=0,fr")).toEqual(["fr"]);
  });
});

describe("resolveLocale", () => {
  it("uses a valid preferred locale over everything else", () => {
    expect(resolveLocale({ preferred: "de-DE", acceptLanguage: "ja-JP" })).toBe("de-DE");
  });

  it("ignores an unsupported preferred and negotiates from Accept-Language", () => {
    expect(resolveLocale({ preferred: "es-MX", acceptLanguage: "fr-FR,fr;q=0.9" })).toBe("fr-FR");
  });

  it("matches by primary subtag when there is no exact match", () => {
    expect(resolveLocale({ acceptLanguage: "es-MX,es;q=0.9" })).toBe("es-ES");
  });

  it("falls back to the default locale", () => {
    expect(resolveLocale({ acceptLanguage: "zz-ZZ" })).toBe("en-US");
    expect(resolveLocale({})).toBe("en-US");
  });
});
