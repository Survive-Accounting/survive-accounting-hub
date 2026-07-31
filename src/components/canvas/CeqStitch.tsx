// CEQ STITCH (Lee — CEQ Studio) — the "how is it looking so far" tool, two ways:
// (1) CLIP MODE (instant): plays the Free/Full stitch list back-to-back with
//     hard cuts straight from the Supabase staging URLs — feel the pacing.
// (2) TRUE RENDER (⚡, ~a minute): the SAME list rendered through the ffmpeg
//     worker — real crossfades, one file, played inline. Missing CEQs are
//     skipped in both (unlike publish, which fails loud). No Auphonic, no Mux,
//     nothing published — this is the double-check BEFORE publish.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Pause, Play, Zap } from "lucide-react";

import { fmtDur, stitchRuntime, type StitchItem } from "./ceq-takes";
import { renderStitchViaWorker } from "./render-worker-client";
import { NEON } from "./theme";

export function CeqStitch({ free, full, freeMissing, fullMissing, initialMode, onExit, onJumpCeq }: {
  free: StitchItem[]; full: StitchItem[]; freeMissing: { id: string; prompt: string }[]; fullMissing: { id: string; prompt: string }[];
  initialMode: "free" | "full"; onExit: () => void; onJumpCeq?: (ceqId: string) => void;
}) {
  const [mode, setMode] = useState<"free" | "full">(initialMode);
  const items = mode === "free" ? free : full;
  const missing = mode === "free" ? freeMissing : fullMissing;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  // TRUE RENDER — url of the rendered file (the player swaps to it), the live
  // status note while the worker runs, and any error. Reset on mode switch.
  const [rendered, setRendered] = useState<string | null>(null);
  const [renderNote, setRenderNote] = useState<string | null>(null);
  const [renderErr, setRenderErr] = useState<string | null>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { setIdx(0); setPlaying(false); setRendered(null); setRenderNote(null); setRenderErr(null); }, [mode]);
  const rendering = renderNote !== null && rendered === null && renderErr === null;
  const runTrueRender = async () => {
    if (rendering || items.length === 0) return;
    setRendered(null); setRenderErr(null); setRenderNote("checking the render worker…");
    try {
      const url = await renderStitchViaWorker(items, "test", setRenderNote);
      setRendered(url);
      setRenderNote(`${items.length} clip(s), real crossfades${missing.length ? ` · ${missing.length} CEQ(s) skipped (no clip yet)` : ""}`);
    } catch (e) { setRenderErr(e instanceof Error ? e.message : String(e)); setRenderNote(null); }
  };
  const total = stitchRuntime(items);
  const cur = items[Math.min(idx, items.length - 1)];
  const playAt = (i: number) => { setIdx(i); setPlaying(true); window.setTimeout(() => vidRef.current?.play().catch(() => {}), 30); };
  const onEnded = () => { if (idx < items.length - 1) playAt(idx + 1); else setPlaying(false); };
  const toggle = () => { if (playing) { vidRef.current?.pause(); setPlaying(false); } else { setPlaying(true); window.setTimeout(() => vidRef.current?.play().catch(() => {}), 20); } };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header — Free/Full switch + transport + counts */}
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5" style={{ borderColor: NEON.borderSoft }}>
        <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={onExit} title="Back to the question editor (nothing is lost)"><ChevronLeft className="h-3 w-3" /> editor</button>
        <div className="flex overflow-hidden rounded" style={{ border: `1px solid ${NEON.borderSoft}` }}>
          {(["free", "full"] as const).map((m) => (
            <button key={m} className="px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: mode === m ? NEON.yellow : "transparent", color: mode === m ? "#0B0F1E" : NEON.muted }} onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
        <button className="grid h-6 w-6 place-items-center rounded" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={toggle} disabled={items.length === 0} title={playing ? "Pause" : "Play the stitch list"}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: NEON.text }}>{items.length ? `clip ${Math.min(idx + 1, items.length)}/${items.length}` : "0 clips"}</span>
        {/* TRUE RENDER — the same list through the ffmpeg worker (real crossfades).
            While a render is showing, the button flips back to clip-by-clip. */}
        <button
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase disabled:opacity-40"
          style={{ color: rendered ? "#0B0F1E" : NEON.yellow, background: rendered ? NEON.yellow : "transparent", border: `1px solid ${NEON.yellow}` }}
          disabled={rendering || items.length === 0}
          onClick={() => { if (rendered) { setRendered(null); setRenderNote(null); } else void runTrueRender(); }}
          title={rendered ? "Back to the clip-by-clip preview" : "Render this list through the ffmpeg worker — real crossfades, one file (takes a minute; nothing is published)"}
        >
          {rendering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} {rendered ? "clips" : "true render"}
        </button>
        <span className="ml-auto text-[10px] tabular-nums" style={{ color: NEON.cyan }}>~{fmtDur(total)} total</span>
      </div>
      {/* render status / error strip */}
      {(renderNote || renderErr) && (
        <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1 text-[9.5px]" style={{ borderColor: NEON.borderSoft, color: renderErr ? NEON.red : rendered ? "#3BF5A0" : NEON.muted }}>
          {rendering && <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: NEON.cyan }} />}
          <span className="min-w-0 flex-1">{renderErr ?? (rendered ? `RENDERED — ${renderNote}` : renderNote)}</span>
        </div>
      )}
      {/* player — hard cuts, straight from staging URLs */}
      <div className="grid min-h-0 flex-1 place-items-center p-2" style={{ background: "rgba(4,7,14,0.6)" }}>
        {rendered ? (
          <video key={rendered} src={rendered} controls playsInline autoPlay style={{ maxHeight: "100%", maxWidth: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }} />
        ) : cur ? (
          <video ref={vidRef} key={cur.take.path} src={cur.take.url} controls playsInline onEnded={onEnded} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} style={{ maxHeight: "100%", maxWidth: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }} />
        ) : (
          <div className="text-[11px]" style={{ color: NEON.muted }}>No clips in the {mode} list yet — attach takes to your CEQs.</div>
        )}
      </div>
      {/* clip list + missing */}
      <div className="max-h-40 shrink-0 overflow-y-auto border-t p-1" style={{ borderColor: NEON.borderSoft }}>
        {items.map((it, i) => (
          <button key={`${it.kind}-${it.ceqId ?? i}`} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[10px]" style={{ background: i === idx ? "rgba(252,163,17,0.14)" : "transparent", color: i === idx ? NEON.yellow : NEON.text }} onClick={() => { playAt(i); if (it.ceqId) onJumpCeq?.(it.ceqId); }} title={it.label}>
            <span className="w-4 shrink-0 text-right tabular-nums opacity-60">{i + 1}</span>
            <span className="shrink-0 rounded px-1 text-[7.5px] font-bold uppercase" style={{ color: it.kind === "ceq" ? NEON.cyan : NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>{it.kind}</span>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            <span className="shrink-0 tabular-nums" style={{ color: NEON.muted }}>{fmtDur(it.take.duration)}</span>
          </button>
        ))}
        {missing.length > 0 && (
          <div className="mt-1 rounded px-1 py-0.5 text-[9px]" style={{ color: "#FF8B9E", border: "1px solid rgba(255,92,108,0.3)" }}>
            Missing clips (skipped): {missing.map((m) => (m.prompt || "Question").slice(0, 24)).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}
