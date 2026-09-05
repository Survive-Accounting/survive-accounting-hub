// THE CONFIRMATION SCREEN — appears once the file has finished uploading to Mux. A title,
// an optional topic, the semester (pre-filled, editable), a private/public toggle for the
// notes, and two buttons. Publish is disabled until there's a title; everything else is
// optional. Lee, 2026-09-05: "I want publishing to take essentially one click after entering a
// title." Mux may still be transcoding in the background — publishing doesn't wait on it; the
// public page shows "still processing" until it's ready.
import { useState } from "react";

import { SHIPPED_TOPICS, type ShippedEntry } from "./model";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.18)", INK = "#05070D", MINT = "#3BF5A0", ORANGE = "#FF9F43";

export function ConfirmScreen({ previewUrl, semester, videoStatus, busy, error, onSave, onDiscard }: {
  previewUrl: string;
  semester: string;
  videoStatus: ShippedEntry["videoStatus"];
  busy: "saving" | "publishing" | null;
  error: string | null;
  onSave: (fields: { title: string; topic: string; semester: string; notesPublic: boolean; publish: boolean }) => void;
  onDiscard: () => void;
}) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [sem, setSem] = useState(semester);
  const [notesPublic, setNotesPublic] = useState(false);

  const canPublish = title.trim().length > 0 && busy === null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(3,5,10,0.96)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 18 }}>
      <div style={{ width: "min(92vw, 480px)", maxHeight: "92vh", overflowY: "auto", background: INK, border: `1px solid ${EDGE}`, borderRadius: 18, padding: 20, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, marginBottom: 10 }}>Nice work — one more step</div>

        <video src={previewUrl} controls playsInline style={{ width: "100%", borderRadius: 12, background: "#000", maxHeight: "40vh" }} />
        <div style={{ marginTop: 6, fontSize: 11.5, color: videoStatus === "ready" ? MINT : videoStatus === "errored" ? ORANGE : MUTED }}>
          {videoStatus === "ready" ? "Uploaded to Mux — ready." : videoStatus === "errored" ? "Mux had trouble with this upload — you can still save it and try Publish again shortly." : "Uploading to Mux…"}
        </div>

        <label style={label}>Title
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What did you ship?" style={field} />
        </label>
        <label style={label}>Topic (optional)
          <input value={topic} onChange={(e) => setTopic(e.target.value)} list="shipped-topics" placeholder="e.g. AI tools I'm testing" style={field} />
          <datalist id="shipped-topics">{SHIPPED_TOPICS.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label style={label}>Semester
          <input value={sem} onChange={(e) => setSem(e.target.value)} style={field} />
        </label>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Notes from this session</div>
          <div style={{ display: "flex", gap: 8 }}>
            {toggle("Private", !notesPublic, () => setNotesPublic(false))}
            {toggle("Public — show on the entry", notesPublic, () => setNotesPublic(true))}
          </div>
        </div>

        {error && <div style={{ marginTop: 10, fontSize: 12.5, color: ORANGE }}>{error}</div>}

        <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={busy !== null} onClick={() => onSave({ title, topic, semester: sem, notesPublic, publish: false })}
            style={{ ...btn, opacity: busy !== null ? 0.5 : 1 }}>
            {busy === "saving" ? "Saving…" : "Save Draft"}
          </button>
          <button type="button" disabled={!canPublish} onClick={() => onSave({ title, topic, semester: sem, notesPublic, publish: true })}
            style={{ ...btn, background: GOLD, color: INK, border: "none", opacity: canPublish ? 1 : 0.5 }}>
            {busy === "publishing" ? "Publishing…" : "Publish to SHIPPED"}
          </button>
          <button type="button" onClick={onDiscard} style={{ ...btn, marginLeft: "auto", color: ORANGE, borderColor: `${ORANGE}66` }}>Discard</button>
        </div>
      </div>
    </div>
  );
}

function toggle(label: string, on: boolean, onClick: () => void) {
  return (
    <button key={label} type="button" onClick={onClick}
      style={{ font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: `1px solid ${on ? GOLD : EDGE}`, background: on ? "rgba(252,163,17,0.14)" : "transparent", color: on ? GOLD : CREAM, cursor: "pointer" }}>
      {label}
    </button>
  );
}

const label: React.CSSProperties = { display: "block", fontSize: 11, color: MUTED, marginTop: 12 };
const field: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${EDGE}`, borderRadius: 9, padding: "9px 11px", fontSize: 14, color: CREAM, font: "inherit" };
const btn: React.CSSProperties = { font: "inherit", fontSize: 13.5, fontWeight: 800, padding: "9px 16px", borderRadius: 10, border: `1px solid ${EDGE}`, background: "transparent", color: CREAM, cursor: "pointer" };
