// RENDER WORKER — client-side helpers shared by the Preview's "true render"
// and the publish path, so cold-start handling and the render/poll loop exist
// exactly once.
import { resolveWorkerRender, startWorkerRender, workerPreflight } from "@/lib/render-worker.functions";

import { type StitchItem } from "./ceq-takes";
import { DEFAULT_CROSSFADE_MS } from "./segment-assembly";

export type WorkerProbe = { configured: boolean; healthy: boolean; detail: string };

/** WARP INTRO options — when passed, the worker runs the stitch's first clip (the
 *  intro) through the warp_intro stage (reversed tail + white-flash snap + forward
 *  clip + music bed) before the concat. `frontUrl` optionally prepends a slogan/bolt
 *  open. Requires the render worker (the legacy Mux concat can't do stages). */
export type WarpParam = { bedUrl: string; frontUrl?: string; reversedTailS?: number; flashMs?: number; musicBedDb?: number; musicFadeS?: number };

/** Preflight with COLD-START patience. The worker self-exits when idle (that's
 *  the ≈$0 Fly strategy), so the FIRST request after a break auto-starts a
 *  machine — a few seconds of boot that can outlive one probe's timeout.
 *  "Unreachable" therefore retries for ~30s while the machine wakes; real
 *  blocks (half-configured, bad token, ffmpeg missing) surface immediately. */
export async function wakeRenderWorker(onNote?: (note: string) => void): Promise<WorkerProbe> {
  let probe = await workerPreflight();
  for (let i = 0; i < 6 && probe.configured && !probe.healthy && /unreachable/i.test(probe.detail); i++) {
    onNote?.(`waking the render worker (cold start) — attempt ${i + 2}…`);
    await new Promise((r) => setTimeout(r, 4000));
    probe = await workerPreflight();
  }
  return probe;
}

/** Render a stitch list through the worker → the raw Supabase file URL.
 *  Wakes the worker first; fails loud on every real problem. `mode` names the
 *  staged file (test renders land as ceq-stitch/<ts>-test.mp4). */
export async function renderStitchViaWorker(items: StitchItem[], mode: "free" | "full" | "test", onNote: (note: string) => void, warp?: WarpParam): Promise<string> {
  if (items.length === 0) throw new Error("No clips to render.");
  const wp = await wakeRenderWorker(onNote);
  if (!wp.configured) throw new Error("Render worker not configured (RENDER_WORKER_URL / RENDER_WORKER_TOKEN).");
  if (!wp.healthy) throw new Error(`Render worker not healthy: ${wp.detail}`);
  onNote(`submitting ${items.length} clip(s)${warp ? " + warp intro" : ""}…`);
  const { jobId, path, machineId } = await startWorkerRender({ data: { urls: items.map((i) => i.take.url), mode, crossfadeMs: DEFAULT_CROSSFADE_MS, ...(warp ? { warp } : {}) } });
  // 60-min budget — sits above the worker's own 50-min whole-job ceiling.
  const deadline = Date.now() + 60 * 60_000;
  // TRANSIENT-TOLERANT poll (review): one network blip / cold server fn must not
  // abort a render that's 40 minutes in. Up to 5 consecutive status-check
  // failures are retried; a job 404 is TERMINAL (the machine restarted — the
  // in-memory job is gone), as is the worker reporting state "error".
  let pollFails = 0;
  for (;;) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for the worker render (60 min).");
    try {
      const r: Awaited<ReturnType<typeof resolveWorkerRender>> = await resolveWorkerRender({ data: { jobId, path, machineId } });
      pollFails = 0;
      if (r.state === "error") throw new Error(`Worker render failed: ${r.error ?? "unknown"}`);
      if (r.state === "done" && r.fileUrl) return r.fileUrl;
      onNote(r.note || r.state);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Worker render failed/.test(msg) || /HTTP 404/.test(msg)) throw e; // terminal
      if (++pollFails >= 5) throw new Error(`Lost contact with the render worker (${pollFails} failed status checks): ${msg}`);
      onNote(`status check failed — retrying (${pollFails}/5)…`);
    }
    await new Promise((res) => setTimeout(res, 3500));
  }
}
