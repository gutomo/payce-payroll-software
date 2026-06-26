import { PayrollError } from "./errors";
import { type CompiledFormula, compile, evaluate, type FormulaContext } from "./formula";
import { DEFAULT_ROUNDING, type RoundingMode, roundToMinor } from "./money";
import type { PayElementDef, PayElementType } from "./pay-element";

/**
 * The pure payroll calculator (ADR-0002). Given an employee's numeric variables and an ordered list of
 * pay elements, it evaluates each element's formula in order, rounds the result to an integer minor
 * unit, exposes it to later formulas by `code`, and accumulates gross → net. No I/O, no clock, no
 * randomness: the same input always yields the same payslip.
 *
 * Split into a compile step ({@link compileElements}, done once) and an evaluate step
 * ({@link calculate}, done per employee) so a run over many employees parses each formula only once.
 */

/** Running-total names injected into every formula's context; pay-element codes may not collide. */
const RESERVED_NAMES = ["gross", "deductions", "net"] as const;

export interface PayrollInput {
  /** ISO 4217 currency for the whole payslip (single-currency in this slice). */
  currency: string;
  /** Per-employee numeric inputs: base salary (minor units), hours, rates, counts, etc. */
  variables: FormulaContext;
  /** Ordered pay elements; earlier results are visible to later formulas. */
  elements: PayElementDef[];
  /** Default rounding for elements that don't specify their own. */
  rounding?: RoundingMode;
}

export interface CompiledPayElement {
  code: string;
  name: string;
  type: PayElementType;
  rounding?: RoundingMode;
  formula: CompiledFormula;
}

export interface PayslipLine {
  code: string;
  name: string;
  type: PayElementType;
  /** Rounded integer amount in minor units. Deductions are positive and subtracted from gross. */
  amountMinor: number;
}

export interface PayslipResult {
  currency: string;
  lines: PayslipLine[];
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
}

/** Compile and validate an element set once (unique non-reserved codes, parseable formulas). */
export function compileElements(elements: readonly PayElementDef[]): CompiledPayElement[] {
  const seen = new Set<string>();
  for (const el of elements) {
    if (RESERVED_NAMES.includes(el.code as (typeof RESERVED_NAMES)[number])) {
      throw new PayrollError(`Pay element code "${el.code}" is reserved`);
    }
    if (seen.has(el.code)) {
      throw new PayrollError(`Duplicate pay element code "${el.code}"`);
    }
    seen.add(el.code);
  }
  return elements.map((el) => ({
    code: el.code,
    name: el.name,
    type: el.type,
    rounding: el.rounding,
    formula: compile(el.formula),
  }));
}

/** Evaluate a pre-compiled element set for one employee's variables. Pure and deterministic. */
export function calculate(
  currency: string,
  variables: FormulaContext,
  elements: readonly CompiledPayElement[],
  rounding: RoundingMode = DEFAULT_ROUNDING,
): PayslipResult {
  assertVariablesUsable(variables, elements);

  const results: Record<string, number> = {};
  const lines: PayslipLine[] = [];
  let earnings = 0;
  let deductions = 0;

  for (const el of elements) {
    const context: FormulaContext = {
      ...variables,
      ...results,
      gross: earnings,
      deductions,
      net: earnings - deductions,
    };
    const amount = roundToMinor(evaluate(el.formula, context), el.rounding ?? rounding);
    results[el.code] = amount;
    lines.push({ code: el.code, name: el.name, type: el.type, amountMinor: amount });
    if (el.type === "EARNING") earnings += amount;
    else deductions += amount;
  }

  return {
    currency,
    lines,
    grossMinor: earnings,
    deductionsMinor: deductions,
    netMinor: earnings - deductions,
  };
}

/** Convenience: compile then calculate. For many employees, call {@link compileElements} once instead. */
export function calculatePayslip(input: PayrollInput): PayslipResult {
  return calculate(
    input.currency,
    input.variables,
    compileElements(input.elements),
    input.rounding ?? DEFAULT_ROUNDING,
  );
}

function assertVariablesUsable(
  variables: FormulaContext,
  elements: readonly CompiledPayElement[],
): void {
  const codes = new Set(elements.map((el) => el.code));
  for (const name of Object.keys(variables)) {
    if (RESERVED_NAMES.includes(name as (typeof RESERVED_NAMES)[number])) {
      throw new PayrollError(`Variable name "${name}" is reserved`);
    }
    if (codes.has(name)) {
      throw new PayrollError(
        `Variable "${name}" collides with a pay element code; references would be ambiguous`,
      );
    }
  }
}
