/**
 * Locale model + negotiation. Localization is a view-layer concern (CLAUDE.md: "localize only at the
 * view layer"); the API stays locale-agnostic (UTC, integer minor units, ISO currency codes) and the
 * web resolves a supported locale per request from a stored preference or the Accept-Language header.
 */

/** The locales the UI is built to format and (partially) translate for. */
export const SUPPORTED_LOCALES = ["en-US", "en-GB", "es-ES", "de-DE", "fr-FR", "ja-JP"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en-US";

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** The primary subtag of a BCP-47 tag, lowercased (e.g. "es-ES" → "es"). */
function primarySubtag(tag: string): string {
  return tag.toLowerCase().split("-")[0] ?? tag.toLowerCase();
}

/** Parse an `Accept-Language` header into tags ordered by descending q-weight. */
export function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = qParam ? Number(qParam.slice(2)) : 1;
      return { tag: (tag ?? "").trim(), weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((entry) => entry.tag.length > 0 && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((entry) => entry.tag);
}

/**
 * Resolve a supported locale. A valid `preferred` (e.g. a stored cookie) wins; otherwise negotiate
 * from `acceptLanguage` by exact match, then by primary subtag (so "es-MX" → "es-ES"); otherwise
 * fall back to {@link DEFAULT_LOCALE}.
 */
export function resolveLocale(input: {
  acceptLanguage?: string | null;
  preferred?: string | null;
}): Locale {
  if (isSupportedLocale(input.preferred)) return input.preferred;
  const tags = input.acceptLanguage ? parseAcceptLanguage(input.acceptLanguage) : [];
  for (const tag of tags) {
    if (isSupportedLocale(tag)) return tag;
    const primary = primarySubtag(tag);
    const match = SUPPORTED_LOCALES.find((locale) => primarySubtag(locale) === primary);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
