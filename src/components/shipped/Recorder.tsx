// THE SHIPPED RECORDER — camera + mic, browser-native (MediaRecorder), nothing else. Lee,
// 2026-09-05: "This is intentionally a browser-native recorder, not an OBS replacement." No
// screen capture, no scenes, no editing — V1 is Record, Stop, done.
import { useCallback, useEffect, useRef, useState } from "react";

import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { BRAND_FONT, DISPLAY_FONT } from "@/components/blastoff/stage";
import { useDictation } from "@/lib/use-dictation";

import { SHIPPED_OUTRO_LINES } from "./model";
import { BoltWatermark } from "./BoltWatermark";
import { NotepadSurface } from "./NotepadSurface";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.18)", INK = "#05070D", REC_RED = "#FF3B30", MINT = "#3BF5A0";

const MIME_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

export interface RecorderResult { blob: Blob; durationSeconds: number; transcriptLive: string }

export function Recorder({ semester, dateLabel, notepadOpen, notesHtml, onNotesChange, onToggleNotepad, onStopped, onDiscard, onClose }: {
  semester: string;
  dateLabel: string;
  notepadOpen: boolean;
  notesHtml: string;
  onNotesChange: (html: string) => void;
  onToggleNotepad: () => void;
  onStopped: (r: RecorderResult) => void;
  onDiscard: () => void;
  /** Escape while NOT recording. Ignored while a take is in progress — a session is never lost
   *  to a stray key. */
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const finalTranscriptRef = useRef("");

  const [camState, setCamState] = useState<"opening" | "ready" | "denied">("opening");
  const [camError, setCamError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [outro, setOutro] = useState(false);
  const [interim, setInterim] = useState("");
  const [captionLine, setCaptionLine] = useState("");
  // FLOATING CIRCLE (Lee, 2026-09-05, mid-recording: "press R again to go back and forth to
  // either my browser tab, where my camera becomes floating circle frame, or come back to do
  // the outro"). Collapses the full-screen recorder to a small draggable bubble so the rest of
  // the site is fully clickable underneath — for showing something on camera without cutting
  // the take. MediaRecorder and dictation both keep running; nothing about the recording itself
  // changes, only how much of the screen the recorder's own UI occupies.
  const [minimized, setMinimized] = useState(false);
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null); // null = default corner
  const dragRef = useRef<{ startX: number; startY: number; fromX: number; fromY: number; moved: boolean } | null>(null);
  // POP OUT (Lee, 2026-09-05: "is it possible that the video could follow me around to other
  // tabs?") — the in-page bubble only follows within this one tab; a real OS-level floating
  // window (Document Picture-in-Picture, Chrome/Edge) follows across tabs and other apps too.
  // An additional step ON the bubble, not a replacement for it — unsupported browsers just
  // never see the button, and the bubble works exactly as before.
  const pipSupported = typeof window !== "undefined" && !!window.documentPictureInPicture;
  const [poppedOut, setPoppedOut] = useState(false);
  const pipRef = useRef<Window | null>(null);
  const pipTimerElRef = useRef<HTMLElement | null>(null);
  const pipIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dictation = useDictation((final, live) => {
    if (final) { finalTranscriptRef.current = (finalTranscriptRef.current + " " + final).trim(); setCaptionLine(final.trim()); }
    setInterim(live);
  });

  // 1. THE CAMERA + MIC — requested the moment the recorder opens, per the brief.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true }).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamState("ready");
    }).catch((e) => { if (!cancelled) { setCamState("denied"); setCamError(e instanceof Error ? e.message : String(e)); } });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // The elapsed timer — one interval, only while recording.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [recording]);

  const start = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || recording) return;
    chunksRef.current = [];
    finalTranscriptRef.current = "";
    setCaptionLine(""); setInterim(""); setOutro(false); setElapsed(0);
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start(1000);
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    setRecording(true);
    // CAPTIONS ARE NEVER ALLOWED TO BREAK RECORDING (brief §3) — dictation is best-effort and
    // failing to start it does nothing but leave the caption line blank.
    if (dictation.supported) { try { dictation.start(); } catch { /* captions just won't show */ } }
  }, [recording, dictation]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || !recording) return;
    dictation.stop();
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
      setRecording(false); setOutro(false);
      onStopped({ blob, durationSeconds, transcriptLive: finalTranscriptRef.current.trim() });
    };
    rec.stop();
  }, [recording, dictation, onStopped]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // The notepad closes first (brief §6: "I press N or Escape… recording never stops");
        // only when it's already closed does Escape reach for the recorder itself, and even
        // then never while a take is running.
        if (notepadOpen) { e.stopPropagation(); onToggleNotepad(); return; }
        if (!recording) { e.stopPropagation(); onClose(); }
        return;
      }
      if (e.key.toLowerCase() === "n" && !isTyping(e.target)) { e.preventDefault(); onToggleNotepad(); }
      // R toggles the floating circle — ONLY while an actual take is running; before that, R
      // already opened this recorder (ShippedDock) and has nothing else to do here.
      if (e.key.toLowerCase() === "r" && !isTyping(e.target) && recording) { e.preventDefault(); setMinimized((v) => !v); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, notepadOpen, onClose, onToggleNotepad]);

  const discard = () => {
    if (recording) { recorderRef.current?.stop(); dictation.stop(); }
    onDiscard();
  };

  // THE BUBBLE'S DRAG — a plain pointer-capture drag, exactly the pattern already used for the
  // illustration's placement grip (IllustrationLayer.tsx): move past a few px counts as a drag,
  // not a click, so tapping the bubble to restore the full view still works.
  const bubbleDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, fromX: bubblePos?.x ?? rect.left, fromY: bubblePos?.y ?? rect.top, moved: false };
  };
  const bubbleMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const bubble = 96;
    const x = Math.min(window.innerWidth - bubble - 8, Math.max(8, d.fromX + dx));
    const y = Math.min(window.innerHeight - bubble - 8, Math.max(8, d.fromY + dy));
    setBubblePos({ x, y });
  };
  const bubbleUp = () => {
    const moved = dragRef.current?.moved;
    dragRef.current = null;
    if (!moved) setMinimized(false); // a plain tap restores the full recorder
  };

  // Ends the floating window from any cause — the bubble's own ×, the window's native close
  // button, or the tab navigating away — so in-page state never drifts from what's on screen.
  const closePip = useCallback(() => {
    if (pipIntervalRef.current) { clearInterval(pipIntervalRef.current); pipIntervalRef.current = null; }
    pipRef.current?.close();
    pipRef.current = null;
    pipTimerElRef.current = null;
    setPoppedOut(false);
  }, []);

  const popOut = useCallback(async () => {
    const stream = streamRef.current;
    const docPip = typeof window !== "undefined" ? window.documentPictureInPicture : undefined;
    if (!stream || !docPip) return;
    try {
      const pip = await docPip.requestWindow({ width: 220, height: 250 });
      pip.document.title = "SHIPPED — recording";
      const style = pip.document.createElement("style");
      style.textContent = `
        html,body{margin:0;height:100%;background:${INK};overflow:hidden;font-family:system-ui,sans-serif;}
        .wrap{position:relative;width:100%;height:100%;}
        video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block;}
        .dot{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:10px;height:10px;border-radius:5px;background:${REC_RED};animation:sa-pip-pulse 1.1s ease-in-out infinite;}
        .timer{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-size:13px;font-weight:800;color:${CREAM};text-shadow:0 1px 3px rgba(0,0,0,0.8);}
        .back{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:11px;border:none;background:rgba(0,0,0,0.55);color:${CREAM};font-size:12px;font-weight:800;cursor:pointer;line-height:22px;padding:0;}
        @keyframes sa-pip-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,59,48,.55);}50%{box-shadow:0 0 0 6px rgba(255,59,48,0);}}
      `;
      pip.document.head.append(style);

      const wrap = pip.document.createElement("div");
      wrap.className = "wrap";
      const video = pip.document.createElement("video");
      video.autoplay = true; video.muted = true; video.playsInline = true;
      video.srcObject = stream;
      const dot = pip.document.createElement("span"); dot.className = "dot";
      const timer = pip.document.createElement("span"); timer.className = "timer";
      timer.textContent = fmtElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
      const back = pip.document.createElement("button");
      back.type = "button"; back.className = "back"; back.textContent = "×";
      back.title = "Close the floating window — the bubble comes back";
      back.addEventListener("click", () => pip.close());
      wrap.append(video, dot, timer, back);
      pip.document.body.append(wrap);
      void video.play().catch(() => { /* autoplay is muted + gesture-initiated; a rare denial just leaves a still frame */ });

      pipTimerElRef.current = timer;
      pipIntervalRef.current = setInterval(() => {
        if (pipTimerElRef.current) pipTimerElRef.current.textContent = fmtElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
      }, 250);
      // Covers every way the window can end: the × above, the OS window's own close control,
      // or the tab that opened it going away.
      pip.addEventListener("pagehide", () => {
        if (pipIntervalRef.current) { clearInterval(pipIntervalRef.current); pipIntervalRef.current = null; }
        pipTimerElRef.current = null;
        pipRef.current = null;
        setPoppedOut(false);
      }, { once: true });

      pipRef.current = pip;
      setPoppedOut(true);
    } catch {
      // Blocked, or the gesture requirement wasn't met — the in-page bubble is still right
      // there, so this fails quietly rather than throwing an error over a live recording.
    }
  }, []);

  // If the whole recorder unmounts (stop, discard, close) while a window is still floating,
  // it goes with it — nothing keeps recording after the take has already ended.
  useEffect(() => () => { if (pipIntervalRef.current) clearInterval(pipIntervalRef.current); pipRef.current?.close(); }, []);

  const shrink = notepadOpen || outro; // the camera becomes a small PiP so the foreground can take the space

  if (minimized) {
    const bubble = 96;
    const pos = bubblePos ?? { x: window.innerWidth - bubble - 24, y: window.innerHeight - bubble - 24 };
    return (
      <div
        onPointerDown={bubbleDown}
        onPointerMove={bubbleMove}
        onPointerUp={bubbleUp}
        onPointerCancel={bubbleUp}
        title="Tap to bring the recorder back — R does the same"
        style={{
          position: "fixed", left: pos.x, top: pos.y, width: bubble, height: bubble, zIndex: 2147483000,
          borderRadius: "50%", overflow: "hidden", border: `3px solid ${GOLD}`, boxShadow: "0 12px 30px rgba(0,0,0,0.55)",
          cursor: "grab", touchAction: "none", background: INK,
        }}
      >
        {poppedOut ? (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: MUTED, fontSize: 28, pointerEvents: "none" }}>⤢</div>
        ) : (
          <video autoPlay muted playsInline ref={(el) => { if (el && streamRef.current) el.srcObject = streamRef.current; }}
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", pointerEvents: "none" }} />
        )}
        <span aria-hidden style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 9, height: 9, borderRadius: 5, background: REC_RED, boxShadow: `0 0 0 0 ${REC_RED}`, animation: "sa-rec-pulse 1.1s ease-in-out infinite", pointerEvents: "none" }} />
        <span aria-hidden style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: 800, color: CREAM, textShadow: "0 1px 3px rgba(0,0,0,0.8)", pointerEvents: "none" }}>{fmtElapsed(elapsed)}</span>
        {pipSupported && (
          <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); if (poppedOut) closePip(); else void popOut(); }}
            title={poppedOut ? "Bring the preview back into this bubble" : "Pop out into its own floating window — follows you across tabs and other apps (Chrome/Edge)"}
            style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, border: "none", background: "rgba(0,0,0,0.5)", color: CREAM, fontSize: 11, fontWeight: 800, cursor: "pointer", lineHeight: "20px", padding: 0 }}>
            {poppedOut ? "↩" : "⤢"}
          </button>
        )}
        <style>{`@keyframes sa-rec-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,59,48,0.55);} 50% { box-shadow: 0 0 0 6px rgba(255,59,48,0);} }`}</style>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(3,5,10,0.94)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", color: CREAM, fontFamily: BRAND_FONT }}>
      {/* HEADER */}
      <div style={{ marginTop: shrink ? 14 : 28, textAlign: "center", transition: "margin 220ms ease" }}>
        <SurviveWordmark size={shrink ? 20 : 30} />
        <div style={{ marginTop: 6, fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: shrink ? 15 : 22, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD }}>SHIPPED</div>
        {!shrink && <div style={{ marginTop: 4, fontSize: 13, color: MUTED }}>{dateLabel} · {semester}</div>}
      </div>

      {!shrink && (
        <>
          {/* CAMERA PREVIEW */}
          <div style={{ marginTop: 22, position: "relative", width: "min(88vw, 520px)", aspectRatio: "16 / 10", borderRadius: 18, overflow: "hidden", background: INK, border: `1px solid ${EDGE}` }}>
            <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
            {camState === "opening" && <Centered>Asking for your camera and microphone…</Centered>}
            {camState === "denied" && <Centered tone="bad">Camera/mic blocked — allow them for this site, then reopen with R.{camError ? ` (${camError})` : ""}</Centered>}
            {recording && (
              <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.55)", borderRadius: 999, padding: "5px 12px" }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: REC_RED, boxShadow: `0 0 0 0 ${REC_RED}`, animation: "sa-rec-pulse 1.1s ease-in-out infinite" }} />
                <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.04em" }}>{fmtElapsed(elapsed)}</span>
              </div>
            )}
          </div>

          {/* LIVE CAPTIONS */}
          <div style={{ marginTop: 12, minHeight: 24, width: "min(88vw, 520px)", textAlign: "center", fontSize: 14, color: CREAM, opacity: 0.85 }}>
            {recording ? (dictation.supported ? (captionLine || interim || "…") + (interim ? " " + interim : "") : "captions unavailable — recording continues") : " "}
          </div>
        </>
      )}

      {/* THE NOTEPAD, IN-SESSION (brief §6): the camera shrinks to the PiP above/below, the
          notepad takes the stage, recording and captions both keep running underneath. */}
      {notepadOpen && (
        <div style={{ flex: 1, width: "100%", display: "flex", justifyContent: "center", padding: "8px 16px 0", minHeight: 0 }}>
          <NotepadSurface html={notesHtml} onChange={onNotesChange} autoFocus compact />
        </div>
      )}

      {/* THE PiP — camera shrinks here while the notepad or the outro takes the stage. */}
      {shrink && (
        <div style={{ position: "fixed", right: 20, bottom: 92, width: 150, aspectRatio: "16 / 10", borderRadius: 12, overflow: "hidden", border: `2px solid ${GOLD}88`, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", background: INK, zIndex: 2 }}>
          <video autoPlay muted playsInline ref={(el) => { if (el && streamRef.current) el.srcObject = streamRef.current; }} style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
          {recording && <span style={{ position: "absolute", top: 6, left: 6, width: 8, height: 8, borderRadius: 4, background: REC_RED }} />}
        </div>
      )}

      {/* THE OUTRO — a CTA backdrop over the recording; it never stops the take. */}
      {outro && !notepadOpen && (
        <div style={{ flex: 1, position: "relative", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BoltWatermark size={340} opacity={0.1} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }} />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            {SHIPPED_OUTRO_LINES.map((l, i) => (
              <div key={l} style={{ fontFamily: i === 0 ? BRAND_FONT : DISPLAY_FONT, fontWeight: i === 0 ? 600 : 800, fontSize: i === 0 ? 16 : 26, letterSpacing: i === 0 ? "0.02em" : "0.03em", color: i === 0 ? GOLD : CREAM, textTransform: i === 0 ? "none" : "uppercase" }}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {/* CONTROL BAR */}
      <div style={{ marginTop: outro && !notepadOpen ? 0 : "auto", marginBottom: 26, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", padding: "0 16px" }}>
        {!recording ? (
          <Btn primary onClick={start} disabled={camState !== "ready"}>● Record</Btn>
        ) : (
          <Btn primary tone={REC_RED} onClick={stop}>■ Stop</Btn>
        )}
        {recording && <Btn onClick={() => setMinimized(true)} title="Shrink to a floating circle so the rest of the site is clickable — R does the same">◯ Float</Btn>}
        {recording && <Btn onClick={onToggleNotepad} active={notepadOpen}>✎ Notes</Btn>}
        {recording && <Btn onClick={() => setOutro((v) => !v)} active={outro}>Outro</Btn>}
        <Btn onClick={discard} tone="#FF9F43">Discard</Btn>
        {!recording && <Btn onClick={onClose}>Close</Btn>}
      </div>
      <style>{`@keyframes sa-rec-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,59,48,0.55);} 50% { box-shadow: 0 0 0 6px rgba(255,59,48,0);} }`}</style>
    </div>
  );
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: "bad" }) {
  return <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20, textAlign: "center", fontSize: 13, color: tone === "bad" ? "#FF8B7E" : MUTED }}>{children}</div>;
}

function Btn({ children, onClick, primary, active, disabled, tone, title }: { children: React.ReactNode; onClick: () => void; primary?: boolean; active?: boolean; disabled?: boolean; tone?: string; title?: string }) {
  const color = tone ?? (primary ? "#0B0F1E" : CREAM);
  const bg = primary ? (tone ?? GOLD) : active ? "rgba(252,163,17,0.16)" : "transparent";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ font: "inherit", fontSize: 14, fontWeight: 800, padding: "10px 18px", borderRadius: 999, border: `1px solid ${primary ? "transparent" : active ? GOLD : EDGE}`, background: bg, color, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1 }}>
      {children}
    </button>
  );
}

function fmtElapsed(s: number): string { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || !!el.isContentEditable);
}
