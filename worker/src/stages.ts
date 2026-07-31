// STAGE PLANNER (pure) — turns a job spec's stages into exact ffmpeg argv.
// No I/O, no Bun APIs: the server feeds it local paths + probed durations and
// runs what it returns, and bun test asserts the argv/filtergraphs directly.
//
// PIPELINE SHAPE: a job is an ordered list of STAGES; each stage consumes named
// files and produces ONE file; the last stage's output is uploaded. New effects
// (the queued reversed-tail brand intro, the music bed) register here as new
// stage kinds — the concat is just the first stage kind, not the pipeline.
import { RENDER } from "./config";

export interface JobInput { id: string; url: string }

export interface ConcatStage {
  kind: "concat";
  /** Input ids (or prior stage outputs), in splice order. */
  inputs: string[];
  /** Seam crossfade; 0 = hard cut. Default RENDER.crossfadeMs. */
  crossfadeMs?: number;
}
/** QUEUED — brand intro: reversed muted first-N-seconds of `input`, white flash
 *  baked on its tail. Registered so job specs can name it; not renderable yet. */
export interface ReversedTailStage { kind: "reversed_tail"; input: string; seconds?: number; flashMs?: number }
/** QUEUED — music bed under the speech track. */
export interface MusicBedStage { kind: "music_bed"; input: string; bed: string; gainDb?: number }
export type Stage = ConcatStage | ReversedTailStage | MusicBedStage;

export interface JobSpec {
  v: 1;
  inputs: JobInput[];
  stages: Stage[];
  output: { putUrl: string; contentType?: string };
}

/** Loud, typed refusal for the registered-but-queued stage kinds. */
export class QueuedStageError extends Error {
  constructor(kind: string) { super(`stage "${kind}" is registered but not implemented yet (queued)`); }
}

export interface StagedFile {
  path: string;
  durationS: number;
  /** False when ffprobe finds no audio stream — the planner substitutes silence
   *  (anullsrc) so one mute clip can't fail the whole render. Default true. */
  hasAudio?: boolean;
}

const enc = (o: { crf: number; preset: string; audioKbps: number; audioHz: number; fps: number }) => [
  "-r", String(o.fps),
  "-c:v", "libx264", "-crf", String(o.crf), "-preset", o.preset, "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", `${o.audioKbps}k`, "-ar", String(o.audioHz),
  "-movflags", "+faststart",
];

/** Per-input normalization — mixed sources (OBS takes, phone clips, Mux
 *  renditions) must share geometry/fps/SAR before concat or xfade will refuse. */
const vNorm = (i: number, w: number, h: number, fps: number) =>
  `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1,format=yuv420p[v${i}]`;
/** Audio is PADDED+TRIMMED to the clip's probed (container) duration — the same
 *  number the video xfade offsets are computed from. Without this, acrossfade
 *  (which has no offset param) fires wherever each audio stream happens to end,
 *  and per-clip audio/video length deltas (~one AAC frame each) accumulate into
 *  audible lip-sync drift across a long stitch. An audio-less clip becomes
 *  silence of exactly the same length. */
const aNorm = (i: number, hz: number, durS: number, hasAudio: boolean) =>
  hasAudio
    ? `[${i}:a]aresample=${hz},aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:${round3(durS)},asetpts=PTS-STARTPTS[a${i}]`
    : `anullsrc=r=${hz}:cl=stereo,atrim=0:${round3(durS)},asetpts=PTS-STARTPTS[a${i}]`;

/** CONCAT argv. Two shapes:
 *  - crossfadeMs = 0 → the concat filter (hard cut).
 *  - crossfadeMs > 0 → chained xfade/acrossfade; the k-th seam's offset is
 *    Σ(durations of clips 0..k-1) − k·fade — the SAME formula the app's
 *    stitchManifest uses, so chapter offsets match the rendered file exactly. */
export function concatArgs(files: StagedFile[], outPath: string, opts?: { crossfadeMs?: number }): string[] {
  if (files.length === 0) throw new Error("concat: no inputs");
  const { width: w, height: h, fps, audioHz } = RENDER;
  const f = (opts?.crossfadeMs ?? RENDER.crossfadeMs) / 1000;
  const inputs = files.flatMap((x) => ["-i", x.path]);
  const norm = files.map((x, i) => `${vNorm(i, w, h, fps)};${aNorm(i, audioHz, x.durationS, x.hasAudio !== false)}`).join(";");

  let graph: string; let vOut: string; let aOut: string;
  if (files.length === 1) {
    graph = norm; vOut = "[v0]"; aOut = "[a0]";
  } else if (f <= 0) {
    const pairs = files.map((_, i) => `[v${i}][a${i}]`).join("");
    graph = `${norm};${pairs}concat=n=${files.length}:v=1:a=1[vout][aout]`;
    vOut = "[vout]"; aOut = "[aout]";
  } else {
    const vChain: string[] = []; const aChain: string[] = [];
    let acc = files[0].durationS;
    let prevV = "v0"; let prevA = "a0";
    for (let k = 1; k < files.length; k++) {
      const offset = Math.max(0, acc - k * f); // Σ dur(0..k-1) − k·fade
      const cv = k === files.length - 1 ? "vout" : `xv${k}`;
      const ca = k === files.length - 1 ? "aout" : `xa${k}`;
      vChain.push(`[${prevV}][v${k}]xfade=transition=fade:duration=${f}:offset=${round3(offset)}[${cv}]`);
      aChain.push(`[${prevA}][a${k}]acrossfade=d=${f}[${ca}]`);
      acc += files[k].durationS;
      prevV = cv; prevA = ca;
    }
    graph = `${norm};${vChain.join(";")};${aChain.join(";")}`;
    vOut = "[vout]"; aOut = "[aout]";
  }
  return ["-y", ...inputs, "-filter_complex", graph, "-map", vOut, "-map", aOut, ...enc(RENDER), outPath];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Registry gate — the server calls this per stage. Only "concat" renders today;
 *  the queued kinds fail LOUD (never a silent skip), unknown kinds fail louder. */
export function planStage(stage: Stage, files: StagedFile[], outPath: string): string[] {
  switch (stage.kind) {
    case "concat":
      return concatArgs(files, outPath, { crossfadeMs: stage.crossfadeMs });
    case "reversed_tail":
    case "music_bed":
      throw new QueuedStageError(stage.kind);
    default:
      throw new Error(`unknown stage kind "${(stage as { kind?: string }).kind}"`);
  }
}

/** Spec validation — everything the server needs to refuse a bad job up front. */
export function validateSpec(spec: unknown): asserts spec is JobSpec {
  const s = spec as Partial<JobSpec> | null;
  if (!s || s.v !== 1) throw new Error("job spec: v must be 1");
  if (!Array.isArray(s.inputs) || s.inputs.length === 0) throw new Error("job spec: inputs required");
  for (const i of s.inputs) if (!i?.id || !/^https?:\/\//.test(i?.url ?? "")) throw new Error(`job spec: bad input ${JSON.stringify(i?.id)}`);
  if (!Array.isArray(s.stages) || s.stages.length === 0) throw new Error("job spec: stages required");
  const ids = new Set(s.inputs.map((i) => i.id));
  s.stages.forEach((st, si) => {
    // A stage may also consume an EARLIER stage's output as `__stage<k>` (k < si)
    // — the chaining the runner implements, needed once reversed_tail/music_bed
    // feed the concat.
    const known = (id: string) => ids.has(id) || (/^__stage(\d+)$/.test(id) && Number(id.slice(7)) < si);
    if (st.kind === "concat") { for (const id of st.inputs) if (!known(id)) throw new Error(`job spec: concat names unknown input "${id}"`); }
    else if (st.kind === "reversed_tail" || st.kind === "music_bed") { /* queued kinds validated at plan time */ }
    else throw new Error(`job spec: unknown stage kind "${(st as { kind?: string }).kind}"`);
  });
  if (!/^https:\/\//.test(s.output?.putUrl ?? "")) throw new Error("job spec: output.putUrl must be https");
}
