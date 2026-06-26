import { FormulaError } from "./errors";

/**
 * A tiny, safe expression language for data-driven pay-element formulas (ADR-0002). Supports number
 * literals, the four arithmetic operators with standard precedence, parentheses, unary +/-, a fixed
 * set of whitelisted functions, and identifiers resolved from a numeric context. It is a hand-written
 * tokenizer → recursive-descent parser → AST evaluator and **never** uses `eval`/`new Function`, so a
 * formula can only ever read its context variables and call whitelisted functions — nothing else.
 *
 * Compile a formula once with {@link compile} and evaluate it many times with {@link evaluate}; the
 * calculator caches compiled formulas across employees.
 */

export type FormulaContext = Record<string, number>;

type Node =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "unary"; op: "+" | "-"; operand: Node }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node };

export interface CompiledFormula {
  readonly source: string;
  readonly ast: Node;
}

// --- Tokenizer ---------------------------------------------------------------

type Token =
  | { type: "num"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" | "," }
  | { type: "eof" };

const OPERATORS = new Set(["+", "-", "*", "/", "(", ")", ","]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (OPERATORS.has(ch)) {
      tokens.push({ type: "op", value: ch as "+" });
      i++;
      continue;
    }
    if (isDigit(ch) || ch === ".") {
      let j = i;
      let dots = 0;
      while (j < source.length && (isDigit(source[j] as string) || source[j] === ".")) {
        if (source[j] === ".") dots++;
        j++;
      }
      const text = source.slice(i, j);
      const value = Number(text);
      if (dots > 1 || Number.isNaN(value)) {
        throw new FormulaError(`Invalid number "${text}"`);
      }
      tokens.push({ type: "num", value });
      i = j;
      continue;
    }
    if (isIdentStart(ch)) {
      let j = i;
      while (j < source.length && isIdentPart(source[j] as string)) j++;
      tokens.push({ type: "ident", value: source.slice(i, j) });
      i = j;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}" at position ${i}`);
  }
  tokens.push({ type: "eof" });
  return tokens;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}
function isIdentStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}
function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

// --- Parser (recursive descent) ----------------------------------------------

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.parseAdditive();
    if (this.peek().type !== "eof") {
      throw new FormulaError("Unexpected trailing input in formula");
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.pos] as Token;
  }

  private next(): Token {
    return this.tokens[this.pos++] as Token;
  }

  private eatOp(value: string): void {
    const t = this.peek();
    if (t.type !== "op" || t.value !== value) {
      throw new FormulaError(`Expected "${value}"`);
    }
    this.pos++;
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "+" || t.value === "-")) {
        this.pos++;
        left = { kind: "binary", op: t.value, left, right: this.parseMultiplicative() };
      } else {
        return left;
      }
    }
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "*" || t.value === "/")) {
        this.pos++;
        left = { kind: "binary", op: t.value, left, right: this.parseUnary() };
      } else {
        return left;
      }
    }
  }

  private parseUnary(): Node {
    const t = this.peek();
    if (t.type === "op" && (t.value === "+" || t.value === "-")) {
      this.pos++;
      return { kind: "unary", op: t.value, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const t = this.next();
    if (t.type === "num") {
      return { kind: "num", value: t.value };
    }
    if (t.type === "ident") {
      if (this.peek().type === "op" && (this.peek() as { value: string }).value === "(") {
        return this.parseCall(t.value);
      }
      return { kind: "var", name: t.value };
    }
    if (t.type === "op" && t.value === "(") {
      const inner = this.parseAdditive();
      this.eatOp(")");
      return inner;
    }
    throw new FormulaError("Expected a number, identifier, or '('");
  }

  private parseCall(name: string): Node {
    this.eatOp("(");
    const args: Node[] = [];
    if (!(this.peek().type === "op" && (this.peek() as { value: string }).value === ")")) {
      args.push(this.parseAdditive());
      while (this.peek().type === "op" && (this.peek() as { value: string }).value === ",") {
        this.pos++;
        args.push(this.parseAdditive());
      }
    }
    this.eatOp(")");
    return { kind: "call", name, args };
  }
}

// --- Whitelisted functions ---------------------------------------------------

const FUNCTIONS: Record<string, { arity: number | "variadic"; apply: (args: number[]) => number }> =
  {
    min: { arity: "variadic", apply: (a) => Math.min(...a) },
    max: { arity: "variadic", apply: (a) => Math.max(...a) },
    abs: { arity: 1, apply: ([x]) => Math.abs(x as number) },
    floor: { arity: 1, apply: ([x]) => Math.floor(x as number) },
    ceil: { arity: 1, apply: ([x]) => Math.ceil(x as number) },
    round: { arity: 1, apply: ([x]) => roundHalfUp(x as number) },
    clamp: {
      arity: 3,
      apply: ([x, lo, hi]) => Math.min(Math.max(x as number, lo as number), hi as number),
    },
  };

function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

// --- Public API --------------------------------------------------------------

/** Parse and validate a formula into a reusable {@link CompiledFormula}. Throws {@link FormulaError}. */
export function compile(source: string): CompiledFormula {
  const ast = new Parser(tokenize(source)).parse();
  return { source, ast };
}

/** Evaluate a compiled formula against a numeric context. Throws {@link FormulaError} on any problem. */
export function evaluate(formula: CompiledFormula, context: FormulaContext): number {
  const result = evalNode(formula.ast, context);
  if (!Number.isFinite(result)) {
    throw new FormulaError(`Formula "${formula.source}" did not evaluate to a finite number`);
  }
  return result;
}

/** Convenience: compile and evaluate in one call. Prefer {@link compile} + {@link evaluate} in loops. */
export function evaluateFormula(source: string, context: FormulaContext): number {
  return evaluate(compile(source), context);
}

function evalNode(node: Node, context: FormulaContext): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "var": {
      const value = context[node.name];
      if (value === undefined) {
        throw new FormulaError(`Unknown variable "${node.name}"`);
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new FormulaError(`Variable "${node.name}" is not a finite number`);
      }
      return value;
    }
    case "unary": {
      const operand = evalNode(node.operand, context);
      return node.op === "-" ? -operand : operand;
    }
    case "binary": {
      const left = evalNode(node.left, context);
      const right = evalNode(node.right, context);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          if (right === 0) throw new FormulaError("Division by zero");
          return left / right;
      }
      break;
    }
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (!fn) {
        throw new FormulaError(`Unknown function "${node.name}"`);
      }
      const args = node.args.map((arg) => evalNode(arg, context));
      if (fn.arity === "variadic") {
        if (args.length === 0) {
          throw new FormulaError(`"${node.name}" requires at least one argument`);
        }
      } else if (args.length !== fn.arity) {
        throw new FormulaError(
          `"${node.name}" expects ${fn.arity} argument(s), got ${args.length}`,
        );
      }
      return fn.apply(args);
    }
  }
  // Unreachable: every node kind returns above. Satisfies the type checker defensively.
  throw new FormulaError("Unhandled formula node");
}
