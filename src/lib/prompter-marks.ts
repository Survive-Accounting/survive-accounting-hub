// THE PAINTED LINE (2026-09-07). Lee: "I can have the teleprompter have a certain piece
// highlighted, so already know it's coming and I can really make it land. I could even 'double
// highlight' the word I want to transition on. So it's like transition phrase is yellow but the
// word itself is orange." One painter, shared by /v3/teleprompter (the pop-out window), the
// prompter panel on /film and the rehearsal review's Suggested card — so the yellow and the
// orange are the same yellow and orange everywhere Lee reads the line.
//
// Pure: a line and its marks (plan.ts PrompterMarks) in, the segments to draw out. The ranges
// themselves come from markRanges; this only fills the plain text between them. The colours are
// here too, as CSS, so no renderer retypes a hex.
import { markRanges, type PrompterMarks } from "@/components/blastoff/plan";

export type MarkTone = "plain" | "phrase" | "word";
export interface PaintedSegment { text: string; tone: MarkTone }

/** The whole line, in order, as segments — every character exactly once. A line with no marks
 *  (or marks that aren't in it) is one plain segment; an empty line is no segments. */
export function paintLine(line: string, marks: PrompterMarks | null | undefined): PaintedSegment[] {
  if (!line) return [];
  const out: PaintedSegment[] = [];
  let at = 0;
  for (const r of markRanges(line, marks)) {
    if (r.start > at) out.push({ text: line.slice(at, r.start), tone: "plain" });
    out.push({ text: line.slice(r.start, r.end), tone: r.tone });
    at = r.end;
  }
  if (at < line.length) out.push({ text: line.slice(at), tone: "plain" });
  return out;
}

/** The transition phrase: gold (#FCA311) at ~35% behind the words; the text keeps whatever
 *  colour the line has (black on the white prompter window, cream on the dark panels). */
export const PHRASE_BG = "rgba(252,163,17,0.35)";
/** The cue word: solid orange behind, navy text, bold — the "double highlight". */
export const WORD_BG = "#FF9F43";
export const WORD_INK = "#14213D";

/** The style for one segment — inline, so every renderer paints the same way. */
export function markStyle(tone: MarkTone): React.CSSProperties {
  if (tone === "phrase") return { background: PHRASE_BG, borderRadius: "0.15em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" };
  if (tone === "word") return { background: WORD_BG, color: WORD_INK, fontWeight: 800, borderRadius: "0.15em", padding: "0 0.08em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" };
  return {};
}
