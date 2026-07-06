// Present mode — a keyboard-driven reveal stepper over Explore's pieces, for filming.
// Admin-only. Everything starts hidden except the scenario title + event; →/space reveals
// the next element in a fixed order (skipping sections the doc lacks); ← steps back; c
// toggles clean-screen chrome. Amount popovers still fire on click (the "where did this
// number come from" moment). Reuses the explore sub-components — no new layout logic.
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Derivation } from "@/lib/je/amortization";
import { givenLineText, resolveLiteralAmount, type ExploreCtx } from "@/lib/je/explore";
import { Amount, LifeTAccounts, PresentationBlock, ScheduleTable } from "@/components/je/explore";
import { formatEvent } from "@/lib/je/explore";
import type { MemorizeItem, ScenarioDoc, Variant } from "@/lib/je-engine";

const NAVY = "#14213D";
const NO_GLOW = new Set<string>();

const PRESENT_CSS = `
@keyframes jePresentFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.je-present-reveal { animation: jePresentFade 260ms ease-out; }
@media (prefers-reduced-motion: reduce) { .je-present-reveal { animation: none; } }
`;

export function PresentMode({
  doc,
  variant,
  explore,
  conditions,
  onSetConditions,
  onOpen,
  onCleanToggle,
}: {
  doc: ScenarioDoc;
  variant: Variant | null;
  explore: ExploreCtx | null;
  conditions: Record<string, string>;
  onSetConditions: (c: Record<string, string>) => void;
  onOpen: (d: Derivation, x: number, y: number) => void;
  onCleanToggle: () => void;
}) {
  const entries = variant?.entries ?? [];
  const compSteps = (!entries.length && variant?.computationPaths?.length ? variant.computationPaths : [])
    .flatMap((p) => (matchPath(p, conditions) ? p.steps ?? [] : []));

  // ---- Build the reveal plan from what the doc actually has. Step 0 = title+event only. ----
  const plan = useMemo(() => {
    let n = 0;
    const p: {
      paramChips?: number;
      axes?: number;
      entryLines: { entryId: string; caption?: string; line: any; step: number }[];
      compSteps: { step: number; label: string; formulaText?: string; resultSlotKey?: string }[];
      schedule?: number;
      highlight?: number;
      tAccount?: number;
      presentation?: number;
      memorize: { step: number; item: MemorizeItem }[];
    } = { entryLines: [], compSteps: [], memorize: [] };
    if (explore) p.paramChips = ++n;
    if (doc.axes.length) p.axes = ++n;
    for (const e of entries) for (const l of e.lines) p.entryLines.push({ entryId: e.id, caption: e.caption, line: l, step: ++n });
    for (const s of compSteps) p.compSteps.push({ step: ++n, label: s.label, formulaText: s.formulaText, resultSlotKey: s.resultSlotKey });
    if (explore) p.schedule = ++n;
    if (explore) p.highlight = ++n;
    if (explore && explore.pricing !== "par") p.tAccount = ++n;
    if (explore) p.presentation = ++n;
    for (const m of doc.memorize ?? []) p.memorize.push({ step: ++n, item: m });
    return { ...p, total: n };
  }, [doc, variant?.id, explore, JSON.stringify(conditions)]);

  const [step, setStep] = useState(0);
  const [periodOverride, setPeriodOverride] = useState<number | null>(null);
  useEffect(() => { setStep(0); setPeriodOverride(null); }, [variant?.id, JSON.stringify(conditions)]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setStep((s) => Math.min(s + 1, plan.total));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStep((s) => Math.max(0, s - 1));
      } else if (e.key === "c" || e.key === "C") {
        onCleanToggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan.total, onCleanToggle]);

  const shown = (s: number | undefined) => s !== undefined && step >= s;
  const fade = (s: number | undefined) => (s !== undefined && step === s ? "je-present-reveal" : "");
  const selectedPeriod = periodOverride ?? (plan.highlight !== undefined && step >= plan.highlight ? 1 : 0);

  const amountFor = (line: any) => (explore ? explore.resolveLine(line) : null) ?? resolveLiteralAmount(line);

  return (
    <div className="mx-auto max-w-3xl" style={{ zoom: 1.15 }}>
      <style>{PRESENT_CSS}</style>

      {/* Always-visible: title + event */}
      <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{doc.title}</h1>
      <p className="mt-1 text-base text-foreground/90">{formatEvent(doc.event, explore?.effectiveParams)}</p>

      {/* Param chips (Given line) */}
      {explore && shown(plan.paramChips) && (
        <p className={cn("mt-2 text-sm text-muted-foreground", fade(plan.paramChips))}>
          <span className="font-medium">Given:</span> {givenLineText(explore.effectiveParams)}
        </p>
      )}

      {/* Axis toggles (interactive — toggling re-derives) */}
      {shown(plan.axes) && doc.axes.length > 0 && (
        <div className={cn("mt-3 space-y-2", fade(plan.axes))}>
          {doc.axes.map((axis) => (
            <div key={axis.key} className="flex flex-wrap items-center gap-2">
              <span className="w-32 shrink-0 text-xs font-semibold text-muted-foreground">{axis.label}</span>
              {axis.options.map((opt) => {
                const on = conditions[axis.key] === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => onSetConditions({ ...conditions, [axis.key]: opt.value })}
                    className={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition", on ? "text-white" : "border-border text-muted-foreground hover:text-foreground")}
                    style={on ? { backgroundColor: NAVY, borderColor: NAVY } : undefined}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Journal entry — one line at a time */}
      {plan.entryLines.length > 0 && plan.entryLines.some((u) => step >= u.step) && (
        <div className="mt-4 space-y-3">
          {entries.map((e) => {
            const revealed = plan.entryLines.filter((u) => u.entryId === e.id && step >= u.step);
            if (revealed.length === 0) return null;
            return (
              <div key={e.id}>
                {e.caption && <div className="mb-1 text-[11px] font-medium text-muted-foreground">{e.caption}</div>}
                <table className="w-full text-base">
                  <tbody>
                    {revealed.map((u) => {
                      const l = u.line;
                      const amt = amountFor(l);
                      return (
                        <tr key={l.id} className={cn("border-t border-border/50", fade(u.step))}>
                          <td className={cn("py-1", l.side === "credit" && "pl-8")}>
                            <span className="font-medium">{l.account}</span>
                          </td>
                          <td className="w-28 py-1 text-right tabular-nums">
                            {l.side === "debit" && (amt ? <Amount res={amt} slotRef={amt.slotRef} glowRefs={NO_GLOW} onOpen={onOpen} className="ml-auto" /> : l.label)}
                          </td>
                          <td className="w-28 py-1 text-right tabular-nums">
                            {l.side === "credit" && (amt ? <Amount res={amt} slotRef={amt.slotRef} glowRefs={NO_GLOW} onOpen={onOpen} className="ml-auto" /> : l.label)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Computation steps (for no-entry scenarios) — one at a time */}
      {plan.compSteps.length > 0 && plan.compSteps.some((u) => step >= u.step) && (
        <ol className="mt-4 space-y-1">
          {plan.compSteps.filter((u) => step >= u.step).map((u) => {
            const res = u.resultSlotKey && explore ? tryResolve(explore, u.resultSlotKey) : null;
            return (
              <li key={u.step} className={cn("flex flex-wrap items-baseline gap-2 border-t border-border/40 py-1.5 text-base", fade(u.step))}>
                <span className="font-medium">{u.label}</span>
                {u.formulaText && <span className="font-mono text-xs text-muted-foreground">{u.formulaText}</span>}
                {res && <span className="ml-auto"><Amount res={res} slotRef={u.resultSlotKey} glowRefs={NO_GLOW} onOpen={onOpen} className="font-semibold" /></span>}
              </li>
            );
          })}
        </ol>
      )}

      {/* Schedule */}
      {explore && shown(plan.schedule) && (
        <div className={cn("mt-4 rounded-xl border border-border bg-card p-3", fade(plan.schedule))}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amortization schedule</div>
          <ScheduleTable schedule={explore.schedule} selectedPeriod={selectedPeriod} onSelectPeriod={setPeriodOverride} onOpen={onOpen} glowRefs={NO_GLOW} />
        </div>
      )}

      {/* Lifecycle T-account */}
      {explore && shown(plan.tAccount) && (
        <div className={cn("mt-4 rounded-xl border border-border bg-card p-3", fade(plan.tAccount))}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Over the life</div>
          <LifeTAccounts schedule={explore.schedule} pricing={explore.pricing} selectedPeriod={selectedPeriod} onSelectPeriod={setPeriodOverride} />
        </div>
      )}

      {/* Presentation */}
      {explore && shown(plan.presentation) && (
        <div className={cn("mt-4", fade(plan.presentation))}>
          <PresentationBlock schedule={explore.schedule} selectedPeriod={selectedPeriod} pricing={explore.pricing} onOpen={onOpen} glowRefs={NO_GLOW} />
        </div>
      )}

      {/* Memorize cards — one at a time */}
      {plan.memorize.some((u) => step >= u.step) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {plan.memorize.filter((u) => step >= u.step).map((u) => (
            <div key={u.step} className={cn("rounded-lg border p-3 text-base", u.item.kind === "watchout" ? "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20" : "border-border bg-card", fade(u.step))}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{u.item.kind}</div>
              <p className="text-foreground/90">{u.item.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Subtle step counter */}
      <div className="pointer-events-none fixed bottom-3 right-4 z-30 rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] text-muted-foreground">
        {step} / {plan.total} · → reveal · ← back · c clean
      </div>
    </div>
  );
}

function matchPath(p: { appliesWhen?: Record<string, string> }, conditions: Record<string, string>): boolean {
  if (!p.appliesWhen) return true;
  return Object.entries(p.appliesWhen).every(([k, v]) => conditions[k] === v);
}
function tryResolve(explore: ExploreCtx, ref: string) {
  try {
    return explore.resolve(ref);
  } catch {
    return null;
  }
}
