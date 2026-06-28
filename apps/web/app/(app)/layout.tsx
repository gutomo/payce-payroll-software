import type { ReactNode } from "react";
import { AppHeader } from "@/components/app/app-header";
import { requireMe } from "@/lib/auth/server";
import { resolveRequestLocale } from "@/lib/i18n/locale";

/** Authenticated app shell. Resolves the current user and locale once (redirecting to login if the
 *  session is gone) and frames the app pages with the localized app header. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const [{ me }, locale] = await Promise.all([requireMe(), resolveRequestLocale()]);
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <AppHeader me={me} locale={locale} />
      <main id="main" className="flex-1">
        <div className="container mx-auto max-w-screen-lg px-4 py-8">{children}</div>
      </main>
    </div>
  );
}
