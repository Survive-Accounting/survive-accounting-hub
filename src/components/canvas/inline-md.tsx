// INLINE MARKDOWN subset (shared) — renders **bold**, ==highlight==, ~~strikethrough~~,
// __underline__, ___ blanks and *tease* inside plain text fields (CEQ stems/choices, memo bodies,
// and since 2026-09-09 the big-format callouts and the slogan slides). No editor, no toolbar. Only
// matches CLOSED pairs, so unmatched / malformed markers fall through and render literally — it
// can never throw. Editing shows the raw markers; this is display-only.
//
// THE TEASE (2026-09-12). Lee: "I want to put a star on the types of accounts within that slide…
// like an asterisk* where it would blur that type out. This will help me teach them incrementally.
// I'm not teaching EVERY asset at first … I think anything should be teaseable. Even a found on
// your exam. I can hook them in at the beginning by holding it in front of them but promise it
// later in video."
//
// *word* marks a tease. The span is inert here — it is PhoneFrame that blurs it and opens it on a
// click (its TEASE_CSS is scoped to [data-sa-phone]). Everywhere else — the student's cards on
// /learn most of all — a teased word renders as ordinary text, because a promise Lee makes on
// camera must never become a permanent blur on the thing a student is revising from.
import type { ReactNode } from "react";

/** Is this run already teased — either wrapped itself, or hugged by the markers? */
export const isTeased = (text: string, start: number, end: number): boolean =>
  end > start && (/^\*[^*][\s\S]*\*$/.test(text.slice(start, end)) || (text[start - 1] === "*" && text[end] === "*"));

/** BLUR THE SELECTION (2026-09-12). Lee: "it will be better if I can just like highlight a text
 *  item in the editor and have a popup tooltip for blur or unblur. * is taking too long." Wraps
 *  the selected run in the marker, or unwraps it when it is already teased — either way handing
 *  back where the selection should sit afterwards. Pure; the Editor's bar is the only caller. */
export function wrapTease(text: string, start: number, end: number): { text: string; start: number; end: number } {
  if (end <= start) return { text, start, end };
  const inner = text.slice(start, end);
  if (/^\*[^*][\s\S]*\*$/.test(inner)) {
    const bare = inner.slice(1, -1);
    return { text: text.slice(0, start) + bare + text.slice(end), start, end: end - 2 };
  }
  if (text[start - 1] === "*" && text[end] === "*") {
    return { text: text.slice(0, start - 1) + inner + text.slice(end + 1), start: start - 1, end: end - 1 };
  }
  return { text: `${text.slice(0, start)}*${inner}*${text.slice(end)}`, start, end: end + 2 };
}

/** BLUR EACH WORD (2026-09-12). Lee: "on the blur, enable a setting to blur word by word. Just so
 *  I have all scenarios ready." One run blurs as a single blob; word by word keeps every word's own
 *  shape — a better tease, and each word opens on its own click. Already-teased words are left. */
export function wrapTeaseWords(text: string, start: number, end: number): { text: string; start: number; end: number } {
  if (end <= start) return { text, start, end };
  const out = text.slice(start, end).replace(/\S+/g, (w) => (/^\*[^*][\s\S]*\*$/.test(w) ? w : `*${w}*`));
  return { text: text.slice(0, start) + out + text.slice(end), start, end: start + out.length };
}

/** BLUR EACH LINE (2026-09-12) — the same, a line at a time: "if it's on a separate line, it's
 *  still about blurring it line by line." Blank lines stay blank. */
export function wrapTeaseLines(text: string, start: number, end: number): { text: string; start: number; end: number } {
  if (end <= start) return { text, start, end };
  const out = text.slice(start, end).split("\n")
    .map((line) => { const t = line.trim(); if (!t || /^\*[^*][\s\S]*\*$/.test(t)) return line; const pad = line.slice(0, line.indexOf(t)); return `${pad}*${t}*`; })
    .join("\n");
  return { text: text.slice(0, start) + out + text.slice(end), start, end: start + out.length };
}

/** Wrap a line in the tease marker, or take it off — what the Editor's ✳ blur button does. */
export function toggleTease(s: string): string {
  const t = s.trim();
  if (!t) return s;
  return /^\*[^*][\s\S]*\*$/.test(t) ? t.slice(1, -1) : `*${t}*`;
}

export function renderInline(text: string, hl?: { bg?: string; color?: string }): ReactNode {
  const bg = hl?.bg ?? "rgba(214,158,46,0.38)";
  const color = hl?.color ?? "#C21832";
  const out: ReactNode[] = [];
  // A highlight may contain a lone "=" — accounting is full of them ("Assets =
  // Liabilities + Equity" is exactly the kind of phrase that gets marked).
  // Only a doubled "==" closes the pair.
  // UNDERLINE (Lee, 2026-09-03: "I'm doing ____ in some of the text edits and
  // I want it to read like a true underline"): __word__ underlines the word;
  // a bare run of three or more underscores is a BLANK — an underlined gap as
  // wide as the run, the fill-in-the-blank a cram card lives on.
  // STRIKETHROUGH (Lee, 2026-09-09: "add a ~ ~ to do a strikethrough. Those are very useful in
  // my teaching"). ~~word~~, the same doubled-marker rule as ==highlight==, so a lone ~ falls
  // through and renders literally. It is the "the wrong thing to do would be this" gesture — he
  // shows the wrong answer, then crosses it out.
  // STRIKETHROUGH takes ~~doubled~~ OR ~single~ (2026-09-09). Lee asked for it as "a ~ ~", wrote
  // it that way twice, and reported it not working — he is typing one tilde. The single form is
  // guarded so prose survives: the run may not begin or end on whitespace, which is what stops
  // "about ~5 minutes and ~10 more" from striking everything between the two tildes.
  // The tease is LAST in the alternation and single-starred, so **bold** still wins at the same
  // position; the \S guards are the ~single~ rule, so "3 * 4 * 5" and a footnote star fall through.
  // IT MAY CROSS A LINE BREAK (2026-09-12). Lee: "Blur didn't work on this" — his heading was
  // *"What type of account\nis ____?"*, and the run refused to span the newline. A highlight has
  // always been allowed to; so is this.
  const re = /(\*\*([^*]+?)\*\*|==((?:[^=]|=(?!=))+?)==|~~((?:[^~]|~(?!~))+?)~~|~(\S|\S[^~\n]*?\S)~|__([^_\n]+?)__|(_{3,})|\*(\S|\S[^*]*?\S)\*)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] != null) out.push(<strong key={k++} style={{ fontWeight: 800 }}>{m[2]}</strong>);
    else if (m[3] != null) out.push(<mark key={k++} style={{ background: bg, color, padding: "0 3px", borderRadius: 3, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{m[3]}</mark>);
    // The struck run stays readable — it is the wrong answer he wants seen and rejected, not
    // hidden — so it dims rather than disappears, and the line is thick enough to survive H.264.
    else if (m[4] != null || m[5] != null) out.push(<s key={k++} style={{ textDecorationThickness: "0.11em", opacity: 0.72 }}>{m[4] ?? m[5]}</s>);
    else if (m[6] != null) out.push(<span key={k++} style={{ textDecoration: "underline", textDecorationThickness: "0.09em", textUnderlineOffset: "0.14em" }}>{m[6]}</span>);
    else if (m[7] != null) out.push(<span key={k++} aria-label="blank" style={{ display: "inline-block", width: `${Math.max(2, m[7].length * 0.55)}em`, borderBottom: "0.09em solid currentColor", verticalAlign: "baseline", lineHeight: 1 }}>&#8203;</span>);
    // THE TEASE: two spans on purpose — the outer keeps its frame crisp while the inner blurs.
    else out.push(<span key={k++} className="sa-tease" data-sa-tease="" title="Teased — click it on the slide to open it"><span className="sa-tease-ink">{m[8]}</span></span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}
