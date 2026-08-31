// VOICE CAPTURE — the phone path. Hold to talk, release, and the words are in
// the box before the idea evaporates.
//
// It reuses the Talk Box transcription path AND its hard-won fixes, because
// this is the same microphone in the same car:
//   · a ship gate on accumulated voiced time, so near-silence never reaches
//     Whisper (near-silence is what makes it hallucinate);
//   · the hallucination blocklist — an idea that transcribes as "thanks for
//     watching" is worse than no idea at all;
//   · English only.
//
// THE AUDIO IS ALWAYS KEPT. If transcription fails, is rejected, or comes back
// empty, the recording is still attached and the idea still saves — the audio
// IS the idea, the transcript is a convenience.
import { isWhisperHallucination } from "@/components/canvas/talkthrough-audio";

/** Below this much accumulated voiced time we do not send audio for
 *  transcription at all — same gate as the booth, same reason. */
const MIN_VOICED_MS = 400;
const TICK_MS = 100;
const VOICED_RMS = 0.014;

export type TranscriptStatus = "ok" | "empty" | "rejected" | "failed";

export interface VoiceResult {
  blob: Blob;
  durationMs: number;
  voicedMs: number;
  text: string;
  status: TranscriptStatus;
  error?: string;
}

/** A single hold-to-talk (or tap-tap) recording. Owns the stream for its
 *  lifetime and always releases it — a mic left open on a phone is a battery
 *  bug and a privacy one. */
export class IdeaRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private tick: ReturnType<typeof setInterval> | undefined;
  private startedAt = 0;
  voicedMs = 0;
  /** Live level 0..1 for the button's meter — feedback that it is listening. */
  level = 0;
  private onLevel?: () => void;

  constructor(onLevel?: () => void) { this.onLevel = onLevel; }

  async start(): Promise<void> {
    if (this.rec) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);

    this.chunks = [];
    this.voicedMs = 0;
    this.startedAt = Date.now();
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      .find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    rec.start();
    this.rec = rec;
    this.tick = setInterval(() => this.measure(), TICK_MS);
  }

  private measure(): void {
    if (!this.analyser) return;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    if (rms >= VOICED_RMS) this.voicedMs += TICK_MS;
    this.level = Math.min(1, rms * 12);
    this.onLevel?.();
  }

  /** Stop and hand back the audio. Never throws for "you said nothing" — that
   *  is a status, not an error. */
  stop(): Promise<{ blob: Blob; durationMs: number; voicedMs: number }> {
    return new Promise((resolve) => {
      const rec = this.rec;
      if (!rec) { resolve({ blob: new Blob(), durationMs: 0, voicedMs: 0 }); return; }
      this.rec = null;
      if (this.tick) { clearInterval(this.tick); this.tick = undefined; }
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.chunks[0]?.type || "audio/webm" });
        const out = { blob, durationMs: Date.now() - this.startedAt, voicedMs: this.voicedMs };
        this.teardown();
        resolve(out);
      };
      try { rec.stop(); } catch { this.teardown(); resolve({ blob: new Blob(this.chunks), durationMs: Date.now() - this.startedAt, voicedMs: this.voicedMs }); }
    });
  }

  private teardown(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.level = 0;
  }
}

/** Decide what a Whisper result means for an idea. Pure — tested.
 *  `voicedMs` under the gate means we never should have asked. */
export function judgeTranscript(raw: string, voicedMs: number): { text: string; status: TranscriptStatus } {
  if (voicedMs < MIN_VOICED_MS) return { text: "", status: "empty" };
  const t = raw.trim();
  if (!t) return { text: "", status: "empty" };
  // No live-recognition second opinion exists on this path, so the blocklist is
  // the only guard — hence checking against an empty "live" string.
  if (isWhisperHallucination(t, "")) return { text: "", status: "rejected" };
  return { text: t, status: "ok" };
}

export const shouldTranscribe = (voicedMs: number): boolean => voicedMs >= MIN_VOICED_MS;
