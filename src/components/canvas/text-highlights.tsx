// TEXT HIGHLIGHTS — the live teaching gesture: on camera Lee selects words in a
// stem, a choice or a memo, releases, and they STAY amber and bold until the
// backtick wipes them.
//
// Extracted from CeqPreviewer (2026-08-31) because /blast-off films the same
// questions on a second surface, and a copy of this would be the eighth CEQ-ish
// implementation in the repo — the exact drift the component audit catalogued.
// Behaviour here is byte-for-byte what the previewer did; it just has one home
// now, so a fix to the gesture reaches both surfaces.
//
// PURE PERFORMANCE STATE. Ranges are character offsets into the plain text and
// are NEVER saved — nothing here touches a question. They live as long as the
// session does, because film cards unmount constantly (a memo on every walk-
// away) and a highlight that died with its card would be useless mid-take.
import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";

export interface TextRange { a: number; b: number }

export interface HighlightApi {
  stem: (qid: string) => TextRange | null;
  setStem: (qid: string, r: TextRange | null) => void;
  choice: (qid: string, i: number) => TextRange | null;
  setChoice: (qid: string, i: number, r: TextRange) => void;
  clearCeq: (qid: string) => void;
  memo: (mid: string) => TextRange | null;
  setMemo: (mid: string, r: TextRange | null) => void;
}

const NOOP: HighlightApi = {
  stem: () => null, setStem: () => {}, choice: () => null, setChoice: () => {},
  clearCeq: () => {}, memo: () => null, setMemo: () => {},
};

/** Session-level, so a card unmounting mid-take does not drop its highlight. */
export const HighlightContext = createContext<HighlightApi>(NOOP);

/** The store. One per filming surface — the previewer owns one, /blast-off owns
 *  one. `clearAll` is what the backtick calls. */
export function useTextHighlights(): { api: HighlightApi; clearAll: () => void } {
  const [stemHls, setStemHls] = useState<Map<string, TextRange>>(() => new Map());
  const [choiceHls, setChoiceHls] = useState<Map<string, TextRange>>(() => new Map());
  const [memoHls, setMemoHls] = useState<Map<string, TextRange>>(() => new Map());

  const clearAll = useCallback(() => {
    setStemHls((m) => (m.size ? new Map() : m));
    setChoiceHls((m) => (m.size ? new Map() : m));
    setMemoHls((m) => (m.size ? new Map() : m));
  }, []);

  const api = useMemo<HighlightApi>(() => ({
    stem: (qid) => stemHls.get(qid) ?? null,
    setStem: (qid, r) => setStemHls((m) => { const x = new Map(m); if (r) x.set(qid, r); else x.delete(qid); return x; }),
    choice: (qid, i) => choiceHls.get(qid + "|" + i) ?? null,
    setChoice: (qid, i, r) => setChoiceHls((m) => new Map(m).set(qid + "|" + i, r)),
    clearCeq: (qid) => {
      setStemHls((m) => { if (!m.has(qid)) return m; const x = new Map(m); x.delete(qid); return x; });
      setChoiceHls((m) => { const x = new Map([...m].filter(([k]) => !k.startsWith(qid + "|"))); return x.size === m.size ? m : x; });
    },
    memo: (mid) => memoHls.get(mid) ?? null,
    setMemo: (mid, r) => setMemoHls((m) => { const x = new Map(m); if (r) x.set(mid, r); else x.delete(mid); return x; }),
  }), [stemHls, choiceHls, memoHls]);

  return { api, clearAll };
}

/** KEPT SELECTION EMPHASIS (Lee) — after you release, the highlighted text stays
 *  BOLD + amber; when the memo is spotlit it also grows a touch, so it reads as
 *  "spotlighted". Injected by whichever surface renders highlights. */
export const SEL_EMPH_CSS = `
.sa-sel-emph { font-weight: 900; background: rgba(252,163,17,0.92); color: #0B0F1E; border-radius: 3px; padding: 0 2px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.sa-sel-emph-spot { font-size: 1.18em; }`;

/** Read the live selection as CHARACTER OFFSETS into `el`'s plain text.
 *  Offsets, not DOM ranges, because the text re-renders constantly (walks,
 *  reveals, scale changes) and a stored DOM range would go stale instantly.
 *  Returns null when there is nothing usable to keep. */
export function readRangeIn(el: HTMLElement | null): TextRange | null {
  const win = el?.ownerDocument.defaultView;
  const sel = win?.getSelection();
  if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.commonAncestorContainer)) return null;
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  const a = pre.toString().length;
  const b = a + r.toString().length;
  return b > a ? { a, b } : null;
}

/** Draw `text` with `range` emphasised. Out-of-bounds ranges (the stem was
 *  edited under a live highlight) fall back to plain text rather than slicing
 *  into nonsense. */
export function Emph({ text, range, spot, fallback }: {
  text: string; range: TextRange | null; spot?: boolean; fallback?: ReactNode;
}): ReactNode {
  if (!range || range.a >= text.length) return fallback ?? text;
  return (
    <>
      {text.slice(0, range.a)}
      <span className={`sa-sel-emph${spot ? " sa-sel-emph-spot" : ""}`}>{text.slice(range.a, range.b)}</span>
      {text.slice(range.b)}
    </>
  );
}
