import type { RoundingMode } from "./money";

export type PayElementType = "EARNING" | "DEDUCTION";

/**
 * A data-driven pay element (ADR-0002): earnings and deductions are configuration, not code. The
 * `formula` is evaluated to a minor-unit amount against the run's variables plus the results of any
 * elements that ran before it (referenced by their `code`) and the running totals `gross`,
 * `deductions`, and `net`.
 */
export interface PayElementDef {
  /** Stable identifier; unique within a run and referenceable from later formulas. */
  code: string;
  name: string;
  type: PayElementType;
  /** Expression in the formula mini-language (see `formula.ts`). Evaluates to a minor-unit amount. */
  formula: string;
  /** Optional per-element override of the run's default rounding mode. */
  rounding?: RoundingMode;
}
