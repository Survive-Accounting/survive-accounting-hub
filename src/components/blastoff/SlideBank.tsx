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
//
// FOLDED BY DEFAULT (2026-09-13, Lee: "make the bank collapsible. It's a lot right now"): one
// "▸ Bank · N" button and the blank slot, so saving never needs an unfold; the shelf opens on a
// click and the choice is remembered in this browser.
import { useEffect, useState } from "react";

import type { BoothSetInfo } from "@/lib/talkthrough.functions";

import { CREAM, EDGE, GOLD, MUTED, PANEL } from "./BlastOffEditor";
import { PhoneFrame } from "./PhoneFrame";
import { BANK_EVENT, addToBank, loadBank, pasteBlocker, removeFromBank, saveBank, type BankAdd, type BankItem } from "./slide-bank";

const MINT = "#3BF5A0";
const RED = "#FF8B7E";
const OPEN_KEY = "sa-slide-bank-open";

export function SlideBank({ setId, set, pasteLabel, onPaste, takeClip }: {
  setId: string;
  /** For the hover peek — the slide drawn the way it films (a card from another set can't draw here). */
  set: BoothSetInfo;
  /** What clicking a saved card will do right now: "Paste after slide 4", or "Paste at the end". */
  pasteLabel: string;
  onPaste: (item: BankItem) => void;
  /** The slides on the clipboard, ready to shelve — null when nothing has been copied yet. */
  takeClip: () => BankAdd[] | null;
}) {
  const [items, setItems] = useState<BankItem[]>(() => loadBank());
  const [err, setErr] = useState<string | null>(null);
  // THE PEEK (2026-09-13, Lee: "let me peek at the slides banked on hover, so I can know what it's
  // referring to"): the saved slide, drawn small under the chip, while the pointer is on it.
  const [peek, setPeek] = useState<{ id: string; x: number; y: number } | null>(null);
  // Closed on the server and on first paint; the remembered choice is read after mount.
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setOpen(localStorage.getItem(OPEN_KEY) === "1"); } catch { /* storage blocked: stays folded */ } }, []);
  const toggle = () => setOpen((v) => { const nx = !v; try { localStorage.setItem(OPEN_KEY, nx ? "1" : "0"); } catch { /* not remembered */ } return nx; });
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
      <button type="button" onClick={toggle} aria-expanded={open} title={open ? "Fold the bank" : "Show the slides saved for later — they stay here across sets, in this browser"}
        style={{ font: "inherit", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, whiteSpace: "nowrap", background: "transparent", border: `1px solid ${EDGE}`, borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}>
        {open ? "▾" : "▸"} 🗂 Bank · {items.length}
      </button>
      {open && items.map((it) => {
        const blocked = pasteBlocker(it, setId);
        return (
          <span key={it.id}
            onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPeek({ id: it.id, x: r.left + r.width / 2, y: r.bottom + 8 }); }}
            onMouseLeave={() => setPeek((p) => (p?.id === it.id ? null : p))}
            style={{ display: "inline-flex", alignItems: "stretch", border: `1px solid ${blocked ? EDGE : `${GOLD}66`}`, borderRadius: 8, background: PANEL, maxWidth: 210, opacity: blocked ? 0.55 : 1 }}>
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
      {open && peek && (() => {
        const it = items.find((x) => x.id === peek.id);
        if (!it) return null;
        const foreignCard = it.frame.kind === "ceq" && !set.ceqs.some((c) => c.id === it.frame.ceqId);
        return (
          <span aria-hidden="true" style={{ position: "fixed", left: peek.x, top: Math.min(peek.y, window.innerHeight - 340), transform: "translateX(-50%)", zIndex: 80, pointerEvents: "none", borderRadius: 8, overflow: "hidden", border: `1px solid ${GOLD}`, boxShadow: "0 14px 40px rgba(0,0,0,0.6)", background: "#000", display: "block" }}>
            {foreignCard
              ? <span style={{ display: "grid", placeItems: "center", width: 170, height: 302, padding: 12, boxSizing: "border-box", fontSize: 11.5, color: MUTED, textAlign: "center" }}>A card from another set — it only pastes there.<br /><br />{it.snippet}</span>
              : <PhoneFrame frame={it.frame} frames={[it.frame]} index={0} set={set} w={170} live={false} rounded={false} />}
          </span>
        );
      })()}
      {open && items.length === 0 && !err && <span style={{ fontSize: 10.5, color: MUTED }}>Copy a slide (Ctrl+C), then click the slot to keep it for later.</span>}
      {err && <span style={{ fontSize: 10.5, color: RED }}>{err}</span>}
    </div>
  );
}
