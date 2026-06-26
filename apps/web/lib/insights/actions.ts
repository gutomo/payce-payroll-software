"use server";

import { runReport } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import type { ReportSpec } from "@/lib/api/types";
import { requireAccessToken } from "@/lib/auth/server";
import type { BuilderState } from "./builder-state";

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
