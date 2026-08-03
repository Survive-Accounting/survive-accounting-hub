// CEQ STITCH (Lee — the PREVIEW tab) — "how is the stitching looking so far",
// two ways over ONE full numbered list of the cut:
// (1) CLIP MODE (instant): plays the attached clips back-to-back with hard cuts
//     straight from the Supabase staging URLs — feel the pacing.
// (2) TRUE RENDER (⚡, ~a minute): the same list rendered through the ffmpeg
//     worker — real crossfades, one file; clicking a row SEEKS to that clip's
//     offset in the rendered file.
// The list shows EVERY position in the cut, 1..N top to bottom — clip-less CEQs
// are greyed-out numbers with an upload button (attach the first take), and
// rows with clips get a replace button (new base take, lookbacks kept; if a
// render is showing it re-renders automatically). Nothing here publishes:
// no Auphonic, no Mux, no lesson writes.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Pause, Play, Upload, Zap } from "lucide-react";

import { fmtDur, type StitchItem } from "./ceq-takes";
import type { TakeRef } from "./types";
import { renderStitchViaWorker } from "./render-worker-client";
import { DEFAULT_CROSSFADE_MS } from "./segment-assembly";
import { NEON } from "./theme";

/** One position in the cut — take absent ⇒ the CEQ has no clip yet (greyed). */
export interface StitchRow {
  key: string;
  kind: string; // intro | hook | ceq | wrap | outro
  label: string;
  /** 1-based position in the cut (the number the list shows). */
  num: number;
  take?: TakeRef;
  /** ceq rows only — the editor-jump + upload/replace target. */
  ceqId?: string;
}

export function CeqStitch({ freeRows, fullRows, initialMode, onExit, onJumpCeq, onReplaceTake }: {
  freeRows: StitchRow[]; fullRows: StitchRow[];
  initialMode: "free" | "full"; onExit: () => void; onJumpCeq?: (ceqId: string) => void;
  /** Stage + attach/replace a CEQ's BASE take (parent owns the node write). */
  onReplaceTake?: (ceqId: string, file: File) => Promise<void>;
}) {
  const [mode, setMode] = useState<"free" | "full">(initialMode);
  const rows = mode === "free" ? freeRows : fullRows;
  const playable = rows.filter((r) => r.take);
  const missingCount = rows.length - playable.length;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  // TRUE RENDER state — url of the rendered file (player swaps to it), live
  // status note, error. Reset on mode switch.
  const [rendered, setRendered] = useState<string | null>(null);
  const [renderNote, setRenderNote] = useState<string | null>(null);
  const [renderErr, setRenderErr] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState<string | null>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const renderedRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingCeq = useRef<string | null>(null);
  // set when an upload should re-render once the parent's rows recompute — the
  // render must use the NEW take, so it waits for the rows prop to change.
  const reRenderOnRows = useRef(false);
  // EPOCH guard (review): a superseded render's completion must never write
  // state over a newer one — every await in runTrueRender re-checks this.
  const renderEpoch = useRef(0);
  useEffect(() => { setIdx(0); setPlaying(false); setRendered(null); setRenderNote(null); setRenderErr(null); renderEpoch.current++; }, [mode]);
  const rendering = renderNote !== null && rendered === null && renderErr === null;

  const total = playable.reduce((s, r) => s + (r.take?.duration ?? 0), 0);
  const cur = playable[Math.min(idx, playable.length - 1)];
  const playAt = (i: number) => { setIdx(i); setPlaying(true); window.setTimeout(() => vidRef.current?.play().catch(() => {}), 30); };
  const onEnded = () => { if (idx < playable.length - 1) playAt(idx + 1); else setPlaying(false); };
  const toggle = () => { if (playing) { vidRef.current?.pause(); setPlaying(false); } else { setPlaying(true); window.setTimeout(() => vidRef.current?.play().catch(() => {}), 20); } };

  /** A playable row's start offset in the RENDERED file — same seam math as the
   *  manifest (Σ durations − k·crossfade), so row-clicks land on the clip. */
  const startOf = (playIdx: number) => {
    const cf = DEFAULT_CROSSFADE_MS / 1000;
    let s = 0;
    for (let i = 0; i < playIdx; i++) s += playable[i].take?.duration ?? 0;
    return Math.max(0, s - playIdx * cf);
  };

  const runTrueRender = async () => {
    if (rendering || playable.length === 0) return;
    const ep = ++renderEpoch.current;
    setRendered(null); setRenderErr(null); setRenderNote("checking the render worker…");
    try {
      const items = playable.map((r) => ({ kind: r.kind, take: r.take!, label: r.label, ceqId: r.ceqId })) as unknown as StitchItem[];
      const url = await renderStitchViaWorker(items, "test", (n) => { if (renderEpoch.current === ep) setRenderNote(n); });
      if (renderEpoch.current !== ep) return; // superseded (new render / mode switch)
      setRendered(url);
      setRenderNote(`${playable.length} clip(s), real crossfades${missingCount ? ` · ${missingCount} position(s) skipped (no clip yet)` : ""}`);
    } catch (e) { if (renderEpoch.current === ep) { setRenderErr(e instanceof Error ? e.message : String(e)); setRenderNote(null); } }
  };
  // AFTER an upload: the parent recomputes rows (new take) → this effect fires
  // and re-renders with the fresh list. Rendering from the stale closure would
  // stitch the OLD clip.
  useEffect(() => { if (reRenderOnRows.current) { reRenderOnRows.current = false; void runTrueRender(); } }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // any duration-less take (readDuration failed on upload) breaks the offset
  // ladder — every later seek would land early by that clip's real length, so
  // rendered-mode seeking disables rather than lying.
  const seekable = playable.every((r) => (r.take?.duration ?? 0) > 0);
  const clickRow = (r: StitchRow) => {
    if (r.ceqId) onJumpCeq?.(r.ceqId);
    if (!r.take) return;
    const pi = playable.findIndex((p) => p.key === r.key);
    if (pi < 0) return;
    if (rendered) { if (!seekable) return; const v = renderedRef.current; if (v) { v.currentTime = startOf(pi); void v.play().catch(() => {}); } }
    else playAt(pi);
  };

  const pickFor = (ceqId: string) => { pendingCeq.current = ceqId; fileRef.current?.click(); };
  const onFile = async (f: File | null) => {
    const ceqId = pendingCeq.current; pendingCeq.current = null;
    if (!f || !ceqId || !onReplaceTake) return;
    setUploadBusy(ceqId); setRenderErr(null);
    try {
      await onReplaceTake(ceqId, f);
      // a SHOWN render is now stale — re-render off the new rows. (Uploads and
      // renders cross-disable each other, so an in-flight render can't race this.)
      if (rendered || renderNote) { renderEpoch.current++; setRendered(null); setRenderNote(null); reRenderOnRows.current = true; }
    } catch (e) { setRenderErr(`Upload failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setUploadBusy(null); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      {/* header — Free/Full switch + transport + true render */}
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5" style={{ borderColor: NEON.borderSoft }}>
        <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={onExit} title="Back to the editor (Topics tab)"><ChevronLeft className="h-3 w-3" /> editor</button>
        <div className="flex overflow-hidden rounded" style={{ border: `1px solid ${NEON.borderSoft}` }}>
          {(["free", "full"] as const).map((m) => (
            <button key={m} className="px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: mode === m ? NEON.yellow : "transparent", color: mode === m ? "#0B0F1E" : NEON.muted }} onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
        <button className="grid h-6 w-6 place-items-center rounded" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={toggle} disabled={playable.length === 0} title={playing ? "Pause" : "Play the stitch list (hard cuts, instant)"}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: NEON.text }}>{playable.length ? `clip ${Math.min(idx + 1, playable.length)}/${playable.length}` : "0 clips"}</span>
        <button
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase disabled:opacity-40"
          style={{ color: rendered ? "#0B0F1E" : NEON.yellow, background: rendered ? NEON.yellow : "transparent", border: `1px solid ${NEON.yellow}` }}
          disabled={rendering || playable.length === 0 || !!uploadBusy}
          onClick={() => { if (rendered) { setRendered(null); setRenderNote(null); } else void runTrueRender(); }}
          title={rendered ? "Back to the clip-by-clip preview" : "Render this list through the ffmpeg worker — real crossfades, one file (takes a minute; nothing is published)"}
        >
          {rendering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} {rendered ? "clips" : "true render"}
        </button>
        <span className="ml-auto text-[10px] tabular-nums" style={{ color: NEON.cyan }}>~{fmtDur(total)} total{missingCount ? ` · ${missingCount} missing` : ""}</span>
      </div>
      {/* render status / error strip */}
      {(renderNote || renderErr) && (
        <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1 text-[9.5px]" style={{ borderColor: NEON.borderSoft, color: renderErr ? NEON.red : rendered ? "#3BF5A0" : NEON.muted }}>
          {rendering && <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: NEON.cyan }} />}
          <span className="min-w-0 flex-1">{renderErr ?? (rendered ? `RENDERED — ${renderNote}` : renderNote)}</span>
        </div>
      )}
      {/* player — clip mode (hard cuts) or the rendered file (seekable) */}
      <div className="grid min-h-0 place-items-center p-2" style={{ flex: "1 1 55%", background: "rgba(4,7,14,0.6)" }}>
        {rendered ? (
          <video ref={renderedRef} key={rendered} src={rendered} controls playsInline autoPlay style={{ maxHeight: "100%", maxWidth: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }} />
        ) : cur ? (
          <video ref={vidRef} key={cur.take!.path} src={cur.take!.url} controls playsInline onEnded={onEnded} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} style={{ maxHeight: "100%", maxWidth: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }} />
        ) : (
          <div className="text-[11px]" style={{ color: NEON.muted }}>No clips in the {mode} cut yet — upload takes from the list below (or drop them on CEQs in the editor).</div>
        )}
      </div>
      {/* THE LIST — every position 1..N; greyed = no clip yet; click zips there */}
      <div className="min-h-0 overflow-y-auto border-t p-1" style={{ flex: "1 1 45%", borderColor: NEON.borderSoft }}>
        {rows.map((r) => {
          const isCur = !rendered && cur && r.key === cur.key;
          const has = !!r.take;
          return (
            <div key={r.key} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-[10px]" style={{ background: isCur ? "rgba(252,163,17,0.14)" : "transparent" }}>
              <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-default" onClick={() => clickRow(r)} title={has ? (rendered ? "Seek the rendered file to this clip" : "Play from this clip") : "No clip yet — nothing to play"}>
                <span className="w-5 shrink-0 text-right font-bold tabular-nums" style={{ color: has ? (isCur ? NEON.yellow : NEON.text) : "rgba(147,160,180,0.35)" }}>{r.num}</span>
                <span className="shrink-0 rounded px-1 text-[7.5px] font-bold uppercase" style={{ color: has ? (r.kind === "ceq" ? NEON.cyan : NEON.muted) : "rgba(147,160,180,0.35)", border: `1px solid ${NEON.borderSoft}` }}>{r.kind}</span>
                <span className="min-w-0 flex-1 truncate" style={{ color: has ? (isCur ? NEON.yellow : NEON.text) : "rgba(147,160,180,0.45)", fontStyle: has ? undefined : "italic" }}>{r.label}</span>
                <span className="shrink-0 tabular-nums" style={{ color: has ? NEON.muted : "rgba(147,160,180,0.35)" }}>{has ? fmtDur(r.take!.duration) : "no clip yet"}</span>
              </button>
              {r.ceqId && onReplaceTake && (
                <button className="grid h-4.5 w-4.5 shrink-0 place-items-center rounded disabled:opacity-40" style={{ color: has ? NEON.muted : NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} disabled={!!uploadBusy || rendering} onClick={() => pickFor(r.ceqId!)} title={rendering ? "Wait for the render to finish" : has ? "Replace this take — upload a new clip (lookbacks kept; a shown render re-renders)" : "Upload this question's first take"}>
                  {uploadBusy === r.ceqId ? <Loader2 className="h-3 w-3 animate-spin" style={{ color: NEON.cyan }} /> : <Upload className="h-3 w-3" />}
                </button>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <div className="px-1 py-2 text-[10px] italic" style={{ color: NEON.muted }}>Nothing in the {mode} cut.</div>}
      </div>
    </div>
  );
}
