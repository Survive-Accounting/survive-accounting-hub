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
import { assName, burnedName } from "@/lib/short-captions";

/** Progress in the two phases that take real time, so a bar can be honest about which. */
export interface BurnProgress {
  phase: "uploading" | "queued" | "rendering" | "done";
  /** 0..1 during the upload; null once the worker has it (its stages don't report a fraction). */
  frac: number | null;
  note: string;
}

/** Put a file into canvas-media and return the public URL the worker will fetch. Direct to
 *  storage: `createPipelineTestStagingUpload` hands back a signed token and no bytes ever touch
 *  a server function. */
async function stage(file: File, ext: string, folder: string, onFrac?: (f: number) => void): Promise<string> {
  const { createPipelineTestStagingUpload } = await import("@/lib/publish.functions");
  const { putSignedUpload } = await import("@/components/canvas/ceq-takes");
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

/** How long to wait on a burn before giving up. A 3-minute 1080x1920 short at preset medium on
 *  the worker's two shared vCPUs is minutes, not seconds; the worker's own per-stage ceiling is
 *  45 minutes, so this sits comfortably under it and above any real job. */
export const BURN_POLL_MS = 3000;
export const BURN_BUDGET_MS = 20 * 60 * 1000;

/** Start the burn and poll it to completion. Resolves with the captioned file's public URL.
 *  Rejects with the worker's own message — a burn that fails must say why, because the fallback
 *  (the .srt sidecar) is a different decision he needs to make knowingly. */
export async function burnCaptions(
  videoUrl: string,
  assUrl: string,
  onProgress: (p: BurnProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { startCaptionBurn, resolveWorkerRender } = await import("@/lib/render-worker.functions");
  onProgress({ phase: "queued", frac: null, note: "Handing it to the renderer…" });
  const job = await startCaptionBurn({ data: { videoUrl, assUrl } });

  const deadline = Date.now() + BURN_BUDGET_MS;
  for (;;) {
    if (signal?.aborted) throw new Error("Stopped.");
    if (Date.now() > deadline) throw new Error("The burn is taking longer than twenty minutes — check the worker.");
    await new Promise((r) => window.setTimeout(r, BURN_POLL_MS));
    const r = await resolveWorkerRender({ data: { jobId: job.jobId, path: job.path, machineId: job.machineId } });
    if (r.state === "error") throw new Error(r.error || "The renderer failed without saying why.");
    if (r.state === "done") {
      if (!r.fileUrl) throw new Error("The renderer finished but produced no file.");
      onProgress({ phase: "done", frac: 1, note: "Captioned." });
      return r.fileUrl;
    }
    onProgress({
      phase: r.state === "queued" ? "queued" : "rendering",
      frac: null,
      note: r.note || (r.state === "queued" ? "Waking the renderer…" : "Burning the captions in…"),
    });
  }
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
