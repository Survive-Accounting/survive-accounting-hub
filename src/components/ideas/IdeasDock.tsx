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

import { listIdeas, saveIdea, sendIdeaSummary } from "@/lib/ideas.functions";
import { getAdminWho, isAdminUnlocked, type AdminWho } from "@/components/AdminGate";
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
  const show = pathname !== VAULT && (isInternalPath(pathname) || unlocked);
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
  // SEND A SUMMARY (Lee, 2026-09-02): "Show Lee for everyone but me. Just show
  // King for me." Lee's ideas go to King as build updates; anyone else's go
  // to Lee. Off by default — capture stays ten seconds.
  const me = getAdminWho();
  const other: AdminWho = me === "lee" ? "king" : "lee";
  const [sendTo, setSendTo] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  // DO THIS LATER (Lee, 2026-09-02): a to-do, not a build idea. Work or
  // personal. It lands in Obsidian under Terry/Todos.md as a checkbox, not in
  // the build queue. Saying "this is for my to-do list" is enough — the words
  // are read at save time when no chip was clicked.
  const [todo, setTodo] = useState<"" | "work" | "personal">("");

  useEffect(() => { ta.current?.focus(); }, []);
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

  const save = useCallback(() => {
    const body = text.trim();
    // Audio alone is a valid idea: a failed transcript must not lose it.
    if ((!body && !audio) || busy) return;
    setBusy(true); setErr(null);
    const id = newIdeaId();
    // Spoken tag: "put this on my to-do list", "do this later", "personal to-do".
    const spokenTodo = !todo && /\bto[- ]?do\b|\bmy list\b|\bdo (this|it|that) later\b|\bremind me\b/i.test(body)
      ? (/\bpersonal\b|\bhome\b|\bwife\b|\bfamily\b/i.test(body) ? "personal" : "work")
      : "";
    const todoTag = todo || spokenTodo;
    saveIdea({ data: {
      id,
      title: deriveTitle(body) || (audio ? "Voice note" : ""),
      body,
      categories: cats,
      subcategory: sub.trim(),
      status: "IDEA",
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
      promptMd: null,
      promptFilename: null,
      createdBy: getAdminWho() ?? "",
      sourceKind: audio ? "voice" : "web",
      attachments: files,
      audioPath: audio?.path ?? null,
      transcriptStatus: audio?.status ?? null,
    } })
      .then(async () => {
        onSaved();
        if (!sendTo) { onClose(); return; }
        // The idea is saved either way; the summary (drafted first if it
        // has no prompt) is the extra step, and its failure is shown, not
        // swallowed — the idea itself is already safe in the vault.
        setPhase(`Saved. Drafting the prompt and sending to ${other === "king" ? "King" : "Lee"}…`);
        await sendIdeaSummary({ data: { id, to: other } });
        onClose();
      })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setPhase(null); setBusy(false); });
  }, [text, cats, sub, pathname, busy, audio, files, onSaved, onClose, sendTo, other, todo]);

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
        width: "min(560px, 96vw)", maxHeight: "90vh",
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
          Send summary to {other === "king" ? "King" : "Lee"}
          <span style={{ fontSize: 10.5, color: MUTED }}>— TLDR · summary · prompt · checklist, by email (drafts the prompt first)</span>
        </label>

        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 12 }}>
          Saved from <span style={{ color: CREAM }}>{pathname}</span> — captured automatically{me ? ` · as ${me}` : ""}.
        </div>
        {phase && <div style={{ color: "#3BF5A0", fontSize: 11.5, marginTop: 8 }}>{phase}</div>}
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
    </>
  );
}
