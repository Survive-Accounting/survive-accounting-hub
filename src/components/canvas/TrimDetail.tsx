// TRIM DETAIL (Q2) — the fine-cut panel under the timeline. Selecting a clip
// opens its waveform LARGE, with in/out handles and the audio landmarks (slate
// end · first speech onset · last speech offset) marked, and lets you place a
// cut between two words:
//   · MOUSE-WHEEL zooms the time axis, centered on the cursor; drag the
//     background to pan when zoomed in.
//   · Handles drag with magnetic snapping to landmarks; arrow = 50ms,
//     shift+arrow = 10ms nudge the SELECTED handle; exact in/out timecodes show
//     numerically.
//   · A scrubber (click the waveform) plays the clip from that point so you
//     hear the cut before committing.
// NON-DESTRUCTIVE: the only output is onTrim → the stitch recipe. Nothing bakes
// until True Render.
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";

import { detectSpeech, snapMs, type SpeechSpan } from "./landmarks";
import { NEON } from "./theme";
import type { TakeRef } from "./types";
import { clipAudio, type ClipAudio } from "./waveform-peaks";

const MIN_SPAN_MS = 50;
const HANDLE_HIT_PX = 10;
const H = 96;

const tc = (ms: number): string => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const mmm = Math.floor((s - Math.floor(s)) * 1000);
  return `${m}:${String(sec).padStart(2, "0")}.${String(mmm).padStart(3, "0")}`;
};

export function TrimDetail({ take, label, trimInS, trimOutS, autoTrim, onTrim, onClose }: {
  take: TakeRef;
  label: string;
  trimInS?: number;
  trimOutS?: number;
  autoTrim?: boolean;
  onTrim: (inS: number, outS: number, how: "drag" | "nudge") => void;
  onClose: () => void;
}) {
  const [audio, setAudio] = useState<ClipAudio | null>(null);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { let live = true; setAudio(null); setFailed(false); clipAudio(take.path, take.url).then((a) => { if (live) setAudio(a); }, () => { if (live) setFailed(true); }); return () => { live = false; }; }, [take.path, take.url]);

  const durMs = (audio?.durationS ?? take.duration ?? 0) * 1000;
  const span: SpeechSpan = useMemo(() => (audio ? detectSpeech(audio.rms, audio.frameMs) : { onsetMs: null, offsetMs: null }), [audio]);
  const slateMs = take.slateEndMs ?? null;

  const baseInMs = trimInS != null ? trimInS * 1000 : (slateMs ?? 0);
  const baseOutMs = trimOutS != null ? trimOutS * 1000 : durMs;
  const [drag, setDrag] = useState<{ which: "in" | "out"; ms: number } | null>(null);
  const inMs = drag?.which === "in" ? drag.ms : baseInMs;
  const outMs = drag?.which === "out" ? drag.ms : baseOutMs;
  const [active, setActive] = useState<"in" | "out">("in");
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  // Zoom viewport, in ms. Defaults to the whole clip; wheel narrows it.
  const [view, setView] = useState<{ a: number; b: number } | null>(null);
  const viewA = view ? view.a : 0;
  const viewB = view ? view.b : durMs || 1;
  useEffect(() => { setView(null); }, [take.path]); // reset zoom per clip

  const width = wrapRef.current?.clientWidth ?? 800;
  const msToX = (ms: number) => ((ms - viewA) / (viewB - viewA)) * width;
  const xToMs = (x: number) => viewA + (x / width) * (viewB - viewA);

  // ---- draw ---------------------------------------------------------------
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !audio || durMs <= 0) return;
    const w = (c.width = Math.max(1, c.clientWidth));
    c.height = H;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, H);
    const x = (ms: number) => ((ms - viewA) / (viewB - viewA)) * w;
    const n = audio.peaks.length;
    const msPerFrame = audio.frameMs;
    // peaks across the visible window
    g.fillStyle = "rgba(122,210,255,0.6)";
    for (let px = 0; px < w; px++) {
      const ms = viewA + (px / w) * (viewB - viewA);
      const f = Math.max(0, Math.min(n - 1, Math.floor(ms / msPerFrame)));
      const amp = Math.min(1, audio.peaks[f] * 1.4);
      const bh = Math.max(1, amp * (H - 8));
      g.fillRect(px, (H - bh) / 2, 1, bh);
    }
    // trimmed-away shade
    g.fillStyle = "rgba(0,0,0,0.6)";
    if (inMs > viewA) g.fillRect(0, 0, Math.max(0, x(inMs)), H);
    if (outMs < viewB) g.fillRect(x(outMs), 0, w - x(outMs), H);
    // landmark ticks
    const tick = (ms: number | null, color: string, labelText: string) => {
      if (ms == null || ms < viewA || ms > viewB) return;
      g.fillStyle = color; g.fillRect(Math.round(x(ms)), 0, 1.5, H);
      g.fillStyle = color; g.font = "8px sans-serif"; g.fillText(labelText, Math.round(x(ms)) + 2, 8);
    };
    tick(slateMs, "#7AD2FF", "slate");
    tick(span.onsetMs, "#3BF5A0", "onset");
    tick(span.offsetMs, "#3BF5A0", "offset");
    // scrub line
    if (scrubMs != null && scrubMs >= viewA && scrubMs <= viewB) { g.fillStyle = "#FF3B6B"; g.fillRect(Math.round(x(scrubMs)), 0, 1.5, H); }
  }, [audio, durMs, viewA, viewB, inMs, outMs, slateMs, span.onsetMs, span.offsetMs, scrubMs]);

  // ---- preview scrubbing --------------------------------------------------
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => { if (v.currentTime * 1000 >= outMs) { v.pause(); setPlaying(false); } };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [outMs]);
  const previewFrom = (ms: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, ms / 1000);
    void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  if (failed) return (
    <div className="mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px]" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }}>
      Waveform didn’t decode for “{take.name ?? "clip"}”. Trim still works from the timeline tile; the numeric handles below are live.
      <button className="ml-auto" onClick={onClose}><X className="h-3 w-3" /></button>
    </div>
  );

  const clampIn = (ms: number) => Math.min(Math.max(0, ms), outMs - MIN_SPAN_MS);
  const clampOut = (ms: number) => Math.max(Math.min(durMs, ms), inMs + MIN_SPAN_MS);
  const commit = (nInMs: number, nOutMs: number, how: "drag" | "nudge") => onTrim(nInMs / 1000, nOutMs / 1000, how);

  const onWheel = (e: React.WheelEvent) => {
    if (!durMs) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorMs = xToMs(e.clientX - rect.left);
    const factor = e.deltaY < 0 ? 0.8 : 1.25; // in / out
    let a = cursorMs - (cursorMs - viewA) * factor;
    let b = cursorMs + (viewB - cursorMs) * factor;
    const spanMs = b - a;
    if (spanMs > durMs) { a = 0; b = durMs; } // never wider than the clip
    if (spanMs < 60) { const half = 30; a = cursorMs - half; b = cursorMs + half; } // floor: ~60ms window
    a = Math.max(0, a); b = Math.min(durMs, b);
    if (b - a < 30) return;
    setView({ a, b });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!durMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x0 = e.clientX - rect.left;
    const ms0 = xToMs(x0);
    const nearIn = Math.abs(msToX(inMs) - x0) <= HANDLE_HIT_PX;
    const nearOut = Math.abs(msToX(outMs) - x0) <= HANDLE_HIT_PX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (nearIn || nearOut) {
      const which: "in" | "out" = nearIn && (!nearOut || Math.abs(msToX(inMs) - x0) <= Math.abs(msToX(outMs) - x0)) ? "in" : "out";
      setActive(which);
      const toMs = (cx: number) => { const raw = xToMs(cx - rect.left); const snapped = snapMs(raw, [slateMs, span.onsetMs, span.offsetMs]); return which === "in" ? clampIn(snapped) : clampOut(snapped); };
      setDrag({ which, ms: toMs(e.clientX) });
      const move = (ev: PointerEvent) => setDrag({ which, ms: toMs(ev.clientX) });
      const up = (ev: PointerEvent) => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); const ms = toMs(ev.clientX); setDrag(null); which === "in" ? commit(ms, outMs, "drag") : commit(inMs, ms, "drag"); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      return;
    }
    // background: pan if dragged, scrub if a click
    let moved = false;
    const startView = { a: viewA, b: viewB };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - e.clientX;
      if (Math.abs(dx) > 3) moved = true;
      const dMs = -(dx / width) * (startView.b - startView.a);
      let a = startView.a + dMs, b = startView.b + dMs;
      if (a < 0) { b -= a; a = 0; }
      if (b > durMs) { a -= b - durMs; b = durMs; }
      setView({ a: Math.max(0, a), b: Math.min(durMs, b) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      if (!moved) { setScrubMs(ms0); previewFrom(ms0); } // a click = scrub + preview
      void ev;
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 50) * (e.key === "ArrowLeft" ? -1 : 1);
    if (active === "in") commit(clampIn(baseInMs + step), baseOutMs, "nudge");
    else commit(baseInMs, clampOut(baseOutMs + step), "nudge");
  };

  const num = (which: "in" | "out", ms: number) => (
    <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums" style={{ color: active === which ? "#0B1322" : NEON.text, background: active === which ? NEON.cyan : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => setActive(which)} title={`Select the ${which.toUpperCase()} handle — arrow keys nudge it 50ms, shift+arrow 10ms`}>{which.toUpperCase()} {tc(ms)}</button>
  );

  return (
    <div ref={wrapRef} className="mt-1 shrink-0 rounded-lg p-1.5 outline-none" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${autoTrim ? "rgba(255,176,32,0.5)" : NEON.borderSoft}` }} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="rounded px-1 text-[8px] font-black uppercase" style={{ color: "#0B1322", background: NEON.yellow }}>{label}</span>
        <span className="truncate text-[9px]" style={{ color: NEON.muted }}>{take.name ?? "clip"}</span>
        {num("in", inMs)}
        {num("out", outMs)}
        <span className="text-[9px] tabular-nums" style={{ color: "#3BF5A0" }}>= {tc(outMs - inMs)}</span>
        {autoTrim && <span className="text-[8px] font-black uppercase" style={{ color: "#FFB020" }}>auto</span>}
        <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => (playing ? (videoRef.current?.pause(), setPlaying(false)) : previewFrom(scrubMs ?? inMs))} title="Hear the cut — plays from the scrub point (or the in point) to the out point">{playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />} hear</button>
        <span className="text-[8px] uppercase tracking-wide" style={{ color: NEON.muted }}>wheel = zoom · drag = pan · click = scrub</span>
        <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={onClose} title="Close the trim detail"><X className="h-3 w-3" /></button>
      </div>
      <div className="relative w-full" style={{ height: H }}>
        <canvas ref={canvasRef} className="h-full w-full cursor-crosshair rounded" style={{ background: "rgba(0,0,0,0.35)", touchAction: "none" }} onWheel={onWheel} onPointerDown={onPointerDown} />
        {!audio && <div className="absolute inset-0 grid place-items-center text-[9px] italic" style={{ color: NEON.muted }}>decoding audio…</div>}
        {audio && durMs > 0 && [["in", inMs] as const, ["out", outMs] as const].map(([which, ms]) => {
          const x = msToX(ms);
          if (x < -8 || x > width + 8) return null;
          return <div key={which} className="pointer-events-none absolute top-0 h-full w-0.5" style={{ left: x, background: active === which ? NEON.yellow : (autoTrim ? "#FFB020" : NEON.cyan) }} />;
        })}
      </div>
      {/* preview element — small, so you SEE the frame at the cut too */}
      <video ref={videoRef} src={take.url} playsInline preload="metadata" className="mt-1 w-full rounded" style={{ maxHeight: 120, background: "#000", aspectRatio: "16 / 9", objectFit: "contain" }} onClick={() => (playing ? (videoRef.current?.pause(), setPlaying(false)) : previewFrom(scrubMs ?? inMs))} />
      <div className="mt-0.5 text-[8px]" style={{ color: NEON.muted }}>Zoom {durMs ? Math.round(durMs / (viewB - viewA)) : 1}× · window {tc(viewA)}–{tc(viewB)} · every edit writes the recipe only — nothing bakes until True Render.</div>
    </div>
  );
}
