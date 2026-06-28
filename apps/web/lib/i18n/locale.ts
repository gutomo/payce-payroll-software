import { cookies, headers } from "next/headers";
import { type Locale, resolveLocale } from "@payce/i18n";

/** Cookie holding the user's chosen locale; takes precedence over the Accept-Language header. */
export const LOCALE_COOKIE = "payce-locale";

/**
 * Resolve the request's locale (server-side): the saved preference cookie if set, otherwise negotiate
 * from the browser's Accept-Language header, otherwise the default. This is the single place the view
 * layer decides how to localize; the API is never asked.
 */
export async function resolveRequestLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    preferred: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
}
