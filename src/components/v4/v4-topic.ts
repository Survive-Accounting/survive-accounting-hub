// V4 — ONE TOPIC, FIVE STEPS (the pure half).
//
// Lee, 2026-09-13: "For every step the pattern is: I brainstorm by talking → AI proposes → I edit until
// it's how I want it → I mark it final. The app saves the AI's first version next to my final version
// so it can learn to teach like me over time." And the steps: Questions → Slides → Chain → Split → Film.
//
// A v4 TOPIC is one set (a deck). Its state rides on the deck as `deck.v4`: the step it's on, its
// question groups, when each step went final, and the plan it had before v4 (a backup). Its
// questions are the set's own cards, carrying `v4Group`, `format` and `placeholder` on their data.
//
// Pure: no React, no network.
import type { BlastFrame } from "@/components/blastoff/plan";

import type { Choice, QuestionFormat } from "./formats";

export const V4_STEPS = ["questions", "slides", "chain", "split", "film"] as const;
export type V4Step = (typeof V4_STEPS)[number];
export const V4_STEP_LABEL: Record<V4Step, string> = { questions: "Questions", slides: "Slides", chain: "Chain", split: "Split", film: "Film" };

/** THE BAR SINCE 2026-09-14: Questions → Build → Film. Build is Slides, Chain and Split on one page (Lee:
 *  "slides > chain > split should all exist together"). The stored step keeps its old names — the
 *  learning record's proposals are per step — and the bar reads them as Build. */
export const V4_BAR_STEPS = ["questions", "build", "film"] as const;
export type V4BarStep = (typeof V4_BAR_STEPS)[number];
export const V4_BAR_LABEL: Record<V4BarStep, string> = { questions: "Questions", build: "Build", film: "Film" };
export function barStepOf(step: string | null | undefined): V4BarStep {
  return step === "questions" || step === "film" ? step : "build";
}
/** A bar step is done when every stored step under it is final. */
export function barStepDone(bar: V4BarStep, final: Partial<Record<V4Step, string>>): boolean {
  if (bar === "questions") return !!final.questions;
  if (bar === "build") return !!(final.slides && final.chain && final.split);
  return !!final.film;
}

export interface V4Group { id: string; name: string }

export interface V4State {
  version: 1;
  step: V4Step;
  groups: V4Group[];
  startedAt: string;
  /** Step → when it was marked final. */
  final: Partial<Record<V4Step, string>>;
  /** The plan as it was before v4 took the set over — restorable. */
  backup?: { frames: unknown[]; at: string };
  /** Step 4: the cuts (v4-chain.ts V4Splits). */
  split?: import("./v4-chain").V4Splits;
}

/** A placeholder question (Lee: "either a format the app can't build yet, or one that's half-done and
 *  needs polish. It stays in the list with my notes on what it should be"). */
export interface V4Placeholder { kind: "format" | "polish"; note: string }

export interface V4Card {
  id: string;
  stem: string;
  choices: Choice[];
  format: QuestionFormat;
  group: string | null;
  placeholder: V4Placeholder | null;
  draft: boolean;
  rejected: boolean;
  noteOnly: boolean;
  order: number;
}

export const UNGROUPED: V4Group = { id: "ungrouped", name: "Not grouped yet" };

/** What the browser gets: the state without the backup (the old plan stays on the deck). */
export interface V4StateView { version: 1; step: V4Step; groups: V4Group[]; startedAt: string; final: Partial<Record<V4Step, string>>; backedUpAt: string | null }
export function stateView(s: V4State): V4StateView {
  return { version: 1, step: s.step, groups: s.groups.map((g) => ({ id: g.id, name: g.name })), startedAt: s.startedAt, final: { ...(s.final ?? {}) }, backedUpAt: s.backup?.at ?? null };
}

// ───────────────────────────────────────────────────────── taking a set over (migration) ──

/** The slides v3 adds around every split — they belong to the cut, and v4 re-derives its own. */
const BOOKEND_KINDS: readonly BlastFrame["kind"][] = ["open", "intro", "slogan", "bio", "outro"];

/** THE CHAIN WITHOUT ITS SPLITS: no cuts, no names on heads, none of the auto-inserted intro / slogan /
 *  bio / outro slides, and no empty opener "Common exam question" card. Everything he made stays, in
 *  order — skipped slides too (they stay skipped). */
export function stripForV4(frames: readonly BlastFrame[]): BlastFrame[] {
  return frames
    .filter((f) => !BOOKEND_KINDS.includes(f.kind))
    .filter((f) => !(f.kind === "found" && !(f.text ?? "").trim() && !(f.title ?? "").trim()))
    .map((f) => { const { cutAfter: _c, takeName: _t, ...rest } = f; return rest; });
}

/** THE STARTING GROUPS: one per existing split, named by the split (or "Group N"), holding the cards
 *  that split filmed. Lee: "Keep splits." A card in no split lands in "Not grouped yet". */
export function groupsFromSplits(frames: readonly BlastFrame[], cardIds: readonly string[]): { groups: V4Group[]; groupOf: Map<string, string> } {
  const groups: V4Group[] = [];
  const groupOf = new Map<string, string>();
  let run: BlastFrame[] = [];
  const close = () => {
    const cards = run.filter((f) => f.kind === "ceq" && f.ceqId).map((f) => f.ceqId!);
    if (cards.length) {
      const id = `g${groups.length + 1}`;
      const named = run.find((f) => (f.takeName ?? "").trim());
      groups.push({ id, name: named?.takeName?.trim() || `Group ${groups.length + 1}` });
      for (const c of cards) if (!groupOf.has(c)) groupOf.set(c, id);
    }
    run = [];
  };
  for (const f of frames) {
    if (f.skipped) continue;
    run.push(f);
    if (f.cutAfter) close();
  }
  close();
  // Names must tell groups apart — two unnamed splits are "Group 1" / "Group 2" already.
  return { groups, groupOf: new Map([...groupOf].filter(([id]) => cardIds.includes(id))) };
}

// ───────────────────────────────────────────────────────────────────── the question list ──

/** The groups in order, with "Not grouped yet" at the end only when something is in it. */
export function groupedCards(state: Pick<V4State, "groups">, cards: readonly V4Card[]): { group: V4Group; cards: V4Card[] }[] {
  const known = new Set(state.groups.map((g) => g.id));
  const live = cards.filter((c) => !c.rejected && !c.noteOnly).sort((a, b) => a.order - b.order);
  const out = state.groups.map((g) => ({ group: g, cards: live.filter((c) => c.group === g.id) }));
  const loose = live.filter((c) => !c.group || !known.has(c.group));
  if (loose.length) out.push({ group: UNGROUPED, cards: loose });
  return out;
}

export interface QuestionsSummary { questions: number; placeholders: number; rejected: number; groups: number; problems: { cardId: string; problem: string }[] }

/** What "Questions final" looks at. Placeholders never block (Lee: "it doesn't block Questions
 *  final"); a real question that isn't complete does, and says why. */
export function questionsSummary(cards: readonly V4Card[], problemsOf: (c: V4Card) => string[], groups: number): QuestionsSummary {
  const live = cards.filter((c) => !c.rejected && !c.noteOnly);
  const problems = live.filter((c) => !c.placeholder).flatMap((c) => problemsOf(c).map((problem) => ({ cardId: c.id, problem })));
  return { questions: live.length, placeholders: live.filter((c) => c.placeholder).length, rejected: cards.filter((c) => c.rejected).length, groups, problems };
}

/** The snapshot a proposal / final keeps: what each question WAS, in the words and groups he saw. */
export function snapshotQuestions(state: Pick<V4State, "groups">, cards: readonly V4Card[]) {
  return {
    groups: state.groups.map((g) => ({ id: g.id, name: g.name })),
    questions: cards.filter((c) => !c.noteOnly).map((c) => ({ id: c.id, group: c.group, format: c.format, stem: c.stem, choices: c.choices, placeholder: c.placeholder, rejected: c.rejected })),
  };
}

/** A new group's id — short and unique within the topic. */
export function nextGroupId(groups: readonly V4Group[]): string {
  let n = groups.length + 1;
  while (groups.some((g) => g.id === `g${n}`)) n++;
  return `g${n}`;
}
