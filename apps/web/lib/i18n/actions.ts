"use server";

import { cookies } from "next/headers";
import { isSupportedLocale } from "@payce/i18n";
import { LOCALE_COOKIE } from "./locale";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persist the chosen locale to a cookie. Invoking this server action re-renders the current route, so
 * the new locale takes effect immediately. Ignores unsupported values (defence against a tampered form).
 */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
}
