// PIPELINE STAGE (Q1, reshaped 08-20) — the editing room: transcript on the
// left, a large cut preview on the right (beside the take rail), and a single
// HORIZONTAL timeline track along the bottom, sharing ONE player so the
// playhead and click-to-seek are the same clock. This is a CHAIN, not a
// compositor — one row of clips, left to right, in cut order. No layers.
//
// SAME PIPES: the player is the P0 cut sequencer (via useCutPlayer); the track's
// reorder/insert/detach reuse the P3 clip operations, mapped back to
// (frameId, clipIndex); trim handles and transcript cuts write the recipe
// through the studio's applyTrim/splitClipAt doors. Nothing here is a second
// data model.
import { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Film, Loader2, Play, Scissors, Square, X } from "lucide-react";

import { fmtDur } from "./ceq-takes";
import { segmentStartsMs, type SeqSegment } from "./cut-sequencer";
import { NEON } from "./theme";
import { transcriptFor, type TranscriptWord } from "./transcript-client";
import { useCutPlayer } from "./use-cut-player";
import { clipAudio, type ClipAudio } from "./waveform-peaks";

export interface StageClip {
  /** Stable identity for selection + drag. */
  key: string;
  /** The CEQ this clip belongs to; null for intro/wrap/outro bookends. */
  frameId: string | null;
  /** Index within that frame's cardClips — what detach/move address. -1 for bookends. */
  clipIndex: number;
  label: string;
  /** Storage path — the trim detail resolves the take + writes the recipe by this. */
  path: string;
  url: string;
  name: string;
  inS: number;
  outS: number;
  /** The SOURCE take's full duration — the bound when a trim handle extends OUT. */
  durS: number;
  gapAfterMs: number;
  /** Q3: part of an internal cut (the path appears more than once). Not
   *  individually reorderable; still selectable + detachable. */
  split?: boolean;
}

const PX_PER_S = 46;
const MIN_W = 54;
/** PADDING BETWEEN CLIPS (Lee, 08-20): clips butted edge-to-edge made the trim
 *  edges unpickable. The gap plus the hover pull-apart makes every edge easy. */
const GAP_PX = 10;
const MIN_CLIP_S = 0.05;
const widthOf = (c: { inS: number; outS: number }) => Math.max(MIN_W, (c.outS - c.inS) * PX_PER_S);

const tcS = (s: number): string => {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  const mmm = Math.floor((t - Math.floor(t)) * 1000);
  return `${m}:${String(sec).padStart(2, "0")}.${String(mmm).padStart(3, "0")}`;
};

/** WAVEFORM IN THE TILE (Lee, 08-20) — each timeline segment draws its own
 *  trimmed window of peaks, from the same per-path audio cache the landmarks
 *  use, so silence is VISIBLE right where you trim it. */
function ClipWave({ path, url, inS, outS }: { path: string; url: string; inS: number; outS: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [audio, setAudio] = useState<ClipAudio | null>(null);
  useEffect(() => { let live = true; clipAudio(path, url).then((a) => { if (live) setAudio(a); }, () => {}); return () => { live = false; }; }, [path, url]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !audio) return;
    const w = (c.width = Math.max(1, c.clientWidth));
    const h = (c.height = Math.max(1, c.clientHeight));
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(122,210,255,0.55)";
    const a0 = inS * 1000, a1 = Math.max(a0 + 1, outS * 1000);
    for (let px = 0; px < w; px++) {
      const ms = a0 + (px / w) * (a1 - a0);
      const f = Math.max(0, Math.min(audio.peaks.length - 1, Math.floor(ms / audio.frameMs)));
      const amp = Math.min(1, audio.peaks[f] * 1.4);
      const bh = Math.max(1, amp * (h - 6));
      g.fillRect(px, (h - bh) / 2, 1, bh);
    }
  }, [audio, inS, outS]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

/** One timeline segment: waveform, label, detach — and a TRIM HANDLE on each
 *  edge. Dragging a handle writes the trim ON RELEASE, no confirmation (Lee,
 *  08-20): place it where you want; drag back to revert. */
function ClipTile({ clip, w, selected, underPlayhead, shift, onHover, onSelect, onDetach, onDragStart, onTrim }: {
  clip: StageClip; w: number; selected: boolean; underPlayhead: boolean;
  /** Hover pull-apart: px this tile slides so a neighbour's edges open up. */
  shift: number;
  onHover: (on: boolean) => void;
  onSelect: () => void; onDetach: (() => void) | null; onDragStart: (e: React.DragEvent) => void;
  onTrim: ((inS: number, outS: number) => void) | null;
}) {
  const canDrag = clip.frameId != null && !clip.split;
  const [drag, setDrag] = useState<{ which: "in" | "out"; valS: number } | null>(null);
  const pxPerS = w / Math.max(MIN_CLIP_S, clip.outS - clip.inS);
  const startHandle = (which: "in" | "out") => (e: React.PointerEvent) => {
    if (!onTrim) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const x0 = e.clientX;
    const base = which === "in" ? clip.inS : clip.outS;
    const clampV = (v: number) => (which === "in" ? Math.min(Math.max(0, v), clip.outS - MIN_CLIP_S) : Math.max(Math.min(clip.durS, v), clip.inS + MIN_CLIP_S));
    setDrag({ which, valS: base });
    const move = (ev: PointerEvent) => setDrag({ which, valS: clampV(base + (ev.clientX - x0) / pxPerS) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const v = clampV(base + (ev.clientX - x0) / pxPerS);
      setDrag(null);
      if (Math.abs(v - base) > 0.005) onTrim(which === "in" ? v : clip.inS, which === "in" ? clip.outS : v);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const dragX = drag ? Math.max(0, Math.min(w, drag.which === "in" ? (drag.valS - clip.inS) * pxPerS : w - (clip.outS - drag.valS) * pxPerS)) : null;
  return (
    <div
      draggable={canDrag && !drag}
      onDragStart={onDragStart}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="group relative flex h-full shrink-0 flex-col overflow-hidden rounded"
      style={{ width: w, cursor: canDrag ? "grab" : "pointer", transform: `translateX(${shift}px)`, transition: drag ? undefined : "transform 130ms ease", border: `1.5px solid ${selected ? NEON.yellow : underPlayhead ? "#3BF5A0" : clip.split ? "#B79CFF" : NEON.borderSoft}`, background: "#0b0f1e", boxShadow: selected ? `0 0 0 1px ${NEON.yellow}` : undefined }}
      title={`${clip.label} · ${clip.name} · ${fmtDur(clip.outS - clip.inS)}${clip.split ? " · internal cut (select to re-edit; not draggable)" : ""}${onTrim ? " · drag an edge to trim" : ""}`}
    >
      <div className="relative min-h-0 flex-1">
        <ClipWave path={clip.path} url={clip.url} inS={clip.inS} outS={clip.outS} />
        <span className="absolute left-1 top-0.5 rounded px-1 text-[8px] font-black uppercase tabular-nums" style={{ color: "#0B1322", background: NEON.yellow }}>{clip.label}</span>
        {onDetach && <button className="absolute right-1 top-0.5 grid h-3.5 w-3.5 place-items-center rounded opacity-0 transition-opacity group-hover:opacity-100" style={{ background: "rgba(0,0,0,0.6)", color: "#FF8B9E" }} title="Detach → scratch (file untouched)" onClick={(e) => { e.stopPropagation(); onDetach(); }}><X className="h-2.5 w-2.5" /></button>}
        {/* Live drag feedback: shade what the release will trim away + the exact timecode. */}
        {drag && dragX != null && (
          <>
            <div className="pointer-events-none absolute inset-y-0" style={drag.which === "in" ? { left: 0, width: dragX, background: "rgba(0,0,0,0.55)" } : { left: dragX, right: 0, background: "rgba(0,0,0,0.55)" }} />
            <div className="pointer-events-none absolute inset-y-0 w-0.5" style={{ left: dragX, background: NEON.yellow }} />
            <span className="pointer-events-none absolute bottom-4 rounded px-1 text-[8px] font-black tabular-nums" style={{ left: Math.min(Math.max(2, dragX - 24), w - 52), color: "#0B1322", background: NEON.yellow }}>{tcS(drag.valS)}</span>
          </>
        )}
      </div>
      <div className="flex items-center justify-between px-1" style={{ background: "rgba(0,0,0,0.5)" }}>
        <span className="truncate text-[7px]" style={{ color: NEON.muted }}>{clip.name}</span>
        <span className="shrink-0 text-[7px] tabular-nums" style={{ color: "#3BF5A0" }}>{fmtDur(clip.outS - clip.inS)}</span>
      </div>
      {/* TRIM HANDLES — the whole edge zone drags; the bright bar appears on hover. */}
      {onTrim && (["in", "out"] as const).map((which) => (
        <div key={which} className="absolute inset-y-0 z-10" style={{ [which === "in" ? "left" : "right"]: 0, width: 10, cursor: "ew-resize", touchAction: "none" }}
          draggable={false} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }} onClick={(e) => e.stopPropagation()} onPointerDown={startHandle(which)}
          title={which === "in" ? "Drag to trim the head — releases exactly where you drop it" : "Drag to trim the tail (drag outward to bring footage back)"}>
          <div className="absolute inset-y-1 w-1 rounded opacity-0 transition-opacity group-hover:opacity-100" style={{ [which === "in" ? "left" : "right"]: 1, background: NEON.yellow } as React.CSSProperties} />
        </div>
      ))}
    </div>
  );
}

/** TRANSCRIPT PANEL (Lee, 08-20) — top-left of the editing room. The active
 *  clip's Whisper words: click seeks the CUT player, shift-click extends a
 *  selection, Delete removes the selected span as an internal cut. Words the
 *  trims already dropped render struck-through, so the text mirrors the cut. */
function TranscriptPanel({ clip, sourcePosS, onSeek, onCut }: {
  clip: StageClip | null;
  /** The playhead as SOURCE seconds inside this clip (null when it's elsewhere). */
  sourcePosS: number | null;
  onSeek: (sourceS: number) => void;
  onCut: (cutStartS: number, cutEndS: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [words, setWords] = useState<TranscriptWord[] | null>(null);
  const [status, setStatus] = useState<"loading" | "none" | "ready">("loading");
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const path = clip?.path ?? null;
  useEffect(() => {
    let live = true;
    setWords(null); setSel(null);
    if (!path) { setStatus("none"); return; }
    setStatus("loading");
    transcriptFor(path).then((r) => { if (!live) return; if (r && r.words.length) { setWords(r.words); setStatus("ready"); } else setStatus("none"); }, () => { if (live) setStatus("none"); });
    return () => { live = false; };
  }, [path]);
  const range = sel ? { a: Math.min(sel.a, sel.b), b: Math.max(sel.a, sel.b) } : null;
  const cur = useMemo(() => (words && sourcePosS != null ? words.findIndex((w) => sourcePosS >= w.s && sourcePosS < w.e) : -1), [words, sourcePosS]);
  const doCut = () => { if (!range || !words) return; onCut(words[range.a].s, words[range.b].e); setSel(null); };
  return (
    <div ref={rootRef} tabIndex={0} className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-lg outline-none" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${range ? "rgba(255,176,32,0.6)" : NEON.borderSoft}` }}
      onKeyDown={(e) => { if ((e.key === "Delete" || e.key === "Backspace") && range) { e.preventDefault(); e.stopPropagation(); doCut(); } }}>
      <div className="flex items-center gap-1.5 border-b px-2 py-1" style={{ borderColor: NEON.borderSoft }}>
        <span className="text-[8px] font-black uppercase tracking-wide" style={{ color: NEON.cyan }}>Transcript</span>
        {clip && <span className="rounded px-1 text-[8px] font-black uppercase" style={{ color: "#0B1322", background: NEON.yellow }}>{clip.label}</span>}
        {status === "loading" && <span className="text-[8px] italic" style={{ color: NEON.muted }}>loading…</span>}
        {range && words && (
          <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-black uppercase" style={{ color: "#0B1322", background: "#FFB020" }} onClick={doCut} title="Remove the selected words — an internal cut in the recipe (Delete does the same)"><Scissors className="h-2.5 w-2.5" /> cut · Del</button>
        )}
        {!range && <span className="ml-auto text-[7.5px] uppercase tracking-wide" style={{ color: NEON.muted }}>click = seek · shift = select · Del = cut</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-[11.5px] leading-relaxed" style={{ color: NEON.text }} onMouseDown={() => rootRef.current?.focus()}>
        {!clip && <span className="text-[9px] italic" style={{ color: NEON.muted }}>No clip in the cut yet — the active clip's words land here.</span>}
        {clip && status === "none" && <span className="text-[9px] italic" style={{ color: NEON.muted }}>Not transcribed. Whisper transcribes kept takes in the background (the “✎ transcribe” toggle in the take rail).</span>}
        {clip && words?.map((w, i) => {
          const gone = w.e <= clip.inS + 0.001 || w.s >= clip.outS - 0.001; // already trimmed/cut away
          const inSel = range != null && i >= range.a && i <= range.b;
          return (
            <span key={i}
              onClick={(e) => { if (gone) return; if (e.shiftKey && sel) setSel({ a: sel.a, b: i }); else { setSel({ a: i, b: i }); onSeek(w.s); } }}
              style={{ cursor: gone ? "default" : "pointer", borderRadius: 3, padding: "0 1px", opacity: gone ? 0.32 : 1, textDecoration: gone ? "line-through" : undefined, background: inSel ? "rgba(252,163,17,0.4)" : i === cur ? "rgba(59,245,160,0.4)" : "transparent" }}>{w.t}{" "}</span>
          );
        })}
      </div>
    </div>
  );
}

export function PipelineStage({ clips, frames, currentCeqId, hidden, selectedKey, onSelectClip, onMoveClip, onDropTake, onDropTakeToFrames, onDetach, onTrimClip, onCutClip, onAuthorFrame, onOpenCapture, onTrueRender, renderPhase, renderBusy }: {
  clips: StageClip[];
  frames: { id: string; label: string }[];
  currentCeqId: string | null;
  hidden?: boolean;
  selectedKey: string | null;
  onSelectClip: (c: StageClip | null) => void;
  onMoveClip: (from: { frameId: string; index: number }, toFrameId: string, atIndex: number) => void;
  onDropTake: (takeId: string, toFrameId: string, atIndex: number) => void;
  /** BLAST: attach one take across the CHECKED frames as a single clip. */
  onDropTakeToFrames: (takeId: string, frameIds: string[]) => void;
  onDetach: (frameId: string, index: number) => void;
  /** Edge-handle release → the studio's applyTrim door (recipe only). */
  onTrimClip: (path: string, inS: number, outS: number) => void;
  /** Transcript Delete → the studio's splitClipAt door (internal cut). */
  onCutClip: (path: string, cutStartS: number, cutEndS: number) => void;
  onAuthorFrame: (frameId: string) => void;
  onOpenCapture: () => void;
  onTrueRender: () => void;
  renderPhase?: string | null;
  renderBusy?: boolean;
}) {
  const segs: SeqSegment[] = useMemo(() => clips.map((c, i) => ({ inS: c.inS, outS: c.outS, gapAfterMs: i === clips.length - 1 ? 0 : c.gapAfterMs, url: c.url, name: c.name })), [clips]);
  const resetKey = clips.map((c) => `${c.url}@${c.inS}-${c.outS}`).join(",");
  const player = useCutPlayer(segs, resetKey);
  const stopRef = useRef(player.stop);
  stopRef.current = player.stop;
  useEffect(() => { if (hidden) stopRef.current(); }, [hidden]);

  const startsMs = useMemo(() => segmentStartsMs(segs), [segs]);
  const widths = useMemo(() => clips.map(widthOf), [clips]);
  // Offsets INCLUDE the inter-clip gap (Lee's padding) — playhead, seek, and the
  // drop caret all live in this same gapped coordinate space.
  const offsets = useMemo(() => { const o: number[] = []; let a = 0; for (const w of widths) { o.push(a); a += w + GAP_PX; } return o; }, [widths]);
  const trackW = offsets.length ? offsets[offsets.length - 1] + widths[widths.length - 1] : 0;
  const at = player.state.at;

  // Playhead px on the content-width track. positionMs is gap-inclusive and so
  // are startsMs, so (positionMs − segStart) during a clip is content-elapsed.
  const playheadPx = useMemo(() => {
    if (at < 0 || at >= clips.length) return 0;
    const contentMs = (clips[at].outS - clips[at].inS) * 1000;
    const within = contentMs > 0 ? Math.max(0, Math.min(1, (player.positionMs - startsMs[at]) / contentMs)) : 0;
    return offsets[at] + within * widths[at];
  }, [at, player.positionMs, clips, startsMs, offsets, widths]);

  const [dropAt, setDropAt] = useState<number | null>(null); // insertion index (flat) for the caret
  const [hoverIdx, setHoverIdx] = useState<number | null>(null); // pull-apart hover
  const [frameSel, setFrameSel] = useState<Set<string>>(new Set()); // BLAST: frames a dropped take covers
  const allChecked = frames.length > 0 && frameSel.size === frames.length;
  const toggleFrame = (id: string) => setFrameSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const trackRef = useRef<HTMLDivElement | null>(null);

  const insertionIndex = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return clips.length;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft;
    for (let i = 0; i < clips.length; i++) if (x < offsets[i] + widths[i] / 2) return i;
    return clips.length;
  };
  // Flat insertion index → (frameId, indexWithinFrame). Attaches to the frame of
  // the clip we're inserting BEFORE; at the end, after the last clip's frame.
  const target = (flat: number): { frameId: string; index: number } | null => {
    const ref = clips[flat] ?? clips[clips.length - 1];
    if (!ref || ref.frameId == null) {
      // fall back to the first real CEQ clip, or the first set frame
      const firstReal = clips.find((c) => c.frameId != null);
      if (firstReal) return { frameId: firstReal.frameId as string, index: firstReal.clipIndex };
      return frames[0] ? { frameId: frames[0].id, index: 0 } : null;
    }
    return { frameId: ref.frameId, index: flat >= clips.length ? ref.clipIndex + 1 : ref.clipIndex };
  };

  const onTrackDragOver = (e: React.DragEvent) => { if (e.dataTransfer.types.includes("application/x-sa-take")) { e.preventDefault(); setDropAt(insertionIndex(e.clientX)); } };
  const onTrackDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("application/x-sa-take");
    setDropAt(null);
    if (!raw) return;
    e.preventDefault();
    const flat = insertionIndex(e.clientX);
    const tgt = target(flat);
    if (!tgt) return;
    try {
      const p = JSON.parse(raw) as { kind: string; id?: string; frameId?: string; index?: number };
      if (p.kind === "clip" && p.frameId && p.index != null) { if (p.frameId !== tgt.frameId || p.index !== tgt.index) onMoveClip({ frameId: p.frameId, index: p.index }, tgt.frameId, tgt.index); }
      else if (p.id) onDropTake(p.id, tgt.frameId, tgt.index);
    } catch { /* not our payload */ }
  };

  const seekToPx = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !clips.length) return;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft;
    let i = clips.findIndex((_, k) => x < offsets[k] + widths[k]);
    if (i < 0) i = clips.length - 1;
    const within = Math.max(0, Math.min(1, (x - offsets[i]) / widths[i]));
    const contentMs = (clips[i].outS - clips[i].inS) * 1000;
    player.playFromMs(startsMs[i] + within * contentMs);
  };

  // TRANSCRIPT TARGET — the selected clip, else the clip under the playhead,
  // else the first clip of the cut. One panel, always showing something useful.
  const txIdx = useMemo(() => {
    const si = selectedKey ? clips.findIndex((c) => c.key === selectedKey) : -1;
    if (si >= 0) return si;
    if (at >= 0 && at < clips.length) return at;
    return clips.length ? 0 : -1;
  }, [selectedKey, clips, at]);
  const txClip = txIdx >= 0 ? clips[txIdx] : null;
  // The playhead as SOURCE seconds inside the transcript clip — the karaoke clock.
  const sourcePosS = useMemo(() => {
    if (!txClip || at !== txIdx) return null;
    return txClip.inS + Math.max(0, player.positionMs - startsMs[txIdx]) / 1000;
  }, [txClip, at, txIdx, player.positionMs, startsMs]);
  const seekSource = (s: number) => {
    if (!txClip) return;
    const withinS = Math.max(0, Math.min(txClip.outS - txClip.inS, s - txClip.inS));
    player.playFromMs(startsMs[txIdx] + withinS * 1000);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {/* TOP ZONE (Lee, 08-20) — transcript top-left, the cut preview beside the
          take rail. The timeline owns the full width below. */}
      <div className="flex min-h-0 flex-1 gap-1.5">
        <TranscriptPanel clip={txClip} sourcePosS={sourcePosS} onSeek={seekSource} onCut={(a, b) => txClip && onCutClip(txClip.path, a, b)} />
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg" style={{ background: "#000", border: `1px solid ${NEON.borderSoft}` }}>
          <video {...player.videoProps} playsInline preload="metadata" className="h-full w-full" style={{ objectFit: "contain", background: "#000" }} onClick={() => (player.state.playing ? player.stop() : player.playFrom(0))} />
          {!player.state.playing && !clips.length && <div className="absolute inset-0 grid place-items-center text-[11px] italic" style={{ color: NEON.muted }}>No clips in the cut — drop takes from scratch onto a frame below.</div>}
          {player.state.skipped.length > 0 && <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[9px]" style={{ background: "rgba(0,0,0,0.7)", color: "#FFB020" }}>{player.state.skipped.length} clip{player.state.skipped.length === 1 ? "" : "s"} skipped — {player.state.skipped.map((k) => `${k.name} (${k.reason})`).join(", ")}. The cut kept going.</div>}
        </div>
      </div>

      {/* TRANSPORT + scrub bar */}
      <div className="shrink-0">
        <div className="mb-1 flex items-center gap-1.5">
          <button className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-black uppercase" style={{ color: player.state.playing ? "#FF8B9E" : "#0B1322", background: player.state.playing ? "transparent" : "#3BF5A0", border: `1px solid ${player.state.playing ? "rgba(255,139,158,0.5)" : "#3BF5A0"}` }} disabled={!clips.length} onClick={() => (player.state.playing ? player.stop() : player.playFrom(0))}>{player.state.playing ? <><Square className="h-3 w-3" /> stop</> : <><Play className="h-3 w-3" /> play cut</>}</button>
          <span className="text-[10px] tabular-nums" style={{ color: NEON.muted }}>{fmtDur(player.positionMs / 1000)} / {fmtDur(player.totalMs / 1000)} · {clips.length} clip{clips.length === 1 ? "" : "s"}</span>
          <button className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase" style={{ color: "#FF8B9E", border: "1px solid rgba(255,90,110,0.55)" }} onClick={onOpenCapture} title="Open the capture window — the film previewer + OBS 1920×1080 window. Roll takes (F9), keep/trash (F10/F8). Pull it out only while filming."><Clapperboard className="h-3.5 w-3.5" /> capture</button>
          <div className="flex flex-col items-end">
            <button className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-50" style={{ color: "#3BF5A0", border: "1px solid rgba(59,245,160,0.5)" }} disabled={!!renderBusy || !clips.length} onClick={onTrueRender} title="TRUE RENDER — the exact ffmpeg bake (concat, loudness, crossfades). This is the FINAL step: slow, and only worth running once timing is locked and you're about to publish. Iterate with the inline preview above; it's instant.">{renderBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />} true render</button>
            <span className="text-[7px] uppercase tracking-wide" style={{ color: NEON.muted }}>final bake · lock timing first</span>
          </div>
        </div>
        {/* scrub bar over the whole cut */}
        <div className="relative h-2 cursor-pointer rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); player.playFromMs(((e.clientX - r.left) / r.width) * player.totalMs); }} title="Scrub the whole cut">
          <div className="absolute top-0 h-full rounded-full" style={{ width: `${player.totalMs ? (player.positionMs / player.totalMs) * 100 : 0}%`, background: "#3BF5A0" }} />
        </div>
      </div>

      {/* THE TIMELINE — single horizontal track, cut order, PADDED segments (the
          frame-marker row is gone: the frame bar below is the authoring door).
          Drag a tile to reorder; drag an EDGE to trim; hovering a tile pulls its
          neighbours apart so either edge is easy to pick. */}
      <div ref={trackRef} className="relative shrink-0 overflow-x-auto overflow-y-hidden rounded-lg" style={{ height: 96, background: "rgba(0,0,0,0.28)", border: `1px solid ${NEON.borderSoft}` }} onDragOver={onTrackDragOver} onDragLeave={() => setDropAt(null)} onDrop={onTrackDrop} onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.track) seekToPx(e.clientX); }}>
        {clips.length === 0 ? (
          <div className="flex h-full items-center justify-center px-3 text-center" data-track="1">
            <span className="text-[9px] italic" style={{ color: NEON.muted }}>No clips yet — check the frames below, then drop a scratch take on the frame bar. Check ALL for a blast (one clip, whole set).</span>
          </div>
        ) : (
          <div className="relative h-full p-1" style={{ width: trackW + 8 }} data-track="1">
            <div className="flex h-full" style={{ gap: GAP_PX }}>
              {clips.map((c, i) => (
                <ClipTile key={c.key} clip={c} w={widths[i]} selected={c.key === selectedKey} underPlayhead={i === at}
                  shift={hoverIdx == null || i === hoverIdx ? 0 : i < hoverIdx ? -5 : 5}
                  onHover={(on) => setHoverIdx((h) => (on ? i : h === i ? null : h))}
                  onSelect={() => onSelectClip(c)}
                  onDetach={c.frameId != null ? () => onDetach(c.frameId as string, c.clipIndex) : null}
                  onTrim={c.split ? null : (inS, outS) => onTrimClip(c.path, inS, outS)}
                  onDragStart={(e) => { if (c.frameId == null || c.split) { e.preventDefault(); return; } e.dataTransfer.setData("application/x-sa-take", JSON.stringify({ kind: "clip", frameId: c.frameId, index: c.clipIndex })); e.dataTransfer.effectAllowed = "move"; }} />
              ))}
            </div>
            {dropAt != null && <div className="pointer-events-none absolute top-1 bottom-1 w-0.5" style={{ left: 4 + (offsets[dropAt] ?? trackW), background: NEON.yellow }} />}
            <div className="pointer-events-none absolute top-0 bottom-0 w-0.5" style={{ left: 4 + playheadPx, background: "#FF3B6B", boxShadow: "0 0 4px #FF3B6B" }} />
          </div>
        )}
      </div>

      {/* FRAME BAR (blast drop) — check the frames a clip covers, then drop a
          scratch take here. One check = a normal single-frame clip; several (or
          ALL) = ONE clip covering them (a blast). Dropping requires a check.
          The labels are also the door to AUTHORING that frame. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-lg p-1.5" style={{ background: "rgba(0,0,0,0.28)", border: `1px solid ${frameSel.size ? "#3BF5A0" : NEON.borderSoft}` }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-sa-take")) e.preventDefault(); }}
        onDrop={(e) => { const raw = e.dataTransfer.getData("application/x-sa-take"); if (!raw) return; e.preventDefault(); e.stopPropagation(); try { const p = JSON.parse(raw) as { kind: string; id?: string }; if (p.kind === "clip" || !p.id) return; onDropTakeToFrames(p.id, [...frameSel]); } catch { /* ignore */ } }}>
        <span className="text-[8px] font-black uppercase tracking-wide" style={{ color: NEON.cyan }}>Frames</span>
        <button className="rounded px-1.5 py-0.5 text-[8.5px] font-black uppercase" style={{ color: allChecked ? "#0B1322" : NEON.muted, background: allChecked ? "#3BF5A0" : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => setFrameSel(allChecked ? new Set() : new Set(frames.map((f) => f.id)))} title="Check every frame — a blast clip covers the whole set">{allChecked ? "☑" : "☐"} all</button>
        {frames.map((f) => {
          const on = frameSel.has(f.id);
          return (
            <span key={f.id} className="flex items-center gap-0.5 rounded px-1 py-0.5" style={{ border: `1px solid ${on ? "#3BF5A0" : NEON.borderSoft}`, background: on ? "rgba(59,245,160,0.12)" : "transparent" }}>
              <button className="text-[10px] font-black leading-none" style={{ color: on ? "#3BF5A0" : NEON.muted }} onClick={() => toggleFrame(f.id)} title={`Include ${f.label} in the next drop`}>{on ? "☑" : "☐"}</button>
              <button className="text-[8.5px] font-bold uppercase" style={{ color: NEON.cyan }} onClick={() => onAuthorFrame(f.id)} title={`${f.label} — click the box to include, the label to author this frame`}>{f.label}</button>
            </span>
          );
        })}
        <span className="ml-auto text-[8px]" style={{ color: frameSel.size ? "#3BF5A0" : NEON.muted }}>{frameSel.size ? `drop a take → 1 clip on ${frameSel.size} frame${frameSel.size > 1 ? "s" : ""}` : "check frames, then drop a take here"}</span>
      </div>
    </div>
  );
}
