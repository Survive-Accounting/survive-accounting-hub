// LANDMARKS (P2) — where speech starts and stops in a take, from per-frame RMS.
// PURE: every decision here is unit-tested; the DOM-facing decode lives in
// waveform-peaks.ts.
//
// "THE 808 COUNTS AS AUDIO" (the prompt, verbatim): detection is pure ENERGY —
// no high-pass, no spectral gating — so a bass thump crosses the threshold
// exactly like a word does. The slate's countdown beeps are excluded by the
// SLATE landmark (slateEndMs), never by frequency tricks.

export interface SpeechSpan {
  /** ms from clip start where sustained audio first begins; null = silent clip. */
  onsetMs: number | null;
  /** ms from clip start where sustained audio last ends; null = silent clip. */
  offsetMs: number | null;
}

/** P4 tags every trim event with the rule that produced it, so the edit log can
 *  distinguish "the rule was wrong" from "the rule changed". Bump on ANY change
 *  to detection or proposal math. */
export const TRIM_RULE_VERSION = "rms-sustain-v1";
/** Default pre-roll X / post-roll Y (ms) — the prompt's starting values. */
export const DEFAULT_PRE_ROLL_MS = 150;
export const DEFAULT_POST_ROLL_MS = 250;
/** A handle within this many ms of a landmark snaps to it. */
export const SNAP_RADIUS_MS = 80;

export function detectSpeech(rms: ArrayLike<number>, frameMs: number, opts?: { floor?: number; ratio?: number; sustainMs?: number }): SpeechSpan {
  const floor = opts?.floor ?? 0.01;       // absolute silence floor — a dead mic is silent, full stop
  const ratio = opts?.ratio ?? 4;          // speech ≥ ratio × the clip's own noise floor
  const sustainMs = opts?.sustainMs ?? 60; // one crackle is not speech
  const n = rms.length;
  if (!n) return { onsetMs: null, offsetMs: null };
  // Noise floor = 15th percentile — robust even when most of the clip is speech.
  const sorted = Array.from(rms as ArrayLike<number> as number[]).sort((a, b) => a - b);
  const noise = sorted[Math.floor(n * 0.15)] ?? 0;
  const thr = Math.max(floor, noise * ratio);
  const need = Math.max(1, Math.round(sustainMs / frameMs));

  let onsetMs: number | null = null;
  let run = 0;
  for (let i = 0; i < n; i++) {
    if (rms[i] >= thr) { run += 1; if (run >= need && onsetMs === null) onsetMs = (i - run + 1) * frameMs; }
    else run = 0;
  }
  let offsetMs: number | null = null;
  run = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (rms[i] >= thr) { run += 1; if (run >= need) { offsetMs = (i + run) * frameMs; break; } }
    else run = 0;
  }
  return { onsetMs, offsetMs };
}

/** The PROPOSE TRIMS rule: in = onset − X (never inside the slate, never < 0),
 *  out = offset + Y (never past the real end). Null when the clip has no
 *  detectable speech — proposing a trim on silence would cut the whole clip. */
export function proposeTrim(span: SpeechSpan, opts: { durationS: number; slateEndMs?: number | null; preRollMs: number; postRollMs: number }): { inS: number; outS: number } | null {
  if (span.onsetMs == null || span.offsetMs == null) return null;
  const slateS = (opts.slateEndMs ?? 0) / 1000;
  const inS = Math.max(0, slateS, (span.onsetMs - opts.preRollMs) / 1000);
  const outS = Math.min(opts.durationS, (span.offsetMs + opts.postRollMs) / 1000);
  // A proposal that leaves almost nothing is a detection failure, not an edit.
  return outS - inS > 0.05 ? { inS, outS } : null;
}

/** ALL sustained-speech spans (ms) — the silence sweep and the timeline handle
 *  snapping need every boundary, not just the first onset / last offset. Same
 *  threshold model as detectSpeech; spans closer than mergeMs fuse, so the gap
 *  between two words never reads as a silence. Pure. */
export function speechSpans(rms: ArrayLike<number>, frameMs: number, opts?: { floor?: number; ratio?: number; sustainMs?: number; mergeMs?: number }): { startMs: number; endMs: number }[] {
  const floor = opts?.floor ?? 0.01;
  const ratio = opts?.ratio ?? 4;
  const sustainMs = opts?.sustainMs ?? 60;
  const mergeMs = opts?.mergeMs ?? 300;
  const n = rms.length;
  if (!n) return [];
  const sorted = Array.from(rms as ArrayLike<number> as number[]).sort((a, b) => a - b);
  const noise = sorted[Math.floor(n * 0.15)] ?? 0;
  const thr = Math.max(floor, noise * ratio);
  const need = Math.max(1, Math.round(sustainMs / frameMs));
  const raw: { startMs: number; endMs: number }[] = [];
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    const loud = i < n && rms[i] >= thr;
    if (loud && runStart < 0) runStart = i;
    if (!loud && runStart >= 0) {
      if (i - runStart >= need) raw.push({ startMs: runStart * frameMs, endMs: i * frameMs });
      runStart = -1;
    }
  }
  const out: { startMs: number; endMs: number }[] = [];
  for (const s of raw) {
    const prev = out[out.length - 1];
    if (prev && s.startMs - prev.endMs < mergeMs) prev.endMs = s.endMs;
    else out.push({ ...s });
  }
  return out;
}

/** SILENCE SWEEP (Lee, 08-20): the internal cuts that remove every silence
 *  longer than minSilenceMs inside a clip's trimmed window — head and tail
 *  silences included (splitAroundCut turns those into plain trims). Each cut
 *  keeps postRoll after the speech before it and preRoll before the speech
 *  after it, so deliveries keep their natural edges. A cut that the pads
 *  shrink under 300ms isn't worth a split. Pure; cuts in ascending order. */
export function silenceCuts(spans: { startMs: number; endMs: number }[], opts: { inS: number; outS: number; minSilenceMs: number; preRollMs: number; postRollMs: number }): { startS: number; endS: number }[] {
  const inMs = opts.inS * 1000, outMs = opts.outS * 1000;
  const win = spans
    .filter((s) => s.endMs > inMs && s.startMs < outMs)
    .map((s) => ({ startMs: Math.max(s.startMs, inMs), endMs: Math.min(s.endMs, outMs) }));
  if (!win.length) return []; // an all-silent window is a take problem, not a sweep
  const cuts: { startS: number; endS: number }[] = [];
  const push = (aMs: number, bMs: number) => { if (bMs - aMs >= 300) cuts.push({ startS: aMs / 1000, endS: bMs / 1000 }); };
  if (win[0].startMs - inMs > opts.minSilenceMs) push(inMs, win[0].startMs - opts.preRollMs);
  for (let i = 0; i < win.length - 1; i++) {
    if (win[i + 1].startMs - win[i].endMs > opts.minSilenceMs) push(win[i].endMs + opts.postRollMs, win[i + 1].startMs - opts.preRollMs);
  }
  if (outMs - win[win.length - 1].endMs > opts.minSilenceMs) push(win[win.length - 1].endMs + opts.postRollMs, outMs);
  return cuts;
}

/** Magnetic snap: the nearest landmark within the radius wins; otherwise the
 *  position is returned untouched. PURE. */
export function snapMs(ms: number, landmarks: Array<number | null | undefined>, radiusMs = SNAP_RADIUS_MS): number {
  let best = ms;
  let bestD = radiusMs + 1;
  for (const l of landmarks) {
    if (l == null) continue;
    const d = Math.abs(l - ms);
    if (d <= radiusMs && d < bestD) { bestD = d; best = l; }
  }
  return best;
}
