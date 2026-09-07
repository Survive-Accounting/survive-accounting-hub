// SET STAGE — where a set stands across all four Blast Off steps, in ONE helper.
//
// The /v3 audit (2026-09-06): "Post has no idea what's actually finished. Post is purely a
// publishing checklist, with zero awareness of where a set is in Talkthrough → Review → Film.
// The status logic already exists one file away (v3.index.tsx setStatus); Post just doesn't
// read it." The fix is not to copy that switch into Post — it's to move it HERE, add the three
// signals the queue never had (a saved blast plan, film-timer seconds, the posted flags), and
// have both screens read the same answer. One chip, one meaning, wherever a set is listed.
//
// The signals, in the order they win:
//   1. publish — every destination posted → "posted"; any → "posting" ("posted 2/4").
//   2. filmedAt — Lee's own flag (the 🎬 filmed button on /v3/post). Manual beats auto: the
//      timer can run on a set he then re-shot, or not run at all on one he filmed elsewhere.
//   3. filmSeconds > 0 — the Film timer ran for this set (production_time_log). Real evidence,
//      not proof, so the label is "filmed?" until he confirms.
//   4. hasPlan — a blast plan is saved on the deck (blastoff.functions.ts): the set has been
//      through Review and there is a running order to film.
//   5. otherwise the Talkthrough store's answer, exactly the switch the queue always had.
//
// Pure: no React, no network. The Talkthrough reader (talkStageOf) is the only non-trivial
// dependency and it reads the local-first store, same as the queue did.
import { listSessions, type TalkSession } from "@/components/canvas/talkthrough";
import { reviewStateOf } from "@/components/canvas/talkthrough-review";
import type { TTState } from "@/components/canvas/talkthrough-sync";
import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { PUBLISH_DESTINATIONS, type SetPublishStatus } from "@/lib/publish-queue.functions";

import type { NumberedStep } from "./StepBar";
import { V3_CREAM, V3_GOLD, V3_MUTED } from "./Shell";

export type SetStage = "not_started" | "talking" | "talked" | "generating" | "reviewed" | "filmed" | "posting" | "posted";

/** The chip: what to print, in what colour, and where "resume" should land. */
export interface StageInfo {
  stage: SetStage;
  label: string;
  color: string;
  /** The step to resume at — the primary button on a queue row. */
  next: NumberedStep;
}

// The V3 palette (Shell.tsx) plus the three accents the queue already used for its status text.
export const STAGE_MINT = "#3BF5A0";   // talking · posted — the same green /v3/post uses for a posted destination
export const STAGE_SKY = "#7DD3FC";    // generating · filmed
export const STAGE_ROSE = "#FF8B7E";   // review failed

/** The Talkthrough-only stages (the first four of SetStage) — what talkStageOf can know. */
export type TalkStage = Extract<SetStage, "not_started" | "talking" | "talked" | "generating">;
export interface TalkStageInfo extends StageInfo { stage: TalkStage }

/** The review-queue states reviewStateOf can report, plus null for "no session yet". */
export type ReviewKind = ReturnType<typeof reviewStateOf>["state"] | null;

/** The switch that lived in v3.index.tsx as setStatus — pure, keyed on the review state so it
 *  can be tested without a Talkthrough doc. `next` follows the audit's rule: the booth until
 *  something has been generated; Review once results exist or are on their way (an error is
 *  retried from the booth's session view, so it points back there). */
export function talkStageFromReview(state: ReviewKind): TalkStageInfo {
  switch (state) {
    case null: return { stage: "not_started", label: "not started", color: V3_MUTED, next: "talkthrough" };
    case "capturing": return { stage: "talking", label: "talking", color: STAGE_MINT, next: "talkthrough" };
    case "stale": return { stage: "talking", label: "session open", color: V3_MUTED, next: "talkthrough" };
    case "queued": return { stage: "generating", label: "queued", color: V3_MUTED, next: "results" };
    case "generating": return { stage: "generating", label: "generating…", color: STAGE_SKY, next: "results" };
    case "ready": return { stage: "talked", label: "results ready", color: V3_GOLD, next: "results" };
    case "error": return { stage: "talked", label: "review failed", color: STAGE_ROSE, next: "talkthrough" };
    default: return { stage: "talked", label: "talked", color: V3_MUTED, next: "talkthrough" };
  }
}

/** Where a set stands in Talkthrough, from its newest session (local-first store, no round trip). */
export function talkStageOf(tt: TTState, set: BoothSetInfo): TalkStageInfo {
  const latest: TalkSession | undefined = listSessions(tt.doc).find((s) => s.setId === set.id);
  if (!latest) return talkStageFromReview(null);
  return talkStageFromReview(reviewStateOf(tt.doc, latest).state);
}

export interface StageInput {
  talk: TalkStageInfo;
  /** A blast plan is saved on the deck — the set has been through Review. */
  hasPlan: boolean;
  /** Film-timer seconds from production_time_log; > 0 means the Film timer ran on this set. */
  filmSeconds: number;
  /** Lee's manual flag (set_publish_status.filmed_at). Wins over the timer either way. */
  filmedAt: string | null;
  publish: SetPublishStatus | null;
}

/** How many of the four destinations are posted. */
export function postedCount(publish: SetPublishStatus | null): number {
  if (!publish) return 0;
  return PUBLISH_DESTINATIONS.filter((d) => !!publish[d]?.postedAt).length;
}

/** The one answer both screens render. */
export function stageOf(input: StageInput): StageInfo {
  const posted = postedCount(input.publish);
  const all = PUBLISH_DESTINATIONS.length;
  if (posted >= all) return { stage: "posted", label: "posted", color: STAGE_MINT, next: "post" };
  if (posted > 0) return { stage: "posting", label: `posted ${posted}/${all}`, color: V3_GOLD, next: "post" };
  if (input.filmedAt) return { stage: "filmed", label: "filmed", color: STAGE_SKY, next: "post" };
  // Auto-detected only: the timer ran, nobody confirmed. Same stage (so it sorts and filters as
  // filmed on /v3/post, where the confirm button is), honest label.
  if (input.filmSeconds > 0) return { stage: "filmed", label: "filmed?", color: STAGE_SKY, next: "post" };
  if (input.hasPlan) return { stage: "reviewed", label: "reviewed", color: V3_CREAM, next: "film" };
  return input.talk;
}

/** True when the "filmed" stage came from the timer alone — the chip that needs a confirm. */
export const isFilmedUnconfirmed = (info: StageInfo): boolean => info.stage === "filmed" && info.label === "filmed?";

const RANK: Record<SetStage, number> = {
  not_started: 0, talking: 1, talked: 2, generating: 3, reviewed: 4, filmed: 5, posting: 6, posted: 7,
};

/** Sort key: further along = higher. /v3/post lists ready-to-post (filmed, posting) first and
 *  fully posted last, so "posted" being the top rank is for the filter, not the sort. */
export const stageRank = (stage: SetStage): number => RANK[stage];

/** The three Post filters (plus "all"): ready = filmed but not fully posted; in progress =
 *  anything before filmed; done = all four destinations. */
export type StageFilter = "all" | "ready" | "progress" | "done";
export function matchesFilter(stage: SetStage, filter: StageFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "ready": return stage === "filmed" || stage === "posting";
    case "progress": return stageRank(stage) < RANK.filmed;
    case "done": return stage === "posted";
  }
}
