// IDEAS TO SAVE — the pill and the modal. Ctrl+I on every page.
//
// THE ONE RULE THIS OBEYS: capture costs ten seconds. Open (⌘I), say it or
// type it, save (⌘↵). Nothing else is required — no category, no title, no
// prompt. AI does the organising AFTER the save, in the background (Lee,
// 2026-09-03: "let the ideas really flow and be beautifully scattered and
// free … It's AI's job to get it organized and categorized and triaged").
//
// A CENTRED, DRAGGABLE MODAL (Lee, 2026-09-02): translucent backdrop so the
// page stays readable; drag the header out of the way; position remembered.
//
// WHERE: every page of the site. The first time on a device the modal asks
// for the passcode (and who you are — Lee or King) and remembers the device.
// The pill only shows once a device is unlocked, so a student never sees it.
//
// STEPS: lock (once) → capture → optional preview (the drafted prompt as
// folded sections, editable, regenerate) → Save, or Save draft to come back
// to. After a save: "Nice! Thanks for helping improve Survive." and AI
// titles, TLDRs, summarises, categorises and drafts the prompt while you get
// back to work. Sending a summary to King/Lee lives on /admin/ideas.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { draftIdeaPrompt, listIdeas, organizeIdea, saveIdea } from "@/lib/ideas.functions";
import { promptSection } from "@/lib/ideas-prompt";
import { getAdminWho, isAdminUnlocked, unlockAdmin, type AdminWho } from "@/components/AdminGate";
import { IdeaRecorder, judgeTranscript, shouldTranscribe } from "./voice";
import { uploadIdeaFile, transcribeIdeaAudio } from "./upload";
import {
  CATEGORIES, CATEGORY_HINT, CATEGORY_LABEL, deriveTitle, isDraft, knownSubcategories, newIdeaId,
  unsubmittedCount, type Attachment, type Category, type Idea,
} from "./model";

const GOLD = "#FCA311";
const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const PANEL = "#101A2E";
const EDGE = "rgba(244,239,230,0.16)";

/** Internal surfaces are gated themselves, so the pill shows there without a
 *  separate unlock. Everywhere else the pill waits for the device to unlock. */
const INTERNAL = ["/admin", "/outreach", "/study", "/talkthrough", "/blast-off", "/blastoff-demo", "/exhibit-lab", "/exhibit-demo", "/leeportal", "/callout-demo", "/logo-lab", "/intro-outro", "/practice-demo"];
/** The vault's own page is the one place the pill must NOT appear: you are
 *  already there, and it would sit on top of Prioritize. */
const VAULT = "/admin/ideas";
export const isInternalPath = (p: string): boolean =>
  p !== VAULT && INTERNAL.some((r) => p === r || p.startsWith(r + "/"));

const DISMISS_KEY = "sa-ideas-pill-dismissed";
const POS_KEY = "sa-ideas-modal-pos";

type SavedKind = "idea" | "todo" | "draft";

export function IdeasDock() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: SavedKind } | null>(null);

  // Session-scoped dismissal: the pill comes back next session, and ⌘I brings
  // it back now. Hiding it must never mean losing it.
  useEffect(() => { try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1"); } catch { /* private mode */ } }, []);

  const refresh = useCallback(() => {
    listIdeas().then((r) => { setIdeas(r.ideas); setLoadErr(null); })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(isAdminUnlocked()); }, [pathname]);
  // The shortcut listens on EVERY page; the pill shows once unlocked.
  const listen = pathname !== VAULT;
  const show = listen && (isInternalPath(pathname) || unlocked);
  useEffect(() => { if (show) refresh(); }, [show, refresh]);

  // ⌘I / Ctrl+I from anywhere — the whole point. If capturing needs the
  // mouse it will not happen mid-task.
  useEffect(() => {
    if (!listen) return;
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
  }, [listen]);

  // THE CONFIRMATION (Lee, 2026-09-03): "Nice! Thanks for helping improve
  // Survive. (View in Ideas dashboard)". Seven seconds, then gone.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  const onSaved = (kind: SavedKind) => {
    refresh();
    setToast({
      kind,
      text: kind === "todo" ? "Counted. Terry has it on the list."
        : kind === "draft" ? "Draft saved — Ctrl+I brings it back whenever."
        : "Nice! Thanks for helping improve Survive.",
    });
  };

  if (!listen) return null;
  const count = unsubmittedCount(ideas);

  return (
    <>
      {show && !dismissed && !open && (
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

      {toast && (
        <div role="status" style={{
          position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 2147483002,
          background: "#101A2E", border: `1px solid ${GOLD}`, color: CREAM, borderRadius: 14,
          padding: "12px 18px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 13.5, fontWeight: 700,
          boxShadow: "0 18px 50px -14px rgba(0,0,0,0.9)", display: "flex", gap: 12, alignItems: "center",
        }}>
          <span style={{ color: GOLD }}>{toast.kind === "todo" ? "☑" : "⚡"}</span>
          <span>{toast.text}</span>
          <a href="/admin/ideas" style={{ color: GOLD, fontSize: 12, textDecoration: "underline", whiteSpace: "nowrap" }}>View in Ideas dashboard →</a>
          <button onClick={() => setToast(null)} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
      )}

      {open && (
        <Drawer
          pathname={pathname}
          ideas={ideas}
          loadErr={loadErr}
          locked={!unlocked && !isInternalPath(pathname)}
          onUnlocked={() => { setUnlocked(true); refresh(); }}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------- modal

function Drawer({ pathname, ideas, loadErr, locked, onUnlocked, onClose, onSaved }: {
  pathname: string; ideas: Idea[]; loadErr: string | null;
  /** This device has not passed the passcode yet — ask once, remember it. */
  locked: boolean; onUnlocked: () => void;
  onClose: () => void; onSaved: (kind: SavedKind) => void;
}) {
  const [step, setStep] = useState<"lock" | "capture" | "preview">(locked ? "lock" : "capture");
  const [code, setCode] = useState("");
  const [who, setWho] = useState<AdminWho>("lee");
  const [lockErr, setLockErr] = useState<string | null>(null);

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
  const me = getAdminWho();
  // DO THIS LATER (Lee, 2026-09-02): a to-do, not a build idea. Work or
  // personal; lands in Obsidian under Terry/Todos.md. Saying "this is for my
  // to-do list" is enough — the words are read at save time.
  const [todo, setTodo] = useState<"" | "work" | "personal">("");
  // DRAFTS (Lee, 2026-09-03: "Often times, I need to build this over time").
  // Reopening one keeps its id, so Save continues it rather than duplicating.
  const [editingId, setEditingId] = useState<string | null>(null);
  const drafts = useMemo(() => ideas.filter((i) => isDraft(i) && (!me || i.createdBy.toLowerCase() === me)), [ideas, me]);
  // THE PREVIEW: the drafted markdown, editable. Nothing is saved until Save.
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);

  useEffect(() => { if (step === "capture") ta.current?.focus(); }, [step]);
  const subs = useMemo(() => knownSubcategories(ideas), [ideas]);

  // DRAG. Offset from centre, remembered per browser; double-click the header
  // to recentre. Pointer capture keeps a fast drag from escaping the header.
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try { const v = JSON.parse(localStorage.getItem(POS_KEY) ?? "null") as { x?: unknown; y?: unknown } | null; return v && typeof v.x === "number" && typeof v.y === "number" ? { x: v.x, y: v.y } : { x: 0, y: 0 }; }
    catch { return { x: 0, y: 0 }; }
  });
  const posRef = useRef(pos);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onHeadDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button,a")) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: posRef.current.x, oy: posRef.current.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeadMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = { x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy };
    posRef.current = next;
    setPos(next);
  };
  const onHeadUp = () => {
    if (!drag.current) return;
    drag.current = null;
    try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)); } catch { /* cosmetic */ }
  };
  const recentre = () => { posRef.current = { x: 0, y: 0 }; setPos({ x: 0, y: 0 }); try { localStorage.removeItem(POS_KEY); } catch { /* cosmetic */ } };

  /** The passcode, once per device. */
  const unlock = () => {
    if (unlockAdmin(code, who)) { setLockErr(null); setCode(""); onUnlocked(); setStep("capture"); }
    else setLockErr("That's not it.");
  };

  const body = text.trim();
  const ideaForDraft = () => ({
    title: deriveTitle(body) || (audio ? "Voice note" : ""),
    body,
    categories: cats,
    subcategory: sub.trim(),
    sourcePath: pathname,
    pageTitle: typeof document !== "undefined" ? document.title : "",
  });

  /** Draft (or redraft) the prompt for the preview. Never saves. */
  const runDraft = async (notes?: string) => {
    if (!body || drafting) return;
    setDrafting(true); setErr(null);
    try {
      const r = await draftIdeaPrompt({ data: { ...ideaForDraft(), ...(notes ? { notes } : {}) } });
      setDraft(r.text);
      setStep("preview");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setDrafting(false); }
  };
  const preview = () => void runDraft();
  /** Regenerate, grounded in the draft as it stands — an edit made here, or
   *  fixed off-platform and pasted back, steers the next draft. */
  const regenerate = () => void runDraft(draft.trim()
    ? `THE PREVIOUS DRAFT, EDITED BY ${me ?? "the author"} — keep every decision in it and improve the rest:\n${draft.trim().slice(0, 8000)}`
    : undefined);

  /** Reopen a draft: its words, categories and id come back. */
  const resume = (d: Idea) => {
    setEditingId(d.id); setText(d.body); setCats(d.categories); setSub(d.subcategory);
    if (d.context?.todo === "work" || d.context?.todo === "personal") setTodo(d.context.todo);
    setStep("capture");
  };

  /** SAVE. `asDraft` keeps the words open to come back to. Either way the
   *  idea is safe before AI touches it; the organising runs after, in the
   *  background — title, TLDR, summary, categories (if none chosen) and,
   *  for a finished idea, the prompt. Its failure is logged, never blocking. */
  const save = useCallback((asDraft = false) => {
    // Audio alone is a valid idea: a failed transcript must not lose it.
    if ((!body && !audio) || busy) return;
    setBusy(true); setErr(null);
    const id = editingId ?? newIdeaId();
    // Spoken tag: "put this on my to-do list", "do this later", "personal to-do".
    const spokenTodo = !todo && /\bto[- ]?do\b|\bmy list\b|\bdo (this|it|that) later\b|\bremind me\b/i.test(body)
      ? (/\bpersonal\b|\bhome\b|\bwife\b|\bfamily\b/i.test(body) ? "personal" : "work")
      : "";
    const todoTag = todo || spokenTodo;
    // A previewed (and possibly edited) draft is attached as the prompt.
    const promptMd = !asDraft && step === "preview" && draft.trim() ? draft.trim() : null;
    const kind: SavedKind = asDraft ? "draft" : todoTag ? "todo" : "idea";
    saveIdea({ data: {
      id,
      title: deriveTitle(body) || (audio ? "Voice note" : ""),
      body,
      categories: cats,
      subcategory: sub.trim(),
      status: promptMd ? "DRAFTED" : "IDEA",
      sourcePath: pathname,
      // The exact page, so the prompt can name the screen; the flags AI and
      // Obsidian read; the draft marker while the words are unfinished.
      context: {
        title: typeof document !== "undefined" ? document.title : "",
        href: typeof location !== "undefined" ? location.href : "",
        ...(todoTag ? { todo: todoTag } : {}),
        ...(asDraft ? { draft: "1" } : {}),
      },
      promptMd,
      promptFilename: promptMd ? `${(deriveTitle(body) || "prompt").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}.md` : null,
      createdBy: getAdminWho() ?? "",
      sourceKind: audio ? "voice" : "web",
      attachments: files,
      audioPath: audio?.path ?? null,
      transcriptStatus: audio?.status ?? null,
    } })
      .then(() => {
        onSaved(kind);
        onClose();
        // AI, in the background. A draft gets a title/TLDR only; a finished
        // idea gets the prompt too (unless the preview already made one).
        organizeIdea({ data: { id, draftPrompt: !asDraft && !todoTag && !promptMd } })
          .catch((e) => console.warn("[ideas] organise failed — the idea is saved; redraft it from /admin/ideas", e));
      })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); });
  }, [body, cats, sub, pathname, busy, audio, files, onSaved, onClose, todo, step, draft, editingId]);

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

  // ⌘↵ saves and closes; Esc closes WITHOUT saving — a half-idea resurfacing
  // later is worse than retyping one line (Save draft exists for the rest).
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (step === "lock") unlock(); else save(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    e.stopPropagation(); // never let the page's own shortcuts fire while typing
  };

  // A click outside closes ONLY an empty modal. Lee lost an idea by clicking
  // away mid-sentence (2026-09-03); words on screen stay until Save, Save
  // draft, or a deliberate Esc / ×.
  const onBackdrop = () => { if (!body && !audio && !files.length) onClose(); };

  const canAct = !!body && !busy && !drafting;
  const primary = (on: boolean): React.CSSProperties => ({
    background: on ? GOLD : "transparent", color: on ? "#0B1322" : MUTED,
    border: `1px solid ${on ? GOLD : EDGE}`, borderRadius: 10,
    padding: "7px 16px", fontSize: 13, fontWeight: 800, cursor: on ? "pointer" : "default",
  });
  const secondary: React.CSSProperties = {
    background: "transparent", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 10,
    padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  };

  return (
    <>
    {/* the backdrop: translucent so the page stays readable; a click closes
        an EMPTY modal only — never one with words in it */}
    <div onClick={onBackdrop} style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(3,6,14,0.5)" }} />
    <div
      onKeyDown={onKey}
      role="dialog"
      aria-label="Save for Later"
      style={{
        position: "fixed", left: "50%", top: "50%", zIndex: 2147483001,
        transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
        width: step === "preview" ? "min(720px, 96vw)" : "min(560px, 96vw)", maxHeight: "90vh",
        background: PANEL, border: `1px solid ${GOLD}55`, borderRadius: 16, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.9)",
        display: "flex", flexDirection: "column", fontFamily: "'Rubik', system-ui, sans-serif", color: CREAM,
      }}
    >
      <div
        className="flex items-center gap-2"
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadUp}
        onPointerCancel={onHeadUp}
        onDoubleClick={recentre}
        title="Drag to move · double-click to recentre"
        style={{ padding: "12px 14px", borderBottom: `1px solid ${EDGE}`, cursor: "grab", userSelect: "none", touchAction: "none" }}
      >
        <span style={{ color: MUTED, fontSize: 12, letterSpacing: "-2px" }} aria-hidden>⋮⋮</span>
        <span style={{ color: GOLD }}>⚡</span>
        <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.04em" }}>Save for Later{step === "preview" ? " — preview" : editingId ? " — continuing a draft" : ""}</span>
        {step !== "lock" && <a href="/admin/ideas" style={{ marginLeft: "auto", color: MUTED, fontSize: 11, textDecoration: "underline" }}>all {ideas.length} →</a>}
        <button onClick={onClose} title="Close (Esc)" style={{ marginLeft: step === "lock" ? "auto" : undefined, background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 15 }}>×</button>
      </div>

      <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
        {step === "lock" && (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>Password to use Save for Later on this device — asked once, then remembered.</div>
            <input
              type="password" value={code} autoFocus placeholder="password"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); unlock(); } }}
              style={{ width: "100%", marginTop: 10, background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 10, color: CREAM, fontSize: 15, padding: "9px 12px", outline: "none" }}
            />
            <div className="flex items-center" style={{ gap: 6, marginTop: 10 }}>
              <span style={{ fontSize: 11.5, color: MUTED }}>I am</span>
              {(["lee", "king"] as const).map((w) => (
                <button key={w} onClick={() => setWho(w)}
                  style={{ background: who === w ? GOLD : "transparent", color: who === w ? "#0B1322" : CREAM, border: `1px solid ${who === w ? GOLD : EDGE}`, borderRadius: 999, padding: "3px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                  {w === "lee" ? "Lee" : "King"}
                </button>
              ))}
            </div>
            {lockErr && <div style={{ color: "#F87171", fontSize: 12, marginTop: 8 }}>{lockErr}</div>}
          </>
        )}

        {step === "capture" && (
          <>
            {drafts.length > 0 && !editingId && (
              <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: MUTED }}>Your drafts</span>
                {drafts.slice(0, 6).map((d) => (
                  <button key={d.id} onClick={() => resume(d)} title={d.body.slice(0, 200)}
                    style={{ background: "transparent", border: `1px dashed ${GOLD}88`, color: CREAM, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ✎ {d.title || d.body.slice(0, 40) || "(draft)"}
                  </button>
                ))}
              </div>
            )}
            <label style={{ fontSize: 11.5, color: MUTED, display: "block", marginBottom: 6 }}>What's up?</label>
            <textarea
              ref={ta}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder="Say it however it comes out. AI titles it, sums it up and files it after you save."
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
                title="Hold to record — or tap to start and tap again to stop. It transcribes into the box above."
                style={{
                  display: "flex", alignItems: "center", gap: 7, minHeight: 42,
                  background: rec ? "#F8717122" : "transparent",
                  border: `1.5px solid ${rec ? "#F87171" : EDGE}`, color: rec ? "#F87171" : CREAM,
                  borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  touchAction: "none",
                }}
              >
                🎙 {rec ? "Recording — release to stop" : "Hold to dictate"}
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
              <span style={{ fontSize: 10.5, color: MUTED }}>for <span style={{ color: CREAM }}>{pathname}</span>{me ? ` · as ${me}` : ""}</span>
            </div>
            {voiceMsg && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{voiceMsg}</div>}
            {audio && <div style={{ fontSize: 11, color: "#3BF5A0", marginTop: 4 }}>🎙 audio attached — kept whatever the transcript did</div>}
            {files.length > 0 && (
              <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
                {files.map((f) => <div key={f.id}>📎 {f.name}</div>)}
              </div>
            )}

            <div className="flex items-center" style={{ gap: 6, marginTop: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: MUTED }}>Do this later?</span>
              {(["work", "personal"] as const).map((k) => {
                const on = todo === k;
                return (
                  <button key={k} onClick={() => setTodo(on ? "" : k)}
                    title={k === "work" ? "A work to-do — Terry/Todos.md in Obsidian, not the build queue" : "A personal to-do — same note, its own section"}
                    style={{ background: on ? "#3BF5A0" : "transparent", color: on ? "#0B1322" : CREAM, border: `1px solid ${on ? "#3BF5A0" : EDGE}`, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    ☐ {k === "work" ? "Work to-do" : "Personal to-do"}
                  </button>
                );
              })}
              <span style={{ fontSize: 10.5, color: MUTED }}>or just say “to-do list”</span>
            </div>

            {/* Categories are AI's job now; the chips stay for when you already
                know, folded so they never get in the way. */}
            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 11.5, color: MUTED, cursor: "pointer" }}>Category · subcategory <span style={{ opacity: 0.6 }}>optional — AI files it if you skip this</span></summary>
              <div className="flex flex-wrap" style={{ gap: 5, marginTop: 8 }}>
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
              <input
                value={sub} onChange={(e) => setSub(e.target.value)} list="sa-idea-subs"
                placeholder="subcategory — learn page, rep system, practice modal…"
                style={{ width: "100%", marginTop: 8, background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 10, color: CREAM, fontSize: 12.5, padding: "7px 11px", outline: "none" }}
              />
              <datalist id="sa-idea-subs">{subs.map((s) => <option key={s} value={s} />)}</datalist>
            </details>
          </>
        )}

        {step === "preview" && (
          <>
            <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
              <span style={{ color: CREAM, fontWeight: 700 }}>Your words:</span> {body.length > 220 ? `${body.slice(0, 220)}…` : body}
              <button onClick={() => setStep("capture")} style={{ marginLeft: 8, background: "none", border: "none", color: GOLD, cursor: "pointer", fontSize: 11.5, textDecoration: "underline" }}>edit</button>
            </div>
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6 }}>Each part folds. Nothing is saved yet — check it, fix it, then Save.</div>

            <Fold title="TLDR" open>{promptSection(draft, "## TLDR") || <em style={{ color: MUTED }}>none in this draft</em>}</Fold>
            <Fold title="Summary">{promptSection(draft, "## Summary") || <em style={{ color: MUTED }}>none in this draft</em>}</Fold>
            <Fold title="Prompt — edit it here, or paste one back from elsewhere" open>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={14}
                spellCheck={false}
                style={{ width: "100%", background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 10, color: CREAM, fontSize: 12, lineHeight: 1.5, padding: 10, outline: "none", resize: "vertical", fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace" }}
              />
              <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>This is the whole draft — TLDR, Summary, Prompt and Testing checklist are read from it. Regenerate keeps what you changed.</div>
            </Fold>
            <Fold title="Testing checklist">
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{promptSection(draft, "## Testing checklist") || "none in this draft"}</pre>
            </Fold>
          </>
        )}

        {loadErr && <div style={{ color: "#F87171", fontSize: 11, marginTop: 8 }}>{loadErr}</div>}
        {err && <div style={{ color: "#F87171", fontSize: 11.5, marginTop: 8 }}>{err}</div>}
      </div>

      <div className="flex items-center gap-2" style={{ padding: 12, borderTop: `1px solid ${EDGE}`, flexWrap: "wrap" }}>
        {step === "lock" && (
          <button onClick={unlock} disabled={!code.trim()} style={{ ...primary(!!code.trim()), marginLeft: "auto" }}>Unlock</button>
        )}
        {step === "capture" && (
          <>
            <span style={{ fontSize: 10.5, color: MUTED }}>⌘↵ save · Esc close</span>
            <button onClick={preview} disabled={!canAct || !!todo} title={todo ? "To-dos skip the preview — they go straight to Terry's list" : "See the drafted prompt before it is saved"} style={{ ...secondary, marginLeft: "auto", opacity: canAct && !todo ? 1 : 0.5 }}>
              {drafting ? "Drafting…" : "Preview →"}
            </button>
            <button onClick={() => save(true)} disabled={!body || busy} title="Keep it open to come back to — Ctrl+I shows your drafts" style={{ ...secondary, opacity: body && !busy ? 1 : 0.5 }}>
              Save draft
            </button>
            <button onClick={() => save()} disabled={!body || busy} style={primary(!!body && !busy)}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        )}
        {step === "preview" && (
          <>
            <button onClick={() => setStep("capture")} style={secondary}>← Words</button>
            <button onClick={regenerate} disabled={drafting || busy} style={{ ...secondary, opacity: drafting || busy ? 0.5 : 1 }}>{drafting ? "Regenerating…" : "↻ Regenerate"}</button>
            <button onClick={() => save()} disabled={!canAct} style={{ ...primary(canAct), marginLeft: "auto" }}>{busy ? "Saving…" : "Save"}</button>
          </>
        )}
      </div>
    </div>
    </>
  );
}

/** A collapsed section of the preview — click the title to open it. */
function Fold({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} style={{ marginTop: 10, border: `1px solid ${EDGE}`, borderRadius: 10, padding: "8px 12px" }}>
      <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", color: GOLD }}>{title}</summary>
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: CREAM, whiteSpace: "pre-wrap" }}>{children}</div>
    </details>
  );
}
