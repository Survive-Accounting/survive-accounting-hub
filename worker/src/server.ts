// RENDER WORKER — a tiny Bun HTTP service that runs ffmpeg pipelines on Fly.io.
// Zero npm deps (Bun.serve / Bun.spawn / fetch). Auth = shared bearer token.
//
//   POST /render     { v:1, inputs, stages, output:{putUrl} } → 202 { jobId }
//   GET  /jobs/:id   → { state, note, stageIndex, totalStages, error }
//   GET  /healthz    → { ok, ffmpeg }   (no auth — Fly checks + app preflight)
//
// Lifecycle per job: queued → downloading → rendering → uploading → done|error.
// Stages chain file-to-file (stage k's output feeds k+1) — robust + debuggable;
// the filtergraph planning lives in stages.ts (pure, unit-tested).
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LIMITS } from "./config";
import { DISSECT_DEFAULTS, detectSilenceArgs, dissectStitchArgs, gapForJoin, parseSilence, trimFromSilence, type DissectTrim, resolveTrim } from "./dissect-stitch";
import { computeLoop } from "./loop-builder";
import { planStage, validateSpec, type JobSpec, type StagedFile } from "./stages";

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.WORKER_TOKEN ?? "";
if (!TOKEN) console.error("WORKER_TOKEN not set — every authed route will 401 until it is.");

type JobState = "queued" | "downloading" | "rendering" | "uploading" | "done" | "error";
interface Job {
  id: string;
  state: JobState;
  note: string;
  stageIndex: number;
  totalStages: number;
  error: string | null;
  startedAt: number;
  /** Stage-produced metadata (dissect_stitch: the chapters manifest). */
  result: unknown | null;
  /** CANCELLED (2026-09-16): a DELETE arrived — the running ffmpeg was killed; the error reads "cancelled". */
  cancelled?: boolean;
}
/** The ffmpeg of the job running right now (MAX_RUNNING is 1 by default), so a cancel can kill it. */
let currentJobId: string | null = null;
let currentKill: (() => void) | null = null;
const jobs = new Map<string, Job>();
const MAX_KEPT = 40;

// IDLE SELF-EXIT (the Fly strategy — see fly.toml): the proxy's auto-stop is
// OFF because it can't see a background ffmpeg and would kill mid-render; we
// exit OURSELVES when idle instead. Clean exit ⇒ machine stops (≈$0), the next
// request auto-starts it.
let activeJobs = 0;
let lastActivity = Date.now();

// ONE AT A TIME (Lee, 2026-09-16: "stitching has started taking a really long time… the cash cheat code video
// keeps getting stuck"). Every POST used to start its ffmpeg at once; with several film tabs stitching, the
// 2 shared CPUs thrashed between renders, memory ran out, the machine restarted and every job was lost
// ("unknown job"). Now jobs wait their turn — a queued job says how many are ahead and for how long, so the
// app's watchdog sees it moving — and each render gets the whole machine. MAX_RUNNING raises it on a bigger VM.
const MAX_RUNNING = Math.max(1, Number(process.env.MAX_RUNNING ?? 1) || 1);
let running = 0;
const waiting: Array<{ job: Job; spec: JobSpec }> = [];
function pump(): void {
  while (running < MAX_RUNNING && waiting.length) {
    const next = waiting.shift()!;
    running++;
    void runJob(next.job, next.spec).finally(() => { running--; pump(); });
  }
}
const queuedNote = (job: Job): string => {
  const ahead = waiting.findIndex((w) => w.job === job);
  const waitS = Math.round((Date.now() - job.startedAt) / 1000);
  return ahead < 0 ? job.note : `queued · ${ahead === 0 ? "next up" : `${ahead} ahead`} · ${waitS}s`;
};
setInterval(() => {
  if (activeJobs === 0 && Date.now() - lastActivity > LIMITS.idleExitMs) {
    console.log("idle — exiting so the machine stops (auto_start revives on the next request)");
    process.exit(0);
  }
}, 60_000);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const authed = (req: Request) => TOKEN.length > 0 && req.headers.get("authorization") === `Bearer ${TOKEN}`;

let ffmpegVersion = "unknown";
try {
  const p = Bun.spawnSync(["ffmpeg", "-version"]);
  ffmpegVersion = p.stdout.toString().split("\n")[0]?.trim() ?? "unknown";
} catch { ffmpegVersion = "MISSING — ffmpeg not on PATH"; }

/** ffprobe a file's duration in seconds (container-level). */
async function probeDuration(path: string): Promise<number> {
  const p = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  if ((await p.exited) !== 0) throw new Error(`ffprobe failed for ${path}`);
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`ffprobe: bad duration "${out.trim()}" for ${path}`);
  return d;
}

/** Does the file carry an audio stream? Absent ⇒ the planner substitutes
 *  silence rather than failing the whole render on a mute clip. */
async function probeHasAudio(path: string): Promise<boolean> {
  const p = Bun.spawn(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim().length > 0;
}

/** A render that makes no progress for this long is hung, not slow — it is killed and the job fails loudly
 *  (Lee, 2026-09-16: a stitch sat at "stitching · 11:49"; nothing said whether ffmpeg was moving). */
const STALL_MS = 90_000;

/** Run one ffmpeg invocation with a hard timeout; on failure surface the stderr
 *  tail (that's where ffmpeg says WHY). With `onProgress`, ffmpeg reports through -progress
 *  (out_time) so the job can say how far along it is, and a stall kills it. */
async function runFfmpeg(args: string[], timeoutMs: number, onProgress?: (outTimeS: number) => void): Promise<void> {
  const full = onProgress ? ["-nostats", "-progress", "pipe:1", ...args] : args;
  const p = Bun.spawn(["ffmpeg", ...full], { stdout: onProgress ? "pipe" : "ignore", stderr: "pipe" });
  currentKill = () => { try { p.kill(); } catch { /* gone */ } };
  let stalled: number | null = null;
  let lastS = 0, lastAt = Date.now();
  const timer = setTimeout(() => { try { p.kill(); } catch { /* already gone */ } }, timeoutMs);
  const stall = onProgress ? setInterval(() => { if (Date.now() - lastAt > STALL_MS) { stalled = lastS; try { p.kill(); } catch { /* gone */ } } }, 15_000) : null;
  const progress = onProgress && p.stdout ? (async () => {
    const reader = (p.stdout as ReadableStream<Uint8Array>).getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        const m = /^out_time_(us|ms)=(\d+)/.exec(line);
        // Only real progress resets the clock: a hung encode still prints frame=/speed= blocks (2026-09-16:
        // "stitching · 99%" for 27 minutes), so those no longer count.
        if (m) { const s = Number(m[2]) / (m[1] === "us" ? 1e6 : 1e3); if (s > lastS) { lastS = s; lastAt = Date.now(); onProgress(s); } }
      }
    }
  })() : Promise.resolve();
  const errText = await new Response(p.stderr).text();
  const code = await p.exited;
  await progress.catch(() => { /* the pipe closed with the process */ });
  clearTimeout(timer);
  if (stall) clearInterval(stall);
  currentKill = null;
  if (stalled != null) throw new Error(`ffmpeg stalled — no progress for ${Math.round(STALL_MS / 60_000)} minutes at ${stalled.toFixed(1)}s. Stitch it again.`);
  if (code !== 0) throw new Error(`ffmpeg exited ${code}: …${errText.slice(-1800)}`);
}

/** Like runFfmpeg but returns stderr — silencedetect reports THROUGH stderr. */
async function runFfmpegCapture(args: string[], timeoutMs: number): Promise<string> {
  const p = Bun.spawn(["ffmpeg", ...args], { stdout: "ignore", stderr: "pipe" });
  const timer = setTimeout(() => { try { p.kill(); } catch { /* already gone */ } }, timeoutMs);
  const errText = await new Response(p.stderr).text();
  const code = await p.exited;
  clearTimeout(timer);
  if (code !== 0) throw new Error(`ffmpeg (detect) exited ${code}: …${errText.slice(-800)}`);
  return errText;
}

// ONE LOUDNESS FOR EVERY VIDEO (Lee, 2026-09-16: "automate the volume normalization… for future posts ensure
// normalization is auto applied"). The per-clip loudnorm inside the stitch is single-pass — accurate to a couple of
// LU on short clips, which is enough to hear between videos. So every dissect_stitch output gets a TWO-PASS pass on
// the finished file: measure its integrated loudness, true peak, range and threshold, then re-encode the audio with
// those measurements (linear mode) so it lands at exactly the target. The picture is copied, not re-encoded.
const LOUD = { I: -16, TP: -1.5, LRA: 11 } as const;
async function normalizeLoudness(path: string, dir: string, timeoutMs: number, onProgress?: (outTimeS: number) => void): Promise<void> {
  if (!(await probeHasAudio(path))) return;
  const filt = `loudnorm=I=${LOUD.I}:TP=${LOUD.TP}:LRA=${LOUD.LRA}`;
  // -vn: the measurement needs the audio; decoding 1080×1920 video for nothing was most of the pass.
  const stderr = await runFfmpegCapture(["-hide_banner", "-nostats", "-i", path, "-vn", "-af", `${filt}:print_format=json`, "-f", "null", "-"], timeoutMs);
  const m = /\{[^{}]*"input_i"[\s\S]*?\}/.exec(stderr);
  if (!m) throw new Error(`loudnorm: no measurement in ffmpeg output …${stderr.slice(-400)}`);
  const r = JSON.parse(m[0]) as Record<string, string>;
  const num = (k: string) => { const v = parseFloat(r[k]); if (!Number.isFinite(v)) throw new Error(`loudnorm: bad ${k} "${r[k]}"`); return v; };
  // A silent file measures −inf and cannot be normalized — leave it as it is rather than fail the render.
  if (!Number.isFinite(parseFloat(r.input_i)) || parseFloat(r.input_i) < -70) return;
  const out = `${dir}/loud-${Date.now()}.mp4`;
  await runFfmpeg([
    "-y", "-i", path, "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
    "-af", `${filt}:measured_I=${num("input_i")}:measured_TP=${num("input_tp")}:measured_LRA=${num("input_lra")}:measured_thresh=${num("input_thresh")}:offset=${num("target_offset")}:linear=true:print_format=summary,aresample=48000`,
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out,
  ], timeoutMs, onProgress);
  await Bun.write(path, Bun.file(out));
  await rm(out, { force: true }).catch(() => { /* tmp */ });
}

async function runJob(job: Job, spec: JobSpec): Promise<void> {
  // EVERYTHING inside the try — an early throw (mkdir on a full disk) must still
  // hit finally, or activeJobs leaks and the idle self-exit is disabled forever.
  const dir = join(tmpdir(), `render-${job.id}`);
  // Whole-job ceiling: every op below is clamped to the time remaining, so the
  // job can never legally outlive the app's publish poll deadline.
  const jobDeadline = job.startedAt + LIMITS.jobTimeoutMs;
  currentJobId = job.id;
  const remaining = (opCapMs: number) => {
    const left = jobDeadline - Date.now();
    if (left <= 0) throw new Error(`job exceeded the ${Math.round(LIMITS.jobTimeoutMs / 60_000)}-min ceiling`);
    return Math.min(opCapMs, left);
  };
  try {
    await mkdir(dir, { recursive: true });
    // 1) DOWNLOAD every input to disk (size-capped BEFORE writing when the
    //    server declares content-length, re-checked after, total-capped so a
    //    big job can't fill Fly's ephemeral rootfs).
    job.state = "downloading";
    const local = new Map<string, StagedFile>();
    let totalBytes = 0;
    for (let i = 0; i < spec.inputs.length; i++) {
      const inp = spec.inputs[i];
      job.note = `downloading clip ${i + 1}/${spec.inputs.length}`;
      const res = await fetch(inp.url, { signal: AbortSignal.timeout(remaining(LIMITS.downloadTimeoutMs)) });
      if (!res.ok) throw new Error(`download ${inp.id}: HTTP ${res.status}`);
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > LIMITS.maxInputBytes) throw new Error(`input ${inp.id} declares ${declared} bytes (cap ${LIMITS.maxInputBytes})`);
      const path = join(dir, `in-${i}.mp4`);
      await Bun.write(path, res);
      const size = Bun.file(path).size;
      if (size > LIMITS.maxInputBytes) throw new Error(`input ${inp.id} is ${size} bytes (cap ${LIMITS.maxInputBytes})`);
      totalBytes += size;
      if (totalBytes > LIMITS.maxTotalBytes) throw new Error(`inputs total ${totalBytes} bytes (cap ${LIMITS.maxTotalBytes}) — split the publish`);
      local.set(inp.id, { path, durationS: await probeDuration(path), hasAudio: await probeHasAudio(path) });
    }

    // 2) RENDER the stages in order; each consumes named files, emits one file.
    job.state = "rendering";
    let lastOut: string | null = null;
    for (let s = 0; s < spec.stages.length; s++) {
      const stage = spec.stages[s];
      job.stageIndex = s;
      job.note = `rendering stage ${s + 1}/${spec.stages.length} (${stage.kind})`;
      const outPath = join(dir, `stage-${s}.mp4`);
      // `__stage<k>` outputs are registered in `local` (with a real probed duration)
      // right after stage k runs — one lookup covers raw inputs and prior stages alike.
      const resolve = (id: string) => {
        const f = local.get(id);
        if (!f) throw new Error(`stage ${s}: unknown input "${id}"`);
        return f;
      };
      const files: StagedFile[] =
        stage.kind === "concat" ? stage.inputs.map(resolve)
          : stage.kind === "warp_intro" ? [resolve(stage.input), resolve(stage.bed)]
            : stage.kind === "loop_builder" ? [resolve(stage.input), resolve(stage.bed)]
            : stage.kind === "dissect_stitch" ? [...stage.inputs.map(resolve), ...(stage.roomTone ? [resolve(stage.roomTone)] : [])]
              : [];
      // LOOP BUILDER pre-flight — a fractional bar is the whole failure mode, so fail LOUD
      // before rendering if the music bed or the short can't cover a whole X bars.
      if (stage.kind === "loop_builder") {
        const { X } = computeLoop({ bpm: stage.bpm, beatsPerBar: stage.beatsPerBar ?? 4, bars: stage.bars, rotationPointSec: stage.rotationPointSec, fps: stage.fps ?? 30 });
        const [short, bed] = files;
        if (bed.durationS < X - 0.001) throw new Error(`loop_builder: music bed is ${bed.durationS.toFixed(3)}s but a whole ${stage.bars} bars need X=${X.toFixed(3)}s — the bed can't fill a full loop`);
        if (short.durationS < X - 0.001) throw new Error(`loop_builder: short is ${short.durationS.toFixed(3)}s but X=${X.toFixed(3)}s — the video can't cover a full loop`);
      }
      if (stage.kind === "dissect_stitch" && stage.copy) {
        // THE STREAM-COPY JOIN (2026-09-16): the inputs are this worker's own outputs — one encoder, one
        // geometry, one audio format — so the batches concatenate without decoding: seconds, where the old
        // join re-encoded the whole video a second time. Loudness still gets its (audio-only) pass.
        const clipFiles = files.slice(0, stage.inputs.length);
        const listPath = join(dir, `concat-${s}.txt`);
        await Bun.write(listPath, clipFiles.map((f) => `file '${f.path.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
        job.note = "joining the batches";
        await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outPath], remaining(LIMITS.renderTimeoutMs));
        const r3 = (n: number) => Math.round(n * 1000) / 1000;
        let cursor = 0;
        const clips = clipFiles.map((f) => { const c = { startS: r3(cursor), durS: r3(f.durationS) }; cursor += f.durationS; return c; });
        job.result = { clips, totalS: r3(cursor), gapsS: [], roomTone: false, trims: clipFiles.map((f) => ({ start: 0, end: r3(f.durationS) })) };
        const totalS = Math.max(0.1, cursor);
        job.note = "normalizing loudness";
        await normalizeLoudness(outPath, dir, remaining(LIMITS.renderTimeoutMs), (sec) => { job.note = `normalizing loudness · ${Math.min(99, Math.round((sec / totalS) * 100))}%`; });
      } else if (stage.kind === "dissect_stitch") {
        // DETECT head/tail silence per clip (unless a manual trim overrides),
        // then plan + run the stitch and keep the chapters manifest on the job.
        const clipFiles = files.slice(0, stage.inputs.length);
        const roomTone = stage.roomTone ? files[stage.inputs.length] : undefined;
        const trims: DissectTrim[] = [];
        for (let ci = 0; ci < clipFiles.length; ci++) {
          const manual = stage.trims?.[ci];
          if (manual && manual.start != null && manual.end != null) { trims.push({ start: manual.start, end: manual.end }); continue; }
          job.note = `detecting silence ${ci + 1}/${clipFiles.length}`;
          const stderr = await runFfmpegCapture(detectSilenceArgs(clipFiles[ci].path, stage.silenceDb ?? DISSECT_DEFAULTS.silenceDb), remaining(LIMITS.renderTimeoutMs));
          const pad = stage.pads?.[ci];
          const t = trimFromSilence(parseSilence(stderr), clipFiles[ci].durationS, { padHeadS: (pad?.headMs ?? 0) / 1000, padTailS: (pad?.tailMs ?? 0) / 1000 });
          // SLATE beats detection at the head (F1): the app KNOWS when the
          // countdown cleared. The tail stays detected either way.
          trims.push(resolveTrim(t, { manual, slateHeadS: stage.heads?.[ci] ?? null, durationS: clipFiles[ci].durationS }));
        }
        const gapsS = Array.from({ length: Math.max(0, clipFiles.length - 1) }, (_, k) => gapForJoin(k, stage.gapMs ?? DISSECT_DEFAULTS.gapMs, stage.gapJitterMs ?? DISSECT_DEFAULTS.gapJitterMs) / 1000);
                const plan = dissectStitchArgs(clipFiles, trims, outPath, { gapsS, roomTone, loudI: stage.loudI, vertical: stage.vertical === true, audioOffsetMs: stage.audioOffsetMs });
        job.result = { ...plan.manifest, trims };
                        job.note = "stitching · 0%";
        const totalS = Math.max(0.1, plan.manifest.totalS);
        // WHICH CLIP (2026-09-16): a failed stitch names every clip's length, trim and audio, so the odd one
        // out is visible in the Stitch Room instead of a wall of x264 stats.
        const clipLine = clipFiles.map((f, i) => `${i + 1}: ${f.durationS.toFixed(1)}s → ${trims[i].start.toFixed(1)}–${trims[i].end.toFixed(1)}${f.hasAudio === false ? " NO AUDIO" : ""}`).join(" · ");
        try {
          await runFfmpeg(plan.args, remaining(LIMITS.renderTimeoutMs), (s) => { job.note = `stitching · ${Math.min(99, Math.round((s / totalS) * 100))}%`; });
        } catch (e) {
          throw new Error(`${e instanceof Error ? e.message.slice(0, 600) : String(e)} · clips ${clipLine}`);
        }
        job.note = "normalizing loudness";
        await normalizeLoudness(outPath, dir, remaining(LIMITS.renderTimeoutMs), (s) => { job.note = `normalizing loudness · ${Math.min(99, Math.round((s / totalS) * 100))}%`; });
      } else {
        await runFfmpeg(planStage(stage, files, outPath), remaining(LIMITS.renderTimeoutMs));
      }
      const outDur = await probeDuration(outPath);
      // LOOP BUILDER post-flight — the music dictates runtime: assert the output IS X
      // (within one frame; the video trim quantizes to a frame boundary).
      if (stage.kind === "loop_builder") {
        const { X, frameDur } = computeLoop({ bpm: stage.bpm, beatsPerBar: stage.beatsPerBar ?? 4, bars: stage.bars, rotationPointSec: stage.rotationPointSec, fps: stage.fps ?? 30 });
        if (Math.abs(outDur - X) > frameDur + 0.001) throw new Error(`loop_builder: output is ${outDur.toFixed(3)}s but must equal X=${X.toFixed(3)}s (±1 frame) — the loop would drift`);
      }
      // Later stages may reference this output as `__stage<s>`; the probed duration lets a
      // following concat get a real length for its offset math.
      local.set(`__stage${s}`, { path: outPath, durationS: outDur });
      lastOut = outPath;
    }
    if (!lastOut) throw new Error("no stage produced output");

    // 3) UPLOAD the final file to the app-provided signed URL (Supabase).
    job.state = "uploading";
    job.note = "uploading result";
    const put = await fetch(spec.output.putUrl, {
      method: "PUT",
      headers: { "content-type": spec.output.contentType ?? "video/mp4", "x-upsert": "true" },
      body: Bun.file(lastOut),
      signal: AbortSignal.timeout(remaining(LIMITS.uploadTimeoutMs)),
    });
    if (!put.ok) throw new Error(`upload failed: HTTP ${put.status} ${(await put.text()).slice(0, 300)}`);

    job.state = "done";
    job.note = `rendered ${spec.stages.length} stage(s) from ${spec.inputs.length} clip(s)`;
  } catch (e) {
    job.state = "error";
    job.error = job.cancelled ? "cancelled" : e instanceof Error ? e.message : String(e);
    job.note = "failed";
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
    lastActivity = Date.now();
    await rm(dir, { recursive: true, force: true }).catch(() => { /* tmp cleanup best-effort */ });
  }
}

Bun.serve({
  port: PORT,
  idleTimeout: 60,
  async fetch(req) {
    lastActivity = Date.now();
    const url = new URL(req.url);
    // machineId lets the app PIN job polls to this machine (fly-force-instance-id):
    // jobs are in-memory, so with >1 machine a load-balanced poll would 404.
    if (url.pathname === "/healthz") return json({ ok: !ffmpegVersion.startsWith("MISSING"), ffmpeg: ffmpegVersion, machineId: process.env.FLY_MACHINE_ID ?? null });
    if (!authed(req)) return json({ error: "unauthorized" }, 401);

    if (req.method === "POST" && url.pathname === "/render") {
      let spec: JobSpec;
      try {
        const body = await req.json();
        validateSpec(body);
        if ((body as JobSpec).inputs.length > LIMITS.maxInputs) throw new Error(`too many inputs (cap ${LIMITS.maxInputs})`);
        spec = body as JobSpec;
      } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 400); }
      const id = crypto.randomUUID();
      const job: Job = { id, state: "queued", note: "queued", stageIndex: 0, totalStages: spec.stages.length, error: null, startedAt: Date.now(), result: null };
      jobs.set(id, job);
      activeJobs++;
      // keep the map bounded — oldest finished jobs fall off
      if (jobs.size > MAX_KEPT) {
        const oldest = [...jobs.values()].filter((j) => j.state === "done" || j.state === "error").sort((a, b) => a.startedAt - b.startedAt);
        for (const j of oldest.slice(0, jobs.size - MAX_KEPT)) jobs.delete(j.id);
      }
      waiting.push({ job, spec });
      pump();
      return json({ jobId: id, machineId: process.env.FLY_MACHINE_ID ?? null }, 202);
    }

    const m = url.pathname.match(/^\/jobs\/([0-9a-f-]{36})$/);
    // CANCEL (2026-09-16): a waiting job is dropped; the running one's ffmpeg is killed and the job says so.
    if (req.method === "DELETE" && m) {
      const job = jobs.get(m[1]);
      if (!job) return json({ error: "unknown job" }, 404);
      if (job.state === "done" || job.state === "error") return json({ ok: true, state: job.state });
      const w = waiting.findIndex((x) => x.job === job);
      if (w >= 0) {
        waiting.splice(w, 1);
        job.state = "error"; job.error = "cancelled"; job.note = "cancelled";
        activeJobs = Math.max(0, activeJobs - 1);
        return json({ ok: true, state: "error" });
      }
      job.cancelled = true;
      job.note = "cancelling…";
      if (currentJobId === job.id) currentKill?.();
      return json({ ok: true, state: job.state });
    }
    if (req.method === "GET" && m) {
      const job = jobs.get(m[1]);
      if (!job) return json({ error: "unknown job (worker may have restarted — re-submit)" }, 404);
      const { id, state, stageIndex, totalStages, error, result } = job;
      return json({ id, state, note: job.state === "queued" ? queuedNote(job) : job.note, stageIndex, totalStages, error, result });
    }

    return json({ error: "not found" }, 404);
  },
});

console.log(`render worker on :${PORT} — ${ffmpegVersion}`);
