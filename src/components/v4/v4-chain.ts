// V4 · SLIDES, CHAIN, SPLIT, FILM — the pure half.
//
// Lee, 2026-09-13:
//   CHAIN — "AI arranges ONE ordered slide chain for the whole topic: for each group, its teaching
//   slides then its practice questions."
//   SPLIT — "'Split' means ONE thing only: a cut between two slides in the chain … Un-splitting must be
//   one click and fully reversible, with no leftover slides. For every split, automatically add the
//   outro as the last slide, just before the cut. The intro defaults to the bio slide at the start of
//   each split. I can swap in a different intro myself. Cutting and un-cutting must never permanently
//   insert or delete slides. The intro and outro are tied to the split and disappear if it's removed."
//   FILM — "show each split as Ready (no placeholders) or Blocked (contains a placeholder question or
//   slide)."
//
// So the plan holds the CONTENT chain plus bookends marked `v4Bound`, and the cuts live on the topic
// (deck.v4.split). applySplits strips every bound slide and rebuilds them from the cuts — the only
// thing that ever adds or removes one. A bound slide keeps its id (and anything he edited on it) for as
// long as its cut exists.
//
// Pure: no React, no network.
import { filmFrames, planTakes, type BlastFrame } from "@/components/blastoff/plan";
import { FRAME_BUDGET, frameWeight, isCalloutKind } from "@/components/blastoff/reel";

// ─────────────────────────────────────────────────────────────────────────────── slides ──

/** The kinds a group's teaching slides can be. */
export const TEACH_KINDS: readonly BlastFrame["kind"][] = ["cheat", "phrase", "tip", "tricky", "found", "ask", "slogan", "rubric", "types", "teaser", "cycle", "blank"];
export const isTeachingSlide = (f: BlastFrame): boolean => !f.v4Bound && f.kind !== "ceq" && TEACH_KINDS.includes(f.kind);

/** A PLACEHOLDER SLIDE (Lee: "if I mention something that needs a slide kind that isn't built yet (e.g.
 *  journal entries, T-accounts), create a placeholder slide saying what it should be ('build this
 *  later: journal entry for ___'). Never get stuck or skip it."). */
export function placeholderSlide(id: string, needs: string, group: string | null): BlastFrame {
  return { id, kind: "blank", text: `⚠ BUILD THIS LATER — ${needs}`, needs, ...(group ? { v4Group: group } : {}) };
}

/** GIVE MIGRATED SLIDES A GROUP: each untagged teaching slide takes the group of the nearest card
 *  before it (else after it). Returns null when nothing needed tagging. */
export function inferSlideGroups(frames: readonly BlastFrame[], cardGroup: (ceqId: string) => string | null): BlastFrame[] | null {
  const groupAt = frames.map((f) => (f.kind === "ceq" && f.ceqId ? cardGroup(f.ceqId) : null));
  let changed = false;
  const out = frames.map((f, i) => {
    if (!isTeachingSlide(f) || f.v4Group) return f;
    let g: string | null = null;
    for (let k = i - 1; k >= 0 && !g; k--) g = groupAt[k];
    for (let k = i + 1; k < frames.length && !g; k++) g = groupAt[k];
    if (!g) return f;
    changed = true;
    return { ...f, v4Group: g };
  });
  return changed ? out : null;
}

// ──────────────────────────────────────────────────────────────────────────────── chain ──

/** THE DEFAULT CHAIN: group by group, its teaching slides (in their order) then its questions (in
 *  theirs); anything without a group keeps its place at the end. Bound bookends are left out — the
 *  Split step puts them back. */
export function arrangeChain(frames: readonly BlastFrame[], groupIds: readonly string[], cardGroup: (ceqId: string) => string | null): BlastFrame[] {
  const content = frames.filter((f) => !f.v4Bound);
  const groupOf = (f: BlastFrame): string | null => (f.kind === "ceq" ? (f.ceqId ? cardGroup(f.ceqId) : null) : f.v4Group ?? null);
  const known = new Set(groupIds);
  const out: BlastFrame[] = [];
  for (const g of groupIds) {
    out.push(...content.filter((f) => f.kind !== "ceq" && groupOf(f) === g));
    out.push(...content.filter((f) => f.kind === "ceq" && groupOf(f) === g));
  }
  out.push(...content.filter((f) => { const g = groupOf(f); return !g || !known.has(g); }));
  return out;
}

export const contentOf = (frames: readonly BlastFrame[]): BlastFrame[] => frames.filter((f) => !f.v4Bound);

// ──────────────────────────────────────────────────────────────────────────────── split ──

export type IntroChoice = "bio" | "title" | "none";
export const INTRO_LABEL: Record<IntroChoice, string> = { bio: "Bio", title: "Title card", none: "No intro" };

export interface V4Cut { after: string; intro: IntroChoice; name?: string }
export interface V4Splits { startIntro: IntroChoice; startName?: string; cuts: V4Cut[] }
export const NO_SPLITS: V4Splits = { startIntro: "bio", cuts: [] };

const introId = (key: string) => `v4in-${key}`;
const outroId = (key: string) => `v4out-${key}`;

function introFrame(choice: IntroChoice, key: string, setName: string, prev: BlastFrame | undefined): BlastFrame | null {
  if (choice === "none") return null;
  const kind = choice === "bio" ? "bio" : "intro";
  const base: BlastFrame = prev && prev.kind === kind ? { ...prev } : kind === "bio" ? { id: introId(key), kind: "bio", cam: "corner" } : { id: introId(key), kind: "intro", text: setName };
  const { cutAfter: _c, takeName: _t, ...rest } = base;
  return { ...rest, id: introId(key), v4Bound: "intro" };
}

/** THE CUTS, KEPT HONEST: only cuts after a content slide that is still there and isn't the last one,
 *  one per slide, in chain order. */
export function cleanSplits(content: readonly BlastFrame[], s: V4Splits): V4Splits {
  const pos = new Map(content.map((f, i) => [f.id, i]));
  const seen = new Set<string>();
  const cuts = s.cuts
    .filter((c) => { const i = pos.get(c.after); if (i === undefined || i >= content.length - 1 || seen.has(c.after)) return false; seen.add(c.after); return true; })
    .sort((a, b) => (pos.get(a.after) ?? 0) - (pos.get(b.after) ?? 0));
  return { ...s, cuts };
}

/** THE CHAIN WITH ITS SPLITS: every run gets its intro (tied to the cut that opens it — "start" for the
 *  first) and its outro (tied to the cut that closes it — "end" for the last), the outro carrying the
 *  cut. Existing bound slides are reused by id, so their edits survive; nothing else is touched. */
export function applySplits(frames: readonly BlastFrame[], splits: V4Splits, setName: string): { frames: BlastFrame[]; splits: V4Splits } {
  const prevBound = new Map(frames.filter((f) => f.v4Bound).map((f) => [f.id, f]));
  const content = contentOf(frames);
  const clean = cleanSplits(content, splits);
  if (!content.length) return { frames: [], splits: clean };
  const cutAt = new Map(clean.cuts.map((c) => [c.after, c]));
  const out: BlastFrame[] = [];
  let runKey = "start";
  let runIntro: IntroChoice = clean.startIntro;
  let runName = clean.startName;
  let run: BlastFrame[] = [];
  const close = (closingKey: string, last: boolean) => {
    const intro = introFrame(runIntro, runKey, setName, prevBound.get(introId(runKey)));
    const head = intro ?? run[0];
    const withName = (f: BlastFrame): BlastFrame => (f === head && runName?.trim() ? { ...f, takeName: runName.trim() } : f);
    const prevOut = prevBound.get(outroId(closingKey));
    const { cutAfter: _c, takeName: _t, ...outBase } = prevOut && prevOut.kind === "outro" ? prevOut : { id: outroId(closingKey), kind: "outro" as const };
    const outro: BlastFrame = { ...outBase, id: outroId(closingKey), kind: "outro", v4Bound: "outro", ...(last ? {} : { cutAfter: true as const }) };
    if (intro) out.push(withName(intro));
    out.push(...run.map((f, i) => (!intro && i === 0 ? withName(f) : f)), outro);
  };
  content.forEach((f, i) => {
    const { cutAfter: _c, takeName: _t, ...plain } = f;
    run.push(plain);
    const cut = cutAt.get(f.id);
    if (cut) {
      close(f.id, false);
      runKey = f.id; runIntro = cut.intro; runName = cut.name; run = [];
    } else if (i === content.length - 1) {
      close("end", true);
    }
  });
  return { frames: out, splits: clean };
}

/** SUGGEST CUTS: at every group boundary, then inside any run still past the loose ceiling, after the
 *  question card that brings it closest to it. Suggestions only — he accepts or cuts himself. */
export function suggestCuts(frames: readonly BlastFrame[], cardGroup: (ceqId: string) => string | null): string[] {
  const content = contentOf(frames).filter((f) => !f.skipped);
  const groupOf = (f: BlastFrame) => (f.kind === "ceq" ? (f.ceqId ? cardGroup(f.ceqId) : null) : f.v4Group ?? null);
  const cuts: string[] = [];
  let weight = 0;
  let lastCard: string | null = null;
  content.forEach((f, i) => {
    const next = content[i + 1];
    if (isCalloutKind(f.kind) || f.kind === "ceq" || f.kind === "rubric" || f.kind === "types" || f.kind === "teaser" || f.kind === "blank") weight += frameWeight(f);
    if (f.kind === "ceq") lastCard = f.id;
    if (!next) return;
    const g = groupOf(f), ng = groupOf(next);
    const boundary = !!g && !!ng && g !== ng;
    if (boundary || (weight >= FRAME_BUDGET.ceiling && f.kind === "ceq")) { cuts.push(f.id); weight = 0; lastCard = null; }
  });
  void lastCard;
  return cuts;
}

// ───────────────────────────────────────────────────────────────────────── ready / blocked ──

export interface Blocker { frameId: string; kind: "question" | "slide"; label: string; note: string; cardId?: string }
export interface SplitRow { index: number; headId: string; name: string; frames: BlastFrame[]; blockers: Blocker[] }

/** Each split, and what (if anything) is keeping it from being filmed. */
export function splitRows(frames: readonly BlastFrame[], cardPlaceholder: (ceqId: string) => { note: string; stem: string } | null): SplitRow[] {
  return planTakes(filmFrames(frames)).map((t) => {
    const blockers: Blocker[] = [];
    for (const f of t.frames) {
      if (f.kind === "ceq" && f.ceqId) {
        const ph = cardPlaceholder(f.ceqId);
        if (ph) blockers.push({ frameId: f.id, kind: "question", label: ph.stem || "A question", note: ph.note, cardId: f.ceqId });
      } else if (f.needs) {
        blockers.push({ frameId: f.id, kind: "slide", label: f.kind, note: f.needs });
      }
    }
    return { index: t.index, headId: t.headId, name: t.name, frames: t.frames, blockers };
  });
}
