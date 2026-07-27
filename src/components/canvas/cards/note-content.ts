// NOTE CONTENT helpers — TipTap-FREE so both the static display path (NoteCardNode)
// and the lazily-loaded editor (NoteEditor) can share them WITHOUT pulling the heavy
// @tiptap bundle into the canvas chunk. Keep this module free of any @tiptap import.
import type { NoteCard } from "../types";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The note's HTML. New scenes store `bodyHtml`; old scenes stored plain text in
 *  `body` — render it as paragraphs (the same shape TipTap would produce). Empty ⇒ "". */
export function initialContent(d: NoteCard): string {
  if (d.bodyHtml) return d.bodyHtml;
  if (!d.body) return "";
  return d.body
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}
