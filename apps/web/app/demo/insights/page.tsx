import type { Metadata } from "next";
import { DemoInsights } from "@/components/demo/demo-insights";
import { resolveRequestLocale } from "@/lib/i18n/locale";

export const metadata: Metadata = { title: "Insights demo" };

export default async function DemoInsightsPage() {
  const locale = await resolveRequestLocale();
  return <DemoInsights locale={locale} />;
}
