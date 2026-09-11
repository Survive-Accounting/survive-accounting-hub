// THE BURN'S PATIENCE — pure, with the renderer's calls handed in, so the tests can play a
// sleeping worker and a slow one.
//
// Lee, 2026-09-11, posting his first five: "It also said operation was aborted due to time out."
// Every call from the site to the Fly worker gives up after 20 seconds (render-worker.functions'
// workerFetch), the worker exits after five idle minutes, and waking it can take longer than that
// — so the burn's first call timed out against a sleeping worker. And one slow progress check
// anywhere in a long burn used to end the whole burn.
//
// So: WAKE FIRST. Ask the worker's health check — cheap, idempotent, and the request that starts
// the machine — until it answers healthy, and only then hand it the job. Retrying the START
// instead could create the same burn twice, and the worker bills by the minute. Then POLL WITH
// PATIENCE: a few progress checks in a row may fail before the burn gives up; a worker that
// REPORTS an error still fails at once, with its own words.
//
// Module-scope callables are function declarations (the render-path TDZ rule).

/** Progress in the phases that take real time, so a bar can be honest about which. */
export interface BurnProgress {
  phase: "uploading" | "queued" | "rendering" | "done";
  /** 0..1 during the upload; null once the worker has it (its stages don't report a fraction). */
  frac: number | null;
  note: string;
}

/** How often to check on a burn, and how long before giving up. A 3-minute 1080x1920 short at
 *  preset medium on the worker's two shared vCPUs is minutes, not seconds; the worker's own
 *  per-stage ceiling is 45 minutes, so this sits comfortably under it and above any real job. */
export const BURN_POLL_MS = 3000;
export const BURN_BUDGET_MS = 20 * 60 * 1000;
/** Waking: up to this many health checks (each capped at 6 s on the server), this far apart. */
export const WAKE_TRIES = 12;
export const WAKE_WAIT_MS = 2500;
/** This many failed progress checks IN A ROW ends the burn; one success resets the count. */
export const POLL_MISSES = 5;

export interface BurnJob { jobId: string; path: string; machineId?: string | null }
export interface BurnCheck {
  state: "queued" | "downloading" | "rendering" | "uploading" | "done" | "error";
  note: string;
  fileUrl: string | null;
  error: string | null;
}
export interface BurnDeps {
  preflight: () => Promise<{ configured: boolean; healthy: boolean; detail: string }>;
  start: (videoUrl: string, assUrl: string) => Promise<BurnJob>;
  resolve: (job: BurnJob) => Promise<BurnCheck>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Until the worker answers healthy. Fails at once on what won't fix itself (not configured, a
 *  rejected token, half an env); otherwise after WAKE_TRIES checks, with the last thing it said. */
export async function wakeRenderer(deps: BurnDeps, onProgress: (p: BurnProgress) => void, signal?: AbortSignal): Promise<void> {
  let last = "";
  for (let i = 1; i <= WAKE_TRIES; i++) {
    if (signal?.aborted) throw new Error("Stopped.");
    const p = await deps.preflight();
    if (!p.configured) throw new Error("The renderer isn't configured on this deploy (RENDER_WORKER_URL and RENDER_WORKER_TOKEN).");
    if (p.healthy) return;
    last = p.detail;
    if (/token|half-configured/i.test(p.detail)) throw new Error(`The renderer can't be used: ${p.detail}`);
    onProgress({ phase: "queued", frac: null, note: `Waking the renderer… (${i} of ${WAKE_TRIES})` });
    await deps.sleep(WAKE_WAIT_MS);
  }
  throw new Error(`The renderer didn't wake up after ${WAKE_TRIES} checks — the last one said: ${last}`);
}

/** Wake the worker, start the burn once, poll it to completion. Resolves with the captioned file's
 *  public URL; rejects with the worker's own message when it reports one. */
export async function runBurn(deps: BurnDeps, videoUrl: string, assUrl: string, onProgress: (p: BurnProgress) => void, signal?: AbortSignal): Promise<string> {
  onProgress({ phase: "queued", frac: null, note: "Waking the renderer…" });
  await wakeRenderer(deps, onProgress, signal);
  onProgress({ phase: "queued", frac: null, note: "Handing it to the renderer…" });
  const job = await deps.start(videoUrl, assUrl);

  const deadline = deps.now() + BURN_BUDGET_MS;
  let misses = 0;
  for (;;) {
    if (signal?.aborted) throw new Error("Stopped.");
    if (deps.now() > deadline) throw new Error("The burn is taking longer than twenty minutes — check the worker.");
    await deps.sleep(BURN_POLL_MS);
    let r: BurnCheck;
    try {
      r = await deps.resolve(job);
      misses = 0;
    } catch (e) {
      misses += 1;
      if (misses >= POLL_MISSES) throw new Error(`Lost touch with the renderer — ${misses} checks in a row failed. The last: ${msg(e)}`);
      onProgress({ phase: "rendering", frac: null, note: `The renderer is slow to answer — checking again (${misses} of ${POLL_MISSES})…` });
      continue;
    }
    if (r.state === "error") throw new Error(r.error || "The renderer failed without saying why.");
    if (r.state === "done") {
      if (!r.fileUrl) throw new Error("The renderer finished but produced no file.");
      onProgress({ phase: "done", frac: 1, note: "Captioned." });
      return r.fileUrl;
    }
    onProgress({ phase: r.state === "queued" ? "queued" : "rendering", frac: null, note: r.note || (r.state === "queued" ? "Waking the renderer…" : "Burning the captions in…") });
  }
}
