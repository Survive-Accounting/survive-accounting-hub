// INLINE MARKDOWN subset (shared) — renders **bold** and ==highlight== inside plain
// text fields (CEQ stems/choices, memo bodies). No editor, no toolbar. Only matches
// CLOSED pairs, so unmatched / malformed markers fall through and render literally —
// it can never throw. Editing shows the raw markers; this is display-only.
import type { ReactNode } from "react";

export function renderInline(text: string, hl?: { bg?: string; color?: string }): ReactNode {
  const bg = hl?.bg ?? "rgba(214,158,46,0.38)";
  const color = hl?.color ?? "#C21832";
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+?)\*\*|==([^=]+?)==)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] != null) out.push(<strong key={k++} style={{ fontWeight: 800 }}>{m[2]}</strong>);
    else out.push(<mark key={k++} style={{ background: bg, color, padding: "0 3px", borderRadius: 3, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{m[3]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}
