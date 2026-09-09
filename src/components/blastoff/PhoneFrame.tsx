// THE PHONE FRAME — 9:16, black, the slide exactly as it films.
//
// Lee (2026-09-04): "there's still a huge difference between the slides I'm
// seeing on /results, which I really think are perfect, and what we see in the
// canvas and in the capture window … we HAVE to get these aligned … /arrange
// should also show the slide … consistency as we push this slide through the
// process." So there is ONE phone: the Review stage, the Arrange preview and
// the /film capture all mount this, at different widths, with the same rules
// for the layout, the banner, the watermark and the camera. (The Arrange
// preview lives on in BlastOffEditor.tsx for the old /blast-off route only —
// V3's /arrange has redirected into Review since 2026-09-05.)
//
// TWO TEMPLATES (2026-09-05, layout.ts): pass 1 is the deal that filmed first
// (the card centred); pass 2 is the vertical template — the card at the top
// of the safe column, narrower and bigger so it reads portrait, the camera
// bigger and placed to the content. The set picks its pass on /v3.
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { CampusBanner } from "@/components/brand-cards/BoltZoom";
import { COLD_OPEN_CLASS, pieceClass } from "@/components/brand-cards/cold-open";
import type { BoothSetInfo } from "@/lib/talkthrough.functions";

import { WebcamFrame } from "./capture/Webcam";
import { camRect, isCamSpot, watermarkSpot, wordmarkHero, type Box, type CamSpot } from "./capture/webcam-spots";
import { FrameView } from "./frame-view";
import { IllustrationLayer, PlacedIllustration } from "./IllustrationLayer";
import { canIllustrate, isPlaced } from "./illustration";
import { SAFE, camDefault, captionRailClear, captionRailRect, cardPlacement, type RailStatus, type SlideLayout } from "./layout";
import { backdropFor, framesFullFrame, isBigCallout, isFullFrame, type BlastFrame } from "./plan";
import type { CardOverride } from "./SetCard";
import { SlideEditContext } from "./slide-edit";
import { BRAND_FONT } from "./stage";

/** The Review stage width; everything else scales from it. */
export const PHONE_W = 306;

// THE FADE FROM INTRO (2026-09-06) — same shape as CeqPreviewer.tsx's sa-outro-fade (a plain
// opacity fade-in, film-only, "both" so it holds its start state until the animation actually
// begins rather than flashing the full card for one frame first). Scoped to PhoneFrame's own
// stylesheet rather than reusing that class name directly: sa-outro-fade lives in the older
// canvas pipeline's own file and this is the V3 Blast Off capture path — same idea, own home.
const STAGE_FADE_CSS = `
@keyframes sa-stage-fade-in { from { opacity: 0; } to { opacity: 1; } }
.film-mode .sa-stage-fade-in { animation: sa-stage-fade-in 900ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .film-mode .sa-stage-fade-in { animation: none; } }`;

// THE CHARGED WATERMARK (2026-09-08). Lee: "I think this is where 'video game' comes in. I really
// can see like a persistent change up top." The assembly cold open ends with the wordmark landing
// HARD in this exact corner; the FIRST slide that then carries the watermark holds that charge for
// a second — a brighter boil bleeding off, nothing more — so the mark reads as the one that just
// landed rather than as a new one fading in. Position, size and opacity never change (they are
// watermarkSpot's, one copy), so there is no jump and no second fade-in.
const WATERMARK_CHARGE_CSS = `
@keyframes sa-wm-charge { from { filter: brightness(1.9) drop-shadow(0 0 10px rgba(252,163,17,0.55)); } to { filter: none; } }
.film-mode .sa-wm-charge { animation: sa-wm-charge 1000ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .film-mode .sa-wm-charge { animation: none; } }`;

/** FrameView's `scale` for a frame on a stage `w` wide: full-frame kinds fill
 *  the stage (a 1080 frame drawn at scale·0.34); the tutor card is a bit
 *  bigger than a detour card so it renders smaller here to fit; every other
 *  card is the canvas's 560-wide card at just under half the stage. */
export function phoneScale(frame: BlastFrame, w: number): number {
  const k = w / PHONE_W;
  if (framesFullFrame(frame)) return w / 1080 / 0.34;
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

export function PhoneFrame({ frame, frames, index, set, topicName, progress, w = PHONE_W, live = true, safe = false, dim = false, rounded = true, style, capture = false, popout = false, stageStyle, camSpot, cardOverride: gripOverride, layout = "pass1", hero: heroProp, onHero, onRailStatus, coldOpen }: {
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
  /** THE 9:16 POP-OUT WINDOW (2026-09-06, Lee: "let the illustrations be picked up and movable
   *  resizable from capture pop out window"). Only meaningfully different from plain `capture`
   *  in one way: an illustration can be dragged and resized here, same as on Review — nowhere
   *  else during capture, on purpose (slide-edit.ts's own rule). */
  popout?: boolean;
  /** A transform on the slide itself (the capture camera: zoom, pull-back). */
  stageStyle?: React.CSSProperties;
  /** The take's camera override (B on the capture); absent = the slide's own. */
  camSpot?: CamSpot;
  /** The live card's per-slide override from the grips (width in flow units, scale
   *  multiplier) — `camera.cardOverride`, per slide. */
  cardOverride?: CardOverride;
  /** The set's slide template (layout.ts). */
  layout?: SlideLayout;
  /** THE HERO (2026-09-05): ctrl+click on the camera. Controlled by the capture (so backtick,
   *  the next slide and B→off can end it); uncontrolled everywhere else. */
  hero?: boolean;
  onHero?: (on: boolean) => void;
  /** THE CAPTION RAIL CHECK (2026-09-05): on the capture, told whether the card or the camera
   *  sits on the fixed caption rail — the /film chrome shows it. */
  onRailStatus?: (s: RailStatus) => void;
  /** THE ASSEMBLY COLD OPEN (2026-09-08, brand-cards/cold-open.ts). On an `open` frame the
   *  slide builds itself over `ms` and the wordmark lands last in the watermark corner; `key`
   *  restarts it (a new countdown, or walking back onto the slide). BlastOffCapture is the only
   *  caller — the Review stage and the thumbnails never assemble, they show slide one at rest. */
  coldOpen?: { ms: number; key?: string | number; held?: boolean } | null;
}) {
  const h = Math.round(w * 16 / 9);
  const backdrop = backdropFor(frames, index, (id) => !!set.ceqs.find((c) => c.id === id)?.noteOnly);
  // A callout drawn BIG is laid out like a slogan slide, so its picture is placed like one.
  const big = isBigCallout(frame);
  const place = cardPlacement(layout, frame.kind);
  // The template's card shape under the grips' per-take override.
  const cardOverride: CardOverride = { ...(place.cardW ? { cardW: place.cardW } : {}), ...(place.scaleMul ? { scaleMul: place.scaleMul } : {}), ...gripOverride };
  // THE CAMERA: the slide's spot (or the template's default), or the take's
  // override; on the capture it measures the live card so it can shrink out of
  // its way.
  const def = camDefault(layout, frame.kind);
  const own: CamSpot = isCamSpot(frame.cam) ? frame.cam : def.spot;
  // THE ASSEMBLY COLD OPEN (2026-09-08). Lee: "my camera's out on the right and comes in… it
  // comes in, slides in" — and THE CAMERA IS FIRST, "the only living thing on screen", so the
  // cold open has to have one. The open frame's own default is "off" (webcam-spots.defaultCamFor
  // / layout.camDefault) and that stays true everywhere else; only while this slide is actually
  // assembling does it borrow the corner spot — the small top-right circle, i.e. out on the
  // right, exactly where Lee's camera comes in from.
  const assembling = !!coldOpen && frame.kind === "open";
  const camAsked: CamSpot = camSpot ?? own;
  const cam: CamSpot = assembling && camAsked === "off" ? "corner" : camAsked;
  // A SAVED SIZE BELONGS TO THE SLIDE'S OWN SPOT. It used to apply to whatever spot was
  // current, so a home/free size saved on the slide leaked onto B's corner/hero override.
  const camSize = cam === own ? (frame.camSize ?? (cam === def.spot ? def.size : undefined)) : (cam === def.spot ? def.size : undefined);
  const edit = useContext(SlideEditContext);
  const phoneRef = useRef<HTMLDivElement>(null);
  const [cardBox, setCardBox] = useState<Box | null>(null);
  // The illustration's OWN box, measured separately from the card+picture union above (which
  // exists only for the camera's keep-off math) — so a rail collision caused by a picture Lee
  // dragged under the captions can be told apart from one caused by the card itself.
  const [artBox, setArtBox] = useState<Box | null>(null);
  // THE HERO: ctrl+click on the camera. The capture owns it (see the props); on its own
  // the phone keeps a local one so the Review stage still previews the gesture.
  const [heroLocal, setHeroLocal] = useState(false);
  const moment = heroProp ?? heroLocal;
  // THE ARRIVAL (2026-09-06): whether Webcam.tsx's first-frame video has actually shown up yet
  // — see the note there. Only spent on the hero wordmark's own bolt (below); every other camera
  // spot doesn't care, the ring handles its own placeholder entirely on its own.
  const [cameraReady, setCameraReady] = useState(false);
  const setMoment = onHero ?? setHeroLocal;
  useEffect(() => { setHeroLocal(false); }, [frame.id]);
  useEffect(() => {
    // Measured whenever a camera is on — the Review placeholder ring avoids a tall card too.
    if (cam === "off") { setCardBox(null); return; }
    const phone = phoneRef.current;
    if (!phone) return;
    const measure = () => {
      const card = phone.querySelector("[data-ceq-card]") as HTMLElement | null;
      const art = phone.querySelector("[data-sa-illustration]") as HTMLElement | null;
      if (!card && !art) { setCardBox(null); setArtBox(null); return; }
      const p = phone.getBoundingClientRect();
      if (art) { const r = art.getBoundingClientRect(); setArtBox({ x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height }); }
      else setArtBox(null);
      // The camera keeps off the card AND the picture under it: one box around both.
      const boxes = [card, art].filter(Boolean).map((el) => (el as HTMLElement).getBoundingClientRect());
      const x1 = Math.min(...boxes.map((b) => b.left)), y1 = Math.min(...boxes.map((b) => b.top));
      const x2 = Math.max(...boxes.map((b) => b.right)), y2 = Math.max(...boxes.map((b) => b.bottom));
      setCardBox({ x: x1 - p.left, y: y1 - p.top, w: x2 - x1, h: y2 - y1 });
    };
    measure();
    const t = window.setTimeout(measure, 400);   // after the entrance settles
    const ro = new ResizeObserver(measure);
    ro.observe(phone);
    const stage = phone.querySelector("[data-sa-stage]");
    if (stage) ro.observe(stage);
    return () => { window.clearTimeout(t); ro.disconnect(); };
    // stageStyle.transform: the ResizeObserver cannot see a CSS transform, so the zoom / O / Alt-move
    // left cardBox stale and the ring could sit on the enlarged card. Re-measure when it changes.
  }, [capture, cam, frame.id, w, layout, stageStyle?.transform]);
  // THE WORDMARK'S MOVE. Measured at rest (never mid-hero: the rect would be the transformed one),
  // then translated to the centre and scaled about its own centre — a transform, never a font-size
  // change, because SurviveWordmark's bolt is JS-sized and would not animate.
  const markRef = useRef<HTMLDivElement>(null);
  const [markBox, setMarkBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (moment) return;
    const el = markRef.current;
    if (!el) { setMarkBox(null); return; }
    const b = el.getBoundingClientRect();
    setMarkBox({ w: b.width, h: b.height });
  }, [w, frame.id, moment]);
  // THE RAIL: reserved on the Review stage (drawn with the safe zones), checked on the take.
  // Nothing is ever drawn on the capture — OBS must not see a guide.
  const rail = captionRailRect(w, h, cam === "off");
  useEffect(() => {
    if (!capture || !onRailStatus) return;
    const camBox = cam === "off" ? null : camRect(cam, w, h, camSize, frame.camPos);
    onRailStatus(captionRailClear(rail, cardBox, camBox, artBox));
  }, [capture, onRailStatus, rail.x, rail.y, rail.w, rail.h, w, h, cam, camSize, frame.camPos, cardBox, artBox]);
  // ONE COPY of the watermark corner (webcam-spots.watermarkSpot): the assembly cold open flies
  // its wordmark into exactly this left/top/size, so slide one's landing and slide two's
  // watermark are the same mark in the same place — no jump, no second fade-in.
  const wm = watermarkSpot(w);
  const wmLeft = wm.left, wmTop = wm.top;
  const wmHero = wordmarkHero(w, h);
  const wmTransform = moment && markBox
    ? (() => {
        const cx = wmLeft + markBox.w / 2, cy = wmTop + markBox.h / 2;
        const dx = w / 2 - cx;
        const dy = (wmHero.bottom - (markBox.h * wmHero.scale) / 2) - cy;
        return `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${wmHero.scale})`;
      })()
    : "none";
  const band: React.CSSProperties = { position: "absolute", left: 0, right: 0, background: "repeating-linear-gradient(135deg, rgba(125,211,252,0.10) 0 6px, transparent 6px 14px)", borderColor: "rgba(125,211,252,0.35)", pointerEvents: "none" };
  const tag: React.CSSProperties = { position: "absolute", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(125,211,252,0.7)", fontWeight: 800 };
  // PASS 2 puts a card at the top of the safe column; the full-frame kinds
  // and pass 1 keep the centre.
  const topAligned = place.align === "top" && !framesFullFrame(frame);
  // THE FADE FROM INTRO (2026-09-06, Lee: "we probably need a good fade from intro 2 to first
  // slide as well"). Every other cut in the deck is instant — that's the house rule (Lee: "a
  // cool transition" is asked for only at named, special moments, never as a general slide-to-
  // slide behavior) — but going from the branded intro card straight into the first real slide
  // is the one hard cut in the whole rip that reads as a splice rather than a beat. `frames`+
  // `index` are already this component's own props, so "the previous frame was the intro" needs
  // no new plumbing; the stage div already remounts per frame.id, so the animation just plays
  // once, exactly on arrival, the same way sa-outro-fade (CeqPreviewer.tsx) already does for the
  // sign-off.
  const fadeInFromIntro = capture && frames[index - 1]?.kind === "intro";
  // THE CHARGE (2026-09-08): the FIRST slide of the rip that carries the watermark is the one
  // that inherits the cold open's landing — everything before it is a full frame with no
  // watermark at all (the open, the intro), so this is where the corner comes back.
  const chargedWatermark = capture && index > 0 && frames.slice(0, index).every((f) => isFullFrame(f.kind));
  return (
    <div ref={phoneRef} className={capture ? "film-mode" : undefined} data-sa-phone="" data-sa-layout={layout} style={{ fontFamily: BRAND_FONT, width: w, height: h, background: "#000", borderRadius: rounded ? Math.round(w * 0.072) : 0, border: rounded ? "1px solid rgba(244,239,230,0.16)" : "none", position: "relative", overflow: "hidden", display: "grid", placeItems: topAligned ? "start center" : "center", opacity: dim ? 0.5 : 1, ...style }}>
      {frame.kind !== "open" && frame.kind !== "intro" && frame.banner === "on" && <CampusBanner w={w} h={h} live={live} />}
      {/* THE WATERMARK — the wordmark with the live bolt in the "i", top-left,
          sized like the film popout's (5.2% of the width). */}
      {watermarkOn(frame, backdrop) && chargedWatermark && <style>{WATERMARK_CHARGE_CSS}</style>}
      {watermarkOn(frame, backdrop) && (
        <div ref={markRef} className={chargedWatermark ? "sa-wm-charge" : undefined} style={{ position: "absolute", left: wmLeft, top: wmTop, pointerEvents: "none", opacity: moment ? 1 : wm.opacity,
          // THE HERO: same 480 ms overshoot as the camera ring, so the two move as one gesture;
          // above the camera's moment layer (30), below the arrows (40).
          transformOrigin: "50% 50%", transform: wmTransform, transition: "transform 480ms cubic-bezier(0.34, 1.3, 0.64, 1), opacity 480ms ease",
          zIndex: moment ? 31 : undefined, willChange: moment ? "transform" : undefined }}>
          {/* 1.2s, not the house 0.5s (2026-09-06, Lee: "the animated bolt on the slides is very
              laggy and flickery... smoothen this out") — the same fast cadence a small nav icon
              uses reads as a strobe at this size; the slower "calm" cadence already used
              elsewhere (BOIL_SECONDS["boil-calm"]) is the same technique, just easier to watch. */}
          {/* THE ARRIVAL (2026-09-06, Lee: "have the boiling animated bolt... time it where when
              my camera is coming in the bolt is firing down to the Survive wordmark"). In hero
              mode, before the camera's own placeholder bolt has handed off to the real feed
              (Webcam.tsx), the wordmark holds ITS bolt invisible — "surv[ ]ve" — so the one bolt
              on screen is the camera ring's, and the moment it arrives, this one fades in as if
              it just landed. Every non-hero appearance is untouched: always full opacity. */}
          <SurviveWordmark size={wm.size} boilSeconds={1.2} boltOpacity={moment && !cameraReady ? 0 : 1} />
        </div>
      )}
      {fadeInFromIntro && <style>{STAGE_FADE_CSS}</style>}
      <div key={capture ? frame.id : undefined} data-sa-stage="" className={fadeInFromIntro ? "sa-stage-fade-in" : undefined} style={{ display: "grid", placeItems: "center", position: "relative",
        // The safe column: below the status bar (and the watermark), inside the rail.
        ...(topAligned ? { marginTop: Math.round(h * (SAFE.top + 0.02)), maxWidth: Math.round(w * (SAFE.right - SAFE.left)) } : {}),
        ...(moment ? { filter: "blur(2px) brightness(0.35)", transition: "filter 480ms ease" } : { transition: "filter 480ms ease" }),
        ...stageStyle }}>
        <FrameView frame={frame} set={set} scale={phoneScale(frame, w)} topicName={topicName} progress={progress} live={capture} cardOverride={cardOverride} layout={layout} coldOpen={assembling ? coldOpen : null} />
        {/* THE OPTIONAL ILLUSTRATION — second row of the stage grid, under the card; nothing when
            absent. A placed one (or a blank slide's) is the phone-level layer below instead. */}
        {frame.illustration?.assetUrl && canIllustrate(frame.kind) && !isPlaced(frame.kind, frame.illustration, big) && (
          <IllustrationLayer ill={frame.illustration} w={w} h={h}
            onPlace={edit && (!capture || popout) ? (p) => edit({ illustration: { ...frame.illustration!, placement: p } }) : undefined} />
        )}
      </div>
      {/* THE PLACED PICTURE (2026-09-05): at its own spot, dragged and resized on Review; carries
          the camera transform so it zooms and blurs with the slide. Dead centre on a blank slide. */}
      {frame.illustration?.assetUrl && canIllustrate(frame.kind) && isPlaced(frame.kind, frame.illustration, big) && (
        <PlacedIllustration key={capture ? `ill-${frame.id}` : undefined} ill={frame.illustration} w={w} h={h} kind={frame.kind} big={big}
          stageStyle={{ ...(moment ? { filter: "blur(2px) brightness(0.35)" } : {}), transition: "filter 480ms ease, transform 480ms ease", ...(stageStyle?.transform ? { transform: stageStyle.transform, transformOrigin: stageStyle.transformOrigin } : {}) }}
          onPlace={edit && (!capture || popout) ? (p) => edit({ illustration: { ...frame.illustration!, placement: p } }) : undefined} />
      )}
      {cam !== "off" && (() => {
        const webcam = (
          <WebcamFrame w={w} h={h} spot={cam} size={camSize} pos={frame.camPos} live={capture} cardBox={cardBox} moment={moment}
            onMoment={capture ? () => setMoment(!moment) : undefined} onReadyChange={setCameraReady}
            onFree={edit && !capture ? (p) => edit({ ...(p.pos ? { camPos: p.pos } : {}), ...(p.size ? { camSize: p.size } : {}) }) : undefined} />
        );
        // THE CAMERA IS THE FIRST PIECE of the assembly cold open — it slides in from the right
        // before anything else, and everything else is put together around it. The stylesheet is
        // ColdOpenAssembly's (mounted inside this same phone by BoltZoom), so both the camera and
        // the graphics run off ONE plan; the wrapper covers the whole phone so the camera's own
        // absolute placement is untouched and the transform's containing block stays the frame.
        if (!assembling) return webcam;
        // HELD (the pop-out before C, 2026-09-08): the graphics are all still off-frame, but the
        // camera is NOT — Lee has to see himself to line the shot up, and a blank frame is
        // useless to point a camera at. So while held it renders plain, at rest. It is also the
        // truest reading of this file's own rule: the camera is the living thing that exists
        // before Lee speaks, and the graphics assemble around it.
        if (coldOpen?.held) return webcam;
        return (
          <div key={coldOpen?.key} className={`${COLD_OPEN_CLASS} ${pieceClass("camera")}`} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{webcam}</div>
        );
      })()}
      {safe && !moment && (
        <div style={{ position: "absolute", left: rail.x, top: rail.y, width: rail.w, height: rail.h, border: "1px dashed rgba(252,163,17,0.55)", borderRadius: 6, pointerEvents: "none" }}>
          <span style={{ ...tag, left: 6, top: 4, color: "rgba(252,163,17,0.8)" }}>captions</span>
        </div>
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
