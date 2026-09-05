// CAPTURE — /v3/$topic/$set/blast-off/film. The phone, full height, spacebar
// forward. Nothing else on screen: OBS captures this window and anything that
// is not the frame is in the shot.
//
// Since 2026-09-04 this draws the SAME PhoneFrame the Review stage draws (Lee:
// "these easy points ones can get away with just the /film possibly?"), so the
// slide Lee approved on /results is, pixel for pixel at a bigger size, the slide
// that films — black surround, the wordmark watermark, the campus banner, all
// by the same rules.
//
// THE TOOLS (2026-09-04, evening). Lee: "It's missing the interactivity tools
// (really all of them are now …) alt + click to grab/move, zooming, spotlights,
// shift click drag to highlight, clicking an answer choice … We've built so
// much great stuff, why isn't it working?" The audit
// (docs/FILM-INTERACTIVITY-AUDIT.md) answered: every tool lives in the canvas
// previewer and reads a React context the canvas popout provides; this route
// mounted the same card INERT with only the highlight context. So this file
// now provides what the live card reads — practice (click an answer, click
// again to resolve, with the sounds), the rehearsal spotlight (Ctrl+click,
// Ctrl+Shift for the super, +Alt for the siren), the shared text highlights
// (Shift+click a word, drag to highlight) — and is the `film-mode` root the
// card stylesheet keys its motion on, with the brand cursor. The camera
// (zoom, O, Alt-move, grips), the F1 arrows, the teleprompter sync and the
// 9:16 pop-out each live in ./capture/* and plug in here.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { BrandCursor } from "@/components/canvas/BrandCursor";
import { MoveContext, PersistContext, PracticeContext, PreviewSpotContext, ScaleContext, WidthContext, type PreviewSpotApi } from "@/components/canvas/CeqPreviewer";
import { playSfx } from "@/components/canvas/sfx";
import { applyRegularClick, applySuperClick, type SpotSets } from "@/components/canvas/spotlight";
import { HighlightContext, useTextHighlights } from "@/components/canvas/text-highlights";

import { BG, CREAM, EDGE, GOLD, MUTED, usePlan } from "./BlastOffEditor";
import { CaptureArrows } from "./capture/arrows";
import { useCaptureCamera } from "./capture/camera";
import { useCapturePopout } from "./capture/popout";
import { useCapturePrompterSyncFrame } from "./capture/prompter-sync";
import { isCamSpot, nextCamSpot, type CamSpot } from "./capture/webcam-spots";
import { camDefault, layoutOf } from "./layout";
import { questionProgress } from "./frame-view";
import { PhoneFrame } from "./PhoneFrame";
import { FRAME_LABEL, filmFrames } from "./plan";

const NO_SPOTS: SpotSets = { regular: new Set(), superKey: null, superTone: "focus" };

export function BlastOffCapture({ set, topicName, onExit }: { set: BoothSetInfo; topicName?: string; onExit: () => void }) {
  const { plan } = usePlan(set);
  const [i, setI] = useState(0);
  const ceqById = useMemo(() => new Map(set.ceqs.map((c) => [c.id, c])), [set.ceqs]);
  // The SHARED highlight store (canvas/text-highlights) — same gesture, same
  // offsets, same gold as the canvas. Session-scoped, so marks survive walking
  // between frames within a rip and die only on ` or leaving capture.
  const { api: hlApi, clearAll: clearAllTextHls } = useTextHighlights();
  // THE PROMPTER (2026-09-03): the lines Lee kept on the review deck, beside
  // the slide they belong to. P hides and shows it.
  const [prompter, setPrompter] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  // Skipped cards never reach a take.
  const frames = useMemo(() => filmFrames(plan?.frames ?? []), [plan]);
  const n = frames.length;
  const idx = Math.min(i, Math.max(0, n - 1));
  const frame = frames[idx];
  const frameId = frame?.id ?? null;
  const ceq = frame?.kind === "ceq" && frame.ceqId ? ceqById.get(frame.ceqId) : undefined;

  // ---- PRACTICE: click a choice to emphasise it, click it again to resolve ----
  // (the canvas's own rule: wrong scratches, correct confirms — with the cue).
  const [emph, setEmph] = useState<number | null>(null);
  const [resolved, setResolved] = useState<Set<number>>(() => new Set());
  const resolveChoice = useCallback((k: number) => {
    const choice = ceq?.choices[k];
    if (resolved.has(k)) { if (choice?.correct) playSfx("chaching"); return; }
    setEmph(k);
    setResolved((r) => new Set(r).add(k));
    if (choice?.correct) playSfx("chaching");
    else if (choice) playSfx("vinylScratch");
  }, [ceq, resolved]);
  const practice = useMemo(() => ({ emph, resolved, select: (k: number) => setEmph(k), resolveChoice }), [emph, resolved, resolveChoice]);

  // ---- THE REHEARSAL SPOTLIGHT: Ctrl+click = a gold pill (re-click a lit one
  // clears all); Ctrl+Shift = the super (🔥); +Alt = the siren (🚨). Same
  // reducers as the canvas (canvas/spotlight.ts), same CSS (PV_CSS).
  const [spots, setSpots] = useState<SpotSets>(NO_SPOTS);
  const spotClick = useCallback((key: string, e: React.PointerEvent) => {
    if (e.ctrlKey && e.shiftKey) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setSpots((s) => applySuperClick(s, key, e.altKey ? "warn" : "focus")); return; }
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setSpots((s) => (s.regular.has(key) || s.superKey === key ? NO_SPOTS : applyRegularClick(s, key))); }
  }, []);
  const spotApi = useMemo<PreviewSpotApi>(() => ({
    state: (key) => (spots.regular.has(key) || spots.superKey === key ? "spot" : null),
    flamed: (key) => spots.superKey === key,
    tone: () => spots.superTone ?? "focus",
    onClick: spotClick,
    any: () => spots.regular.size > 0 || spots.superKey !== null,
  }), [spots, spotClick]);

  // Walking to another slide starts it clean: no emphasis, no spotlight. The
  // text highlights are the one thing that survives a walk (as on the canvas).
  useEffect(() => { setEmph(null); setResolved(new Set()); setSpots(NO_SPOTS); }, [frameId]);
  // THE HERO (2026-09-05): ctrl+click on the camera — the camera takes the top of the frame
  // and the wordmark takes the centre. Lives here, not in the phone, so the next slide, the
  // backtick wipe and B→off all end it (they could not reach the phone's private state).
  const [hero, setHero] = useState(false);
  useEffect(() => { setHero(false); }, [frameId]);
  const resetTake = useCallback(() => { setEmph(null); setResolved(new Set()); setSpots(NO_SPOTS); clearAllTextHls(); setHero(false); }, [clearAllTextHls]);

  // ---- the plug-ins: camera, arrows, teleprompter sync, the 9:16 pop-out ----
  const camera = useCaptureCamera({ hostRef, frameId: frameId ?? "" });
  const popout = useCapturePopout();
  useCapturePrompterSyncFrame(set.id, frame ?? null);
  // Inside the popped-out window the chrome starts hidden — the window IS the shot.
  const [chrome, setChrome] = useState(!popout.isPopout);
  // THE CAMERA for this take: the slide's own spot, or B's override (home →
  // corner → hero → off), which lasts until the next slide.
  const [camOverride, setCamOverride] = useState<CamSpot | null>(null);
  useEffect(() => { setCamOverride(null); }, [frameId]);
  const camNow: CamSpot = camOverride ?? (frame ? (isCamSpot(frame.cam) ? frame.cam : camDefault(layoutOf(plan), frame.kind).spot) : "off");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (e.shiftKey) setI((v) => Math.max(0, v - 1));
        else setI((v) => Math.min(n - 1, v + 1));
      }
      // ` = the full wipe, same mental model as every other filming surface:
      // temporary state goes (emphasis, spotlight, highlights), nothing saved is touched.
      else if (e.code === "Backquote" || e.key === "`") { e.preventDefault(); resetTake(); }
      else if (e.key === "Escape") { e.preventDefault(); onExit(); }
      else if (e.key.toLowerCase() === "h") { e.preventDefault(); setChrome((v) => !v); }
      else if (e.key.toLowerCase() === "p") { e.preventDefault(); setPrompter((v) => !v); }
      else if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); const nx = nextCamSpot(camNow); setCamOverride(nx); if (nx === "off") setHero(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onExit, resetTake, camNow]);

  // FIT THE PHONE to the window: as tall as the window allows, 9:16. Size the
  // browser window to 9:16 (or pop it out) and the phone IS the window.
  const [w, setW] = useState(540);
  useEffect(() => {
    const fit = () => setW(Math.max(240, Math.min(window.innerWidth, Math.floor(window.innerHeight * 9 / 16))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  if (!plan) return <div style={{ minHeight: "100vh", background: BG, color: MUTED, display: "grid", placeItems: "center" }}>Loading the running order…</div>;
  if (n === 0 || !frame) return <div style={{ minHeight: "100vh", background: "#000", color: MUTED, display: "grid", placeItems: "center" }}>Every slide is skipped — nothing to film.</div>;

  return (
    <HighlightContext.Provider value={hlApi}>
    <PracticeContext.Provider value={practice}>
    <PreviewSpotContext.Provider value={spotApi}>
    <MoveContext.Provider value={camera.moveBy}>
    <WidthContext.Provider value={camera.setWidth}>
    <ScaleContext.Provider value={camera.setScale}>
    <PersistContext.Provider value={camera.persist}>
    <div ref={hostRef} className={`film-mode${camera.rootClass ? ` ${camera.rootClass}` : ""}`} onWheel={camera.onWheel}
      style={{ minHeight: "100vh", background: "#000", display: "grid", placeItems: "center", position: "relative", overflow: "hidden" }}>
      <PhoneFrame frame={frame} frames={frames} index={idx} set={set} topicName={topicName} w={w} rounded={false} capture stageStyle={camera.stageStyle} cardOverride={camera.cardOverride} camSpot={camOverride ?? undefined} layout={layoutOf(plan)} hero={hero} onHero={setHero}
        progress={questionProgress(frames, ceqById).get(frame.id)} />
      <CaptureArrows hostRef={hostRef} frameId={frame.id} />
      {/* THE BRAND CURSOR — the bolt, as on the canvas popout. The native
          cursor is hidden; turn "Capture Cursor" off on the OBS source. */}
      <BrandCursor hostRef={hostRef} />
      {chrome && (
        <div style={{
          position: "fixed", left: 12, bottom: 12, display: "flex", gap: 12, alignItems: "center", zIndex: 30,
          background: "rgba(7,11,20,0.86)", border: `1px solid ${EDGE}`, borderRadius: 10,
          padding: "7px 12px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 11.5, color: MUTED,
        }}>
          <span style={{ color: GOLD, fontWeight: 800 }}>{idx + 1} / {n}</span>
          <span>{FRAME_LABEL[frame.kind]}</span>
          <span>B camera {camNow} · space next · shift+space back · wheel zooms, O pulls back, 0 resets · alt+drag moves, alt-hover grips resize · click a choice, click again to resolve · ctrl+click the camera: hero (again, ` or next slide ends it) · ctrl+click spotlight (+shift super, +alt siren) · shift+click a word · F1 move F1 draws an arrow, Delete removes · ` resets · H hide this · P prompter{popout.isPopout ? " · F fullscreen" : ""} · esc exit</span>
          {popout.open && !popout.isPopout && (
            <button onClick={popout.open} title="Open this page as its own 9:16 window, snapped to 1080×1920 for OBS"
              style={{ color: GOLD, background: "none", border: `1px solid ${GOLD}66`, borderRadius: 6, padding: "2px 8px", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>⧉ pop out 9:16</button>
          )}
          {popout.status && <span style={{ color: CREAM }}>{popout.status}</span>}
        </div>
      )}
      {prompter && (frame.prompter?.length ?? 0) > 0 && (
        <div style={{
          position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)", width: 300, maxHeight: "80vh", overflowY: "auto", zIndex: 30,
          background: "rgba(7,11,20,0.88)", border: `1px solid ${EDGE}`, borderRadius: 12, padding: "10px 14px",
          fontFamily: "'Rubik', system-ui, sans-serif", color: CREAM,
        }}>
          <div style={{ fontSize: 10, color: GOLD, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>Prompter</div>
          {frame.prompter!.map((line, k) => (
            <div key={k} style={{ fontSize: 17, lineHeight: 1.35, fontWeight: 600, padding: "5px 0", borderTop: k ? `1px solid ${EDGE}` : "none" }}>{line}</div>
          ))}
        </div>
      )}
    </div>
    </PersistContext.Provider>
    </ScaleContext.Provider>
    </WidthContext.Provider>
    </MoveContext.Provider>
    </PreviewSpotContext.Provider>
    </PracticeContext.Provider>
    </HighlightContext.Provider>
  );
}
