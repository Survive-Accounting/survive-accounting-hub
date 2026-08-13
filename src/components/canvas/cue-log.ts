// CUE LOG + ALIGNMENT (pure) — PROMPT 4 items 1 & 2.
//
// While filming a frame in film mode, each SPACE press is logged with its
// wall-clock time (ms). When the OBS clip is later dropped on that frame, we
// align: parse the clip's recording-start time from the OBS filename, then
// convert each logged press into a SECOND-OFFSET into the clip. Those offsets are
// the per-beat CUT BOUNDARIES. Filename parsing + clock skew miss sometimes, so a
// manual fallback (a global offset nudge, and per-boundary drag) always exists;
// with no filename timestamp we fall back to the press INTERVALS.
//
// No I/O — the client records presses and stores the log; this module just does
// the math. Everything here is unit-tested.

/** A frame's pending cue log: the wall-clock ms of each SPACE press during a
 *  film-mode visit (the visit's own start is implicit in the first press). */
export interface CueLog {
  frameId: string;
  /** Absolute epoch-ms of each space press, in order. */
  pressesMs: number[];
  /** When the visit began (epoch-ms) — the first beat's natural start. */
  startedAtMs: number;
}

/** The default OBS "Recording Filename Formatting" — %CCYY-%MM-%DD %hh-%mm-%ss.
 *  We match a Y-M-D H-M-S run anywhere in the name, so a prefix/suffix is fine. */
export const DEFAULT_OBS_PATTERN = "%CCYY-%MM-%DD %hh-%mm-%ss";

/** Turn an OBS pattern into a capturing regex. Supports the common tokens; any
 *  literal in the pattern is escaped. Falls back to the default date shape. */
function obsPatternToRegex(pattern: string): RegExp {
  const tokens: Record<string, string> = {
    "%CCYY": "(?<Y>\\d{4})", "%YYYY": "(?<Y>\\d{4})",
    "%MM": "(?<Mo>\\d{2})", "%DD": "(?<D>\\d{2})",
    "%hh": "(?<H>\\d{2})", "%mm": "(?<Mi>\\d{2})", "%ss": "(?<S>\\d{2})",
  };
  // Split on tokens, escape the literal chunks, join with the token regexes.
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const tok = Object.keys(tokens).find((t) => pattern.startsWith(t, i));
    if (tok) { out += tokens[tok]; i += tok.length; }
    else { out += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); i += 1; }
  }
  return new RegExp(out);
}

/** Parse the recording-start time out of an OBS filename → epoch-ms, or null if
 *  no timestamp matches. Interpreted in LOCAL time (OBS writes local time). */
export function parseObsFilename(name: string, pattern: string = DEFAULT_OBS_PATTERN): number | null {
  const strip = name.replace(/\.[a-z0-9]{2,4}$/i, ""); // drop the extension
  const m = obsPatternToRegex(pattern).exec(strip) ?? obsPatternToRegex(DEFAULT_OBS_PATTERN).exec(strip);
  const g = m?.groups;
  if (!g || !g.Y || !g.Mo || !g.D || !g.H || !g.Mi || !g.S) return null;
  const d = new Date(Number(g.Y), Number(g.Mo) - 1, Number(g.D), Number(g.H), Number(g.Mi), Number(g.S));
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

/** Align logged presses to CLIP SECONDS given the clip's recording-start epoch-ms.
 *  boundary[i] = (press[i] − clipStart) / 1000, clamped ≥ 0 and sorted. */
export function alignPressesToClip(pressesMs: number[], clipStartMs: number): number[] {
  return pressesMs
    .map((p) => Math.max(0, (p - clipStartMs) / 1000))
    .sort((a, b) => a - b);
}

/** MANUAL FALLBACK when there's no filename timestamp: keep the INTERVALS between
 *  presses but anchor the first press at t=0 (Lee then nudges the whole set). */
export function fallbackFromIntervals(pressesMs: number[]): number[] {
  if (pressesMs.length === 0) return [];
  const t0 = pressesMs[0];
  return pressesMs.map((p) => Math.max(0, (p - t0) / 1000)).sort((a, b) => a - b);
}

/** Shift every boundary by `offsetS` (the review nudge slider), clamped ≥ 0. */
export function applyOffset(boundaries: number[], offsetS: number): number[] {
  return boundaries.map((b) => Math.max(0, b + offsetS));
}

export interface Segment { start: number; end: number }

/** Turn cut boundaries into per-beat SEGMENTS across a clip of `clipDuration`
 *  seconds. Boundaries at 0 and the clip end are implied. A boundary is a
 *  space-to-space cut, so N presses → up to N+1 segments. Degenerate (≤0-length)
 *  segments are dropped; the result is clamped to the clip. */
export function segmentsFromBoundaries(boundaries: number[], clipDuration: number): Segment[] {
  const cuts = [0, ...boundaries.filter((b) => b > 0 && b < clipDuration), clipDuration]
    .sort((a, b) => a - b)
    .filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-6); // de-dupe
  const segs: Segment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    if (cuts[i + 1] - cuts[i] > 0.05) segs.push({ start: cuts[i], end: cuts[i + 1] });
  }
  return segs;
}

/** Per-boundary drag: replace boundary `index` with a new value, re-clamped and
 *  kept between its neighbours (monotonic). */
export function moveBoundary(boundaries: number[], index: number, valueS: number): number[] {
  const next = [...boundaries];
  if (index < 0 || index >= next.length) return next;
  const lo = index > 0 ? next[index - 1] : 0;
  const hi = index < next.length - 1 ? next[index + 1] : Number.POSITIVE_INFINITY;
  next[index] = Math.min(Math.max(valueS, lo + 0.05), hi - 0.05);
  return next;
}
