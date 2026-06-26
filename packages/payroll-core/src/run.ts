import { calculatePayslip, type PayslipLine, type PayslipResult } from "./calculate";
import { PayrollError } from "./errors";
import type { FormulaContext } from "./formula";
import { DEFAULT_ROUNDING, type RoundingMode } from "./money";
import type { PayElementDef } from "./pay-element";
import type { CountryRulePack, RulePackContext, StatutoryInput } from "./rule-pack";

/**
 * Run a full payroll for one employee: evaluate the configured (formula) pay elements, then layer the
 * country rule pack's statutory strategies on top (earnings, pre-tax deductions, then taxes) and
 * recompute gross → net over the combined line set. Pure and deterministic; the rule pack is the only
 * place statutory logic lives.
 */

export interface PayrollRunInput {
  currency: string;
  variables: FormulaContext;
  elements: PayElementDef[];
  /** Optional country rule pack. Without it, this is just {@link calculatePayslip}. */
  rulePack?: CountryRulePack;
  /** Statutory inputs for the rule pack (frequency, YTD wages, pre-tax, filing status). */
  statutory?: StatutoryInput;
  rounding?: RoundingMode;
}

const DEFAULT_STATUTORY: StatutoryInput = { periodsPerYear: 12 };

export function runPayroll(input: PayrollRunInput): PayslipResult {
  const base = calculatePayslip({
    currency: input.currency,
    variables: input.variables,
    elements: input.elements,
    rounding: input.rounding ?? DEFAULT_ROUNDING,
  });

  if (!input.rulePack) return base;
  const pack = input.rulePack;
  if (pack.currency !== input.currency) {
    throw new PayrollError(
      `Rule pack currency ${pack.currency} does not match run currency ${input.currency}`,
    );
  }

  const stat = input.statutory ?? DEFAULT_STATUTORY;
  const lines: PayslipLine[] = [...base.lines];

  // 1. Rule-pack earnings (statutory top-ups). Computed against gross so far.
  appendUnique(lines, pack.earnings(contextFor(input.currency, lines, stat)));

  // 2. Rule-pack pre-tax deductions (e.g. mandatory pension). Reduce taxable income.
  const packDeductions = pack.deductions(contextFor(input.currency, lines, stat));
  appendUnique(lines, packDeductions);

  // 3. Statutory taxes/contributions, computed on taxable = gross − pre-tax.
  const grossMinor = totalByType(lines, "EARNING");
  const preTaxMinor = (stat.preTaxMinor ?? 0) + sumAmounts(packDeductions);
  const taxableMinor = Math.max(0, grossMinor - preTaxMinor);
  const statCtx: RulePackContext = {
    currency: input.currency,
    grossMinor,
    taxableMinor,
    input: stat,
  };
  appendUnique(lines, pack.statutory(statCtx));

  const finalGross = totalByType(lines, "EARNING");
  const finalDeductions = totalByType(lines, "DEDUCTION");
  return {
    currency: input.currency,
    lines,
    grossMinor: finalGross,
    deductionsMinor: finalDeductions,
    netMinor: finalGross - finalDeductions,
  };
}

/** Build a context using the current running gross; `taxableMinor` defaults to gross pre-statutory. */
function contextFor(
  currency: string,
  lines: readonly PayslipLine[],
  input: StatutoryInput,
): RulePackContext {
  const grossMinor = totalByType(lines, "EARNING");
  return { currency, grossMinor, taxableMinor: grossMinor, input };
}

function totalByType(lines: readonly PayslipLine[], type: PayslipLine["type"]): number {
  return lines.reduce((acc, l) => (l.type === type ? acc + l.amountMinor : acc), 0);
}

function sumAmounts(lines: readonly PayslipLine[]): number {
  return lines.reduce((acc, l) => acc + l.amountMinor, 0);
}

/** Append lines, rejecting any code that already exists so totals can't silently double-count. */
function appendUnique(lines: PayslipLine[], additions: readonly PayslipLine[]): void {
  const seen = new Set(lines.map((l) => l.code));
  for (const line of additions) {
    if (seen.has(line.code)) {
      throw new PayrollError(`Rule pack produced a duplicate line code "${line.code}"`);
    }
    seen.add(line.code);
    lines.push(line);
  }
}
