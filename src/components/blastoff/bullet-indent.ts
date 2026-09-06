// BULLET NESTING (2026-09-06). Lee: "let me tab over to nest bullets into another indention
// under." Pure textarea-editing logic for ReviewDeck's bullets field: Tab/Shift+Tab on the
// CURRENT line (the one the cursor sits in) adds or removes one leading tab — the exact
// convention plan.ts's frameBullets and CalloutCard.tsx's parseBulletLine both read as depth.
// Split out from ReviewDeck.tsx so cursor-math has its own test file rather than being
// exercised only by clicking around a huge editor component.
export interface IndentResult { text: string; cursor: number }

/** The start offset of the line containing `cursor` (the char right after the previous \n, or
 *  0 for the first line). */
export function lineStartAt(text: string, cursor: number): number {
  return text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
}

/** Tab (`dir: 1`) inserts one leading tab on the current line; Shift+Tab (`dir: -1`) removes one
 *  if present. A line already at depth 0 is a no-op on outdent — never goes negative. */
export function indentBulletLine(text: string, cursor: number, dir: 1 | -1): IndentResult {
  const start = lineStartAt(text, cursor);
  if (dir === 1) return { text: text.slice(0, start) + "\t" + text.slice(start), cursor: cursor + 1 };
  if (text[start] === "\t") return { text: text.slice(0, start) + text.slice(start + 1), cursor: Math.max(start, cursor - 1) };
  return { text, cursor };
}
