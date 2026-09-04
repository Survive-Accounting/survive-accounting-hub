// INLINE MARKDOWN subset (shared) — renders **bold** and ==highlight== inside plain
// text fields (CEQ stems/choices, memo bodies). No editor, no toolbar. Only matches
// CLOSED pairs, so unmatched / malformed markers fall through and render literally —
// it can never throw. Editing shows the raw markers; this is display-only.
import type { ReactNode } from "react";

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
  const re = /(\*\*([^*]+?)\*\*|==((?:[^=]|=(?!=))+?)==|__([^_\n]+?)__|(_{3,}))/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] != null) out.push(<strong key={k++} style={{ fontWeight: 800 }}>{m[2]}</strong>);
    else if (m[3] != null) out.push(<mark key={k++} style={{ background: bg, color, padding: "0 3px", borderRadius: 3, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{m[3]}</mark>);
    else if (m[4] != null) out.push(<span key={k++} style={{ textDecoration: "underline", textDecorationThickness: "0.09em", textUnderlineOffset: "0.14em" }}>{m[4]}</span>);
    else out.push(<span key={k++} aria-label="blank" style={{ display: "inline-block", width: `${Math.max(2, m[5].length * 0.55)}em`, borderBottom: "0.09em solid currentColor", verticalAlign: "baseline", lineHeight: 1 }}>&#8203;</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}
