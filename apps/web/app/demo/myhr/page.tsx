import type { Metadata } from "next";
import { DemoMyHr } from "@/components/demo/demo-myhr";
import { resolveRequestLocale } from "@/lib/i18n/locale";

export const metadata: Metadata = { title: "MyHR demo" };

export default async function DemoMyHrPage() {
  const locale = await resolveRequestLocale();
  return <DemoMyHr locale={locale} />;
}
