// IDEA ATTACHMENTS + VOICE UPLOAD — the client half.
//
// Files go to the existing canvas-media bucket through the signed-upload path
// the takes pipeline already uses, so there is no new bucket, no new policy,
// and no new failure mode to learn.
//
// The actual workflow this exists for: a prompt written with Claude on a
// laptop, uploaded here, then opened on a phone in another room and pasted
// into Claude Code. Every attachment is therefore individually downloadable.
import { createPipelineTestStagingUpload } from "@/lib/publish.functions";
import { transcribeTake } from "@/lib/transcribe.functions";
import { stagingPublicUrl } from "@/lib/talkthrough.functions";
import type { Attachment } from "./model";

const extOf = (name: string, mime: string): string => {
  const fromName = name.includes(".") ? name.split(".").pop()! : "";
  if (fromName && fromName.length <= 8) return fromName;
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("markdown")) return "md";
  if (mime.startsWith("image/")) return mime.split("/")[1] ?? "png";
  if (mime.startsWith("audio/")) return "webm";
  return "bin";
};

/** Upload one file and return the attachment record to store on the idea. */
export async function uploadIdeaFile(file: File): Promise<Attachment> {
  return uploadAttachment(file, "idea-attachments");
}

/** A photo Lee attaches to an illustration request (2026-09-05) — same signed-upload path,
 *  its own bucket folder so the two purposes never mix in storage. */
export async function uploadReferencePhoto(file: File): Promise<Attachment> {
  return uploadAttachment(file, "illustration-references");
}

/** A résumé attached to a /careers application (2026-09-05) — same signed-upload path, public
 *  (createPipelineTestStagingUpload isn't admin-gated), its own folder. */
export async function uploadResume(file: File): Promise<Attachment> {
  return uploadAttachment(file, "job-applications");
}

async function uploadAttachment(file: File, folder: string): Promise<Attachment> {
  const staged = await createPipelineTestStagingUpload({
    data: { ext: extOf(file.name, file.type), folder },
  });
  const { putSignedUpload } = await import("@/components/canvas/ceq-takes");
  const err = await putSignedUpload(staged.path, staged.token, file);
  if (err) throw new Error(err);
  return {
    id: staged.path,
    name: file.name || "attachment",
    mime: file.type || "application/octet-stream",
    size: file.size,
    path: staged.path,
    url: staged.publicUrl,
  };
}

/** Stage the recording, then transcribe it through the same server function
 *  Talk Box uses. Returns the storage path even when transcription fails —
 *  the audio is kept either way, because the audio IS the idea. */
export async function transcribeIdeaAudio(blob: Blob): Promise<{ path: string; url: string; text: string; error?: string }> {
  const file = new File([blob], "idea.webm", { type: blob.type || "audio/webm" });
  const staged = await createPipelineTestStagingUpload({ data: { ext: "webm", folder: "idea-audio" } });
  const { putSignedUpload } = await import("@/components/canvas/ceq-takes");
  const up = await putSignedUpload(staged.path, staged.token, file);
  if (up) throw new Error(up); // could not even store it — that IS fatal

  try {
    const pub = await stagingPublicUrl({ data: { path: staged.path } });
    const row = await transcribeTake({ data: { path: staged.path, url: pub.publicUrl, name: "idea.webm" } });
    return { path: staged.path, url: staged.publicUrl, text: row.text ?? "" };
  } catch (e) {
    // Transcription is the convenience, not the payload. Hand back the audio.
    return { path: staged.path, url: staged.publicUrl, text: "", error: e instanceof Error ? e.message : String(e) };
  }
}
