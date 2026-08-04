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
import { ChevronLeft, Loader2, Pause, Play, Plus, Upload, X, Zap } from "lucide-react";

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
  /** clip index WITHIN this position — the clip's slot in the CEQ's takes[]
   *  (0 = base, 1+ = lookbacks), or the wrap clip's index in deck.wrap. Lets the
   *  table's ✕ / ＋ / replace hit exactly this clip, not just the base take. */
  clip?: number;
}

export function CeqStitch({ freeRows, fullRows, initialMode, onExit, onJumpCeq, onReplaceClip, onAddClipAfter, onDeleteClip, onAddWrap, onDeleteWrap }: {
  freeRows: StitchRow[]; fullRows: StitchRow[];
  initialMode: "free" | "full"; onExit: () => void; onJumpCeq?: (ceqId: string) => void;
  /** All parent-owned + undoable. CEQ clips write the node's takes[]; wrap writes deck.wrap. */
  onReplaceClip?: (ceqId: string, clip: number, file: File) => Promise<void>;
  onAddClipAfter?: (ceqId: string, clip: number, file: File) => Promise<void>;
  onDeleteClip?: (ceqId: string, clip: number) => void;
  onAddWrap?: (file: File) => Promise<void>;
  onDeleteWrap?: (idx: number) => void;
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
  // Which clip a pending file pick targets: the row + whether we're REPLACING that
  // clip or ADDING a new one after it (one hidden <input> serves both).
  const pendingPick = useRef<{ row: StitchRow; mode: "replace" | "add" } | null>(null);
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

  // A shown render is now stale after any clip edit — drop it and re-render off the
  // recomputed rows. (Uploads + renders cross-disable, so no in-flight render races.)
  const invalidateRender = () => { if (rendered || renderNote) { renderEpoch.current++; setRendered(null); setRenderNote(null); reRenderOnRows.current = true; } };
  const pick = (row: StitchRow, mode: "replace" | "add") => { pendingPick.current = { row, mode }; fileRef.current?.click(); };
  const onFile = async (f: File | null) => {
    const p = pendingPick.current; pendingPick.current = null;
    if (!f || !p) return;
    const { row, mode } = p;
    setUploadBusy(row.key); setRenderErr(null);
    try {
      if (row.kind === "ceq" && row.ceqId != null) {
        if (mode === "replace") await onReplaceClip?.(row.ceqId, row.clip ?? 0, f);
        else await onAddClipAfter?.(row.ceqId, row.clip ?? 0, f);
      } else if (row.kind === "wrap" && mode === "add") await onAddWrap?.(f);
      invalidateRender();
    } catch (e) { setRenderErr(`Upload failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setUploadBusy(null); }
  };
  /** ✕ — remove this clip (parent write is undoable; the staged file stays put). */
  const del = (row: StitchRow) => {
    if (row.kind === "ceq" && row.ceqId != null && row.take) onDeleteClip?.(row.ceqId, row.clip ?? 0);
    else if (row.kind === "wrap" && row.clip != null) onDeleteWrap?.(row.clip);
    else return;
    invalidateRender();
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
      {/* player — clip mode (hard cuts) or the rendered file (seekable). The
          video FILLS a bounded box (objectFit:contain letterboxes inside) so its
          intrinsic 16:9 height can't grow past the flex basis and shove the clip
          list below the fold (that was the "can't scroll to the clips" bug). */}
      <div className="min-h-0 overflow-hidden p-2" style={{ flex: "1 1 55%", minHeight: 160, background: "rgba(4,7,14,0.6)" }}>
        {rendered ? (
          <video ref={renderedRef} key={rendered} src={rendered} controls playsInline autoPlay style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8, background: "#000" }} />
        ) : cur ? (
          <video ref={vidRef} key={cur.take!.path} src={cur.take!.url} controls playsInline onEnded={onEnded} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8, background: "#000" }} />
        ) : (
          <div className="grid h-full place-items-center text-center text-[11px]" style={{ color: NEON.muted }}>No clips in the {mode} cut yet — upload takes from the list below (or drop them on CEQs in the editor).</div>
        )}
      </div>
      {/* THE CLIP TABLE — # · Type · CEQ · Length · actions. Every position 1..N;
          greyed = no clip yet; click #/Type/CEQ/Length to play/seek. CEQ + wrap rows
          get Replace / ＋ add / ✕ delete (all undoable via the editor's Ctrl+Z). */}
      <div className="min-h-0 overflow-y-auto border-t" style={{ flex: "1 1 45%", borderColor: NEON.borderSoft }}>
        {/* column header — sticky so it stays put while the list scrolls */}
        <div className="sticky top-0 z-[1] flex items-center gap-1.5 border-b px-1.5 py-1 text-[7.5px] font-bold uppercase tracking-wide" style={{ background: "rgba(6,10,20,0.96)", borderColor: NEON.borderSoft, color: NEON.muted }}>
          <span className="w-6 shrink-0 text-right">#</span>
          <span className="w-16 shrink-0">Type</span>
          <span className="min-w-0 flex-1">CEQ</span>
          <span className="w-10 shrink-0 text-right">Length</span>
          <span className="w-[52px] shrink-0 text-center">·</span>
        </div>
        {rows.map((r) => {
          const isCur = !rendered && cur && r.key === cur.key;
          const has = !!r.take;
          const isCeq = r.kind === "ceq";
          const isWrap = r.kind === "wrap";
          // Type cell: a CEQ clip reads base / look N; other positions read their kind.
          const typeLabel = isCeq ? (has ? ((r.clip ?? 0) === 0 ? "base" : `look ${r.clip}`) : "base") : r.kind;
          // CEQ cell: the question stem (or the position label for intro/wrap/outro),
          // with the "— lookback N" suffix dropped (Type already says which clip).
          const ceqLabel = r.label.replace(/ — lookback \d+$/, "");
          const busy = uploadBusy === r.key;
          const acting = !!uploadBusy || rendering;
          return (
            <div key={r.key} className="flex w-full items-center gap-1.5 px-1.5 py-0.5 text-[10px]" style={{ background: isCur ? "rgba(252,163,17,0.14)" : "transparent" }}>
              <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-default" onClick={() => clickRow(r)} title={has ? (rendered ? "Seek the rendered file to this clip" : "Play from this clip") : "No clip yet — nothing to play"}>
                <span className="w-6 shrink-0 text-right font-bold tabular-nums" style={{ color: has ? (isCur ? NEON.yellow : NEON.text) : "rgba(147,160,180,0.35)" }}>{r.num}</span>
                <span className="w-16 shrink-0 truncate rounded px-1 text-[7.5px] font-bold uppercase" style={{ color: has ? (isCeq ? NEON.cyan : NEON.muted) : "rgba(147,160,180,0.35)", border: `1px solid ${NEON.borderSoft}` }}>{typeLabel}</span>
                <span className="min-w-0 flex-1 truncate" style={{ color: has ? (isCur ? NEON.yellow : NEON.text) : "rgba(147,160,180,0.45)", fontStyle: has ? undefined : "italic" }}>{ceqLabel}</span>
                <span className="w-10 shrink-0 text-right tabular-nums" style={{ color: has ? NEON.muted : "rgba(147,160,180,0.35)" }}>{has ? fmtDur(r.take!.duration) : "—"}</span>
              </button>
              {/* actions — CEQ rows: replace · add-below · delete. Wrap rows: add · delete.
                  intro/hook/outro have no per-clip actions here (set once in the Videos panel). */}
              <div className="flex w-[52px] shrink-0 items-center justify-end gap-0.5">
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" style={{ color: NEON.cyan }} />
                ) : isCeq ? (<>
                  <button className="grid h-4.5 w-4.5 place-items-center rounded disabled:opacity-40" style={{ color: has ? NEON.muted : NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} disabled={acting} onClick={() => pick(r, "replace")} title={has ? "Replace this clip (keeps one prior version)" : "Upload this question's first clip"}><Upload className="h-3 w-3" /></button>
                  {has && <button className="grid h-4.5 w-4.5 place-items-center rounded disabled:opacity-40" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} disabled={acting} onClick={() => pick(r, "add")} title="Add a clip right after this one (lookback)"><Plus className="h-3 w-3" /></button>}
                  {has && <button className="grid h-4.5 w-4.5 place-items-center rounded disabled:opacity-40" style={{ color: NEON.red, border: `1px solid ${NEON.borderSoft}` }} disabled={acting} onClick={() => del(r)} title="Remove this clip (Ctrl+Z to undo)"><X className="h-3 w-3" /></button>}
                </>) : isWrap ? (<>
                  <button className="grid h-4.5 w-4.5 place-items-center rounded disabled:opacity-40" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} disabled={acting} onClick={() => pick(r, "add")} title="Add a wrap clip"><Plus className="h-3 w-3" /></button>
                  <button className="grid h-4.5 w-4.5 place-items-center rounded disabled:opacity-40" style={{ color: NEON.red, border: `1px solid ${NEON.borderSoft}` }} disabled={acting} onClick={() => del(r)} title="Remove this wrap clip"><X className="h-3 w-3" /></button>
                </>) : null}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="px-1.5 py-2 text-[10px] italic" style={{ color: NEON.muted }}>Nothing in the {mode} cut.</div>}
      </div>
    </div>
  );
}
