/** Errors thrown by the engine. All are deterministic: same bad input, same error. */

/** A formula failed to tokenize, parse, or evaluate (syntax error, unknown variable/function, etc.). */
export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaError";
  }
}

/** A payroll calculation was misconfigured (duplicate element code, currency mismatch, etc.). */
export class PayrollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollError";
  }
}
