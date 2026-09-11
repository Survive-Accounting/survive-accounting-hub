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
//   · THE WAITLIST (Lee, 2026-09-10). A topic with NO posted video yet never says "unlock" — it
//     asks "Get notified when these drop." (source learn-waitlist) and teases the whole exam's
//     real counts (examTease). Same one email; either submit marks the device (UNLOCK_KEY).
//   · THE START CUE. The first row's outline pulse plays once per session (START_PULSE_KEY).
//
// Copy rule (learn.tsx header): no "run" / "blast" / "pledge", no emoji, in anything a student reads.

/** localStorage — "1" once the email gate has been passed on this device. Never expires. */
export const UNLOCK_KEY = "sa-learn-unlocked";
/** sessionStorage — "1" once the brand splash has played in this browser session. */
export const INTRO_SEEN_KEY = "sa-learn-intro-seen";
/** sessionStorage — "1" once the first row's "start here" outline pulse has played this session. */
export const START_PULSE_KEY = "sa-learn-start-pulsed";

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
export function readStartPulsed(): boolean {
  try { return sessionStorage.getItem(START_PULSE_KEY) === "1"; } catch { return false; }
}
export function writeStartPulsed(): void {
  try { sessionStorage.setItem(START_PULSE_KEY, "1"); } catch { /* ignore */ }
}

/** THE WAITLIST TEASE (Lee, 2026-09-10) — "3 topics · 12 videos · 96 exam questions" for the
 *  WHOLE exam, under the "Get notified when these drop." box. Topics is every topic, videos is
 *  every set (made or not — each is one video), questions is the plain ceqCount sum. Real
 *  counts only; zero reads as zero. */
export function examTease(topicCount: number, sets: readonly Pick<GateSet, "ceqCount">[]): string {
  const q = questionCount(sets);
  return `${topicCount} topic${topicCount === 1 ? "" : "s"} · ${sets.length} video${sets.length === 1 ? "" : "s"} · ${q} exam question${q === 1 ? "" : "s"}`;
}

/** Does a topic get the "Get notified" ask rather than the unlock one? The unlock wording belongs
 *  to a topic that HAS posted videos; one with none posted asks for the waitlist instead. Both
 *  capture the same one email — either submit marks the device, so nothing asks twice. */
export function waitlistNeeded(postedCount: number, signedIn: boolean, unlocked: boolean): boolean {
  return postedCount === 0 && !signedIn && !unlocked;
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
  // "0 videos" before launch. No "coming soon" (Lee, 2026-09-10: nowhere on the page) — a topic
  // with nothing posted is drawn grey, which says it; the minutes appear only once every made
  // one has a runtime (a partial sum would understate).
  const n = sets.length;
  const label = `${n} video${n === 1 ? "" : "s"}`;
  const withVideo = sets.filter((s) => s.hasVideo);
  if (withVideo.length === 0) return label;
  if (withVideo.length < n || withVideo.some((s) => s.runtimeSec == null)) return label;
  const total = withVideo.reduce((a, s) => a + (s.runtimeSec ?? 0), 0);
  return `${label} · ~${Math.max(1, Math.round(total / 60))} min`;
}

/** THE AVERAGE VIDEO (Lee, 2026-09-10: "have the app calculate this so I can try to keep beating
 *  it"). The mean runtime, in minutes, over the sets that HAVE a runtime; null when none does —
 *  the line then simply doesn't claim one. Sets without a runtime are left out of the mean rather
 *  than counted as zero, which would flatter the number. */
export function averageVideoMinutes(sets: readonly Pick<GateSet, "runtimeSec">[]): number | null {
  const timed = sets.filter((s) => s.runtimeSec != null && s.runtimeSec > 0);
  if (timed.length === 0) return null;
  const total = timed.reduce((a, s) => a + (s.runtimeSec ?? 0), 0);
  return total / timed.length / 60;
}

/** "~2.4 min" under ten minutes, "~12 min" from ten up — or null when nothing has a runtime. */
export function averageVideoLabel(sets: readonly Pick<GateSet, "runtimeSec">[]): string | null {
  const m = averageVideoMinutes(sets);
  if (m == null) return null;
  // Rounded to one decimal FIRST, so 9.98 reads "~10 min", not "~10.0 min".
  const tenth = Math.round(m * 10) / 10;
  const n = tenth < 10 ? tenth.toFixed(1) : String(Math.round(m));
  return `~${n} min`;
}

/** "~2.4 min per video" — the Get started caption (redesign, 2026-09-11), or null when nothing has
 *  a runtime: the caption is then simply absent, never a placeholder number. */
export function averageVideoCaption(sets: readonly Pick<GateSet, "runtimeSec">[]): string | null {
  const label = averageVideoLabel(sets);
  return label ? `${label} per video` : null;
}

/** A LATER ROW'S OWN COUNTS (redesign, 2026-09-11): "5 videos · 34 practice questions" — the
 *  topic's set count and its ceqCount sum, nothing from any other topic or exam. Zero questions
 *  reads as the videos alone (a row never advertises "0 practice questions"). */
export function topicRowDetail(sets: readonly Pick<GateSet, "hasVideo" | "locked" | "ceqCount">[]): string | null {
  // HONEST COUNTS (Lee, 2026-09-11: "Do not advertise inventory the student cannot use yet"):
  // videos = posted and playable; questions = on those same sets (posted, not paid-locked); a topic with no
  // playable video says nothing here — the row wears its "Coming soon" tag instead.
  const n = sets.filter((s) => s.hasVideo && !s.locked).length;
  if (n === 0) return null;
  // VIDEOS ONLY (Lee, 2026-09-11, later: practice is off the page until it is refined) — the
  // question count is not advertised while nothing on the page opens it.
  return `${n} video${n === 1 ? "" : "s"}`;
}

/** THE LOCKED PILL'S LINE (redesign, 2026-09-11, the price copy as drafted): tapping Exam 2 or
 *  Exam 3 opens the waitlist sheet with this. Real prices only — Exam 1 free, later exams $50. */
export const LATER_EXAM_PRICE_USD = 50;
export function examWaitlistLine(exam: number): string {
  return `Exam 1 is free. ${examName(exam)} is $${LATER_EXAM_PRICE_USD}. Join the waitlist and I'll tell you the day it opens.`;
}

/** "Exam 2", or "The Final" for 4 — the exam menu lists the Final as an exam too (Lee, 2026-09-11:
 *  "And Final is technically an exam too"). */
export function examName(exam: number): string { return exam === 4 ? "The Final" : `Exam ${exam}`; }

/** THE QUICK ROUND (Lee, 2026-09-11): a Practice card is access to the topic's question bank, not
 *  an order to answer all of it now. The recommended round is at most this many questions; the
 *  rest stay available as "More practice". The card's time is the ROUND's, at 40 s a question
 *  (planTimes' rate) — "~10 min" for a full round, less for a short one, never the whole bank. */
export const QUICK_ROUND_SIZE = 15;
/** A minute a question — the polish brief's "~15 mins to complete" for a full round (09-11). */
export const SECONDS_PER_QUESTION = 60;
export function quickRoundSize(bank: number): number { return Math.max(0, Math.min(QUICK_ROUND_SIZE, bank)); }
export function practiceMinutes(bank: number): number { return Math.max(1, Math.round((quickRoundSize(bank) * SECONDS_PER_QUESTION) / 60)); }
/** "~15 mins to complete" — the card's one number, the ROUND's, never the bank's. Null with
 *  nothing to practice. (A stored per-section estimate would replace this; none exists yet.) */
export function practiceTimeLabel(bank: number): string | null { return bank > 0 ? `~${practiceMinutes(bank)} min${practiceMinutes(bank) === 1 ? "" : "s"} to complete` : null; }

/** submitIntake's campusId is a uuid or null — a demo id or a stale non-uuid value must not fail
 *  the whole capture over a field that is only context. */
export function isUuid(v: string | null | undefined): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
