// THE /learn GATES (Lee, 2026-09-10) — pure rules and the storage keys behind them. Client-safe,
// no React, no DOM beyond the two storage reads (each wrapped, each defaulting to "not set").
//
//   · EMAIL GATE. Exam 1 is free and stays free — this is not a paywall. The first topic (Easy
//     Points) is open; every later topic shows its cards blurred behind one ask: an email, for
//     "Unlock the rest of Exam 1 — free". One submit un-blurs every later topic on this device
//     for good (UNLOCK_KEY). A signed-in student never sees it — we already have their email.
//   · PRACTICE SOFT GATE. Tapping Practice on a topic whose videos exist but none has been
//     started asks once — "Ten minutes of videos first." — with Watch first / Practice anyway.
//     A topic with no playable video goes straight to practice, as it always did.
//   · THE INTRO. The brand splash holds for a beat on the first arrival of a browser session and
//     is only a loading screen (no beat, no fade) on every arrival after (INTRO_SEEN_KEY).
//
// Copy rule (learn.tsx header): no "run" / "blast" / "pledge", no emoji, in anything a student reads.

/** localStorage — "1" once the email gate has been passed on this device. Never expires. */
export const UNLOCK_KEY = "sa-learn-unlocked";
/** sessionStorage — "1" once the brand splash has played in this browser session. */
export const INTRO_SEEN_KEY = "sa-learn-intro-seen";

export function readUnlocked(): boolean {
  try { return localStorage.getItem(UNLOCK_KEY) === "1"; } catch { return false; }
}
export function writeUnlocked(): void {
  try { localStorage.setItem(UNLOCK_KEY, "1"); } catch { /* private mode — the gate simply asks again next time */ }
}
export function readIntroSeen(): boolean {
  try { return sessionStorage.getItem(INTRO_SEEN_KEY) === "1"; } catch { return false; }
}
export function writeIntroSeen(): void {
  try { sessionStorage.setItem(INTRO_SEEN_KEY, "1"); } catch { /* ignore */ }
}

/** Does topic #index (0 = Easy Points) sit behind the email gate for this student? */
export function emailGateNeeded(topicIndex: number, signedIn: boolean, unlocked: boolean): boolean {
  return topicIndex > 0 && !signedIn && !unlocked;
}

/** What the gate rules need to know about one set in a topic row. */
export type GateSet = {
  /** A cram video exists (or is withheld because the set is paid — the id is hidden, not absent). */
  hasVideo: boolean;
  locked: boolean;
  /** Progress says in_progress or complete — the student has pressed play at least once. */
  started: boolean;
  runtimeSec: number | null;
  ceqCount: number;
};

/** Should Practice ask "watch first"? Only when the topic HAS something to watch and none of it
 *  has been started. Locked videos don't count as watchable here — the paywall owns that ask. */
export function practiceGateNeeded(sets: readonly GateSet[]): boolean {
  const watchable = sets.filter((s) => s.hasVideo && !s.locked);
  return watchable.length > 0 && !watchable.some((s) => s.started);
}

/** Real questions in the topic — the number the Practice frame shows. Never padded. */
export function questionCount(sets: readonly Pick<GateSet, "ceqCount">[]): number {
  return sets.reduce((n, s) => n + Math.max(0, s.ceqCount), 0);
}

/** "5 videos · ~12 min". The count is sets that have a video; the minutes appear ONLY when every
 *  one of those has a real runtime — a partial sum would understate the topic, and an invented
 *  number is worse than none. */
export function topicDetail(sets: readonly Pick<GateSet, "hasVideo" | "runtimeSec">[]): string {
  // The count is the topic's VIDEOS — every set is one, made or not — so a topic never reads
  // "0 videos" before launch. "coming soon" says none is up yet; the minutes appear only once
  // every made one has a runtime (a partial sum would understate).
  const n = sets.length;
  const label = `${n} video${n === 1 ? "" : "s"}`;
  const withVideo = sets.filter((s) => s.hasVideo);
  if (withVideo.length === 0) return n ? `${label} · coming soon` : label;
  if (withVideo.length < n || withVideo.some((s) => s.runtimeSec == null)) return label;
  const total = withVideo.reduce((a, s) => a + (s.runtimeSec ?? 0), 0);
  return `${label} · ~${Math.max(1, Math.round(total / 60))} min`;
}

/** submitIntake's campusId is a uuid or null — a demo id or a stale non-uuid value must not fail
 *  the whole capture over a field that is only context. */
export function isUuid(v: string | null | undefined): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
