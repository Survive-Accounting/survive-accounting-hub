// A DOOR — the big button every V3 menu screen is made of.
//
// Lee's spec (2026-09-01): "Make these kind of big buttons." Big enough to hit
// without aiming, and honest about being closed: a door that leads nowhere yet
// renders visibly disabled rather than being hidden, because seeing the shape
// of what is coming is the point.
//
// Shared by "What are you making?" (Blast Off · Practice · Review) and "Which
// step are you on?" (Talkthrough · Arrange · Film).
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "./Shell";

export function Door({ icon: Icon, title, blurb, to, soon, kicker }: {
  icon: LucideIcon; title: string; blurb: string; to?: string; soon?: boolean;
  /** A small gold line above the title — "STEP 1", a status. */
  kicker?: string;
}) {
  const body = (
    <>
      {kicker && (
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: soon ? V3_MUTED : V3_GOLD, marginBottom: 10 }}>
          {kicker}
        </span>
      )}
      <Icon style={{ width: 30, height: 30, color: soon ? V3_MUTED : V3_GOLD }} />
      <span style={{ fontFamily: V3_DISPLAY, fontSize: 21, fontWeight: 900, marginTop: 12, color: soon ? V3_MUTED : V3_CREAM }}>
        {title}
      </span>
      <span style={{ fontSize: 12.5, color: V3_MUTED, marginTop: 6, lineHeight: 1.4 }}>{blurb}</span>
      {soon && (
        <span style={{ marginTop: 10, fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: V3_MUTED, border: `1px solid ${V3_EDGE}`, borderRadius: 5, padding: "2px 7px" }}>
          later
        </span>
      )}
    </>
  );

  const box: CSSProperties = {
    width: 250, minHeight: 190,
    display: "flex", flexDirection: "column", alignItems: "flex-start",
    border: `1.5px solid ${soon ? V3_EDGE : "rgba(252,163,17,0.55)"}`,
    borderRadius: 18, padding: "22px 20px",
    textAlign: "left", textDecoration: "none",
    background: soon ? "transparent" : "rgba(252,163,17,0.06)",
    opacity: soon ? 0.55 : 1,
    cursor: soon ? "not-allowed" : "pointer",
  };

  if (soon || !to) {
    return <div style={box} aria-disabled>{body}</div>;
  }
  return <Link to={to} style={box} className="transition-colors hover:bg-white/5">{body}</Link>;
}
