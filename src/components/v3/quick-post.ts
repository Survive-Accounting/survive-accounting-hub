// QUICK POST — the pure half of /v3/quick-post (QuickPost.tsx).
//
// Lee, 2026-09-13: "I just cranked out a bunch of videos and I want to get them posted quickly with
// the thumbnails style and everything … I want to separate the editor split tool and the posting —
// I don't have to post that exact split … it just needs to connect to the batch, the basket of
// questions … I don't need captions or transcription either. I really just need to make a thumbnail
// and put it on the site in the Easy Points topic, and remove the other ones."
//
// So a video here belongs to a SET (the basket of questions), not to a split of its plan: video N
// of the list is the set's publication N (publish key `setId` for the first, `setId#N` after —
// the same keys the normal post uses, so posting over the old videos REPLACES them in place).

/** Lee's running order for 5 Types of Accounts, as he said it. */
export const EASY_POINTS_ORDER = [
  "How this works",
  "Word problems",
  "What type of account?",
  "Assets",
  "Receivables cheat code",
  "Prepaid cheat code",
  "Payables cheat code",
  "Receivables vs. payables",
  "Unearned revenue",
  "Equity",
  "Retained earnings",
  "Dividends",
  "Common stock",
  "Revenue",
  "Expenses",
];

/** The set those belong to. */
export const EASY_POINTS_SET_ID = "deck-e1s-2-1";

/** The publish key for the video at `index` — split 1 is the bare set id (publish-rekey.ts publishKey). */
export function quickPubKey(setId: string, index: number): string {
  return index === 0 ? setId : `${setId}#${index + 1}`;
}

/** One title per non-blank line, trimmed. */
export function parseTitles(text: string): string[] {
  return text.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
}

const CHEAT = /\s*cheat\s*code\s*$/i;

/** What the cover shows: "Receivables cheat code" → the CHEAT CODE variant with "Receivables" as
 *  the title; anything else is a standard cover with the title as written. The site title keeps
 *  the full wording. */
export function coverFor(title: string): { title: string; variant: "STANDARD" | "CHEAT_CODE" } {
  if (CHEAT.test(title) && title.replace(CHEAT, "").trim()) return { title: title.replace(CHEAT, "").trim(), variant: "CHEAT_CODE" };
  return { title, variant: "STANDARD" };
}

/** Files in filming order: OBS names them by timestamp ("2026-09-13 14-02-11.mp4"), so a natural
 *  name sort is the order they were shot in. */
export function filmingOrder<T extends { name: string }>(files: readonly T[]): T[] {
  return files.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** "1:47" — or "—" when unknown. */
export function clock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Average, total, and count over the durations that are known. */
export function lengthStats(durations: readonly (number | null | undefined)[]): { count: number; total: number; average: number | null } {
  const known = durations.filter((d): d is number => d != null && Number.isFinite(d));
  const total = known.reduce((a, b) => a + b, 0);
  return { count: known.length, total, average: known.length ? total / known.length : null };
}

/** Old site videos this post would NOT replace: the set's site publications at a position past the
 *  new list's end. Posting over the rest replaces them by key. */
export function leftovers<T extends { takeIndex: number }>(existing: readonly T[], newCount: number): T[] {
  return existing.filter((p) => p.takeIndex >= newCount);
}
