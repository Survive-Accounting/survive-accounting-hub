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
//
// ...AND THEY CROSS THE WINDOW (2026-09-08). Lee: "highlights on text when in popped out need
// to persist. I'll pre-highlight things before filming sometimes." The 9:16 pop-out is a
// SEPARATE WINDOW with its own React tree, so a highlight made while setting up in the main
// window simply did not exist in the window that films — the prep was invisible in the take.
// Pass a set id to `useTextHighlights` and the store mirrors itself through localStorage the
// way the teleprompter sync does (blastoff/capture/prompter-sync.ts): one record per set,
// written on every change, adopted from the cross-window `storage` event. Still not saved to
// anything — this is session state that happens to outlive one window, not question data, and
// the backtick wipe clears it in BOTH windows because clearing writes an empty record.
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

// ---- the shared record, so the pop-out films what the main window highlighted ----

export const HIGHLIGHTS_KEY = "sa-film-highlights";

/** One set's highlights, flat and JSON-safe. Keyed by set so opening a different deck never
 *  inherits the last one's marks. */
export interface HighlightSnapshot {
  setId: string;
  stem: Record<string, TextRange>;
  choice: Record<string, TextRange>;
  memo: Record<string, TextRange>;
}

type HlMaps = { stem: Map<string, TextRange>; choice: Map<string, TextRange>; memo: Map<string, TextRange> };

// Function declarations, not arrow consts: this module is on the canvas render path and the
// TDZ ratchet (canvas/tdz-graph.test.ts) holds everything there to hoisted callables.
function objOf(m: Map<string, TextRange>): Record<string, TextRange> {
  return Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Maps → the record. The keys are SORTED so two identical states serialise identically —
 *  the whole cross-window loop is "did this string change?", and Map insertion order would
 *  otherwise make an unchanged state look new and bounce writes back and forth forever. */
export function highlightSnapshot(setId: string, m: HlMaps): HighlightSnapshot {
  return { setId, stem: objOf(m.stem), choice: objOf(m.choice), memo: objOf(m.memo) };
}

function mapOf(o: Record<string, TextRange> | undefined): Map<string, TextRange> {
  return new Map(Object.entries(o ?? {}).filter(([, r]) => r && typeof r.a === "number" && typeof r.b === "number"));
}

/** The record → maps, tolerant of anything malformed (an old or hand-edited record must not
 *  take the filming surface down mid-take). */
export function highlightMaps(snap: HighlightSnapshot): HlMaps {
  return { stem: mapOf(snap.stem), choice: mapOf(snap.choice), memo: mapOf(snap.memo) };
}

export function readHighlights(): HighlightSnapshot | null {
  try {
    const v = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) ?? "null") as HighlightSnapshot | null;
    return v && typeof v === "object" && typeof v.setId === "string" ? v : null;
  } catch { return null; }
}

/** False when storage is unavailable — the highlight still works in this window, it just does
 *  not reach the other one. Never throws into a take. */
export function writeHighlights(snap: HighlightSnapshot): boolean {
  try { localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(snap)); return true; } catch { return false; }
}

/** The store. One per filming surface — the previewer owns one, /blast-off owns
 *  one. `clearAll` is what the backtick calls.
 *
 *  `persistFor` is the set id: given one, this store mirrors itself to every other window
 *  filming the same set. Omitted (the canvas previewer), the behaviour is exactly what it
 *  always was — in-memory, this window only. */
export function useTextHighlights(persistFor?: string | null): { api: HighlightApi; clearAll: () => void } {
  const [stemHls, setStemHls] = useState<Map<string, TextRange>>(() => new Map());
  const [choiceHls, setChoiceHls] = useState<Map<string, TextRange>>(() => new Map());
  const [memoHls, setMemoHls] = useState<Map<string, TextRange>>(() => new Map());

  const clearAll = useCallback(() => {
    setStemHls((m) => (m.size ? new Map() : m));
    setChoiceHls((m) => (m.size ? new Map() : m));
    setMemoHls((m) => (m.size ? new Map() : m));
  }, []);

  // THE MIRROR. `seen` is the last record this window wrote OR adopted; `adopting` holds the
  // record we have just taken from the other window but whose state has not committed yet.
  // Both effects run on the same commit, so without `adopting` the publish below would fire
  // once with the pre-adoption (usually empty) state and clobber what it had just read.
  const seen = useRef<string>("");
  const adopting = useRef<string | null>(null);

  useEffect(() => {
    if (!persistFor) return;
    const adopt = () => {
      const snap = readHighlights();
      if (!snap || snap.setId !== persistFor) return;
      const s = JSON.stringify(snap);
      if (s === seen.current) return;
      seen.current = s;
      adopting.current = s;
      const m = highlightMaps(snap);
      setStemHls(m.stem);
      setChoiceHls(m.choice);
      setMemoHls(m.memo);
    };
    adopt();
    window.addEventListener("storage", adopt);
    return () => window.removeEventListener("storage", adopt);
  }, [persistFor]);

  useEffect(() => {
    if (!persistFor) return;
    const s = JSON.stringify(highlightSnapshot(persistFor, { stem: stemHls, choice: choiceHls, memo: memoHls }));
    if (adopting.current !== null) {
      // Still catching up to what we read. When the state matches it, we are level again.
      if (s === adopting.current) { adopting.current = null; seen.current = s; }
      return;
    }
    if (s === seen.current) return;
    seen.current = s;
    writeHighlights(JSON.parse(s) as HighlightSnapshot);
  }, [persistFor, stemHls, choiceHls, memoHls]);

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
 *  amber; when the memo is spotlit it also grows a touch, so it reads as
 *  "spotlighted". Injected by whichever surface renders highlights.
 *
 *  PAINT ONLY (polish pass, 2026-09-05). The rule used to set font-weight 900 and
 *  padding 0 2px. On the take that REFLOWED the slide: a choice at weight 600 jumped
 *  to 800 and rewrapped, and 4 px of inline advance per run moved line breaks — the
 *  slide dimensions changed under the camera. Now only paint properties: background,
 *  colour, radius, and the 2 px inset faked with a box-shadow (which never takes
 *  layout). text-highlights.test.ts pins that no layout property comes back. */
export const SEL_EMPH_CSS = `
.sa-sel-emph { background: rgba(252,163,17,0.92); color: #0B0F1E; border-radius: 3px; box-shadow: 0 0 0 2px rgba(252,163,17,0.92); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
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

/** THE WORD UNDER THE POINTER (Lee, 2026-09-03: "maybe shift + click should
 *  be highlight"). Finds the caret at (x, y) inside `el`, widens it to the
 *  word around it, and returns that word as character offsets into `el`'s
 *  text — the same shape a drag-select produces. Null off a word. */
export function wordRangeAtPoint(el: HTMLElement | null, x: number, y: number): TextRange | null {
  const doc = el?.ownerDocument;
  if (!el || !doc) return null;
  let node: Node | null = null;
  let offset = 0;
  const d = doc as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; offset = r.startOffset; } }
  else if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; offset = p.offset; } }
  if (!node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return null;
  const text = node.textContent ?? "";
  const isWord = (ch: string) => /[\p{L}\p{N}'’$%.,-]/u.test(ch);
  let a = Math.min(offset, text.length), b = a;
  while (a > 0 && isWord(text[a - 1])) a--;
  while (b < text.length && isWord(text[b])) b++;
  // trim punctuation off the edges
  while (a < b && /[.,'’-]/.test(text[a])) a++;
  while (b > a && /[.,'’-]/.test(text[b - 1])) b--;
  if (b <= a) return null;
  const pre = doc.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(node, a);
  const start = pre.toString().length;
  return { a: start, b: start + (b - a) };
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
