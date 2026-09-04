// CALLOUT (P1) — the standardized reading card: what a student reads in their
// head as a take opens, and what Lee recaps with. It IS the zero-choice (note)
// frame's face in the previewer/film — CeqPreviewNode renders CalloutBody when
// a card has no choices — and the /callout-demo route renders it standalone.
//
// Content model (CalloutSettings on the card, additive scene JSON):
//   showTopic     — topic kicker on/off (default on)
//   extraStems    — secondary stems: indented, smaller, grayed bullets
//   bolt          — boiling bolt on the left (off by default)
//   kind          — the type banner; unset = plain callout
//   memoIds       — dropped memos; 1 renders as a styled memo callout, 2+
//                   renders the "Highlights from this set" stack (Lookback)
//
// Film law: this file is PRESENTATION ONLY. All authoring affordances live in
// CeqPreviewNode behind the film gate — nothing here captures keys or drags.
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { renderInline } from "../inline-md";
import { PAPER } from "../theme";
import type { CalloutKind } from "../types";

/** The five callout types — each a small on-brand badge/accent, none loud. */
export const CALLOUT_KINDS: Record<CalloutKind, { label: string; accent: string; tint: string }> = {
  "cheat-code": { label: "CHEAT CODE", accent: "#1F9D57", tint: "rgba(31,157,87,0.10)" },
  "memorize-this": { label: "MEMORIZE THIS", accent: "#C77D0A", tint: "rgba(199,125,10,0.10)" },
  "deeper-idea": { label: "DEEPER IDEA", accent: "#1D7FA8", tint: "rgba(29,127,168,0.10)" },
  recap: { label: "RECAP", accent: "#6D5BB8", tint: "rgba(109,91,184,0.10)" },
  distractor: { label: "DISTRACTOR", accent: "#C22B45", tint: "rgba(194,43,69,0.10)" },
};

/** Default kind when a memo is dropped, from its library category. */
export function calloutKindForCategory(category?: string): CalloutKind {
  const c = (category ?? "").toUpperCase();
  if (c.includes("CHEAT")) return "cheat-code";
  if (c.includes("STEP")) return "memorize-this";
  if (c.includes("TRAP")) return "distractor";
  if (c.includes("TIP")) return "deeper-idea";
  return "recap";
}

/** The kind-cycler control order: none → the five kinds → none. */
export function nextCalloutKind(k?: CalloutKind): CalloutKind | undefined {
  const order = Object.keys(CALLOUT_KINDS) as CalloutKind[];
  if (!k) return order[0];
  const i = order.indexOf(k);
  return i < 0 || i === order.length - 1 ? undefined : order[i + 1];
}

export interface CalloutBodyProps {
  scale: number;
  /** Already-resolved topic text; null/undefined = no kicker. */
  topic?: string | null;
  stem: string;
  extraStems?: string[];
  kind?: CalloutKind;
  /** Dropped-memo labels; 1 = single memo callout, 2+ = highlights stack. */
  highlights?: string[];
  bolt?: boolean;
  /** Authoring-only inline edit hook for an extra-stem bullet (never in film). */
  onEditBullet?: (idx: number) => void;
  /** THE DETOUR LOOK (CalloutSettings.detour): gold label, cream ink, the
   *  ==key phrase== highlighted gold-on-navy. The shell paints the navy;
   *  this only changes the ink. */
  dark?: boolean;
}

/** Detour palette — brand gold on brand navy, cream ink. */
const DETOUR = {
  gold: "#FCA311",
  ink: "#F5EFE6",
  inkMuted: "rgba(245,239,230,0.62)",
  labelBg: "rgba(252,163,17,0.14)",
  hl: { bg: "#FCA311", color: "#14213D" },
} as const;

/** The detour card's accent per kind, on navy. Gold is the default (cheat
 *  code, and anything without a kind). Used by the label, the highlight and
 *  the card's edge, so a memorize-this reads orange edge to edge. */
export function detourAccent(kind?: CalloutKind): string {
  if (kind === "memorize-this") return "#FF9F43";
  if (kind === "deeper-idea") return "#7DD3FC";
  return DETOUR.gold;
}

/** The callout's face — cream card interior, navy text, orange corner accent.
 *  Rendered INSIDE the existing card shell (which owns width/drag/scale). */
export function CalloutBody({ scale: s, topic, stem, extraStems = [], kind, highlights = [], bolt, onEditBullet, dark = false }: CalloutBodyProps) {
  const stack = highlights.length > 1;
  const kindMeta = stack ? { label: "HIGHLIGHTS FROM THIS SET", accent: "#C77D0A", tint: "rgba(199,125,10,0.08)" } : kind ? CALLOUT_KINDS[kind] : null;
  // On the dark card each kind keeps its own colour (Lee, 2026-09-03: "make
  // the cheat code stay the same, but deeper idea, memorize this are different
  // colors"): cheat code stays brand gold; memorize this is orange; deeper
  // idea is sky. The paper accents were chosen for cream and go muddy on
  // navy, so these are the on-navy versions.
  const darkAccent = detourAccent(kind);
  const meta = kindMeta && dark ? { label: kindMeta.label, accent: darkAccent, tint: `${darkAccent}24` } : kindMeta;
  const ink = dark ? DETOUR.ink : PAPER.ink;
  const inkMuted = dark ? DETOUR.inkMuted : PAPER.inkMuted;
  const hl = dark ? { bg: darkAccent, color: "#14213D" } : undefined;
  const mainText = highlights.length === 1 ? highlights[0] : stem;
  return (
    <div style={{ position: "relative" }}>
      {/* the little orange corner accent — the callout's signature, kept */}
      <span aria-hidden style={{ position: "absolute", top: -16 * s, right: -16 * s, width: 26 * s, height: 26 * s, background: "#FCA311", clipPath: "polygon(100% 0, 0 0, 100% 100%)", borderTopRightRadius: 13 * s, opacity: 0.9 }} />
      {meta && !dark && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 * s, marginBottom: 8 * s, padding: `${2 * s}px ${8 * s}px`, borderRadius: 6 * s, fontSize: 10.5 * s, fontWeight: 900, letterSpacing: "0.12em", color: meta.accent, background: meta.tint, border: `1px solid ${meta.accent}44` }}>
          {meta.label}
        </div>
      )}
      {meta && dark && (
        // THE DETOUR MOMENT (Lee, 2026-09-03): "more eye catching than the navy
        // on navy … big labels … very scannable … a subtle flashing animation
        // on the chip/title, like a neon sign … the boiling bolt needs to make
        // an appearance … make it a real moment anytime we have a detour
        // slide". The boiling bolt sits top-left; the kind's name rides over
        // it, big, in the kind's colour, breathing like a neon tube
        // (.sa-neon-label in PV_CSS; motion only under .film-mode).
        <div style={{ display: "flex", alignItems: "center", gap: 10 * s, marginBottom: 12 * s, position: "relative" }}>
          <BoltBoil height={34 * s} style={{ flex: "0 0 auto", filter: `drop-shadow(0 0 ${8 * s}px ${meta.accent}66)` }} />
          <span className="sa-neon-label" style={{ ["--neon" as string]: meta.accent, fontSize: 15 * s, fontWeight: 900, letterSpacing: "0.24em", textTransform: "uppercase", color: meta.accent, lineHeight: 1, textShadow: `0 0 ${6 * s}px ${meta.accent}AA, 0 0 ${18 * s}px ${meta.accent}55` }}>
            {meta.label}
          </span>
        </div>
      )}
      {topic && <div style={{ fontSize: 12 * s, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: inkMuted, marginBottom: 6 * s }}>{topic}</div>}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 * s }}>
        {/* (bolt retired 08-15 — the standalone Bolt element replaced it; the
            data field stays readable, nothing renders it here) */}
        <div style={{ minWidth: 0 }}>
          {stack ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 * s }}>
              {highlights.map((h, i) => (
                <li key={i} style={{ display: "flex", gap: 8 * s, alignItems: "baseline", fontSize: 17 * s, fontWeight: 700, lineHeight: 1.3, color: ink }}>
                  <span style={{ color: "#FCA311", fontWeight: 900 }}>•</span>
                  <span>{renderInline(h, hl)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div style={{ fontSize: 24 * s, fontWeight: 800, lineHeight: 1.25, color: ink, whiteSpace: "pre-wrap" }}>{renderInline(mainText || "Callout", hl)}</div>
              {extraStems.length > 0 && (
                <ul style={{ margin: `${10 * s}px 0 0 ${6 * s}px`, padding: 0, listStyle: "none", display: "grid", gap: 5 * s }}>
                  {extraStems.map((t, i) => (
                    <li
                      key={i}
                      onDoubleClick={onEditBullet ? (e) => { e.stopPropagation(); onEditBullet(i); } : undefined}
                      // On the dark detour card the lines under the heading are
                      // UNIFORM across cheat code / memorize this / deeper idea —
                      // full ink, one weight (Lee, 2026-09-03: "let's meet in the
                      // middle and have all be uniform. If I want to emphasize
                      // something, let me just highlight it when filming").
                      style={{ display: "flex", gap: 7 * s, alignItems: "baseline", fontSize: (dark ? 16.5 : 15.5) * s, fontWeight: 600, lineHeight: 1.32, color: dark ? ink : inkMuted, cursor: onEditBullet ? "text" : undefined }}
                      title={onEditBullet ? "Double-click to edit · empty text removes it" : undefined}
                    >
                      <span style={{ opacity: 0.55 }}>–</span>
                      <span>{renderInline(t, hl)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
