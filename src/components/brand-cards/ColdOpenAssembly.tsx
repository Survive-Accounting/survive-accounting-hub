// THE ASSEMBLY COLD OPEN, rendered. The choreography is cold-open.ts (tested);
// this file only draws it.
//
// Lee (2026-09-07/08): "this is a machine being put together, and we're about to,
// like, dive into this. I'm really honestly picturing like how it's made, the TV
// show. And the real thing is there's just kind of the bolt, and there's
// electricity… you're about to get your system shocked. It's like a
// defibrillator."
//
// WHAT ARRIVES, AND WHY IT IS THIS CONTENT. Lee's five pieces are structural —
// camera, question, topics (a top line and a bottom line), wordmark — so they are
// filled with what the cold open frame already owns, and no copy is invented:
//   camera      PhoneFrame's own webcam ring, animated from there (it owns the
//               video); this file never draws a camera.
//   question    the tagline, the question the whole channel answers ("Cram
//               what's on your exam."), big, in from the top — with the domain
//               riding the same beat underneath it.
//   topicTop    the topic (the chapter) — a chip, in from the LEFT.
//   topicBottom the set — a chip, in from the RIGHT.
//   ticker      the campus strip, last-but-one, rising from the bottom.
//   wordmark    LAST, hard, into the watermark corner (webcam-spots.watermarkSpot)
//               at exactly the size and position PhoneFrame draws it at for the
//               rest of the video. SurviveWordmark, not GlowWordmark, for that
//               reason: it has to BE the watermark, not resemble it.
//
// THE BOLT AND THE TICKER ARE THE CALLER'S — BoltZoom hands its own animation
// layer and its own CampusBanner in as nodes, so nothing here is a second copy of
// either (and brand-cards keeps one direction of imports: BoltZoom → this file).
import { useMemo } from "react";

import { Editable } from "./Editable";

import { SurviveWordmark } from "./bolt-boil";
import {
  COLD_OPEN_CLASS, assemblyPlan, coldOpenCss, pieceAt, pieceClass, pieceStyle, tickerBeat,
  type AssemblyKey, type AssemblyPlan,
} from "./cold-open";

const FONT = "'Rubik', system-ui, sans-serif";
const HEAD_FONT = "'League Spartan', 'Rubik', system-ui, sans-serif";
const WHITE = "#FFFFFF";
const CHIP_INK = "rgba(245,239,230,0.78)";

/** How far a piece travels, in px: off the side, and a good drop from above.
 *  Exported so the camera piece — drawn by PhoneFrame, not here — travels exactly
 *  as far as everything else. */
export function assemblyTravel(w: number, h: number): { dx: number; dy: number } {
  return { dx: Math.round(w * 0.7), dy: Math.round(h * 0.3) };
}

/** The bolt's resting intensity behind the assembly — low, so it reads as the
 *  room's electricity rather than as a slide of its own. */
const BOLT_REST = 0.34;

/** The watermark corner, handed in rather than imported. webcam-spots.watermarkSpot
 *  is the ONE copy of it — but it lives under blastoff/, and brand-cards must not
 *  reach back into that tree (the TDZ ratchet, canvas/tdz-graph.test.ts, watches the
 *  render-path import graph, and BoltZoom is on it). So the caller that already knows
 *  the phone — FrameView — reads the spot and passes it down. */
export interface WordmarkSpot { left: number; top: number; size: number; opacity: number }

export function ColdOpenAssembly({ w, h, totalMs, wordmarkSpot, still = false, atMs, bolt, ticker, tagline, domain, topicTop, topicBottom, onEdit }: {
  w: number; h: number;
  /** Where the wordmark LANDS — exactly where PhoneFrame draws the watermark next. */
  wordmarkSpot: WordmarkSpot;
  /** The seconds the assembly runs across — the countdown's own length on a take. Omitted, the
   *  beat sheet's own length (cold-open.ASSEMBLY_TOTAL_MS), so a caller that only wants the
   *  finished slide never has to name a duration — or import the constant to do it. */
  totalMs?: number;
  /** A frozen render (Review preview, a thumbnail): the FINISHED slide, never a half-built one. */
  still?: boolean;
  /** Pin one moment, in ms — an offline frame renderer. `still` implies the end. */
  atMs?: number;
  /** BoltZoom's animation layer, handed in so this file never invents a second bolt. */
  bolt?: React.ReactNode;
  /** BoltZoom's CampusBanner, or null when the slide has the ticker off. */
  ticker?: React.ReactNode;
  tagline: string;
  domain: string;
  /** The topic (chapter) — the top line, in from the left. */
  topicTop?: string | null;
  /** The set — the bottom line, in from the right. */
  topicBottom?: string | null;
  onEdit?: (patch: { tagline?: string; domain?: string }) => void;
}) {
  const plan = useMemo(() => assemblyPlan(totalMs), [totalMs]);
  const dist = useMemo(() => assemblyTravel(w, h), [w, h]);
  const css = useMemo(() => coldOpenCss(plan, dist.dx, dist.dy), [plan, dist.dx, dist.dy]);
  // PINNED (a still, or an offline frame): the moment comes from the tested pure
  // function. LIVE: the CSS above runs it. Both read the same plan, so they agree.
  const pin = still ? plan.totalMs : atMs;
  const wm = wordmarkSpot;

  const chip: React.CSSProperties = {
    fontFamily: HEAD_FONT, fontWeight: 800, fontSize: Math.round(h * 0.021), letterSpacing: "0.2em",
    textTransform: "uppercase", color: CHIP_INK, textAlign: "center", maxWidth: Math.round(w * 0.86),
    // WRAPS, never truncates: a real set name ("Financial vs. managerial accounting") is wider
    // than the safe column at this tracking, and a clipped topic tells the student nothing.
    lineHeight: 1.35, textWrap: "balance" as never,
  };

  // THE SET NAME IS THE HERO (2026-09-08). Lee: "It needs to start on the slide with the
  // topics." Until today the big line in the middle of this stack was "Cram what's on your
  // exam." and the two topic lines were chips either side of it — so the first thing on screen
  // was a slogan and the topics were footnotes. The slogan is retired from this slide (it is
  // the outro's now), which leaves the middle slot to the domain and frees the hierarchy: the
  // chapter stays a chip because it is context, and the SET — what this video actually is —
  // takes the size the slogan had.
  const lead: React.CSSProperties = {
    ...chip,
    fontSize: Math.round(h * 0.038), letterSpacing: "0.06em", lineHeight: 1.15,
    color: WHITE,
    filter: `drop-shadow(0 ${Math.max(1, Math.round(h * 0.002))}px 0 rgba(0,0,0,0.55)) drop-shadow(0 ${Math.round(h * 0.012)}px ${Math.round(h * 0.024)}px rgba(0,0,0,0.45))`,
  };

  return (
    <>
      <style>{css}</style>
      {/* THE BOLT, visible from the first frame — dimmed, and pulsed once as the wordmark lands. */}
      <div className={pin === undefined ? "sa-co-shock" : undefined} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: BOLT_REST, ["--sa-co-bolt" as string]: String(BOLT_REST) }}>
        {bolt}
      </div>

      {/* THE CENTRE STACK — the topic above, the question, the set below. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: Math.round(h * 0.3), display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(h * 0.018), pointerEvents: "none" }}>
        <Piece plan={plan} dist={dist} pin={pin} name="topicTop" style={chip}>{topicTop || ""}</Piece>
        <Piece plan={plan} dist={dist} pin={pin} name="question" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(h * 0.008) }}>
          <Editable value={tagline} onEdit={onEdit ? (v) => onEdit({ tagline: v }) : undefined}
            style={{ color: WHITE, fontFamily: FONT, fontWeight: 800, fontSize: Math.round(h * 0.038), lineHeight: 1.1, letterSpacing: "0.01em", textAlign: "center", maxWidth: Math.round(w * 0.86), textWrap: "balance" as never, filter: `drop-shadow(0 ${Math.max(1, Math.round(h * 0.002))}px 0 rgba(0,0,0,0.55)) drop-shadow(0 ${Math.round(h * 0.012)}px ${Math.round(h * 0.024)}px rgba(0,0,0,0.45))` }} />
          <Editable value={domain} onEdit={onEdit ? (v) => onEdit({ domain: v }) : undefined}
            style={{ color: "rgba(245,239,230,0.62)", fontFamily: FONT, fontWeight: 700, fontSize: Math.round(h * 0.019), letterSpacing: "0.02em", textAlign: "center" }} />
        </Piece>
        <Piece plan={plan} dist={dist} pin={pin} name="topicBottom" style={lead}>{topicBottom || ""}</Piece>
      </div>

      {/* THE TICKER, last-but-one, rising from the bottom. Its wrapper covers the
          whole phone so the banner's own absolute placement is untouched and the
          transform's containing block stays the frame, not a zero-sized box. */}
      {ticker && (
        <Piece plan={plan} dist={dist} pin={pin} name="ticker" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{ticker}</Piece>
      )}

      {/* THE WORDMARK — last, hard, and it lands ON the watermark corner. The
          resting 0.92 lives on the mark itself, not on the animating wrapper,
          so the wrapper is free to run a plain 0 → 1 fade and the composite still
          matches PhoneFrame's watermark exactly on the next slide. */}
      <Piece plan={plan} dist={dist} pin={pin} name="wordmark" style={{ position: "absolute", left: wm.left, top: wm.top, pointerEvents: "none" }}>
        <div style={{ opacity: wm.opacity }}><SurviveWordmark size={wm.size} boilSeconds={1.2} /></div>
      </Piece>
    </>
  );
}

/** One piece: the CSS class when it is live, the tested inline style when the
 *  moment is pinned. `ticker` is not one of Lee's five — it is the derived
 *  last-but-one beat (cold-open.tickerBeat). */
function Piece({ plan, dist, pin, name, style, children }: {
  plan: AssemblyPlan; dist: { dx: number; dy: number }; pin: number | undefined;
  name: AssemblyKey | "ticker"; style?: React.CSSProperties; children?: React.ReactNode;
}) {
  const spec = name === "ticker" ? { key: "topicBottom" as const, ...tickerBeat(plan) } : pieceAt(plan, name);
  if (pin !== undefined) return <div style={{ ...style, ...pieceStyle(spec, pin, dist) }}>{children}</div>;
  return <div className={`${COLD_OPEN_CLASS} ${pieceClass(name)}`} style={style}>{children}</div>;
}
