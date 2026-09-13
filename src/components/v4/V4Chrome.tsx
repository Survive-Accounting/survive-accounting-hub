// V4 CHROME — the step bar every topic page wears, and the small shared bits of the v4 look.
//
// Lee: "A 5-step bar per topic (Questions → Slides → Chain → Split → Film) showing the current step and
// what's left." A step marked final is ticked; the one the topic is on is lit; the rest wait. Any step
// can be opened — the bar says where the topic IS, it doesn't lock the others.
import { Link } from "@tanstack/react-router";

import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

import { V4_STEPS, V4_STEP_LABEL, type V4StateView, type V4Step } from "./v4-topic";

export const V4_MINT = "#3BF5A0";
export const V4_RED = "#FF8B7E";
export const V4_AMBER = "#F59E0B";

export function V4StepBar({ topicKey, setKey, state, current }: { topicKey: string; setKey: string; state: V4StateView | null; current: V4Step }) {
  return (
    <nav aria-label="Topic steps" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 18px" }}>
      {V4_STEPS.map((s, i) => {
        const done = !!state?.final?.[s];
        const here = state?.step === s;
        const open = current === s;
        return (
          <Link key={s} to="/v4/$topic/$set/$step" params={{ topic: topicKey, set: setKey, step: s }}
            aria-current={open ? "page" : undefined}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 999, textDecoration: "none",
              fontSize: 13, fontWeight: 800,
              border: `1.5px solid ${open ? V3_GOLD : done ? `${V4_MINT}66` : V3_EDGE}`,
              background: open ? "rgba(252,163,17,0.14)" : "transparent",
              color: open ? V3_GOLD : done ? V4_MINT : here ? V3_CREAM : V3_MUTED,
            }}>
            <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>{done ? "✓" : i + 1}</span>
            {V4_STEP_LABEL[s]}
            {here && !done && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: V3_GOLD }}>· you're here</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export const v4Button = (tone: "gold" | "ghost" | "red" = "ghost"): React.CSSProperties => ({
  font: "inherit", fontSize: 12.5, fontWeight: 800, padding: "6px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
  border: `1.5px solid ${tone === "gold" ? V3_GOLD : tone === "red" ? V4_RED : V3_EDGE}`,
  background: tone === "gold" ? "rgba(252,163,17,0.14)" : "transparent",
  color: tone === "gold" ? V3_GOLD : tone === "red" ? V4_RED : V3_CREAM,
});

export const v4Field: React.CSSProperties = {
  font: "inherit", fontSize: 13, width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8,
  border: `1px solid ${V3_EDGE}`, background: "rgba(255,255,255,0.05)", color: V3_CREAM, outline: "none",
};
