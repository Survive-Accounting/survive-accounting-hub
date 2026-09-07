// THE IMPROVE BRIEF — Step 5's consultant. Lee, 2026-09-07: "I am excited about the potential
// of this tool to help me objectively work on my ADD with no shame. Using AI as an ADD
// consultant in a way. Step 5 … can take all the comments I've left at each step for what
// would've been better, what sucked, etc, and we can just have step 5 suggest claude code
// prompts, new approaches, guardrails, etc."
//
// Same shape as rehearsal-brief.ts: the messages for the micro lane and a defensive parser
// for its JSON. The numbers go in as numbers (the model reads, it doesn't add), the comments
// go in verbatim, the prior runs go in as one line each so a trend is visible. The prompts it
// returns are meant to be pasted into Claude Code against THIS codebase, so the system prompt
// names the surfaces a fix would touch.
//
// THE TONE RULE is in the system prompt and is not negotiable: direct, kind, concrete, never
// shaming. A pause is data about the task, not a verdict on the person.
import {
  distractionStats, fmtDuration, isCompleteRun, RUN_STEP_LABEL, RUN_STEPS, runPauses, runTotalSeconds, runTotals, timeToBeat,
  type ProductionRun,
} from "./production-run";

export interface ImproveSuggestions {
  headline: string;
  bottlenecks: { task: string; minutes: number; why: string }[];
  approaches: string[];
  guardrails: string[];
  prompts: { title: string; prompt: string }[];
}

export const IMPROVE_SYSTEM = [
  "You are Lee's process consultant for the Survive Accounting Blast Off line — the five-step pipeline that turns one set of exam questions into a filmed Short: Brainstorm (talk the set through into a recorder, stamp moments), Editor (order slides, fix cards, drop in callouts, illustrations, camera/template), Rehearse & Film (OBS + a 9:16 pop-out + a teleprompter, two rehearsal rounds, the take), Cross-post (captions, export, YouTube, Instagram, TikTok, mark posted). Step 5 is where you speak.",
  "Lee asked for this in his own words: \"help me objectively work on my ADD with no shame. Using AI as an ADD consultant.\" So: DIRECT, KIND, CONCRETE, NEVER SHAMING. A pause is information about the task and the environment, never a verdict on Lee. No lectures, no pep talk, no clinical language, no 'you should have'. Say what the numbers say, then say the one or two things most likely to make the next run faster.",
  "You get this run's minutes per step and per task, every pause with the reason he typed, his own notes per step (what sucked, what would've been better), and prior runs for comparison. Only reason from what's there. If the data is thin (one run, few tasks timed), say so in one clause and still give something useful.",
  "Return ONLY a JSON object: {\"headline\": str, \"bottlenecks\": [{\"task\": str, \"minutes\": number, \"why\": str}], \"approaches\": [str], \"guardrails\": [str], \"prompts\": [{\"title\": str, \"prompt\": str}]}.",
  "headline: one sentence, the single most useful observation (≤ 25 words). bottlenecks: at most 3, the tasks that took the most time or drew pauses, 'why' grounded in his note or the pause reasons where there is one. approaches: 2–4 changes to how he works the step next time (each one sentence, imperative, specific to the task). guardrails: 2–4 small rules or environment changes that make the recorded distractions less likely (phone in the other room, a fixed order, a hard time box on a task) — practical, not moralising.",
  "prompts: 1–3 ready-to-paste Claude Code prompts for THIS codebase that would remove a bottleneck by changing the tool, not the person. Each ≤ 120 words, starting with the surface it touches: the Editor is src/routes/v3.$topic.$set.blast-off.results.tsx and components/blastoff/*, the film page is components/blastoff/BlastOffCapture.tsx (rehearsal rounds, teleprompter, pop-out), the booth is components/talkthrough/Booth.tsx, Cross-post is src/routes/v3.post.tsx, the task checklist and pill are components/v3/ProductionTimer.tsx with the model in src/lib/production-run.ts. Be concrete about the behaviour wanted; never invent files beyond those.",
  "Plain prose in every string — no markdown, no emoji, no bullets inside a string.",
].join("\n");

const min = (s: number): string => (s < 60 ? `${s}s` : `${Math.round(s / 60)} min`);

/** The user message: this run in numbers, its pauses and notes, then the prior runs. */
export function buildImproveMessages(run: ProductionRun, priorRuns: readonly ProductionRun[], comments: readonly { step: string; note: string }[]): { system: string; user: string } {
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
  const user = [
    `THIS RUN: ${run.setName || run.setId}${run.topicName ? ` (${run.topicName})` : ""}, ${run.startedAt.slice(0, 10)} — ${min(totals.total)} total, ${isCompleteRun(run) ? "complete" : run.status === "running" ? "still running" : "incomplete"}${skipped.length ? `, skipped: ${skipped.join(", ")}` : ""}.`,
    `TIME TO BEAT (mean of prior complete runs): ${beat == null ? "none yet — this is the first" : min(beat)}.`,
    `STEPS: ${steps}`,
    `TASKS (by time, desc):\n${tasks || "(no task timed)"}`,
    `PAUSES THIS RUN:\n${pauses || "(none — one sitting)"}`,
    `LEE'S NOTES PER STEP:\n${notes || "(none)"}`,
    d.mostPaused ? `MOST PAUSED TASK ACROSS ALL RUNS: ${RUN_STEP_LABEL[d.mostPaused.step]} / ${d.mostPaused.label} (${d.mostPaused.count}×, ${fmtDuration(d.mostPaused.seconds)})` : "",
    prior ? `PRIOR RUNS:\n${prior}` : "",
  ].filter(Boolean).join("\n\n");
  return { system: IMPROVE_SYSTEM, user };
}

const str = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, max = 6): string[] => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, max) : []);

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
  const prompts = (Array.isArray(j.prompts) ? j.prompts : []).map((p) => {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    return { title: str(o.title, 120), prompt: str(o.prompt, 2000) };
  }).filter((p) => p.prompt).map((p) => ({ ...p, title: p.title || p.prompt.slice(0, 60) })).slice(0, 5);
  const out: ImproveSuggestions = { headline: str(j.headline, 300), bottlenecks, approaches: strs(j.approaches), guardrails: strs(j.guardrails), prompts };
  if (!out.headline && !out.bottlenecks.length && !out.approaches.length && !out.guardrails.length && !out.prompts.length) return null;
  return out;
}
