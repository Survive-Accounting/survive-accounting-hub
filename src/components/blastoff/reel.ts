// A REEL — one run between two cuts, seen the way Lee now thinks about it.
//
// Lee, 2026-09-12: "They're all intended to be very very short. 30-45 seconds is an average I'd
// like to explore maintaining. It can be done, if we split ruthlessly. One micro topic at a time,
// one cheat code, maybe two, but usually one. We make each video about THE callout in it." And:
// "Make it FEEL more like we're making these little Reels, less like a full video … Looking at
// only one at a time."
//
// plan.ts already cuts the running order into takes; this says what each one IS: the callouts it
// carries (ranked — the starred one first, then the order they film in), how many exam questions
// it covers, how long it is likely to run, and whether that is over the budget.
//
// THE RANKING IS THE POINT, not decoration. Lee: "we can think of each Reel as like ranking the
// callouts? Which is main one with most value, then descending from there … These can be arranged
// in all kinds of packages… Only the cheat codes. Only what to memorize. Only Deep Ideas." That
// packaging needs no new authoring: every Reel already contains its callout slides. The one thing
// a human has to say is which is THE one — `frame.lead` — and until he says, the first callout in
// the Reel is it.
//
// THE SECONDS ARE AN ESTIMATE, and say so wherever they are shown. They are per-kind constants
// tuned by eye, not measured: the honest number comes from the take's own transcript after it is
// filmed (take_transcripts). Their job is to make "split ruthlessly" visible while building.
//
// Pure: no React, no network.
import { BIG_CALLOUT_KINDS, FRAME_LABEL, insertStem, isBigCallout, type BlastFrame, type BlastFrameKind, type PlanTake } from "./plan";

/** Lee's target, and the line he wants to be warned about. */
export const REEL_BUDGET = { target: 30, max: 45 } as const;

// FRAME COUNT IS THE SPLIT SIGNAL (Studio prompt 3, 2026-09-13). Lee: "I agree that the 5 fixed
// frames shouldn't count. I think we set 10 frames as the loose ceiling. Even 12... I'd prefer to
// have the AI possibly generate too many and I edit down, versus the inverse." And: "frame count is
// flag. And this is a loose flag. We just want some awareness around it, not hard failures."
//
// So the count is CONTENT only — the opener every video starts with (intro · slogan · bio · the
// opener's Common exam question) and the sign-off are not counted — and it only ever colours a
// chip. Every frame counts as one: a card he flies through and a card he talks over are the same
// frame here, which is exactly why the flag is loose. The seconds estimate stays, as a hint.
export const FRAME_BUDGET = { ceiling: 10, max: 12 } as const;
/** ⚡ SPEED RUN (2026-09-13, plan.ts `pace`): a card he flies through is half a frame and ~4 s. Lee
 *  agreed the weighting: "½ frame and ~4 seconds" against a normal card's 1 and ~12. */
export const SPEED_RUN = { frame: 0.5, seconds: 4 } as const;

/** What a frame weighs in the count: 1, or ½ for a speed-run card. */
export const frameWeight = (f: Pick<BlastFrame, "pace">): number => (f.pace === "speed" ? SPEED_RUN.frame : 1);
/** The weighted count of a run's content. */
export const contentCount = (frames: readonly BlastFrame[]): number => contentFrames(frames).reduce((n, f) => n + frameWeight(f), 0);
export type FrameFlag = "ok" | "long" | "over";

/** Fixed wherever they sit — a moved slide can put the opener's bio after a card, and it is still
 *  the bookend (the live 5 Types plan has exactly that). */
const FIXED_KINDS: readonly BlastFrameKind[] = ["open", "intro", "slogan", "bio", "outro"];
/** Fixed only at the head: the opener's "Common exam question". Mid-Reel, it's content. */
const OPENER_ONLY_KINDS: readonly BlastFrameKind[] = ["found"];

/** The frames that count: the run minus its bookend kinds, and minus the leading opener's
 *  "Common exam question". */
export function contentFrames(frames: readonly BlastFrame[]): BlastFrame[] {
  let a = 0;
  while (a < frames.length && (FIXED_KINDS.includes(frames[a].kind) || OPENER_ONLY_KINDS.includes(frames[a].kind))) a++;
  return frames.slice(a).filter((f) => !FIXED_KINDS.includes(f.kind));
}

/** Past the ceiling is "long" (worth a look); past the max is "over" (probably wants a split).
 *  Neither blocks anything. */
export const frameFlag = (count: number): FrameFlag => (count > FRAME_BUDGET.max ? "over" : count > FRAME_BUDGET.ceiling ? "long" : "ok");

/** The chip's words for a count. */
/** "8", "8½", "½" — a count that may carry a speed-run half. */
export const countText = (count: number): string => {
  const whole = Math.floor(count + 1e-9);
  const half = count - whole >= 0.25;
  return half ? (whole ? `${whole}½` : "½") : String(whole);
};

export const frameCountLabel = (count: number): string => {
  const flag = frameFlag(count);
  return `${countText(count)} frame${count === 1 ? "" : "s"}${flag === "over" ? " · split it?" : flag === "long" ? " · long" : ""}`;
};

/** The six callout kinds — the thing a Reel is ABOUT. */
export const CALLOUT_KINDS: readonly BlastFrameKind[] = BIG_CALLOUT_KINDS;
export const isCalloutKind = (k: BlastFrameKind): boolean => CALLOUT_KINDS.includes(k);

/** Roughly how long a slide takes on camera, in seconds. Tuned by eye; see the header. */
const SECONDS: Partial<Record<BlastFrameKind, number>> = {
  open: 2, intro: 4, bio: 5, outro: 4, slogan: 4, bolt: 3, ad: 8,
  ceq: 12, rubric: 14, types: 12, outline: 12, cluster: 20, survibes: 20,
  topic_done: 6, up_next: 6, blank: 5, exhibit: 10,
  phrase: 8, cheat: 8, tip: 8, tricky: 8, found: 6, ask: 7,
  teaser: 8, dcrule: 10, taccount: 14,
};
const DEFAULT_SECONDS = 8;

/** One slide's estimate. A note-only card is a breath, not a question, so it reads faster; a
 *  callout drawn BIG is a line on a wall, not a card to read. */
export function frameSeconds(f: BlastFrame, noteOnly: (ceqId: string) => boolean): number {
  if (f.pace === "speed") return SPEED_RUN.seconds;
  if (f.kind === "ceq" && f.ceqId && noteOnly(f.ceqId)) return 6;
  if (isBigCallout(f)) return 6;
  return SECONDS[f.kind] ?? DEFAULT_SECONDS;
}

export interface ReelCallout {
  frameId: string;
  kind: BlastFrameKind;
  /** "Cheat code", "Memorize this" — the kind's own name. */
  label: string;
  /** Its words, trimmed to something a chip can hold. */
  text: string;
  /** Lee starred this one: the video is about THIS. */
  lead: boolean;
}

export interface ReelSummary {
  /** Ranked: the starred callout first, then the order they film in. */
  callouts: ReelCallout[];
  /** What the Reel is about — the star, else the first callout, else null. */
  lead: ReelCallout | null;
  /** Unique exam questions covered (cards and rubric slides; note-only cards are not questions). */
  questions: number;
  slides: number;
  /** Content frames — the split signal (contentFrames), a speed-run card counting ½. */
  frames: number;
  frameFlag: FrameFlag;
  /** The estimate, in seconds. */
  seconds: number;
  /** Past REEL_BUDGET.max — the nudge to split again. */
  over: boolean;
}

const clip = (s: string, max = 42): string => {
  // Only the inline-md MARKERS come out (==highlight==, __blank__, ~strike~, **bold**) — never a
  // lone "=", which is half of "A = L + E" and of "Internal = inside".
  const t = s.replace(/==|__|~~|\*\*|~/g, "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

/** What this run of slides is. `noteOnly` answers whether a card is one of the set's breath
 *  frames rather than a question. */
export function reelSummary(frames: readonly BlastFrame[], noteOnly: (ceqId: string) => boolean = () => false): ReelSummary {
  const found: ReelCallout[] = [];
  const seen = new Set<string>();
  let seconds = 0;
  for (const f of frames) {
    seconds += frameSeconds(f, noteOnly);
    if (isCalloutKind(f.kind)) {
      found.push({ frameId: f.id, kind: f.kind, label: FRAME_LABEL[f.kind], text: clip(insertStem(f)), lead: f.lead === true });
    }
    if ((f.kind === "ceq" || f.kind === "rubric") && f.ceqId && !noteOnly(f.ceqId)) seen.add(f.ceqId);
  }
  // The star first, then filming order. A plan with two stars (a paste, a duplicate) keeps the
  // first as the lead rather than guessing between them.
  const callouts = [...found].sort((a, b) => Number(b.lead) - Number(a.lead));
  const seconds_ = Math.round(seconds);
  return {
    callouts,
    lead: callouts[0] ?? null,
    questions: seen.size,
    slides: frames.length,
    frames: contentCount(frames),
    frameFlag: frameFlag(contentCount(frames)),
    seconds: seconds_,
    over: seconds_ > REEL_BUDGET.max,
  };
}

/** The same thing for a whole take. */
export const takeSummary = (take: PlanTake, noteOnly?: (ceqId: string) => boolean): ReelSummary => reelSummary(take.frames, noteOnly);

/** What a Reel is CALLED on the strip: Lee's own name for the take, else what it is about, else
 *  its number. Never "Split 3" once a callout is in it — the callout is the video. */
export function reelTitle(take: PlanTake, summary: ReelSummary): string {
  const name = take.name.trim();
  if (name) return name;
  if (summary.lead?.text) return summary.lead.text;
  return `Reel ${take.index + 1}`;
}

/** m:ss for an estimate, or "45s" under a minute — the strip has no room for "0:45". */
export function reelClock(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Star THIS callout as what the Reel is about — and unstar the others in the SAME run, so a
 *  Reel always has exactly one lead. Frames outside the run are untouched. */
export function setLead(frames: readonly BlastFrame[], runIds: readonly string[], frameId: string): BlastFrame[] {
  const run = new Set(runIds);
  return frames.map((f) => {
    if (f.id === frameId) return f.lead === true ? (({ lead: _drop, ...rest }) => rest)(f) : { ...f, lead: true as const };
    if (run.has(f.id) && f.lead) { const { lead: _drop, ...rest } = f; return rest; }
    return f;
  });
}
