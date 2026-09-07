// THE TALKTHROUGH CONTEXT for a rehearsal suggestion (2026-09-06). Lee: "Makes sense for
// suggestions to bring out anything from talkthrough that would be good." When Lee talked
// through this set (Step 1), everything he said with a card focused, every stamp he dropped on
// it and every board item the review pass minted for it is already in the local-first
// talkthrough store (canvas/talkthrough.ts) — this composes the slice that belongs to ONE card
// into the plain text the rehearsal brief carries as TALKTHROUGH NOTES, so the "Suggested" line
// can bring in a phrase or a way of teaching it from the original talkthrough.
//
// Pure: a TTDoc in, a string out. Reads only; the Transcript Law (segments are never rewritten)
// is untouched. Non-card frames (phrases, cheat codes, the spine) have no talkthrough of their
// own → "".
import { stampLabel, type TTDoc } from "@/components/canvas/talkthrough";

/** Roughly a paragraph of speech — enough for a phrase or two to surface, not the whole take. */
export const TALKTHROUGH_SPEECH_CAP = 700;
const QUOTE_CAP = 200;

function capWords(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max * 0.6 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

export function rehearsalContextFor(doc: TTDoc, setId: string, ceqId: string | null | undefined): string {
  if (!ceqId) return "";
  const sessionIds = new Set(doc.sessions.filter((s) => s.setId === setId && !s.archivedAt).map((s) => s.id));
  if (sessionIds.size === 0) return "";

  const speech = doc.segments
    .filter((s) => sessionIds.has(s.sessionId) && s.focusedCeqId === ceqId && !s.archivedAt && s.text.trim())
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.seq - b.seq)
    .map((s) => s.text.trim())
    .join(" ");

  const stamps = doc.tags
    .filter((t) => sessionIds.has(t.sessionId) && t.focusedCeqId === ceqId && !t.archivedAt)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((t) => { const note = t.note?.trim(); return note ? `${stampLabel(t.tag)}: ${capWords(note, QUOTE_CAP)}` : stampLabel(t.tag); });

  const board = doc.boardItems
    .filter((b) => sessionIds.has(b.sessionId) && b.ceqIds.includes(ceqId) && !b.archivedAt && !b.dismissed)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((b) => { const q = b.quote.trim(); return q ? `${b.title.trim()} — ${capWords(q, QUOTE_CAP)}` : b.title.trim(); })
    .filter(Boolean);

  const sections: string[] = [];
  if (speech) sections.push(`Said during Talkthrough: ${capWords(speech, TALKTHROUGH_SPEECH_CAP)}`);
  if (stamps.length) sections.push(`Stamps: ${dedupe(stamps).join(" · ")}`);
  if (board.length) sections.push(`Board: ${dedupe(board).join(" · ")}`);
  return sections.join("\n");
}

const dedupe = (xs: string[]): string[] => [...new Set(xs)];
