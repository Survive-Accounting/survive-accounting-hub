#!/usr/bin/env bun
// LOOP CLI — build a seamless-loop vertical short locally, with the debugging JSON sidecar
// and --verify-loop (the ONLY reliable way to hear/see a seam; a single play never reveals it).
//
//   bun run src/loop-cli.ts --short in.mp4 --bed music.mp3 --out loop.mp4 \
//       --bpm 120 --bars 8 --rotation 4.25 \
//       [--beats-per-bar 4] [--fps 30] [--bolt-flash] [--bed-db -12] \
//       [--voice-seam-ms 15] [--verify-loop]
//
// Reuses the SAME pure planner as the render worker's loop_builder stage (loop-builder.ts).
import { basename, dirname, join } from "node:path";

import { LOOP } from "./config";
import { computeLoop, loopBuilderArgs, loopSidecar, verifyLoopArgs } from "./loop-builder";

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const num = (name: string, d?: number): number | undefined => { const v = arg(name); return v != null ? Number(v) : d; };

async function probeDuration(path: string): Promise<number> {
  const p = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  if ((await p.exited) !== 0) throw new Error(`ffprobe failed: ${path}`);
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`ffprobe bad duration "${out.trim()}" for ${path}`);
  return d;
}
async function probeHasAudio(path: string): Promise<boolean> {
  const p = Bun.spawn(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim().length > 0;
}
async function run(args: string[]): Promise<void> {
  const p = Bun.spawn(["ffmpeg", ...args], { stdout: "ignore", stderr: "pipe" });
  const err = await new Response(p.stderr).text();
  if ((await p.exited) !== 0) throw new Error(`ffmpeg failed: …${err.slice(-1500)}`);
}

async function main() {
  const short = arg("short"), bed = arg("bed"), out = arg("out");
  if (!short || !bed || !out || num("bpm") == null || num("bars") == null || num("rotation") == null) {
    console.error("usage: --short <mp4> --bed <audio> --out <mp4> --bpm N --bars N --rotation S [--beats-per-bar 4] [--fps 30] [--bolt-flash] [--bed-db -12] [--voice-seam-ms 15] [--verify-loop]");
    process.exit(2);
  }
  const timing = { bpm: num("bpm")!, beatsPerBar: num("beats-per-bar", LOOP.beatsPerBar)!, bars: num("bars")!, rotationPointSec: num("rotation")!, fps: num("fps", LOOP.fps)! };
  const { X, frameDur } = computeLoop(timing); // also validates (fractional bar / rotation range)

  const [shortDur, bedDur, hasAudio] = await Promise.all([probeDuration(short), probeDuration(bed), probeHasAudio(short)]);
  if (bedDur < X - 0.001) throw new Error(`music bed ${bedDur.toFixed(3)}s < X=${X.toFixed(3)}s — can't fill a whole ${timing.bars} bars`);
  if (shortDur < X - 0.001) throw new Error(`short ${shortDur.toFixed(3)}s < X=${X.toFixed(3)}s`);

  console.error(`building loop: X=${X.toFixed(3)}s (${timing.bars} bars @ ${timing.bpm} BPM), rotation=${timing.rotationPointSec}s, voice=${hasAudio}, boltFlash=${flag("bolt-flash")}`);
  await run(loopBuilderArgs(short, bed, out, { ...timing, hasAudio, boltFlash: flag("bolt-flash"), bedDb: num("bed-db"), voiceSeamMs: num("voice-seam-ms") }));

  const actual = await probeDuration(out);
  if (Math.abs(actual - X) > frameDur + 0.001) throw new Error(`output ${actual.toFixed(3)}s != X=${X.toFixed(3)}s (±1 frame) — the loop would drift`);

  const sidecarPath = out.replace(/\.[^.]+$/, "") + ".loop.json";
  await Bun.write(sidecarPath, JSON.stringify(loopSidecar(timing, actual), null, 2));
  console.error(`✓ loop ${actual.toFixed(3)}s → ${out}\n  sidecar → ${sidecarPath}`);

  if (flag("verify-loop")) {
    // Concat the output to itself (bit-exact, -c copy) so the preview actually PLAYS the seam.
    const listPath = join(dirname(out), `${basename(out)}.concat.txt`);
    const line = `file '${out.replace(/'/g, "'\\''")}'\n`;
    await Bun.write(listPath, line.repeat(LOOP.verifyRepeats));
    const preview = out.replace(/\.[^.]+$/, "") + ".verifyloop.mp4";
    await run(verifyLoopArgs(listPath, preview));
    console.error(`✓ verify-loop (×${LOOP.verifyRepeats}) → ${preview} — watch/listen for the seam`);
  }
}
main().catch((e) => { console.error(`loop-cli: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
