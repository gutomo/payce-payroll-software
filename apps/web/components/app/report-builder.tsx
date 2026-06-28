"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ReportChart } from "@/components/app/report-chart";
import { buttonClasses } from "@/components/ui/button";
import type { DatasetSummary, ReportSpec } from "@/lib/api/types";
import { runReportAction, saveReportAction } from "@/lib/insights/actions";
import { INITIAL_BUILDER_STATE, INITIAL_SAVE_STATE } from "@/lib/insights/builder-state";

/**
 * The no-code report builder: pick a dataset, then the dimensions to group by and the measures to
 * total. Submitting runs the report through a server action (the token stays server-side) and the
 * result renders as a chart + table. Changing the dataset swaps the field choices; the previous
 * dataset's checkboxes are unmounted, so no stale field keys can be submitted.
 */
export function ReportBuilder({ datasets }: { datasets: DatasetSummary[] }) {
  const [state, action, pending] = useActionState(runReportAction, INITIAL_BUILDER_STATE);
  const [datasetKey, setDatasetKey] = useState(datasets[0]?.key ?? "");
  const dataset = datasets.find((d) => d.key === datasetKey) ?? datasets[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <form
        action={action}
        className="h-fit space-y-5 rounded-card border border-gray-200 bg-white p-5"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Dataset</span>
          <select
            name="dataset"
            value={datasetKey}
            onChange={(e) => setDatasetKey(e.target.value)}
            className="block w-full rounded-card border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          >
            {datasets.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        {dataset && (
          <>
            <FieldGroup
              legend="Group by"
              name="dimensions"
              options={dataset.dimensions}
              type="checkbox"
            />
            <FieldGroup
              legend="Measures"
              name="measures"
              options={dataset.measures}
              type="checkbox"
            />
          </>
        )}

        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className={buttonClasses("primary", "w-full")}>
          {pending ? "Running…" : "Run report"}
        </button>
      </form>

      <div className="space-y-6">
        <div className="rounded-card border border-gray-200 bg-white p-5">
          {state.result ? (
            <ReportChart result={state.result} />
          ) : (
            <p className="text-sm text-gray-500">
              Choose a dataset, the fields to group by, and the measures to total, then run the
              report to preview it here.
            </p>
          )}
        </div>

        {state.result && state.spec && (
          <SaveReportPanel key={JSON.stringify(state.spec)} spec={state.spec} />
        )}
      </div>
    </div>
  );
}

/**
 * Save the report that was just previewed. The run's spec is carried through a hidden field so the
 * server action saves exactly what the user sees; on success we confirm and link to it in Insights.
 */
function SaveReportPanel({ spec }: { spec: ReportSpec }) {
  const [state, action, pending] = useActionState(saveReportAction, INITIAL_SAVE_STATE);

  if (state.saved) {
    return (
      <div className="rounded-card border border-green-200 bg-green-50 p-5 text-sm">
        <p className="font-medium text-green-800">Saved “{state.saved.name}”.</p>
        <Link href="/insights" className="mt-1 inline-block text-green-700 underline">
          View it in Insights
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-card border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">Save this report</h2>
      <input type="hidden" name="spec" value={JSON.stringify(spec)} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Name</span>
        <input
          name="name"
          required
          maxLength={200}
          placeholder="Headcount by department"
          className="block w-full rounded-card border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Description <span className="font-normal text-gray-500">(optional)</span>
        </span>
        <input
          name="description"
          maxLength={1000}
          className="block w-full rounded-card border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={buttonClasses("secondary")}>
        {pending ? "Saving…" : "Save report"}
      </button>
    </form>
  );
}

function FieldGroup({
  legend,
  name,
  options,
  type,
}: {
  legend: string;
  name: string;
  options: { key: string; label: string }[];
  type: "checkbox";
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-700">{legend}</legend>
      {options.map((opt) => (
        <label key={opt.key} className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type={type}
            name={name}
            value={opt.key}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
          />
          {opt.label}
        </label>
      ))}
    </fieldset>
  );
}
