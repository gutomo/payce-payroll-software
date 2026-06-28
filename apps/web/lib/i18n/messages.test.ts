import { SUPPORTED_LOCALES } from "@payce/i18n";
import { describe, expect, it } from "vitest";
import { getTranslator } from "./messages";

describe("getTranslator", () => {
  it("returns English chrome for en-US", () => {
    const t = getTranslator("en-US");
    expect(t("nav.profile")).toBe("My profile");
    expect(t("action.signOut")).toBe("Sign out");
  });

  it("returns Spanish chrome for es-ES", () => {
    const t = getTranslator("es-ES");
    expect(t("nav.profile")).toBe("Mi perfil");
    expect(t("action.signOut")).toBe("Cerrar sesión");
  });

  it("resolves a known key to a real string (not the key) for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const value = getTranslator(locale)("nav.profile");
      expect(value).not.toBe("nav.profile");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
