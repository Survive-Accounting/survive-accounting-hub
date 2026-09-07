// THE JOURNAL ENTRY NODE — the lab's JournalEntryExhibit, on the map (2026-09-07).
//
// The same piece-by-piece reveal (ledger-model's jePieces / pieceShown / MASK): the description,
// then each line's ACCOUNT, then its AMOUNT — anything pending prints "???". Debit lines flush
// left, credits indented, the JE / ADJ / CL badge as a chip, the totals row once every piece is
// in — balanced in mint, off in orange. A line's rubric type (A / L / E / R / X) shows as a small
// chip when the entry carries types. Navy box, cream ink — the detour family's skin.
import { pieceShown } from "@/components/canvas/exhibit-lab/ledger-model";

import { MASK, fmtAmount, type ResolvedView } from "../cluster-models";
import { BRAND_FONT, DISPLAY_FONT, INK, TYPE_COLOR } from "./theme";

type View = Extract<ResolvedView, { kind: "je" }>;

export function JeNode({ w, h, view, steps }: { w: number; h: number; view: View; steps: number }) {
  const k = w / 900;
  const pad = Math.round(36 * k);
  const font = Math.round(40 * k), small = Math.round(26 * k);
  const shown = (kind: "desc" | "account" | "amount", line: number) => pieceShown(view.pieces, steps, kind, line);
  const complete = steps >= view.pieces.length;
  const amtW = Math.round(180 * k);
  return (
    <div style={{ width: w, height: h, background: INK.navy, color: INK.cream, borderRadius: Math.round(18 * k), padding: pad, boxSizing: "border-box", fontFamily: BRAND_FONT, boxShadow: "0 18px 60px rgba(0,0,0,0.55)", border: `${Math.max(1, Math.round(2 * k))}px solid rgba(252,163,17,0.5)`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: Math.round(14 * k) }}>
        <span style={{ fontSize: small, fontWeight: 900, letterSpacing: "0.16em", padding: `${Math.round(4 * k)}px ${Math.round(12 * k)}px`, borderRadius: Math.round(8 * k), color: INK.gold, background: "rgba(252,163,17,0.14)", border: "1px solid rgba(252,163,17,0.3)" }}>{view.badge}</span>
        <span style={{ fontSize: small, color: INK.creamMuted, fontWeight: 600, letterSpacing: "0.06em" }}>{shown("desc", -1) ? "journal entry" : ""}</span>
      </div>
      <div style={{ fontFamily: DISPLAY_FONT, fontSize: Math.round(46 * k), fontWeight: 800, lineHeight: 1.1, marginTop: Math.round(18 * k), minHeight: Math.round(50 * k) }}>
        {shown("desc", -1) ? view.description : <span style={{ color: INK.creamFaint }}>{MASK}</span>}
      </div>
      <div style={{ marginTop: Math.round(22 * k), borderTop: `1px solid rgba(245,239,230,0.18)`, paddingTop: Math.round(12 * k), display: "flex", flexDirection: "column", gap: Math.round(8 * k) }}>
        <div style={{ display: "flex", fontSize: small, color: INK.creamMuted, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          <span style={{ flex: 1 }}>account</span><span style={{ width: amtW, textAlign: "right" }}>Dr</span><span style={{ width: amtW, textAlign: "right" }}>Cr</span>
        </div>
        {view.lines.map((l, i) => {
          const acct = shown("account", i), amt = shown("amount", i);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", fontSize: font, lineHeight: 1.15, paddingLeft: l.dr ? 0 : Math.round(60 * k) }}>
              <span style={{ flex: 1, display: "flex", alignItems: "center", gap: Math.round(12 * k), fontWeight: l.dr ? 700 : 500, color: acct ? INK.cream : INK.creamFaint }}>
                {acct ? l.account : MASK}
                {acct && view.typed && <span style={{ fontSize: Math.round(22 * k), fontWeight: 900, padding: `${Math.round(2 * k)}px ${Math.round(9 * k)}px`, borderRadius: Math.round(6 * k), background: TYPE_COLOR[l.type], color: "#fff", lineHeight: 1.2 }}>{l.type}</span>}
              </span>
              <span style={{ width: amtW, textAlign: "right", fontVariantNumeric: "tabular-nums", color: l.dr ? (amt ? INK.cream : INK.creamFaint) : "transparent" }}>{l.dr ? (amt ? fmtAmount(l.amount) : MASK) : "·"}</span>
              <span style={{ width: amtW, textAlign: "right", fontVariantNumeric: "tabular-nums", color: !l.dr ? (amt ? INK.cream : INK.creamFaint) : "transparent" }}>{!l.dr ? (amt ? fmtAmount(l.amount) : MASK) : "·"}</span>
            </div>
          );
        })}
        {complete && (
          <div className="sa-map-rise" style={{ display: "flex", alignItems: "center", marginTop: Math.round(8 * k), paddingTop: Math.round(10 * k), borderTop: `${Math.max(1, Math.round(2 * k))}px solid rgba(245,239,230,0.35)`, fontSize: font, fontWeight: 800, color: view.totals.balanced ? INK.mint : INK.orange }}>
            <span style={{ flex: 1, fontSize: small, letterSpacing: "0.12em", textTransform: "uppercase" }}>{view.totals.balanced ? "balanced" : "does not balance"}</span>
            <span style={{ width: amtW, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtAmount(view.totals.dr)}</span>
            <span style={{ width: amtW, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtAmount(view.totals.cr)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
