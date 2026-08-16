// STITCH PREVIEW PANEL (F3) — watch the stitch, see the math, adjust it, then
// approve. Nothing here uploads, renders or publishes; approving is a callback.
//
// PLAYBACK is a sequencer, not a render: one <video>, seek to trimIn, play to
// trimOut, hold for the gap, next clip. That starts instantly, needs no worker,
// and previews the decisions that make a stitch good or bad. What it can't
// reproduce (loudness, room tone, crossfades) is stated on the panel — see
// PREVIEW_CAVEAT — rather than implied away.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Play, RotateCcw, Square, Volume2, X } from "lucide-react";

import { recut, type StitchDef } from "./stitch-defs";
import {
  PREVIEW_CAVEAT, clearTrim, fmtT, moveItem, nudgeTrim, previewTimeline, setGap, toggleMuted,
} from "./stitch-preview";
import { NEON } from "./theme";
import type { TakeRef } from "./types";

export interface StitchPreviewProps {
  stitch: StitchDef;
  /** Every take the stitch can reference, by storage path. */
  takes: Map<string, TakeRef>;
  /** Persist an edited stitch. ALWAYS routed through `recut` here, so derived
   *  publications go stale — never call this with a hand-built stitch. */
  onChange: (next: StitchDef) => void;
  /** Approve → the caller may upload/publish. Nothing auto-publishes. */
  onApprove?: (stitch: StitchDef) => void;
  onClose: () => void;
  /** Blocking gate items, if the caller wants them shown before approval. */
  blockers?: { id: string; text: string }[];
}

const NUDGES = [-1, -0.25, 0.25, 1] as const;

export function StitchPreview({ stitch, takes, onChange, onApprove, onClose, blockers }: StitchPreviewProps) {
  const tl = useMemo(() => previewTimeline(stitch, takes), [stitch, takes]);
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);          // segment index being played
  const gapTimer = useRef<number | undefined>(undefined);
  const [inGap, setInGap] = useState(false);

  const stop = () => {
    if (gapTimer.current != null) window.clearTimeout(gapTimer.current);
    gapTimer.current = undefined;
    vidRef.current?.pause();
    setPlaying(false);
    setInGap(false);
  };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Editing the cut mid-play would leave the sequencer pointing at a clip that
  // moved — stop rather than play something Lee didn't ask for.
  useEffect(() => { stop(); setAt(0); }, [stitch.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const playFrom = (i: number) => {
    const seg = tl.segments[i];
    const v = vidRef.current;
    if (!seg || !v) { stop(); return; }
    setAt(i);
    setInGap(false);
    const start = () => { v.currentTime = seg.inS; void v.play().catch(() => setPlaying(false)); };
    if (v.src !== seg.url) { v.src = seg.url; v.addEventListener("loadedmetadata", start, { once: true }); v.load(); }
    else start();
    setPlaying(true);
  };

  /** The tail watcher: stop at trimOut, hold the gap, roll the next clip. */
  const onTime = () => {
    const seg = tl.segments[at];
    const v = vidRef.current;
    if (!seg || !v || !playing || inGap) return;
    if (v.currentTime < seg.outS - 0.03) return;
    v.pause();
    const next = at + 1;
    if (next >= tl.segments.length) { stop(); return; }
    if (seg.gapAfterMs > 0) {
      setInGap(true);
      gapTimer.current = window.setTimeout(() => playFrom(next), seg.gapAfterMs);
    } else playFrom(next);
  };

  const edit = (items: StitchDef["items"]) => onChange(recut(stitch, { items }));
  /** Map a visible segment back to its index in the FULL items array — muted
   *  clips are still in `items`, so the two indices diverge the moment one is
   *  dropped, and editing the wrong row would be silent corruption. */
  const itemIndexOf = (takePath: string, nth: number): number => {
    let seen = 0;
    for (let i = 0; i < stitch.items.length; i++) {
      if (stitch.items[i].takePath !== takePath) continue;
      if (seen === nth) return i;
      seen++;
    }
    return -1;
  };

  const muted = stitch.items.filter((i) => i.muted);

  return (
    <div className="absolute inset-0 z-[78] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.72)" }} onClick={onClose}>
      <div className="mt-8 flex max-h-[86vh] w-[820px] max-w-[96vw] flex-col overflow-hidden rounded-xl shadow-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: "#3BF5A0" }}>Preview stitch</span>
          <span className="text-[10px]" style={{ color: NEON.muted }}>{stitch.label ?? stitch.scope.kind} · {tl.segments.length} clip{tl.segments.length === 1 ? "" : "s"} · rev {stitch.rev}</span>
          <span className="ml-auto text-[10px] tabular-nums" style={{ color: NEON.cyan }} title="Trimmed content + inserted gaps">{fmtT(tl.totalS)} total</span>
          <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative">
            <video ref={vidRef} playsInline preload="metadata" onTimeUpdate={onTime} className="w-full" style={{ background: "#000", aspectRatio: "16 / 9", maxHeight: 300 }} />
            {inGap && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ background: "rgba(4,7,14,0.86)" }}>
                <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}><Volume2 className="h-4 w-4" /> gap · {tl.segments[at]?.gapAfterMs}ms room tone</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: NEON.borderSoft }}>
            <button className="flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-black uppercase" style={{ background: playing ? "#FF5A6E" : "#3BF5A0", color: "#0B1322" }} onClick={() => (playing ? stop() : playFrom(0))} disabled={!tl.segments.length}>
              {playing ? <><Square className="h-3 w-3" /> stop</> : <><Play className="h-3 w-3" /> play the cut</>}
            </button>
            <span className="text-[10px] tabular-nums" style={{ color: NEON.muted }}>
              content {fmtT(tl.contentS)} · gaps {fmtT(tl.gapS)} · trimmed away {fmtT(tl.trimmedAwayS)}
            </span>
            {playing && <span className="text-[10px] font-bold" style={{ color: NEON.yellow }}>clip {at + 1}/{tl.segments.length}</span>}
          </div>

          {tl.missing.length > 0 && (
            <div className="border-b px-3 py-1.5 text-[10px]" style={{ borderColor: NEON.borderSoft, color: "#FF8B9E" }}>
              {tl.missing.length} clip{tl.missing.length === 1 ? "" : "s"} in this stitch could not be found and are NOT in the cut: {tl.missing.join(", ")}
            </div>
          )}

          {/* THE MATH — why it sounds the way it does. */}
          <table className="w-full text-[10px]" style={{ color: NEON.text }}>
            <thead>
              <tr style={{ color: NEON.muted }}>
                <th className="px-2 py-1 text-left font-bold uppercase">#</th>
                <th className="px-2 py-1 text-left font-bold uppercase">clip</th>
                <th className="px-2 py-1 text-right font-bold uppercase">raw</th>
                <th className="px-2 py-1 text-right font-bold uppercase" title="After the slate trim (or a manual override)">trimmed</th>
                <th className="px-2 py-1 text-right font-bold uppercase">head / tail</th>
                <th className="px-2 py-1 text-right font-bold uppercase">gap after</th>
                <th className="px-2 py-1 text-right font-bold uppercase">at</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {tl.segments.map((s, vi) => {
                const ii = itemIndexOf(s.takePath, tl.segments.slice(0, vi).filter((x) => x.takePath === s.takePath).length);
                const tk = takes.get(s.takePath);
                return (
                  <tr key={`${s.takePath}:${vi}`} style={{ background: at === vi && playing ? "rgba(252,163,17,0.12)" : "transparent", borderTop: `1px solid ${NEON.borderSoft}` }}>
                    <td className="px-2 py-1 tabular-nums" style={{ color: NEON.muted }}>{vi + 1}</td>
                    <td className="max-w-[190px] truncate px-2 py-1" title={s.name}>
                      {s.slated && <span title="Filmed with the slate — deterministic head trim">⏱ </span>}
                      {s.manual && <span style={{ color: NEON.yellow }} title="Manually trimmed — overrides the slate">✎ </span>}
                      {s.name}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ color: NEON.muted }}>{fmtT(s.rawS)}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ color: "#3BF5A0" }}>{fmtT(s.trimmedS)}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums" style={{ color: NEON.muted }}>
                      {NUDGES.map((d) => (
                        <button key={`in${d}`} className="px-0.5" style={{ color: NEON.cyan }} title={`head ${d > 0 ? "+" : ""}${d}s`} onClick={() => tk && ii >= 0 && edit(nudgeTrim(stitch.items, ii, "in", d, tk))}>{d > 0 ? "▸" : "◂"}</button>
                      ))}
                      <span className="px-1">{fmtT(s.inS)}/{fmtT(s.outS)}</span>
                      {NUDGES.map((d) => (
                        <button key={`out${d}`} className="px-0.5" style={{ color: NEON.cyan }} title={`tail ${d > 0 ? "+" : ""}${d}s`} onClick={() => tk && ii >= 0 && edit(nudgeTrim(stitch.items, ii, "out", d, tk))}>{d > 0 ? "▸" : "◂"}</button>
                      ))}
                      {s.manual && <button className="pl-1" style={{ color: NEON.muted }} title="Clear the manual trim — hand it back to the slate" onClick={() => ii >= 0 && edit(clearTrim(stitch.items, ii))}><RotateCcw className="inline h-2.5 w-2.5" /></button>}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {vi < tl.segments.length - 1 ? (
                        <input type="number" step={50} min={0} value={s.gapAfterMs} className="w-14 rounded bg-black/40 px-1 text-right text-[10px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onChange={(e) => ii >= 0 && edit(setGap(stitch.items, ii, Number(e.target.value)))} title="Silence inserted after this clip (ms) — filled with room tone at render" />
                      ) : <span style={{ color: NEON.muted }}>—</span>}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ color: NEON.muted }}>{fmtT(s.startS)}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right">
                      <button className="px-0.5" style={{ color: NEON.muted }} title="Move up" onClick={() => ii >= 0 && edit(moveItem(stitch.items, ii, -1))}><ChevronUp className="inline h-3 w-3" /></button>
                      <button className="px-0.5" style={{ color: NEON.muted }} title="Move down" onClick={() => ii >= 0 && edit(moveItem(stitch.items, ii, 1))}><ChevronDown className="inline h-3 w-3" /></button>
                      <button className="px-0.5 text-[9px] font-bold" style={{ color: "#FF8B9E" }} title="Drop from the cut — the local original survives and this is one click to undo" onClick={() => ii >= 0 && edit(toggleMuted(stitch.items, ii))}>drop</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {muted.length > 0 && (
            <div className="border-t px-3 py-1.5 text-[10px]" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>
              Dropped ({muted.length}) — still on disk, still in the recipe:{" "}
              {muted.map((m) => {
                const i = stitch.items.indexOf(m);
                return <button key={m.takePath + i} className="mr-1.5 underline" style={{ color: NEON.cyan }} onClick={() => edit(toggleMuted(stitch.items, i))} title="Put it back in the cut">{takes.get(m.takePath)?.name ?? m.takePath}</button>;
              })}
            </div>
          )}
          <div className="px-3 py-1.5 text-[9.5px] italic leading-relaxed" style={{ color: NEON.muted }}>{PREVIEW_CAVEAT}</div>
        </div>

        <div className="flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
          {blockers?.length ? (
            <span className="text-[10px]" style={{ color: "#FF8B9E" }}>{blockers.length} gate{blockers.length === 1 ? "" : "s"} blocking: {blockers.map((b) => b.text).join(" · ")}</span>
          ) : null}
          <button className="ml-auto rounded px-3 py-1 text-[10px] font-black uppercase tracking-wider disabled:opacity-40" style={{ background: "#3BF5A0", color: "#0B1322" }} disabled={!onApprove || !tl.segments.length || !!blockers?.length} onClick={() => onApprove?.(stitch)} title="Approve this cut. NOTHING publishes until you do, and re-cutting later is always possible — the stitch is a recipe over originals that never change.">Approve this cut</button>
          <button className="rounded px-2.5 py-1 text-[10px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
