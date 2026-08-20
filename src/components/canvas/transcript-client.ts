// TRANSCRIPT CLIENT (Q3) — the browser side of word-level transcription.
//
// Two jobs:
//   1. FETCH a clip's transcript on demand, cached per storage path (a selected
//      clip asks once; re-selecting is instant).
//   2. A local-first background QUEUE that transcribes kept takes without ever
//      blocking the film loop — same never-lose rules as the idea bank: persist
//      to localStorage, drain on a timer / focus / online, keep on failure.
import { getTranscript, transcribeTake, type TranscriptRow, type TranscriptWord } from "@/lib/transcribe.functions";

export type { TranscriptRow, TranscriptWord };

// ---- on-demand fetch, cached per path -------------------------------------

const cache = new Map<string, Promise<TranscriptRow | null>>();

export function transcriptFor(path: string): Promise<TranscriptRow | null> {
  const hit = cache.get(path);
  if (hit) return hit;
  const p = getTranscript({ data: { path } }).catch(() => null);
  cache.set(path, p);
  // A miss (null) is worth re-checking later — the background job may fill it in.
  p.then((r) => { if (!r) cache.delete(path); });
  return p;
}

/** Seed the cache from a fresh transcription result so the panel shows it at once. */
export function primeTranscript(row: TranscriptRow): void { cache.set(row.take_path, Promise.resolve(row)); }

/** THE ONE TRANSCRIBE DOOR (Lee, 08-20). Whisper caps uploads at 25MB and a
 *  blast take is 60MB+ of video — so for big takes we transcribe the AUDIO:
 *  decode in the browser, resample to 16kHz mono WAV (~2MB/min), stage it in
 *  canvas-media, and hand Whisper THAT file (the row stays keyed by the take's
 *  own path). Small takes go straight through. `force` re-runs an existing
 *  row — the RE-RUN button's path. */
export async function transcribeSmart(path: string, url: string, name?: string, opts?: { force?: boolean; onNote?: (s: string) => void }): Promise<TranscriptRow> {
  const note = opts?.onNote ?? (() => { /* silent */ });
  let size = 0;
  try { const h = await fetch(url, { method: "HEAD" }); size = Number(h.headers.get("content-length")) || 0; } catch { /* size unknown — try the direct path */ }
  let sendUrl = url;
  let sendName = name;
  if (size > 24 * 1024 * 1024) {
    note(`Take is ${(size / 1048576).toFixed(0)}MB — over Whisper's 25MB cap. Extracting the audio…`);
    const { extractWavFromUrl } = await import("./transcribe-audio");
    const wav = await extractWavFromUrl(url);
    note(`Uploading ${(wav.size / 1048576).toFixed(1)}MB of audio for transcription…`);
    const { createPipelineTestStagingUpload } = await import("@/lib/publish.functions");
    const { putSignedUpload } = await import("./ceq-takes");
    const staged = await createPipelineTestStagingUpload({ data: { ext: "wav", folder: "transcribe-audio" } });
    const err = await putSignedUpload(staged.path, staged.token, new File([wav], "audio.wav", { type: "audio/wav" }));
    if (err) throw new Error(err);
    sendUrl = staged.publicUrl;
    sendName = (name ?? "take").replace(/\.\w+$/, "") + ".wav";
  }
  note("Transcribing…");
  const row = await transcribeTake({ data: { path, url: sendUrl, ...(sendName ? { name: sendName } : {}), ...(opts?.force ? { force: true } : {}) } });
  primeTranscript(row);
  return row;
}

// ---- the background transcription queue -----------------------------------

const QKEY = "sa-transcribe-queue";
interface QItem { path: string; url: string; name?: string }

const online = (): boolean => (typeof navigator === "undefined" ? true : navigator.onLine !== false);
export const transcribeEnabled = (): boolean => (typeof localStorage === "undefined" ? true : localStorage.getItem("sa-transcribe-on") !== "0");

const loadQ = (): QItem[] => { try { const r = localStorage.getItem(QKEY); return r ? (JSON.parse(r) as QItem[]) : []; } catch { return []; } };
const saveQ = (q: QItem[]): void => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* quota — the take is still safe, transcription just waits */ } };

let draining = false;
let started = false;
let timer: ReturnType<typeof setInterval> | undefined;

/** Enqueue a kept+uploaded take for transcription. No-op if the toggle is off. */
export function enqueueTranscription(path: string, url: string, name?: string): void {
  if (!transcribeEnabled()) return;
  const q = loadQ();
  if (q.some((i) => i.path === path)) return;
  q.push({ path, url, ...(name ? { name } : {}) });
  saveQ(q);
  void drainTranscriptions();
}

/** Drain the queue one at a time. Re-entrant-safe; a failure keeps the item. */
export async function drainTranscriptions(): Promise<void> {
  if (draining || !transcribeEnabled() || !online()) return;
  draining = true;
  try {
    let q = loadQ();
    while (q.length) {
      const item = q[0];
      try {
        // transcribeSmart: big takes go via the audio sidecar — before this, a
        // >25MB blast take sat at the head of the queue failing forever.
        await transcribeSmart(item.path, item.url, item.name);
        q = loadQ().filter((i) => i.path !== item.path);
        saveQ(q);
      } catch {
        // Leave it queued; a later drain retries. Stop this pass so one bad take
        // (e.g. >25MB) doesn't spin — it stays at the head and retries next tick.
        break;
      }
    }
  } finally { draining = false; }
}

/** Boot the drainer: timer + focus + online. Idempotent. */
export function startTranscription(): void {
  if (started) return;
  started = true;
  void drainTranscriptions();
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void drainTranscriptions());
    window.addEventListener("focus", () => void drainTranscriptions());
    if (timer) clearInterval(timer);
    timer = setInterval(() => void drainTranscriptions(), 45_000);
  }
}

export function __resetTranscription(): void { cache.clear(); draining = false; started = false; if (timer) clearInterval(timer); timer = undefined; }
