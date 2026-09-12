// THE SLIDE BANK — a shelf with a blank slot, above the spine.
//
// Lee, 2026-09-12, on the first version (a count-button that opened a dropdown, filled silently by
// Ctrl+C): "the bank you have doesn't make sense. I want to just have a blank bank I can click,
// paste into, and then the slide is saved for future use."
//
// So it is a shelf, and it is visible: one card per saved slide, then a blank slot. Copy a slide
// (Ctrl+C / Ctrl+X, which only ever fill the clipboard now — nothing is banked behind his back),
// click the blank slot, and it is saved for good. Click a saved card to drop it back into the
// running order; ✕ takes it off the shelf.
//
// It lives in this browser (localStorage, slide-bank.ts) and never in the plan, so it cannot race
// the autosave — and it reaches across sets, which is the point: a slide built here is a slide he
// can use in any video later. A set card is the one exception (it belongs to its own set's bank).
import { useEffect, useState } from "react";

import { CREAM, EDGE, GOLD, MUTED, PANEL } from "./BlastOffEditor";
import { BANK_EVENT, addToBank, loadBank, pasteBlocker, removeFromBank, saveBank, type BankAdd, type BankItem } from "./slide-bank";

const MINT = "#3BF5A0";
const RED = "#FF8B7E";

export function SlideBank({ setId, pasteLabel, onPaste, takeClip }: {
  setId: string;
  /** What clicking a saved card will do right now: "Paste after slide 4", or "Paste at the end". */
  pasteLabel: string;
  onPaste: (item: BankItem) => void;
  /** The slides on the clipboard, ready to shelve — null when nothing has been copied yet. */
  takeClip: () => BankAdd[] | null;
}) {
  const [items, setItems] = useState<BankItem[]>(() => loadBank());
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    function reread() { setItems(loadBank()); }
    window.addEventListener(BANK_EVENT, reread);
    window.addEventListener("storage", reread);
    return () => { window.removeEventListener(BANK_EVENT, reread); window.removeEventListener("storage", reread); };
  }, []);
  const save = () => {
    const adds = takeClip();
    if (!adds?.length) { setErr("Copy a slide first — click it and press Ctrl+C."); window.setTimeout(() => setErr(null), 4000); return; }
    if (!saveBank(addToBank(loadBank(), adds))) { setErr("This browser won't store the bank."); return; }
    setErr(null);
  };
  const remove = (id: string) => { if (!saveBank(removeFromBank(items, id))) setErr("This browser won't store the bank."); };

  return (
    <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", padding: "4px 0 6px" }}>
      <span title="Slides saved for later — they stay here across sets, in this browser" style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, whiteSpace: "nowrap" }}>🗂 Bank</span>
      {items.map((it) => {
        const blocked = pasteBlocker(it, setId);
        return (
          <span key={it.id} style={{ display: "inline-flex", alignItems: "stretch", border: `1px solid ${blocked ? EDGE : `${GOLD}66`}`, borderRadius: 8, background: PANEL, maxWidth: 210, opacity: blocked ? 0.55 : 1 }}>
            <button type="button" disabled={!!blocked} title={blocked ?? `${pasteLabel} — the slide stays in the bank`} onClick={() => onPaste(it)}
              style={{ font: "inherit", textAlign: "left", minWidth: 0, padding: "4px 8px", background: "transparent", border: "none", borderRadius: 8, cursor: blocked ? "not-allowed" : "pointer", color: CREAM }}>
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap" }}>{it.label}</span>
              {it.snippet && <span style={{ display: "block", fontSize: 10, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.snippet}</span>}
            </button>
            <button type="button" title="Take it off the shelf" onClick={() => remove(it.id)}
              style={{ font: "inherit", fontSize: 10, padding: "0 6px", background: "transparent", border: "none", borderLeft: `1px solid ${EDGE}`, color: MUTED, cursor: "pointer" }}>✕</button>
          </span>
        );
      })}
      {/* THE BLANK SLOT — the whole point. Click it and whatever you last copied is saved here. */}
      <button type="button" onClick={save} title="Click to save the slide you last copied (Ctrl+C) for later"
        style={{ font: "inherit", fontSize: 10.5, fontWeight: 800, padding: "6px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
          border: `1px dashed ${MINT}77`, background: "rgba(59,245,160,0.06)", color: MINT }}>
        ＋ paste here
      </button>
      {items.length === 0 && !err && <span style={{ fontSize: 10.5, color: MUTED }}>Copy a slide (Ctrl+C), then click the slot to keep it for later.</span>}
      {err && <span style={{ fontSize: 10.5, color: RED }}>{err}</span>}
    </div>
  );
}
