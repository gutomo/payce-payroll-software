"use client";

import { useTransition } from "react";
import { type Locale, SUPPORTED_LOCALES } from "@payce/i18n";
import { setLocaleAction } from "@/lib/i18n/actions";

const LOCALE_LABELS: Record<Locale, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "es-ES": "Español",
  "de-DE": "Deutsch",
  "fr-FR": "Français",
  "ja-JP": "日本語",
};

/**
 * Language picker. Changing it saves the locale via a server action, which re-renders the route so
 * the new locale's formatting and translations apply immediately. The browser never needs the token.
 */
export function LocaleSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <label className="sr-only" htmlFor="locale-switcher">
        {label}
      </label>
      <select
        id="locale-switcher"
        defaultValue={locale}
        disabled={pending}
        aria-label={label}
        onChange={(event) => {
          const data = new FormData();
          data.set("locale", event.target.value);
          startTransition(() => setLocaleAction(data));
        }}
        className="rounded-card border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:opacity-50"
      >
        {SUPPORTED_LOCALES.map((value) => (
          <option key={value} value={value}>
            {LOCALE_LABELS[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
