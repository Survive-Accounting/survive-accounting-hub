// THE SHIPPED DOCK — mounted once, globally (next to IdeasDock in __root.tsx). Two bare-key
// shortcuts for an unlocked admin device only, never while typing anywhere on the site:
//   R — open the recorder            N — open the notepad
// Lee, 2026-09-05: "Press R. Talk. Build. Stop. Publish. That's it."
import { useCallback, useEffect, useRef, useState } from "react";

import { isAdminUnlocked, getAdminWho } from "@/components/AdminGate";
import { AdminSessionGate } from "@/components/AdminSessionGate";
import { createShippedUpload, resolveShippedUpload, saveShippedEntry } from "@/lib/shipped.functions";

import { ConfirmScreen } from "./ConfirmScreen";
import { formatRecordDate, inferSemester, SHIPPED_URL, type ShippedEntry } from "./model";
import { Notepad } from "./Notepad";
import { Recorder, type RecorderResult } from "./Recorder";

/** Key events from a field are the field's — R and N must never fire while typing anywhere,
 *  including inside the notepad's own contentEditable region. */
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || !!el.isContentEditable);
}

const SCRATCHPAD_KEY = "sa-shipped-scratchpad";

type Stage = "closed" | "recorder" | "uploading" | "upload-error" | "confirm";

export function ShippedDock() {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(isAdminUnlocked()); }, []);

  const [stage, setStage] = useState<Stage>("closed");
  const [notepadOpen, setNotepadOpen] = useState(false);
  const [notesHtml, setNotesHtml] = useState("");
  useEffect(() => { try { setNotesHtml(localStorage.getItem(SCRATCHPAD_KEY) ?? ""); } catch { /* private mode */ } }, []);
  const setNotes = useCallback((html: string) => {
    setNotesHtml(html);
    try { localStorage.setItem(SCRATCHPAD_KEY, html); } catch { /* the session still has it in memory */ }
  }, []);

  const [uploadPct, setUploadPct] = useState(0);
  const [entry, setEntry] = useState<ShippedEntry | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState<"saving" | "publishing" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [doneBanner, setDoneBanner] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastResultRef = useRef<RecorderResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // GLOBAL SHORTCUTS.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!unlocked || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "r" && stage === "closed") { e.preventDefault(); setStage("recorder"); setNotepadOpen(false); }
      else if (k === "n" && stage === "closed") { e.preventDefault(); setNotepadOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [unlocked, stage]);

  const stopPolling = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStage("closed"); setNotepadOpen(false); setEntry(null); setPreviewUrl(null); setUploadPct(0); setSaveError(null); setSaveBusy(null); setUploadError(null);
    lastResultRef.current = null;
  }, [previewUrl, stopPolling]);

  // STOP → upload straight to Mux (XHR for real progress; fetch has none for uploads) → poll.
  // THE RECORDING IS NEVER DROPPED on a failure (brief §4): the blob stays in lastResultRef, so
  // "Try again" reruns this exact function on the same take instead of re-recording.
  const handleStopped = useCallback(async (r: RecorderResult) => {
    lastResultRef.current = r;
    setStage("uploading"); setUploadPct(0); setUploadError(null);
    if (!previewUrl) setPreviewUrl(URL.createObjectURL(r.blob));
    const who = getAdminWho() === "king" ? "king" : "lee";
    try {
      const { entryId, uploadUrl } = await createShippedUpload({
        data: { who, semester: inferSemester(new Date()), transcriptLive: r.transcriptLive || null, notesHtml: notesHtml || null },
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Mux upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("The upload dropped."));
        xhr.open("PUT", uploadUrl);
        xhr.send(r.blob);
      });
      const first = await resolveShippedUpload({ data: { entryId } });
      setEntry(first);
      setStage("confirm");
      pollRef.current = setInterval(async () => {
        try {
          const fresh = await resolveShippedUpload({ data: { entryId } });
          setEntry(fresh);
          if (fresh.videoStatus === "ready" || fresh.videoStatus === "errored") stopPolling();
        } catch { /* keep the last known status; the next tick tries again */ }
      }, 4000);
    } catch (e) {
      // No entry to attach a save to yet — this is a real retry, not the confirm screen.
      setUploadError(e instanceof Error ? e.message : String(e));
      setStage("upload-error");
    }
  }, [notesHtml, previewUrl, stopPolling]);

  const handleSave = useCallback(async (fields: { title: string; topic: string; semester: string; notesPublic: boolean; publish: boolean }) => {
    if (!entry) return;
    setSaveBusy(fields.publish ? "publishing" : "saving"); setSaveError(null);
    try {
      const r = await saveShippedEntry({ data: { id: entry.id, title: fields.title, topic: fields.topic || null, semester: fields.semester, notesPublic: fields.notesPublic, publish: fields.publish } });
      setDoneBanner(fields.publish ? `Published — ${SHIPPED_URL}/${r.entry.slug}` : "Saved as a draft.");
      setTimeout(() => setDoneBanner(null), 8000);
      reset();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(null);
    }
  }, [entry, reset]);

  if (!unlocked) return null;

  return (
    <>
      {doneBanner && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 2147483003, background: "#101A2E", border: "1px solid #FCA31166", color: "#F4EFE6", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 700 }}>
          ⚡ {doneBanner}
        </div>
      )}

      {stage === "closed" && notepadOpen && <Notepad html={notesHtml} onChange={setNotes} onClose={() => setNotepadOpen(false)} />}

      {stage === "recorder" && (
        <AdminSessionGate>
          <Recorder
            semester={inferSemester(new Date())}
            dateLabel={formatRecordDate(new Date())}
            notepadOpen={notepadOpen}
            notesHtml={notesHtml}
            onNotesChange={setNotes}
            onToggleNotepad={() => setNotepadOpen((v) => !v)}
            onStopped={handleStopped}
            onDiscard={reset}
            onClose={reset}
          />
        </AdminSessionGate>
      )}

      {stage === "uploading" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(3,5,10,0.96)", display: "grid", placeItems: "center", color: "#F4EFE6", fontFamily: "'Rubik', system-ui, sans-serif" }}>
          <div style={{ width: 260, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Uploading… {uploadPct}%</div>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${uploadPct}%`, background: "#FCA311", transition: "width 150ms ease" }} />
            </div>
          </div>
        </div>
      )}

      {stage === "upload-error" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(3,5,10,0.96)", display: "grid", placeItems: "center", color: "#F4EFE6", fontFamily: "'Rubik', system-ui, sans-serif", padding: 20, textAlign: "center" }}>
          <div style={{ maxWidth: 340 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>The upload didn't go through</div>
            <div style={{ fontSize: 13, color: "#9AA3B8", marginBottom: 16 }}>Your recording is still on this device — nothing is lost. {uploadError}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button type="button" onClick={() => lastResultRef.current && handleStopped(lastResultRef.current)}
                style={{ font: "inherit", fontSize: 13.5, fontWeight: 800, padding: "9px 16px", borderRadius: 10, border: "none", background: "#FCA311", color: "#05070D", cursor: "pointer" }}>
                Try again
              </button>
              <button type="button" onClick={reset}
                style={{ font: "inherit", fontSize: 13.5, fontWeight: 700, padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(244,239,230,0.18)", background: "transparent", color: "#F4EFE6", cursor: "pointer" }}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === "confirm" && previewUrl && (
        <ConfirmScreen
          previewUrl={previewUrl}
          semester={entry?.semester ?? inferSemester(new Date())}
          videoStatus={entry?.videoStatus ?? "uploading"}
          busy={saveBusy}
          error={saveError}
          onSave={handleSave}
          onDiscard={reset}
        />
      )}
    </>
  );
}
