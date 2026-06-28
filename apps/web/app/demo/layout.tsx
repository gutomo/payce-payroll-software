import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { DemoBanner } from "@/components/demo/demo-banner";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { ButtonLink } from "@/components/ui/button";
import { resolveRequestLocale } from "@/lib/i18n/locale";
import { getTranslator } from "@/lib/i18n/messages";

export const metadata: Metadata = {
  title: "Interactive demo",
  description: "Take a guided, login-free tour of the platform on synthetic data.",
};

/**
 * Shell for the interactive demo (PLAN.md §6.4). Deliberately its own route group — no auth, no app
 * header — so the guided tours run on isolated, synthetic screens with nothing to sign into. The
 * language picker localizes the synthetic screens (dates, numbers, money).
 */
export default async function DemoLayout({ children }: { children: ReactNode }) {
  const locale = await resolveRequestLocale();
  const t = getTranslator(locale);
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <DemoBanner />
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto flex h-16 max-w-screen-lg items-center justify-between gap-4 px-4">
          <Logo />
          <div className="flex items-center gap-3">
            <LocaleSwitcher locale={locale} label={t("label.language")} />
            <ButtonLink href="/" variant="ghost">
              Back to site
            </ButtonLink>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        <div className="container mx-auto max-w-screen-lg px-4 py-8">{children}</div>
      </main>
    </div>
  );
}
