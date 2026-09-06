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
import { applyRegularClick, applySuperClick, type SpotSets } from "@/components/canvas/spotlight";
import { HighlightContext, useTextHighlights } from "@/components/canvas/text-highlights";
import { recentCannedLineUses } from "@/lib/canned-lines.functions";
import { useDictation } from "@/lib/use-dictation";

import { BG, CREAM, EDGE, GOLD, MUTED, usePlan } from "./BlastOffEditor";
import { cannedLinesFor, pickCannedLine, type CannedLine, type CannedSlot } from "./canned-lines";
import { CaptureArrows } from "./capture/arrows";
import { useCaptureCamera } from "./capture/camera";
import { useCapturePopout } from "./capture/popout";
import { useCapturePrompterSyncFrame } from "./capture/prompter-sync";
import { useTeleprompterPopout } from "./capture/teleprompter-popout";
import { isCamSpot, nextCamSpot, type CamSpot } from "./capture/webcam-spots";
import { camDefault, layoutOf, type RailStatus } from "./layout";
import { questionProgress } from "./frame-view";
import { PhoneFrame } from "./PhoneFrame";
import { FRAME_LABEL, filmFrames, patchFrame, type BlastFrame } from "./plan";
import { RehearsalReview } from "./RehearsalReview";
import { SlideEditContext } from "./slide-edit";

/** open/intro share the "intro" slot (one spoken line, two frames); bio and outro are their own. */
function cannedSlotOf(kind: BlastFrame["kind"]): CannedSlot | null {
  if (kind === "open" || kind === "intro") return "intro";
  if (kind === "outro") return "outro";
  if (kind === "bio") return "bio";
  return null;
}

const NO_SPOTS: SpotSets = { regular: new Set(), superKey: null, superTone: "focus" };

export function BlastOffCapture({ set, topicName, onExit }: { set: BoothSetInfo; topicName?: string; onExit: () => void }) {
  const { plan, commit } = usePlan(set);
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

  // POPOUT-ONLY EDITING (2026-09-06, Lee: "let the illustrations be picked up and movable
  // resizable from capture popout window"). slide-edit.ts's own rule is that capture never
  // provides this context — a real, deliberate choice so nothing shifts mid-take by accident —
  // so this only reaches PhoneFrame at all when popout.isPopout is true (below), never in the
  // plain in-page capture. Patches the CURRENT frame only, straight onto the plan.
  const patchCurrentFrame = useCallback((p: Partial<BlastFrame>) => { if (plan && frameId) commit(patchFrame(plan.frames, frameId, p)); }, [plan, commit, frameId]);

  // ---- REHEARSAL (2026-09-06, second pass). Lee: "I can't see the teleprompter or understand
  // how it works... I'd prefer to see it somewhere on film. Flip on teleprompter, then I record
  // like I normally would. Same pop out window. But it's letting me talk about each slide and
  // run through what I plan to say. Then we have the review at the end, then we go nail it and
  // move to next video." So this lives right here, in the real capture surface — R toggles
  // rehearsing (or the chip in the chrome bar); walking slide to slide while it's on (the exact
  // same spacebar navigation as a real take) dictates into `segments`, keyed by frame id; Review
  // turns each into a suggested line Lee approves/revises/edits, which lands on frame.prompter —
  // the SAME prompter panel below then shows it once he's back to actually filming.
  const [rehearsing, setRehearsing] = useState(false);
  const [segments, setSegments] = useState<Record<string, string>>({});
  // LIVE CAPTION (2026-09-06): Lee: "as I'm talking, just live dictate over there... seeing the
  // words populate will help me get a feel for brevity visually." `interim` is the in-progress,
  // not-yet-finalized chunk SpeechRecognition is still working out — shown live, replaced (not
  // accumulated) on every event; only a FINAL chunk joins `segments`.
  const [interim, setInterim] = useState("");
  const [showReview, setShowReview] = useState(false);
  const frameIdRef = useRef(frameId);
  frameIdRef.current = frameId;
  const dictation = useDictation((final, live) => {
    const fid = frameIdRef.current;
    setInterim(live);
    if (!final.trim() || !fid) return;
    setSegments((s) => ({ ...s, [fid]: (s[fid] ? s[fid] + " " : "") + final.trim() }));
  });
  useEffect(() => {
    if (!rehearsing || !dictation.supported) return;
    dictation.start();
    return () => dictation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rehearsing]);
  useEffect(() => { setInterim(""); }, [frameId]);
  const commitPrompterLine = useCallback((fid: string, line: string) => { if (plan) commit(patchFrame(plan.frames, fid, { prompter: [line] })); }, [plan, commit]);
  const closeReview = useCallback((stopRehearsing: boolean) => { setShowReview(false); if (stopRehearsing) setRehearsing(false); }, []);
  const segmentCount = Object.keys(segments).length;
  // R to STOP auto-opens review — Lee: "once I finish, I can hit R and stop, and it will auto
  // generate the suggested lines." Turning ON is unchanged (just starts listening).
  const toggleRehearsing = useCallback(() => {
    setRehearsing((v) => { const next = !v; if (!next) setShowReview(true); return next; });
  }, []);

  // ---- CANNED INTRO/OUTRO/BIO (2026-09-06). Lee: "when I am in rehearse mode, I want to
  // already have the suggested intro/outro/bio canned ready. So I can start practicing using
  // it." Picked ONCE per mount (not re-rolled every time Lee walks back to the slide — a
  // suggestion that changes under him mid-rehearsal would be its own kind of confusing), fed to
  // the prompter panel below as a clearly-marked SUGGESTION until Review actually commits one,
  // and handed to RehearsalReview as the seed for its own picker so the line Lee practiced with
  // is the same one preselected there — never a second, different roll.
  const [cannedPicks, setCannedPicks] = useState<Partial<Record<CannedSlot, CannedLine>>>({});
  useEffect(() => {
    let live = true;
    Promise.all((["intro", "outro", "bio"] as const).map((slot) =>
      recentCannedLineUses({ data: { slot } })
        .then((recent) => [slot, pickCannedLine(cannedLinesFor(slot), slot, recent)] as const)
        .catch(() => [slot, cannedLinesFor(slot)[0] ?? null] as const)
    )).then((entries) => {
      if (!live) return;
      const picks: Partial<Record<CannedSlot, CannedLine>> = {};
      for (const [slot, pick] of entries) if (pick) picks[slot] = pick;
      setCannedPicks(picks);
    });
    return () => { live = false; };
  }, []);
  const cannedSlot = cannedSlotOf(frame?.kind ?? "ceq");
  const cannedSuggestion = cannedSlot ? cannedPicks[cannedSlot] ?? null : null;

  // ---- PRACTICE: click a choice to emphasise it, click it again to resolve ----
  // No sound cue at all now (Lee, 2026-09-06: "Remove cha ching in capture mode"... "Remove
  // scratch out sound too") — the canvas's own per-question confirmSfx toggle is untouched;
  // this is Blast Off Film's own resolve, and it never had that toggle to begin with, it just
  // always played both.
  const [emph, setEmph] = useState<number | null>(null);
  const [resolved, setResolved] = useState<Set<number>>(() => new Set());
  const resolveChoice = useCallback((k: number) => {
    if (resolved.has(k)) return;
    setEmph(k);
    setResolved((r) => new Set(r).add(k));
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
  // THE CAPTION RAIL CHECK: the phone reports whether the card or the camera sits on the
  // fixed rail; the chrome bar says so before the take, not after the burn.
  const [railStatus, setRailStatus] = useState<RailStatus>("clear");
  const resetTake = useCallback(() => { setEmph(null); setResolved(new Set()); setSpots(NO_SPOTS); clearAllTextHls(); setHero(false); }, [clearAllTextHls]);

  // ---- the plug-ins: camera, arrows, teleprompter sync, the 9:16 pop-out ----
  const camera = useCaptureCamera({ hostRef, frameId: frameId ?? "" });
  const popout = useCapturePopout();
  const openTeleprompter = useTeleprompterPopout(set.id);
  useCapturePrompterSyncFrame(set.id, frame ?? null);
  // Inside the popped-out window the chrome starts hidden — the window IS the shot.
  const [chrome, setChrome] = useState(!popout.isPopout);
  // THE CAMERA for this take: the slide's own spot, or B's override (home →
  // corner → hero → off), which lasts until the next slide.
  const [camOverride, setCamOverride] = useState<CamSpot | null>(null);
  useEffect(() => { setCamOverride(null); }, [frameId]);
  const camNow: CamSpot = camOverride ?? (frame ? (isCamSpot(frame.cam) ? frame.cam : camDefault(layoutOf(plan), frame.kind).spot) : "off");
  // A QA override left on the filming PC films the wrong pass — say so in the chrome (audit §2.15).
  const qaLayout = (() => { try { return typeof window !== "undefined" ? window.localStorage.getItem("sa-layout-qa") : null; } catch { return null; } })();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (showReview) {
        // The review overlay is a modal on top of capture — Escape backs out of IT first,
        // never straight past it out of Film. Every other shortcut is capture's own and stays
        // inert while it's up (the overlay has its own buttons/inputs).
        if (e.key === "Escape") { e.preventDefault(); closeReview(false); }
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (e.shiftKey) setI((v) => Math.max(0, v - 1));
        else setI((v) => Math.min(n - 1, v + 1));
      }
      // ` = the full wipe, same mental model as every other filming surface: temporary state
      // goes (emphasis, spotlight, highlights), nothing saved is touched. While rehearsing, it
      // ALSO clears this slide's dictated segment — Lee: "I'll run through up to 3 takes of
      // it" — so a take he doesn't like doesn't just pile onto the next attempt. And it drops
      // chrome (2026-09-06, Lee: "selector box and resize tools visible on one of my
      // illustrations. Not let those be shown. Or if I hit ` it can override to remove them from
      // screen if needed") — the illustration's drag/resize decorations are gated on chrome
      // (below), so this is the guaranteed "get it off screen" reset, on top of chrome already
      // defaulting off in the popout.
      else if (e.code === "Backquote" || e.key === "`") {
        e.preventDefault(); resetTake(); setInterim(""); setChrome(false);
        if (rehearsing && frameId) setSegments((s) => { if (!(frameId in s)) return s; const n = { ...s }; delete n[frameId]; return n; });
      }
      else if (e.key === "Escape") { e.preventDefault(); onExit(); }
      else if (e.key.toLowerCase() === "h") { e.preventDefault(); setChrome((v) => !v); }
      else if (e.key.toLowerCase() === "p") { e.preventDefault(); setPrompter((v) => !v); }
      else if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggleRehearsing(); }
      else if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); const nx = nextCamSpot(camNow); setCamOverride(nx); if (nx === "off") setHero(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onExit, resetTake, camNow, showReview, closeReview, rehearsing, frameId, toggleRehearsing]);

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
      {/* Gated on `chrome` too (2026-09-06) — not just popout — so the illustration's drag/
          resize decorations (IllustrationLayer.tsx's dashed border + grip, drawn any time
          onPlace exists at all) never persist into the shot: they're only live while chrome is
          visible (H, or off by default in the popout, or forced off by ` — see the keydown
          handler above), same as everything else that's setup-only, never filmed. */}
      <SlideEditContext.Provider value={popout.isPopout && chrome ? patchCurrentFrame : null}>
        <PhoneFrame frame={frame} frames={frames} index={idx} set={set} topicName={topicName} w={w} rounded={false} capture popout={popout.isPopout} stageStyle={camera.stageStyle} cardOverride={camera.cardOverride} camSpot={camOverride ?? undefined} layout={layoutOf(plan)} hero={hero} onHero={setHero} onRailStatus={setRailStatus}
          progress={questionProgress(frames, ceqById).get(frame.id)} />
      </SlideEditContext.Provider>
      <CaptureArrows hostRef={hostRef} frameId={frame.id} />
      {/* THE BRAND CURSOR — the bolt, as on the canvas popout. The native
          cursor is hidden; turn "Capture Cursor" off on the OBS source. */}
      {/* Lee, 2026-09-06: "don't show the bolt cursor on intro 1 and intro 2 slides" — the
          wordmark itself already has an animated bolt there; a second one following the mouse
          competes with it. */}
      <BrandCursor hostRef={hostRef} enabled={frame.kind !== "open" && frame.kind !== "intro"} />
      {chrome && (
        <div style={{
          position: "fixed", left: 12, bottom: 12, display: "flex", gap: 12, alignItems: "center", zIndex: 30,
          background: "rgba(7,11,20,0.86)", border: `1px solid ${EDGE}`, borderRadius: 10,
          padding: "7px 12px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 11.5, color: MUTED,
        }}>
          <span style={{ color: GOLD, fontWeight: 800 }}>{idx + 1} / {n}</span>
          <span>{FRAME_LABEL[frame.kind]}</span>
          {qaLayout && <span title="localStorage sa-layout-qa is set on this browser — the take films THIS pass, not the set's" style={{ color: "#FF7A59", fontWeight: 800 }}>layout override: {qaLayout}</span>}
          <span title="The fixed caption rail (layout.ts CAPTION_RAIL): where the burned captions will land on this slide"
            style={{ color: railStatus === "clear" ? MUTED : GOLD, fontWeight: railStatus === "clear" ? 500 : 800 }}>
            {railStatus === "clear" ? "captions clear" : railStatus === "card" ? "captions: ON THE CARD" : railStatus === "illustration" ? "captions: ON THE PICTURE" : "captions: under the camera"}
          </span>
          <span>B camera {camNow} · space next · shift+space back · wheel zooms, O pulls back, 0 resets · alt+drag moves, alt-hover grips resize · click a choice, click again to resolve · ctrl+click the camera: hero (again, ` or next slide ends it) · ctrl+click spotlight (+shift super, +alt siren) · shift+click a word · F1 move F1 draws an arrow, Delete removes · ` resets · H hide this · P prompter · R rehearse{popout.isPopout ? " · F fullscreen" : ""} · esc exit</span>
          {/* REHEARSAL (2026-09-06, second pass): the toggle lives right here, in the same chrome
              bar as everything else about this take — Lee: "I'd prefer to see it somewhere on
              film." On: dictation runs, accumulating what's said per slide as you walk normally. */}
          <button onClick={toggleRehearsing} title="Talk through each slide (R) — nothing is recorded, just transcribed. Stop (R again) opens the review"
            style={{ color: rehearsing ? "#000" : GOLD, background: rehearsing ? "#3BF5A0" : "none", border: `1px solid ${rehearsing ? "#3BF5A0" : GOLD + "66"}`, borderRadius: 6, padding: "2px 8px", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>
            {rehearsing ? "🎙 rehearsing" : "🎙 rehearse"}
          </button>
          {rehearsing && (
            <span style={{ color: dictation.on ? "#3BF5A0" : "#FF9F43", fontWeight: 700 }}>
              {dictation.supported ? (dictation.on ? "listening" : "not listening") : "dictation unsupported — try Chrome"}
            </span>
          )}
          {segmentCount > 0 && (
            <button onClick={() => setShowReview(true)} title="Turn what's been said into suggested lines for the prompter"
              style={{ color: "#14213D", background: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, padding: "2px 8px", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>
              review {segmentCount} →
            </button>
          )}
          {popout.open && !popout.isPopout && (
            <button onClick={popout.open} title="Open this page as its own 9:16 window, snapped to 1080×1920 for OBS"
              style={{ color: GOLD, background: "none", border: `1px solid ${GOLD}66`, borderRadius: 6, padding: "2px 8px", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>⧉ pop out 9:16</button>
          )}
          {/* TELEPROMPTER POPOUT (2026-09-06): its own window, not the embedded panel below —
              Lee: "prompter appears in the popped out one, it's in the way of filming... I can
              place it to the side of popped out film capture." */}
          {!popout.isPopout && (
            <button onClick={openTeleprompter} title="Open the teleprompter in its own window — place it beside the film pop-out, off camera"
              style={{ color: GOLD, background: "none", border: `1px solid ${GOLD}66`, borderRadius: 6, padding: "2px 8px", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>⧉ pop out teleprompter</button>
          )}
          {popout.status && <span style={{ color: CREAM }}>{popout.status}</span>}
        </div>
      )}
      {showReview && (
        <RehearsalReview set={set} frames={frames} ceqById={ceqById} segments={segments} initialPicks={cannedPicks} onCommitLine={commitPrompterLine} onClose={closeReview} />
      )}
      {/* LIVE DICTATION CAPTION (2026-09-06). Lee: "as I'm talking, just live dictate over
          there... seeing the words populate will help me get a feel for brevity visually." What's
          already final for this slide, plus whatever's still in progress — cleared by walking to
          a new slide or by ` (a fresh take). */}
      {rehearsing && (segments[frameId ?? ""] || interim) && (
        <div style={{
          position: "fixed", left: "50%", bottom: chrome ? 60 : 16, transform: "translateX(-50%)", zIndex: 30,
          maxWidth: "min(640px, 86vw)", background: "rgba(7,11,20,0.88)", border: `1px solid ${EDGE}`, borderRadius: 12,
          padding: "10px 16px", fontFamily: "'Rubik', system-ui, sans-serif", color: CREAM, fontSize: 15, lineHeight: 1.4, textAlign: "center",
        }}>
          {segments[frameId ?? ""]}
          {interim && <span style={{ color: MUTED }}> {interim}</span>}
        </div>
      )}
      {/* Never inside the true film pop-out (2026-09-06, Lee: "prompter appears in the popped
          out one, it's in the way of filming") — that window IS the shot; the teleprompter now
          has its own separate pop-out (the button above) instead. Still shown in the main
          window (P toggles it there) and, harmlessly, in Review/authoring contexts. */}
      {prompter && !popout.isPopout && (() => {
        // A committed prompter line always wins; otherwise, on a canned slide (open/intro/outro/
        // bio) with nothing committed yet, the auto-picked suggestion fills the panel so Lee can
        // already rehearse with it — Lee: "I want to already have the suggested intro/outro/bio
        // canned ready. So I can start practicing using it." Clearly marked SUGGESTED until
        // Review actually commits one.
        const committed = frame.prompter ?? [];
        const lines = committed.length ? committed : cannedSuggestion ? [cannedSuggestion.text] : [];
        if (lines.length === 0) return null;
        const suggested = committed.length === 0;
        return (
          <div style={{
            position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)", width: 300, maxHeight: "80vh", overflowY: "auto", zIndex: 30,
            background: "rgba(7,11,20,0.88)", border: `1px ${suggested ? "dashed" : "solid"} ${EDGE}`, borderRadius: 12, padding: "10px 14px",
            fontFamily: "'Rubik', system-ui, sans-serif", color: CREAM,
          }}>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
              Prompter{suggested ? " · suggested" : ""}
            </div>
            {lines.map((line, k) => (
              <div key={k} style={{ fontSize: 17, lineHeight: 1.35, fontWeight: 600, padding: "5px 0", borderTop: k ? `1px solid ${EDGE}` : "none" }}>{line}</div>
            ))}
          </div>
        );
      })()}
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
