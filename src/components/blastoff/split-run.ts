// THE SPLIT RUN — talk a Reel down into smaller Reels.
//
// Lee, 2026-09-12: "How can we improve the splitting process … we build the SPLIT first, we keep
// going to split it down further and further. Keep dissecting it down. We let AI help us with this,
// arranging it … I just talk through how to split, how to split. Once we split all the way down
// like we want.... we will review slides produced, then 'build it' when ready." And: "Make it super
// simple and comically minimal" — one conversation, no stamping, nothing per-CEQ.
//
// This module is the pure half: what to ask for, how to read the answer back safely, and how a
// proposal becomes frames. The server fn (lib/split-run.functions.ts) does the call; the panel
// (SplitRunPanel.tsx) shows it.
//
// TWO RULES THE BUILD ENFORCES, whatever the model says:
//   · NO CARD IS EVER LOST. Every question in the Reel comes out in one of the new Reels — any
//     the model forgot are appended to the last one rather than dropped.
//   · A PLACEHOLDER IS LOUD. Anything that needs building first (a JE card, a T-account) becomes a
//     blank slide that says so, and the set can list them, so the text-only Reels film meanwhile:
//     "We can even instruct it to have placeholders for certain items if we need to build them
//     later … we note it, and maybe we just film others in the meantime."
import { BIG_CALLOUT_KINDS, newFrameId, type BlastFrame, type BlastFrameKind } from "./plan";
import { REEL_BUDGET } from "./reel";

/** What a proposed Reel may contain. A callout, a blank, or one of the set's own cards. */
export const SPLIT_SLIDE_KINDS: readonly BlastFrameKind[] = [...BIG_CALLOUT_KINDS, "blank", "slogan", "ceq"];

export interface SplitSlide {
  kind: BlastFrameKind;
  /** The heading / the words. Ignored for a card slide. */
  text?: string;
  bullets?: string[];
  /** Draw the callout as the whole frame. */
  big?: boolean;
  /** A card of this set, by the short id the prompt handed the model ("c2"). */
  card?: string;
  /** This slide can't be built yet — what it needs, in Lee's words ("a JE card"). */
  needs?: string;
}

export interface SplitReel {
  title: string;
  /** One line on why this is its own Reel — shown in the review, never filmed. */
  why?: string;
  slides: SplitSlide[];
}

export interface SplitProposal { reels: SplitReel[]; note?: string }

/** What the panel hands the model: the Reel as it stands. */
export interface SplitInput {
  topicName: string;
  setName: string;
  reelTitle: string;
  /** The Reel's slides, in order — kind plus whatever words they carry. */
  slides: { kind: string; words: string }[];
  /** The set's cards in this Reel: the short id the model refers to, and the question. */
  cards: { id: string; stem: string }[];
  /** What Lee just said about it. */
  note: string;
}

const MAX_REELS = 6;
const MAX_SLIDES = 10;

export function buildSplitMessages(input: SplitInput): { system: string; user: string } {
  const system = [
    "You are helping Lee split one cram video into smaller ones. He teaches intro accounting; his videos are vertical Reels.",
    "",
    "THE FORMULA, which every Reel you propose must obey:",
    `· ${REEL_BUDGET.target}-${REEL_BUDGET.max} seconds. That is about 4-8 slides, no more.`,
    "· ONE micro topic. One callout — a cheat code, a memorize-this, a go-deeper — occasionally two, usually one. The video is ABOUT that callout.",
    "· It stands alone. NEVER reference another video, never tease what is coming next, never say 'as we saw'. A viewer may see this one first.",
    "· Cramming, not teaching everything: only what gets marks on the exam.",
    "",
    "SLIDE KINDS you may use, and nothing else:",
    "· phrase (Memorize this) · cheat (Cheat code) · tip (Go deeper) · tricky (Tricky question) · found (Found on your exam) · ask (Ask yourself)",
    "· ceq — one of the set's OWN question cards. Refer to it by its id; never invent a question.",
    "· blank — use ONLY for something that has to be built before it can be filmed (a journal-entry card, a T-account, a diagram). Put what it needs in `needs`.",
    "",
    "Keep his words where he has already written them. Improve phrasing only to make it shorter.",
    "",
    "Answer with JSON only:",
    '{ "reels": [ { "title": "...", "why": "one line", "slides": [ { "kind": "cheat", "text": "...", "bullets": ["..."], "big": false }, { "kind": "ceq", "card": "c2" }, { "kind": "blank", "needs": "a JE card for this entry" } ] } ], "note": "anything he should know" }',
  ].join("\n");

  const user = [
    `Topic: ${input.topicName}`,
    `Set: ${input.setName}`,
    `This Reel: ${input.reelTitle}`,
    "",
    "Its slides now:",
    ...input.slides.map((s, i) => `${i + 1}. [${s.kind}] ${s.words || "(no words)"}`),
    "",
    input.cards.length ? "Its question cards (use these ids):" : "It has no question cards.",
    ...input.cards.map((c) => `${c.id}: ${c.stem}`),
    "",
    "What Lee says about splitting it:",
    input.note.trim() || "(nothing — split it the way the formula says)",
  ].join("\n");

  return { system, user };
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isKind = (v: unknown): v is BlastFrameKind => typeof v === "string" && (SPLIT_SLIDE_KINDS as readonly string[]).includes(v);

/** Read the model's answer back, clamped. Anything unrecognised is dropped rather than trusted;
 *  an empty proposal is a valid answer (the panel says so) and never a crash. */
export function parseSplitProposal(raw: unknown): SplitProposal {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const reelsRaw = Array.isArray(obj.reels) ? obj.reels : [];
  const reels: SplitReel[] = [];
  for (const r of reelsRaw.slice(0, MAX_REELS)) {
    const o = (r ?? {}) as Record<string, unknown>;
    const slidesRaw = Array.isArray(o.slides) ? o.slides : [];
    const slides: SplitSlide[] = [];
    for (const s of slidesRaw.slice(0, MAX_SLIDES)) {
      const t = (s ?? {}) as Record<string, unknown>;
      if (!isKind(t.kind)) continue;
      const bullets = Array.isArray(t.bullets) ? t.bullets.map((b) => str(b, 200)).filter(Boolean).slice(0, 8) : [];
      slides.push({
        kind: t.kind,
        ...(str(t.text, 400) ? { text: str(t.text, 400) } : {}),
        ...(bullets.length ? { bullets } : {}),
        ...(t.big === true ? { big: true } : {}),
        ...(str(t.card, 40) ? { card: str(t.card, 40) } : {}),
        ...(str(t.needs, 200) ? { needs: str(t.needs, 200) } : {}),
      });
    }
    if (!slides.length) continue;
    reels.push({ title: str(o.title, 80) || `Reel ${reels.length + 1}`, ...(str(o.why, 200) ? { why: str(o.why, 200) } : {}), slides });
  }
  return { reels, ...(str(obj.note, 400) ? { note: str(obj.note, 400) } : {}) };
}

/** THE CARDS THIS REEL CARRIES, in order — what the build must not lose. */
export const cardsIn = (frames: readonly BlastFrame[]): string[] =>
  frames.filter((f) => f.kind === "ceq" && !!f.ceqId).map((f) => f.ceqId!);

/** One proposed slide as a frame. `cardOf` turns the model's short id into a real ceqId. */
function slideToFrame(s: SplitSlide, cardOf: (short: string) => string | undefined): BlastFrame | null {
  if (s.kind === "ceq") {
    const ceqId = s.card ? cardOf(s.card) : undefined;
    return ceqId ? { id: newFrameId("ceq"), kind: "ceq", ceqId } : null;
  }
  if (s.needs) {
    // A placeholder is a blank slide that SAYS what it is waiting for — loud in the strip, and
    // listable, so the rest of the run can be filmed while it is built.
    return { id: newFrameId("blank"), kind: "blank", text: `⚠ NEEDS BUILDING — ${s.needs}`, needs: s.needs };
  }
  return {
    id: newFrameId(s.kind),
    kind: s.kind,
    ...(s.text ? { text: s.text } : {}),
    ...(s.bullets?.length ? { bullets: s.bullets } : {}),
    ...(s.big ? { display: "big" as const } : {}),
  };
}

/** THE BUILD. The proposal becomes one run of frames per Reel, cut between them, each opening the
 *  way every video opens. Cards the model left out are appended to the last Reel — losing a
 *  question would quietly drop it from the running order, and reconcile would put it back at the
 *  end of the set days later. */
export function proposalToFrames(p: SplitProposal, opts: {
  /** Every card in the Reel being split, in order. */
  cards: readonly string[];
  /** The slides that open a video — plan.standardOpener, passed in so this stays pure. */
  opener: () => BlastFrame[];
  /** The slides that close one (the sign-off). */
  closer: () => BlastFrame[];
}): { frames: BlastFrame[]; placed: string[]; appended: string[] } {
  const shortOf = new Map<string, string>();
  opts.cards.forEach((id, i) => { shortOf.set(`c${i + 1}`, id); shortOf.set(id, id); });
  const placed: string[] = [];
  const cardOf = (short: string): string | undefined => {
    const id = shortOf.get(short.trim());
    if (!id || placed.includes(id)) return id && !placed.includes(id) ? id : undefined;
    return id;
  };

  const runs: BlastFrame[][] = [];
  for (const reel of p.reels) {
    const body: BlastFrame[] = [];
    for (const s of reel.slides) {
      const f = slideToFrame(s, (short) => {
        const id = shortOf.get(short.trim());
        if (!id || placed.includes(id)) return undefined;
        placed.push(id);
        return id;
      });
      if (f) body.push(f);
    }
    if (!body.length) continue;
    const head = opts.opener();
    if (head.length && reel.title.trim()) head[0] = { ...head[0], takeName: reel.title.trim() };
    runs.push([...head, ...body]);
  }

  const appended = opts.cards.filter((id) => !placed.includes(id));
  if (appended.length) {
    const last = runs[runs.length - 1];
    const tail = appended.map((ceqId) => ({ id: newFrameId("ceq"), kind: "ceq" as const, ceqId }));
    if (last) last.push(...tail);
    else runs.push([...opts.opener(), ...tail]);
  }

  const frames: BlastFrame[] = [];
  runs.forEach((run, i) => {
    frames.push(...run, ...opts.closer().map((f, k, arr) => (k === arr.length - 1 && i < runs.length - 1 ? { ...f, cutAfter: true as const } : f)));
  });
  return { frames, placed, appended };
}

/** SWAP ONE RUN FOR THE BUILT ONES, in place. The new block lands exactly where the old Reel was,
 *  and carries a cut at its end when anything follows — otherwise the Reel after it would be
 *  swallowed into the last new one. Pure; the Editor commits the result. */
export function replaceRun(frames: readonly BlastFrame[], runIds: readonly string[], next: readonly BlastFrame[]): BlastFrame[] {
  const ids = new Set(runIds);
  const out: BlastFrame[] = [];
  let done = false;
  for (const f of frames) {
    if (!ids.has(f.id)) { out.push(f); continue; }
    if (done) continue;
    done = true;
    const block = next.map((x) => ({ ...x }));
    const followed = frames.some((x, i) => !ids.has(x.id) && i > frames.findIndex((y) => ids.has(y.id)));
    if (block.length && followed) block[block.length - 1] = { ...block[block.length - 1], cutAfter: true as const };
    out.push(...block);
  }
  return out;
}

/** What still needs building in a plan — the placeholders, in order. */
export const needsInPlan = (frames: readonly BlastFrame[]): { id: string; needs: string }[] =>
  frames.filter((f) => !!f.needs).map((f) => ({ id: f.id, needs: f.needs! }));
