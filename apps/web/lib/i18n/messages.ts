import { createTranslator, type Locale, type Messages, type Translator } from "@payce/i18n";

/**
 * UI message catalogs for the app chrome. English and Spanish are fully translated to demonstrate
 * multi-language UI; the other supported locales fall back to English copy while still getting
 * locale-correct number/date/money formatting from `@payce/i18n`. (Long-form marketing/product copy
 * stays in its content model; this catalog covers navigational + action chrome.)
 */
const en: Messages = {
  "nav.profile": "My profile",
  "nav.org": "Org chart",
  "nav.insights": "Insights",
  "nav.assist": "Assist",
  "action.signOut": "Sign out",
  "label.language": "Language",
  "demo.payslip.latest": "Latest payslip",
  "demo.payslip.net": "Net pay",
  "demo.leave.title": "Leave balances",
  "demo.leave.daysLeft": "days left",
};

const es: Messages = {
  "nav.profile": "Mi perfil",
  "nav.org": "Organigrama",
  "nav.insights": "Análisis",
  "nav.assist": "Asistente",
  "action.signOut": "Cerrar sesión",
  "label.language": "Idioma",
  "demo.payslip.latest": "Última nómina",
  "demo.payslip.net": "Pago neto",
  "demo.leave.title": "Saldos de permisos",
  "demo.leave.daysLeft": "días restantes",
};

const CATALOGS: Record<Locale, Messages> = {
  "en-US": en,
  "en-GB": en,
  "es-ES": es,
  "de-DE": en,
  "fr-FR": en,
  "ja-JP": en,
};

export function getTranslator(locale: Locale): Translator {
  return createTranslator(CATALOGS[locale]);
}
