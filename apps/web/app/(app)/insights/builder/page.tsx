import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ReportBuilder } from "@/components/app/report-builder";
import { getDatasets } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import type { DatasetSummary } from "@/lib/api/types";
import { requireAccessToken } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Report builder" };

export default async function ReportBuilderPage() {
  const token = await requireAccessToken();

  let datasets: DatasetSummary[];
  try {
    datasets = await getDatasets(token);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isForbidden) {
        return (
          <Page>
            <EmptyState title="Not available" body="You don't have permission to build reports." />
          </Page>
        );
      }
      if (error.isUnauthorized) redirect("/login");
    }
    throw error;
  }

  return (
    <Page>
      <ReportBuilder datasets={datasets} />
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <section>
      <div className="mb-6">
        <Link href="/insights" className="text-sm text-gray-500 hover:text-gray-900">
          ← Insights
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Report builder</h1>
        <p className="mt-1 text-sm text-gray-500">
          Group any dataset by its dimensions and total its measures, no code required.
        </p>
      </div>
      {children}
    </section>
  );
}
