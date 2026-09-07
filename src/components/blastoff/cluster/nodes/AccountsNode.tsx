// THE ACCOUNTS NODE — the ledger paper (polish: Lee films this today, 2026-09-07).
//
// Lee: "What type of account is ______. This is simple, I'll just need a summary of each
// account type and all the accounts within each type. Preferably where I can progressive reveal
// it with space bar. shift space to go back." So: cream paper with ruled lines and a red margin
// rule, navy ink; each group a heading (the label, its normal-side tag, Lee's one-word anchor)
// then its accounts one per rule. Reveal by group or by account (`revealBy`, `steps` from the
// shot) — an unrevealed row is a faint rule only: the paper is there, the ink isn't, and the
// words are not in the DOM until they are revealed (a screen capture can't leak them).
//
// This is also THE LIST SLIDE: a one-node map with this look never reads as a callout.
import type { ResolvedView } from "../cluster-models";
import { BRAND_FONT, DISPLAY_FONT, INK } from "./theme";

type View = Extract<ResolvedView, { kind: "accounts" }>;

type Row = { kind: "heading"; label: string; normal?: "dr" | "cr"; note?: string; shown: boolean } | { kind: "account"; label: string; shown: boolean } | { kind: "gap" };

/** The rows on the paper, each with whether its ink is revealed at `steps`. */
export function accountRows(view: View, steps: number): Row[] {
  const rows: Row[] = [];
  let seenAccounts = 0;
  view.groups.forEach((g, gi) => {
    if (gi > 0) rows.push({ kind: "gap" });
    const groupShown = view.revealBy === "group" ? gi < steps : seenAccounts < steps;
    rows.push({ kind: "heading", label: g.label, normal: g.normal, note: g.note, shown: groupShown });
    for (const a of g.accounts) {
      const shown = view.revealBy === "group" ? gi < steps : seenAccounts < steps;
      rows.push({ kind: "account", label: a, shown });
      seenAccounts++;
    }
  });
  return rows;
}

export function AccountsNode({ w, h, view, steps }: { w: number; h: number; view: View; steps: number }) {
  const rows = accountRows(view, steps);
  const pad = Math.round(w * 0.05);
  const margin = Math.round(w * 0.1);
  // Every row fits: the rule pitch comes from the height and the row count (a gap is half a row).
  const units = rows.reduce((n, r) => n + (r.kind === "gap" ? 0.5 : 1), 0) + 1;
  const pitch = Math.max(24, Math.min(Math.round(w * 0.085), Math.floor((h - pad * 2) / units)));
  const font = Math.round(pitch * 0.58), head = Math.round(pitch * 0.66);
  return (
    <div style={{ width: w, height: h, background: INK.paper, color: INK.navyInk, borderRadius: Math.round(w * 0.018), position: "relative", overflow: "hidden", boxShadow: "0 18px 60px rgba(0,0,0,0.55)", fontFamily: BRAND_FONT,
      // The ruled lines: one per pitch, from the top pad down.
      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${pitch - 1}px, ${INK.paperRule} ${pitch - 1}px, ${INK.paperRule} ${pitch}px)`, backgroundPosition: `0 ${pad}px`, backgroundSize: `100% ${pitch}px` }}>
      {/* the red margin rule */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: margin, width: Math.max(2, Math.round(w * 0.004)), background: INK.paperMargin }} />
      {/* the double head rule */}
      <div style={{ position: "absolute", left: 0, right: 0, top: pad - 2, height: 0, borderTop: `${Math.max(2, Math.round(w * 0.004))}px solid ${INK.navyMuted}`, boxShadow: `0 ${Math.max(3, Math.round(w * 0.007))}px 0 -1px ${INK.navyMuted}` }} />
      <div style={{ position: "absolute", left: margin + Math.round(w * 0.03), right: pad, top: pad }}>
        {rows.map((r, i) => {
          if (r.kind === "gap") return <div key={i} style={{ height: pitch / 2 }} />;
          if (!r.shown) return <div key={i} style={{ height: pitch }} />;
          if (r.kind === "heading") return (
            <div key={i} className="sa-map-rise" style={{ height: pitch, display: "flex", alignItems: "center", gap: Math.round(pitch * 0.4) }}>
              <span style={{ fontFamily: DISPLAY_FONT, fontSize: head, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1 }}>{r.label}</span>
              {r.normal && <span style={{ fontSize: Math.round(font * 0.62), fontWeight: 800, letterSpacing: "0.14em", padding: `${Math.round(font * 0.1)}px ${Math.round(font * 0.35)}px`, borderRadius: 999, color: INK.paper, background: r.normal === "dr" ? "#1F9D57" : "#C77D0A", lineHeight: 1.2 }}>{r.normal === "dr" ? "DR" : "CR"}</span>}
              {r.note && <span style={{ marginLeft: "auto", fontFamily: DISPLAY_FONT, fontSize: Math.round(head * 0.8), fontWeight: 800, color: INK.red, letterSpacing: "0.06em" }}>{r.note}</span>}
            </div>
          );
          return (
            <div key={i} className="sa-map-rise" style={{ height: pitch, display: "flex", alignItems: "center", fontSize: font, fontWeight: 500, lineHeight: 1, paddingLeft: Math.round(pitch * 0.5) }}>{r.label}</div>
          );
        })}
      </div>
    </div>
  );
}
