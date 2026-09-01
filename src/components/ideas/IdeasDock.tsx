// IDEAS TO SAVE — the pill and the drawer. Global on every internal surface.
//
// THE ONE RULE THIS OBEYS: capture costs ten seconds. Open (⌘I), type, save
// (⌘↵). Nothing else is required — no category, no title, no prompt. Every
// other field is there for later, and later is optional.
//
// A DRAWER, NOT A MODAL, on purpose: Lee is usually describing the page he is
// looking at, so the page has to stay visible while he writes.
//
// It never generates anything. Lee writes prompts with Claude elsewhere and
// uploads the .md here; this is a vault, not an author.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { listIdeas, saveIdea } from "@/lib/ideas.functions";
import { getAdminWho } from "@/components/AdminGate";
import { IdeaRecorder, judgeTranscript, shouldTranscribe } from "./voice";
import { uploadIdeaFile, transcribeIdeaAudio } from "./upload";
import {
  CATEGORIES, CATEGORY_HINT, CATEGORY_LABEL, deriveTitle, knownSubcategories, newIdeaId,
  unsubmittedCount, type Attachment, type Category, type Idea,
} from "./model";

const GOLD = "#FCA311";
const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const PANEL = "#101A2E";
const EDGE = "rgba(244,239,230,0.16)";

/** Where the dock appears. Internal surfaces only — every one of these is
 *  noindex and behind the AdminGate, and they are the pages Lee has ideas ON. */
const INTERNAL = ["/admin", "/outreach", "/study", "/talkthrough", "/blast-off", "/blastoff-demo", "/exhibit-lab", "/exhibit-demo", "/leeportal", "/callout-demo", "/logo-lab", "/intro-outro", "/practice-demo"];
/** The vault's own page is the one place the pill must NOT appear: you are
 *  already there, and it would sit on top of Prioritize. "Never covers
 *  primary actions" is a hard rule, not a nudge. */
const VAULT = "/admin/ideas";
export const isInternalPath = (p: string): boolean =>
  p !== VAULT && INTERNAL.some((r) => p === r || p.startsWith(r + "/"));

const DISMISS_KEY = "sa-ideas-pill-dismissed";

export function IdeasDock() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Session-scoped dismissal: the pill comes back next session, and ⌘I brings
  // it back now. Hiding it must never mean losing it.
  useEffect(() => { try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1"); } catch { /* private mode */ } }, []);

  const refresh = useCallback(() => {
    listIdeas().then((r) => { setIdeas(r.ideas); setLoadErr(null); })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const show = isInternalPath(pathname);
  useEffect(() => { if (show) refresh(); }, [show, refresh]);

  // ⌘I / Ctrl+I from anywhere in admin — the whole point. If capturing needs
  // the mouse it will not happen mid-task.
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setDismissed(false);
        try { sessionStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  if (!show) return null;
  const count = unsubmittedCount(ideas);

  return (
    <>
      {!dismissed && !open && (
        <div style={{ position: "fixed", top: 10, right: 12, zIndex: 2147483000, display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={() => setOpen(true)}
            title="Save for Later (Ctrl/⌘ I) — drop it here, get back to work"
            style={{
              display: "flex", alignItems: "center", gap: 7, background: "rgba(16,26,46,0.94)",
              border: `1px solid ${GOLD}66`, color: CREAM, borderRadius: 999,
              padding: "5px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Rubik', system-ui, sans-serif", boxShadow: "0 4px 14px -6px rgba(0,0,0,0.8)",
            }}
          >
            <span style={{ color: GOLD }}>⚡</span> Save for Later
            {count > 0 && (
              <span style={{ background: GOLD, color: "#0B1322", borderRadius: 999, padding: "0 6px", fontSize: 10.5, fontWeight: 900 }}>{count}</span>
            )}
          </button>
          <button
            onClick={() => { setDismissed(true); try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } }}
            title="Hide until next session (⌘I brings it back)"
            style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "2px 4px" }}
          >×</button>
        </div>
      )}

      {open && (
        <Drawer
          pathname={pathname}
          ideas={ideas}
          loadErr={loadErr}
          onClose={() => setOpen(false)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ drawer

function Drawer({ pathname, ideas, loadErr, onClose, onSaved }: {
  pathname: string; ideas: Idea[]; loadErr: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [cats, setCats] = useState<Category[]>([]);
  const [sub, setSub] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  // VOICE. The audio is kept whatever the transcript does.
  const [rec, setRec] = useState<IdeaRecorder | null>(null);
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const [audio, setAudio] = useState<{ path: string; status: string } | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [, bump] = useState(0);

  useEffect(() => { ta.current?.focus(); }, []);
  const subs = useMemo(() => knownSubcategories(ideas), [ideas]);

  const save = useCallback(() => {
    const body = text.trim();
    // Audio alone is a valid idea: a failed transcript must not lose it.
    if ((!body && !audio) || busy) return;
    setBusy(true); setErr(null);
    saveIdea({ data: {
      id: newIdeaId(),
      title: deriveTitle(body) || (audio ? "Voice note" : ""),
      body,
      categories: cats,
      subcategory: sub.trim(),
      status: "IDEA",
      // Auto-captured: the page it was written from, so a note typed on
      // /blast-off remembers that without Lee saying so.
      sourcePath: pathname,
      context: {},
      promptMd: null,
      promptFilename: null,
      createdBy: getAdminWho() ?? "",
      sourceKind: audio ? "voice" : "web",
      attachments: files,
      audioPath: audio?.path ?? null,
      transcriptStatus: audio?.status ?? null,
    } })
      .then(() => { onSaved(); onClose(); })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); });
  }, [text, cats, sub, pathname, busy, audio, files, onSaved, onClose]);

  /** HOLD to talk, or tap-tap for a longer note. Both gestures, one handler. */
  const startRec = async () => {
    if (rec) return;
    setVoiceMsg(null);
    const r = new IdeaRecorder(() => bump((n) => n + 1));
    try { await r.start(); setRec(r); }
    catch (e) { setVoiceMsg(e instanceof Error ? e.message : String(e)); }
  };
  const stopRec = async () => {
    if (!rec) return;
    const { blob, voicedMs } = await rec.stop();
    setRec(null);
    if (!shouldTranscribe(voicedMs)) { setVoiceMsg("Nothing heard — try again closer to the mic."); return; }
    setVoiceMsg("Transcribing…");
    try {
      const r = await transcribeIdeaAudio(blob);
      const judged = judgeTranscript(r.text, voicedMs);
      setAudio({ path: r.path, status: r.error ? "failed" : judged.status });
      if (judged.text) {
        setText((v) => (v.trim() ? `${v.trimEnd()}\n${judged.text}` : judged.text));
        setVoiceMsg("Transcribed — edit it if you like.");
      } else {
        // Kept on purpose: a rejected or failed transcript still has audio.
        setVoiceMsg(judged.status === "rejected"
          ? "That came back as noise — audio saved, type the idea."
          : r.error ? "Transcription failed — audio saved, type the idea."
          : "Nothing usable came back — audio saved.");
      }
    } catch (e) { setVoiceMsg(`Could not save the audio — ${e instanceof Error ? e.message : String(e)}`); }
  };

  const addFiles = async (list: FileList) => {
    for (const f of Array.from(list)) {
      try { const a = await uploadIdeaFile(f); setFiles((v) => [...v, a]); }
      catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    }
  };

  // ⌘↵ saves and closes; Esc closes WITHOUT saving but keeps the draft in the
  // component above? No — Esc discards this draft deliberately: a half-idea
  // resurfacing later is worse than retyping one line.
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    e.stopPropagation(); // never let the page's own shortcuts fire while typing
  };

  return (
    <div
      onKeyDown={onKey}
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 2147483001,
        width: "min(380px, 100vw)",
        background: PANEL, borderLeft: `1px solid ${EDGE}`, boxShadow: "-14px 0 40px -18px rgba(0,0,0,0.9)",
        display: "flex", flexDirection: "column", fontFamily: "'Rubik', system-ui, sans-serif", color: CREAM,
      }}
    >
      <div className="flex items-center gap-2" style={{ padding: "12px 14px", borderBottom: `1px solid ${EDGE}` }}>
        <span style={{ color: GOLD }}>⚡</span>
        <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.04em" }}>Save for Later</span>
        <a href="/admin/ideas" style={{ marginLeft: "auto", color: MUTED, fontSize: 11, textDecoration: "underline" }}>all {ideas.length} →</a>
        <button onClick={onClose} title="Close (Esc)" style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 15 }}>×</button>
      </div>

      <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
        <label style={{ fontSize: 11.5, color: MUTED, display: "block", marginBottom: 6 }}>What's up?</label>
        <textarea
          ref={ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="Say it however it comes out. Nothing else is required."
          style={{
            width: "100%", background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 10,
            color: CREAM, fontSize: 13.5, lineHeight: 1.45, padding: "10px 12px", outline: "none", resize: "vertical",
            fontFamily: "inherit",
          }}
        />

        {/* VOICE + FILES — the phone row. Hold the mic, or tap it twice. */}
        <div className="flex items-center" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button
            onPointerDown={(e) => { e.preventDefault(); void startRec(); }}
            onPointerUp={() => { if (rec) void stopRec(); }}
            onClick={() => { if (!rec) return; }}
            title="Hold to record — or tap to start and tap again to stop"
            style={{
              display: "flex", alignItems: "center", gap: 7, minHeight: 42,
              background: rec ? "#F8717122" : "transparent",
              border: `1.5px solid ${rec ? "#F87171" : EDGE}`, color: rec ? "#F87171" : CREAM,
              borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              touchAction: "none",
            }}
          >
            🎙 {rec ? "Recording — release" : "Hold to talk"}
            {rec && (
              <span style={{ display: "inline-block", width: 44, height: 5, background: "rgba(244,239,230,0.18)", borderRadius: 999, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.round(rec.level * 100)}%`, background: "#F87171" }} />
              </span>
            )}
          </button>
          <input ref={file} type="file" multiple style={{ display: "none" }}
            onChange={(e) => { if (e.target.files) void addFiles(e.target.files); }} />
          <button onClick={() => file.current?.click()}
            style={{ minHeight: 42, background: "transparent", border: `1px solid ${EDGE}`, color: CREAM, borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            📎 Add screenshot
          </button>
        </div>
        {voiceMsg && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{voiceMsg}</div>}
        {audio && <div style={{ fontSize: 11, color: "#3BF5A0", marginTop: 4 }}>🎙 audio attached — kept whatever the transcript did</div>}
        {files.length > 0 && (
          <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
            {files.map((f) => <div key={f.id}>📎 {f.name}</div>)}
          </div>
        )}

        <div style={{ fontSize: 11.5, color: MUTED, margin: "14px 0 6px" }}>Categories <span style={{ opacity: 0.6 }}>optional</span></div>
        <div className="flex flex-wrap" style={{ gap: 5 }}>
          {CATEGORIES.map((c) => {
            const on = cats.includes(c);
            return (
              <button key={c} title={CATEGORY_HINT[c]}
                onClick={() => setCats((v) => on ? v.filter((x) => x !== c) : [...v, c])}
                style={{
                  background: on ? GOLD : "transparent", color: on ? "#0B1322" : CREAM,
                  border: `1px solid ${on ? GOLD : EDGE}`, borderRadius: 999,
                  padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>
                {CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11.5, color: MUTED, margin: "14px 0 6px" }}>Subcategory <span style={{ opacity: 0.6 }}>optional</span></div>
        <input
          value={sub} onChange={(e) => setSub(e.target.value)} list="sa-idea-subs"
          placeholder="learn page, rep system, practice modal…"
          style={{ width: "100%", background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 10, color: CREAM, fontSize: 12.5, padding: "7px 11px", outline: "none" }}
        />
        <datalist id="sa-idea-subs">{subs.map((s) => <option key={s} value={s} />)}</datalist>

        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 12 }}>
          Saved from <span style={{ color: CREAM }}>{pathname}</span> — captured automatically.
        </div>
        {loadErr && <div style={{ color: "#F87171", fontSize: 11, marginTop: 8 }}>{loadErr}</div>}
        {err && <div style={{ color: "#F87171", fontSize: 11.5, marginTop: 8 }}>{err}</div>}
      </div>

      <div className="flex items-center gap-2" style={{ padding: 12, borderTop: `1px solid ${EDGE}` }}>
        <span style={{ fontSize: 10.5, color: MUTED }}>⌘↵ save · Esc close</span>
        <button
          onClick={save}
          disabled={!text.trim() || busy}
          style={{
            marginLeft: "auto", background: text.trim() && !busy ? GOLD : "transparent",
            color: text.trim() && !busy ? "#0B1322" : MUTED,
            border: `1px solid ${text.trim() && !busy ? GOLD : EDGE}`, borderRadius: 10,
            padding: "7px 18px", fontSize: 13, fontWeight: 800, cursor: text.trim() && !busy ? "pointer" : "default",
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
