// TRANSCRIBE AUDIO (Lee, 08-20) — browser-side audio extraction for Whisper.
//
// Whisper caps uploads at 25MB and a blast take is 60MB+ of VIDEO — but the
// words live in ~2MB/min of audio. Decode the take in the browser (the same
// AudioContext machinery the waveform uses), resample to 16kHz mono via an
// OfflineAudioContext (proper band-limited resampling, not sample-dropping),
// and pack a 16-bit PCM WAV. An 82s take comes out ~2.6MB — far under the cap,
// and Whisper's accuracy is unchanged (it downsamples to 16k mono internally
// anyway).

/** Pack mono float samples into a 16-bit PCM WAV blob. Pure. */
export function wavBlob(samples: Float32Array, sampleRate: number): Blob {
  const n = samples.length;
  const ab = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(ab);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVE");
  w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, samples[i])); dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  return new Blob([ab], { type: "audio/wav" });
}

/** Fetch a take, decode its audio, resample to 16kHz mono, return a WAV blob. */
export async function extractWavFromUrl(url: string, targetRate = 16000): Promise<Blob> {
  const buf = await (await fetch(url)).arrayBuffer();
  const ctx = new AudioContext();
  let audio: AudioBuffer;
  try { audio = await ctx.decodeAudioData(buf); } finally { void ctx.close(); }
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * targetRate)), targetRate);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return wavBlob(rendered.getChannelData(0), targetRate);
}
