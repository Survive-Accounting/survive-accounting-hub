// THE PHONE FRAME — 9:16, black, the slide exactly as it films.
//
// Lee (2026-09-04): "there's still a huge difference between the slides I'm
// seeing on /results, which I really think are perfect, and what we see in the
// canvas and in the capture window … we HAVE to get these aligned … /arrange
// should also show the slide … consistency as we push this slide through the
// process." So there is ONE phone: the Review stage, the Arrange preview and
// the /film capture all mount this, at different widths, with the same rules
// for the layout, the banner, the watermark and the camera.
//
// TWO TEMPLATES (2026-09-05, layout.ts): pass 1 is the deal that filmed first
// (the card centred); pass 2 is the vertical template — the card at the top
// of the safe column, narrower and bigger so it reads portrait, the camera
// bigger and placed to the content. The set picks its pass on /v3.
import { useContext, useEffect, useRef, useState } from "react";

import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { CampusBanner } from "@/components/brand-cards/BoltZoom";
import type { BoothSetInfo } from "@/lib/talkthrough.functions";

import { WebcamFrame } from "./capture/Webcam";
import { isCamSpot, type Box, type CamSpot } from "./capture/webcam-spots";
import { FrameView } from "./frame-view";
import { SAFE, camDefault, cardPlacement, type SlideLayout } from "./layout";
import { backdropFor, isFullFrame, type BlastFrame } from "./plan";
import type { CardOverride } from "./SetCard";
import { SlideEditContext } from "./slide-edit";

/** The Review stage width; everything else scales from it. */
export const PHONE_W = 306;

/** FrameView's `scale` for a frame on a stage `w` wide: full-frame kinds fill
 *  the stage (a 1080 frame drawn at scale·0.34); the tutor card is a bit
 *  bigger than a detour card so it renders smaller here to fit; every other
 *  card is the canvas's 560-wide card at just under half the stage. */
export function phoneScale(frame: BlastFrame, w: number): number {
  const k = w / PHONE_W;
  if (isFullFrame(frame.kind)) return w / 1080 / 0.34;
  if (frame.kind === "bio") return 0.45 * k;
  return 0.48 * k;
}

/** Does the film watermark (the wordmark, top-left) belong on this frame? Not
 *  on the brand slides, the bolt detour or an ad — every card slide carries it,
 *  the opening summary included (Lee, 2026-09-04: "opening summary just shift
 *  to watermark there. Not the survive accounting at top"). */
export function watermarkOn(frame: BlastFrame, _backdrop: ReturnType<typeof backdropFor>): boolean {
  return !isFullFrame(frame.kind);
}

export function PhoneFrame({ frame, frames, index, set, topicName, progress, w = PHONE_W, live = true, safe = false, dim = false, rounded = true, style, capture = false, stageStyle, camSpot, cardOverride: gripOverride, layout = "pass1" }: {
  frame: BlastFrame;
  /** The whole running order — the backdrop rule looks at the neighbours. */
  frames: readonly BlastFrame[];
  index: number;
  set: BoothSetInfo; topicName?: string | null; progress?: { x: number; y: number } | null;
  w?: number; live?: boolean;
  /** Draw the Shorts safe zones (status bar, caption, like/share rail). */
  safe?: boolean;
  dim?: boolean;
  /** The phone's rounded corners and hairline; off in capture (OBS sees black). */
  rounded?: boolean;
  style?: React.CSSProperties;
  /** THE CAPTURE SURFACE (2026-09-04): cards are live (practice, spotlight,
   *  highlights, Alt-move reach them), the phone is the `film-mode` root the
   *  card stylesheet keys its motion on (typewriter, neon, outro fade), and
   *  the slide re-keys per frame so entrances play on every walk. */
  capture?: boolean;
  /** A transform on the slide itself (the capture camera: zoom, pull-back). */
  stageStyle?: React.CSSProperties;
  /** The take's camera override (B on the capture); absent = the slide's own. */
  camSpot?: CamSpot;
  /** The live card's per-slide override from the grips (width in flow units, scale
   *  multiplier) — `camera.cardOverride`, per slide. */
  cardOverride?: CardOverride;
  /** The set's slide template (layout.ts). */
  layout?: SlideLayout;
}) {
  const h = Math.round(w * 16 / 9);
  const backdrop = backdropFor(frames, index, (id) => !!set.ceqs.find((c) => c.id === id)?.noteOnly);
  const place = cardPlacement(layout, frame.kind);
  // The template's card shape under the grips' per-take override.
  const cardOverride: CardOverride = { ...(place.cardW ? { cardW: place.cardW } : {}), ...(place.scaleMul ? { scaleMul: place.scaleMul } : {}), ...gripOverride };
  // THE CAMERA: the slide's spot (or the template's default), or the take's
  // override; on the capture it measures the live card so it can shrink out of
  // its way.
  const def = camDefault(layout, frame.kind);
  const cam: CamSpot = camSpot ?? (isCamSpot(frame.cam) ? frame.cam : def.spot);
  const camSize = frame.camSize ?? (cam === def.spot ? def.size : undefined);
  const edit = useContext(SlideEditContext);
  const phoneRef = useRef<HTMLDivElement>(null);
  const [cardBox, setCardBox] = useState<Box | null>(null);
  // THE MOMENT: ctrl+click on the camera; ends with the next slide or `.
  const [moment, setMoment] = useState(false);
  useEffect(() => { setMoment(false); }, [frame.id]);
  useEffect(() => {
    if (!capture || cam === "off") { setCardBox(null); return; }
    const phone = phoneRef.current;
    if (!phone) return;
    const measure = () => {
      const card = phone.querySelector("[data-ceq-card]") as HTMLElement | null;
      if (!card) { setCardBox(null); return; }
      const p = phone.getBoundingClientRect(), c = card.getBoundingClientRect();
      setCardBox({ x: c.left - p.left, y: c.top - p.top, w: c.width, h: c.height });
    };
    measure();
    const t = window.setTimeout(measure, 400);   // after the entrance settles
    const ro = new ResizeObserver(measure);
    ro.observe(phone);
    const stage = phone.querySelector("[data-sa-stage]");
    if (stage) ro.observe(stage);
    return () => { window.clearTimeout(t); ro.disconnect(); };
  }, [capture, cam, frame.id, w, layout]);
  const band: React.CSSProperties = { position: "absolute", left: 0, right: 0, background: "repeating-linear-gradient(135deg, rgba(125,211,252,0.10) 0 6px, transparent 6px 14px)", borderColor: "rgba(125,211,252,0.35)", pointerEvents: "none" };
  const tag: React.CSSProperties = { position: "absolute", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(125,211,252,0.7)", fontWeight: 800 };
  // PASS 2 puts a card at the top of the safe column; the full-frame kinds
  // and pass 1 keep the centre.
  const topAligned = place.align === "top" && !isFullFrame(frame.kind);
  return (
    <div ref={phoneRef} className={capture ? "film-mode" : undefined} data-sa-phone="" data-sa-layout={layout} style={{ width: w, height: h, background: "#000", borderRadius: rounded ? Math.round(w * 0.072) : 0, border: rounded ? "1px solid rgba(244,239,230,0.16)" : "none", position: "relative", overflow: "hidden", display: "grid", placeItems: topAligned ? "start center" : "center", opacity: dim ? 0.5 : 1, ...style }}>
      {frame.kind !== "open" && frame.kind !== "intro" && frame.banner === "on" && <CampusBanner w={w} h={h} live={live} />}
      {/* THE WATERMARK — the wordmark with the live bolt in the "i", top-left,
          sized like the film popout's (5.2% of the width). */}
      {watermarkOn(frame, backdrop) && (
        <div style={{ position: "absolute", left: Math.round(w * 0.04), top: Math.round(w * 0.05), pointerEvents: "none", opacity: 0.92 }}>
          <SurviveWordmark size={Math.max(12, Math.round(w * 0.052))} />
        </div>
      )}
      <div key={capture ? frame.id : undefined} data-sa-stage="" style={{ display: "grid", placeItems: "center", position: "relative",
        // The safe column: below the status bar (and the watermark), inside the rail.
        ...(topAligned ? { marginTop: Math.round(h * (SAFE.top + 0.02)), maxWidth: Math.round(w * (SAFE.right - SAFE.left)) } : {}),
        ...(moment ? { filter: "blur(2px) brightness(0.35)", transition: "filter 480ms ease" } : { transition: "filter 480ms ease" }),
        ...stageStyle }}>
        <FrameView frame={frame} set={set} scale={phoneScale(frame, w)} topicName={topicName} progress={progress} live={capture} cardOverride={cardOverride} layout={layout} />
      </div>
      {cam !== "off" && (
        <WebcamFrame w={w} h={h} spot={cam} size={camSize} pos={frame.camPos} live={capture} cardBox={cardBox} moment={moment}
          onMoment={capture ? () => setMoment((v) => !v) : undefined}
          onFree={edit && !capture ? (p) => edit({ ...(p.pos ? { camPos: p.pos } : {}), ...(p.size ? { camSize: p.size } : {}) }) : undefined} />
      )}
      {safe && (
        <>
          <div style={{ ...band, top: 0, height: "9%", borderBottom: "1px dashed" }}><span style={{ ...tag, left: 8, bottom: 4 }}>status bar</span></div>
          <div style={{ ...band, bottom: 0, height: "20%", borderTop: "1px dashed" }}><span style={{ ...tag, left: 8, top: 4 }}>caption · title · sound</span></div>
          <div style={{ ...band, top: "30%", bottom: "20%", left: "auto", width: "16%", borderLeft: "1px dashed" }}><span style={{ ...tag, right: 4, top: 4, writingMode: "vertical-rl" }}>like · share</span></div>
        </>
      )}
    </div>
  );
}
