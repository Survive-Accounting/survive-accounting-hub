// PICK A FRAME OF THE TAKE — the thumbnail's other source.
//
// Lee, 2026-09-09: "I think with the using the intro slide for the thumbnail, let me choose
// between the first few seconds (as granular as we can), since often I have my eyes closed at
// the start."
//
// The take file never leaves the machine: a blob URL into a <video>, a seek, a canvas, a
// download. Nothing is uploaded and nothing is stored — which is also why this had to be
// client-side rather than another API route.
//
// GRANULARITY. HTMLVideoElement seeking is not frame-exact by spec, so there are two gestures:
// the contact sheet of the opening (eight stills, click one), and ◀ ▶ which step by exactly one
// frame at the chosen rate. requestVideoFrameCallback, where the browser has it, reports the
// frame actually presented, so the readout tells the truth rather than what we asked for.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  contactTimes, DEFAULT_FPS, formatTime, frameFilename, frameIndex, FRAME_RATES,
  OPENING_SECONDS, stepTime, takeFileProblem, type FrameRate,
} from "@/lib/take-frame";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

const MINT = "#3BF5A0";

export function TakeFrame({ name }: { name: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [t, setT] = useState(0);
  const [fps, setFps] = useState<FrameRate>(DEFAULT_FPS);
  const [saving, setSaving] = useState(false);

  // The object URL is revoked when the file changes and when the sheet closes — a take is
  // hundreds of megabytes and leaking one per open would be felt.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const pick = (file: File | null) => {
    const problem = takeFileProblem(file);
    if (problem || !file) { setErr(problem); return; }
    setErr(null);
    setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    setFileName(file.name);
    setDuration(0); setSize(null); setT(0);
  };

  const seek = useCallback((next: number) => {
    const v = videoRef.current;
    setT(next);
    if (v) v.currentTime = next;
  }, []);
  const step = (frames: number) => seek(stepTime(videoRef.current?.currentTime ?? t, frames, fps, duration));

  // ARROW KEYS step frames while this panel has a take loaded — the gesture Lee will actually
  // use, since finding open eyes means nudging one frame at a time.
  useEffect(() => {
    if (!url) return;
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); step(e.shiftKey ? -10 : -1); }
      if (e.key === "ArrowRight") { e.preventDefault(); step(e.shiftKey ? 10 : 1); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const sheet = useMemo(() => contactTimes(duration, OPENING_SECONDS, 8), [duration]);

  /** Draw what the video is showing, at its own resolution, and hand it over as a file. */
  const save = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setErr("The take hasn't loaded a picture yet."); return; }
    setSaving(true); setErr(null);
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("This browser wouldn't give us a canvas.");
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
      if (!blob) throw new Error("The frame wouldn't encode.");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = frameFilename(name, v.currentTime);
      document.body.appendChild(a); a.click(); a.remove();
      // Revoked on the next tick: Chrome needs the URL alive until the click is handled.
      window.setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };

  const small: React.CSSProperties = { font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" };
  const chip = (on: boolean): React.CSSProperties => ({ ...small, borderColor: on ? `${V3_GOLD}aa` : V3_EDGE, color: on ? V3_GOLD : V3_MUTED, background: on ? "rgba(252,163,17,0.10)" : "transparent" });

  return (
    <div>
      <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
        Load the take and step through its opening — the cold open assembles over three seconds, so
        the frame worth keeping is usually just after. ◀ ▶ move one frame; hold Shift for ten.
        Nothing is uploaded: the file stays on this machine.
      </div>

      <label style={{ ...small, display: "inline-block", marginTop: 10, borderColor: `${V3_GOLD}88`, color: V3_GOLD }}>
        {url ? "Pick another take" : "Pick the take file"}
        <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
      </label>
      {fileName && <span style={{ marginLeft: 8, fontSize: 11.5, color: V3_MUTED }}>{fileName}{size ? ` · ${size.w}×${size.h}` : ""}</span>}
      {err && <div style={{ marginTop: 8, fontSize: 12, color: "#FF8B7E" }}>{err}</div>}

      {url && (
        <>
          <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <video
              ref={videoRef} src={url} muted playsInline preload="auto"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setDuration(v.duration || 0);
                setSize({ w: v.videoWidth, h: v.videoHeight });
                v.currentTime = 0;
              }}
              onSeeked={(e) => setT(e.currentTarget.currentTime)}
              onError={() => setErr("This browser couldn't play that file. If it's .mkv, remux it to .mp4 (OBS: Remux Recordings).")}
              style={{ width: 260, maxHeight: 470, borderRadius: 10, border: `1px solid ${V3_EDGE}`, background: "#000", display: "block" }}
            />
            <div style={{ flex: 1, minWidth: 260 }}>
              {/* THE OPENING, as stills. Click one, then nudge. */}
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_GOLD }}>The first {Math.min(OPENING_SECONDS, Math.ceil(duration) || OPENING_SECONDS)} seconds</div>
              <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
                {sheet.map((s) => (
                  <button key={s} type="button" onClick={() => seek(s)} style={chip(Math.abs(s - t) < 0.001)}>{s.toFixed(2)}s</button>
                ))}
              </div>

              <input
                type="range" min={0} max={Math.max(0.001, duration)} step={1 / fps} value={Math.min(t, duration)}
                onChange={(e) => seek(Number(e.target.value))}
                style={{ width: "100%", marginTop: 12, accentColor: V3_GOLD }}
              />
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                <button type="button" onClick={() => step(-10)} style={small} title="Back ten frames">⏮</button>
                <button type="button" onClick={() => step(-1)} style={small} title="Back one frame (←)">◀</button>
                <button type="button" onClick={() => step(1)} style={small} title="Forward one frame (→)">▶</button>
                <button type="button" onClick={() => step(10)} style={small} title="Forward ten frames">⏭</button>
                <span style={{ fontSize: 11.5, color: V3_CREAM, fontVariantNumeric: "tabular-nums", marginLeft: 4 }}>
                  {formatTime(t)} · frame {frameIndex(t, fps)}
                </span>
              </div>

              <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: V3_MUTED }}>frame rate</span>
                {FRAME_RATES.map((r) => (
                  <button key={r} type="button" onClick={() => setFps(r)} style={chip(r === fps)}>{r}</button>
                ))}
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={() => void save()} disabled={saving}
                  style={{ ...small, fontSize: 12.5, padding: "7px 14px", border: `1.5px solid ${MINT}`, background: "rgba(59,245,160,0.12)", color: V3_CREAM, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Save this frame"}
                </button>
                <span style={{ fontSize: 11.5, color: V3_MUTED }}>
                  Saved at the take's own size{size ? ` (${size.w}×${size.h})` : ""}.
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
