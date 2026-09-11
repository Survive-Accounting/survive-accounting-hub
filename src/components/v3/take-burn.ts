// UPLOAD THE TAKE AND THE COVER.
//
// Lee, 2026-09-09: "I actually don't have the video file on this computer. This is only for
// claude code. I am filming on a separate laptop. Can we add a way for me to upload the file in
// the web app? Is that possible?"
//
// Yes: the browser puts the take STRAIGHT into canvas-media with a signed upload, so the bytes
// never pass through Vercel and a 400MB file is not a body-limit problem. What reaches it from
// there — the site post (site-publish.functions.ts) — reads that URL.
//
// THE BURN IS GONE (2026-09-12). This file used to send the .ass up beside the take and drive the
// Fly worker's burn_captions stage through a patient poll loop (burn-loop.ts). Lee retired
// burned-in captions — "it creates more space in the frame for us to teach from … Yes remove" —
// so the burn, its loop and the .ass upload went with them; lib/captions.ts still writes the
// files for the offline CLI and the panel's .srt.
//
// LOADED UP FRONT (2026-09-11). Lee, posting his first five: "19MB upload failed - failed to
// fetch dynamically imported module https://surviveaccounting.com/assets/take-burn-DTxPtzup.js".
// The post page loaded this file on demand, and this file loaded its helpers on demand, so a
// deploy while the page was open left the old hashed chunks 404ing and the upload died before a
// byte moved. They are all small, so they ship with the page now and a deploy can't strand them.
import { putSignedUpload } from "@/components/canvas/ceq-takes";
import { createPipelineTestStagingUpload } from "@/lib/publish.functions";

/** Put a file into canvas-media and return the public URL the site post will fetch. Direct to
 *  storage: `createPipelineTestStagingUpload` hands back a signed token and no bytes ever touch
 *  a server function. */
async function stage(file: File, ext: string, folder: string, onFrac?: (f: number) => void): Promise<string> {
  const slot = await createPipelineTestStagingUpload({ data: { ext, folder } });
  const err = await putSignedUpload(slot.path, slot.token, file, onFrac);
  if (err) throw new Error(err);
  return slot.publicUrl;
}

/** The take itself. Returns its public URL — kept, because posting to the site reads it. */
export function uploadTake(file: File, onFrac?: (f: number) => void): Promise<string> {
  const ext = (file.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? "mp4").toLowerCase();
  return stage(file, ext, "blastoff-takes", onFrac);
}

/** YOUR OWN THUMBNAIL (2026-09-11): the image, straight to canvas-media, kept per video on the row. */
export function uploadCover(file: File): Promise<string> {
  const ext = (file.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? "png").toLowerCase();
  return stage(file, ext, "blastoff-covers");
}
