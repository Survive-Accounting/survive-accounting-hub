// Chapter hub — the guided study path — plus the chapter Memorize deck and generated
// Practice mix. All read the same scenarios the /je route already loaded; progress comes
// from Prompt 3's localStorage (readProgress). Practice reuses resolveSlot for answers.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, GraduationCap, Layers, PlayCircle, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtUSD } from "@/lib/je/amortization";
import { buildExplore, formatEvent } from "@/lib/je/explore";
import { resolveSlot } from "@/lib/je/slot-resolver";
import { misconceptionFeedback } from "@/lib/je/misconceptions";
import { readProgress } from "@/lib/je/build-progress";
import type { MemorizeItem, ScenarioDoc } from "@/lib/je-engine";

const NAVY = "#14213D";
const RED = "#CE1126";

export interface HubScenario {
  slug: string;
  title: string;
  doc: ScenarioDoc;
}

function defaultConditions(doc: ScenarioDoc): Record<string, string> {
  const c: Record<string, string> = {};
  for (const a of doc.axes) c[a.key] = a.options[0]?.value ?? "";
  return c;
}

type Status = "done" | "partial" | "none";
function scenarioStatus(doc: ScenarioDoc, prog: Record<string, { completedAt: string | null }>) {
  const total = doc.variants.length;
  const built = doc.variants.filter((v) => prog[v.id]?.completedAt).length;
  const status: Status = built === 0 ? "none" : built >= total ? "done" : "partial";
  return { built, total, status };
}
const StatusIcon = ({ status }: { status: Status }) => (
  <span className={cn("text-sm", status === "done" ? "text-emerald-600" : status === "partial" ? "text-amber-500" : "text-muted-foreground")}>
    {status === "done" ? "✓" : status === "partial" ? "◐" : "○"}
  </span>
);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================================
// HUB — study path
// ============================================================================
export function Hub({
  courseLabel,
  chapterLabel,
  scenarios,
  onOpen,
  onDeck,
  onPractice,
}: {
  courseLabel: string;
  chapterLabel: string;
  scenarios: HubScenario[];
  onOpen: (slug: string, mode: "explore" | "build") => void;
  onDeck: () => void;
  onPractice: () => void;
}) {
  const [prog, setProg] = useState<Record<string, Record<string, { completedAt: string | null }>>>({});
  useEffect(() => {
    const p: typeof prog = {};
    for (const s of scenarios) p[s.slug] = readProgress(s.slug);
    setProg(p);
  }, [scenarios]);

  const statuses = scenarios.map((s) => ({ s, ...scenarioStatus(s.doc, prog[s.slug] ?? {}) }));
  const builtCount = statuses.filter((x) => x.status === "done").length;
  const memorizeCount = scenarios.reduce((n, s) => n + (s.doc.memorize?.length ?? 0), 0);
  const questionCount = scenarios.reduce((n, s) => n + (s.doc.questions?.length ?? 0), 0);
  const firstIncomplete = statuses.find((x) => x.status !== "done")?.s.slug ?? null;

  // group by doc.group (default "Scenarios"), preserving first-seen order
  const groups: { name: string; rows: typeof statuses }[] = [];
  for (const row of statuses) {
    const name = row.s.doc.group?.trim() || "Scenarios";
    let g = groups.find((x) => x.name === name);
    if (!g) { g = { name, rows: [] }; groups.push(g); }
    g.rows.push(row);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-xl border-2 bg-card p-4" style={{ borderColor: NAVY }}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{courseLabel}</div>
        <h1 className="text-xl font-bold" style={{ color: NAVY }}>{chapterLabel}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{builtCount} of {scenarios.length} built</span> · start at the top, build each one before moving on.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={onDeck} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:border-foreground">
            <Layers className="h-3.5 w-3.5" /> Memorize deck ({memorizeCount})
          </button>
          <button onClick={onPractice} disabled={questionCount === 0} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" style={{ backgroundColor: NAVY }}>
            <GraduationCap className="h-3.5 w-3.5" /> Practice mix
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</div>
            <div className="space-y-1.5">
              {g.rows.map(({ s, built, total, status }) => {
                const isNext = s.slug === firstIncomplete;
                return (
                  <div key={s.slug} className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-2.5", isNext ? "bg-amber-50/40 dark:bg-amber-950/10" : "border-border")} style={isNext ? { borderColor: NAVY } : undefined}>
                    <StatusIcon status={status} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{s.title}</div>
                      <div className="text-[11px] text-muted-foreground">{built} of {total} variant{total > 1 ? "s" : ""} built</div>
                    </div>
                    {s.doc.videoUrl && (
                      <a href={s.doc.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium hover:border-foreground">
                        <PlayCircle className="h-3.5 w-3.5" /> Watch
                      </a>
                    )}
                    <button onClick={() => onOpen(s.slug, "explore")} className="rounded border border-border px-2 py-1 text-[11px] font-medium hover:border-foreground">Explore</button>
                    <button
                      onClick={() => onOpen(s.slug, "build")}
                      className={cn("rounded px-2 py-1 text-[11px] font-semibold", isNext ? "text-white" : "border border-border hover:border-foreground")}
                      style={isNext ? { backgroundColor: RED } : undefined}
                    >
                      {isNext ? "Build next" : "Build"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MEMORIZE DECK
// ============================================================================
const KIND_LABEL: Record<MemorizeItem["kind"], string> = { formula: "Formulas", mnemonic: "Mnemonics", tip: "Tips", watchout: "Watch out" };

export function MemorizeDeck({
  chapterLabel,
  scenarios,
  onBack,
  onOpenScenario,
}: {
  chapterLabel: string;
  scenarios: HubScenario[];
  onBack: () => void;
  onOpenScenario: (slug: string) => void;
}) {
  const cards = useMemo(
    () =>
      scenarios.flatMap((s) => (s.doc.memorize ?? []).map((item) => ({ item, slug: s.slug, title: s.title }))),
    [scenarios],
  );
  const [flip, setFlip] = useState(false);
  const [idx, setIdx] = useState(0);

  const byKind = (["formula", "mnemonic", "tip", "watchout"] as const)
    .map((kind) => ({ kind, cards: cards.filter((c) => c.item.kind === kind) }))
    .filter((g) => g.cards.length > 0);

  const card = cards[idx];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> {chapterLabel} hub</button>
        <h1 className="text-lg font-bold" style={{ color: NAVY }}>Memorize deck</h1>
        <span className="text-xs text-muted-foreground">({cards.length})</span>
        <button onClick={() => { setFlip((f) => !f); setIdx(0); }} className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:border-foreground">
          {flip ? "Grouped view" : "Flip-through"}
        </button>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No memorize items in this chapter yet.</p>
      ) : flip ? (
        <div>
          <div className="rounded-xl border-2 bg-card p-6 text-center" style={{ borderColor: NAVY }}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABEL[card.item.kind]}</div>
            <p className="mt-2 text-base text-foreground/90">{card.item.body}</p>
            <button onClick={() => onOpenScenario(card.slug)} className="mt-3 text-[11px] text-muted-foreground underline hover:text-foreground">from: {card.title}</button>
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-sm">
            <button onClick={() => setIdx((i) => (i - 1 + cards.length) % cards.length)} className="rounded border border-border px-3 py-1 hover:border-foreground">← prev</button>
            <span className="text-xs text-muted-foreground">{idx + 1} / {cards.length}</span>
            <button onClick={() => setIdx((i) => (i + 1) % cards.length)} className="rounded px-3 py-1 font-semibold text-white" style={{ backgroundColor: NAVY }}>next card →</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {byKind.map((g) => (
            <div key={g.kind}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABEL[g.kind]}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.cards.map((c, i) => (
                  <div key={i} className={cn("rounded-lg border p-2.5 text-[13px]", c.item.kind === "watchout" ? "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20" : "border-border bg-card")}>
                    <p className="text-foreground/90">{c.item.body}</p>
                    <button onClick={() => onOpenScenario(c.slug)} className="mt-1 text-[10px] text-muted-foreground underline hover:text-foreground">{c.title}</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PRACTICE MIX
// ============================================================================
interface PracticeOption { value: number; correct: boolean; misconceptionId?: string; feedback?: string }
interface PracticeQ {
  slug: string;
  title: string;
  variantId?: string;
  prompt: string;
  options: PracticeOption[];
}

function buildSession(scenarios: HubScenario[]): PracticeQ[] {
  const qs: PracticeQ[] = [];
  for (const s of scenarios) {
    const doc = s.doc;
    if (!doc.questions?.length) continue;
    if (!doc.params) continue; // needs a schedule to resolve slot exprs
    let ex;
    try {
      ex = buildExplore(doc, defaultConditions(doc), doc.params.defaultSeed ?? 1, false);
    } catch {
      continue;
    }
    if (!ex) continue;
    for (const q of doc.questions) {
      try {
        const answer = resolveSlot(q.answerExpr, ex.schedule).value;
        const seen = new Set<number>([answer]);
        const options: PracticeOption[] = [{ value: answer, correct: true }];
        for (const d of q.distractors) {
          const v = resolveSlot(d.expr, ex.schedule).value;
          if (seen.has(v)) continue; // skip distractors that collide with the answer/another
          seen.add(v);
          options.push({ value: v, correct: false, misconceptionId: d.misconceptionId, feedback: d.feedback });
        }
        if (options.length < 2) continue;
        qs.push({
          slug: s.slug,
          title: s.title,
          variantId: doc.variants[0]?.id,
          prompt: formatEvent(q.prompt, ex.effectiveParams),
          options: shuffle(options),
        });
      } catch {
        /* skip unresolvable question */
      }
    }
  }
  return shuffle(qs);
}

export function PracticeMix({
  chapterLabel,
  chapterKey,
  scenarios,
  onBack,
  onShowInTool,
}: {
  chapterLabel: string;
  chapterKey: string;
  scenarios: HubScenario[];
  onBack: () => void;
  onShowInTool: (slug: string, variantId?: string) => void;
}) {
  const [session, setSession] = useState<PracticeQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [missed, setMissed] = useState<PracticeQ[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [best, setBest] = useState<number | null>(null);

  const start = (qs: PracticeQ[]) => {
    setSession(qs);
    setIdx(0);
    setPicked(null);
    setMissed([]);
    setCorrectCount(0);
    setDone(qs.length === 0);
  };
  useEffect(() => {
    start(buildSession(scenarios));
    try {
      const b = localStorage.getItem(`je:practice:${chapterKey}`);
      setBest(b ? Number(b) : null);
    } catch { /* ignore */ }
  }, [scenarios, chapterKey]);

  const q = session[idx];
  const pick = (i: number) => {
    if (picked != null) return;
    setPicked(i);
    if (q.options[i].correct) setCorrectCount((c) => c + 1);
    else setMissed((m) => [...m, q]);
  };
  const next = () => {
    if (idx + 1 >= session.length) {
      setDone(true);
      const pct = Math.round((correctCount / session.length) * 100);
      try {
        const prev = Number(localStorage.getItem(`je:practice:${chapterKey}`) ?? 0);
        if (pct > prev) { localStorage.setItem(`je:practice:${chapterKey}`, String(pct)); setBest(pct); }
      } catch { /* ignore */ }
    } else {
      setIdx((i) => i + 1);
      setPicked(null);
    }
  };

  const header = (
    <div className="mb-3 flex items-center gap-2">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> {chapterLabel} hub</button>
      <h1 className="text-lg font-bold" style={{ color: NAVY }}>Practice mix</h1>
      {best != null && <span className="ml-auto text-xs text-muted-foreground">best: {best}%</span>}
    </div>
  );

  if (session.length === 0 && done) {
    return <div className="mx-auto max-w-3xl">{header}<p className="text-sm italic text-muted-foreground">No resolvable questions in this chapter yet.</p></div>;
  }

  if (done) {
    const pct = Math.round((correctCount / session.length) * 100);
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <div className="rounded-xl border-2 bg-card p-6 text-center" style={{ borderColor: NAVY }}>
          <div className="text-3xl font-bold" style={{ color: NAVY }}>{correctCount} / {session.length}</div>
          <div className="text-sm text-muted-foreground">{pct}% correct</div>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => start(shuffle(buildSession(scenarios)))} className="rounded-md px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: NAVY }}>New mix</button>
            {missed.length > 0 && (
              <button onClick={() => start(shuffle(missed))} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-semibold hover:border-foreground">
                <RotateCcw className="h-3.5 w-3.5" /> Retry missed ({missed.length})
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!q) return <div className="mx-auto max-w-3xl">{header}<p className="text-sm italic text-muted-foreground">Loading…</p></div>;
  const chosen = picked != null ? q.options[picked] : null;

  return (
    <div className="mx-auto max-w-3xl">
      {header}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Question {idx + 1} of {session.length}</span>
          <span>{q.title}</span>
        </div>
        <p className="text-sm text-foreground/90">{q.prompt}</p>
        <div className="mt-3 space-y-1.5">
          {q.options.map((o, i) => {
            const isChosen = picked === i;
            const reveal = picked != null;
            return (
              <button
                key={i}
                onClick={() => pick(i)}
                disabled={reveal}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition",
                  !reveal && "hover:border-foreground",
                  reveal && o.correct && "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20",
                  reveal && isChosen && !o.correct && "border-rose-400 bg-rose-50 dark:bg-rose-950/20",
                  reveal && !o.correct && !isChosen && "opacity-60",
                )}
              >
                <span className="tabular-nums font-medium">{fmtUSD(o.value)}</span>
                {reveal && o.correct && <span className="text-xs font-semibold text-emerald-700">✓ correct</span>}
              </button>
            );
          })}
        </div>

        {chosen && !chosen.correct && (
          <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-2 text-[13px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
            {chosen.misconceptionId ? misconceptionFeedback(chosen.misconceptionId as never, chosen.feedback) : chosen.feedback ?? "Not quite."}
            <button onClick={() => onShowInTool(q.slug, q.variantId)} className="ml-1 whitespace-nowrap font-semibold underline">show me in the tool →</button>
          </div>
        )}

        {picked != null && (
          <div className="mt-3 flex justify-end">
            <button onClick={next} className="rounded-md px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: NAVY }}>
              {idx + 1 >= session.length ? "See score" : "Next →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
