// Explore-mode UI for /je — the panels that render ScenarioDoc v2's numbers layer.
// Prop-driven and presentational; the route owns state and the slot resolver (explore.ts).
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  fmtPct,
  fmtUSD,
  type AmortSchedule,
  type BondParams,
  type BondPricing,
  type Derivation,
} from "@/lib/je/amortization";
import { givenLineText } from "@/lib/je/explore";
import type { SlotResolution } from "@/lib/je/slot-resolver";
import { resolveComputationPath, type MemorizeItem, type ScenarioDoc, type Variant } from "@/lib/je-engine";
import { resolveLiteralAmount, type ExploreCtx } from "@/lib/je/explore";

const NAVY = "#14213D";
const RED = "#CE1126";
const GOLD = "#FCA311"; // trace-glow accent

const glows = (ref: string | undefined, glowRefs: Set<string>) => !!ref && glowRefs.has(ref);

// ============================================================================
// "Given:" problem-statement line (replaces the chip row) + inline New-numbers refresh
// ============================================================================
export function GivenLine({
  params,
  seed,
  onNewNumbers,
}: {
  params: BondParams;
  seed: number;
  onNewNumbers: () => void;
}) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
      <span>
        <span className="font-medium">Given:</span> {givenLineText(params)}
      </span>
      <button
        onClick={onNewNumbers}
        title={`Generate fresh numbers (seed #${seed})`}
        aria-label="New numbers"
        className="inline-flex items-center rounded p-0.5 transition hover:bg-muted hover:text-foreground"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </p>
  );
}

// ============================================================================
// Click-through derivation popover (chainable)
// ============================================================================
export interface PopoverState {
  derivation: Derivation;
  x: number;
  y: number;
}

export function DerivationPopover({
  state,
  resolve,
  onClose,
}: {
  state: PopoverState;
  resolve?: (expr: string) => SlotResolution; // absent for literal-only docs (no ref chain)
  onClose: () => void;
}) {
  // Chain stack — clicking a ref input pushes its own derivation.
  const [stack, setStack] = useState<Derivation[]>([state.derivation]);
  useEffect(() => setStack([state.derivation]), [state.derivation]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = stack[stack.length - 1];
  const walk = (ref: string) => {
    if (!resolve) return;
    try {
      setStack((s) => [...s, resolve(ref).derivation]);
    } catch {
      /* unresolvable — ignore */
    }
  };

  // clamp near the click point
  const left = Math.min(state.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 320);
  const top = Math.min(state.y + 12, (typeof window !== "undefined" ? window.innerHeight : 800) - 220);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-[300px] rounded-lg border-2 bg-card p-3 shadow-lg"
        style={{ left: Math.max(8, left), top: Math.max(8, top), borderColor: NAVY }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2">
          {stack.length > 1 && (
            <button onClick={() => setStack((s) => s.slice(0, -1))} className="text-[11px] text-muted-foreground hover:text-foreground">
              ← back
            </button>
          )}
          <span className="text-lg font-bold tabular-nums" style={{ color: NAVY }}>{fmtUSD(current.value)}</span>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-foreground/90">{current.formulaText}</p>
        {current.inputs.length > 0 && (
          <div className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
            {current.inputs.map((inp, i) => {
              const clickable = !!inp.ref;
              return (
                <button
                  key={i}
                  disabled={!clickable}
                  onClick={() => inp.ref && walk(inp.ref)}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-[11px]",
                    clickable ? "hover:bg-muted cursor-pointer" : "cursor-default",
                  )}
                >
                  <span className={cn("text-muted-foreground", clickable && "underline decoration-dotted")}>{inp.label}</span>
                  <span className="tabular-nums font-medium">{fmtUSD(inp.value)}</span>
                </button>
              );
            })}
            {current.inputs.some((i) => i.ref) && (
              <p className="pt-1 text-[9px] text-muted-foreground">click an underlined input to trace it further</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// A rendered, click-through amount
// ============================================================================
export function Amount({
  res,
  slotRef,
  glowRefs,
  onOpen,
  className,
}: {
  res: SlotResolution;
  slotRef?: string;
  glowRefs: Set<string>;
  onOpen: (d: Derivation, x: number, y: number) => void;
  className?: string;
}) {
  return (
    <button
      onClick={(e) => onOpen(res.derivation, e.clientX, e.clientY)}
      className={cn(
        "rounded px-1 tabular-nums transition hover:bg-muted",
        glows(slotRef, glowRefs) && "ring-2 ring-offset-1",
        className,
      )}
      style={glows(slotRef, glowRefs) ? { boxShadow: `0 0 0 2px ${GOLD}` } : undefined}
      title="Click to see how this number is computed"
    >
      {fmtUSD(res.value)}
    </button>
  );
}

// ============================================================================
// MiniEntry — read-only, resolved entry display (shared by the chapter grid).
// Renders account names + Dr/Cr with amounts resolved from the doc's own params/literals;
// computation docs render their computationPath's final step. Amounts stay click-through.
// ============================================================================
function tryResolveExpr(explore: ExploreCtx | null, ref: string): SlotResolution | null {
  if (!explore) return null;
  try {
    return explore.resolve(ref);
  } catch {
    return null;
  }
}

export function MiniEntry({
  variant,
  conditions,
  explore,
  onOpen,
}: {
  variant: Variant;
  conditions: Record<string, string>;
  explore: ExploreCtx | null;
  onOpen: (d: Derivation, x: number, y: number) => void;
}) {
  const entries = variant.entries ?? [];

  if (entries.length === 0) {
    const cp = resolveComputationPath(variant, conditions);
    const last = cp?.steps?.[cp.steps.length - 1];
    const res = last?.resultSlotKey ? tryResolveExpr(explore, last.resultSlotKey) : null;
    if (!cp) return <span className="text-[10px] italic text-muted-foreground">—</span>;
    return (
      <div className="text-[11px]">
        <div className="font-medium">{last?.label ?? "Result"}</div>
        {res ? (
          <Amount res={res} slotRef={last?.resultSlotKey} glowRefs={NO_GLOW_MINI} onOpen={onOpen} className="font-semibold" />
        ) : (
          <span className="text-muted-foreground">{last?.formulaText ?? cp.narration.slice(0, 40)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((e) => (
        <table key={e.id} className="w-full text-[11px]" title={e.caption ?? undefined}>
          <tbody>
            {e.lines.map((l) => {
              const amt = (explore ? explore.resolveLine(l) : null) ?? resolveLiteralAmount(l);
              return (
                <tr key={l.id}>
                  <td className={cn("pr-2", l.side === "credit" && "pl-3")}>{l.account}</td>
                  <td className="w-16 text-right tabular-nums">
                    {l.side === "debit" &&
                      (amt ? <Amount res={amt} slotRef={amt.slotRef} glowRefs={NO_GLOW_MINI} onOpen={onOpen} className="ml-auto" /> : (l.label || "—"))}
                  </td>
                  <td className="w-16 text-right tabular-nums">
                    {l.side === "credit" &&
                      (amt ? <Amount res={amt} slotRef={amt.slotRef} glowRefs={NO_GLOW_MINI} onOpen={onOpen} className="ml-auto" /> : (l.label || "—"))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}
const NO_GLOW_MINI = new Set<string>();

// ============================================================================
// Amortization schedule panel
// ============================================================================
export function ScheduleTable({
  schedule,
  selectedPeriod,
  onSelectPeriod,
  onOpen,
  glowRefs,
}: {
  schedule: AmortSchedule;
  selectedPeriod: number;
  onSelectPeriod: (p: number) => void;
  onOpen: (d: Derivation, x: number, y: number) => void;
  glowRefs: Set<string>;
}) {
  const cell = (res: SlotResolution, ref: string) => (
    <Amount res={res} slotRef={ref} glowRefs={glowRefs} onOpen={onOpen} className="w-full text-right" />
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-2 text-left">#</th>
            <th className="py-1 pr-2 text-left">Date</th>
            <th className="py-1 pr-2 text-right">Cash</th>
            <th className="py-1 pr-2 text-right">Interest</th>
            <th className="py-1 pr-2 text-right">Amort.</th>
            <th className="py-1 text-right">Carrying value</th>
          </tr>
        </thead>
        <tbody>
          {/* Period 0 — issue price */}
          <tr className={cn("border-t border-border/50", selectedPeriod === 0 && "bg-amber-100/50 dark:bg-amber-900/20")}>
            <td className="py-1 pr-2 text-muted-foreground">0</td>
            <td className="py-1 pr-2 text-muted-foreground">{schedule.params.issueDate}</td>
            <td className="py-1 pr-2 text-right text-muted-foreground">—</td>
            <td className="py-1 pr-2 text-right text-muted-foreground">—</td>
            <td className="py-1 pr-2 text-right text-muted-foreground">—</td>
            <td className="py-1 text-right">
              {cell({ value: schedule.issuePrice, derivation: schedule.issuePriceDerivation }, "issuePrice")}
            </td>
          </tr>
          {schedule.rows.map((r) => {
            const sel = selectedPeriod === r.period;
            return (
              <tr
                key={r.period}
                onClick={() => onSelectPeriod(r.period)}
                className={cn(
                  "cursor-pointer border-t border-border/50 hover:bg-muted/40",
                  sel && "bg-amber-100/60 dark:bg-amber-900/30",
                )}
              >
                <td className="py-1 pr-2 font-medium">{r.period}</td>
                <td className="py-1 pr-2 text-muted-foreground">{r.date}</td>
                <td className="py-1 pr-2 text-right">{cell(res(r.cashPayment, r.derivations.cashPayment), `schedule:${r.period}:cashPayment`)}</td>
                <td className="py-1 pr-2 text-right">{cell(res(r.interestExpense, r.derivations.interestExpense), `schedule:${r.period}:interestExpense`)}</td>
                <td className="py-1 pr-2 text-right">{cell(res(r.amortization, r.derivations.amortization), `schedule:${r.period}:amortization`)}</td>
                <td className="py-1 text-right font-medium">{cell(res(r.carryingValueAfter, r.derivations.carryingValueAfter), `schedule:${r.period}:carryingValueAfter`)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
const res = (value: number, derivation: Derivation): SlotResolution => ({ value, derivation });

// ============================================================================
// Lifecycle T-accounts (the discount/premium draining to zero is the star)
// ============================================================================
export function LifeTAccounts({
  schedule,
  pricing,
  selectedPeriod,
  onSelectPeriod,
}: {
  schedule: AmortSchedule;
  pricing: BondPricing;
  selectedPeriod: number;
  onSelectPeriod: (p: number) => void;
}) {
  if (pricing === "par") {
    return <p className="text-xs italic text-muted-foreground">At par there is no premium/discount to amortize — nothing drains over the life.</p>;
  }
  const isDiscount = pricing === "discount";
  const acctName = isDiscount ? "Discount on Bonds Payable" : "Premium on Bonds Payable";
  const opening = schedule.totalAmortizable;
  // running balance of the contra/adjunct, draining to zero
  let bal = opening;
  const postings = schedule.rows.map((r) => {
    bal -= r.amortization;
    return { period: r.period, date: r.date, amort: r.amortization, bal: Math.max(0, Math.round(bal)) };
  });

  // cumulative interest expense
  let cum = 0;
  const ie = schedule.rows.map((r) => {
    cum += r.interestExpense;
    return { period: r.period, ie: r.interestExpense, cum };
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Discount/Premium life account */}
      <div className="rounded-md border border-border p-2">
        <div className="border-b-2 border-foreground/70 pb-0.5 text-center text-[11px] font-semibold">{acctName}</div>
        <div className="mt-1 space-y-0.5 text-[10px]">
          <div className="flex justify-between text-muted-foreground">
            <span>Opening (at issue)</span>
            <span className="tabular-nums font-medium">{isDiscount ? "" : ""}{fmtUSD(opening)} {isDiscount ? "Dr" : "Cr"}</span>
          </div>
          {postings.map((p) => (
            <button
              key={p.period}
              onClick={() => onSelectPeriod(p.period)}
              className={cn(
                "flex w-full justify-between rounded px-1 hover:bg-muted",
                selectedPeriod === p.period && "bg-amber-100/60 dark:bg-amber-900/30",
              )}
            >
              <span className="text-muted-foreground">P{p.period} amortize {isDiscount ? "(Cr)" : "(Dr)"}</span>
              <span className="tabular-nums">−{fmtUSD(p.amort)} → <span className="font-medium">{fmtUSD(p.bal)}</span></span>
            </button>
          ))}
          <div className="flex justify-between border-t border-border/60 pt-0.5 font-semibold">
            <span>At maturity</span>
            <span className="tabular-nums">0</span>
          </div>
        </div>
      </div>
      {/* Cumulative interest expense */}
      <div className="rounded-md border border-border p-2">
        <div className="border-b-2 border-foreground/70 pb-0.5 text-center text-[11px] font-semibold">Interest Expense (cumulative)</div>
        <div className="mt-1 space-y-0.5 text-[10px]">
          {ie.map((x) => (
            <button
              key={x.period}
              onClick={() => onSelectPeriod(x.period)}
              className={cn(
                "flex w-full justify-between rounded px-1 hover:bg-muted",
                selectedPeriod === x.period && "bg-amber-100/60 dark:bg-amber-900/30",
              )}
            >
              <span className="text-muted-foreground">P{x.period} (Dr)</span>
              <span className="tabular-nums">{fmtUSD(x.ie)} → <span className="font-medium">{fmtUSD(x.cum)}</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Balance-sheet presentation block (anchored to the selected period)
// ============================================================================
export function PresentationBlock({
  schedule,
  selectedPeriod,
  pricing,
  onOpen,
  glowRefs,
}: {
  schedule: AmortSchedule;
  selectedPeriod: number;
  pricing: BondPricing;
  onOpen: (d: Derivation, x: number, y: number) => void;
  glowRefs: Set<string>;
}) {
  const face = schedule.params.face;
  const cv = selectedPeriod === 0 ? schedule.issuePrice : schedule.rows[selectedPeriod - 1]?.carryingValueAfter ?? schedule.issuePrice;
  const cvRef = selectedPeriod === 0 ? "issuePrice" : `schedule:${selectedPeriod}:carryingValueAfter`;
  const cvDeriv = selectedPeriod === 0 ? schedule.issuePriceDerivation : schedule.rows[selectedPeriod - 1]?.derivations.carryingValueAfter;
  const diff = Math.abs(face - cv);
  const asOf = selectedPeriod === 0 ? schedule.params.issueDate : schedule.rows[selectedPeriod - 1]?.date;

  // income: interest for the selected period + YTD within its calendar (fiscal) year
  const selRow = selectedPeriod > 0 ? schedule.rows[selectedPeriod - 1] : null;
  const ytd = selRow
    ? schedule.rows
        .filter((r) => r.period <= selRow.period && r.date.slice(0, 4) === selRow.date.slice(0, 4))
        .reduce((t, r) => t + r.interestExpense, 0)
    : 0;

  const line = (label: string, value: number, ref?: string, deriv?: Derivation, indent = false, paren = false) => (
    <div className={cn("flex items-baseline justify-between gap-2", indent && "pl-4")}>
      <span className={cn("text-muted-foreground", glows(ref, glowRefs) && "font-semibold")}>{label}</span>
      <span className="flex-1 border-b border-dotted border-border/60" />
      {deriv ? (
        <Amount
          res={{ value, derivation: deriv }}
          slotRef={ref}
          glowRefs={glowRefs}
          onOpen={onOpen}
          className="font-medium"
        />
      ) : (
        <span className={cn("tabular-nums font-medium", glows(ref, glowRefs) && "rounded", )} style={glows(ref, glowRefs) ? { boxShadow: `0 0 0 2px ${GOLD}` } : undefined}>
          {paren ? `(${fmtUSD(value)})` : fmtUSD(value)}
        </span>
      )}
    </div>
  );

  return (
    <div className="rounded-md border border-border bg-muted/10 p-2 text-[12px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Balance sheet — long-term liabilities</span>
        <span className="text-[10px] text-muted-foreground">as of {asOf}</span>
      </div>
      {line("Bonds payable", face)}
      {pricing === "discount"
        ? line("Less: Discount on Bonds Payable", diff, undefined, undefined, true, true)
        : pricing === "premium"
          ? line("Plus: Premium on Bonds Payable", diff, undefined, undefined, true, false)
          : null}
      <div className="mt-0.5 border-t border-foreground/40 pt-0.5">
        {line("Carrying value", cv, cvRef, cvDeriv ?? undefined)}
      </div>
      {selRow && (
        <div className="mt-2 border-t border-border/60 pt-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Income statement (period {selRow.period})</div>
          {line("Interest expense (this period)", selRow.interestExpense, `schedule:${selRow.period}:interestExpense`, selRow.derivations.interestExpense)}
          {line(`Interest expense (YTD ${selRow.date.slice(0, 4)})`, ytd)}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Memorize section
// ============================================================================
const KIND_STYLE: Record<MemorizeItem["kind"], { label: string; tint: string }> = {
  formula: { label: "Formula", tint: "border-border bg-card" },
  mnemonic: { label: "Mnemonic", tint: "border-border bg-card" },
  tip: { label: "Tip", tint: "border-border bg-card" },
  watchout: { label: "Watch out", tint: "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20" },
};

/** Tap-to-reveal blank for cloze-mode formulas. */
function ClozeBlank({ answer }: { answer: string }) {
  const [shown, setShown] = useState(false);
  return (
    <button
      onClick={() => setShown(true)}
      className={cn(
        "rounded px-1 font-semibold transition",
        shown ? "text-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
      title={shown ? undefined : "Tap to reveal"}
    >
      {shown ? answer : "▢▢▢"}
    </button>
  );
}

/** Formula body → prose with the answer (between the first "=" and the next . or ;) blanked. */
function FormulaCloze({ body }: { body: string }) {
  const eq = body.indexOf("=");
  if (eq < 0) return <>{body}</>;
  const before = body.slice(0, eq + 1);
  const after = body.slice(eq + 1);
  const m = after.match(/^(\s*)([^.;]*)(.*)$/s);
  if (!m || !m[2].trim()) return <>{body}</>;
  return (
    <>
      {before}
      {m[1]}
      <ClozeBlank answer={m[2].trim()} />
      {m[3]}
    </>
  );
}

export function MemorizeSection({
  items,
  collapsed,
  onToggleCollapsed,
  activeTraceRefs,
  onToggleTraceRef,
  cloze = false,
}: {
  items: MemorizeItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  activeTraceRefs: Set<string>;
  onToggleTraceRef: (ref: string) => void;
  cloze?: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <button onClick={onToggleCollapsed} className="flex w-full items-center gap-2 px-3 py-2">
        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        <h2 className="text-sm font-semibold" style={{ color: NAVY }}>Memorize</h2>
        <span className="text-[11px] text-muted-foreground">({items.length})</span>
      </button>
      {!collapsed && (
        <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
          {items.map((m, i) => {
            const style = KIND_STYLE[m.kind];
            return (
              <div key={i} className={cn("rounded-lg border p-2 text-[12px]", style.tint)}>
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {m.kind === "watchout" ? <span style={{ color: RED }}>{style.label}</span> : style.label}
                </div>
                <p className="text-foreground/90">
                  {cloze && m.kind === "formula" ? <FormulaCloze body={m.body} /> : m.body}
                </p>
                {(m.traceRefs ?? []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(m.traceRefs ?? []).map((ref) => {
                      const on = activeTraceRefs.has(ref);
                      return (
                        <button
                          key={ref}
                          onClick={() => onToggleTraceRef(ref)}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[9px] transition",
                            on ? "text-white" : "border-border text-muted-foreground hover:border-foreground",
                          )}
                          style={on ? { backgroundColor: GOLD, borderColor: GOLD } : undefined}
                          title="Highlight everywhere this value appears"
                        >
                          trace: {refShort(ref)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function refShort(ref: string): string {
  if (ref === "issuePrice") return "issue price";
  const c = ref.match(/^schedule:(\d+):(\w+)$/);
  if (c) return `P${c[1]} ${c[2].replace(/([A-Z])/g, " $1").trim().toLowerCase()}`;
  return ref.replace("param:", "");
}
