// ✂ SLICE A RECORDING (G, 2026-09-13) — the door on /v3/post for one continuous take.
//
// A split's own post-production panel uploads and transcribes the file it is given; a 25-minute
// whole-set recording should do neither. So this reads the file HERE (its length and its last-modified
// time — nothing leaves the machine), matches it to the set's saved timeline, and hands over one
// ffmpeg line per split (ScrapCuts, whole-set mode). Each split's own row then takes its .partN file.
import { useEffect, useState } from "react";

import type { BoothTopic } from "@/lib/talkthrough.functions";
import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { ScrapCuts } from "@/components/v3/ScrapCuts";
import { mediaDurationS } from "@/components/v3/take-transcript";
import { clockOf } from "@/components/blastoff/frame-events";

export function SliceRecording({ topics, onClose }: { topics: BoothTopic[]; onClose: () => void }) {
  const [setId, setSetId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [onClose]);

  const pick = (f: File | null) => {
    setFile(f); setSeconds(null);
    if (!f) return;
    setReading(true);
    void mediaDurationS(f).then((s) => { setSeconds(s); setReading(false); });
  };

  const field: React.CSSProperties = { font: "inherit", fontSize: 13, background: "#0B0F1E", color: V3_CREAM, border: `1px solid ${V3_EDGE}`, borderRadius: 8, padding: "7px 10px" };
  return (
    <div role="dialog" aria-modal="true" aria-label="Slice a recording" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2147482800, background: "rgba(5,8,16,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 860, maxHeight: "92vh", overflowY: "auto", background: "#0B0F1E", color: V3_CREAM, border: `1px solid ${V3_GOLD}66`, borderRadius: 16, padding: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontFamily: V3_DISPLAY, fontSize: 20, fontWeight: 900 }}>✂ Slice a recording</div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ ...field, padding: "4px 10px", fontSize: 11.5, color: V3_MUTED, cursor: "pointer" }}>close</button>
        </div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5, maxWidth: 640 }}>
          Filmed a whole set in one go? Pick the set and the file OBS wrote. It's matched to the timeline /film saved while you recorded, and cut into one video per split with your F3 scraps taken out. The file is only read on this machine — nothing uploads.
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={setId} onChange={(e) => setSetId(e.target.value)} style={{ ...field, minWidth: 260 }}>
            <option value="">— which set —</option>
            {topics.map((t) => (
              <optgroup key={t.id} label={t.name}>
                {t.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          </select>
          <label style={{ ...field, cursor: "pointer", color: V3_GOLD, fontWeight: 700 }}>
            {file ? "Pick a different file" : "Pick the recording"}
            <input type="file" accept="video/*,.mp4,.mov,.m4v,.mkv,.webm" onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
          </label>
          {file && <span style={{ fontSize: 12, color: V3_MUTED }}>{file.name}{reading ? " · reading…" : seconds != null ? ` · ${clockOf(seconds)}` : " · couldn't read its length"}</span>}
        </div>
        {setId && file && !reading && seconds == null && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#FF8B7E" }}>This browser couldn't read the file's length, so it can't be matched to a recording. Try an .mp4 (OBS: Settings → Output → Recording format, or remux the .mkv first).</div>
        )}
        {setId && file && seconds != null && <ScrapCuts setId={setId} takeIndex={null} file={file} fileSeconds={seconds} />}
      </div>
    </div>
  );
}
