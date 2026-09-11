// THE SLIDE BANK'S SHELF — top right above the spine. Lee (2026-09-11): "Let me CTRL X or CTRL C a
// slide and paste it in a bank. This could just be like a copy/paste field in the top right above the
// spine. I can click into this bank to access a slide I may want to return to later."
//
// A button with the count; open, it lists the banked slides newest first — what each is, a line of
// its words, and where it came from when that's another set. "Paste" drops a copy after the
// selected slide (the slide stays banked, to come back to again); ✕ takes it off the shelf. A set
// card from another set can't be pasted here and says why (slide-bank.ts pasteBlocker).
import { useEffect, useRef, useState } from "react";

import { CREAM, EDGE, GOLD, MUTED, PANEL } from "./BlastOffEditor";
import { BANK_EVENT, loadBank, pasteBlocker, removeFromBank, saveBank, type BankItem } from "./slide-bank";

const MINT = "#3BF5A0";
const RED = "#FF8B7E";

export function SlideBank({ setId, pasteLabel, onPaste }: {
  setId: string;
  /** What Paste will do right now: "Paste after slide 4", or "Paste at the end". */
  pasteLabel: string;
  onPaste: (item: BankItem) => void;
}) {
  const [items, setItems] = useState<BankItem[]>(() => loadBank());
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function reread() { setItems(loadBank()); }
    window.addEventListener(BANK_EVENT, reread);
    window.addEventListener("storage", reread);
    return () => { window.removeEventListener(BANK_EVENT, reread); window.removeEventListener("storage", reread); };
  }, []);
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const remove = (id: string) => { if (!saveBank(removeFromBank(items, id))) setErr("This browser won't store the bank."); };
  return (
    <div ref={box} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Slides you've copied (Ctrl+C) or cut (Ctrl+X), to paste back later"
        style={{ font: "inherit", fontSize: 11.5, fontWeight: 800, padding: "3px 10px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
          border: `1px solid ${items.length ? `${GOLD}88` : EDGE}`, background: items.length ? "rgba(252,163,17,0.10)" : "transparent", color: items.length ? GOLD : MUTED }}>
        🗂 Bank · {items.length} {open ? "▴" : "▾"}
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", top: "100%", right: 0, zIndex: 40, marginTop: 6, width: 340, maxHeight: "60vh", overflowY: "auto", background: PANEL, border: `1px solid ${GOLD}66`, borderRadius: 10, padding: 8, boxShadow: "0 14px 40px rgba(0,0,0,0.55)" }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, padding: "2px 4px 6px" }}>The bank · kept in this browser</div>
          {items.length === 0 && (
            <div style={{ fontSize: 12, color: MUTED, padding: "4px 4px 6px", lineHeight: 1.5 }}>Empty. Select a slide and press <b style={{ color: CREAM }}>Ctrl+C</b> to copy it here, or <b style={{ color: CREAM }}>Ctrl+X</b> to cut it here.</div>
          )}
          {items.map((it) => {
            const blocked = pasteBlocker(it, setId);
            return (
              <div key={it.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 6px", borderTop: `1px solid ${EDGE}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: CREAM }}>{it.label}{it.setId !== setId && <span style={{ fontWeight: 600, color: MUTED }}> · from {it.setName}</span>}</div>
                  {it.snippet && <div style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.snippet}</div>}
                </div>
                <button type="button" role="menuitem" disabled={!!blocked} title={blocked ?? pasteLabel} onClick={() => { onPaste(it); setOpen(false); }}
                  style={{ font: "inherit", fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 7, border: `1px solid ${blocked ? EDGE : `${MINT}88`}`, background: "transparent", color: blocked ? MUTED : MINT, cursor: blocked ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>Paste</button>
                <button type="button" title="Take it off the shelf" onClick={() => remove(it.id)}
                  style={{ font: "inherit", fontSize: 11, padding: "3px 6px", borderRadius: 7, border: `1px solid ${EDGE}`, background: "transparent", color: MUTED, cursor: "pointer" }}>✕</button>
              </div>
            );
          })}
          {items.length > 0 && <div style={{ fontSize: 10.5, color: MUTED, padding: "6px 4px 2px" }}>Paste puts a copy {pasteLabel.replace(/^Paste /, "")}; the slide stays banked.</div>}
          {err && <div style={{ fontSize: 11.5, color: RED, padding: "4px" }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
