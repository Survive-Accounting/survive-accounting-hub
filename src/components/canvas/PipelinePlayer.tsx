// PIPELINE PLAYER (P1) — the inline cut preview at the top of the Pipeline
// view's center column. A NEW ROOM ON THE SAME PIPES: it plays the SAME
// set-scope stitch recipe through the SAME P0-fixed cut sequencer that
// StitchPreview uses — no second playback engine, no second data model.
//
// HONESTY CARRIED OVER from StitchPreview: this previews the EDIT (order,
// trims, gaps) by sequencing the original clips in one <video>. Loudness and
// crossfades happen in ffmpeg on the worker — the TRUE RENDER button is the
// exact-check for that, and it is the EXISTING per-CEQ render path, not a new
// one.
import { useEffect, useRef, useState } from "react";
import { Film, Loader2, Play, Square } from "lucide-react";

import { fmtDur } from "./ceq-takes";
import { previewTimeline } from "./stitch-preview";
import type { StitchDef } from "./stitch-defs";
import { NEON } from "./theme";
import type { TakeRef } from "./types";
import { useCutPlayer } from "./use-cut-player";

type Mode = "ceq" | "all";

export function PipelinePlayer({ stitch, takes, currentCeqId, currentLabel, ceqOfPath, hidden, onTrueRender, renderPhase, renderBusy }: {
  /** The DERIVED set cut (saved recipe + auto-joined new clips). Read-only here. */
  stitch: StitchDef | null;
  takes: Map<string, TakeRef>;
  currentCeqId: string | null;
  /** Spine label for the open frame ("Q4") — names the scoped play button. */
  currentLabel?: string;
  /** takePath → frame id, so "this CEQ" scoping works even on saved recipes
   *  whose items predate per-item ceqId stamping. */
  ceqOfPath: Map<string, string>;
  /** Recording Mode owns the screen — film-safe hides the pixels, and a hidden
   *  video must also go SILENT, so this stops playback too. */
  hidden?: boolean;
  onTrueRender?: () => void;
  renderPhase?: string | null;
  renderBusy?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem("sa-pipeline-mode") === "all" ? "all" : "ceq"));
  const tl = stitch ? previewTimeline(stitch, takes) : null;
  const scoped = (tl?.segments ?? []).filter((s) => mode === "all" || !currentCeqId || (s.ceqId ?? ceqOfPath.get(s.takePath)) === currentCeqId);
  // Trailing gap is dropped in scoped mode — "play this CEQ" should end when
  // the CEQ does, not after the set's inter-clip silence.
  const segs = scoped.map((s, i) => ({ inS: s.inS, outS: s.outS, gapAfterMs: i === scoped.length - 1 ? 0 : s.gapAfterMs, url: s.url, name: s.name }));
  // NEW KEPT CLIPS JOIN AUTOMATICALLY: the derived stitch recomputes upstream,
  // this key changes, and the player resets to the fresh cut instead of playing
  // a stale one.
  const resetKey = mode + "|" + (mode === "ceq" ? currentCeqId : "") + "|" + segs.map((s) => `${s.url}@${s.inS}-${s.outS}+${s.gapAfterMs}`).join(",");
  const player = useCutPlayer(segs, resetKey);
  const stopRef = useRef(player.stop);
  stopRef.current = player.stop;
  // Gate on `hidden` ALONE — player.stop is a fresh function every render, and
  // depending on it would stop playback on every re-render.
  useEffect(() => { if (hidden) stopRef.current(); }, [hidden]);

  // Mode-switch-then-play must wait for the re-render — playFrom on the same
  // tick would run against the OLD scope's segments.
  const pendingRef = useRef(false);
  useEffect(() => { if (pendingRef.current) { pendingRef.current = false; player.playFrom(0); } });
  const play = (m: Mode) => {
    if (m !== mode) { pendingRef.current = true; setMode(m); localStorage.setItem("sa-pipeline-mode", m); return; }
    player.playFrom(0);
  };

  const runtime = segs.reduce((a, s) => a + (s.outS - s.inS) + s.gapAfterMs / 1000, 0);
  const at = player.state.at;
  return (
    <div className="mb-2 shrink-0 rounded" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}` }}>
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: NEON.yellow }} title="Plays the cut recipe by sequencing the original clips — trims, order and gaps are exact; loudness and crossfades happen on the worker (TRUE RENDER checks those).">Cut preview</span>
        {player.state.playing
          ? <span className="text-[8px] tabular-nums" style={{ color: "#3BF5A0" }}>clip {at + 1}/{segs.length}{player.state.inGap ? " · gap" : ""}</span>
          : <span className="text-[8px] tabular-nums" style={{ color: NEON.muted }}>{segs.length} clip{segs.length === 1 ? "" : "s"} · ~{fmtDur(runtime)}</span>}
        {(tl?.missing.length ?? 0) > 0 && <span className="text-[8px] font-bold" style={{ color: "#FF8B9E" }} title={tl?.missing.join("\n")}>{tl?.missing.length} missing</span>}
      </div>
      <video {...player.videoProps} playsInline preload="metadata" className="w-full" style={{ background: "#000", aspectRatio: "16 / 9", maxHeight: 200 }} />
      {player.state.skipped.length > 0 && (
        <div className="px-1.5 py-1 text-[8.5px]" style={{ color: "#FFB020" }}>
          {player.state.skipped.length} clip{player.state.skipped.length === 1 ? "" : "s"} SKIPPED — {player.state.skipped.map((k) => `${k.name} (${k.reason})`).join(", ")}. The cut kept going.
        </div>
      )}
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[8.5px] font-black uppercase" style={{ color: mode === "ceq" ? "#0B1322" : NEON.cyan, background: mode === "ceq" ? NEON.cyan : "transparent", border: `1px solid ${NEON.borderSoft}` }} disabled={!currentCeqId} onClick={() => play("ceq")} title="Play only the open frame's clips, in stitch order"><Play className="h-2.5 w-2.5" /> {currentLabel ?? "this CEQ"}</button>
        <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[8.5px] font-black uppercase" style={{ color: mode === "all" ? "#0B1322" : NEON.cyan, background: mode === "all" ? NEON.cyan : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => play("all")} title="Play the whole set's cut — intro, every CEQ's clips, wrap, outro"><Play className="h-2.5 w-2.5" /> all</button>
        {player.state.playing && <button className="rounded px-1.5 py-0.5" style={{ color: "#FF8B9E", border: `1px solid ${NEON.borderSoft}` }} onClick={() => player.stop()} title="Stop"><Square className="h-2.5 w-2.5" /></button>}
        {onTrueRender && (
          <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase disabled:opacity-50" style={{ color: "#3BF5A0", border: "1px solid rgba(59,245,160,0.5)" }} disabled={!!renderBusy || !currentCeqId} onClick={onTrueRender} title="TRUE RENDER — the exact ffmpeg pipeline (concat, loudness, crossfades) for the open frame's clips. The one check the inline preview honestly can't make.">
            {renderBusy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Film className="h-2.5 w-2.5" />} true render
          </button>
        )}
      </div>
      {renderPhase && <div className="px-1.5 pb-1 text-[8px]" style={{ color: renderPhase.startsWith("FAILED") ? "#FF8B9E" : NEON.muted }}>{renderPhase}</div>}
    </div>
  );
}
