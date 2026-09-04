// CAPTIONS — bake Shorts captions onto a take. Run with Bun, on this PC:
//
//   bun run captions <take.mp4> [--cam home|none] [--out <file>] [--dry] [--words <file.json>]
//
// What it does, in order:
//   1. finds ffmpeg (PATH, then the winget install, then $FFMPEG) — or tells you how to install it
//   2. pulls the audio out of the take (16 kHz mono wav, tiny)
//   3. sends it to OpenAI Whisper for WORD timestamps — the same call the
//      studio's transcribe.functions.ts makes; key from OPENAI_WHISPER or
//      OPENAI_API_KEY (the .env in the repo root is read)
//   4. writes <take>.words.json, <take>.ass, <take>.srt (src/lib/captions.ts
//      decides the cards and the style)
//   5. burns the .ass into <take>.captioned.mp4 with libass, Rubik Black
//      (downloaded once into scripts/captions-fonts/), audio copied untouched
//
// --dry stops after step 4 and prints the cards. --words reuses a saved
// words file (no Whisper call). --cam none uses the whole width (no camera
// on the slide). Nothing here touches the database.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { assFromCards, cardsFromWords, shortsStyle, srtFromCards, type Word } from "../src/lib/captions";

const RUBIK_URL = "https://github.com/googlefonts/rubik/raw/main/fonts/ttf/Rubik-Black.ttf";
const FONT_DIR = resolve(import.meta.dir, "captions-fonts");

function fail(msg: string): never { console.error(`\n✗ ${msg}\n`); process.exit(1); }

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const flag = (name: string) => process.argv.includes(name);

function loadDotEnv(): void {
  for (const p of [resolve(import.meta.dir, "..", ".env"), resolve(import.meta.dir, "..", "..", "sa-growth-dashboard", ".env")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
}

function findFfmpeg(): string {
  const candidates = [process.env.FFMPEG, "ffmpeg"];
  const pk = join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (existsSync(pk)) {
    for (const d of require("node:fs").readdirSync(pk) as string[]) {
      if (!/ffmpeg/i.test(d)) continue;
      const root = join(pk, d);
      for (const sub of require("node:fs").readdirSync(root) as string[]) {
        const bin = join(root, sub, "bin", "ffmpeg.exe");
        if (existsSync(bin)) candidates.push(bin);
      }
    }
  }
  for (const c of candidates) {
    if (!c) continue;
    const r = spawnSync(c, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  return fail("ffmpeg is not installed. In PowerShell:  winget install Gyan.FFmpeg   (then reopen the terminal), or set FFMPEG=<path to ffmpeg.exe>");
}

function run(cmd: string, args: string[], what: string): void {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "inherit", "pipe"], encoding: "utf8" });
  if (r.status !== 0) fail(`${what} failed:\n${r.stderr?.slice(-1500)}`);
}

function probeSize(ffmpeg: string, file: string): { w: number; h: number } {
  const r = spawnSync(ffmpeg, ["-i", file], { encoding: "utf8" });
  const m = /Video:.*?\s(\d{3,5})x(\d{3,5})/.exec(r.stderr ?? "");
  if (!m) fail(`could not read the video size of ${file}`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

async function whisperWords(wav: string, key: string): Promise<Word[]> {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(wav)], { type: "audio/wav" }), "take.wav");
  form.append("model", process.env.WHISPER_MODEL || "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("language", "en");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) fail(`Whisper said ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j = (await res.json()) as { words?: { word: string; start: number; end: number }[]; text?: string };
  if (!j.words?.length) fail("Whisper returned no words — is there speech on the take?");
  return j.words.map((w) => ({ t: w.word.trim(), s: w.start, e: w.end })).filter((w) => w.t);
}

async function ensureFont(): Promise<string | null> {
  const file = join(FONT_DIR, "Rubik-Black.ttf");
  if (existsSync(file)) return FONT_DIR;
  try {
    mkdirSync(FONT_DIR, { recursive: true });
    const res = await fetch(RUBIK_URL);
    if (!res.ok) throw new Error(String(res.status));
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`  fetched Rubik Black into ${FONT_DIR}`);
    return FONT_DIR;
  } catch (e) {
    console.warn(`  could not fetch Rubik (${e instanceof Error ? e.message : e}) — libass will fall back to a system font`);
    return null;
  }
}

/** ffmpeg's filter syntax wants Windows paths escaped: C\:/path/file.ass */
function filterPath(p: string): string { return p.replace(/\\/g, "/").replace(/:/g, "\\:"); }

async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith("--")) fail("usage: bun run captions <take.mp4> [--cam home|none] [--out <file>] [--dry] [--words <file.json>]");
  const take = resolve(input);
  if (!existsSync(take)) fail(`no such file: ${take}`);
  loadDotEnv();
  const cam = (arg("--cam") ?? "home") as "home" | "none";
  if (cam !== "home" && cam !== "none") fail("--cam must be home or none");
  const stem = join(dirname(take), basename(take, extname(take)));
  const out = arg("--out") ?? `${stem}.captioned.mp4`;

  const ffmpeg = findFfmpeg();
  console.log(`\n▶ ${basename(take)}  ·  ffmpeg: ${ffmpeg}`);
  const size = probeSize(ffmpeg, take);
  console.log(`  ${size.w}×${size.h}`);

  let words: Word[];
  const savedWords = arg("--words");
  if (savedWords) {
    words = JSON.parse(readFileSync(resolve(savedWords), "utf8")) as Word[];
    console.log(`  ${words.length} words from ${savedWords}`);
  } else {
    const key = process.env.OPENAI_WHISPER || process.env.OPENAI_API_KEY;
    if (!key) fail("no Whisper key — put OPENAI_WHISPER=sk-… (or OPENAI_API_KEY) in the repo's .env, the same key the studio's transcription uses");
    const wav = `${stem}.16k.wav`;
    run(ffmpeg, ["-y", "-loglevel", "error", "-i", take, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav], "audio extract");
    console.log("  audio out · asking Whisper for word timings…");
    words = await whisperWords(wav, key);
    writeFileSync(`${stem}.words.json`, JSON.stringify(words, null, 1));
    console.log(`  ${words.length} words → ${basename(stem)}.words.json`);
  }

  const cards = cardsFromWords(words);
  const style = shortsStyle(size.w, size.h, cam);
  const assPath = `${stem}.ass`, srtPath = `${stem}.srt`;
  writeFileSync(assPath, assFromCards(cards, style));
  writeFileSync(srtPath, srtFromCards(cards));
  console.log(`  ${cards.length} cards → ${basename(assPath)}, ${basename(srtPath)}`);
  if (flag("--dry")) {
    for (const c of cards) console.log(`  ${c.s.toFixed(2).padStart(6)}–${c.e.toFixed(2).padStart(6)}  ${c.lines.map((l) => l.map((w) => w.t).join(" ")).join(" / ")}`);
    console.log("\n  --dry: not burning.\n");
    return;
  }

  const fontsDir = await ensureFont();
  const vf = `ass=${filterPath(assPath)}${fontsDir ? `:fontsdir=${filterPath(fontsDir)}` : ""}`;
  console.log("  burning…");
  run(ffmpeg, ["-y", "-loglevel", "error", "-i", take, "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out], "caption burn");
  console.log(`\n✓ ${out}\n`);
}

void main();
