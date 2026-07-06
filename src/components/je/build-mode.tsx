// Build mode — the student recreates the entry from a blank slate, checked against the
// computed truth. Reuses the explore ctx (schedule + resolveLine) for target amounts and
// the misconception matcher for wrong-answer feedback. Rendered on the same /je page.
import { useEffect, useMemo, useState } from "react";
import { Check, Lightbulb, Plus, RotateCcw, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { givenLineText, resolveLiteralAmount, type ExploreCtx } from "@/lib/je/explore";
import { matchMisconception } from "@/lib/je/misconception-matcher";
import { misconceptionFeedback } from "@/lib/je/misconceptions";
import {
  getVariantProgress,
  readProgress,
  recordAttempt,
  type VariantProgress,
} from "@/lib/je/build-progress";
import type { EngineLine, ScenarioDoc, Variant } from "@/lib/je-engine";

const NAVY = "#14213D";
const RED = "#CE1126";

type Side = "debit" | "credit";
interface StudentLine {
  id: string;
  account: string;
  debit: string;
  credit: string;
}
type LineStatus = "correct" | "wrong-account" | "wrong-side" | "wrong-amount";
interface LineResult {
  status: LineStatus;
  message: string;
}

let uid = 0;
const newId = () => `bl-${uid++}`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0);
  return h >>> 0;
}
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function BuildMode({
  doc,
  variant,
  explore,
  conditions,
  onSetConditions,
}: {
  doc: ScenarioDoc;
  variant: Variant;
  explore: ExploreCtx | null;
  conditions: Record<string, string>;
  onSetConditions: (c: Record<string, string>) => void;
}) {
  const bank = doc.build?.accountBank ?? [];
  const entries = variant.entries ?? [];
  const conditionsKey = JSON.stringify(conditions);

  const [currentEntry, setCurrentEntry] = useState(0);
  const [lines, setLines] = useState<StudentLine[]>([]);
  const [hintLevel, setHintLevel] = useState(0);
  const [results, setResults] = useState<Record<string, LineResult> | null>(null);
  const [summary, setSummary] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [entryDone, setEntryDone] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [progress, setProgress] = useState<Record<string, VariantProgress>>({});

  // Reset the attempt whenever the variant / conditions change (axis switch resets).
  useEffect(() => {
    setCurrentEntry(0);
    setLines([]);
    setHintLevel(0);
    setResults(null);
    setSummary(null);
    setEntryDone(false);
    setAttempts(getVariantProgress(doc.slug, variant.id).attempts);
    setProgress(readProgress(doc.slug));
  }, [variant.id, conditionsKey, doc.slug]);

  // Fresh line slate when the stepper advances to a new entry.
  useEffect(() => {
    setLines([]);
    setHintLevel(0);
    setResults(null);
    setSummary(null);
    setEntryDone(false);
  }, [currentEntry]);

  const targetEntry = entries[currentEntry];
  const targets = useMemo(
    () =>
      (targetEntry?.lines ?? []).map((l: EngineLine) => {
        const res = (explore ? explore.resolveLine(l) : null) ?? resolveLiteralAmount(l);
        return { account: l.account, side: l.side as Side, slotKey: l.amountSlotKey, amount: res?.value ?? null };
      }),
    [targetEntry, explore],
  );

  const shuffledBank = useMemo(
    () => seededShuffle(bank, hash(`${variant.id}:${currentEntry}:${attempts}`)),
    [bank, variant.id, currentEntry, attempts],
  );

  const accountLineCount = (account: string) => lines.filter((l) => l.account === account).length;
  const toggleAccount = (account: string) => {
    setLines((prev) => {
      const has = prev.some((l) => l.account === account);
      return has ? prev.filter((l) => l.account !== account) : [...prev, { id: newId(), account, debit: "", credit: "" }];
    });
    setResults(null);
    setSummary(null);
  };
  const addBlankLine = () => setLines((p) => [...p, { id: newId(), account: "", debit: "", credit: "" }]);
  const removeLine = (id: string) => setLines((p) => p.filter((l) => l.id !== id));
  const setLineField = (id: string, field: "account" | "debit" | "credit", value: string) =>
    setLines((p) => p.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[,$\s]/g, "")));

  const check = () => {
    const targetByAccount = new Map(targets.map((t) => [t.account, t]));
    const res: Record<string, LineResult> = {};
    let allLinesRight = true;

    for (const line of lines) {
      const t = targetByAccount.get(line.account);
      if (!line.account) {
        res[line.id] = { status: "wrong-account", message: "pick an account" };
        allLinesRight = false;
        continue;
      }
      if (!t) {
        res[line.id] = { status: "wrong-account", message: "not part of this entry" };
        allLinesRight = false;
        continue;
      }
      const dr = num(line.debit);
      const cr = num(line.credit);
      const studentSide: Side | null = dr != null && cr == null ? "debit" : cr != null && dr == null ? "credit" : null;
      if (!studentSide) {
        res[line.id] = { status: "wrong-side", message: dr != null && cr != null ? "put the amount on one side only" : "enter an amount" };
        allLinesRight = false;
        continue;
      }
      if (studentSide !== t.side) {
        res[line.id] = { status: "wrong-side", message: `should be a ${t.side === "debit" ? "debit" : "credit"}` };
        allLinesRight = false;
        continue;
      }
      const amount = studentSide === "debit" ? dr! : cr!;
      if (t.amount == null || Math.abs(amount - t.amount) <= 1) {
        res[line.id] = { status: "correct", message: "" };
      } else {
        const mis = explore ? matchMisconception(explore.schedule, t.slotKey, amount) : null;
        res[line.id] = { status: "wrong-amount", message: mis ? misconceptionFeedback(mis) : "wrong amount" };
        allLinesRight = false;
      }
    }

    // account-set completeness
    const studentAccounts = new Set(lines.map((l) => l.account).filter(Boolean));
    const missing = targets.filter((t) => !studentAccounts.has(t.account));
    const extra = Object.values(res).filter((r) => r.status === "wrong-account").length;

    setResults(res);
    setAttempts((a) => a + 1);

    const fullyCorrect = allLinesRight && missing.length === 0 && studentAccounts.size === targets.length;
    if (fullyCorrect) {
      setEntryDone(true);
      const isLastEntry = currentEntry >= entries.length - 1;
      if (isLastEntry) {
        recordAttempt(doc.slug, variant.id, hintLevel, true);
        setProgress(readProgress(doc.slug));
        setSummary({ kind: "success", text: entries.length > 1 ? "All entries correct — variant complete." : "Correct — variant complete." });
      } else {
        setSummary({ kind: "success", text: `Entry ${currentEntry + 1} of ${entries.length} correct.` });
      }
    } else {
      recordAttempt(doc.slug, variant.id, hintLevel, false);
      // Balance check runs last.
      const dr = lines.reduce((s, l) => s + (num(l.debit) ?? 0), 0);
      const cr = lines.reduce((s, l) => s + (num(l.credit) ?? 0), 0);
      const parts: string[] = [];
      if (missing.length) parts.push(`${missing.length} line${missing.length > 1 ? "s" : ""} missing`);
      if (extra) parts.push(`${extra} not in this entry`);
      if (Math.abs(dr - cr) > 1) parts.push("entry unbalanced");
      setSummary({ kind: "error", text: parts.length ? parts.join(" · ") : "Not quite — check the flagged lines." });
    }
  };

  const useHint = () => setHintLevel((h) => Math.min(h + 1, entries.length > 1 || doc.build?.scaffold ? 2 : 1));
  const reset = () => {
    setLines([]);
    setResults(null);
    setSummary(null);
    setHintLevel(0);
    setEntryDone(false);
  };
  const gotoVariant = (v: Variant) => onSetConditions({ ...conditions, ...v.conditions });
  const nextVariant = () => {
    const idx = doc.variants.findIndex((v) => v.id === variant.id);
    const next = doc.variants.slice(idx + 1).find((v) => !progress[v.id]?.completedAt) ?? doc.variants.find((v) => !progress[v.id]?.completedAt);
    if (next) gotoVariant(next);
  };

  const attemptNo = attempts + (summary ? 0 : 1);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {/* Header */}
      <div className="rounded-xl border-2 bg-card p-3" style={{ borderColor: NAVY }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold" style={{ color: NAVY }}>
            Build it yourself <span className="text-xs font-normal text-muted-foreground">· attempt {attemptNo}</span>
          </h2>
          {entries.length > 1 && (
            <span className="text-[11px] font-semibold text-muted-foreground">Entry {currentEntry + 1} of {entries.length}</span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-foreground/90">{targetEntry?.caption ?? doc.event}</p>
        {explore && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            <span className="font-medium">Given:</span> {givenLineText(explore.effectiveParams)}
          </p>
        )}
        {/* Axis toggles — switching resets the attempt */}
        {doc.axes.length > 0 && (
          <div className="mt-2 space-y-1">
            {doc.axes.map((axis) => (
              <div key={axis.key} className="flex flex-wrap items-center gap-1.5">
                <span className="w-28 shrink-0 text-[11px] font-semibold text-muted-foreground">{axis.label}</span>
                {axis.options.map((opt) => {
                  const on = conditions[axis.key] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onSetConditions({ ...conditions, [axis.key]: opt.value })}
                      className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium transition", on ? "text-white" : "border-border text-muted-foreground hover:text-foreground")}
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
      </div>

      {/* Account bank */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Account bank — tap to add a line</div>
        <div className="flex flex-wrap gap-1.5">
          {shuffledBank.map((a) => {
            const active = accountLineCount(a.account) > 0;
            return (
              <button
                key={a.account}
                onClick={() => toggleAccount(a.account)}
                className={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition", active ? "text-white" : "border-border text-foreground hover:border-foreground")}
                style={active ? { backgroundColor: NAVY, borderColor: NAVY } : undefined}
              >
                {a.account}
              </button>
            );
          })}
        </div>
      </div>

      {/* Entry builder grid */}
      <div className="rounded-xl border border-border bg-card p-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1 text-left font-semibold">Account</th>
              <th className="w-28 py-1 text-right font-semibold">Debit</th>
              <th className="w-28 py-1 text-right font-semibold">Credit</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-xs italic text-muted-foreground">
                  Tap accounts above to start building the entry.
                </td>
              </tr>
            )}
            {lines.map((line) => {
              const r = results?.[line.id];
              return (
                <tr key={line.id} className={cn("border-t border-border/50", r && r.status !== "correct" && "bg-rose-50/60 dark:bg-rose-950/20", r?.status === "correct" && "bg-emerald-50/60 dark:bg-emerald-950/20")}>
                  <td className="py-1">
                    <select
                      value={line.account}
                      onChange={(e) => setLineField(line.id, "account", e.target.value)}
                      className="w-full rounded border border-border bg-background px-1 py-0.5 text-sm"
                    >
                      <option value="">— pick —</option>
                      {bank.map((a) => (
                        <option key={a.account} value={a.account}>{a.account}</option>
                      ))}
                    </select>
                    {r && r.message && (
                      <div className={cn("mt-0.5 text-[11px]", r.status === "correct" ? "text-emerald-700" : "text-rose-700 dark:text-rose-300")}>{r.message}</div>
                    )}
                  </td>
                  <td className="py-1 text-right">
                    <input inputMode="numeric" value={line.debit} onChange={(e) => setLineField(line.id, "debit", e.target.value)} className="w-24 rounded border border-border bg-background px-1 py-0.5 text-right tabular-nums" placeholder="—" />
                  </td>
                  <td className="py-1 text-right">
                    <input inputMode="numeric" value={line.credit} onChange={(e) => setLineField(line.id, "credit", e.target.value)} className="w-24 rounded border border-border bg-background px-1 py-0.5 text-right tabular-nums" placeholder="—" />
                  </td>
                  <td className="py-1 text-center">
                    <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-rose-600" aria-label="remove line">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button onClick={addBlankLine} className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <Plus className="h-3 w-3" /> add a line
        </button>
      </div>

      {/* Hints */}
      {hintLevel >= 1 && doc.build?.scaffold && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[12px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <span className="font-semibold">Hint: </span>{doc.build.scaffold}
        </p>
      )}
      {hintLevel >= 2 && targets[0] && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[12px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <span className="font-semibold">First line: </span>{targets[0].account}
        </p>
      )}

      {/* Summary */}
      {summary && (
        <p
          className={cn(
            "rounded-md border p-2 text-sm font-medium",
            summary.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"
              : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200",
          )}
        >
          {summary.text}
        </p>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {!(entryDone && currentEntry >= entries.length - 1) && (
          <button onClick={check} className="rounded-md px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: NAVY }}>
            <Check className="mr-1 inline h-4 w-4" />Check entry
          </button>
        )}
        {entryDone && currentEntry < entries.length - 1 && (
          <button onClick={() => setCurrentEntry((i) => i + 1)} className="rounded-md px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: RED }}>
            Next entry →
          </button>
        )}
        <button onClick={useHint} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Lightbulb className="h-3.5 w-3.5" /> One hint{hintLevel > 0 ? ` (${hintLevel})` : ""}
        </button>
        <button onClick={reset} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      {/* Variant progress dots + Next variant */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variants</span>
        {doc.variants.map((v) => {
          const done = !!progress[v.id]?.completedAt;
          const current = v.id === variant.id;
          return (
            <button
              key={v.id}
              onClick={() => gotoVariant(v)}
              title={v.label ?? v.id}
              className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", current ? "font-semibold" : "text-muted-foreground")}
              style={current ? { borderColor: NAVY, color: NAVY } : undefined}
            >
              <span>{done ? "✓" : current ? "●" : "○"}</span>
              {v.id}
            </button>
          );
        })}
        {entryDone && currentEntry >= entries.length - 1 && (
          <button onClick={nextVariant} className="ml-auto rounded-md px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: NAVY }}>
            Next variant →
          </button>
        )}
      </div>
    </div>
  );
}
