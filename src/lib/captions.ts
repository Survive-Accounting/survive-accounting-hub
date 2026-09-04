// CAPTIONS — the pure half of the caption bake (scripts/captions.ts is the CLI).
//
// Lee (2026-09-05): "Build our own captions tool now." The plan we agreed:
// one to two lines, three to five words each, a new phrase every ~0.7–1.2 s,
// Rubik 900, white with a heavy dark stroke, no box, the spoken word in gold
// (karaoke), centred in the band to the RIGHT of the camera and above the
// Shorts caption zone — never over the card.
//
// Words in, cards out; cards to ASS (what ffmpeg's libass burns, with \k
// karaoke) and SRT (a sidecar for uploads). Everything here is deterministic
// and tested; nothing touches the network or the disk.

export interface Word { t: string; s: number; e: number }

export interface CaptionCard {
  s: number; e: number;
  /** One or two lines, each a list of words in order. */
  lines: Word[][];
}

export interface CardOptions {
  /** Most words on a card (both lines together). */
  maxWords: number;
  /** A card never runs longer than this many seconds; a new one starts. */
  maxSeconds: number;
  /** Characters per line before the card breaks into its second line. */
  lineChars: number;
  /** A pause longer than this between two words ends the card. */
  gapSeconds: number;
}

export const CARD_DEFAULTS: CardOptions = { maxWords: 5, maxSeconds: 1.2, lineChars: 16, gapSeconds: 0.45 };

const ENDS = /[.!?]$/;
const PAUSES = /[,;:—–-]$/;

/** Split the words into cards: a card closes on a sentence end, a long pause,
 *  the word cap, or the time cap; a comma closes it once it has three words. */
export function cardsFromWords(words: readonly Word[], o: Partial<CardOptions> = {}): CaptionCard[] {
  const opt = { ...CARD_DEFAULTS, ...o };
  const cards: CaptionCard[] = [];
  let cur: Word[] = [];
  const flush = () => { if (cur.length) { cards.push({ s: cur[0].s, e: cur[cur.length - 1].e, lines: splitLines(cur, opt.lineChars) }); cur = []; } };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = cur[cur.length - 1];
    if (prev && (w.s - prev.e > opt.gapSeconds || w.e - cur[0].s > opt.maxSeconds || cur.length >= opt.maxWords)) flush();
    cur.push(w);
    if (ENDS.test(w.t) || (PAUSES.test(w.t) && cur.length >= 3)) flush();
  }
  flush();
  // A card holds until the next one starts (or a beat after its last word), so
  // the screen is never empty mid-sentence and never shows a stale line long.
  for (let i = 0; i < cards.length; i++) {
    const next = cards[i + 1];
    const hold = cards[i].e + 0.35;
    cards[i].e = next ? Math.min(hold, next.s) : hold;
  }
  return cards;
}

/** One line, or two balanced lines when the card is wider than `lineChars`. */
export function splitLines(words: Word[], lineChars: number): Word[][] {
  const text = words.map((w) => w.t).join(" ");
  if (words.length < 2 || text.length <= lineChars) return [words];
  // The break that leaves the two lines closest in length.
  let best = 1, bestDiff = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).map((w) => w.t).join(" ").length, b = words.slice(k).map((w) => w.t).join(" ").length;
    const d = Math.abs(a - b);
    if (d < bestDiff) { bestDiff = d; best = k; }
  }
  return [words.slice(0, best), words.slice(best)];
}

export interface CaptionStyle {
  /** The video's size — the margins are fractions of it. */
  w: number; h: number;
  /** Font family as libass sees it (the file is handed to ffmpeg by the CLI). */
  font: string;
  /** Font size as a fraction of the height. */
  size: number;
  /** The band: left / right as fractions of the width, and the BOTTOM edge of the text as a fraction of the height. */
  left: number; right: number; bottom: number;
  /** Colours as #RRGGBB. */
  ink: string; spoken: string; stroke: string;
  /** Stroke width as a fraction of the height. */
  strokeW: number;
}

/** The Shorts layout: the band to the right of the home-spot camera (the
 *  circle ends at 29 % of the width), text bottom at 78 % — above the 20 %
 *  caption zone, below the card. `cam: "none"` frees the whole width. */
export function shortsStyle(w: number, h: number, cam: "home" | "none" = "home"): CaptionStyle {
  return { w, h, font: "Rubik", size: 0.046, left: cam === "home" ? 0.31 : 0.07, right: 0.07, bottom: 0.78, ink: "#FFFFFF", spoken: "#FCA311", stroke: "#0B1220", strokeW: 0.0055 };
}

function assColour(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`captions: bad colour ${hex}`);
  return `&H00${m[3]}${m[2]}${m[1]}`.toUpperCase();   // ASS is BGR
}

export function assTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function assEscape(t: string): string { return t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")"); }

/** The .ass file: one style, one Dialogue per card, karaoke \k per word in
 *  centiseconds so the spoken word lights gold as it is said. */
export function assFromCards(cards: readonly CaptionCard[], st: CaptionStyle): string {
  const size = Math.round(st.h * st.size);
  const outline = Math.max(1, Math.round(st.h * st.strokeW));
  const marginL = Math.round(st.w * st.left), marginR = Math.round(st.w * st.right), marginV = Math.round(st.h * (1 - st.bottom));
  const head = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${st.w}`, `PlayResY: ${st.h}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // PrimaryColour = the spoken (karaoke fills from Secondary to Primary), SecondaryColour = the ink before it is said.
    `Style: Cram,${st.font},${size},${assColour(st.spoken)},${assColour(st.ink)},${assColour(st.stroke)},&H80000000,-1,0,0,0,100,100,0.5,0,1,${outline},0,2,${marginL},${marginR},${marginV},1`,
    "",
    "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const lines = cards.map((c) => {
    const text = c.lines.map((line, li) => line.map((w, wi) => {
      // \k holds the word's duration; the gap to the next word rides on this word.
      const nextStart = line[wi + 1]?.s ?? c.lines[li + 1]?.[0]?.s ?? w.e;
      const cs = Math.max(1, Math.round((nextStart - w.s) * 100));
      const lead = wi === 0 && li === 0 ? Math.max(0, Math.round((w.s - c.s) * 100)) : 0;
      return `${lead ? `{\\k${lead}}` : ""}{\\k${cs}}${assEscape(w.t)}`;
    }).join(" ")).join("\\N");
    return `Dialogue: 0,${assTime(c.s)},${assTime(c.e)},Cram,,0,0,0,,${text}`;
  });
  return [...head, ...lines, ""].join("\n");
}

export function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), x = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(x).padStart(3, "0")}`;
}

/** The .srt sidecar — the same cards, plain text, for an upload's caption track. */
export function srtFromCards(cards: readonly CaptionCard[]): string {
  return cards.map((c, i) => `${i + 1}\n${srtTime(c.s)} --> ${srtTime(c.e)}\n${c.lines.map((l) => l.map((w) => w.t).join(" ")).join("\n")}\n`).join("\n");
}
