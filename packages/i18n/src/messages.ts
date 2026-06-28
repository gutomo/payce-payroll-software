/**
 * A tiny message-catalog primitive for UI translation. A catalog is a flat `key → string` map whose
 * values may contain `{name}` placeholders; {@link createTranslator} builds a `t(key, vars)` lookup
 * that interpolates them. Deliberately minimal (no plural rules / ICU) — enough to localize chrome
 * without a heavy i18n runtime; richer needs can adopt `Intl.MessageFormat` later behind this seam.
 */

export type Messages = Record<string, string>;

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

/** Build a translator over a catalog. Interpolates `{var}`; an unknown key returns the key itself. */
export function createTranslator(messages: Messages): Translator {
  return (key, vars) => {
    const template = messages[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    );
  };
}
