// Slot expression resolver — PURE. Turns a ScenarioDoc slot expression into a concrete
// value + a click-through Derivation, against an AmortSchedule (which bundles the ctx the
// spec names: {params, issuePrice, schedule}).
//
// Grammar (recursive descent, standard precedence, left-assoc):
//   expr   := term  (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := number | ref | '(' expr ')' | '-' factor
//   ref    := 'param:'NAME | 'issuePrice' | 'schedule:'INT':'FIELD
//   number := INT | INT'.'INT
//
// A single plain ref returns the math core's own rich Derivation (so click-through can
// walk the chain — period 2 → prior carrying value → issue price → params). An arithmetic
// expression returns a SYNTHESIZED derivation: "= <formula with refs substituted>" plus
// each distinct plain ref as a labeled, clickable input. Values are rounded to whole
// dollars (matching the schedule's per-cell convention) so authored entries balance.

import {
  fmtUSD,
  type AmortSchedule,
  type Derivation,
  type DerivationInput,
} from "@/lib/je/amortization";
import { resolveRef } from "@/lib/je/amount-resolver";

export interface SlotResolution {
  value: number;
  derivation: Derivation;
}

const PLAIN_REF = /^(param:[A-Za-z][A-Za-z0-9]*|issuePrice|schedule:\d+:[A-Za-z]+)$/;

// ---- tokenizer ----
type Tok =
  | { t: "num"; v: number; raw: string }
  | { t: "ref"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lp" }
  | { t: "rp" };

const REF_RE = /^(param:[A-Za-z][A-Za-z0-9]*|issuePrice|schedule:\d+:[A-Za-z]+)/;
const NUM_RE = /^\d+(\.\d+)?/;

function tokenize(expr: string): Tok[] {
  const toks: Tok[] = [];
  let s = expr.trim();
  while (s.length > 0) {
    if (s[0] === " ") { s = s.slice(1); continue; }
    if (s[0] === "(") { toks.push({ t: "lp" }); s = s.slice(1); continue; }
    if (s[0] === ")") { toks.push({ t: "rp" }); s = s.slice(1); continue; }
    if ("+-*/".includes(s[0])) { toks.push({ t: "op", v: s[0] as "+" }); s = s.slice(1); continue; }
    const ref = s.match(REF_RE);
    if (ref) { toks.push({ t: "ref", v: ref[0] }); s = s.slice(ref[0].length); continue; }
    const num = s.match(NUM_RE);
    if (num) { toks.push({ t: "num", v: parseFloat(num[0]), raw: num[0] }); s = s.slice(num[0].length); continue; }
    throw new Error(`Unrecognized token near "${s}" in expression "${expr}"`);
  }
  return toks;
}

// ---- parser/evaluator — records the value AND the distinct plain refs it touched ----
function evaluate(expr: string, schedule: AmortSchedule): { value: number; refs: string[] } {
  const toks = tokenize(expr);
  let pos = 0;
  const usedRefs: string[] = [];
  const seen = new Set<string>();

  const peek = () => toks[pos];
  const nextOpIs = (...ops: string[]): boolean => {
    const tok = peek();
    return tok?.t === "op" && ops.includes(tok.v);
  };
  const refValue = (ref: string): number => {
    const hit = resolveRef(schedule, ref);
    if (!hit) throw new Error(`Unknown slot ref "${ref}" in expression "${expr}"`);
    if (!seen.has(ref)) { seen.add(ref); usedRefs.push(ref); }
    return hit.value;
  };

  const parseExpr = (): number => {
    let v = parseTerm();
    while (nextOpIs("+", "-")) {
      const op = (toks[pos] as { v: string }).v; pos++;
      const rhs = parseTerm();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (nextOpIs("*", "/")) {
      const op = (toks[pos] as { v: string }).v; pos++;
      const rhs = parseFactor();
      v = op === "*" ? v * rhs : v / rhs;
    }
    return v;
  };
  const parseFactor = (): number => {
    const tok = peek();
    if (!tok) throw new Error(`Unexpected end of expression "${expr}"`);
    if (tok.t === "num") { pos++; return tok.v; }
    if (tok.t === "ref") { pos++; return refValue(tok.v); }
    if (tok.t === "op" && tok.v === "-") { pos++; return -parseFactor(); }
    if (tok.t === "lp") {
      pos++;
      const v = parseExpr();
      if (peek()?.t !== "rp") throw new Error(`Expected ")" in expression "${expr}"`);
      pos++;
      return v;
    }
    throw new Error(`Unexpected token in expression "${expr}"`);
  };

  const value = parseExpr();
  if (pos !== toks.length) throw new Error(`Trailing tokens in expression "${expr}"`);
  return { value, refs: usedRefs };
}

// ---- human labels for refs (also used by the popover) ----
const PARAM_LABELS: Record<string, string> = {
  face: "Face value",
  statedRateAnnual: "Stated annual rate",
  marketRateAnnual: "Market annual rate",
  termYears: "Term (years)",
  paymentsPerYear: "Payments per year",
};
const FIELD_LABELS: Record<string, string> = {
  cashPayment: "cash payment",
  interestExpense: "interest expense",
  amortization: "amortization",
  carryingValueAfter: "carrying value",
};

export function labelForRef(ref: string): string {
  if (ref === "issuePrice") return "Issue price";
  const p = ref.match(/^param:(\w+)$/);
  if (p) return PARAM_LABELS[p[1]] ?? p[1];
  const c = ref.match(/^schedule:(\d+):(\w+)$/);
  if (c) return `Period ${c[1]} ${FIELD_LABELS[c[2]] ?? c[2]}`;
  return ref;
}

function round0(n: number): number {
  return Math.round(n);
}

/** Substitute plain refs with fmtUSD values, keep numeric literals raw, pretty operators. */
function substitute(expr: string, schedule: AmortSchedule): string {
  const toks = tokenize(expr);
  const parts = toks.map((tok) => {
    switch (tok.t) {
      case "num": return tok.raw;
      case "ref": return fmtUSD(resolveRef(schedule, tok.v)?.value ?? 0);
      case "op": return tok.v === "*" ? "×" : tok.v === "/" ? "÷" : tok.v === "-" ? "−" : "+";
      case "lp": return "(";
      case "rp": return ")";
    }
  });
  // join with spaces except around parens
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i];
    const prev = parts[i - 1];
    if (i === 0 || cur === ")" || prev === "(") out += cur;
    else out += " " + cur;
  }
  return out;
}

/**
 * Resolve a slot expression to {value, derivation}. Plain refs delegate to the math core
 * (rich, chainable derivation). Arithmetic exprs get a synthesized derivation. Bare literals
 * resolve to themselves ("given"). Throws (fail-loud) on any unknown ref or malformed expr.
 */
export function resolveSlot(expr: string, schedule: AmortSchedule): SlotResolution {
  const trimmed = expr.trim();

  // Single plain ref → return the math core's own derivation so click-through can chain.
  if (PLAIN_REF.test(trimmed)) {
    const hit = resolveRef(schedule, trimmed);
    if (!hit) throw new Error(`Unknown slot ref "${trimmed}"`);
    if (hit.derivation) return { value: round0(hit.value), derivation: hit.derivation };
    // params have no cell derivation — synthesize a minimal one.
    return {
      value: round0(hit.value),
      derivation: {
        value: hit.value,
        formulaText: `${labelForRef(trimmed)} (given parameter)`,
        inputs: [{ label: labelForRef(trimmed), value: hit.value, ref: trimmed }],
      },
    };
  }

  // Arithmetic (or bare literal).
  const { value, refs } = evaluate(trimmed, schedule);
  const rounded = round0(value);
  const inputs: DerivationInput[] = refs.map((ref) => ({
    label: labelForRef(ref),
    value: resolveRef(schedule, ref)!.value,
    ref,
  }));
  const formulaText =
    refs.length === 0 && /^\d+(\.\d+)?$/.test(trimmed)
      ? `${fmtUSD(rounded)} (given in the scenario)`
      : `= ${substitute(trimmed, schedule)}`;
  return { value: rounded, derivation: { value: rounded, formulaText, inputs } };
}

/** Convenience for the popover: resolve a ref/expr and also say if it is itself chainable. */
export function isPlainRef(expr: string): boolean {
  return PLAIN_REF.test(expr.trim());
}
