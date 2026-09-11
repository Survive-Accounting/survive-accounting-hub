// DOES THE STORED TRANSCRIPT BELONG TO THIS FILE? Pure.
//
// Lee, 2026-09-11: "my assets video is saying it's burning captions into 116 cards. That seems
// wrong. I only filmed for way less than that?" The count was right that time — 373 words over
// 1:58 is 116 captions — but it exposed a real gap: a video's transcript is stored per slot
// (blastoff/<publish key>.take) and the post panel reused it without looking at the file picked
// now. Pick a different take for the same slot and it would caption the old words.
//
// So the stored row's Whisper duration is checked against the picked file's own length (read
// from its metadata, in the browser). They agree to within a fraction of a second for the same
// file; the tolerance is two seconds or 3 %, whichever is larger. When either length is unknown
// — an old row without a duration, a file whose metadata won't read — it can't be checked, and
// the stored words are reused as before.

/** m:ss, or "?:??" when there is no length. */
export function clock(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "?:??";
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** True when the stored transcript's length fits the file's — or when either is unknown. */
export function transcriptFitsFile(storedS: number | null | undefined, fileS: number | null | undefined): boolean {
  if (storedS == null || fileS == null || !Number.isFinite(storedS) || !Number.isFinite(fileS)) return true;
  return Math.abs(storedS - fileS) <= Math.max(2, fileS * 0.03);
}
