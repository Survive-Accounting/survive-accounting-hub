// RECORDER SPIKE (Phase 3 — EXPERIMENT ONLY). In-browser cam+mic capture via
// MediaRecorder: device pickers, live preview, record/stop, local playback +
// download. Deliberately NOT wired into the take board / upload flow — this
// exists to answer "could the browser replace OBS?" and nothing else. See the
// run report for the honest quality/latency assessment vs OBS.
import { useEffect, useRef, useState } from "react";
import { Circle, Download, FlaskConical, Square, X } from "lucide-react";

import { NEON } from "./theme";

interface Devices { cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }

function pickMime(): string {
  const candidates = [
    "video/mp4;codecs=avc1", // Safari/Chrome mp4 when supported — best OBS parity
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export function RecorderSpike({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<Devices>({ cams: [], mics: [] });
  const [camId, setCamId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipMeta, setClipMeta] = useState<{ size: number; mime: string; ms: number } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const previewRef = useRef<HTMLVideoElement>(null);

  // acquire stream for the chosen devices (1080p target — what OBS records)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: camId ? { exact: camId } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: false, noiseSuppression: false },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (previewRef.current) { previewRef.current.srcObject = stream; void previewRef.current.play().catch(() => {}); }
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices({ cams: all.filter((d) => d.kind === "videoinput"), mics: all.filter((d) => d.kind === "audioinput") });
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [camId, micId]);
  useEffect(() => () => { recRef.current?.stop(); streamRef.current?.getTracks().forEach((t) => t.stop()); if (clipUrl) URL.revokeObjectURL(clipUrl); }, [clipUrl]);

  const start = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType });
      if (clipUrl) URL.revokeObjectURL(clipUrl);
      setClipUrl(URL.createObjectURL(blob));
      setClipMeta({ size: blob.size, mime: rec.mimeType, ms: Date.now() - startedAt.current });
      setRecording(false);
    };
    startedAt.current = Date.now();
    rec.start();
    recRef.current = rec;
    setRecording(true);
  };

  const settings = streamRef.current?.getVideoTracks()[0]?.getSettings();

  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-black/60 p-6" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl rounded-2xl p-3" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }}>
        <div className="mb-2 flex items-center gap-2">
          <FlaskConical className="h-4 w-4" style={{ color: NEON.yellow }} />
          <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Recorder spike — experiment</span>
          <span className="rounded px-1.5 text-[9px] font-bold uppercase" style={{ color: NEON.red, border: `1px solid ${NEON.red}66` }}>not the filming flow — OBS stays</span>
          <span className="flex-1" />
          <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted }} onClick={onClose}><X className="h-3.5 w-3.5" /></button>
        </div>
        {err && <p className="mb-2 rounded px-2 py-1 text-[11px]" style={{ background: "rgba(206,17,38,0.15)", color: "#FF8B9E" }}>{err}</p>}
        <div className="mb-2 flex gap-2 text-[11px]">
          <select className="min-w-0 flex-1 rounded px-1.5 py-1" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={camId} onChange={(e) => setCamId(e.target.value)}>
            <option value="">Default camera</option>
            {devices.cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "camera"}</option>)}
          </select>
          <select className="min-w-0 flex-1 rounded px-1.5 py-1" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={micId} onChange={(e) => setMicId(e.target.value)}>
            <option value="">Default mic</option>
            {devices.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "mic"}</option>)}
          </select>
        </div>
        <video ref={previewRef} muted playsInline className="w-full rounded" style={{ aspectRatio: "16/9", background: "#000", objectFit: "cover" }} />
        <div className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: NEON.muted }}>
          {settings ? <span>live: {settings.width}×{settings.height} @ {settings.frameRate ?? "?"}fps</span> : <span>acquiring camera…</span>}
          <span className="flex-1" />
          {!recording ? (
            <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold" style={{ color: "#FF5C6C", border: `1px solid ${NEON.red}66` }} onClick={start} disabled={!streamRef.current}>
              <Circle className="h-3 w-3" fill="currentColor" /> record
            </button>
          ) : (
            <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold" style={{ color: NEON.text, background: "rgba(206,17,38,0.3)", border: `1px solid ${NEON.red}` }} onClick={() => recRef.current?.stop()}>
              <Square className="h-3 w-3" fill="currentColor" /> stop
            </button>
          )}
        </div>
        {clipUrl && clipMeta && (
          <div className="mt-2 border-t pt-2" style={{ borderColor: NEON.borderSoft }}>
            <video src={clipUrl} controls playsInline className="w-full rounded" style={{ aspectRatio: "16/9", background: "#000" }} />
            <div className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: NEON.muted }}>
              <span>{(clipMeta.size / 1_048_576).toFixed(1)} MB · {(clipMeta.ms / 1000).toFixed(1)}s · {clipMeta.mime}</span>
              <span className="flex-1" />
              <a className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} href={clipUrl} download={`spike-take.${clipMeta.mime.includes("mp4") ? "mp4" : "webm"}`}>
                <Download className="h-3 w-3" /> save local take
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
