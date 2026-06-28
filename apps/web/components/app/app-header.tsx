import Link from "next/link";
import type { Locale } from "@payce/i18n";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { buttonClasses } from "@/components/ui/button";
import type { Me } from "@/lib/api/types";
import { logoutAction } from "@/lib/auth/actions";
import { getTranslator } from "@/lib/i18n/messages";

const ORG_READ = "org.employee.read";
const INSIGHTS_READ = "insights.report.read";
const ASSIST_USE = "assist.use";

/** Top bar for the authenticated app: brand, nav, language, signed-in identity, and sign-out. Links
 *  are shown only when the caller holds the matching permission; the API enforces it regardless.
 *  Nav/action labels are localized for the resolved locale. */
export function AppHeader({ me, locale }: { me: Me; locale: Locale }) {
  const t = getTranslator(locale);
  const canReadOrg = me.permissions.includes(ORG_READ);
  const canReadInsights = me.permissions.includes(INSIGHTS_READ);
  const canUseAssist = me.permissions.includes(ASSIST_USE);
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto flex h-16 max-w-screen-lg items-center justify-between gap-6 px-4">
        <div className="flex items-center gap-6">
          <Logo />
          <nav aria-label="MyHR" className="flex items-center gap-4">
            <Link href="/myhr" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              {t("nav.profile")}
            </Link>
            {canReadOrg && (
              <Link href="/org" className="text-sm font-medium text-gray-600 hover:text-gray-900">
                {t("nav.org")}
              </Link>
            )}
            {canReadInsights && (
              <Link
                href="/insights"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                {t("nav.insights")}
              </Link>
            )}
            {canUseAssist && (
              <Link
                href="/assist"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                {t("nav.assist")}
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher locale={locale} label={t("label.language")} />
          <span className="hidden text-sm text-gray-500 sm:inline">{me.email}</span>
          <form action={logoutAction}>
            <button type="submit" className={buttonClasses("secondary")}>
              {t("action.signOut")}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
