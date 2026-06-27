import type { Metadata } from "next";
import { DemoInsights } from "@/components/demo/demo-insights";

export const metadata: Metadata = { title: "Insights demo" };

export default function DemoInsightsPage() {
  return <DemoInsights />;
}
