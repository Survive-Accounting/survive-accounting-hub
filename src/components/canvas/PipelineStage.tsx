// PIPELINE STAGE (Q1) — the editing room's main object: a large cut preview on
// top and a single HORIZONTAL timeline track beneath it, sharing ONE player so
// the playhead and click-to-seek are the same clock. This is a CHAIN, not a
// compositor — one row of clips, left to right, in cut order. No layers.
//
// SAME PIPES: the player is the P0 cut sequencer (via useCutPlayer); the track's
// reorder/insert/detach reuse the P3 clip operations, mapped back to
// (frameId, clipIndex). Nothing here is a second data model.
import { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Film, Loader2, Pencil, Play, Square, X } from "lucide-react";

import { clipThumb } from "./clip-thumb";
import { fmtDur } from "./ceq-takes";
import { segmentStartsMs, type SeqSegment } from "./cut-sequencer";
import { NEON } from "./theme";
import { useCutPlayer } from "./use-cut-player";

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
  gapAfterMs: number;
  /** Q3: part of an internal cut (the path appears more than once). Not
   *  individually reorderable; still selectable + detachable. */
  split?: boolean;
}

const PX_PER_S = 46;
const MIN_W = 54;
const widthOf = (c: { inS: number; outS: number }) => Math.max(MIN_W, (c.outS - c.inS) * PX_PER_S);

/** One timeline tile — its own poster frame, grabbed lazily and cached. */
function ClipTile({ clip, w, selected, underPlayhead, onSelect, onDetach, onDragStart }: {
  clip: StageClip; w: number; selected: boolean; underPlayhead: boolean;
  onSelect: () => void; onDetach: (() => void) | null; onDragStart: (e: React.DragEvent) => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => { let live = true; clipThumb(clip.url, clip.inS + 0.15).then((t) => { if (live) setThumb(t); }, () => {}); return () => { live = false; }; }, [clip.url, clip.inS]);
  const canDrag = clip.frameId != null && !clip.split;
  return (
    <div
      draggable={canDrag}
      onDragStart={onDragStart}
      onClick={onSelect}
      className="relative flex h-full shrink-0 flex-col overflow-hidden rounded"
      style={{ width: w, cursor: canDrag ? "grab" : "pointer", border: `1.5px solid ${selected ? NEON.yellow : underPlayhead ? "#3BF5A0" : clip.split ? "#B79CFF" : NEON.borderSoft}`, background: "#0b0f1e", boxShadow: selected ? `0 0 0 1px ${NEON.yellow}` : undefined }}
      title={`${clip.label} · ${clip.name} · ${fmtDur(clip.outS - clip.inS)}${clip.split ? " · internal cut (select to re-edit; not draggable)" : ""}`}
    >
      <div className="relative flex-1" style={{ background: thumb ? `center/cover no-repeat url(${thumb})` : "linear-gradient(135deg,#12203a,#0b0f1e)" }}>
        {!thumb && <div className="absolute inset-0 grid place-items-center text-[9px]" style={{ color: NEON.muted }}><Play className="h-3 w-3" /></div>}
        <span className="absolute left-0.5 top-0.5 rounded px-1 text-[8px] font-black uppercase tabular-nums" style={{ color: "#0B1322", background: NEON.yellow }}>{clip.label}</span>
        {onDetach && <button className="absolute right-0.5 top-0.5 grid h-3.5 w-3.5 place-items-center rounded" style={{ background: "rgba(0,0,0,0.6)", color: "#FF8B9E" }} title="Detach → scratch (file untouched)" onClick={(e) => { e.stopPropagation(); onDetach(); }}><X className="h-2.5 w-2.5" /></button>}
      </div>
      <div className="flex items-center justify-between px-0.5" style={{ background: "rgba(0,0,0,0.5)" }}>
        <span className="truncate text-[7px]" style={{ color: NEON.muted }}>{clip.name}</span>
        <span className="shrink-0 text-[7px] tabular-nums" style={{ color: "#3BF5A0" }}>{fmtDur(clip.outS - clip.inS)}</span>
      </div>
    </div>
  );
}

export function PipelineStage({ clips, frames, currentCeqId, hidden, selectedKey, onSelectClip, onMoveClip, onDropTake, onDropTakeToFrames, onDetach, onAuthorFrame, onOpenCapture, onTrueRender, renderPhase, renderBusy }: {
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
  const offsets = useMemo(() => { const o: number[] = []; let a = 0; for (const w of widths) { o.push(a); a += w; } return o; }, [widths]);
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
  const [scrollLeft, setScrollLeft] = useState(0);           // so the marker row tracks the timeline scroll
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

  // Track-aligned frame markers: runs of consecutive same-frame clips.
  const markerRuns = useMemo(() => {
    const runs: { frameId: string | null; label: string; left: number; width: number }[] = [];
    for (let i = 0; i < clips.length; i++) {
      const prev = runs[runs.length - 1];
      if (prev && prev.frameId === clips[i].frameId) prev.width += widths[i];
      else runs.push({ frameId: clips[i].frameId, label: clips[i].label, left: offsets[i], width: widths[i] });
    }
    return runs;
  }, [clips, widths, offsets]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* CUT PREVIEW — the main object, top of the view, large. */}
      <div className="relative flex-1 overflow-hidden rounded-lg" style={{ background: "#000", border: `1px solid ${NEON.borderSoft}`, minHeight: 220 }}>
        <video {...player.videoProps} playsInline preload="metadata" className="h-full w-full" style={{ objectFit: "contain", background: "#000" }} onClick={() => (player.state.playing ? player.stop() : player.playFrom(0))} />
        {!player.state.playing && !clips.length && <div className="absolute inset-0 grid place-items-center text-[11px] italic" style={{ color: NEON.muted }}>No clips in the cut — drop takes from scratch onto a frame below.</div>}
        {player.state.skipped.length > 0 && <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[9px]" style={{ background: "rgba(0,0,0,0.7)", color: "#FFB020" }}>{player.state.skipped.length} clip{player.state.skipped.length === 1 ? "" : "s"} skipped — {player.state.skipped.map((k) => `${k.name} (${k.reason})`).join(", ")}. The cut kept going.</div>}
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

      {/* FRAME-MARKER ROW — which CEQ each region of the cut is. Click → author. */}
      {clips.length > 0 && (
        <div className="relative h-4 shrink-0 overflow-hidden">
          <div className="relative h-full" style={{ width: trackW, marginLeft: -scrollLeft }}>
            {markerRuns.map((r, i) => (
              <button key={i} className="absolute top-0 h-full truncate rounded-sm px-1 text-[8px] font-black uppercase" style={{ left: r.left, width: Math.max(0, r.width - 2), background: r.frameId === currentCeqId ? NEON.yellow : "rgba(122,210,255,0.18)", color: r.frameId === currentCeqId ? "#0B1322" : NEON.cyan, cursor: r.frameId ? "pointer" : "default" }} disabled={!r.frameId} onClick={() => r.frameId && onAuthorFrame(r.frameId)} title={r.frameId ? `${r.label} — click to edit this frame in Authoring (stem / choices / layout), then switch back` : r.label}>{r.label}{r.frameId ? <Pencil className="ml-0.5 inline h-2 w-2" /> : null}</button>
            ))}
          </div>
        </div>
      )}

      {/* THE TIMELINE — single horizontal track, cut order, drag to reorder. */}
      <div ref={trackRef} className="relative shrink-0 overflow-x-auto overflow-y-hidden rounded-lg" style={{ height: 78, background: "rgba(0,0,0,0.28)", border: `1px solid ${NEON.borderSoft}` }} onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)} onDragOver={onTrackDragOver} onDragLeave={() => setDropAt(null)} onDrop={onTrackDrop} onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.track) seekToPx(e.clientX); }}>
        {clips.length === 0 ? (
          <div className="flex h-full items-center justify-center px-3 text-center" data-track="1">
            <span className="text-[9px] italic" style={{ color: NEON.muted }}>No clips yet — check the frames below, then drop a scratch take on the frame bar. Check ALL for a blast (one clip, whole set).</span>
          </div>
        ) : (
          <div className="relative h-full p-1" style={{ width: trackW + 8 }} data-track="1">
            <div className="flex h-full gap-0">
              {clips.map((c, i) => (
                <ClipTile key={c.key} clip={c} w={widths[i]} selected={c.key === selectedKey} underPlayhead={i === at}
                  onSelect={() => onSelectClip(c)}
                  onDetach={c.frameId != null ? () => onDetach(c.frameId as string, c.clipIndex) : null}
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
          ALL) = ONE clip covering them (a blast). Dropping requires a check. */}
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
