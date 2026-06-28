/**
 * `@payce/i18n`, the pure localization kernel (Phase 7). Locale negotiation, locale-aware and
 * currency-correct formatting (Intl-based), and a small message-catalog primitive. No I/O. Consumed
 * by the web view layer; the API stays locale-agnostic (UTC, minor units, ISO currency codes).
 */

export {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type Locale,
  parseAcceptLanguage,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "./locale";
export {
  currencyDecimals,
  formatDate,
  formatDateTime,
  formatDays,
  formatMoney,
  formatNumber,
} from "./format";
export { createTranslator, type Messages, type Translator } from "./messages";
