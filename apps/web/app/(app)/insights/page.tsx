import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ReportChart } from "@/components/app/report-chart";
import { ButtonLink } from "@/components/ui/button";
import { listPrebuiltDashboards, listReports, runPrebuiltDashboard } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import type { PrebuiltDashboardData, SavedReport } from "@/lib/api/types";
import { requireAccessToken } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage() {
  const token = await requireAccessToken();

  let dashboards: PrebuiltDashboardData[];
  let reports: SavedReport[];
  try {
    const metas = await listPrebuiltDashboards(token);
    [dashboards, reports] = await Promise.all([
      Promise.all(metas.map((m) => runPrebuiltDashboard(token, m.key))),
      listReports(token),
    ]);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isForbidden) {
        return (
          <Page>
            <EmptyState title="Not available" body="You don't have permission to view analytics." />
          </Page>
        );
      }
      if (error.isUnauthorized) redirect("/login");
    }
    throw error;
  }

  return (
    <Page>
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Dashboards</h2>
          <ButtonLink href="/insights/builder" variant="secondary">
            Build a report
          </ButtonLink>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {dashboards.map((dashboard) => (
            <article
              key={dashboard.key}
              className="rounded-card border border-gray-200 bg-white p-5"
            >
              <h3 className="mb-3 text-sm font-semibold text-gray-900">{dashboard.title}</h3>
              <ReportChart result={dashboard.result} chart={dashboard.chart} />
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Saved reports</h2>
        {reports.length === 0 ? (
          <EmptyState
            title="No saved reports yet"
            body="Build a report and save it to find it here."
          />
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-gray-200 bg-white p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">{report.name}</p>
                  {report.description && (
                    <p className="text-sm text-gray-500">{report.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <ExportLink id={report.id} format="xlsx" />
                  <ExportLink id={report.id} format="csv" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}

function ExportLink({ id, format }: { id: string; format: "xlsx" | "csv" }) {
  return (
    <Link
      href={`/insights/reports/${id}/export?format=${format}`}
      prefetch={false}
      className="rounded-card border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
    >
      {format.toUpperCase()}
    </Link>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <section>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-gray-900">Insights</h1>
      {children}
    </section>
  );
}
