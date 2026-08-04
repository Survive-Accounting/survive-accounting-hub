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
}
const jobs = new Map<string, Job>();
const MAX_KEPT = 40;

// IDLE SELF-EXIT (the Fly strategy — see fly.toml): the proxy's auto-stop is
// OFF because it can't see a background ffmpeg and would kill mid-render; we
// exit OURSELVES when idle instead. Clean exit ⇒ machine stops (≈$0), the next
// request auto-starts it.
let activeJobs = 0;
let lastActivity = Date.now();
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

/** Run one ffmpeg invocation with a hard timeout; on failure surface the stderr
 *  tail (that's where ffmpeg says WHY). */
async function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  const p = Bun.spawn(["ffmpeg", ...args], { stdout: "ignore", stderr: "pipe" });
  const timer = setTimeout(() => { try { p.kill(); } catch { /* already gone */ } }, timeoutMs);
  const errText = await new Response(p.stderr).text();
  const code = await p.exited;
  clearTimeout(timer);
  if (code !== 0) throw new Error(`ffmpeg exited ${code}: …${errText.slice(-1800)}`);
}

async function runJob(job: Job, spec: JobSpec): Promise<void> {
  // EVERYTHING inside the try — an early throw (mkdir on a full disk) must still
  // hit finally, or activeJobs leaks and the idle self-exit is disabled forever.
  const dir = join(tmpdir(), `render-${job.id}`);
  // Whole-job ceiling: every op below is clamped to the time remaining, so the
  // job can never legally outlive the app's publish poll deadline.
  const jobDeadline = job.startedAt + LIMITS.jobTimeoutMs;
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
              : [];
      // LOOP BUILDER pre-flight — a fractional bar is the whole failure mode, so fail LOUD
      // before rendering if the music bed or the short can't cover a whole X bars.
      if (stage.kind === "loop_builder") {
        const { X } = computeLoop({ bpm: stage.bpm, beatsPerBar: stage.beatsPerBar ?? 4, bars: stage.bars, rotationPointSec: stage.rotationPointSec, fps: stage.fps ?? 30 });
        const [short, bed] = files;
        if (bed.durationS < X - 0.001) throw new Error(`loop_builder: music bed is ${bed.durationS.toFixed(3)}s but a whole ${stage.bars} bars need X=${X.toFixed(3)}s — the bed can't fill a full loop`);
        if (short.durationS < X - 0.001) throw new Error(`loop_builder: short is ${short.durationS.toFixed(3)}s but X=${X.toFixed(3)}s — the video can't cover a full loop`);
      }
      await runFfmpeg(planStage(stage, files, outPath), remaining(LIMITS.renderTimeoutMs));
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
    job.error = e instanceof Error ? e.message : String(e);
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
      const job: Job = { id, state: "queued", note: "queued", stageIndex: 0, totalStages: spec.stages.length, error: null, startedAt: Date.now() };
      jobs.set(id, job);
      activeJobs++;
      // keep the map bounded — oldest finished jobs fall off
      if (jobs.size > MAX_KEPT) {
        const oldest = [...jobs.values()].filter((j) => j.state === "done" || j.state === "error").sort((a, b) => a.startedAt - b.startedAt);
        for (const j of oldest.slice(0, jobs.size - MAX_KEPT)) jobs.delete(j.id);
      }
      void runJob(job, spec);
      return json({ jobId: id, machineId: process.env.FLY_MACHINE_ID ?? null }, 202);
    }

    const m = url.pathname.match(/^\/jobs\/([0-9a-f-]{36})$/);
    if (req.method === "GET" && m) {
      const job = jobs.get(m[1]);
      if (!job) return json({ error: "unknown job (worker may have restarted — re-submit)" }, 404);
      const { id, state, note, stageIndex, totalStages, error } = job;
      return json({ id, state, note, stageIndex, totalStages, error });
    }

    return json({ error: "not found" }, 404);
  },
});

console.log(`render worker on :${PORT} — ${ffmpegVersion}`);
