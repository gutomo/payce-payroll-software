import type { ReportResult, ReportSpec } from "@/lib/api/types";

/**
 * Shared `useActionState` shape for the no-code report builder. Its own module so the server action
 * and the client component can both import it without dragging one across the server boundary.
 */
export interface BuilderState {
  /** The executed result of the last successful run, if any. */
  result?: ReportResult;
  /** The spec that produced `result` (echoed so the UI can keep the form in sync). */
  spec?: ReportSpec;
  error?: string;
}

export const INITIAL_BUILDER_STATE: BuilderState = {};

/** `useActionState` shape for saving a built report. Separate form/action from the run above. */
export interface SaveReportState {
  /** The just-saved report, so the UI can confirm and link to it. */
  saved?: { id: string; name: string };
  error?: string;
}

export const INITIAL_SAVE_STATE: SaveReportState = {};
