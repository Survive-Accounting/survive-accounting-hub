// POST-PRODUCTION, the pure half — Whisper's words to the three things Lee needs on the laptop.
//
// Lee, 2026-09-09: "Where do I upload the video file? Where can I add captions? I want to do this
// from the post point… I'm a bit confused the order of operations once I have a finished video
// file." And, asked how he wants the on-screen captions: burned in, on the laptop.
//
// THE TAKE NEVER UPLOADS. The browser reads it off his disk, strips ~2MB of audio for Whisper,
// and everything after that is text. The one thing a browser genuinely cannot do is re-encode a
// 200MB video, so the burn stays ffmpeg's job — but ALL the intelligence is here: the cards, the
// karaoke timings, the rail geometry. The laptop only has to run one command with no arguments
// to think about, which is why this file also writes the command out for him.
//
// Everything is deterministic. lib/captions.ts (shared with the CLI) does the real work; this is
// the Shorts-shaped wrapper around it plus the naming and the command line.
import { assFromCards, captionLineCharsFor, cardsFromWords, shortsStyle, srtFromCards, type Word } from "./captions";

/** Every Blast Off short is this. The style geometry comes from CAPTION_RAIL, so a burned caption
 *  lands exactly where Review reserved space for it. */
export const SHORT_W = 1080;
export const SHORT_H = 1920;

export interface ShortCaptionFiles {
  /** The sidecar an upload's caption track takes (YouTube reads it natively). */
  srt: string;
  /** The styled subtitles ffmpeg burns: Rubik Black, gold on the spoken word, in the rail. */
  ass: string;
  /** How many caption cards the take produced — the "does this look right" number. */
  cards: number;
  /** Seconds of speech, from the last word's end. */
  seconds: number;
}

/** Words in, files out. `cam: "none"` frees the full width for a take filmed without the
 *  bottom-left camera. */
export function shortCaptionFiles(words: readonly Word[], cam: "home" | "none" = "home"): ShortCaptionFiles {
  const style = shortsStyle(SHORT_W, SHORT_H, cam);
  const cards = cardsFromWords(words, { lineChars: captionLineCharsFor(style) });
  return {
    srt: srtFromCards(cards),
    ass: assFromCards(cards, style),
    cards: cards.length,
    seconds: words.reduce((m, w) => Math.max(m, w.e), 0),
  };
}

/** The take's name without its extension — what every sidecar is named after, so the files sort
 *  next to the video in Explorer. */
export function takeStem(fileName: string): string {
  return fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim() || "take";
}

export const srtName = (fileName: string): string => `${takeStem(fileName)}.srt`;
export const assName = (fileName: string): string => `${takeStem(fileName)}.ass`;
export const burnedName = (fileName: string): string => `${takeStem(fileName)}.captioned.mp4`;

/** ffmpeg's filter syntax wants a Windows path escaped: C\:/Users/lee/take.ass. The CLI does the
 *  same thing (scripts/captions.ts filterPath) — the two must agree or the burn silently finds
 *  no subtitles and writes an uncaptioned copy. */
export function filterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
}

/** THE ONE COMMAND. Everything is in the working directory — he downloads the .ass beside the
 *  take, opens a terminal there, and pastes this. Quoted for PowerShell, which is what a
 *  right-click "Open in Terminal" gives him on Windows.
 *
 *  -c:a copy leaves the audio untouched (no second generation of lossy audio); crf 18 is
 *  visually lossless for text; +faststart puts the index first so an upload can start streaming
 *  before it finishes reading. */
export function burnCommand(fileName: string, opts?: { fontsDir?: string }): string {
  const ass = assName(fileName);
  const out = burnedName(fileName);
  const fonts = opts?.fontsDir ? `:fontsdir='${filterPath(opts.fontsDir)}'` : "";
  const vf = `ass='${filterPath(ass)}'${fonts}`;
  return `ffmpeg -y -i "${fileName}" -vf "${vf}" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "${out}"`;
}

/** What a plain transcript reads like — the caption model's strongest source, and what he'd paste
 *  anywhere else. One space between words, sentence spacing left to Whisper's own punctuation. */
export function transcriptFromWords(words: readonly Word[]): string {
  return words.map((w) => w.t.trim()).filter(Boolean).join(" ").replace(/\s+([,.!?;:])/g, "$1").trim();
}

/** Whisper is billed by the minute of audio, rounded up to the second. Repeated here from
 *  captions.ts so the panel can price the click before he makes it. */
export { WHISPER_USD_PER_MINUTE, whisperCostUsd } from "./captions";
export type { Word } from "./captions";
