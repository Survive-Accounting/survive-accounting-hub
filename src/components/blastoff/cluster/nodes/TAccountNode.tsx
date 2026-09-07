// THE T-ACCOUNT NODE (2026-09-07) — Lee: "I need T account builder". The T itself, drawn in
// cream on the black stage: the account name across the top, the vertical rule, debit posts
// left, credit posts right, staggered down the T in posting order (ledger-model's tRows — "so
// the eye reads the story in time"), the opening in muted, the balance row bold on its own side
// under a rule (tBalanceRow). Every amount carries its label (Lee: "the amounts all have a
// label").
import { fmtAmount, type ResolvedView } from "../cluster-models";
import { BRAND_FONT, DISPLAY_FONT, INK } from "./theme";

type View = Extract<ResolvedView, { kind: "taccount" }>;

export function TAccountNode({ w, h, view }: { w: number; h: number; view: View }) {
  const k = w / 420;
  const rule = Math.max(2, Math.round(4 * k));
  const font = Math.round(30 * k), label = Math.round(18 * k), head = Math.round(38 * k);
  const rows = view.rows;
  const bal = view.balance;
  const cell = (r: { label: string; amount: number; kind: string }, muted: boolean, bold = false) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", color: muted ? INK.creamMuted : INK.cream }}>
      <span style={{ fontSize: font, fontWeight: bold ? 800 : 600, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{fmtAmount(r.amount)}</span>
      <span style={{ fontSize: label, color: INK.creamMuted, lineHeight: 1.15, maxWidth: w * 0.44, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
    </div>
  );
  return (
    <div style={{ width: w, height: h, color: INK.cream, fontFamily: BRAND_FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ fontFamily: DISPLAY_FONT, fontSize: head, fontWeight: 800, textAlign: "center", lineHeight: 1.1, paddingBottom: Math.round(10 * k) }}>{view.t.account}</div>
      <div style={{ borderTop: `${rule}px solid ${INK.cream}`, flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: rule, marginLeft: -rule / 2, background: INK.cream }} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: `${Math.round(6 * k)}px ${Math.round(14 * k)}px 0`, gridColumn: "1 / span 2", fontSize: label, letterSpacing: "0.14em", color: INK.creamMuted, fontWeight: 800 }}>
          <span>DR</span><span>CR</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ gridColumn: "1 / span 2", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ padding: `${Math.round(8 * k)}px ${Math.round(14 * k)}px`, display: "flex", justifyContent: "flex-start" }}>{r.side === "dr" && cell(r, r.kind === "opening")}</div>
            <div style={{ padding: `${Math.round(8 * k)}px ${Math.round(14 * k)}px`, display: "flex", justifyContent: "flex-end" }}>{r.side === "cr" && cell(r, r.kind === "opening")}</div>
          </div>
        ))}
        <div style={{ gridColumn: "1 / span 2", display: "grid", gridTemplateColumns: "1fr 1fr", marginTop: "auto", borderTop: `${Math.max(1, Math.round(2 * k))}px solid rgba(245,239,230,0.45)` }}>
          <div style={{ padding: `${Math.round(8 * k)}px ${Math.round(14 * k)}px`, display: "flex", justifyContent: "flex-start" }}>{bal.side === "dr" && cell(bal, false, true)}</div>
          <div style={{ padding: `${Math.round(8 * k)}px ${Math.round(14 * k)}px`, display: "flex", justifyContent: "flex-end" }}>{bal.side === "cr" && cell(bal, false, true)}</div>
        </div>
      </div>
    </div>
  );
}
