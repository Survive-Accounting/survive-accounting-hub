// THE OUTRO — identical on every Blast Off, generated, never hand-placed.
//
// Lockup (Lee, 2026-08-30): wordmark, tagline, domain. ONE bolt, and it is the
// "i". The earlier sketch had a second bolt floating above the wordmark; Lee
// cut it — two bolts read as two logos, and the wordmark alone is the
// consistent vertical usage.
//
// Placed in the upper third: YouTube stacks its end-screen cards over the
// bottom of a vertical frame and captions sit above those, so a centred outro
// is a covered outro. Nothing renders above it — the landscape version used to
// carry a header here and it does not belong on camera.
//
// THE CTA (2026-09-07, Lee): "The outro slide needs a big red CTA button that's composed
// nicely underneath the surviveaccounting.com. I'm thinking it can say under it too like
// 'Videos * Practice Exams * Quizzes'. The button can have a hover effect and also a
// really badass spotlight effect, like where I'm hitting it with chain lightning or
// something. The bolt blasts chain lightning into the Button and it gets bigger and has
// like lightning pulsing through it. Make it exciting like oh this is what I want to
// cram with. This is legit, etc." So under the domain: the red pill (ChainLightning.tsx;
// the red is CTA_RED, named once in chain-lightning.ts), and under that the three words
// — middle dots, not Lee's asterisks, small caps, letter-spaced, cream at 70%. The
// column's numbers are ctaLayout (tested): the pill even grown clears the campus banner.
//
// THE SPOTLIGHT: the pill is a spotlight target like a detour line is — the film's
// PreviewSpotContext hands its state in through `ctaSpot` (FrameView reads the context;
// this file cannot import CeqPreviewer without closing a runtime import cycle through
// BlastOffNodes). ctrl+click on /film lights it; ctrl+shift+click is the super — more
// bolts, gold. Lit, the wordmark's bolt blasts chain lightning into the pill; measured
// with refs relative to this stage and recomputed on resize, always at rest (the pill
// is scaled while lit). In the Review preview (`live` false) the lit state is static.
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { SurviveWordmark, BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { CampusBanner } from "@/components/brand-cards/BoltZoom";
import { ChainLightning, CtaButton } from "@/components/brand-cards/ChainLightning";
import { ctaLayout, type Rect } from "@/components/brand-cards/chain-lightning";
import { TAGLINE } from "@/components/brand-cards/slogans";
import { OUTRO_CLASS, outroClass, outroEntranceCss } from "./outro-entrance";
import { UPPER_THIRD_Y, V, VStage, boilAt, reveal, riseIn } from "./stage";

/** The pill's spotlight key on the film's PreviewSpotContext. */
export const OUTRO_CTA_KEY = "outro:cta";
/** The three words under the pill. Lee wrote asterisks; the house uses middle dots. */
export const CTA_SUB = "Videos · Practice Exams · Quizzes";

/** What the film hands the pill — the same shape a detour line gets (CalloutCard's LineSpot). */
export interface OutroSpot { state: "spot" | null; flamed: boolean; onDown: (e: ReactPointerEvent) => void }

export function SurviveOutro({
  // The tagline from the one place it is declared (brand-cards/slogans.ts). Lee, 2026-09-08:
  // "Cram what's on your exam is an outro card only for now" — retired from the cold open the
  // same day, so this is the last card that says it by default.
  tagline = TAGLINE,
  domain = "surviveaccounting.com",
  // Lee, 2026-09-09: "make the outro slide button say Start Cramming for Free" — his words and
  // his capitalisation; it is the one button in every video and he reads it aloud.
  cta = "Start Cramming for Free",
  progress,
  scale = 1,
  transparent = false,
  banner = false,
  live = true,
  entrance = false,
  ctaSpot,
}: {
  tagline?: string;
  domain?: string;
  /** The pill's label. */
  cta?: string;
  /** 0..1 through the card's hold. Omit for the finished still. */
  progress?: number;
  scale?: number;
  transparent?: boolean;
  /** The slow Power Four ticker (2026-09-06, Lee: "let me add campus scroller at the end outro
   *  card") — the ReviewDeck "🏫 campus banner" toggle already writes frame.banner for any
   *  slide, outro included; this was just never reading it. Same relative Y as the open/intro
   *  cards' own banner, so all three read as one consistent strip. */
  banner?: boolean;
  /** false = an authoring pane (the Review stage): the spotlight shows its lit state
   *  statically, nothing strikes on load. */
  live?: boolean;
  /** THE ENTRANCE (2026-09-08). Lee, on keeping "Cram what's on your exam." here and nowhere
   *  else: "THAT is the slide that needs entrance animation too." On mount the card assembles
   *  — white flash, wordmark, the slogan, the domain, then the pill LANDING HARD and the three
   *  words under it (outro-entrance.ts). The bookend to the cold open's assembly, and the same
   *  rule: everything eases in, one thing lands hard, and here that one thing is the ask.
   *  Ignored on a pinned frame (`progress` given) and in an authoring pane (`live` false) —
   *  those two must stay the finished card, because a still is what they are for. */
  entrance?: boolean;
  /** The pill's spotlight state, from the film (FrameView). Absent = never lit. */
  ctaSpot?: OutroSpot;
}) {
  // The column's numbers (tested). Computed here, not at module scope: nothing on the
  // canvas render path evaluates another module's export at import time.
  const L = ctaLayout(V);
  const WORD = L.word; // cap-height px (190) — the wordmark is the loudest thing on screen
  const tag = reveal(progress, 0.10);
  const url = reveal(progress, 0.28);
  const btn = reveal(progress, 0.42);
  const sub = reveal(progress, 0.54);
  // THE ARRIVAL FLASH (2026-09-06, Lee: "the final transition to outro should be a white flash
  // type emoji — like this came out of heaven"). A quick white-out that's already fading by the
  // time the wordmark itself would be visible — one held instant, not a strobe. Only on the
  // live transition; the static still (progress undefined, used for a finished preview/export
  // frame) shows no flash, since there's no arrival to mark.
  const flash = progress === undefined ? 0 : Math.max(0, 1 - progress / 0.12);
  // THE LIVE ENTRANCE. Only when there is an arrival to mark: never on a pinned frame (the
  // offline renderer draws one moment and asks for it by `progress`), never in an authoring
  // pane. `cls` is the whole switch — off, every piece renders exactly as it always did.
  const animating = entrance && progress === undefined && live;
  const cls = (k: Parameters<typeof outroClass>[0]) => (animating ? `${OUTRO_CLASS} ${outroClass(k)}` : undefined);
  const lit = ctaSpot?.state === "spot";
  const flamed = !!ctaSpot?.flamed && lit;
  // No wall-clock motion on a pinned frame (stage.tsx's rule) and none in an authoring pane.
  const still = !live || progress !== undefined;

  // THE MEASURE: the bolt-as-"i" (the wordmark's one <svg>) and the pill, in stage px relative
  // to this stage — divided back out of whatever scale the phone/preview applies, so the
  // overlay's viewBox and the rects agree. Only ever at rest: lit, the pill is scaled 1.12.
  const rootRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const litRef = useRef(lit);
  litRef.current = lit;
  const [rects, setRects] = useState<{ bolt: Rect; btn: Rect } | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current, word = wordRef.current, pill = btnRef.current;
    if (!root || !word || !pill) return;
    const measure = () => {
      if (litRef.current) return;
      const r = root.getBoundingClientRect();
      if (r.width < 1) return;
      const k = r.width / V.w;
      const rel = (el: Element): Rect => { const b = el.getBoundingClientRect(); return { x: (b.left - r.left) / k, y: (b.top - r.top) / k, w: b.width / k, h: b.height / k }; };
      const bolt = word.querySelector("svg") ?? word;
      const next = { bolt: rel(bolt), btn: rel(pill) };
      setRects((prev) => (prev && ["x", "y", "w", "h"].every((f) => Math.abs(prev.bolt[f as keyof Rect] - next.bolt[f as keyof Rect]) < 0.5 && Math.abs(prev.btn[f as keyof Rect] - next.btn[f as keyof Rect]) < 0.5) ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(pill);
    return () => ro.disconnect();
  }, [cta, domain, tagline, scale]);

  return (
    <VStage scale={scale} transparent={transparent}>
      {animating && <style>{outroEntranceCss()}</style>}
      <div ref={rootRef} style={{ position: "absolute", inset: 0 }}>
        <div style={{
          position: "absolute", left: 0, right: 0, top: UPPER_THIRD_Y,
          display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        }}>
          {/* The measured wrapper (wordRef) must NOT be the animating one: the chain lightning
              aims at the bolt's rect at rest, and a scaling wrapper would move the target. */}
          <div ref={wordRef} style={{ display: "inline-flex" }}>
            <div className={cls("wordmark")} style={{ display: "inline-flex" }}>
              <SurviveWordmark size={WORD} boilFrame={boilAt(progress)} />
            </div>
          </div>
          <div className={cls("tagline")} style={{ marginTop: L.tagGap, fontWeight: 600, fontSize: L.tagSize, color: BRAND_CREAM, lineHeight: 1.15, ...(animating ? null : riseIn(tag)) }}>
            {tagline}
          </div>
          <div className={cls("domain")} style={{ marginTop: L.domainGap, fontWeight: 600, fontSize: L.domainSize, color: BRAND_CREAM, letterSpacing: "0.01em", lineHeight: 1, ...(animating ? { ["--sa-oe-o" as string]: "0.6" } : { opacity: url * 0.6, transform: riseIn(url).transform }) }}>
            {domain}
          </div>
          {/* THE PILL — a wrapper carries the reveal so the pill's own transform (lift, grow) is
              never fought by riseIn. z above the overlay: the bolts land ON the pill's top edge.
              The entrance rides that same wrapper, which is why the pill can land hard without
              the lit/grown state fighting it: the two transforms are on different elements. */}
          <div className={cls("cta")} style={{ marginTop: L.buttonGap, position: "relative", zIndex: 5, ...(animating ? null : riseIn(btn)) }}>
            <CtaButton ref={btnRef} label={cta} font={L.buttonFont} h={L.buttonH} padX={L.buttonPadX} minW={L.buttonMinW}
              lit={lit} flamed={flamed} still={still} onDown={ctaSpot?.onDown} />
          </div>
          <div className={cls("sub")} style={{ marginTop: L.subGap, fontWeight: 700, fontSize: L.subSize, color: BRAND_CREAM, ...(animating ? { ["--sa-oe-o" as string]: "0.7" } : { opacity: sub * 0.7, transform: riseIn(sub).transform }), letterSpacing: "0.18em", fontVariant: "all-small-caps", lineHeight: 1, whiteSpace: "nowrap" }}>
            {CTA_SUB}
          </div>
        </div>
        <ChainLightning active={lit} flamed={flamed} still={still} from={rects?.bolt ?? null} to={rects?.btn ?? null} w={V.w} h={V.h} />
      </div>
      {banner && <CampusBanner w={V.w} h={V.h} live={progress === undefined} />}
      {/* THE ARRIVAL FLASH — Lee, 2026-09-06: "like this came out of heaven". Two drivers, never
          both: `progress` on a pinned frame, and the live entrance's own keyframe on mount. */}
      {flash > 0 && <div aria-hidden style={{ position: "absolute", inset: 0, background: "#FFFFFF", opacity: flash, pointerEvents: "none" }} />}
      {animating && <div aria-hidden className="sa-oe-flash" style={{ position: "absolute", inset: 0, background: "#FFFFFF", pointerEvents: "none" }} />}
    </VStage>
  );
}
