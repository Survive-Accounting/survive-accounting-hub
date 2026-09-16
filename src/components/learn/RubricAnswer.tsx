// THE INTERACTIVE RUBRIC — the A = L + E boxes a student answers ON (2026-09-16).
//
// Lee (the student-flow wireframes): "Tap arrows until it feels right, then Next. Revenue and Expenses sit under
// Equity: tap Revenue ↑ and Equity ↑ lights on its own (faded, so they see the flow); Expenses ↑ lights Equity ↓.
// No numbers to type — there's one amount and it's on the arrows already."
//
// The same click cycle as Lee's own rubric slide (blastoff/rubric.ts ARROW_CYCLE: blank → ↑ → ↓ → ↑↓ → NE →
// blank), the same colours (↑ amber, ↓ sky), the equity effect derived by learn-bonus's equityEffect. Read-only,
// it is the bonus tab's memorize view (arrows only, no amount).
import { useMemo } from "react";

import { ARROW_CYCLE, type RubricArrow, type RubricArrows, type RubricKey } from "@/components/blastoff/rubric";
import { boxState, equityEffect, type BoxState } from "@/lib/learn-bonus";

const INK = "#F2EFE6", MUTED = "#93A0B4", EDGE = "rgba(148,180,255,0.22)", UP = "#FCA311", DOWN = "#7DD3FC";
const DISPLAY = "'League Spartan', 'Rubik', system-ui, sans-serif";

function nextOf(cur: readonly RubricArrow[]): RubricArrow[] {
  const same = (a: readonly RubricArrow[], b: readonly RubricArrow[]) => a.length === b.length && a.every((d) => b.includes(d));
  const i = ARROW_CYCLE.findIndex((s) => same(s, cur));
  return [...ARROW_CYCLE[(i + 1) % ARROW_CYCLE.length]];
}

const fmtAmount = (n: number) => `$${n.toLocaleString("en-US")}`;

function Glyphs({ state, amount, faded }: { state: BoxState; amount?: number; faded?: boolean }) {
  if (!state) return <span style={{ color: MUTED, fontSize: 18, lineHeight: 1 }}>—</span>;
  const amt = amount && amount > 0 ? <span style={{ fontSize: 12.5, fontWeight: 700, marginLeft: 4, color: INK }}>{fmtAmount(amount)}</span> : null;
  const arrow = (d: "up" | "down") => <span style={{ color: d === "up" ? UP : DOWN, fontSize: 22, lineHeight: 1, fontWeight: 900 }}>{d === "up" ? "↑" : "↓"}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", justifyContent: "center", gap: 2, opacity: faded ? 0.45 : 1, flexWrap: "wrap" }}>
      {state === "up" && <>{arrow("up")}{amt}</>}
      {state === "down" && <>{arrow("down")}{amt}</>}
      {state === "both" && <>{arrow("up")}{arrow("down")}{amount && amount > 0 ? <span style={{ fontSize: 11, color: MUTED, marginLeft: 4 }}>no net effect</span> : null}</>}
    </span>
  );
}

export function RubricAnswer({ value, onChange, amount, readOnly = false, compact = false }: {
  value: RubricArrows;
  onChange?: (next: RubricArrows) => void;
  /** Shown on every arrow when set — the one amount there is. Absent on the bonus (arrows only). */
  amount?: number;
  readOnly?: boolean;
  /** Tighter boxes — inside a bonus row. */
  compact?: boolean;
}) {
  const derivedE = useMemo(() => (boxState(value.E) ? "" : equityEffect(value)), [value]);
  const tap = (k: RubricKey) => {
    if (readOnly || !onChange) return;
    onChange({ ...value, [k]: nextOf(value[k]) });
  };
  const box = (k: RubricKey, label: string, sub = false) => {
    const own = boxState(value[k]);
    const state: BoxState = own || (k === "E" ? derivedE : "");
    const faded = k === "E" && !own && !!derivedE;
    const lit = !!own;
    return (
      <button
        key={k} type="button" onClick={() => tap(k)} disabled={readOnly} aria-label={`${label}: ${state || "no arrow"}${faded ? " (from revenue or expenses)" : ""}`}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sub ? 2 : 4,
          minHeight: compact ? (sub ? 44 : 54) : (sub ? 52 : 68), padding: sub ? "4px 6px" : "6px 8px", borderRadius: 10, cursor: readOnly ? "default" : "pointer",
          background: lit ? "rgba(252,163,17,0.10)" : "rgba(255,255,255,0.04)", border: `1.5px solid ${lit ? "rgba(252,163,17,0.7)" : sub ? "rgba(148,180,255,0.14)" : EDGE}`,
          borderStyle: sub ? "dashed" : "solid", color: INK, fontFamily: DISPLAY, fontWeight: 800, fontSize: sub ? 13 : compact ? 15 : 17, transition: "background 120ms, border-color 120ms",
        }}
      >
        <span style={{ letterSpacing: "0.02em" }}>{label}</span>
        <Glyphs state={state} amount={amount} faded={faded} />
      </button>
    );
  };
  const sign = (s: string) => <span aria-hidden style={{ color: MUTED, fontFamily: DISPLAY, fontWeight: 900, fontSize: compact ? 16 : 20, textAlign: "center" }}>{s}</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", columnGap: compact ? 5 : 7, rowGap: 6, alignItems: "center" }}>
      {box("A", "A")}{sign("=")}{box("L", "L")}{sign("+")}{box("E", "E")}
      {/* Rev and Exp hang under E — Lee's L-shaped rubric. */}
      <span /><span /><span /><span />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
        {box("Rev", "Rev", true)}{box("Exp", "Exp", true)}
      </div>
    </div>
  );
}
