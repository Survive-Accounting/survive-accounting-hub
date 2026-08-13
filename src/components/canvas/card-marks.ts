// CARD MARKS (pure) — the "@Kind" language for the script editor. A mark is
// planning intent ("build a List here"), never a card. Marks are typed as
// "@Kind" tokens in the beats field; this module maps a token to a MarkKind,
// parses a pasted/hand-written script back into marks (round-trip), and mints new
// marks. The canonical store is FrameScript.marks (structured data); the tokens
// are the readable, paste-friendly surface.
import { cardId, type CardMark, type MarkKind } from "./types";

export const MARK_KINDS: { kind: MarkKind; label: string }[] = [
  { kind: "je", label: "JE" },
  { kind: "taccount", label: "T-account" },
  { kind: "list", label: "List" },
  { kind: "formula", label: "Formula" }, // the effect card
  { kind: "note", label: "Note" },
  { kind: "legend", label: "Legend" },
  { kind: "video", label: "Video" },
  { kind: "ceq", label: "CEQ" },
  { kind: "memo", label: "Memo" },
  { kind: "heading", label: "Heading" },
  { kind: "text", label: "Text" },
  { kind: "outline", label: "Outline" },
  { kind: "schedule", label: "Schedule" },
  { kind: "computation", label: "Computation" },
  { kind: "memorize", label: "Memorize" },
  { kind: "image", label: "Image" },
  { kind: "deck", label: "Deck" },
  { kind: "background", label: "Background" },
];

const LABEL = new Map<MarkKind, string>(MARK_KINDS.map((m) => [m.kind, m.label]));
export const markLabel = (k: MarkKind): string => LABEL.get(k) ?? String(k);

// token normalisation: lowercase, strip non-alphanumerics ("T-account" → "taccount").
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const TOKEN_TO_KIND = new Map<string, MarkKind>();
for (const m of MARK_KINDS) {
  TOKEN_TO_KIND.set(norm(m.kind), m.kind);
  TOKEN_TO_KIND.set(norm(m.label), m.kind);
}
// friendly aliases so hand-written scripts still parse.
const ALIASES: [MarkKind, string][] = [
  ["formula", "effect"], ["ceq", "question"], ["ceq", "q"], ["taccount", "taccount"],
  ["taccount", "taccount"], ["memorize", "flashcard"], ["background", "bg"], ["outline", "staircase"],
];
for (const [kind, alias] of ALIASES) TOKEN_TO_KIND.set(norm(alias), kind);

/** A "@Word" token → its MarkKind, or null if unrecognised. */
export function kindOfToken(word: string): MarkKind | null {
  return TOKEN_TO_KIND.get(norm(word)) ?? null;
}

interface Hit { word: string; start: number; end: number }

/** Parse the "@Word" tokens in a block of text into marks. Each mark's note is the
 *  trailing text on the same line up to the next token (a leading dash is trimmed).
 *  Unrecognised tokens are ignored. Powers PASTE + hand-written-script round-trip. */
export function parseAtTokens(text: string): { kind: MarkKind; note?: string }[] {
  const out: { kind: MarkKind; note?: string }[] = [];
  for (const line of text.split("\n")) {
    const re = /@([A-Za-z][A-Za-z0-9-]*)/g;
    const hits: Hit[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) hits.push({ word: m[1], start: m.index, end: re.lastIndex });
    hits.forEach((h, i) => {
      const kind = kindOfToken(h.word);
      if (!kind) return;
      const noteEnd = i + 1 < hits.length ? hits[i + 1].start : line.length;
      const note = line.slice(h.end, noteEnd).replace(/^\s*[-–—:]\s*/, "").trim();
      out.push({ kind, note: note || undefined });
    });
  }
  return out;
}

/** Mint a fresh mark. */
export function newMark(kind: MarkKind, note?: string): CardMark {
  return { id: cardId("mark"), kind, note: note || undefined };
}

/** Is this mark still waiting on a real card? (no link, or a dangling link). */
export function isUnlinked(mark: CardMark, cardExists: (id: string) => boolean): boolean {
  return !mark.linkedCardId || !cardExists(mark.linkedCardId);
}
