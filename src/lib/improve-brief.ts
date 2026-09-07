// THE ITERATE BRIEF — Step 5's consultant. Lee, 2026-09-07: "I am excited about the potential
// of this tool to help me objectively work on my ADD with no shame. Using AI as an ADD
// consultant in a way. Step 5 … can take all the comments I've left at each step for what
// would've been better, what sucked, etc, and we can just have step 5 suggest claude code
// prompts, new approaches, guardrails, etc." Renamed the same day: "I want to call the improve
// process 'Iterate' instead." (The file keeps its name; the route segment stays `improve`.)
//
// Same shape as rehearsal-brief.ts: the messages for the micro lane and a defensive parser
// for its JSON. The numbers go in as numbers (the model reads, it doesn't add), the comments
// go in verbatim, the prior runs go in as one line each so a trend is visible. The prompts it
// returns are meant to be pasted into Claude Code against THIS codebase, so the system prompt
// names the surfaces a fix would touch.
//
// WHEN, NOT JUST WHAT (Lee, 2026-09-07): "take all of those learnings and apply them to the
// next set (or next topic? which do you recommend?) … We can have the iterate tool ask us… is
// this required before next set or can it wait until next topic? I'll definitely take a break
// after each topic… so it's probably best to do it there… but part of the iterate step is for
// me to NOT make these decisions… I want to have AI help make them for me, suggest what I
// should do, and I either agree or dont." THE CADENCE RULE (decided with Lee): learnings are
// applied at TOPIC boundaries by default — he breaks after each topic, so that's where a
// tool change costs nothing; a recommendation escalates to "before next set" only when the
// fix saves real minutes on EVERY set, or the take itself was compromised (a bad export, a
// caption that lied, a slide that couldn't be read). "Later" is for the nice-to-haves. Every
// recommendation carries `when` and a one-line `why`, and the page groups them under those
// three headings with Agree / Not now — the decision lands on the run (production-run.ts
// decisions), keyed by recommendationId so the same suggestion asked twice keeps its answer.
//
// THE TONE RULE is in the system prompt and is not negotiable: direct, kind, concrete, never
// shaming. A pause is data about the task, not a verdict on the person.
import {
  distractionStats, fmtDuration, isCompleteRun, RUN_STEP_LABEL, RUN_STEPS, runPauses, runTotalSeconds, runTotals, timeToBeat,
  type ProductionRun,
} from "./production-run";

export const WHENS = ["before-next-set", "next-topic", "later"] as const;
export type When = (typeof WHENS)[number];
export const WHEN_LABEL: Record<When, string> = { "before-next-set": "Before the next set", "next-topic": "At the next topic", later: "Later" };
/** The cadence, in one muted line on the page. */
export const CADENCE_LINE = "Default: apply learnings at topic boundaries — you break after each topic anyway. A fix moves up to \"before the next set\" only when it saves real minutes on every set, or the take itself was compromised.";

export type RecommendationKind = "approach" | "guardrail" | "prompt";
export interface Recommendation {
  /** recommendationId(kind, text) — stable across "Suggest again" for the same words. */
  id: string;
  kind: RecommendationKind;
  /** The one-line change (approach / guardrail) or the prompt's title. */
  text: string;
  /** The ready-to-paste Claude Code prompt — prompts only. */
  prompt?: string;
  when: When;
  why: string;
}

export interface ImproveSuggestions {
  headline: string;
  bottlenecks: { task: string; minutes: number; why: string }[];
  recommendations: Recommendation[];
}

export const IMPROVE_SYSTEM = [
  "You are Lee's process consultant for the Survive Accounting Blast Off line — the five-step pipeline that turns one set of exam questions into a filmed Short: Brainstorm (talk the set through into a recorder, stamp moments), Editor (order slides, fix cards, drop in callouts, illustrations, camera/template), Rehearse & Film (OBS + a 9:16 pop-out + a teleprompter, two rehearsal rounds, the take), Cross-post (captions, export, YouTube, Instagram, TikTok, mark posted). Step 5, Iterate, is where you speak.",
  "Lee asked for this in his own words: \"help me objectively work on my ADD with no shame. Using AI as an ADD consultant.\" So: DIRECT, KIND, CONCRETE, NEVER SHAMING. A pause is information about the task and the environment, never a verdict on Lee. No lectures, no pep talk, no clinical language, no 'you should have'. Say what the numbers say, then say the one or two things most likely to make the next run faster.",
  "You get this run's minutes per step and per task, every pause with the reason he typed, his own notes per step (what sucked, what would've been better), the tool spend so far, and prior runs for comparison. Only reason from what's there. If the data is thin (one run, few tasks timed), say so in one clause and still give something useful.",
  "WHEN, NOT JUST WHAT. Lee does not want to decide when to apply each change — you decide, he agrees or doesn't. Every approach, guardrail and prompt carries \"when\": \"before-next-set\" | \"next-topic\" | \"later\", and a one-line \"why\". THE RULE: \"next-topic\" is the default — Lee takes a break after each topic, so that's where a change to the tool or the routine costs nothing. Escalate to \"before-next-set\" ONLY when the fix saves real minutes on every single set (not a one-off), or the take itself was compromised (the export, the captions, a slide nobody could read). \"later\" is for what would be nice and costs nothing to wait on. Be stingy with \"before-next-set\": one, maybe two, never all of them.",
  "Return ONLY a JSON object: {\"headline\": str, \"bottlenecks\": [{\"task\": str, \"minutes\": number, \"why\": str}], \"approaches\": [{\"text\": str, \"when\": str, \"why\": str}], \"guardrails\": [{\"text\": str, \"when\": str, \"why\": str}], \"prompts\": [{\"title\": str, \"prompt\": str, \"when\": str, \"why\": str}]}.",
  "headline: one sentence, the single most useful observation (≤ 25 words). bottlenecks: at most 3, the tasks that took the most time or drew pauses, 'why' grounded in his note or the pause reasons where there is one. approaches: 2–4 changes to how he works the step next time (each one sentence, imperative, specific to the task). guardrails: 2–4 small rules or environment changes that make the recorded distractions less likely (phone in the other room, a fixed order, a hard time box on a task) — practical, not moralising.",
  "prompts: 1–3 ready-to-paste Claude Code prompts for THIS codebase that would remove a bottleneck by changing the tool, not the person. Each ≤ 120 words, starting with the surface it touches: the Editor is src/routes/v3.$topic.$set.blast-off.results.tsx and components/blastoff/*, the film page is components/blastoff/BlastOffCapture.tsx (rehearsal rounds, teleprompter, pop-out), the booth is components/talkthrough/Booth.tsx, Cross-post is src/routes/v3.post.tsx, the task checklist and pill are components/v3/ProductionTimer.tsx with the model in src/lib/production-run.ts. Be concrete about the behaviour wanted; never invent files beyond those.",
  "Plain prose in every string — no markdown, no emoji, no bullets inside a string.",
].join("\n");

const min = (s: number): string => (s < 60 ? `${s}s` : `${Math.round(s / 60)} min`);

/** The tool spend the brief can mention — from the cost ledger (cost-ledger.functions.ts). */
export interface CostContext { total: number; byKind: Partial<Record<string, number>>; perShort: number | null }

/** The user message: this run in numbers, its pauses and notes, the spend, then the prior runs. */
export function buildImproveMessages(run: ProductionRun, priorRuns: readonly ProductionRun[], comments: readonly { step: string; note: string }[], cost?: CostContext | null): { system: string; user: string } {
  const end = new Date(run.endedAt ?? new Date().toISOString());
  const totals = runTotals(run, end);
  const steps = totals.steps.map((s) => `${s.label}: ${min(s.seconds)} (${s.status})`).join(" · ");
  const tasks = totals.tasks.filter((t) => t.seconds > 0 || t.pauses > 0 || t.status === "skipped")
    .map((t) => `- ${t.stepLabel} / ${t.label}: ${min(t.seconds)}${t.share ? ` (${Math.round(t.share * 100)}%)` : ""}${t.pauses ? `, paused ${t.pauses}×` : ""}${t.status === "skipped" ? ", skipped" : ""}`)
    .join("\n");
  const pauses = runPauses(run).map((p) => `- ${RUN_STEP_LABEL[p.step]} / ${p.taskLabel ?? "(no task)"}: ${fmtDuration(p.seconds)} — "${p.reason || "(no reason given)"}"`).join("\n");
  const notes = comments.filter((c) => c.note.trim()).map((c) => `- ${c.step}: ${c.note.trim()}`).join("\n");
  const prior = priorRuns.filter((r) => r.id !== run.id).slice(0, 12).map((r) => {
    const e = new Date(r.endedAt ?? r.startedAt);
    const t = runTotals(r, e);
    return `- ${r.setName || r.setId} (${r.startedAt.slice(0, 10)}): ${min(runTotalSeconds(r, e))} total${isCompleteRun(r) ? "" : ", incomplete"}; ${t.steps.map((s) => `${s.label} ${min(s.seconds)}`).join(", ")}; ${r.status === "running" ? "still running; " : ""}${runPauses(r).length} pause(s)`;
  }).join("\n");
  const beat = timeToBeat(priorRuns.filter((r) => r.id !== run.id));
  const d = distractionStats([run, ...priorRuns.filter((r) => r.id !== run.id)]);
  const skipped = RUN_STEPS.filter((s) => run.steps[s].status === "skipped").map((s) => RUN_STEP_LABEL[s]);
  const spend = cost
    ? `TOOL SPEND THIS SET: ${fmtUsd(cost.total)}${Object.keys(cost.byKind).length ? ` (${Object.entries(cost.byKind).map(([k, v]) => `${k} ${fmtUsd(v ?? 0)}`).join(", ")})` : ""}${cost.perShort != null ? `; cost per short so far ${fmtUsd(cost.perShort)}` : ""}. Lee's framing: tool spend is small next to his time — minutes are the number to chase.`
    : "";
  const user = [
    `THIS RUN: ${run.setName || run.setId}${run.topicName ? ` (${run.topicName})` : ""}, ${run.startedAt.slice(0, 10)} — ${min(totals.total)} total, ${isCompleteRun(run) ? "complete" : run.status === "running" ? "still running" : "incomplete"}${skipped.length ? `, skipped: ${skipped.join(", ")}` : ""}.`,
    `TIME TO BEAT (mean of prior complete runs): ${beat == null ? "none yet — this is the first" : min(beat)}.`,
    `STEPS: ${steps}`,
    `TASKS (by time, desc):\n${tasks || "(no task timed)"}`,
    `PAUSES THIS RUN:\n${pauses || "(none — one sitting)"}`,
    `LEE'S NOTES PER STEP:\n${notes || "(none)"}`,
    spend,
    d.mostPaused ? `MOST PAUSED TASK ACROSS ALL RUNS: ${RUN_STEP_LABEL[d.mostPaused.step]} / ${d.mostPaused.label} (${d.mostPaused.count}×, ${fmtDuration(d.mostPaused.seconds)})` : "",
    prior ? `PRIOR RUNS:\n${prior}` : "",
  ].filter(Boolean).join("\n\n");
  return { system: IMPROVE_SYSTEM, user };
}

const str = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const whenOf = (v: unknown): When => ((WHENS as readonly string[]).includes(String(v)) ? (v as When) : "next-topic");

/** A short, deterministic id for a recommendation — its kind and a hash of its words, so
 *  "Suggest again" returning the same sentence lands on the same decision. djb2, base-36. */
export function recommendationId(kind: RecommendationKind, text: string): string {
  const norm = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h * 33) ^ norm.charCodeAt(i)) >>> 0;
  return `${kind}:${h.toString(36)}`;
}

/** One recommendation from the model's object (or, leniently, a bare string — the older
 *  shape — which defaults to next-topic with no why). */
function rec(kind: RecommendationKind, v: unknown): Recommendation | null {
  if (typeof v === "string") { const text = str(v); return text ? { id: recommendationId(kind, text), kind, text, when: "next-topic", why: "" } : null; }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (kind === "prompt") {
    const prompt = str(o.prompt, 2000);
    if (!prompt) return null;
    const text = str(o.title, 120) || prompt.slice(0, 60);
    return { id: recommendationId(kind, prompt), kind, text, prompt, when: whenOf(o.when), why: str(o.why, 240) };
  }
  const text = str(o.text) || str(o.title);
  if (!text) return null;
  return { id: recommendationId(kind, text), kind, text, when: whenOf(o.when), why: str(o.why, 240) };
}

/** The model's JSON, defended: null when there's nothing usable at all. */
export function parseImprove(text: string): ImproveSuggestions | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  if (!j || typeof j !== "object") return null;
  const bottlenecks = (Array.isArray(j.bottlenecks) ? j.bottlenecks : []).map((b) => {
    const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    const minutes = typeof o.minutes === "number" && Number.isFinite(o.minutes) ? Math.max(0, Math.round(o.minutes)) : Number(str(o.minutes, 10)) || 0;
    return { task: str(o.task, 120), minutes, why: str(o.why) };
  }).filter((b) => b.task).slice(0, 5);
  const list = (kind: RecommendationKind, v: unknown, max: number): Recommendation[] =>
    (Array.isArray(v) ? v : []).map((x) => rec(kind, x)).filter((r): r is Recommendation => !!r).slice(0, max);
  // The model's shape (three lists) or the stored one (one list with a kind on each).
  const stored = (Array.isArray(j.recommendations) ? j.recommendations : []) as unknown[];
  const kindOf = (x: unknown): RecommendationKind | null => { const k = (x as { kind?: unknown } | null)?.kind; return k === "approach" || k === "guardrail" || k === "prompt" ? k : null; };
  const recommendations = stored.length
    ? stored.map((x) => { const k = kindOf(x); return k ? rec(k, x) : null; }).filter((r): r is Recommendation => !!r).slice(0, 17)
    : [...list("approach", j.approaches, 6), ...list("guardrail", j.guardrails, 6), ...list("prompt", j.prompts, 5)];
  const out: ImproveSuggestions = { headline: str(j.headline, 300), bottlenecks, recommendations };
  if (!out.headline && !out.bottlenecks.length && !out.recommendations.length) return null;
  return out;
}

/** A stored answer (ProductionRun.suggestions.data) back into the shape, or null. */
export function suggestionsFromStored(data: unknown): ImproveSuggestions | null {
  if (!data || typeof data !== "object") return null;
  try { return parseImprove(JSON.stringify(data)); } catch { return null; }
}

/** The page's three groups, "before next set" first; empty groups are kept so the page can
 *  say "nothing" under a heading rather than hide it. */
export function groupByWhen(recs: readonly Recommendation[]): { when: When; label: string; items: Recommendation[] }[] {
  return WHENS.map((when) => ({ when, label: WHEN_LABEL[when], items: recs.filter((r) => r.when === when) }));
}

// ------------------------------------------------------------------ cost per short

/** "Cost per short: ~$N" (Lee, 2026-09-07: "I want to know the cost per short, so I can see
 *  whether it's justified or not to just make these with reckless abandon or not.")
 *
 *  Per set: the ledger's total (cost_events) PLUS the illustration library's cost_usd for the
 *  set when — and only when — the ledger has no recraft rows for it. The library kept Recraft
 *  spend before the ledger existed (illustrate.functions.ts, 2026-09-05); once the ledger sees
 *  a recraft row for a set, the library is the same money counted twice, so it's ignored.
 *  The mean is over the sets that have a COMPLETE run (production-run.ts isCompleteRun — a
 *  short is a set that went start to finish); null until there is one. */
export interface LedgerSet { setId: string; total: number; byKind: Partial<Record<string, number>> }
export function setCost(setId: string, ledger: readonly LedgerSet[], libraryUsd: Readonly<Record<string, number>>): { total: number; byKind: Partial<Record<string, number>>; libraryCounted: boolean } {
  const l = ledger.find((s) => s.setId === setId);
  const byKind: Partial<Record<string, number>> = { ...(l?.byKind ?? {}) };
  let total = l?.total ?? 0;
  const lib = libraryUsd[setId] ?? 0;
  const libraryCounted = !(byKind.recraft != null && byKind.recraft > 0) && lib > 0;
  if (libraryCounted) { total += lib; byKind.recraft = (byKind.recraft ?? 0) + lib; }
  return { total, byKind, libraryCounted };
}
export function costPerShort(runs: readonly ProductionRun[], ledger: readonly LedgerSet[], libraryUsd: Readonly<Record<string, number>>): { perShort: number | null; sets: number } {
  const ids = [...new Set(runs.filter(isCompleteRun).map((r) => r.setId))];
  if (!ids.length) return { perShort: null, sets: 0 };
  const sum = ids.reduce((s, id) => s + setCost(id, ledger, libraryUsd).total, 0);
  return { perShort: sum / ids.length, sets: ids.length };
}
/** "$0.42", "$1.05", "<$0.01" — never "$0.4183". */
export const fmtUsd = (usd: number): string => (usd > 0 && usd < 0.005 ? "<$0.01" : `$${usd.toFixed(2)}`);
