// LAYOUT MODE — a temporary A/B so Lee can feel both disclosure styles before we commit.
//
// ACCORDION: the campus opens in place beneath its row; the list keeps its position and
//            nested things (chapter, professor) open inside their own parent.
// SHEET:     the campus rises from the bottom over the list, near-full height; nested
//            things stack another sheet on top, with a back path.
//
// Stored in localStorage so it survives a reload, and read through a hook so both the
// switch and every consumer stay in sync. DELETE THIS FILE (and the switch in the header)
// once the decision is made — it is scaffolding, not architecture.
import { useCallback, useEffect, useState } from "react";

export type LayoutMode = "accordion" | "sheet";
const KEY = "sa-growth-layout";
const EVENT = "sa-growth-layout-change";

export function readLayoutMode(): LayoutMode {
  if (typeof window === "undefined") return "accordion";
  return localStorage.getItem(KEY) === "sheet" ? "sheet" : "accordion";
}

/** Current mode + a setter. Every consumer re-renders when either one changes it,
 *  including across components, via a window event (storage events don't fire
 *  in the tab that wrote them). */
export function useLayoutMode(): [LayoutMode, (m: LayoutMode) => void] {
  const [mode, setMode] = useState<LayoutMode>("accordion");

  useEffect(() => {
    setMode(readLayoutMode()); // after hydration — localStorage is not available on the server
    const onChange = () => setMode(readLayoutMode());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const set = useCallback((m: LayoutMode) => {
    localStorage.setItem(KEY, m);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [mode, set];
}
