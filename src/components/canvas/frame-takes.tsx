// FRAME TAKES (Phase 2) — the client half of the take board. One provider owns
// the scene's takes: drop an OBS clip on a frame (or a take-board row) → Mux
// direct upload (passthrough-named) → status flips to FILMED → the processed
// clip plays back inline so Lee can review, match the energy, and roll the next
// frame. Multiple takes per frame: latest is the default, one can be KEEPER.
//
// FAIL LOUD: missing MUX_TOKEN_ID/MUX_TOKEN_SECRET or the frame_takes table
// surfaces as a banner string (muxError) the route renders — never silent.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { Check, Loader2, RefreshCw, Scissors, Star, Upload, Video, X } from "lucide-react";

import { createFrameTakeUpload, listFrameTakes, resolveFrameTake, setTakeKeeper, setTakeTrim, type FrameTakeRow } from "@/lib/canvas.functions";
import { bus, patchDataCmd, type RfLike } from "./commands";
import { computeTrim, isPublishable, trimLabel, WARNING_TEXT } from "./intro-trim";
import { takePassthrough } from "./take-naming";
import { NEON } from "./theme";
import type { FilmStatus } from "./types";

// ---- browser audio analysis (onset + duration) — no server bytes, no ffmpeg ---
/** Reliable media duration via a throwaway <video> element. */
function mediaDuration(file: File): Promise<number> {
  return new Promise((res) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(v.src); res(Number.isFinite(d) ? d : 0); };
    v.onerror = () => { URL.revokeObjectURL(v.src); res(0); };
    v.src = URL.createObjectURL(file);
  });
}
/** First audio onset (seconds), sustained ~30ms above a threshold, or null if the
 *  file is silent / fades in / can't be decoded. Best-effort (Web Audio). */
async function detectOnset(file: File, threshold = 0.02): Promise<number | null> {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = audio.getChannelData(0);
    const sr = audio.sampleRate;
    const need = Math.max(1, Math.floor(sr * 0.03));
    let cnt = 0, onset: number | null = null;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold) { if (++cnt >= need) { onset = Math.max(0, (i - need) / sr); break; } }
      else cnt = 0;
    }
    await ctx.close();
    return onset;
  } catch { return null; }
}

// ---- status chrome -----------------------------------------------------------
export const FILM_STATUS_META: Record<FilmStatus, { label: string; color: string; bg: string }> = {
  unfilmed: { label: "unfilmed", color: "#9AA6B8", bg: "rgba(147,160,180,0.14)" },
  filmed: { label: "filmed", color: "#7EF3C0", bg: "rgba(59,245,160,0.14)" },
  retake: { label: "retake", color: "#FCA311", bg: "rgba(252,163,17,0.16)" },
};
const STATUS_CYCLE: FilmStatus[] = ["unfilmed", "filmed", "retake"];

// ---- provider ------------------------------------------------------------------
interface UploadingState { frameId: string; pct: "uploading" | "processing" }

interface FrameTakesApi {
  takesFor: (frameId: string) => FrameTakeRow[];
  upload: (frameId: string, file: File) => Promise<void>;
  markKeeper: (take: FrameTakeRow) => Promise<void>;
  cycleStatus: (frameId: string) => void;
  uploading: UploadingState[];
  muxError: string | null;
  clearMuxError: () => void;
  refresh: () => Promise<void>;
  /** INTRO AUTO-TRIM: the configured intro clip length (seconds). */
  introClipLength: number;
  /** Re-derive a take's trim from the current clip length (keeps the onset). */
  retrimTake: (take: FrameTakeRow) => Promise<void>;
  /** Revert a take to the raw (clears the trim window). */
  revertTake: (take: FrameTakeRow) => Promise<void>;
  /** Re-trim every intro-frame take from its raw (config-length change). */
  retrimAllIntros: () => Promise<void>;
}

const FrameTakesContext = createContext<FrameTakesApi>({
  takesFor: () => [],
  upload: async () => {},
  markKeeper: async () => {},
  cycleStatus: () => {},
  uploading: [],
  muxError: null,
  clearMuxError: () => {},
  refresh: async () => {},
  introClipLength: 6,
  retrimTake: async () => {},
  revertTake: async () => {},
  retrimAllIntros: async () => {},
});
export const useFrameTakes = () => useContext(FrameTakesContext);

export function FrameTakesProvider({ courseName, introClipLength = 6, autoTrimIntros = true, children }: { courseName: string | null; introClipLength?: number; autoTrimIntros?: boolean; children: React.ReactNode }) {
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const [takes, setTakes] = useState<Map<string, FrameTakeRow[]>>(new Map());
  const [uploading, setUploading] = useState<UploadingState[]>([]);
  const [muxError, setMuxError] = useState<string | null>(null);
  const pollTimers = useRef<Map<string, number>>(new Map());

  const refresh = useCallback(async () => {
    const frameIds = rf.getNodes().filter((n) => n.type === "frame").map((n) => n.id);
    if (frameIds.length === 0) { setTakes(new Map()); return; }
    try {
      const rows = await listFrameTakes({ data: { frameIds } });
      const m = new Map<string, FrameTakeRow[]>();
      for (const r of rows) m.set(r.frame_id, [...(m.get(r.frame_id) ?? []), r]);
      setTakes(m);
    } catch (e) {
      // table missing → loud banner; anything transient shows too (author-only surface)
      setMuxError(e instanceof Error ? e.message : String(e));
    }
  }, [rf]);

  // initial sweep (after the scene mounts its nodes)
  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), 900);
    return () => window.clearTimeout(t);
  }, [refresh]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- clear timers on unmount only
  useEffect(() => () => { for (const t of pollTimers.current.values()) window.clearTimeout(t); }, []);

  const setFrameStatus = useCallback((frameId: string, status: FilmStatus) => {
    const c = patchDataCmd(rfl, frameId, { filmStatus: status }, "film status");
    if (c) bus.dispatch(c);
  }, [rfl]);

  /** Poll a take until ready/errored (4s cadence, ~5 min cap). */
  const pollTake = useCallback((takeId: string, attempt = 0) => {
    const run = async () => {
      try {
        const row = await resolveFrameTake({ data: { takeId } });
        setTakes((prev) => {
          const m = new Map(prev);
          const arr = (m.get(row.frame_id) ?? []).filter((t) => t.id !== row.id);
          m.set(row.frame_id, [row, ...arr].sort((a, b) => b.take_n - a.take_n));
          return m;
        });
        if (row.status === "ready" || row.status === "errored" || attempt > 75) {
          setUploading((u) => u.filter((x) => x.frameId !== row.frame_id));
          pollTimers.current.delete(takeId);
          return;
        }
      } catch (e) {
        setMuxError(e instanceof Error ? e.message : String(e));
        pollTimers.current.delete(takeId);
        return;
      }
      pollTimers.current.set(takeId, window.setTimeout(() => pollTake(takeId, attempt + 1), 4000));
    };
    void run();
  }, []);

  /** Merge a fresh take row into state (e.g. after a trim write). */
  const mergeRow = useCallback((row: FrameTakeRow) => {
    setTakes((prev) => {
      const m = new Map(prev);
      m.set(row.frame_id, (m.get(row.frame_id) ?? []).map((t) => (t.id === row.id ? row : t)));
      return m;
    });
  }, []);

  /** Detect the onset + duration, compute the trim window, persist it. */
  const deriveTrim = useCallback(async (takeId: string, frameId: string, file: File) => {
    const duration = await mediaDuration(file);
    const onset = await detectOnset(file);
    const { trimStart, trimmedDuration, warning } = computeTrim(onset, duration, introClipLength);
    const row = await setTakeTrim({ data: { takeId, onset_s: onset ?? trimStart, raw_duration_s: duration, trimmed_duration_s: trimmedDuration, trim_warning: warning } });
    mergeRow(row);
  }, [introClipLength, mergeRow]);

  const upload = useCallback(async (frameId: string, file: File) => {
    const node = rf.getNode(frameId);
    if (!node) return;
    const d = node.data as { beat?: string; subIndex?: number; introTake?: boolean };
    // lesson label from the frame's parent; course from the SURVIVE tree is not
    // needed — the scene name carries it; keep the stem deterministic from labels.
    const lesson = node.parentId ? (rf.getNode(node.parentId)?.data as { label?: string } | undefined)?.label ?? null : null;
    const passthrough = takePassthrough(courseName, lesson, d.beat ?? "frame", d.subIndex ?? 0);
    setMuxError(null);
    setUploading((u) => [...u.filter((x) => x.frameId !== frameId), { frameId, pct: "uploading" }]);
    try {
      const { uploadUrl, takeId } = await createFrameTakeUpload({ data: { frameId, passthrough } });
      // AUTO-TRIM INTRO TAKES: on an intro-flagged frame, analyse the audio (in the
      // browser — the file is right here) and store a non-destructive trim window.
      const trimP = d.introTake && autoTrimIntros ? deriveTrim(takeId, frameId, file).catch(() => {}) : null;
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) throw new Error(`Mux upload PUT failed (${put.status})`);
      // upload landed → the frame is FILMED (retake/unfilmed are manual flips)
      setFrameStatus(frameId, "filmed");
      setUploading((u) => u.map((x) => (x.frameId === frameId ? { ...x, pct: "processing" } : x)));
      pollTake(takeId);
      void trimP;
    } catch (e) {
      setUploading((u) => u.filter((x) => x.frameId !== frameId));
      setMuxError(e instanceof Error ? e.message : String(e));
    }
  }, [rf, pollTake, setFrameStatus, courseName, autoTrimIntros, deriveTrim]);

  /** Re-derive a take's trim from the CURRENT clip length (keeps the onset). */
  const retrimTake = useCallback(async (take: FrameTakeRow) => {
    if (take.raw_duration_s == null) return; // never analysed / no data
    const { trimStart, trimmedDuration, warning } = computeTrim(take.onset_s ?? null, take.raw_duration_s, introClipLength);
    try { mergeRow(await setTakeTrim({ data: { takeId: take.id, onset_s: take.onset_s ?? trimStart, raw_duration_s: take.raw_duration_s, trimmed_duration_s: trimmedDuration, trim_warning: warning } })); }
    catch (e) { setMuxError(e instanceof Error ? e.message : String(e)); }
  }, [introClipLength, mergeRow]);

  /** Clear a take's trim → PUBLISH uses the raw take. */
  const revertTake = useCallback(async (take: FrameTakeRow) => {
    try { mergeRow(await setTakeTrim({ data: { takeId: take.id, onset_s: null, raw_duration_s: null, trimmed_duration_s: null, trim_warning: null } })); }
    catch (e) { setMuxError(e instanceof Error ? e.message : String(e)); }
  }, [mergeRow]);

  /** Batch: re-derive every intro-frame take from raw (after a clip-length change). */
  const retrimAllIntros = useCallback(async () => {
    const introFrames = new Set(rf.getNodes().filter((n) => n.type === "frame" && (n.data as { introTake?: boolean }).introTake).map((n) => n.id));
    const targets: FrameTakeRow[] = [];
    for (const [fid, rows] of takes) if (introFrames.has(fid)) for (const r of rows) if (r.raw_duration_s != null) targets.push(r);
    for (const t of targets) await retrimTake(t);
  }, [rf, takes, retrimTake]);

  const markKeeper = useCallback(async (take: FrameTakeRow) => {
    try {
      await setTakeKeeper({ data: { takeId: take.id, keeper: !take.keeper } });
      setTakes((prev) => {
        const m = new Map(prev);
        m.set(take.frame_id, (m.get(take.frame_id) ?? []).map((t) => ({ ...t, keeper: t.id === take.id ? !take.keeper : false })));
        return m;
      });
    } catch (e) {
      setMuxError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const cycleStatus = useCallback((frameId: string) => {
    const cur = ((rf.getNode(frameId)?.data as { filmStatus?: FilmStatus } | undefined)?.filmStatus ?? "unfilmed") as FilmStatus;
    setFrameStatus(frameId, STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length]);
  }, [rf, setFrameStatus]);

  return (
    <FrameTakesContext.Provider
      value={{
        takesFor: (id) => takes.get(id) ?? [],
        upload,
        markKeeper,
        cycleStatus,
        uploading,
        muxError,
        clearMuxError: () => setMuxError(null),
        refresh,
        introClipLength,
        retrimTake,
        revertTake,
        retrimAllIntros,
      }}
    >
      {children}
    </FrameTakesContext.Provider>
  );
}

// ---- UI pieces -----------------------------------------------------------------

/** Status chip — click cycles unfilmed → filmed → retake. Authoring chrome. */
export function FilmStatusChip({ frameId, status, small }: { frameId: string; status: FilmStatus; small?: boolean }) {
  const { cycleStatus, uploading } = useFrameTakes();
  const busy = uploading.find((u) => u.frameId === frameId);
  const meta = FILM_STATUS_META[status];
  return (
    <button
      className={`nodrag inline-flex shrink-0 items-center gap-1 rounded font-bold uppercase tracking-wide ${small ? "px-1 text-[8px]" : "px-1.5 py-0.5 text-[9px]"}`}
      style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.color}55` }}
      title={busy ? (busy.pct === "uploading" ? "Uploading to Mux…" : "Mux is processing…") : "Film status — click to cycle unfilmed → filmed → retake"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); cycleStatus(frameId); }}
    >
      {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
      {busy ? busy.pct : meta.label}
    </button>
  );
}

/** Minimal HLS player for a PUBLIC playback id (paused poster, click to play). */
export function TakeVideo({ playbackId, height = 120 }: { playbackId: string; height?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<import("hls.js").default | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let cancelled = false;
    const url = `https://stream.mux.com/${playbackId}.m3u8`;
    (async () => {
      const { default: Hls } = await import("hls.js");
      if (cancelled || !ref.current) return;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(ref.current);
      } else {
        ref.current.src = url; // Safari native HLS
      }
    })();
    return () => { cancelled = true; hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [playbackId]);
  return (
    <video
      ref={ref}
      controls
      playsInline
      preload="metadata"
      poster={`https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`}
      className="w-full rounded"
      style={{ height, objectFit: "contain", background: "#000" }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** The frame's takes panel — latest take plays; prior takes listed w/ KEEPER. */
export function TakesPanel({ frameId, onClose }: { frameId: string; onClose: () => void }) {
  const { takesFor, markKeeper, refresh, retrimTake, revertTake, introClipLength } = useFrameTakes();
  const takes = takesFor(frameId);
  const playable = takes.filter((t) => t.mux_playback_id && t.status === "ready");
  const keeper = playable.find((t) => t.keeper);
  const [selected, setSelected] = useState<string | null>(null);
  const current = playable.find((t) => t.id === selected) ?? keeper ?? playable[0];
  return (
    <div
      className="nodrag nowheel absolute left-2 top-9 z-[7] w-64 rounded-lg p-2 text-[11px]"
      style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, color: NEON.text, boxShadow: "0 12px 30px -12px rgba(0,0,0,0.7)" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-1">
        <Video className="h-3 w-3" style={{ color: NEON.yellow }} />
        <span className="font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Takes</span>
        <span style={{ color: NEON.muted }}>({takes.length})</span>
        <span className="flex-1" />
        <button className="grid h-4 w-4 place-items-center" title="Refresh" onClick={() => void refresh()} style={{ color: NEON.muted }}><RefreshCw className="h-2.5 w-2.5" /></button>
        <button className="grid h-4 w-4 place-items-center" title="Close" onClick={onClose} style={{ color: NEON.muted }}><X className="h-3 w-3" /></button>
      </div>
      {current ? <TakeVideo playbackId={current.mux_playback_id!} /> : (
        <p className="py-2 text-center" style={{ color: NEON.muted }}>
          {takes.length ? "Processing — playback appears when Mux finishes." : "No takes yet — drop an OBS clip on the frame."}
        </p>
      )}
      {takes.length > 0 && (
        <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-auto">
          {takes.map((t) => {
            const trimmed = t.trimmed_duration_s != null && t.raw_duration_s != null;
            return (
            <li key={t.id} className="rounded px-1 py-0.5" style={{ background: current?.id === t.id ? "rgba(252,163,17,0.1)" : "transparent" }}>
              <div className="flex items-center gap-1">
                <button
                  className="min-w-0 flex-1 truncate text-left"
                  style={{ color: t.status === "ready" ? NEON.text : NEON.muted }}
                  title={t.passthrough ?? undefined}
                  onClick={() => setSelected(t.id)}
                >
                  take {t.take_n} · {t.status}{t.keeper ? " · keeper" : ""}
                </button>
                {t.status === "ready" && (
                  <button
                    className="grid h-4 w-4 shrink-0 place-items-center"
                    title={t.keeper ? "Unmark keeper" : "Mark KEEPER (the take that ships)"}
                    style={{ color: t.keeper ? NEON.yellow : NEON.muted }}
                    onClick={() => void markKeeper(t)}
                  >
                    <Star className="h-3 w-3" fill={t.keeper ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
              {/* INTRO AUTO-TRIM: raw → trimmed + warnings + revert / re-trim */}
              {trimmed && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-1 text-[9px]">
                  <Scissors className="h-2.5 w-2.5" style={{ color: NEON.cyan }} />
                  <span style={{ color: NEON.muted }}>{trimLabel(t.raw_duration_s!, t.trimmed_duration_s!)}</span>
                  {t.trim_warning && (
                    <span className="rounded px-1 font-bold" style={{ color: t.trim_warning === "too_short" ? NEON.red : NEON.yellow, border: `1px solid ${t.trim_warning === "too_short" ? NEON.red : NEON.yellow}66` }}>
                      {WARNING_TEXT[t.trim_warning]}
                    </span>
                  )}
                  <button className="underline" style={{ color: NEON.cyan }} title={`Re-trim to the current ${introClipLength}s clip length`} onClick={() => void retrimTake(t)}>re-trim</button>
                  <button className="underline" style={{ color: NEON.muted }} title="Revert to the raw take (publish uses the full clip)" onClick={() => void revertTake(t)}>revert</button>
                </div>
              )}
            </li>
          ); })}
        </ul>
      )}
    </div>
  );
}

/** Take-board cell for the Script editor rows: intro flag + chip + takes + upload. */
export function TakeBoardCell({ frameId, status }: { frameId: string; status: FilmStatus }) {
  const { takesFor, upload } = useFrameTakes();
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const fileRef = useRef<HTMLInputElement>(null);
  const n = takesFor(frameId).length;
  const isIntro = !!(rf.getNode(frameId)?.data as { introTake?: boolean } | undefined)?.introTake;
  const toggleIntro = () => { const c = patchDataCmd(rfl, frameId, { introTake: !isIntro }, "intro flag"); if (c) bus.dispatch(c); };
  return (
    <span
      className="flex shrink-0 items-center gap-1"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("video/") || /\.(mp4|mov|mkv|webm)$/i.test(x.name)); if (f) void upload(frameId, f); }}
    >
      {/* INTRO flag — this frame's keeper is the lesson's intro (never body-processed) */}
      <button
        className="grid h-5 w-5 place-items-center rounded text-[8px] font-black"
        title={isIntro ? "Intro take — Auphonic loudness-matches it without reprocessing (click to unset)" : "Mark this frame's keeper as the lesson INTRO"}
        style={{ color: isIntro ? "#0B1322" : NEON.muted, background: isIntro ? NEON.yellow : "transparent", border: `1px solid ${isIntro ? NEON.yellow : NEON.borderSoft}` }}
        onClick={() => toggleIntro()}
      >
        IN
      </button>
      {n > 0 && <span className="text-[9px] tabular-nums" style={{ color: NEON.muted }}>{n} take{n === 1 ? "" : "s"}</span>}
      <FilmStatusChip frameId={frameId} status={status} small />
      <button
        className="grid h-5 w-5 place-items-center rounded"
        style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }}
        title="Upload an OBS clip for this frame (or drop a file here)"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-3 w-3" />
      </button>
      <input ref={fileRef} type="file" accept="video/*,.mkv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(frameId, f); e.target.value = ""; }} />
    </span>
  );
}

/** "Re-trim all intros" — re-derives every intro take from raw at the current
 *  clip length (for the settings popover; must live under the provider). */
export function RetrimAllIntrosButton() {
  const { retrimAllIntros } = useFrameTakes();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded px-1.5 py-1 text-[9.5px] font-semibold"
      style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }}
      title="Re-derive every intro take's trim from the raw clip at the current length"
      onClick={async () => { setBusy(true); try { await retrimAllIntros(); } finally { setBusy(false); } }}
      disabled={busy}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scissors className="h-3 w-3" />} re-trim all intros
    </button>
  );
}

/** Loud banner for missing Mux env vars / missing table. */
export function MuxBanner() {
  const { muxError, clearMuxError } = useFrameTakes();
  if (!muxError) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[80] flex items-center gap-2 px-4 py-2 text-[12px] font-semibold" style={{ background: "#7A1020", color: "#FFE9EC", borderBottom: "1px solid #FF8B9E" }}>
      <X className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">TAKE BOARD: {muxError}</span>
      <button className="rounded px-2 py-0.5" style={{ border: "1px solid #FF8B9E" }} onClick={clearMuxError}>dismiss</button>
    </div>
  );
}

/** Drop-target overlay state helper for FrameNode: true while files drag over. */
export function useFileDrop(onFile: (f: File) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setOver(true); }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("video/") || /\.(mp4|mov|mkv|webm)$/i.test(x.name));
        if (f) { e.preventDefault(); e.stopPropagation(); onFile(f); }
      },
    },
  };
}

// keep an unused-import guard honest
export const _takeIcons = { Check };
