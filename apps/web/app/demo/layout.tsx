import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { DemoBanner } from "@/components/demo/demo-banner";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Interactive demo",
  description: "Take a guided, login-free tour of the platform on synthetic data.",
};

/**
 * Shell for the interactive demo (PLAN.md §6.4). Deliberately its own route group — no auth, no app
 * header — so the guided tours run on isolated, synthetic screens with nothing to sign into.
 */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <DemoBanner />
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto flex h-16 max-w-screen-lg items-center justify-between px-4">
          <Logo />
          <ButtonLink href="/" variant="ghost">
            Back to site
          </ButtonLink>
        </div>
      </header>
      <main id="main" className="flex-1">
        <div className="container mx-auto max-w-screen-lg px-4 py-8">{children}</div>
      </main>
    </div>
  );
}
