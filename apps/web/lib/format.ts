import { formatDate as fmtDate, formatMoney, formatNumber, type Locale } from "@payce/i18n";

/**
 * View-layer formatting, delegated to the `@payce/i18n` kernel. `formatDate` keeps its original
 * one-argument call shape (defaulting to the kernel's default locale) so existing callers stay stable,
 * and accepts an optional locale for localized rendering. Money/number formatters are re-exported.
 */
export function formatDate(iso: string | null | undefined, locale?: Locale): string {
  return fmtDate(iso, locale);
}

export { formatMoney, formatNumber };
export type { Locale };
