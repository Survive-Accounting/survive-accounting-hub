// THE NOTE NODE (2026-09-07) — a short cream note on the field: a label, an aside, in Rubik.
import type { ResolvedView } from "../cluster-models";
import { BRAND_FONT, INK } from "./theme";

type View = Extract<ResolvedView, { kind: "note" }>;

export function NoteNode({ w, h, view }: { w: number; h: number; view: View }) {
  const font = Math.max(18, Math.round(Math.min(w * 0.075, h * 0.3)));
  return (
    <div style={{ width: w, height: h, background: INK.paper, color: INK.navyInk, borderRadius: Math.round(w * 0.03), padding: Math.round(w * 0.06), boxSizing: "border-box", fontFamily: BRAND_FONT, fontSize: font, fontWeight: 600, lineHeight: 1.25, display: "flex", alignItems: "center", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", overflow: "hidden" }}>
      {view.text}
    </div>
  );
}
