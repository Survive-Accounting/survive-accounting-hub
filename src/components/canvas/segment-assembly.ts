// SEGMENT ASSEMBLY (pure) — PROMPT 4 items 3, 4 & 5.
//
// A frame's take can be split at the aligned cut boundaries into per-beat
// SEGMENTS (one space-to-space beat each). Keeper marking is per SEGMENT, and a
// beat's keeper can come from a DIFFERENT take of the same frame (the punch-in
// re-record). This module flattens the keeper segments of a lesson's body frames
// into an ordered edit-decision list (the "keepers reel" + the publish assembly),
// and emits the ffmpeg AUDIO-crossfade filtergraph for a seamless-sounding cut.
//
// INFRA NOTE: Mux multi-input concat (used by publish.functions.ts) does the
// VIDEO assembly as a hard cut and accepts per-input start_time/end_time, so a
// SegmentInput maps 1:1 to a Mux input — no ffmpeg needed for the video. The
// AUDIO crossfade needs ffmpeg (`acrossfade`); assemblyFiltergraph() emits the
// exact filter_complex for that pass (a worker/Auphonic step), while the shipping
// Mux path stays a hard cut. Video is deliberately a hard cut (the snappy look).

/** One keeper beat-segment to assemble: a sub-clip of a take's video. */
export interface SegmentInput {
  frameId: string;
  /** 0-based beat index within the frame's take (space-to-space order). */
  beatIndex: number;
  /** The take's Mux playback id the segment is cut from. */
  playbackId: string;
  /** Sub-clip window in the take, seconds. */
  start: number;
  end: number;
}

/** Build the ordered BODY edit-decision list from already-ordered body frames.
 *  `keeperSegmentsOf(frameId)` returns that frame's keeper segments in beat order
 *  (empty when the frame has no keeper for any beat). Frames missing every keeper
 *  are reported as GAPS (announced, never silently skipped). */
export function buildBodyEdl(
  frames: { id: string }[],
  keeperSegmentsOf: (frameId: string) => SegmentInput[],
): { edl: SegmentInput[]; gapFrameIds: string[] } {
  const edl: SegmentInput[] = [];
  const gapFrameIds: string[] = [];
  for (const f of frames) {
    const segs = keeperSegmentsOf(f.id);
    if (segs.length === 0) gapFrameIds.push(f.id);
    else edl.push(...segs);
  }
  return { edl, gapFrameIds };
}

export interface ReelStep {
  kind: "segment" | "gap";
  frameId: string;
  label: string;
  /** Present for segment steps. */
  segment?: SegmentInput;
}

/** The KEEPERS REEL for a lesson: every keeper segment in film order, with a GAP
 *  step announced wherever a frame is missing its keeper (announced, not skipped
 *  silently). `labelOf(frameId)` names a frame for the announcement. */
export function keepersReel(
  frames: { id: string }[],
  keeperSegmentsOf: (frameId: string) => SegmentInput[],
  labelOf: (frameId: string) => string,
): ReelStep[] {
  const steps: ReelStep[] = [];
  for (const f of frames) {
    const segs = keeperSegmentsOf(f.id);
    if (segs.length === 0) steps.push({ kind: "gap", frameId: f.id, label: labelOf(f.id) });
    else for (const s of segs) steps.push({ kind: "segment", frameId: f.id, label: labelOf(f.id), segment: s });
  }
  return steps;
}

/** Total assembled body duration (sum of segment lengths) in seconds. */
export function edlDuration(edl: SegmentInput[]): number {
  return edl.reduce((a, s) => a + Math.max(0, s.end - s.start), 0);
}

export const DEFAULT_CROSSFADE_MS = 50;

/** The ffmpeg `-filter_complex` body that concatenates N segment inputs with a
 *  short AUDIO crossfade at each join while the VIDEO stays a hard cut. Empty for
 *  ≤ 1 input (nothing to join). Pair with `-map "[v]" -map "[a]"`. */
export function assemblyFiltergraph(n: number, crossfadeMs: number = DEFAULT_CROSSFADE_MS): string {
  if (n <= 1) return "";
  const d = (Math.max(1, crossfadeMs) / 1000).toFixed(3);
  // VIDEO — hard-cut concat (snappy look).
  const vIn = Array.from({ length: n }, (_, i) => `[${i}:v]`).join("");
  const vFilter = `${vIn}concat=n=${n}:v=1:a=0[v]`;
  // AUDIO — chained acrossfade (triangular curve each side), one join at a time.
  const aParts: string[] = [];
  let prev = "[0:a]";
  for (let i = 1; i < n; i++) {
    const out = i === n - 1 ? "[a]" : `[a${i}]`;
    aParts.push(`${prev}[${i}:a]acrossfade=d=${d}:c1=tri:c2=tri${out}`);
    prev = out;
  }
  return `${vFilter};${aParts.join(";")}`;
}

/** A copy-pasteable illustrative ffmpeg command for the report/docs — the real
 *  inputs are the segment sub-clips (each `-ss start -to end -i <take.mp4>`). */
export function assemblyCommandSketch(edl: SegmentInput[], crossfadeMs: number = DEFAULT_CROSSFADE_MS): string {
  const inputs = edl.map((s) => `-ss ${s.start.toFixed(3)} -to ${s.end.toFixed(3)} -i "${s.playbackId}.mp4"`).join(" \\\n  ");
  const fg = assemblyFiltergraph(edl.length, crossfadeMs);
  if (!fg) return `ffmpeg ${inputs} -c copy body.mp4`;
  return `ffmpeg \\\n  ${inputs} \\\n  -filter_complex "${fg}" \\\n  -map "[v]" -map "[a]" -movflags +faststart body.mp4`;
}
