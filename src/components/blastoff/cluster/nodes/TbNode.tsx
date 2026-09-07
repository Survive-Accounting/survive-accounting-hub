// THE TRIAL BALANCE NODE (2026-09-07) — Lee: "trial balance builder". A two-column table (Dr /
// Cr) with totals and a balanced / unbalanced tag, navy box, cream ink — the rows come resolved
// (cluster-models.trialBalanceRows: the node's own, or the T-accounts it names).
import { fmtAmount, type ResolvedView } from "../cluster-models";
import { BRAND_FONT, DISPLAY_FONT, INK } from "./theme";

type View = Extract<ResolvedView, { kind: "tb" }>;

export function TbNode({ w, h, view }: { w: number; h: number; view: View }) {
  const k = w / 700;
  const pad = Math.round(30 * k);
  const font = Math.round(30 * k), small = Math.round(20 * k);
  const amtW = Math.round(150 * k);
  const tb = view.tb;
  return (
    <div style={{ width: w, height: h, background: INK.navy, color: INK.cream, borderRadius: Math.round(16 * k), padding: pad, boxSizing: "border-box", fontFamily: BRAND_FONT, boxShadow: "0 18px 60px rgba(0,0,0,0.55)", border: `${Math.max(1, Math.round(2 * k))}px solid rgba(252,163,17,0.5)`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: Math.round(12 * k) }}>
        <div style={{ fontFamily: DISPLAY_FONT, fontSize: Math.round(40 * k), fontWeight: 800, lineHeight: 1.1 }}>{tb.title}</div>
        <span style={{ marginLeft: "auto", fontSize: small, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", padding: `${Math.round(3 * k)}px ${Math.round(10 * k)}px`, borderRadius: 999, color: "#000", background: tb.balanced ? INK.mint : INK.orange }}>{tb.balanced ? "balanced" : "unbalanced"}</span>
      </div>
      <div style={{ display: "flex", marginTop: Math.round(16 * k), paddingBottom: Math.round(6 * k), borderBottom: "1px solid rgba(245,239,230,0.25)", fontSize: small, color: INK.creamMuted, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        <span style={{ flex: 1 }}>account</span><span style={{ width: amtW, textAlign: "right" }}>Dr</span><span style={{ width: amtW, textAlign: "right" }}>Cr</span>
      </div>
      {tb.rows.map((r, i) => (
        <div key={i} style={{ display: "flex", fontSize: font, lineHeight: 1.2, padding: `${Math.round(5 * k)}px 0`, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ flex: 1, fontWeight: 600 }}>{r.account}</span>
          <span style={{ width: amtW, textAlign: "right" }}>{r.dr != null ? fmtAmount(r.dr) : ""}</span>
          <span style={{ width: amtW, textAlign: "right" }}>{r.cr != null ? fmtAmount(r.cr) : ""}</span>
        </div>
      ))}
      <div style={{ display: "flex", marginTop: "auto", paddingTop: Math.round(8 * k), borderTop: `${Math.max(1, Math.round(2 * k))}px solid rgba(245,239,230,0.45)`, fontSize: font, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: tb.balanced ? INK.mint : INK.orange }}>
        <span style={{ flex: 1, fontSize: small, letterSpacing: "0.12em", textTransform: "uppercase", alignSelf: "center" }}>totals</span>
        <span style={{ width: amtW, textAlign: "right" }}>{fmtAmount(tb.dr)}</span>
        <span style={{ width: amtW, textAlign: "right" }}>{fmtAmount(tb.cr)}</span>
      </div>
    </div>
  );
}
