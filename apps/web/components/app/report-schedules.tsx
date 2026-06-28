"use client";

import { useActionState, useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { ReportSchedule } from "@/lib/api/types";
import {
  createScheduleAction,
  deleteScheduleAction,
  toggleScheduleAction,
} from "@/lib/insights/actions";
import { describeSchedule, formatRunAt } from "@/lib/insights/format";
import { INITIAL_SCHEDULE_STATE } from "@/lib/insights/schedule-state";

/**
 * Per-report scheduling: lists a saved report's recurring deliveries and offers a form to add one.
 * The browser never holds the access token, so create/pause/delete all go through server actions that
 * re-validate input and enforce the caller's manage permission; the list is revalidated server-side.
 */
export function ReportSchedules({
  reportId,
  schedules,
}: {
  reportId: string;
  schedules: ReportSchedule[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          {schedules.length === 0
            ? "Not scheduled"
            : `${schedules.length} schedule${schedules.length === 1 ? "" : "s"}`}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          {open ? "Close" : "Schedule"}
        </button>
      </div>

      {schedules.length > 0 && (
        <ul className="mt-3 space-y-2">
          {schedules.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-gray-50 px-3 py-2 text-sm"
            >
              <div>
                <p className="text-gray-800">{describeSchedule(s)}</p>
                <p className="text-xs text-gray-500">
                  {s.isActive ? `Next run ${formatRunAt(s.nextRunAt)}` : "Paused"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <form action={toggleScheduleAction}>
                  <input type="hidden" name="scheduleId" value={s.id} />
                  <input type="hidden" name="isActive" value={s.isActive ? "false" : "true"} />
                  <button type="submit" className="font-medium text-gray-600 hover:text-gray-900">
                    {s.isActive ? "Pause" : "Resume"}
                  </button>
                </form>
                <form action={deleteScheduleAction}>
                  <input type="hidden" name="scheduleId" value={s.id} />
                  <button type="submit" className="font-medium text-red-600 hover:text-red-700">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && <NewScheduleForm reportId={reportId} onScheduled={() => setOpen(false)} />}
    </div>
  );
}

function NewScheduleForm({ reportId, onScheduled }: { reportId: string; onScheduled: () => void }) {
  const [state, action, pending] = useActionState(createScheduleAction, INITIAL_SCHEDULE_STATE);

  // Collapse the form once the server confirms the schedule; the new row renders in the list above.
  useEffect(() => {
    if (state.ok) onScheduled();
  }, [state.ok, onScheduled]);

  return (
    <form action={action} className="mt-3 space-y-3 rounded-card border border-gray-200 p-3">
      <input type="hidden" name="reportId" value={reportId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-700">Frequency</span>
          <select name="cadence" defaultValue="MONTHLY" className={fieldClass}>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-700">Format</span>
          <select name="format" defaultValue="XLSX" className={fieldClass}>
            <option value="XLSX">XLSX</option>
            <option value="CSV">CSV</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-700">Hour (UTC)</span>
          <input
            type="number"
            name="hourUtc"
            min={0}
            max={23}
            defaultValue={6}
            className={fieldClass}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-700">
          Recipients{" "}
          <span className="font-normal text-gray-500">(synthetic test addresses only)</span>
        </span>
        <textarea
          name="recipients"
          rows={2}
          required
          placeholder="people-ops@demo.test, finance@demo.test"
          className={fieldClass}
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={buttonClasses("primary")}>
        {pending ? "Scheduling…" : "Schedule report"}
      </button>
    </form>
  );
}

const fieldClass =
  "block w-full rounded-card border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";
