// THE TAKE'S TRANSCRIPT, from a file on Lee's laptop.
//
// Lee, 2026-09-09: "Where do I upload the video file?" He doesn't. A 3-minute vertical take is
// 200-400MB and Whisper caps an upload at 25MB anyway, but the WORDS live in about 2MB of audio.
// So the browser decodes the take he picked, resamples to 16kHz mono (the same machinery the
// canvas studio has used since 08-20), stages only THAT, and Whisper reads it. The video itself
// never leaves the machine.
//
// IDEMPOTENT PER VIDEO. take_transcripts is keyed by a path, so a Blast Off short keys on its
// publish key. Re-opening the panel returns the stored row and never re-bills; `force` is the
// only way past a bad one.
import type { TranscriptRow } from "@/lib/transcribe.functions";

/** The key a short's transcript is stored under. The publish key already distinguishes a split
 *  ("<setId>#2"), which is exactly the granularity a transcript belongs to — one take, one row. */
export const shortTranscriptPath = (pubKey: string): string => `blastoff/${pubKey}.take`;

export interface TranscribeNote { (message: string): void }

/** Read the stored transcript for this video, or null. Cheap, and never bills. */
export async function storedTranscript(pubKey: string): Promise<TranscriptRow | null> {
  const { getTranscript } = await import("@/lib/transcribe.functions");
  return getTranscript({ data: { path: shortTranscriptPath(pubKey) } });
}

/** Decode → resample → stage → Whisper. Returns the row with word timings.
 *
 *  Every step reports, because the decode of a 300MB file takes a while with nothing on screen to
 *  show for it, and silence there reads as a hang. */
export async function transcribeTakeFile(pubKey: string, file: File, note: TranscribeNote, force = false): Promise<TranscriptRow> {
  const path = shortTranscriptPath(pubKey);

  if (!force) {
    const existing = await storedTranscript(pubKey);
    if (existing) { note("Already transcribed — reading the stored words."); return existing; }
  }

  note(`Reading ${file.name} (${(file.size / 1048576).toFixed(0)}MB) and pulling the audio out…`);
  const url = URL.createObjectURL(file);
  let wav: Blob;
  try {
    const { extractWavFromUrl } = await import("@/components/canvas/transcribe-audio");
    wav = await extractWavFromUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  note(`Sending ${(wav.size / 1048576).toFixed(1)}MB of audio — the video stays here.`);
  const { createPipelineTestStagingUpload } = await import("@/lib/publish.functions");
  const { putSignedUpload } = await import("@/components/canvas/ceq-takes");
  const staged = await createPipelineTestStagingUpload({ data: { ext: "wav", folder: "transcribe-audio" } });
  const err = await putSignedUpload(staged.path, staged.token, new File([wav], "audio.wav", { type: "audio/wav" }));
  if (err) throw new Error(err);

  note("Transcribing…");
  const { transcribeTake } = await import("@/lib/transcribe.functions");
  return transcribeTake({
    data: { path, url: staged.publicUrl, name: `${file.name.replace(/\.\w+$/, "")}.wav`, ...(force ? { force: true } : {}) },
  });
}

/** Hand a string to the browser as a downloaded file. Used for the .srt and the .ass — both are
 *  text, both belong beside the take in the same folder. */
export function downloadText(name: string, body: string, mime = "text/plain"): void {
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 4000);
}
