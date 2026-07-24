// PIPELINE TEST (Lee) — a left-drawer probe of the Supabase → Auphonic → Mux
// pipeline for ONE video file. Pick a file → it stages in DURABLE Supabase Storage
// → Auphonic reads that permanent URL (loudness) → ingests into a final Mux asset
// → previews RAW (straight from Supabase) vs PROCESSED (Mux) so you can hear/see
// whether the pipeline is working. Stateless: the client holds the cursor and
// polls the server fns; no DB rows are written.
import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { CheckCircle2, Film, Loader2, Upload, XCircle } from "lucide-react";

import {
  createPipelineTestStagingUpload,
  startPipelineTestAuphonic,
  resolvePipelineTestAuphonic,
} from "@/lib/publish.functions";
import { supabase } from "@/integrations/supabase/client";
import { NEON } from "./theme";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Explicit result type breaks a self-referential inference cycle (the poll feeds
// the prior asset id back into the next call).
type AuphRes = Awaited<ReturnType<typeof resolvePipelineTestAuphonic>>;

type Phase = "idle" | "uploading" | "auphonic" | "encoding" | "ready" | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready",
  uploading: "Staging in Supabase",
  auphonic: "Auphonic processing",
  encoding: "Encoding the final Mux asset",
  ready: "Done",
  error: "Failed",
};

/** Minimal Mux HLS player (public playback id) — hls.js, Safari native fallback. */
function HlsVideo({ playbackId }: { playbackId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const url = `https://stream.mux.com/${playbackId}.m3u8`;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    void (async () => {
      if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = url; return; }
      const { default: Hls } = await import("hls.js");
      if (cancelled || !ref.current) return;
      if (Hls.isSupported()) { const h = new Hls(); h.loadSource(url); h.attachMedia(ref.current); hls = h; }
      else { ref.current.src = url; }
    })();
    return () => { cancelled = true; hls?.destroy(); };
  }, [playbackId]);
  return (
    <video
      ref={ref}
      controls
      playsInline
      poster={`https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`}
      style={{ width: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }}
    />
  );
}

export function PipelineTestPanel({ cramMode, activeLessonId }: { cramMode?: boolean; activeLessonId?: string | null } = {}) {
  const rf = useReactFlow();
  // In CRAM MODE the pipeline is per-LESSON: the finished Mux video attaches to the
  // active lesson and flips its status to PUBLISHED (whole-take cram videos, one
  // file per lesson). Otherwise it's the standalone raw-vs-processed probe.
  const lessonNode = cramMode && activeLessonId ? rf.getNode(activeLessonId) : null;
  const lessonLabel = (lessonNode?.data as { topic?: string; label?: string } | undefined);
  const lessonName = (lessonLabel?.topic || lessonLabel?.label || "the active lesson");
  const lessonVideo = (lessonNode?.data as { muxPlaybackId?: string | null } | undefined)?.muxPlaybackId ?? null;
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState<string>("");
  const [log, setLog] = useState<string[]>([]);
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [finalPb, setFinalPb] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false); // guard against double-run

  const running = phase !== "idle" && phase !== "ready" && phase !== "error";
  const addLog = (line: string) => setLog((prev) => (prev[prev.length - 1] === line ? prev : [...prev, line]));
  const stamp = () => new Date().toLocaleTimeString();

  const run = async (file: File) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLog([]); setRawUrl(null); setFinalPb(null); setNote(""); setFileName(file.name);
    const t0 = Date.now();
    try {
      // 1) STAGE the raw file in durable Supabase Storage — Auphonic reads THIS
      //    permanent URL (no expiring Mux master). Client PUTs straight to Storage.
      setPhase("uploading"); addLog(`${stamp()} · opening Supabase upload…`);
      const ext = file.name.includes(".") ? file.name.split(".").pop()! : "mp4";
      const { path, token, publicUrl } = await createPipelineTestStagingUpload({ data: { ext } });
      addLog(`${stamp()} · uploading ${(file.size / 1e6).toFixed(1)} MB to Supabase…`);
      const { error: upErr } = await supabase.storage.from("canvas-media").uploadToSignedUrl(path, token, file, { contentType: file.type || "video/mp4" });
      if (upErr) throw new Error(`Supabase upload failed: ${upErr.message}`);
      setRawUrl(publicUrl); addLog(`${stamp()} · raw file staged in Supabase`);

      // 2) start Auphonic from the durable Supabase URL
      setPhase("auphonic"); addLog(`${stamp()} · starting Auphonic…`);
      const { auphonicUuid } = await startPipelineTestAuphonic({ data: { fileUrl: publicUrl } });

      // 3) Auphonic done → ingest → final Mux asset → public playback id (PROCESSED)
      let muxAssetId: string | null = null;
      let final: string | null = null;
      for (let i = 0; i < 240 && !final; i++) {
        const r: AuphRes = await resolvePipelineTestAuphonic({ data: { auphonicUuid, muxAssetId } });
        muxAssetId = r.muxAssetId;
        if (r.stage === "errored") throw new Error(r.error ?? "Pipeline errored");
        if (r.stage === "auphonic") { setPhase("auphonic"); addLog(`${stamp()} · Auphonic: ${r.auphonicStatus ?? "processing"}…`); }
        else if (r.stage === "ingesting" || r.stage === "encoding") { setPhase("encoding"); addLog(`${stamp()} · encoding final Mux asset…`); }
        else if (r.stage === "ready") { final = r.playbackId; break; }
        await sleep(5000);
      }
      if (!final) throw new Error("Timed out waiting for the final Mux asset.");
      setFinalPb(final); setPhase("ready");
      // CRAM MODE (item 3) — attach the finished video to the active lesson and flip
      // its status to PUBLISHED (whole-take cram video, one per lesson).
      if (cramMode && activeLessonId) {
        rf.updateNodeData(activeLessonId, { muxAssetId, muxPlaybackId: final, status: "PUBLISHED" });
        addLog(`${stamp()} · attached to "${lessonName}" → PUBLISHED`);
      }
      addLog(`${stamp()} · ✓ done in ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPhase("error"); setNote(msg); addLog(`${stamp()} · ✗ ${msg}`);
    } finally {
      runningRef.current = false;
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (f) void run(f);
  };

  const StatusIcon = phase === "ready" ? CheckCircle2 : phase === "error" ? XCircle : running ? Loader2 : Film;

  return (
    <div className="flex flex-col gap-2 p-1 text-[11px]" style={{ color: NEON.text }}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>
        <Film className="h-3 w-3" /> {cramMode ? "Lesson video" : "Pipeline test"}
      </div>
      <div className="text-[9.5px] leading-snug" style={{ color: NEON.muted }}>
        {cramMode
          ? <>One whole-take file → Supabase → Auphonic → Mux → attaches to <b style={{ color: NEON.text }}>{lessonName}</b> and flips it to PUBLISHED. Runs on the deployed env.</>
          : <>Stages one file in Supabase → Auphonic (loudness) → Mux, then previews raw vs processed. Runs on the deployed env (needs the Supabase + Mux + Auphonic keys).</>}
      </div>
      {cramMode && !activeLessonId && <div className="rounded px-2 py-1 text-[9.5px]" style={{ color: "#FF8B9E", border: "1px solid rgba(255,92,108,0.4)" }}>No active lesson — click a lesson in the Outline first.</div>}
      {cramMode && lessonVideo && !finalPb && (
        <div className="flex flex-col gap-1">
          <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "#3BF5A0" }}>Current lesson video (published)</div>
          <HlsVideo playbackId={lessonVideo} />
        </div>
      )}

      {/* PICK + RUN */}
      <input ref={inputRef} type="file" accept="video/*,.mkv" className="hidden" onChange={onPick} disabled={running} />
      <button
        className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] font-bold uppercase tracking-wide disabled:opacity-50"
        style={{ color: running ? NEON.muted : "#0B0F1E", background: running ? "transparent" : NEON.cyan, border: `1px solid ${running ? NEON.borderSoft : NEON.cyan}` }}
        onClick={() => inputRef.current?.click()}
        disabled={running || (cramMode && !activeLessonId)}
      >
        <Upload className="h-3.5 w-3.5" /> {running ? "Running…" : cramMode ? "Pick the lesson video" : "Pick a video to test"}
      </button>
      {fileName && <div className="truncate text-[9.5px]" style={{ color: NEON.muted }} title={fileName}>{fileName}</div>}

      {/* STATUS */}
      {phase !== "idle" && (
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10.5px] font-semibold"
          style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${phase === "error" ? "rgba(255,92,108,0.5)" : phase === "ready" ? "rgba(59,245,160,0.5)" : NEON.borderSoft}`, color: phase === "error" ? "#FF8B9E" : phase === "ready" ? "#3BF5A0" : NEON.text }}>
          <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${running ? "animate-spin" : ""}`} />
          {PHASE_LABEL[phase]}
        </div>
      )}
      {note && <div className="rounded-md px-2 py-1 text-[9.5px] leading-snug" style={{ color: "#FF8B9E", border: "1px solid rgba(255,92,108,0.4)" }}>{note}</div>}

      {/* PREVIEWS */}
      {rawUrl && (
        <div className="flex flex-col gap-1">
          <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Raw (staged in Supabase)</div>
          <video controls playsInline src={rawUrl} style={{ width: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }} />
          <div className="text-[8.5px] leading-snug" style={{ color: NEON.muted }}>Plays straight from Supabase — some source codecs (e.g. .mkv) may not preview in-browser; the pipeline still runs.</div>
        </div>
      )}
      {finalPb && (
        <div className="flex flex-col gap-1">
          <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "#3BF5A0" }}>Processed (Auphonic → Mux)</div>
          <HlsVideo playbackId={finalPb} />
        </div>
      )}

      {/* LOG */}
      {log.length > 0 && (
        <div className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-md p-1.5 font-mono text-[9px] leading-relaxed" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }}>
          {log.map((l, i) => <div key={i} className="truncate" title={l}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
