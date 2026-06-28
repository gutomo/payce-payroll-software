/**
 * Locale-aware formatting built on the platform `Intl` APIs. Money is the important one: values cross
 * the wire as integer minor units + an ISO-4217 currency code (CLAUDE.md money rule), and this is the
 * one place that turns them into a localized, currency-correct string — honouring each currency's own
 * minor-unit exponent (USD/EUR → 2, JPY → 0, BHD/KWD → 3) rather than assuming "/100".
 */
import { DEFAULT_LOCALE, type Locale } from "./locale";

/** A currency's minor-unit decimal places, per `Intl` (the ISO-4217 authority). Falls back to 2. */
export function currencyDecimals(currency: string): number {
  try {
    const { maximumFractionDigits } = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions();
    return maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * Format integer minor units as localized currency:
 *   formatMoney(642018, "USD", "en-US") → "$6,420.18"
 *   formatMoney(642000, "JPY", "ja-JP") → "￥6,420"   (no decimal places)
 *   formatMoney(642018, "EUR", "de-DE") → "6.420,18 €"
 * An unparseable currency code degrades to the number plus the raw code rather than throwing.
 */
export function formatMoney(
  minorUnits: number | bigint,
  currency: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const decimals = currencyDecimals(currency);
  const major = Number(minorUnits) / 10 ** decimals;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(major);
  } catch {
    const number = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(major);
    return `${number} ${currency}`;
  }
}

export function formatNumber(
  value: number,
  locale: Locale = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** A day count, e.g. leave balances: at most two decimals, localized grouping/decimal marks. */
export function formatDays(value: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
};

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTIONS,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/** Format an ISO date as a localized UTC date; "-" for null/empty/invalid input. */
export function formatDate(
  iso: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const date = toDate(iso);
  return date ? new Intl.DateTimeFormat(locale, DATE_OPTIONS).format(date) : "-";
}

/** Format an ISO timestamp as a localized UTC date+time; "-" for null/empty/invalid input. */
export function formatDateTime(
  iso: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const date = toDate(iso);
  return date ? new Intl.DateTimeFormat(locale, DATE_TIME_OPTIONS).format(date) : "-";
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
