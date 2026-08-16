// DISSECT STITCH (smart stitching) — the pure half. A dissected CEQ's clips
// become ONE seamless asset at INGEST (playback-time switching between assets
// hiccups; one file plays clean). Sources are NEVER touched — this produces a
// new file, and re-stitching with different knobs is always possible.
//
// The recipe (Lee's spec):
//   AUTO-TRIM   head/tail silence per clip (silencedetect), with per-clip
//               padding overrides for held pauses.
//   GAPS        a deliberate breath between clips — base ~200ms with
//               DETERMINISTIC ±jitter (same job ⇒ same rhythm; never
//               metronomic, never random-on-rerender). Video holds the
//               outgoing frame (tpad clone); audio fills with ROOM TONE
//               (Lee's recorded silence, looped) or a low pink-noise floor.
//   JOINS       audio joints get micro-fades (in/out envelopes — afade, NOT
//               acrossfade: crossfading would eat time and drift audio vs
//               video); room-tone edges get a longer blend. VIDEO CUTS STAY
//               HARD — jump cuts are the format. Every clip is
//               loudness-normalized to one target so levels never jump.
//   CHAPTERS    the manifest carries each moment's exact start offset in the
//               final asset — dissect moments become timestamps for free.
//
// Pure: no I/O, no Bun. The server runs silence DETECTION (an ffmpeg pass) and
// feeds the parsed results here; bun test asserts graphs + math directly.
import { RENDER } from "./config";
import type { StagedFile } from "./stages";

export interface SilenceInterval { start: number; end: number }
export interface DissectTrim { start: number; end: number }

export const DISSECT_DEFAULTS = {
  silenceDb: -40,       // silencedetect noise floor
  minSilenceS: 0.15,    // shorter dips than this aren't "silence"
  gapMs: 200,           // the breath between clips
  gapJitterMs: 75,      // ± human variation, deterministic per joint
  loudI: -16,           // LUFS target per clip
  jointFadeS: 0.015,    // micro-fade at every speech joint (kills clicks)
  toneBlendS: 0.045,    // longer blend on room-tone edges (masks tone jumps)
  minKeepS: 0.4,        // never trim a clip below this — fall back to full
} as const;

/** The argv for the DETECTION pass (server runs it, stderr feeds parseSilence). */
export function detectSilenceArgs(path: string, silenceDb = DISSECT_DEFAULTS.silenceDb, minSilenceS = DISSECT_DEFAULTS.minSilenceS): string[] {
  return ["-hide_banner", "-i", path, "-af", `silencedetect=n=${silenceDb}dB:d=${minSilenceS}`, "-f", "null", "-"];
}

/** Parse silencedetect stderr → intervals. A trailing silence_start without a
 *  matching end is open-ended (runs to EOF) — end = Infinity, caller clamps. */
export function parseSilence(stderr: string): SilenceInterval[] {
  const out: SilenceInterval[] = [];
  let open: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) { open = parseFloat(s[1]); continue; }
    const e = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (e && open != null) { out.push({ start: Math.max(0, open), end: parseFloat(e[1]) }); open = null; }
  }
  if (open != null) out.push({ start: Math.max(0, open), end: Infinity });
  return out;
}

/** Head/tail trim from detected silence. Only silences TOUCHING the ends trim
 *  (interior pauses are performance, not dead air). Padding keeps a held
 *  pause; a trim that would leave under minKeepS falls back to the full clip
 *  (detection guessed wrong — never destroy a clip). */
export function trimFromSilence(
  intervals: SilenceInterval[],
  durationS: number,
  o?: { padHeadS?: number; padTailS?: number; minKeepS?: number },
): DissectTrim {
  const padHead = o?.padHeadS ?? 0;
  const padTail = o?.padTailS ?? 0;
  const minKeep = o?.minKeepS ?? DISSECT_DEFAULTS.minKeepS;
  const EDGE = 0.05; // an interval within this of an edge counts as touching it
  let start = 0;
  let end = durationS;
  for (const iv of intervals) {
    if (iv.start <= EDGE) start = Math.max(start, Math.min(iv.end, durationS) - padHead);
    if (iv.end >= durationS - EDGE || iv.end === Infinity) end = Math.min(end, iv.start + padTail);
  }
  start = Math.max(0, start);
  end = Math.min(durationS, end);
  if (end - start < minKeep) return { start: 0, end: durationS };
  return { start, end };
}

/** The breath before clip k+1 — deterministic ±jitter (Knuth hash), so a
 *  re-stitch of the same job reproduces the same human rhythm. */
/** RESOLVE THE HEAD (F1): a manual trim wins, then the SLATE (the app knows
 *  exactly when its countdown cleared), then silence detection. A slate longer
 *  than the clip is nonsense and falls back. The result is clamped so a head
 *  can never cross its own tail. Pure. */
export function resolveTrim(
  detected: { start: number; end: number },
  opts: { manual?: { start?: number; end?: number }; slateHeadS?: number | null; durationS: number },
): { start: number; end: number } {
  const { manual, slateHeadS, durationS } = opts;
  const slateOk = slateHeadS != null && slateHeadS >= 0 && slateHeadS < durationS;
  const start = manual?.start ?? (slateOk ? (slateHeadS as number) : detected.start);
  const end = manual?.end ?? detected.end;
  return { start, end: Math.max(start + 0.2, end) };
}

export function gapForJoin(k: number, baseMs = DISSECT_DEFAULTS.gapMs, jitterMs = DISSECT_DEFAULTS.gapJitterMs): number {
  const h = (((k + 1) * 2654435761) >>> 0) % (2 * jitterMs + 1);
  return baseMs + (h - jitterMs);
}

export interface DissectManifestClip { startS: number; durS: number }
export interface DissectManifest { clips: DissectManifestClip[]; totalS: number; gapsS: number[]; roomTone: boolean }
export interface DissectPlan { args: string[]; manifest: DissectManifest }

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The stitch argv + the chapters manifest. files = the clips in moment order
 *  (roomTone passed separately). trims are per-clip source in/out points.
 *  VIDEO: trim → normalize geometry → hold last frame through the gap (tpad
 *  clone) → hard concat. AUDIO: trim → loudnorm to one target → micro-fade
 *  envelopes → exact-length pin (apad+atrim, the aNorm doctrine — envelopes
 *  never shift the timeline) → gap segments from room tone (asplit + aloop)
 *  or a pink floor → concat. Manifest offsets are exact by construction:
 *  start_k = Σ(trimmedDur + gap) for j<k. */
export function dissectStitchArgs(
  files: StagedFile[],
  trims: DissectTrim[],
  outPath: string,
  o?: { gapsS?: number[]; roomTone?: StagedFile; loudI?: number; jointFadeS?: number; toneBlendS?: number },
): DissectPlan {
  if (files.length === 0) throw new Error("dissect_stitch: no clips");
  if (trims.length !== files.length) throw new Error("dissect_stitch: trims must match clips");
  const { width: w, height: h, fps, audioHz: hz } = RENDER;
  const loudI = o?.loudI ?? DISSECT_DEFAULTS.loudI;
  const fadeS = o?.jointFadeS ?? DISSECT_DEFAULTS.jointFadeS;
  const blendS = o?.toneBlendS ?? DISSECT_DEFAULTS.toneBlendS;
  const n = files.length;
  const gapsS = (o?.gapsS ?? Array.from({ length: Math.max(0, n - 1) }, (_, k) => gapForJoin(k) / 1000)).map(r3);
  if (gapsS.length !== Math.max(0, n - 1)) throw new Error("dissect_stitch: need one gap per joint");
  const rt = o?.roomTone;

  const durs = trims.map((t) => r3(t.end - t.start));
  const inputs = files.flatMap((f) => ["-i", f.path]);
  if (rt) inputs.push("-i", rt.path);
  const rtIdx = n; // room tone is the last -i when present

  const parts: string[] = [];
  // video: trim + normalize (+ gap freeze on all but the last)
  files.forEach((f, i) => {
    const t = trims[i];
    const pad = i < n - 1 ? `,tpad=stop_mode=clone:stop_duration=${gapsS[i]}` : "";
    parts.push(`[${i}:v]trim=start=${r3(t.start)}:end=${r3(t.end)},setpts=PTS-STARTPTS,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1,format=yuv420p${pad}[cv${i}]`);
  });
  // audio: trim + loudnorm + joint envelopes + exact-length pin
  files.forEach((f, i) => {
    const t = trims[i];
    const d = durs[i];
    const env = `afade=t=in:d=${fadeS},afade=t=out:st=${r3(Math.max(0, d - fadeS))}:d=${fadeS}`;
    parts.push(
      f.hasAudio !== false
        ? `[${i}:a]atrim=start=${r3(t.start)}:end=${r3(t.end)},asetpts=PTS-STARTPTS,aresample=${hz},aformat=sample_fmts=fltp:channel_layouts=stereo,loudnorm=I=${loudI}:TP=-1.5:LRA=11,${env},apad,atrim=0:${d},asetpts=PTS-STARTPTS[ca${i}]`
        : `anullsrc=r=${hz}:cl=stereo,atrim=0:${d},asetpts=PTS-STARTPTS[ca${i}]`,
    );
  });
  // gap fill: room tone (split once, loop per gap) or the pink floor fallback
  if (n > 1) {
    if (rt) parts.push(`[${rtIdx}:a]aresample=${hz},aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=${n - 1}${gapsS.map((_, k) => `[rt${k}]`).join("")}`);
    gapsS.forEach((g, k) => {
      const env = `afade=t=in:d=${blendS},afade=t=out:st=${r3(Math.max(0, g - blendS))}:d=${blendS}`;
      parts.push(
        rt
          ? `[rt${k}]aloop=loop=-1:size=${hz * 30},atrim=0:${g},asetpts=PTS-STARTPTS,${env}[cg${k}]`
          : `anoisesrc=r=${hz}:colour=pink:amplitude=0.0006,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:${g},asetpts=PTS-STARTPTS,${env}[cg${k}]`,
      );
    });
  }
  // concats: video (N segments — gaps live inside the tpad), audio (2N-1)
  const vOut = n === 1 ? "[cv0]" : "[vout]";
  const aOut = n === 1 ? "[ca0]" : "[aout]";
  if (n > 1) {
    parts.push(`${files.map((_, i) => `[cv${i}]`).join("")}concat=n=${n}:v=1:a=0[vout]`);
    const aSeq = files.map((_, i) => (i < n - 1 ? `[ca${i}][cg${i}]` : `[ca${i}]`)).join("");
    parts.push(`${aSeq}concat=n=${2 * n - 1}:v=0:a=1[aout]`);
  }

  const clips: DissectManifestClip[] = [];
  let cursor = 0;
  durs.forEach((d, i) => { clips.push({ startS: r3(cursor), durS: d }); cursor += d + (i < n - 1 ? gapsS[i] : 0); });

  const args = [
    "-y", ...inputs,
    "-filter_complex", parts.join(";"),
    "-map", vOut, "-map", aOut,
    "-r", String(fps),
    "-c:v", "libx264", "-crf", String(RENDER.crf), "-preset", RENDER.preset, "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", `${RENDER.audioKbps}k`, "-ar", String(hz),
    "-movflags", "+faststart",
    outPath,
  ];
  return { args, manifest: { clips, totalS: r3(cursor), gapsS, roomTone: !!rt } };
}
