// INTRO AUTO-TRIM (pure) — the take-board math for trimming an intro take down to
// the music's real length, from the audio onset. Non-destructive: the raw take is
// kept; this computes the trim WINDOW (start + duration) + any warning, which the
// board shows and PUBLISH applies (Mux ingest-trim). Browser Web Audio does the
// onset detection and feeds `onset` / `rawDuration` here.

export type TrimWarning = "too_short" | "onset_not_detected";

export interface TrimResult {
  /** Where the trimmed clip starts in the raw take (seconds). */
  trimStart: number;
  /** How long the trimmed clip runs (seconds). */
  trimmedDuration: number;
  /** null = clean; else a fail-loud flag the board surfaces. */
  warning: TrimWarning | null;
}

/** Compute the trim window for a raw intro take.
 *  - too_short: raw is shorter than the target length → NEVER pad; flag it, don't
 *    trim (publish blocks). Takes precedence over everything.
 *  - onset_not_detected: no onset (silent / fade-in) → trim from 0 for `length`,
 *    flag "verify".
 *  - otherwise: start at the onset, clamped so the window fits inside the raw take. */
export function computeTrim(onset: number | null, rawDuration: number, length: number): TrimResult {
  if (!(rawDuration >= length)) return { trimStart: 0, trimmedDuration: round(rawDuration), warning: "too_short" };
  if (onset == null || !Number.isFinite(onset)) return { trimStart: 0, trimmedDuration: length, warning: "onset_not_detected" };
  const start = Math.min(Math.max(0, onset), rawDuration - length);
  return { trimStart: round(start), trimmedDuration: length, warning: null };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** too_short is the only warning that BLOCKS publish; onset_not_detected still
 *  ships (it just trims from 0 and asks Lee to verify). */
export function isPublishable(warning: TrimWarning | null | undefined): boolean {
  return warning !== "too_short";
}

/** "raw 8.2s → trimmed 6.0s" for the board. */
export function trimLabel(rawDuration: number, trimmedDuration: number): string {
  return `raw ${fmt(rawDuration)}s → trimmed ${fmt(trimmedDuration)}s`;
}
const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export const WARNING_TEXT: Record<TrimWarning, string> = {
  too_short: "too short — won't publish",
  onset_not_detected: "onset not detected — verify",
};
