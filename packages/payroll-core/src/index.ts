/**
 * `@payce/payroll-core` — the pure, deterministic payroll calculation engine (ADR-0002). No I/O, no
 * clock, no randomness: a published run reproduces exactly from its stored inputs. Country rule packs
 * and run orchestration are built on top of this kernel in later Phase 3 slices.
 */

export { FormulaError, PayrollError } from "./errors";
export {
  add,
  DEFAULT_ROUNDING,
  format,
  isZero,
  type Money,
  money,
  multiply,
  negate,
  type RoundingMode,
  roundToMinor,
  subtract,
  sum,
  zero,
} from "./money";
export {
  compile,
  type CompiledFormula,
  evaluate,
  evaluateFormula,
  type FormulaContext,
} from "./formula";
export type { PayElementDef, PayElementType } from "./pay-element";
export {
  calculate,
  calculatePayslip,
  compileElements,
  type CompiledPayElement,
  type PayrollInput,
  type PayslipLine,
  type PayslipResult,
} from "./calculate";
export {
  bracketTax,
  type CountryRulePack,
  type DeductionRules,
  type EarningsRules,
  type RulePackContext,
  type StatutoryInput,
  type StatutoryRules,
  type TaxBracket,
} from "./rule-pack";
export { type PayrollRunInput, runPayroll } from "./run";
export { inRulePack, rulePacks, ukRulePack, usRulePack } from "./rules";
