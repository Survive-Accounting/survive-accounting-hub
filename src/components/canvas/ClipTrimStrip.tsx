// CLIP TRIM STRIP (P2) — the waveform under a clip row in the Pipeline stack:
// peaks, landmark ticks, and two draggable trim handles. NON-DESTRUCTIVE by
// construction: the only output is onTrim(inS, outS) — the parent writes it to
// the STITCH RECIPE item; the media file is never touched.
//
// Landmarks (slate end · speech onset · speech offset) come from landmarks.ts;
// handles snap magnetically within SNAP_RADIUS_MS while DRAGGING. Keyboard
// nudges (← → = 50ms, shift = 10ms) never snap — 10ms precision is the whole
// point of a nudge.
import { useEffect, useRef, useState } from "react";

import { detectSpeech, snapMs, type SpeechSpan } from "./landmarks";
import { NEON } from "./theme";
import type { TakeRef } from "./types";
import { clipAudio, type ClipAudio } from "./waveform-peaks";

/** The tightest cut a handle can make — keeps in/out from crossing. */
const MIN_SPAN_MS = 50;

export function ClipTrimStrip({ take, trimInS, trimOutS, autoTrim, onTrim }: {
  take: TakeRef;
  /** Explicit recipe trims — undefined means "the defaults": slate end / full length. */
  trimInS?: number;
  trimOutS?: number;
  /** The trim came from PROPOSE TRIMS and hasn't been touched — drawn amber. */
  autoTrim?: boolean;
  onTrim: (inS: number, outS: number, how: "drag" | "nudge") => void;
}) {
  const [audio, setAudio] = useState<ClipAudio | null>(null);
  const [failed, setFailed] = useState(false);
  const [drag, setDrag] = useState<{ which: "in" | "out"; ms: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let live = true;
    clipAudio(take.path, take.url).then((a) => { if (live) setAudio(a); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [take.path, take.url]);

  // The REAL decoded duration beats the 0.1s-rounded stored one (P0's wedge).
  const durMs = (audio?.durationS ?? take.duration ?? 0) * 1000;
  const span: SpeechSpan = audio ? detectSpeech(audio.rms, audio.frameMs) : { onsetMs: null, offsetMs: null };
  const slateMs = take.slateEndMs ?? null;
  const baseInMs = trimInS != null ? trimInS * 1000 : (slateMs ?? 0);
  const baseOutMs = trimOutS != null ? trimOutS * 1000 : durMs;
  const inMs = drag?.which === "in" ? drag.ms : baseInMs;
  const outMs = drag?.which === "out" ? drag.ms : baseOutMs;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !audio || durMs <= 0) return;
    const w = (c.width = Math.max(1, c.clientWidth));
    const h = (c.height = 32);
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    const x = (ms: number) => (ms / durMs) * w;
    // peaks
    const n = audio.peaks.length;
    g.fillStyle = "rgba(122,210,255,0.55)";
    for (let px = 0; px < w; px++) {
      const f = Math.min(n - 1, Math.floor((px / w) * n));
      const amp = Math.min(1, audio.peaks[f] * 1.4);
      const bh = Math.max(1, amp * (h - 4));
      g.fillRect(px, (h - bh) / 2, 1, bh);
    }
    // trimmed-away shade
    g.fillStyle = "rgba(0,0,0,0.62)";
    g.fillRect(0, 0, x(inMs), h);
    g.fillRect(x(outMs), 0, w - x(outMs), h);
    // landmark ticks: slate (cyan) · onset/offset (green)
    const tick = (ms: number | null, color: string) => { if (ms == null) return; g.fillStyle = color; g.fillRect(Math.round(x(ms)) - 1, 0, 2, h); };
    tick(slateMs, "#7AD2FF");
    tick(span.onsetMs, "#3BF5A0");
    tick(span.offsetMs, "#3BF5A0");
  }, [audio, durMs, inMs, outMs, slateMs, span.onsetMs, span.offsetMs]);

  if (failed) return <div className="mt-0.5 rounded px-1 py-0.5 text-[8px] italic" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>no waveform — audio didn't decode (trims still work from the row)</div>;

  const clampIn = (ms: number) => Math.min(Math.max(0, ms), outMs - MIN_SPAN_MS);
  const clampOut = (ms: number) => Math.max(Math.min(durMs, ms), inMs + MIN_SPAN_MS);
  const commit = (nextInMs: number, nextOutMs: number, how: "drag" | "nudge") => onTrim(nextInMs / 1000, nextOutMs / 1000, how);

  const startDrag = (which: "in" | "out") => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!durMs) return;
    e.preventDefault();
    const strip = (e.currentTarget.parentElement as HTMLElement);
    const rect = strip.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    const toMs = (clientX: number) => {
      const raw = ((clientX - rect.left) / rect.width) * durMs;
      // magnetic snap DURING drag — slate end, onset, offset
      const snapped = snapMs(raw, [slateMs, span.onsetMs, span.offsetMs]);
      return which === "in" ? clampIn(snapped) : clampOut(snapped);
    };
    setDrag({ which, ms: toMs(e.clientX) });
    const el = e.currentTarget;
    const onMove = (ev: PointerEvent) => setDrag({ which, ms: toMs(ev.clientX) });
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      const ms = toMs(ev.clientX);
      setDrag(null);
      if (which === "in") commit(ms, outMs, "drag");
      else commit(inMs, ms, "drag");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const nudge = (which: "in" | "out") => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    const step = (e.shiftKey ? 10 : 50) * (e.key === "ArrowLeft" ? -1 : 1);
    if (which === "in") commit(clampIn(baseInMs + step), baseOutMs, "nudge");
    else commit(baseInMs, clampOut(baseOutMs + step), "nudge");
  };

  const handleColor = autoTrim ? "#FFB020" : NEON.cyan;
  const pct = (ms: number) => durMs ? `${(ms / durMs) * 100}%` : "0%";
  const grip = (which: "in" | "out", ms: number) => (
    <div
      role="slider"
      aria-label={which === "in" ? "trim in" : "trim out"}
      aria-valuenow={Math.round(ms)}
      tabIndex={0}
      className="absolute top-0 h-full w-[9px] cursor-ew-resize rounded-sm outline-none focus:ring-1"
      style={{ left: pct(ms), transform: which === "in" ? "translateX(-8px)" : "translateX(-1px)", background: handleColor, opacity: 0.92 }}
      title={`${which.toUpperCase()} ${(ms / 1000).toFixed(2)}s — drag (snaps to slate/onset/offset) · ← → 50ms · shift+← → 10ms${autoTrim ? " · AUTO-PROPOSED" : ""}`}
      onPointerDown={startDrag(which)}
      onKeyDown={nudge(which)}
    />
  );

  return (
    <div draggable={false} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }} className="relative mt-0.5 h-[32px] w-full select-none overflow-hidden rounded" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${NEON.borderSoft}` }}>
      <canvas ref={canvasRef} className="h-full w-full" />
      {!audio && <div className="absolute inset-0 grid place-items-center text-[8px] italic" style={{ color: NEON.muted }}>decoding audio…</div>}
      {audio && grip("in", inMs)}
      {audio && grip("out", outMs)}
      {autoTrim && <span className="absolute right-0.5 top-0 text-[7px] font-black uppercase" style={{ color: "#FFB020" }} title="This trim came from PROPOSE TRIMS and hasn't been hand-adjusted">auto</span>}
    </div>
  );
}
