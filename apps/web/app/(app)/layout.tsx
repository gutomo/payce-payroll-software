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
      <AppHeader me={me} locale={locale} />
      <main id="main" className="flex-1">
        <div className="container mx-auto max-w-screen-lg px-4 py-8">{children}</div>
      </main>
    </div>
  );
}
