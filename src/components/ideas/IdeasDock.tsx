// IDEAS BANK — the pill and the modal. Ctrl+I on every page.
//
// THE ONE RULE THIS OBEYS: banking an idea costs ten seconds. Lee (2026-09-03):
// "first things first, before showing anything, have a few buttons: General
// Idea, Improve this page, To Do List (personal or work), Other (write in).
// Then take me to the hold to dictate and add screenshot. That's it." AI does
// the organising AFTER the save, in the background — title, TLDR, summary,
// categories (re-decided on every organise, not just the first), the project
// and page it belongs to, and the prompt.
//
// A CENTRED, DRAGGABLE MODAL: translucent backdrop so the page stays readable;
// drag the header out of the way; position remembered. A click outside never
// closes a modal with words in it.
//
// WHERE: every page of the site. The first time on a device the modal asks
// for the passcode (and who you are — Lee or King) and remembers the device.
// The pill only shows once a device is unlocked, so a student never sees it.
//
// STEPS: lock (once) → kind (the four buttons) → capture → Save, or Save
// draft to come back to. After a save: "Nice! Thanks for helping improve
// Survive." and AI takes it from there.
//
// THE QUICK QUEUE (2026-09-09). Lee: "Ctrl+I, type, done, no clicking — for shorts ideas
// (offshoots that come to me mid-take)." On the production line (/v3/…) the same hotkey opens a
// ONE-LINE box near the top instead of the modal: Enter saves it pre-tagged SHORTS with the set
// and slide it was had on, Esc closes, Ctrl+Shift+I is the full bank. The pure parts are in
// quick-queue.ts. Off the line nothing changed.
//
// NEVER IN THE SHOT: the 9:16 pop-out (?popout=1) is what OBS window-captures, so this dock
// renders nothing there at all — Ctrl+I in the pop-out is dead; the quick box is the main
// window's. (ProductionTimer keeps the same rule.)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { listIdeas, organizeIdea, saveIdea } from "@/lib/ideas.functions";
import { ADMIN_UNLOCKED_EVENT, getAdminWho, isAdminUnlocked, unlockAdmin, type AdminWho } from "@/components/AdminGate";
import { isPopoutSearch } from "@/components/blastoff/capture/popout";
import { readFilmActive } from "@/components/blastoff/capture/prompter-sync";
import { IdeaRecorder, judgeTranscript, shouldTranscribe } from "./voice";
import { uploadIdeaFile, transcribeIdeaAudio } from "./upload";
import { deriveTitle, isDraft, newIdeaId, unsubmittedCount, type Attachment, type Idea } from "./model";
import { QUICK_PLACEHOLDER, QUICK_RETRY, QUICK_TOAST_MS, ideasHotkey, productionContext, quickIdeaRow, quickToastText } from "./quick-queue";
import { FastTrackSheet } from "./FastTrackSheet";
import { laneDef, shortLaneDef } from "@/lib/strategy";

const GOLD = "#FCA311";
const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const PANEL = "#101A2E";
const EDGE = "rgba(244,239,230,0.16)";

/** Internal surfaces are gated themselves, so the pill shows there without a
 *  separate unlock. Everywhere else the pill waits for the device to unlock. */
const INTERNAL = ["/admin", "/outreach", "/study", "/talkthrough", "/blast-off", "/blastoff-demo", "/exhibit-lab", "/exhibit-demo", "/leeportal", "/callout-demo", "/logo-lab", "/intro-outro", "/practice-demo"];
/** The bank's own page is the one place the pill must NOT appear. */
const VAULT = "/admin/ideas";
export const isInternalPath = (p: string): boolean =>
  p !== VAULT && INTERNAL.some((r) => p === r || p.startsWith(r + "/"));

const POS_KEY = "sa-ideas-modal-pos";

type SavedKind = "idea" | "todo" | "draft" | "strategy" | "quick";
/** THE FOUR BUTTONS — and, since 2026-09-06, the strategy board's. */
type Intent = "general" | "page" | "todo" | "other" | "strategy";

/** OPEN THE MODAL FROM CODE: `window.dispatchEvent(new CustomEvent("sa:ideas", { detail }))`.
 *  The strategy board uses it to start a capture already aimed at a lane, the way
 *  /buildqueue opens the fast track with "sa:fasttrack".
 *  `quick` (2026-09-09) is the one-line box instead of the modal; `context` is merged into the
 *  saved idea's context either way — the production line's set/slide tags ride on it. */
export interface IdeaPreset { intent?: Intent; lane?: string; short?: boolean; quick?: boolean; context?: Record<string, string> }

export function IdeasDock() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // `ms` is how long the toast stays; the modal's saves take the 7 s default, the quick box 2.5.
  const [toast, setToast] = useState<{ text: string; kind: SavedKind; ms?: number } | null>(null);
  const [preset, setPreset] = useState<IdeaPreset | null>(null);
  // THE POP-OUT IS THE SHOT. Decided once on the client (false on the server — the dock's
  // closed render is empty anyway, so hydration has nothing to disagree about).
  const [popout] = useState<boolean>(() => typeof window !== "undefined" && isPopoutSearch(window.location.search));

  const refresh = useCallback(() => {
    listIdeas().then((r) => { setIdeas(r.ideas); setLoadErr(null); })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(isAdminUnlocked()); }, [pathname]);
  // FAST TRACK (Lee, 2026-09-05): Ctrl+F on an unlocked device opens the small-change request.
  // Only once the device is unlocked — a student's Ctrl+F stays the browser's find.
  const [ftOpen, setFtOpen] = useState(false);
  // Not on the vault's own page, and not in the pop-out: no hotkeys, no fetch, nothing.
  const listen = pathname !== VAULT && !popout;
  const show = listen && (isInternalPath(pathname) || unlocked);
  useEffect(() => { if (show) refresh(); }, [show, refresh]);

  // ⌘I / Ctrl+I from anywhere — the whole point. On the production line the plain chord is
  // the quick box and Shift is the modal (quick-queue.ts ideasHotkey); elsewhere both are the
  // modal, as before. The unlock flag is re-read on EVERY open, not only on a route change: an
  // unlock through AdminGate on this page load used to go unheard, and the modal asked again.
  useEffect(() => {
    if (!listen) return;
    const onKey = (e: KeyboardEvent) => {
      const hk = ideasHotkey(e, pathname);
      if (!hk) return;
      e.preventDefault();
      setUnlocked(isAdminUnlocked());
      setPreset(hk === "quick" ? { intent: "general", quick: true, context: productionContext(pathname, readFilmActive()) } : null);
      setOpen(true);
    };
    const onOpen = (e: Event) => { setUnlocked(isAdminUnlocked()); setPreset((e as CustomEvent<IdeaPreset>).detail ?? null); setOpen(true); };
    const onUnlocked = () => setUnlocked(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("sa:ideas", onOpen);
    window.addEventListener(ADMIN_UNLOCKED_EVENT, onUnlocked);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("sa:ideas", onOpen); window.removeEventListener(ADMIN_UNLOCKED_EVENT, onUnlocked); };
  }, [listen, pathname]);
  useEffect(() => {
    if (!listen || !show) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") { e.preventDefault(); setFtOpen(true); }
    };
    const onOpen = () => setFtOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("sa:fasttrack", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("sa:fasttrack", onOpen); };
  }, [listen, show]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.ms ?? 7000);
    return () => clearTimeout(t);
  }, [toast]);
  const onSaved = (kind: SavedKind) => {
    refresh();
    setToast({
      kind,
      text: kind === "todo" ? "Counted. Terry has it on the list."
        : kind === "draft" ? "Draft saved — Ctrl+I brings it back whenever."
        : kind === "strategy" ? "On the strategy board."
        : "Nice! Thanks for helping improve Survive.",
    });
  };

  // THE QUICK SAVE. The box closes and the toast shows BEFORE the network answers — Lee is
  // mid-take and "done" has to mean done. A failure re-opens the box with his words and the
  // retry line; the id is kept, so a retry is the same row (saveIdea upserts on id), never a
  // duplicate when the first request landed but its answer did not.
  const [quickRetry, setQuickRetry] = useState<{ id: string; text: string } | null>(null);
  const submitQuick = useCallback((text: string) => {
    const p = preset;
    const id = quickRetry?.id ?? newIdeaId();
    setOpen(false); setPreset(null); setQuickRetry(null);
    setToast({ kind: "quick", text: quickToastText(text), ms: QUICK_TOAST_MS });
    const row = quickIdeaRow({
      id, text, pathname,
      pageTitle: typeof document !== "undefined" ? document.title : "",
      href: typeof location !== "undefined" ? location.href : "",
      createdBy: getAdminWho() ?? "",
      context: p?.context ?? {},
    });
    saveIdea({ data: row })
      .then(() => {
        refresh();
        // The cheap organise only (title, TLDR, categories). No build prompt: a shorts idea is a
        // video to make, not a thing for Claude Code — the server skips that lane for it too.
        organizeIdea({ data: { id, draftPrompt: false } })
          .catch((e) => console.warn("[ideas] organise failed — the idea is saved; /admin/ideas can file it", e));
      })
      .catch((e) => {
        console.warn("[ideas] quick save failed — the box comes back with the words", e);
        setQuickRetry({ id, text }); setPreset(p); setOpen(true);
      });
  }, [preset, quickRetry, pathname, refresh]);
  const closeQuick = () => { setOpen(false); setPreset(null); setQuickRetry(null); };

  if (popout || !listen) return null;
  const count = unsubmittedCount(ideas);
  // The quick box needs an unlocked device like everything else; locked, it is the modal's
  // lock step (the preset survives it, so the capture step comes up with the same tags).
  const quickOpen = open && !!preset?.quick && (unlocked || isInternalPath(pathname));

  return (
    <>
      {/* NO FLOATING PILL (Lee, 2026-09-03: "Hide the ideas bank floating guy at
          top right. CTRL + i is good enough."). The modal is Ctrl/⌘+I from any
          page; the count lives on /admin/ideas. `show` and `count` stay computed
          for the modal's own header. */}

      <FastTrackSheet open={ftOpen} onClose={() => setFtOpen(false)} pathname={pathname} />
      {toast && (
        <div role="status" style={{
          position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 2147483002,
          background: "#101A2E", border: `1px solid ${GOLD}`, color: CREAM, borderRadius: 14,
          padding: "12px 18px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 13.5, fontWeight: 700,
          boxShadow: "0 18px 50px -14px rgba(0,0,0,0.9)", display: "flex", gap: 12, alignItems: "center",
        }}>
          <span style={{ color: GOLD }}>{toast.kind === "todo" ? "☑" : toast.kind === "quick" ? "🎬" : "⚡"}</span>
          <span>{toast.text}</span>
          <a href={toast.kind === "strategy" ? "/admin/ideas/strategy" : "/admin/ideas"} style={{ color: GOLD, fontSize: 12, textDecoration: "underline", whiteSpace: "nowrap" }}>{toast.kind === "strategy" ? "Open the strategy board →" : "View in Ideas Bank →"}</a>
          <button onClick={() => setToast(null)} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
      )}

      {quickOpen && (
        <QuickBox
          key={quickRetry?.id ?? "fresh"}
          initial={quickRetry?.text ?? ""}
          err={quickRetry ? QUICK_RETRY : null}
          context={preset?.context ?? {}}
          onSubmit={submitQuick}
          onClose={closeQuick}
        />
      )}

      {open && !quickOpen && (
        <Drawer
          pathname={pathname}
          ideas={ideas}
          loadErr={loadErr}
          locked={!unlocked && !isInternalPath(pathname)}
          preset={preset}
          onUnlocked={() => { setUnlocked(true); refresh(); }}
          onClose={() => { setOpen(false); setPreset(null); }}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------- the quick box

/** ONE LINE, NEAR THE TOP — not the middle, so it stays out of the eye line while Lee is
 *  looking at the slide. No backdrop: the page underneath is the take. Every key stops here
 *  (the editor's Space and the film surface's keys must not hear typing). */
function QuickBox({ initial, err, context, onSubmit, onClose }: {
  initial: string; err: string | null; context: Record<string, string>;
  onSubmit: (text: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const where = [context.topic, context.set].filter(Boolean).join(" / ");
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); const t = text.trim(); if (t) onSubmit(t); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  return (
    <div
      role="dialog"
      aria-label="Quick queue"
      style={{
        position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", zIndex: 2147483001,
        width: "min(520px, 94vw)", background: PANEL, border: `1px solid ${GOLD}55`, borderRadius: 14,
        boxShadow: "0 24px 60px -18px rgba(0,0,0,0.9)", padding: "10px 12px",
        fontFamily: "'Rubik', system-ui, sans-serif", color: CREAM,
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onKeyUp={(e) => e.stopPropagation()}
        placeholder={QUICK_PLACEHOLDER}
        aria-label="Short idea"
        style={{ width: "100%", background: "rgba(9,13,26,0.8)", border: `1px solid ${err ? "#F87171" : EDGE}`, borderRadius: 10, color: CREAM, fontSize: 15, padding: "9px 12px", outline: "none", fontFamily: "inherit" }}
      />
      <div className="flex items-center" style={{ gap: 8, marginTop: 6, fontSize: 11, color: MUTED }}>
        <span style={{ color: GOLD, fontWeight: 800, letterSpacing: "0.08em" }}>🎬 SHORTS</span>
        {where && <span title="tagged with the set this came from">{where}</span>}
        {err && <span style={{ color: "#F87171", marginLeft: "auto", fontWeight: 700 }}>{err}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- modal

function Drawer({ pathname, ideas, loadErr, locked, preset, onUnlocked, onClose, onSaved }: {
  pathname: string; ideas: Idea[]; loadErr: string | null;
  locked: boolean; preset?: IdeaPreset | null; onUnlocked: () => void;
  onClose: () => void; onSaved: (kind: SavedKind) => void;
}) {
  // A preset (from "sa:ideas") skips the kind step — the caller already said what this is.
  const [step, setStep] = useState<"lock" | "kind" | "capture">(locked ? "lock" : preset?.intent ? "capture" : "kind");
  const [code, setCode] = useState("");
  const [who, setWho] = useState<AdminWho>("lee");
  const [lockErr, setLockErr] = useState<string | null>(null);

  // WHAT KIND — the four buttons. A to-do also carries work/personal; "other"
  // carries a write-in label the organiser treats as the subcategory.
  const [intent, setIntent] = useState<Intent | null>(preset?.intent ?? null);
  const [todo, setTodo] = useState<"" | "work" | "personal">("");
  const [other, setOther] = useState("");
  // THE STRATEGY BOARD (2026-09-06): which lane of the doc (a note) or which audience (a
  // short) this lands in. Set by the board's preset; a loose Ctrl+I strategy note has none
  // and gets filed from the board.
  const [lane, setLane] = useState(preset?.lane ?? "");
  const [short, setShort] = useState(!!preset?.short);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [rec, setRec] = useState<IdeaRecorder | null>(null);
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const [audio, setAudio] = useState<{ path: string; status: string } | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [, bump] = useState(0);
  const me = getAdminWho();
  const [editingId, setEditingId] = useState<string | null>(null);
  const drafts = useMemo(() => ideas.filter((i) => isDraft(i) && (!me || i.createdBy.toLowerCase() === me)), [ideas, me]);
  const pageTitle = typeof document !== "undefined" ? document.title : "";

  useEffect(() => { if (step === "capture") ta.current?.focus(); }, [step]);

  // DRAG. Offset from centre, remembered per browser; double-click to recentre.
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

  const unlock = () => {
    if (unlockAdmin(code, who)) { setLockErr(null); setCode(""); onUnlocked(); setStep(preset?.intent ? "capture" : "kind"); }
    else setLockErr("That's not it.");
  };

  const pick = (k: Intent, t: "" | "work" | "personal" = "") => { setIntent(k); setTodo(t); setStep("capture"); };

  /** Reopen a draft: its words and kind come back. */
  const resume = (d: Idea) => {
    setEditingId(d.id); setText(d.body);
    const k = d.context?.intent as Intent | undefined;
    setIntent(k ?? (d.context?.todo ? "todo" : "general"));
    if (d.context?.todo === "work" || d.context?.todo === "personal") setTodo(d.context.todo);
    if (d.context?.other) setOther(d.context.other);
    if (d.context?.strategy === "1") { setIntent("strategy"); setLane(d.context.lane ?? ""); setShort(d.context.short === "1"); }
    setStep("capture");
  };
  const laneTitle = lane ? (laneDef(lane)?.title ?? shortLaneDef(lane)?.title ?? lane) : "";

  const body = text.trim();
  const intentLabel = intent === "page" ? `Improve this page — ${pageTitle || pathname}`
    : intent === "todo" ? `To-do · ${todo || "work"}`
    : intent === "other" ? (other.trim() ? `Other · ${other.trim()}` : "Other")
    : intent === "strategy" ? `Strategy${short ? " short" : ""}${laneTitle ? ` · ${laneTitle}` : ""}`
    : "General idea";

  /** SAVE. The idea is safe before AI touches it; organising runs after, in
   *  two background requests (name and file it; then the prompt). */
  const save = useCallback((asDraft = false) => {
    if ((!body && !audio) || busy) return;
    setBusy(true); setErr(null);
    const id = editingId ?? newIdeaId();
    // A to-do by button, or by saying so.
    const spokenTodo = intent !== "todo" && /\bto[- ]?do\b|\bmy list\b|\bdo (this|it|that) later\b|\bremind me\b/i.test(body)
      ? (/\bpersonal\b|\bhome\b|\bwife\b|\bfamily\b/i.test(body) ? "personal" : "work")
      : "";
    const todoTag = intent === "todo" ? (todo || "work") : spokenTodo;
    const kind: SavedKind = asDraft ? "draft" : todoTag ? "todo" : intent === "strategy" ? "strategy" : "idea";
    saveIdea({ data: {
      id,
      title: deriveTitle(body) || (audio ? "Voice note" : ""),
      body,
      categories: [],                    // AI's call, every time
      subcategory: intent === "other" ? other.trim() : intent === "strategy" ? (short ? "Strategy short" : "Strategy note") : "",
      status: "IDEA",
      sourcePath: pathname,
      context: {
        title: pageTitle,
        href: typeof location !== "undefined" ? location.href : "",
        intent: intent ?? "general",
        // The caller's tags (the production line's set/slide, via sa:ideas or the quick preset).
        ...(preset?.context ?? {}),
        ...(intent === "other" && other.trim() ? { other: other.trim() } : {}),
        ...(intent === "strategy" ? { strategy: "1", ...(lane ? { lane } : {}), ...(short ? { short: "1" } : {}) } : {}),
        ...(todoTag ? { todo: todoTag } : {}),
        ...(asDraft ? { draft: "1" } : {}),
      },
      promptMd: null,
      promptFilename: null,
      createdBy: getAdminWho() ?? "",
      sourceKind: audio ? "voice" : "web",
      attachments: files,
      audioPath: audio?.path ?? null,
      transcriptStatus: audio?.status ?? null,
    } })
      .then(() => {
        onSaved(kind);
        onClose();
        // A strategy note is for the doc, not for Claude Code — no build prompt. Nor for a
        // shorts idea (context.shorts = "1"): that is a video to make.
        const wantPrompt = !asDraft && !todoTag && intent !== "strategy" && preset?.context?.shorts !== "1";
        organizeIdea({ data: { id, draftPrompt: false } })
          .then(() => (wantPrompt ? organizeIdea({ data: { id, organize: false, draftPrompt: true } }) : undefined))
          .catch((e) => console.warn("[ideas] organise failed — the idea is saved; the watch sync or /admin/ideas can draft it", e));
      })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); });
  }, [body, pathname, pageTitle, busy, audio, files, onSaved, onClose, intent, todo, other, lane, short, editingId, preset]);

  /** HOLD to talk, or tap-tap for a longer note. */
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
        setVoiceMsg(judged.status === "rejected"
          ? "That came back as noise — audio saved, type the idea."
          : r.error ? "Transcription failed — audio saved, type the idea."
          : "Nothing usable came back — audio saved.");
      }
    } catch (e) { setVoiceMsg(`Could not save the audio — ${e instanceof Error ? e.message : String(e)}`); }
  };

  const addFiles = async (list: FileList | File[]) => {
    for (const f of Array.from(list)) {
      try { const a = await uploadIdeaFile(f); setFiles((v) => [...v, a]); }
      catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    }
  };

  /** Ctrl+V straight into the box (Lee, 2026-09-05: "let's also allow for pasting screenshots"
   *  — Win+Shift+S lands the clipboard image here, no file picker needed). A plain text paste
   *  is left alone so pasting words still works exactly as before. */
  const onPaste = (e: React.ClipboardEvent) => {
    const img = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (!img) return;
    e.preventDefault();
    const f = img.getAsFile();
    if (f) void addFiles([f]);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (step === "lock") unlock(); else if (step === "capture") save(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    e.stopPropagation();
  };
  const onBackdrop = () => { if (!body && !audio && !files.length) onClose(); };

  const primary = (on: boolean): React.CSSProperties => ({
    background: on ? GOLD : "transparent", color: on ? "#0B1322" : MUTED,
    border: `1px solid ${on ? GOLD : EDGE}`, borderRadius: 10,
    padding: "7px 16px", fontSize: 13, fontWeight: 800, cursor: on ? "pointer" : "default",
  });
  const secondary: React.CSSProperties = {
    background: "transparent", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 10,
    padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  };
  const big = (on = false): React.CSSProperties => ({
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
    background: on ? "rgba(252,163,17,0.12)" : "transparent", color: CREAM,
    border: `1.5px solid ${on ? GOLD : EDGE}`, borderRadius: 14, padding: "14px 16px",
    textAlign: "left", cursor: "pointer", minHeight: 74, width: "100%",
  });

  return (
    <>
    <div onClick={onBackdrop} style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(3,6,14,0.5)" }} />
    <div
      onKeyDown={onKey}
      role="dialog"
      aria-label="Ideas Bank"
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
        <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.04em" }}>Ideas Bank{step === "capture" ? ` — ${intentLabel}` : ""}</span>
        {step === "capture" && <button onClick={() => setStep("kind")} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>change</button>}
        {step !== "lock" && <a href="/admin/ideas" style={{ marginLeft: "auto", color: MUTED, fontSize: 11, textDecoration: "underline" }}>all {ideas.length} →</a>}
        <button onClick={onClose} title="Close (Esc)" style={{ marginLeft: step === "lock" ? "auto" : undefined, background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 15 }}>×</button>
      </div>

      <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
        {step === "lock" && (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>Password to use the Ideas Bank on this device — asked once, then remembered.</div>
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

        {step === "kind" && (
          <>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => pick("general")} style={big()}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>💡 General idea</span>
                <span style={{ fontSize: 11.5, color: MUTED }}>Anything, from anywhere. AI files it.</span>
              </button>
              <button onClick={() => pick("page")} style={big()}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>🛠 Improve this page</span>
                <span style={{ fontSize: 11.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{pageTitle || pathname}</span>
              </button>
              <div style={{ ...big(), cursor: "default" }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>☐ To-do list</span>
                <div className="flex" style={{ gap: 6, marginTop: 2 }}>
                  {(["work", "personal"] as const).map((k) => (
                    <button key={k} onClick={() => pick("todo", k)}
                      style={{ background: "transparent", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {k === "work" ? "Work" : "Personal"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ ...big(), cursor: "default" }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>✎ Other</span>
                <div className="flex" style={{ gap: 6, marginTop: 2, width: "100%" }}>
                  <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="write in…"
                    onKeyDown={(e) => { if (e.key === "Enter" && other.trim()) { e.preventDefault(); pick("other"); } }}
                    style={{ flex: 1, minWidth: 0, background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 8, color: CREAM, fontSize: 12, padding: "4px 8px", outline: "none" }} />
                  <button onClick={() => pick("other")} disabled={!other.trim()} style={{ background: other.trim() ? GOLD : "transparent", color: other.trim() ? "#0B1322" : MUTED, border: `1px solid ${other.trim() ? GOLD : EDGE}`, borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 800, cursor: other.trim() ? "pointer" : "default" }}>go</button>
                </div>
              </div>
              {/* THE STRATEGY BOARD (Lee, 2026-09-06: "build this into the idea bank as a new
                  route to brainstorm. CTRL + i can incorporate this too"). A thought for the
                  strategy doc, or a strategy short to film — filed by lane on the board. */}
              <button onClick={() => { setShort(false); pick("strategy"); }} style={{ ...big(), gridColumn: "1 / -1" }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>🧭 Strategy</span>
                <span style={{ fontSize: 11.5, color: MUTED }}>For the strategy & culture doc, or a strategy short to film. Use your words.</span>
              </button>
            </div>
            {drafts.length > 0 && (
              <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginTop: 14 }}>
                <span style={{ fontSize: 11, color: MUTED }}>Your drafts</span>
                {drafts.slice(0, 12).map((d) => (
                  <button key={d.id} onClick={() => resume(d)} title={d.body.slice(0, 200)}
                    style={{ background: "transparent", border: `1px dashed ${GOLD}88`, color: CREAM, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ✎ {d.title || d.body.slice(0, 40) || "(draft)"}
                  </button>
                ))}
                {drafts.length > 12 && <a href="/admin/ideas" style={{ fontSize: 11, color: GOLD, textDecoration: "underline" }}>+{drafts.length - 12} more in the bank →</a>}
              </div>
            )}
          </>
        )}

        {step === "capture" && (
          <>
            <textarea
              ref={ta}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              rows={7}
              placeholder={intent === "todo" ? "What needs doing?" : "Say it however it comes out. Mention the category if you like — AI does the rest."}
              style={{
                width: "100%", background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 10,
                color: CREAM, fontSize: 13.5, lineHeight: 1.45, padding: "10px 12px", outline: "none", resize: "vertical",
                fontFamily: "inherit",
              }}
            />
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
            </div>
            {voiceMsg && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{voiceMsg}</div>}
            {audio && <div style={{ fontSize: 11, color: "#3BF5A0", marginTop: 4 }}>🎙 audio attached — kept whatever the transcript did</div>}
            {files.length > 0 && (
              <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
                {files.map((f) => <div key={f.id}>📎 {f.name}</div>)}
              </div>
            )}
          </>
        )}

        {loadErr && <div style={{ color: "#F87171", fontSize: 11, marginTop: 8 }}>{loadErr}</div>}
        {err && <div style={{ color: "#F87171", fontSize: 11.5, marginTop: 8 }}>{err}</div>}
      </div>

      {step !== "kind" && (
        <div className="flex items-center gap-2" style={{ padding: 12, borderTop: `1px solid ${EDGE}`, flexWrap: "wrap" }}>
          {step === "lock" && (
            <button onClick={unlock} disabled={!code.trim()} style={{ ...primary(!!code.trim()), marginLeft: "auto" }}>Unlock</button>
          )}
          {step === "capture" && (
            <>
              <span style={{ fontSize: 10.5, color: MUTED }}>⌘↵ save · Esc close{me ? ` · as ${me}` : ""}</span>
              <button onClick={() => save(true)} disabled={!body || busy} title="Keep it open to come back to — Ctrl+I shows your drafts" style={{ ...secondary, marginLeft: "auto", opacity: body && !busy ? 1 : 0.5 }}>
                Save draft
              </button>
              <button onClick={() => save()} disabled={!body || busy} style={primary(!!body && !busy)}>
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
    </>
  );
}
