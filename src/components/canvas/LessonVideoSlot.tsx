// LESSON VIDEO SLOT (prompt 2) — one lesson becomes one video. A slot above the
// active lesson's frames: drag-drop 1..n raw files → they stage in DURABLE Supabase
// Storage (NOT Mux) → raw preview plays them in sequence → Publish runs the staged
// pipeline (Supabase file → Auphonic → Mux ingests the PROCESSED file) → the Mux
// playback attaches to the lesson and its status flips PUBLISHED (outline green).
// Raw never touches Mux; no master_access. Runs on the deployed env (Supabase/Mux/
// Auphonic keys). MULTI-FILE concat is deferred (see report) — Publish needs one.
import { useEffect, useRef, useState } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { ArrowDown, ArrowUp, CheckCircle2, Clapperboard, Loader2, Play, Upload, X } from "lucide-react";

import { createPipelineTestStagingUpload, startPipelineTestAuphonic, resolvePipelineTestAuphonic } from "@/lib/publish.functions";
import { supabase } from "@/integrations/supabase/client";
import { NEON } from "./theme";
import type { LessonBox } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type AuphRes = Awaited<ReturnType<typeof resolvePipelineTestAuphonic>>;
type StageFile = { path: string; url: string; name: string };

/** Minimal Mux HLS player for the PUBLISHED video. */
function HlsVideo({ playbackId, style }: { playbackId: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  return <video ref={ref} controls playsInline poster={`https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`} src={`https://stream.mux.com/${playbackId}/high.mp4`} style={{ width: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9", ...style }} />;
}

export function LessonVideoSlot({ lessonId, cramMode, openSignal }: { lessonId: string; cramMode?: boolean; openSignal?: number }) {
  const rf = useReactFlow();
  const nodes = useNodes(); // reactive — staging list + status follow edits
  const node = nodes.find((n) => n.id === lessonId);
  const d = node?.data as unknown as LessonBox | undefined;
  const [open, setOpen] = useState(false);
  // OUTLINE v2 — clicking the Video node bumps openSignal to force the slot open.
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  const [busy, setBusy] = useState<false | "uploading" | "publishing">(false);
  const [note, setNote] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);

  if (!node || !d) return null;
  const files = d.videoStaging ?? [];
  const published = d.muxPlaybackId ?? null;
  const name = (d.topic || d.label || "this lesson");
  const isCeq = (d.category ?? "TEACH") === "CEQ";
  const paid = d.access === "PAID";
  const variant = isCeq ? (paid ? "Paid" : "Free") : null; // Free/Paid only meaningful for CEQ lessons
  const set = (patch: Partial<LessonBox>) => rf.updateNodeData(lessonId, patch);

  const stageFiles = async (picked: File[]) => {
    if (busy) return;
    setBusy("uploading"); setNote(null);
    const added: StageFile[] = [];
    try {
      for (const file of picked) {
        const ext = file.name.includes(".") ? file.name.split(".").pop()! : "mp4";
        const { path, token, url } = await (async () => { const r = await createPipelineTestStagingUpload({ data: { ext } }); return { path: r.path, token: r.token, url: r.publicUrl }; })();
        const { error } = await supabase.storage.from("canvas-media").uploadToSignedUrl(path, token, file, { contentType: file.type || "video/mp4" });
        if (error) throw new Error(error.message);
        added.push({ path, url, name: file.name });
      }
      set({ videoStaging: [...(files), ...added] });
      setNote(`Staged ${added.length} file${added.length === 1 ? "" : "s"} in Supabase.`);
    } catch (e) {
      setNote(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) void stageFiles(fs); };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const fs = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|mkv|webm|m4v)$/i.test(f.name)); if (fs.length) void stageFiles(fs); };

  const move = (i: number, dir: -1 | 1) => { const arr = [...files]; const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; set({ videoStaging: arr }); };
  const removeAt = (i: number) => { set({ videoStaging: files.filter((_, x) => x !== i) }); if (previewIdx >= files.length - 1) setPreviewIdx(0); };

  const publish = async () => {
    if (busy) return;
    if (files.length === 0) { setNote("Stage a raw file first."); return; }
    if (files.length > 1) { setNote("Publish needs a SINGLE file for now — multi-file concat isn't wired on this staged path (no Vercel ffmpeg; Mux concat would put raws on Mux). Keep one file, or combine externally first."); return; }
    setBusy("publishing"); setNote("Auphonic is processing (this runs on the deployed env)…");
    try {
      const { auphonicUuid } = await startPipelineTestAuphonic({ data: { fileUrl: files[0].url } });
      let muxAssetId: string | null = null;
      let final: string | null = null;
      for (let i = 0; i < 240 && !final; i++) {
        const r: AuphRes = await resolvePipelineTestAuphonic({ data: { auphonicUuid, muxAssetId } });
        muxAssetId = r.muxAssetId;
        if (r.stage === "errored") throw new Error(r.error ?? "pipeline errored");
        if (r.stage === "auphonic") setNote(`Auphonic: ${r.auphonicStatus ?? "processing"}…`);
        else if (r.stage === "ingesting" || r.stage === "encoding") setNote("Mux is ingesting the processed file…");
        else if (r.stage === "ready") { final = r.playbackId; break; }
        await sleep(5000);
      }
      if (!final) throw new Error("Timed out waiting for the final Mux asset.");
      set({ muxAssetId, muxPlaybackId: final, status: "PUBLISHED" });
      setNote("Published ✓ — the outline turns green.");
    } catch (e) {
      setNote(`Publish failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  const statusTone = published ? "#3BF5A0" : files.length ? NEON.yellow : NEON.muted;
  return (
    <div className="pointer-events-auto fixed left-1/2 top-3 z-[57] -translate-x-1/2" style={{ width: open ? (cramMode ? 420 : 380) : undefined }}>
      {/* COLLAPSED BAR */}
      <div className="flex items-center gap-2 rounded-full px-3 py-1.5 shadow-xl" style={{ background: "rgba(11,19,34,0.95)", border: `1px solid ${cramMode ? NEON.border : NEON.borderSoft}`, backdropFilter: "blur(6px)" }}>
        <Clapperboard className="h-4 w-4 shrink-0" style={{ color: statusTone }} />
        {variant && <span className="shrink-0 rounded px-1 text-[8.5px] font-bold uppercase tracking-wide" style={paid ? { color: "#FF8B9E", border: "1px solid rgba(255,92,108,0.55)" } : { color: "#3BF5A0", border: "1px solid rgba(59,245,160,0.5)" }} title={paid ? "This is the PAID CEQ video" : "This is the FREE CEQ video"}>{variant}</span>}
        <button className="min-w-0 truncate text-[11.5px] font-bold" style={{ color: NEON.text }} onClick={() => setOpen((v) => !v)} title="Open the lesson video slot">
          Lesson video{published ? " · published" : files.length ? ` · ${files.length} staged` : ""}
        </button>
        {!published && files.length === 0 && <span className="hidden text-[10px] sm:inline" style={{ color: NEON.muted }}>— this lesson becomes one video</span>}
        <button className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ color: NEON.muted }} onClick={() => setOpen((v) => !v)} title={open ? "Collapse" : "Expand"}>{open ? <X className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}</button>
      </div>

      {open && (
        <div className="mt-1.5 flex flex-col gap-2 rounded-xl p-2.5" style={{ background: "rgba(11,19,34,0.97)", border: `1px solid ${NEON.border}`, backdropFilter: "blur(8px)" }}>
          <div className="text-[9.5px] leading-snug" style={{ color: NEON.muted }}>
            One video for <b style={{ color: NEON.text }}>{name}</b>. Drop raw files → they stage in Supabase → Publish runs Auphonic → Mux. Raw never touches Mux; runs on the deployed env.
          </div>

          {/* PUBLISHED preview */}
          {published && (
            <div className="flex flex-col gap-1">
              <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "#3BF5A0" }}>Published video</div>
              <HlsVideo playbackId={published} />
            </div>
          )}

          {/* DROP TARGET / STAGED LIST */}
          <input ref={inputRef} type="file" accept="video/*,.mkv" multiple className="hidden" onChange={onPick} />
          {files.length === 0 ? (
            <button
              className="flex flex-col items-center justify-center gap-1 rounded-lg px-3 py-5 text-center"
              style={{ border: `1.5px dashed ${dragOver ? NEON.yellow : NEON.borderSoft}`, background: dragOver ? "rgba(252,163,17,0.1)" : "rgba(0,0,0,0.25)", color: NEON.muted }}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <Upload className="h-5 w-5" style={{ color: dragOver ? NEON.yellow : NEON.muted }} />
              <span className="text-[11px] font-bold" style={{ color: NEON.text }}>This lesson becomes one video</span>
              <span className="text-[9.5px]">Drop raw files here, or click to pick (1 or more)</span>
            </button>
          ) : (
            <div
              className="flex flex-col gap-1 rounded-lg p-1.5"
              style={{ border: `1px solid ${dragOver ? NEON.yellow : NEON.borderSoft}`, background: dragOver ? "rgba(252,163,17,0.08)" : "rgba(0,0,0,0.25)" }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              {files.map((f, i) => (
                <div key={f.path} className="flex items-center gap-1 text-[10.5px]">
                  <button className="grid h-4 w-4 shrink-0 place-items-center rounded" style={{ color: i === previewIdx ? NEON.yellow : NEON.muted }} onClick={() => { setPreviewIdx(i); setTimeout(() => vidRef.current?.play().catch(() => {}), 30); }} title="Preview from here"><Play className="h-3 w-3" /></button>
                  <span className="w-3 shrink-0 text-right tabular-nums" style={{ color: NEON.muted }}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: NEON.text }} title={f.name}>{f.name}</span>
                  <button disabled={i === 0} className="grid h-4 w-4 place-items-center rounded disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => move(i, -1)} title="Move earlier"><ArrowUp className="h-3 w-3" /></button>
                  <button disabled={i === files.length - 1} className="grid h-4 w-4 place-items-center rounded disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => move(i, 1)} title="Move later"><ArrowDown className="h-3 w-3" /></button>
                  <button className="grid h-4 w-4 place-items-center rounded" style={{ color: NEON.red }} onClick={() => removeAt(i)} title="Remove"><X className="h-3 w-3" /></button>
                </div>
              ))}
              <button className="mt-0.5 flex items-center justify-center gap-1 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => inputRef.current?.click()} disabled={!!busy}><Upload className="h-3 w-3" /> add more</button>
            </div>
          )}

          {/* RAW PREVIEW (sequence: plays the listed files in order, straight from Supabase) */}
          {files.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Raw preview{files.length > 1 ? ` · ${previewIdx + 1}/${files.length} (plays in sequence)` : ""}</div>
              <video
                ref={vidRef}
                key={files[Math.min(previewIdx, files.length - 1)]?.path}
                controls playsInline
                src={files[Math.min(previewIdx, files.length - 1)]?.url}
                onEnded={() => { if (previewIdx < files.length - 1) { setPreviewIdx((i) => i + 1); setTimeout(() => vidRef.current?.play().catch(() => {}), 30); } }}
                style={{ width: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }}
              />
              <div className="text-[8.5px]" style={{ color: NEON.muted }}>Some source codecs (e.g. .mkv) may not preview in-browser; the pipeline still runs.</div>
            </div>
          )}

          {/* PUBLISH */}
          <button
            className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] font-bold uppercase tracking-wide disabled:opacity-50"
            style={{ color: busy ? NEON.muted : "#0B0F1E", background: busy ? "transparent" : NEON.yellow, border: `1px solid ${busy ? NEON.borderSoft : NEON.yellow}` }}
            onClick={publish}
            disabled={!!busy || files.length === 0}
          >
            {busy === "publishing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : published ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clapperboard className="h-3.5 w-3.5" />}
            {busy === "publishing" ? "Publishing…" : published ? "Re-publish" : "Publish this lesson"}
          </button>
          {note && <div className="rounded px-2 py-1 text-[9.5px] leading-snug" style={{ color: note.startsWith("Publish failed") || note.startsWith("Upload failed") ? "#FF8B9E" : NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>{note}</div>}
        </div>
      )}
    </div>
  );
}
