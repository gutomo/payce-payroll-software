import { EmptyState } from "@/components/app/empty-state";
import type { ReportResult } from "@/lib/api/types";
import { formatCell, rowKey, toBars } from "@/lib/insights/format";

/**
 * Presentational renderer for an executed report: an optional horizontal-bar chart (first measure by
 * first dimension) plus the full data table. Pure and dependency-free, no charting library, so it
 * renders identically on the server (dashboards) and inside the client builder.
 */
export function ReportChart({
  result,
  chart = "bar",
}: {
  result: ReportResult;
  chart?: "bar" | "table";
}) {
  if (result.rows.length === 0) {
    return <EmptyState title="No data" body="This report returned no rows for your access." />;
  }

  const bars = chart === "bar" ? toBars(result) : [];

  return (
    <div className="space-y-4">
      {bars.length > 0 && (
        <ul className="space-y-2">
          {bars.map((bar) => (
            <li key={bar.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-gray-700">{bar.label}</span>
                <span className="shrink-0 tabular-nums font-medium text-gray-900">{bar.value}</span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${Math.max(2, Math.round(bar.ratio * 100))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReportTable result={result} />
    </div>
  );
}

function ReportTable({ result }: { result: ReportResult }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            {result.columns.map((col) => (
              <th key={col.key} className="py-2 pr-4 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={rowKey(result, row)} className="border-b border-gray-100 last:border-0">
              {result.columns.map((col) => (
                <td
                  key={col.key}
                  className={
                    col.kind === "measure"
                      ? "py-2 pr-4 tabular-nums text-gray-900"
                      : "py-2 pr-4 text-gray-700"
                  }
                >
                  {formatCell(row[col.key] ?? null, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
