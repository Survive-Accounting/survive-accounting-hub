// UPLOAD THE TAKE, BURN THE CAPTIONS, HAND BACK THE FILE.
//
// Lee, 2026-09-09: "I actually don't have the video file on this computer. This is only for
// claude code. I am filming on a separate laptop. Can we add a way for me to upload the file in
// the web app? Is that possible?"
//
// Yes — and it turns out to be the better design. He posts from a laptop with no repo, no ffmpeg
// and no font, so "run one command" was never going to be streamlined. Instead:
//
//   1. the browser puts the take STRAIGHT into canvas-media with a signed upload — the bytes
//      never pass through Vercel, so a 400MB file is not a body-limit problem;
//   2. the .ass written from Whisper's word timings goes up beside it (about 10KB);
//   3. the Fly worker (sa-render-worker — Bun + ffmpeg, already deployed, already re-encodes his
//      video) runs the burn_captions stage;
//   4. he downloads the finished MP4 and uploads THAT to YouTube.
//
// One caveat worth knowing: the worker scales to zero and boots on the first request, so the
// first poll of a cold job can sit at "queued" for a few seconds longer than feels right.
// LOADED UP FRONT (2026-09-11). Lee, posting his first five: "19MB upload failed - failed to
// fetch dynamically imported module https://surviveaccounting.com/assets/take-burn-DTxPtzup.js".
// The post page loaded this file on demand, and this file loaded its helpers on demand, so a
// deploy while the page was open left the old hashed chunks 404ing and the upload died before a
// byte moved. They are all small, so they ship with the page now and a deploy can't strand them.
import { putSignedUpload } from "@/components/canvas/ceq-takes";
import { createPipelineTestStagingUpload } from "@/lib/publish.functions";
import { resolveWorkerRender, startCaptionBurn, workerPreflight } from "@/lib/render-worker.functions";
// THE BURN'S PATIENCE (2026-09-11) lives in burn-loop.ts — pure, tested against a sleeping worker.
import { runBurn, type BurnProgress } from "@/components/v3/burn-loop";
export type { BurnProgress } from "@/components/v3/burn-loop";
export { BURN_BUDGET_MS, BURN_POLL_MS } from "@/components/v3/burn-loop";
import { assName, burnedName } from "@/lib/short-captions";


/** Put a file into canvas-media and return the public URL the worker will fetch. Direct to
 *  storage: `createPipelineTestStagingUpload` hands back a signed token and no bytes ever touch
 *  a server function. */
async function stage(file: File, ext: string, folder: string, onFrac?: (f: number) => void): Promise<string> {
  const slot = await createPipelineTestStagingUpload({ data: { ext, folder } });
  const err = await putSignedUpload(slot.path, slot.token, file, onFrac);
  if (err) throw new Error(err);
  return slot.publicUrl;
}

/** The take itself. Returns its public URL — kept, because the burn and any re-burn read it. */
export function uploadTake(file: File, onFrac?: (f: number) => void): Promise<string> {
  const ext = (file.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? "mp4").toLowerCase();
  return stage(file, ext, "blastoff-takes", onFrac);
}

/** The subtitles, as a file beside it. */
export function uploadAss(takeName: string, ass: string): Promise<string> {
  return stage(new File([ass], assName(takeName), { type: "text/plain" }), "ass", "blastoff-takes");
}


/** Wake the worker, start the burn once, poll it to completion (burn-loop.ts). Resolves with
 *  the captioned file's public URL; rejects with the worker's own message — a burn that fails
 *  must say why, because the fallback (the .srt sidecar) is a different decision he needs to
 *  make knowingly. */
export function burnCaptions(videoUrl: string, assUrl: string, onProgress: (p: BurnProgress) => void, signal?: AbortSignal): Promise<string> {
  return runBurn({
    preflight: () => workerPreflight(),
    start: (v, a) => startCaptionBurn({ data: { videoUrl: v, assUrl: a } }),
    resolve: (job) => resolveWorkerRender({ data: { jobId: job.jobId, path: job.path, machineId: job.machineId ?? null } }),
    sleep: (ms) => new Promise((r) => window.setTimeout(r, ms)),
    now: () => Date.now(),
  }, videoUrl, assUrl, onProgress, signal);
}

/** Save a URL the browser can reach to disk under a chosen name. The captioned file lives in
 *  storage, so this fetches it and hands the bytes over — a plain <a download> to another origin
 *  navigates instead of saving. */
export async function downloadUrlAs(url: string, name: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch the finished file (${res.status}).`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 8000);
}

export { burnedName };
