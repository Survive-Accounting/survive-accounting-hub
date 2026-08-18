// WAVEFORM PEAKS (P2) — decode a clip's audio ONCE per session, keep per-frame
// peak + RMS. The peaks draw the strip; the RMS feeds landmark detection
// (landmarks.ts). Decoding is the expensive part, so results are cached by the
// take's storage path — the same key the stitch recipes use.

export interface ClipAudio {
  /** Per-frame max |sample| — what the waveform strip draws. */
  peaks: Float32Array;
  /** Per-frame root-mean-square — what speech detection reads. */
  rms: Float32Array;
  frameMs: number;
  /** The REAL decoded duration. take.duration is rounded to 0.1s at stage time
   *  (the P0 wedge bug) — this is the honest number, use it for px↔ms math. */
  durationS: number;
}

/** Bucket one channel into per-frame peak + RMS. PURE — tested directly. */
export function frameAudio(ch: ArrayLike<number>, sampleRate: number, frameMs = 20): { peaks: Float32Array; rms: Float32Array } {
  const per = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const nF = Math.max(1, Math.ceil(ch.length / per));
  const peaks = new Float32Array(nF);
  const rms = new Float32Array(nF);
  for (let f = 0; f < nF; f++) {
    const s0 = f * per;
    const s1 = Math.min(ch.length, s0 + per);
    let peak = 0;
    let sum = 0;
    for (let i = s0; i < s1; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; sum += ch[i] * ch[i]; }
    peaks[f] = peak;
    rms[f] = Math.sqrt(sum / Math.max(1, s1 - s0));
  }
  return { peaks, rms };
}

const cache = new Map<string, Promise<ClipAudio>>();

/** Decode + bucket, cached per take path. A failed decode evicts itself so a
 *  transient network error is retryable instead of poisoning the session. */
export function clipAudio(path: string, url: string, frameMs = 20): Promise<ClipAudio> {
  const hit = cache.get(path);
  if (hit) return hit;
  const p = (async (): Promise<ClipAudio> => {
    const buf = await (await fetch(url)).arrayBuffer();
    const ctx = new AudioContext();
    try {
      const audio = await ctx.decodeAudioData(buf);
      // Mixdown to mono — speech lives in both channels; averaging keeps a
      // one-sided mic take detectable without doubling the work downstream.
      const n = audio.length;
      const ch = new Float32Array(n);
      for (let c = 0; c < audio.numberOfChannels; c++) {
        const d = audio.getChannelData(c);
        for (let i = 0; i < n; i++) ch[i] += d[i] / audio.numberOfChannels;
      }
      return { ...frameAudio(ch, audio.sampleRate, frameMs), frameMs, durationS: audio.duration };
    } finally {
      void ctx.close();
    }
  })();
  p.catch(() => cache.delete(path));
  cache.set(path, p);
  return p;
}

export function __resetClipAudio(): void { cache.clear(); }
