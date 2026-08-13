// SCRIPT TIMING + LAYERS (pure) — PROMPT 3 items 2 & 3.
//
// TWO SCRIPT LAYERS. A script line is either a MONEY LINE (say verbatim — the
// definition, the rule, the punchline) or a TALKING POINT (a bullet you riff on).
// The convention (chosen over a per-line data toggle so it works in the plain
// textarea fields and round-trips through export): a line starting with "!" is a
// money line; the "!" is stripped for display. ENTRY and EXIT lines are money
// lines by default (they're the scripted open/close), regardless of "!".
//
// READ-TIME. Estimated spoken seconds from the SCRIPT (never card text): money
// words are spoken ~1:1 at `wpm`; talking-point words are the WRITTEN shorthand
// for what you'll actually say, so their time is multiplied by a riff factor
// (default 2.0 — you say ~2 words for each you jotted). Frames over a threshold
// (default 60s) are flagged so a cram video stays crammy.
import type { FrameScript } from "./types";

export const DEFAULT_WPM = 150;
export const DEFAULT_RIFF = 2.0;
export const DEFAULT_READTIME_THRESHOLD_S = 60;

export interface ScriptTimingOpts {
  /** Words-per-minute for verbatim (money) delivery. */
  wpm?: number;
  /** Talking-point time multiplier (a jotted bullet expands into more spoken words). */
  riff?: number;
}

export interface ScriptLine { text: string; money: boolean }
export type ScriptSection = "entry" | "beats" | "exit";

/** Split a field into non-empty trimmed lines, flagging money lines. `forceMoney`
 *  marks every line money (entry/exit). A leading "!" always marks money and is
 *  stripped from the displayed text. */
export function parseScriptLines(text: string | undefined, forceMoney = false): ScriptLine[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((ln) => {
      const bang = ln.startsWith("!");
      return { text: bang ? ln.slice(1).trim() : ln, money: forceMoney || bang };
    });
}

/** The frame's teleprompter lines in delivery order: entry (money) → beats
 *  (per-"!" convention) → exit (money). */
export function frameScriptLines(script: FrameScript | undefined): { section: ScriptSection; line: ScriptLine }[] {
  const out: { section: ScriptSection; line: ScriptLine }[] = [];
  for (const line of parseScriptLines(script?.entry, true)) out.push({ section: "entry", line });
  for (const line of parseScriptLines(script?.beats, false)) out.push({ section: "beats", line });
  for (const line of parseScriptLines(script?.exit, true)) out.push({ section: "exit", line });
  return out;
}

const wordCount = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Money vs talking-point word totals for a frame's script. */
export function frameWordCounts(script: FrameScript | undefined): { money: number; talk: number } {
  let money = 0;
  let talk = 0;
  for (const { line } of frameScriptLines(script)) {
    const w = wordCount(line.text);
    if (line.money) money += w;
    else talk += w;
  }
  return { money, talk };
}

/** Estimated spoken seconds for a frame's script (0 when blank). */
export function estimateFrameSeconds(script: FrameScript | undefined, opts: ScriptTimingOpts = {}): number {
  const wpm = opts.wpm ?? DEFAULT_WPM;
  const riff = opts.riff ?? DEFAULT_RIFF;
  const { money, talk } = frameWordCounts(script);
  const secs = (money / wpm) * 60 + ((talk / wpm) * 60) * riff;
  return Math.round(secs);
}

/** Sum of estimates over a set of frame scripts (a lesson total). */
export function estimateTotalSeconds(scripts: (FrameScript | undefined)[], opts: ScriptTimingOpts = {}): number {
  return scripts.reduce((a, s) => a + estimateFrameSeconds(s, opts), 0);
}

/** "≈22s" under a minute, "≈1:20" at/over a minute. Empty string for 0. */
export function formatReadTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds < 60) return `≈${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `≈${m}:${String(s).padStart(2, "0")}`;
}

export const isOverReadTime = (seconds: number, threshold = DEFAULT_READTIME_THRESHOLD_S): boolean => seconds > threshold;
