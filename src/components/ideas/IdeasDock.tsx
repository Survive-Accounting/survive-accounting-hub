// IDEAS TO SAVE — the pill and the drawer. Global on every internal surface.
//
// THE ONE RULE THIS OBEYS: capture costs ten seconds. Open (⌘I), type, save
// (⌘↵). Nothing else is required — no category, no title, no prompt. Every
// other field is there for later, and later is optional.
//
// A CENTRED, DRAGGABLE MODAL (Lee, 2026-09-02: "pop up in the center, with a
// modal, so I can spit out an idea rapidly and move on" — and "drag it around").
// It started life as a right-hand drawer so the page stayed visible; the
// modal's backdrop is translucent and the box drags out of the way, which
// keeps that. Position is remembered per browser.
//
// WHERE IT SHOWS: every internal surface, and — once this browser has passed
// the AdminGate — every page of the site, /v3 included. The filming laptop
// captures on /v3; the build machine turns the capture into prompts on
// /admin/ideas.
//
// It never generates anything. Lee writes prompts with Claude elsewhere and
// uploads the .md here; this is a vault, not an author.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { draftIdeaPrompt, listIdeas, saveIdea, sendIdeaSummary } from "@/lib/ideas.functions";
import { ideaUpdateText, promptSection } from "@/lib/ideas-prompt";
import { getAdminWho, isAdminUnlocked, unlockAdmin, type AdminWho } from "@/components/AdminGate";
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
const POS_KEY = "sa-ideas-modal-pos";

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

  // Unlocked admins get the dock EVERYWHERE (V3, the public site) — the
  // flag is read per navigation so unlocking the gate lights it up at once.
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(isAdminUnlocked()); }, [pathname]);
  // The shortcut listens on EVERY page (Lee, 2026-09-03: "verify that this
  // actually works on any pages … just require the password"). The pill only
  // shows once this device is unlocked, so a student never sees it; the modal
  // itself asks for the passcode the first time and remembers the device.
  const listen = pathname !== VAULT;
  const show = listen && (isInternalPath(pathname) || unlocked);
  useEffect(() => { if (show) refresh(); }, [show, refresh]);

  // ⌘I / Ctrl+I from anywhere in admin — the whole point. If capturing needs
  // the mouse it will not happen mid-task.
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

      {open && (
        <Drawer
          pathname={pathname}
          ideas={ideas}
          loadErr={loadErr}
          locked={!unlocked && !isInternalPath(pathname)}
          onUnlocked={() => { setUnlocked(true); refresh(); }}
          onClose={() => setOpen(false)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ drawer

function Drawer({ pathname, ideas, loadErr, locked, onUnlocked, onClose, onSaved }: {
  pathname: string; ideas: Idea[]; loadErr: string | null;
  /** This device has not passed the passcode yet — ask once, remember it. */
  locked: boolean; onUnlocked: () => void;
  onClose: () => void; onSaved: () => void;
}) {
  // THREE STEPS. lock (once per device) → capture (ten seconds) → preview
  // (optional: see the TLDR, summary, prompt and checklist before saving, edit
  // the prompt, regenerate, then save or save-and-send). Lee, 2026-09-03: the
  // preview is what lets King check an idea came out right before it goes.
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
  // SEND A SUMMARY (Lee, 2026-09-02): "Show Lee for everyone but me. Just show
  // King for me." Lee's ideas go to King as build updates; anyone else's go
  // to Lee. Off by default — capture stays ten seconds.
  const me = getAdminWho();
  const other: AdminWho = me === "lee" ? "king" : "lee";
  const otherName = other === "king" ? "King" : "Lee";
  const [sendTo, setSendTo] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  // DO THIS LATER (Lee, 2026-09-02): a to-do, not a build idea. Work or
  // personal. It lands in Obsidian under Terry/Todos.md as a checkbox, not in
  // the build queue. Saying "this is for my to-do list" is enough — the words
  // are read at save time when no chip was clicked.
  const [todo, setTodo] = useState<"" | "work" | "personal">("");
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
  /** Regenerate, grounded in the draft as it stands — so an edit made here,
   *  or fixed off-platform and pasted back, steers the next draft. */
  const regenerate = () => void runDraft(draft.trim()
    ? `THE PREVIOUS DRAFT, EDITED BY ${me ?? "the author"} — keep every decision in it and improve the rest:\n${draft.trim().slice(0, 8000)}`
    : undefined);

  const save = useCallback((send: boolean = sendTo) => {
    // Audio alone is a valid idea: a failed transcript must not lose it.
    if ((!body && !audio) || busy) return;
    setBusy(true); setErr(null);
    const id = newIdeaId();
    // Spoken tag: "put this on my to-do list", "do this later", "personal to-do".
    const spokenTodo = !todo && /\bto[- ]?do\b|\bmy list\b|\bdo (this|it|that) later\b|\bremind me\b/i.test(body)
      ? (/\bpersonal\b|\bhome\b|\bwife\b|\bfamily\b/i.test(body) ? "personal" : "work")
      : "";
    const todoTag = todo || spokenTodo;
    // A previewed (and possibly edited) draft is attached as the prompt.
    const promptMd = step === "preview" && draft.trim() ? draft.trim() : null;
    saveIdea({ data: {
      id,
      title: deriveTitle(body) || (audio ? "Voice note" : ""),
      body,
      categories: cats,
      subcategory: sub.trim(),
      status: promptMd ? "DRAFTED" : "IDEA",
      // Auto-captured: the page it was written from, so a note typed on
      // /blast-off remembers that without Lee saying so.
      sourcePath: pathname,
      // The exact page, so a prompt drafted later can name the screen: the
      // path is the route, the title is what Lee saw in the tab.
      context: {
        title: typeof document !== "undefined" ? document.title : "",
        href: typeof location !== "undefined" ? location.href : "",
        ...(todoTag ? { todo: todoTag } : {}),
      },
      promptMd,
      promptFilename: promptMd ? `${(deriveTitle(body) || "prompt").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}.md` : null,
      createdBy: getAdminWho() ?? "",
      sourceKind: audio ? "voice" : "web",
      attachments: files,
      audioPath: audio?.path ?? null,
      transcriptStatus: audio?.status ?? null,
    } })
      .then(async () => {
        onSaved();
        if (!send) { onClose(); return; }
        // The idea is saved either way; the summary (drafted first if it
        // has no prompt) is the extra step, and its failure is shown, not
        // swallowed — the idea itself is already safe in the vault.
        setPhase(promptMd ? `Saved. Sending to ${otherName}…` : `Saved. Drafting the prompt and sending to ${otherName}…`);
        await sendIdeaSummary({ data: { id, to: other } });
        onClose();
      })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setPhase(null); setBusy(false); });
  }, [body, cats, sub, pathname, busy, audio, files, onSaved, onClose, sendTo, other, otherName, todo, step, draft]);

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
  // later is worse than retyping one line.
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (step === "lock") unlock(); else save(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    e.stopPropagation(); // never let the page's own shortcuts fire while typing
  };

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
    {/* the backdrop: translucent so the page stays readable; click closes */}
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(3,6,14,0.5)" }} />
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
        <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.04em" }}>Save for Later{step === "preview" ? " — preview" : ""}</span>
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

            <label className="flex items-center" style={{ gap: 8, marginTop: 14, cursor: "pointer", fontSize: 12.5, color: CREAM }}>
              <input type="checkbox" checked={sendTo} onChange={(e) => setSendTo(e.target.checked)} style={{ accentColor: GOLD, width: 15, height: 15 }} />
              Send summary to {otherName}
              <span style={{ fontSize: 10.5, color: MUTED }}>— TLDR · summary · prompt · checklist, by email (drafts the prompt first)</span>
            </label>

            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 12 }}>
              Saved from <span style={{ color: CREAM }}>{pathname}</span> — captured automatically{me ? ` · as ${me}` : ""}.
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
              <span style={{ color: CREAM, fontWeight: 700 }}>Your words:</span> {body.length > 220 ? `${body.slice(0, 220)}…` : body}
              <button onClick={() => setStep("capture")} style={{ marginLeft: 8, background: "none", border: "none", color: GOLD, cursor: "pointer", fontSize: 11.5, textDecoration: "underline" }}>edit</button>
            </div>
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6 }}>Each part folds. Nothing is saved yet — check it, fix it, then Save, or Save &amp; send.</div>

            <Fold title="TLDR" open>{promptSection(draft, "## TLDR") || <em style={{ color: MUTED }}>none in this draft</em>}</Fold>
            <Fold title="Summary">{promptSection(draft, "## Summary") || <em style={{ color: MUTED }}>none in this draft</em>}</Fold>
            <Fold title="Prompt — edit it here, or paste one back from elsewhere">
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
            <Fold title={`Email to ${otherName} — exactly as they'll see it`}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, lineHeight: 1.5 }}>
                {ideaUpdateText({ ...ideaForDraft(), promptMd: draft, createdBy: me ?? undefined, appUrl: "https://surviveaccounting.com/admin/ideas" })}
              </pre>
            </Fold>
          </>
        )}

        {phase && <div style={{ color: "#3BF5A0", fontSize: 11.5, marginTop: 8 }}>{phase}</div>}
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
            <button onClick={preview} disabled={!canAct || !!todo} title={todo ? "To-dos skip the preview — they go straight to Terry's list" : "Draft the prompt and check every part before it is saved"} style={{ ...secondary, marginLeft: "auto", opacity: canAct && !todo ? 1 : 0.5 }}>
              {drafting ? "Drafting…" : "Preview →"}
            </button>
            <button onClick={() => save()} disabled={!body || busy} style={primary(!!body && !busy)}>
              {busy ? "Saving…" : sendTo ? `Save & send to ${otherName}` : "Save"}
            </button>
          </>
        )}
        {step === "preview" && (
          <>
            <button onClick={() => setStep("capture")} style={secondary}>← Words</button>
            <button onClick={regenerate} disabled={drafting || busy} style={{ ...secondary, opacity: drafting || busy ? 0.5 : 1 }}>{drafting ? "Regenerating…" : "↻ Regenerate"}</button>
            <button onClick={() => save(false)} disabled={!canAct} style={{ ...secondary, marginLeft: "auto", opacity: canAct ? 1 : 0.5 }}>{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => save(true)} disabled={!canAct} style={primary(canAct)}>{busy ? "Saving…" : `Save & send to ${otherName}`}</button>
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
