// TALKTHROUGH AUDIO — the capture engine. One press to start talking; the
// engine chunks on natural pauses, ships each chunk through the EXISTING
// Whisper pipeline in the background, and never blocks or interrupts capture.
//
// THE TWO TRUTHS (see talkthrough.ts header):
//   · LIVE text (browser SpeechRecognition, when available) lands in the
//     segment IMMEDIATELY and is persisted — instant Speechnotes-style
//     feedback, and the words exist even if the audio path dies.
//   · WHISPER text is the STORED TRUTH. Each chunk becomes a complete audio
//     file → 16kHz mono WAV (reusing transcribe-audio.wavBlob) → staged upload
//     (durable) → transcribeTake (existing server fn, keyed by the staged
//     path, idempotent) → the segment upgrades live → whisper.
//
// CHUNKING: MediaRecorder has no "pause boundary", so the engine watches the
// mic with an AnalyserNode. ~0.9s of RMS below threshold after real speech —
// or a 45s hard cap, or a CEQ focus change (a natural boundary: the words
// belong to what Lee was looking at) — stops the recorder, which yields ONE
// COMPLETE container (valid file; timeslice fragments are not), and instantly
// restarts it on the same stream. Clicking through CEQs never touches the
// stream itself.
//
// FAILURE MODEL: a chunk that fails to upload stays in an in-memory retry
// queue for the life of the page (audio blobs cannot go to localStorage);
// its segment keeps the live text and its pending badge. A chunk that
// uploaded but failed to transcribe retries FOREVER from its stored path —
// that queue survives refresh because audioPath is persisted on the segment.
import { transcribeTake } from "@/lib/transcribe.functions";

import { wavBlob } from "./transcribe-audio";
import { applyWhisperText, makeSegment, touchRow, type TalkSegment } from "./talkthrough";
import { putSegment, ttState } from "./talkthrough-sync";

// ---- minimal SpeechRecognition typing (not in the DOM lib everywhere) ------
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative; length: number }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SpeechRec {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start: () => void; stop: () => void; abort: () => void;
}
type SRCtor = new () => SpeechRec;
const srCtor = (): SRCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const speechRecognitionAvailable = (): boolean => srCtor() !== null;

// ---- tuning ----------------------------------------------------------------
const SILENCE_MS = 900;         // this long below threshold = a natural pause
const SILENCE_RMS = 0.014;      // speech sits well above; room tone below
const MIN_CHUNK_MS = 2500;      // never cut mid-word on a breath
const MAX_CHUNK_MS = 45_000;    // hard cap — text must land within seconds
const TICK_MS = 120;
// A chunk ships to Whisper only after this much ACCUMULATED loud time. One
// keyboard clack or a chair creak crosses SILENCE_RMS for a tick or two;
// real speech holds it for many. Near-silent chunks fed to Whisper are what
// hallucinate "don't forget to like and subscribe" — never send them.
const MIN_VOICED_MS = 400;

/** Whisper invents stock YouTube-outro phrases (in several languages) when
 *  given near-silence — its training data is full of quiet video endings.
 *  When the browser's live recognition ALSO heard nothing, text matching
 *  these is noise, not Lee. Verbatim transcripts are for words Lee SAID;
 *  dropping machine noise before it becomes a segment honors that. */
const HALLUCINATION_PATTERNS: RegExp[] = [
  /like\s*(it\s*)?(,|and)?\s*subscribe/i,
  /don'?t forget to (like|subscribe)/i,
  /thank(s| you) for watching/i,
  /subscribe to (my|the|our) channel/i,
  /see you (in the next|next) (video|time)/i,
  // Seen live 2026-08-30 in Lee's own transcript, alongside the outros above.
  // Each is narrow on purpose: bare "on social media" and bare "comment below"
  // are real accounting talk (an advertising expense; a line on a statement),
  // so the CTA verb has to be there too.
  /share (this|the) video/i,
  /(share|follow) (us |me )?on social media/i,
  /(hit|ring|smash) the (bell|like)/i,
  /(let me know )?in the comments? below/i,
  /link in the description/i,
  /^thank you[.!]?$/i,
  /ご視聴|チャンネル登録|ありがとうございました/,
  /amara\.org|subtitles by|sous-titres|sottotitoli|untertitel|시청해|구독/i,
  /www\.|https?:\/\//i,
  // Subtitle-credit and thanks-for-watching lines in other languages, all seen
  // in Lee's own 2026-08-29 session. Turkish is Latin-script so the non-Latin
  // guard below misses it; match the words themselves.
  /izlediğiniz|teşekkür ederim|subtitles? provided|субтитры|подписывайтесь/i,
  // Whisper's other silence filler: stray cooking / TV-dialogue fragments from
  // its training data. Narrow, literal, anchored — never substrings of real
  // accounting speech.
  /^bon app[ée]tit[.!]?$/i,
  /^\d+\s*(tsp|tbsp|cups?)\b/i,
];

/** Lee dictates in English. A line carrying Cyrillic, CJK, Hangul, Arabic,
 *  Hebrew, Thai, Greek — or the Turkish-only letters — is Whisper filling
 *  silence from another language's training data, not something he said. */
const NON_ENGLISH_SCRIPT =
  /[Ѐ-ӿͰ-Ͽ֐-׿؀-ۿ฀-๿぀-ヿ㐀-鿿가-힯]|[İıĞğŞş]/;
export function isWhisperHallucination(whisperText: string, liveText: string): boolean {
  if (liveText.trim()) return false; // the live mic heard real words — trust Whisper
  const t = whisperText.trim();
  if (!t) return false;
  if (!/[a-zA-Z0-9]/.test(t)) return true; // emoji-only / punctuation-only = noise
  if (NON_ENGLISH_SCRIPT.test(t)) return true; // another language = not Lee
  return HALLUCINATION_PATTERNS.some((p) => p.test(t));
}

function pickAudioMime(): string {
  const c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return c.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export interface BoothStatus {
  recording: boolean;
  /** Live (interim) text of the sentence being spoken right now. */
  interim: string;
  /** FINALISED words of the chunk in progress — everything SpeechRecognition has
   *  committed since this chunk began, before it ships as a segment.
   *
   *  Exposed (2026-09-01) so the booth can render a flowing paragraph instead of
   *  one interim sentence: the readable tail of a dictation is
   *  `…shipped segments… + liveFinal + interim`, and without this the middle
   *  term was invisible — text appeared to vanish and reappear a chunk later,
   *  which is what made it feel segment-at-a-time rather than continuous. */
  liveFinal: string;
  liveAvailable: boolean;
  /** Chunks awaiting upload (in-memory) / awaiting Whisper (retryable forever). */
  uploadQueue: number;
  transcribeQueue: number;
  lastError: string | null;
}

type Focus = { ceqId: string | null; label: string | null };

export class TalkthroughRecorder {
  private sessionId: string;
  private focus: Focus = { ceqId: null, label: null };
  private seq: number;
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private currentSeg: TalkSegment | null = null;
  private liveFinal = "";
  private interim = "";
  private sr: SpeechRec | null = null;
  private srWanted = false;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private tick: ReturnType<typeof setInterval> | undefined;
  private chunkStartedAt = 0;
  private lastLoudAt = 0;
  private spokeThisChunk = false;
  private voicedMs = 0; // accumulated loud time this chunk — the ship gate
  private stopping = false;
  private uploadQ: { seg: TalkSegment; blob: Blob }[] = [];
  private uploading = false;
  private transcribing = false;
  private lastError: string | null = null;
  private onChange: () => void;

  constructor(sessionId: string, startSeq: number, onChange: () => void) {
    this.sessionId = sessionId;
    this.seq = startSeq;
    this.onChange = onChange;
  }

  status(): BoothStatus {
    const pendingWhisper = ttState().doc.segments.filter(
      (s) => s.sessionId === this.sessionId && s.whisperPending && s.audioPath && !s.archivedAt,
    ).length;
    return {
      recording: !!this.rec,
      interim: this.interim,
      liveFinal: this.liveFinal,
      liveAvailable: speechRecognitionAvailable(),
      uploadQueue: this.uploadQ.length,
      transcribeQueue: pendingWhisper,
      lastError: this.lastError,
    };
  }

  /** B1 — a context OPEN/CLOSE is a natural boundary too: cut the current
   *  chunk so no audio words straddle the window, without touching the
   *  stream. No-op when idle or nothing was said yet. */
  markBoundary(): void {
    if (this.rec && this.spokeThisChunk && Date.now() - this.chunkStartedAt > MIN_CHUNK_MS) this.cutChunk();
  }

  /** THE COVERAGE ANCHOR. A focus change closes the current chunk (a natural
   *  boundary — the words belong to what was on screen) without ever touching
   *  the stream; the next segment carries the new stamp. */
  setFocus(ceqId: string | null, label: string | null): void {
    const changed = this.focus.ceqId !== ceqId;
    this.focus = { ceqId, label };
    if (changed && this.rec && this.spokeThisChunk && Date.now() - this.chunkStartedAt > MIN_CHUNK_MS) {
      this.cutChunk();
    }
  }

  async start(): Promise<void> {
    if (this.rec) return;
    this.stopping = false;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    // silence watcher
    this.audioCtx = new AudioContext();
    const src = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);
    this.startLive();
    this.beginChunk();
    this.tick = setInterval(() => this.onTick(), TICK_MS);
    this.onChange();
  }

  /** Stop dictation. The in-flight chunk is finalized and shipped like any
   *  other; queues keep draining in the background. */
  stop(): void {
    this.stopping = true;
    if (this.tick) { clearInterval(this.tick); this.tick = undefined; }
    this.srWanted = false;
    try { this.sr?.stop(); } catch { /* already stopped */ }
    this.sr = null;
    if (this.rec) this.cutChunk(); // final flush; onstop tears down the stream
    else this.teardownStream();
    this.onChange();
  }

  // ---- live display ---------------------------------------------------------
  private startLive(): void {
    const Ctor = srCtor();
    if (!Ctor) return;
    this.srWanted = true;
    const sr = new Ctor();
    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = "en-US";
    sr.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.liveFinal = (this.liveFinal + " " + r[0].transcript).trim();
        else interim += r[0].transcript;
      }
      this.interim = interim;
      // Persist the finals into the current segment NOW — live text must
      // survive a hard refresh even if the audio path never completes.
      if (this.currentSeg && this.liveFinal && this.currentSeg.whisperPending) {
        this.currentSeg = touchRow(this.currentSeg, { text: this.liveFinal } as Partial<TalkSegment>);
        putSegment(this.currentSeg);
      }
      this.onChange();
    };
    // Chrome stops recognition on its own schedule — restart while wanted.
    sr.onend = () => { if (this.srWanted) { try { sr.start(); } catch { /* momentary */ } } };
    sr.onerror = () => { /* non-fatal: whisper is the truth; live is feedback */ };
    try { sr.start(); this.sr = sr; } catch { this.sr = null; }
  }

  // ---- chunk lifecycle --------------------------------------------------------
  private beginChunk(): void {
    if (!this.stream) return;
    const seg = makeSegment(this.sessionId, this.seq++, this.focus);
    this.currentSeg = seg;
    putSegment(seg); // exists BEFORE any words — a crash mid-chunk still leaves the anchor
    this.liveFinal = "";
    this.interim = "";
    this.chunks = [];
    this.spokeThisChunk = false;
    this.voicedMs = 0;
    this.chunkStartedAt = Date.now();
    this.lastLoudAt = Date.now();
    const rec = new MediaRecorder(this.stream, pickAudioMime() ? { mimeType: pickAudioMime() } : undefined);
    rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    rec.onstop = () => this.finishChunk();
    rec.start();
    this.rec = rec;
  }

  private cutChunk(): void {
    const rec = this.rec;
    if (!rec) return;
    this.rec = null;
    try { rec.stop(); } catch { /* finishChunk still fires from onstop */ }
  }

  private onTick(): void {
    if (!this.analyser || !this.rec) return;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const now = Date.now();
    if (rms >= SILENCE_RMS) { this.lastLoudAt = now; this.spokeThisChunk = true; this.voicedMs += TICK_MS; }
    const dur = now - this.chunkStartedAt;
    const quiet = now - this.lastLoudAt;
    if ((this.spokeThisChunk && quiet >= SILENCE_MS && dur >= MIN_CHUNK_MS) || dur >= MAX_CHUNK_MS) {
      this.cutChunk();
    }
  }

  private finishChunk(): void {
    const seg = this.currentSeg;
    const blob = this.chunks.length ? new Blob(this.chunks, { type: this.chunks[0].type || "audio/webm" }) : null;
    this.currentSeg = null;
    this.chunks = [];
    if (seg) {
      const ended = touchRow(seg, { endedAt: new Date().toISOString(), text: this.liveFinal || seg.text } as Partial<TalkSegment>);
      putSegment(ended);
      if (blob && (this.voicedMs >= MIN_VOICED_MS || ended.text)) {
        // Sustained voice, or the live mic heard actual words (never drop
        // those). A lone keyboard clack fails both and is never sent —
        // near-silence is what makes Whisper hallucinate.
        this.uploadQ.push({ seg: ended, blob });
        void this.drainUploads();
      } else if (!ended.text) {
        // Nothing said and nothing recorded — archive the empty anchor.
        putSegment(touchRow(ended, { archivedAt: new Date().toISOString() } as Partial<TalkSegment>));
      }
    }
    if (this.stopping) this.teardownStream();
    else if (this.stream) this.beginChunk(); // seamless restart on the live stream
    this.onChange();
  }

  private teardownStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.audioCtx?.close();
    this.audioCtx = null;
    this.analyser = null;
  }

  // ---- background shipping ---------------------------------------------------
  /** webm/mp4 chunk → 16kHz mono WAV via the pipeline's own packer. */
  private async toWav(blob: Blob): Promise<Blob> {
    const buf = await blob.arrayBuffer();
    const ctx = new AudioContext();
    let audio: AudioBuffer;
    try { audio = await ctx.decodeAudioData(buf); } finally { void ctx.close(); }
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return wavBlob(rendered.getChannelData(0), rate);
  }

  private async drainUploads(): Promise<void> {
    if (this.uploading) return;
    this.uploading = true;
    try {
      while (this.uploadQ.length) {
        const item = this.uploadQ[0];
        try {
          const wav = await this.toWav(item.blob);
          const { createPipelineTestStagingUpload } = await import("@/lib/publish.functions");
          const { putSignedUpload } = await import("./ceq-takes");
          const staged = await createPipelineTestStagingUpload({ data: { ext: "wav", folder: "talkthrough-audio" } });
          const err = await putSignedUpload(staged.path, staged.token, new File([wav], "chunk.wav", { type: "audio/wav" }));
          if (err) throw new Error(err);
          // Path persisted ⇒ transcription is now retryable FOREVER, refresh included.
          const fresh = ttState().doc.segments.find((s) => s.id === item.seg.id) ?? item.seg;
          putSegment(touchRow(fresh, { audioPath: staged.path } as Partial<TalkSegment>));
          this.uploadQ.shift();
          this.lastError = null;
          void this.drainTranscriptions();
        } catch (e) {
          this.lastError = e instanceof Error ? e.message : String(e);
          break; // keep the chunk queued; a later drain retries
        }
      }
    } finally {
      this.uploading = false;
      this.onChange();
    }
  }

  async drainTranscriptions(): Promise<void> {
    if (this.transcribing) return;
    this.transcribing = true;
    try {
      this.lastError = (await drainWhisperQueue(this.sessionId)) ?? this.lastError;
    } finally {
      this.transcribing = false;
      this.onChange();
    }
  }
}

/** Whisper every uploaded-but-pending segment of a session. Module-level so a
 *  REOPENED session (no live recorder) retries its queue too — the queue
 *  survives refresh because audioPath is persisted on the segment. Idempotent
 *  server-side (keyed by the staged path), so retries never re-bill.
 *  Returns the last error, or null when the queue drained clean. */
let moduleDraining = false;
export async function drainWhisperQueue(sessionId: string): Promise<string | null> {
  if (moduleDraining) return null;
  moduleDraining = true;
  let lastError: string | null = null;
  try {
    for (;;) {
      const seg = ttState().doc.segments.find(
        (s) => s.sessionId === sessionId && s.whisperPending && s.audioPath && !s.archivedAt,
      );
      if (!seg) break;
      try {
        const { stagingPublicUrl } = await import("@/lib/talkthrough.functions");
        const url = await stagingPublicUrl({ data: { path: seg.audioPath! } });
        const row = await transcribeTake({ data: { path: seg.audioPath!, url: url.publicUrl, name: "talkthrough.wav" } });
        const fresh = ttState().doc.segments.find((s) => s.id === seg.id) ?? seg;
        let text = row.text.trim();
        if (isWhisperHallucination(text, fresh.text)) {
          console.log(`[talkthrough] dropped whisper hallucination (no live text to back it): "${text.slice(0, 80)}"`);
          text = "";
        }
        putSegment(text
          ? applyWhisperText(fresh, text)
          : // Whisper heard nothing (breath, rustle): keep live text if any, else archive.
            fresh.text
              ? touchRow(fresh, { whisperPending: false } as Partial<TalkSegment>)
              : touchRow(fresh, { whisperPending: false, archivedAt: new Date().toISOString() } as Partial<TalkSegment>));
        lastError = null;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        break; // stays pending; retried on the next drain
      }
    }
  } finally {
    moduleDraining = false;
  }
  return lastError;
}
