"use client";

import { useActionState, useState } from "react";
import { ReportChart } from "@/components/app/report-chart";
import { buttonClasses } from "@/components/ui/button";
import type { DatasetSummary } from "@/lib/api/types";
import { runReportAction } from "@/lib/insights/actions";
import { INITIAL_BUILDER_STATE } from "@/lib/insights/builder-state";

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

      <div className="rounded-card border border-gray-200 bg-white p-5">
        {state.result ? (
          <ReportChart result={state.result} />
        ) : (
          <p className="text-sm text-gray-500">
            Choose a dataset, the fields to group by, and the measures to total, then run the report
            to preview it here.
          </p>
        )}
      </div>
    </div>
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
