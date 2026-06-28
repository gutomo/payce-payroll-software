import type { Metadata } from "next";
import { DemoMyHr } from "@/components/demo/demo-myhr";

export const metadata: Metadata = { title: "MyHR demo" };

export default function DemoMyHrPage() {
  return <DemoMyHr />;
}
