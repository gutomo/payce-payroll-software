"use server";

import { revalidatePath } from "next/cache";
import {
  createReport,
  createSchedule,
  deleteSchedule,
  runReport,
  updateSchedule,
} from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import type { ReportCadence, ReportFormat, ReportSpec } from "@/lib/api/types";
import { requireAccessToken } from "@/lib/auth/server";
import type { BuilderState, SaveReportState } from "./builder-state";
import { parseRecipients } from "./format";
import type { ScheduleFormState } from "./schedule-state";

const CADENCES: ReportCadence[] = ["DAILY", "WEEKLY", "MONTHLY"];
const FORMATS: ReportFormat[] = ["CSV", "XLSX"];

/**
 * Server action behind the no-code builder. The browser never holds the access token, so the spec is
 * assembled from the submitted form and run server-side; the API still enforces the caller's
 * permission and tenant scope (RLS). Returns the executed result as action state for the client to
 * render, or a friendly error.
 */
export async function runReportAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const token = await requireAccessToken();

  const dataset = String(formData.get("dataset") ?? "").trim();
  const dimensions = formData.getAll("dimensions").map(String).filter(Boolean);
  const measures = formData.getAll("measures").map(String).filter(Boolean);

  if (!dataset) return { error: "Choose a dataset." };
  if (measures.length === 0) return { error: "Pick at least one measure to chart." };

  const spec: ReportSpec = { dataset, dimensions, measures, limit: 100 };
  try {
    const result = await runReport(token, spec);
    return { result, spec };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isForbidden) return { error: "You don't have permission to run reports." };
      return { error: error.message };
    }
    throw error;
  }
}

/**
 * Save a built report so it can be exported and scheduled. The spec that was just previewed is carried
 * through the form as JSON (the browser never holds the token); the API re-validates it and enforces
 * the caller's manage permission and tenant scope. Revalidates the Insights list so the new report
 * shows immediately.
 */
export async function saveReportAction(
  _prev: SaveReportState,
  formData: FormData,
): Promise<SaveReportState> {
  const token = await requireAccessToken();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return { error: "Give the report a name." };

  let spec: ReportSpec;
  try {
    spec = JSON.parse(String(formData.get("spec") ?? "")) as ReportSpec;
  } catch {
    return { error: "Run the report before saving it." };
  }

  try {
    const report = await createReport(token, {
      name,
      ...(description ? { description } : {}),
      spec,
    });
    revalidatePath("/insights");
    return { saved: { id: report.id, name: report.name } };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isForbidden) return { error: "You don't have permission to save reports." };
      return { error: error.message };
    }
    throw error;
  }
}

/**
 * Schedule a recurring delivery of a saved report. Recipients are entered as free text and tidied into
 * a list (synthetic addresses only); the API validates each as an email and rejects real PII.
 */
export async function createScheduleAction(
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const token = await requireAccessToken();

  const reportId = String(formData.get("reportId") ?? "");
  const cadence = String(formData.get("cadence") ?? "") as ReportCadence;
  const format = String(formData.get("format") ?? "") as ReportFormat;
  const hourUtc = Number(formData.get("hourUtc"));
  const recipients = parseRecipients(String(formData.get("recipients") ?? ""));

  if (!reportId) return { error: "Missing report." };
  if (!CADENCES.includes(cadence)) return { error: "Choose how often to send it." };
  if (!FORMATS.includes(format)) return { error: "Choose a file format." };
  if (!Number.isInteger(hourUtc) || hourUtc < 0 || hourUtc > 23) {
    return { error: "Pick an hour between 0 and 23 (UTC)." };
  }
  if (recipients.length === 0) return { error: "Add at least one recipient." };

  try {
    await createSchedule(token, reportId, { cadence, format, hourUtc, recipients });
    revalidatePath("/insights");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isForbidden) return { error: "You don't have permission to schedule reports." };
      return { error: error.message };
    }
    throw error;
  }
}

/** Pause or resume a schedule. Used as a direct form action; the new active state is posted. */
export async function toggleScheduleAction(formData: FormData): Promise<void> {
  const token = await requireAccessToken();
  const id = String(formData.get("scheduleId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!id) return;
  await updateSchedule(token, id, { isActive });
  revalidatePath("/insights");
}

/** Delete a schedule. Used as a direct form action. */
export async function deleteScheduleAction(formData: FormData): Promise<void> {
  const token = await requireAccessToken();
  const id = String(formData.get("scheduleId") ?? "");
  if (!id) return;
  await deleteSchedule(token, id);
  revalidatePath("/insights");
}
