// IDEAS BANK — the pill and the floating window. Ctrl+I on every page.
//
// THE ONE RULE THIS OBEYS: banking an idea costs ten seconds. Lee (2026-09-03):
// "first things first, before showing anything, have a few buttons: General
// Idea, Improve this page, To Do List (personal or work), Other (write in).
// Then take me to the hold to dictate and add screenshot. That's it." AI does
// the organising AFTER the save, in the background — title, TLDR, summary,
// categories (re-decided on every organise, not just the first), the project
// and page it belongs to, and the prompt.
//
// NOTHING IS EVER LOST (Lee, 2026-09-03: "I lost everything when I clicked away
// and had to start over"). Four changes make that true:
//   1. Every keystroke mirrors to localStorage (see draft.ts). Closing,
//      navigating, reloading, crashing — the words are still there. The draft
//      is cleared on a successful save or on Discard, and on nothing else.
//   2. THERE IS NO BLANKING BACKDROP. A whisper-thin scrim with
//      pointer-events: none sits over the page so it stays readable AND
//      clickable, and clicking the page can no longer close anything.
//   3. The window floats: drag the titlebar, resize the corner, collapse it to
//      the animated bolt when it is in the way. Geometry is remembered.
//   4. Add screenshot freezes one frame of the screen and lets him drag a box
//      over the thing he is actually looking at.
//
// WHERE: every page of the site. The first time on a device the modal asks
// for the passcode (and who you are — Lee or King) and remembers the device.
// The pill only shows once a device is unlocked, so a student never sees it.
//
// STEPS: lock (once) → kind (the four buttons) → capture → Save, or Save
// draft to come back to. After a save: "Nice! Thanks for helping improve
// Survive." and AI takes it from there.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { listIdeas, organizeIdea, saveIdea } from "@/lib/ideas.functions";
import { getAdminWho, isAdminUnlocked, unlockAdmin, type AdminWho } from "@/components/AdminGate";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { IdeaRecorder, judgeTranscript, shouldTranscribe } from "./voice";
import { uploadIdeaFile, transcribeIdeaAudio } from "./upload";
import {
  CATEGORIES, CATEGORY_LABEL, deriveTitle, isDraft, newIdeaId, unsubmittedCount,
  type Attachment, type Category, type Idea,
} from "./model";
import {
  clampBox, clearDraft, emptyDraft, hasContent, readDraft, shouldReopen, writeDraft,
  type IdeaDraft, type WindowBox,
} from "./draft";
import {
  captureScreen, containedRect, cropToFile, imagesFromClipboard, isCaptureSupported,
  isUsableSelection, mapSelection, normalizeDrag, type Rect, type Shot,
} from "./screenshot";

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

const DISMISS_KEY = "sa-ideas-pill-dismissed";
/** Where the floating window sits and how big it is. Separate from the draft:
 *  geometry is a habit, and it outlives any one idea. */
const BOX_KEY = "sa-ideas-modal-box";
const COLLAPSED_W = 56;

/** The write-in slot in the "File it as" picker. Not a real category — it lands
 *  in the subcategory, where the organiser reads it. */
const OTHER_CATEGORY = "__other";

type SavedKind = "idea" | "todo" | "draft";
/** THE FOUR BUTTONS. */
type Intent = "general" | "page" | "todo" | "other";

function readBox(): WindowBox {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(560, Math.round(vw * 0.96));
  const h = Math.min(640, Math.round(vh * 0.86));
  const fallback: WindowBox = { x: Math.round((vw - w) / 2), y: Math.round(vh * 0.06), w, h };
  try {
    const v = JSON.parse(localStorage.getItem(BOX_KEY) ?? "null") as Partial<WindowBox> | null;
    if (v && typeof v.x === "number" && typeof v.y === "number" && typeof v.w === "number" && typeof v.h === "number") {
      return clampBox(v as WindowBox, vw, vh);
    }
  } catch { /* geometry is cosmetic — a bad value just means the default */ }
  return clampBox(fallback, vw, vh);
}

export function IdeasDock() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [dismissed, setDismissed] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: SavedKind } | null>(null);
  const [who, setWho] = useState<AdminWho | null>(null);

  // ---- THE DRAFT. null until it has been read; the modal never renders
  // against a guess, or the first write would wipe what was saved.
  const [draft, setDraft] = useState<IdeaDraft | null>(null);
  const [draftErr, setDraftErr] = useState<string | null>(null);
  const lastWritten = useRef<string>("");
  const snap = (d: IdeaDraft) => JSON.stringify({ ...d, updatedAt: "" });

  useEffect(() => { try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1"); } catch { /* private mode */ } }, []);

  const refresh = useCallback(() => {
    listIdeas().then((r) => { setIdeas(r.ideas); setLoadErr(null); })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(isAdminUnlocked()); setWho(getAdminWho()); }, [pathname]);
  const listen = pathname !== VAULT;
  const show = listen && (isInternalPath(pathname) || unlocked);
  useEffect(() => { if (show) refresh(); }, [show, refresh]);

  // ---- HYDRATE the draft once the person is known. A draft that was OPEN and
  // has words in it comes straight back — that is the whole fix. An old one
  // does not ambush the page; it waits behind Ctrl+I.
  useEffect(() => {
    const r = readDraft(who);
    setDraftErr(r.error);
    const loaded = r.draft ?? emptyDraft();
    const reopen = shouldReopen(r.draft) && (isInternalPath(pathname) || isAdminUnlocked());
    const next: IdeaDraft = { ...loaded, open: reopen };
    lastWritten.current = snap(next);
    setDraft(next);
    // pathname is deliberately NOT a dependency: re-reading on every navigation
    // would fight the in-memory draft and lose the last few keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  // ---- MIRROR every change. A failure to save is SAID, never swallowed: the
  // whole promise of this modal is that the words are safe.
  useEffect(() => {
    if (!draft) return;
    const s = snap(draft);
    if (s === lastWritten.current) return;
    lastWritten.current = s;
    try { writeDraft(who, draft); setDraftErr(null); }
    catch (e) { setDraftErr(`NOT SAVED on this device — ${e instanceof Error ? e.message : String(e)}. Copy your words somewhere safe.`); }
  }, [draft, who]);

  const patch = useCallback((p: Partial<IdeaDraft>) => setDraft((d) => (d ? { ...d, ...p } : d)), []);
  const openBank = useCallback(() => setDraft((d) => ({ ...(d ?? emptyDraft()), open: true, collapsed: false })), []);
  const discard = useCallback(() => {
    clearDraft(who);
    const fresh = emptyDraft();
    lastWritten.current = snap(fresh);
    setDraft(fresh);
  }, [who]);

  // ⌘I / Ctrl+I from anywhere — the whole point.
  useEffect(() => {
    if (!listen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setDismissed(false);
        try { sessionStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
        openBank();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listen, openBank]);

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
  const open = !!draft?.open;
  const parked = !open && hasContent(draft);

  return (
    <>
      {show && !dismissed && !open && (
        <div style={{ position: "fixed", top: 10, right: 12, zIndex: 2147483000, display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={openBank}
            title={parked ? "Your unfinished idea is waiting — nothing was lost (Ctrl/⌘ I)" : "Ideas Bank (Ctrl/⌘ I) — bank it, get back to work"}
            style={{
              display: "flex", alignItems: "center", gap: 7, background: "rgba(16,26,46,0.94)",
              border: `1px solid ${parked ? GOLD : `${GOLD}66`}`, color: CREAM, borderRadius: 999,
              padding: "5px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Rubik', system-ui, sans-serif", boxShadow: "0 4px 14px -6px rgba(0,0,0,0.8)",
            }}
          >
            <BoltBoil height={13} />
            {parked ? "Draft waiting" : "Ideas Bank"}
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
          <a href="/admin/ideas" style={{ color: GOLD, fontSize: 12, textDecoration: "underline", whiteSpace: "nowrap" }}>View in Ideas Bank →</a>
          <button onClick={() => setToast(null)} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
      )}

      {open && draft && (
        <Drawer
          pathname={pathname}
          ideas={ideas}
          loadErr={loadErr}
          draft={draft}
          draftErr={draftErr}
          who={who}
          patch={patch}
          discard={discard}
          locked={!unlocked && !isInternalPath(pathname)}
          onUnlocked={() => { setUnlocked(true); setWho(getAdminWho()); refresh(); }}
          onClose={() => patch({ open: false })}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

// ------------------------------------------------------- the floating window

function Drawer({ pathname, ideas, loadErr, draft, draftErr, who, patch, discard, locked, onUnlocked, onClose, onSaved }: {
  pathname: string; ideas: Idea[]; loadErr: string | null;
  draft: IdeaDraft; draftErr: string | null; who: AdminWho | null;
  patch: (p: Partial<IdeaDraft>) => void; discard: () => void;
  locked: boolean; onUnlocked: () => void;
  onClose: () => void; onSaved: (kind: SavedKind) => void;
}) {
  const [step, setStep] = useState<"lock" | "kind" | "capture">(locked ? "lock" : draft.step);
  const [code, setCode] = useState("");
  const [asWho, setAsWho] = useState<AdminWho>("lee");
  const [lockErr, setLockErr] = useState<string | null>(null);

  // WHAT KIND — the four buttons. A to-do also carries work/personal; "other"
  // carries a write-in label the organiser treats as the subcategory.
  const intent = draft.intent;
  const todo = draft.todo;
  const other = draft.other;
  const text = draft.text;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [rec, setRec] = useState<IdeaRecorder | null>(null);
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const audio = draft.audio;
  const files = draft.files;
  const [, bump] = useState(0);
  const me = getAdminWho();
  const editingId = draft.editingId;
  const drafts = useMemo(() => ideas.filter((i) => isDraft(i) && (!me || i.createdBy.toLowerCase() === me)), [ideas, me]);
  const pageTitle = typeof document !== "undefined" ? document.title : "";

  useEffect(() => { if (step === "capture") ta.current?.focus(); }, [step]);
  useEffect(() => { if (step !== "lock" && step !== draft.step) patch({ step }); }, [step, draft.step, patch]);

  // ---- SCREENSHOT SELECTOR state. `shot` set = the frozen still is up and the
  // window is out of the way.
  const [shot, setShot] = useState<Shot | null>(null);
  const [shotMsg, setShotMsg] = useState<string | null>(null);
  const [shotBusy, setShotBusy] = useState(false);

  // ---- THE WINDOW. Drag the titlebar, drag the corner, collapse to the bolt.
  const [box, setBox] = useState<WindowBox | null>(null);
  useEffect(() => { setBox(readBox()); }, []);
  const boxRef = useRef<WindowBox | null>(null);
  boxRef.current = box;
  const gesture = useRef<{ kind: "move" | "size"; sx: number; sy: number; b: WindowBox } | null>(null);
  const persistBox = (b: WindowBox) => { try { localStorage.setItem(BOX_KEY, JSON.stringify(b)); } catch { /* cosmetic */ } };

  const startGesture = (kind: "move" | "size") => (e: React.PointerEvent<HTMLElement>) => {
    if (kind === "move" && (e.target as HTMLElement).closest("button,a,input,select")) return;
    if (!boxRef.current) return;
    gesture.current = { kind, sx: e.clientX, sy: e.clientY, b: boxRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGestureMove = (e: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    const next = g.kind === "move"
      ? { ...g.b, x: g.b.x + dx, y: g.b.y + dy }
      : { ...g.b, w: g.b.w + dx, h: g.b.h + dy };
    setBox(clampBox(next, window.innerWidth, window.innerHeight));
  };
  const endGesture = () => {
    if (!gesture.current) return;
    gesture.current = null;
    if (boxRef.current) persistBox(boxRef.current);
  };
  /** Double-click the titlebar puts a lost window back in the middle. */
  const recentre = () => {
    try { localStorage.removeItem(BOX_KEY); } catch { /* cosmetic */ }
    setBox(readBox());
  };

  const unlock = () => {
    if (unlockAdmin(code, asWho)) { setLockErr(null); setCode(""); onUnlocked(); setStep("kind"); }
    else setLockErr("That's not it.");
  };

  const pick = (k: Intent, t: "" | "work" | "personal" = "") => { patch({ intent: k, todo: t, step: "capture" }); setStep("capture"); };

  /** Reopen a draft ROW from the vault: its words and kind come back. */
  const resume = (d: Idea) => {
    const k = d.context?.intent as Intent | undefined;
    patch({
      editingId: d.id, text: d.body,
      intent: k ?? (d.context?.todo ? "todo" : "general"),
      todo: d.context?.todo === "work" || d.context?.todo === "personal" ? d.context.todo : "",
      other: d.context?.other ?? draft.other,
      phased: d.context?.phased === "1",
      step: "capture",
    });
    setStep("capture");
  };

  const body = text.trim();
  const chosenCategory = draft.category && draft.category !== OTHER_CATEGORY ? (draft.category as Category) : null;
  const intentLabel = intent === "page" ? `Improve this page — ${pageTitle || pathname}`
    : intent === "todo" ? `To-do · ${todo || "work"}`
    : intent === "other" ? (other.trim() ? `Other · ${other.trim()}` : "Other")
    : "General idea";

  /** SAVE. The idea is safe before AI touches it; organising runs after, in
   *  two background requests (name and file it; then the prompt). The draft on
   *  this device is cleared ONLY here, once the row is actually written. */
  const save = useCallback((asDraft = false) => {
    if ((!body && !audio) || busy) return;
    setBusy(true); setErr(null);
    const id = editingId ?? newIdeaId();
    // A to-do by button, or by saying so.
    const spokenTodo = intent !== "todo" && /\bto[- ]?do\b|\bmy list\b|\bdo (this|it|that) later\b|\bremind me\b/i.test(body)
      ? (/\bpersonal\b|\bhome\b|\bwife\b|\bfamily\b/i.test(body) ? "personal" : "work")
      : "";
    const todoTag = intent === "todo" ? (todo || "work") : spokenTodo;
    const kind: SavedKind = asDraft ? "draft" : todoTag ? "todo" : "idea";
    // The write-in from "Other (specify)" is the subcategory — the organiser
    // reads it there. The kind-step "Other" write-in still wins if both exist.
    const sub = intent === "other" && other.trim() ? other.trim()
      : draft.category === OTHER_CATEGORY ? draft.otherCategory.trim() : "";
    saveIdea({ data: {
      id,
      title: deriveTitle(body) || (audio ? "Voice note" : ""),
      body,
      // AI's call, every time — UNLESS the author used "File it as", in which
      // case organizeIdea leaves the choice alone (context.authorCategory).
      categories: chosenCategory ? [chosenCategory] : [],
      subcategory: sub,
      status: "IDEA",
      sourcePath: pathname,
      context: {
        title: pageTitle,
        href: typeof location !== "undefined" ? location.href : "",
        intent: intent ?? "general",
        ...(intent === "other" && other.trim() ? { other: other.trim() } : {}),
        ...(draft.category === OTHER_CATEGORY && draft.otherCategory.trim() ? { otherCategory: draft.otherCategory.trim() } : {}),
        ...(chosenCategory ? { authorCategory: "1" } : {}),
        ...(draft.phased ? { phased: "1" } : {}),
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
        discard();               // the row exists — the device draft can go
        onSaved(kind);
        onClose();
        const wantPrompt = !asDraft && !todoTag;
        organizeIdea({ data: { id, draftPrompt: false } })
          .then(() => (wantPrompt ? organizeIdea({ data: { id, organize: false, draftPrompt: true } }) : undefined))
          .catch((e) => console.warn("[ideas] organise failed — the idea is saved; the watch sync or /admin/ideas can draft it", e));
      })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); });
  }, [body, pathname, pageTitle, busy, audio, files, onSaved, onClose, intent, todo, other, editingId, chosenCategory, draft.category, draft.otherCategory, draft.phased, discard]);

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
      const appended = judged.text ? (text.trim() ? `${text.trimEnd()}\n${judged.text}` : judged.text) : text;
      patch({ audio: { path: r.path, status: r.error ? "failed" : judged.status }, text: appended });
      setVoiceMsg(judged.text
        ? "Transcribed — edit it if you like."
        : judged.status === "rejected" ? "That came back as noise — audio saved, type the idea."
        : r.error ? "Transcription failed — audio saved, type the idea."
        : "Nothing usable came back — audio saved.");
    } catch (e) { setVoiceMsg(`Could not save the audio — ${e instanceof Error ? e.message : String(e)}`); }
  };

  const addFiles = useCallback(async (list: Iterable<File>) => {
    for (const f of Array.from(list)) {
      try {
        const a = await uploadIdeaFile(f);
        patch({ files: [...(draft.files ?? []), a] });
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    }
  }, [draft.files, patch]);

  // ---- ADD SCREENSHOT. Freeze one frame, then drag a box over it. When the
  // browser will not capture, it SAYS SO and offers the paste route — it never
  // quietly attaches nothing.
  const addScreenshot = async () => {
    setShotMsg(null);
    if (!isCaptureSupported()) {
      setShotMsg("This browser can't capture the screen. Press Windows+Shift+S (or Cmd+Shift+4 on a Mac), then click in the box above and press Ctrl+V.");
      return;
    }
    setShotBusy(true);
    try {
      const s = await captureScreen();
      setShot(s);
    } catch (e) {
      setShotMsg(`Screen capture didn't happen — ${e instanceof Error ? e.message : String(e)}. Take one with Windows+Shift+S and press Ctrl+V in the box above instead.`);
    } finally { setShotBusy(false); }
  };

  const onRegion = async (region: Rect) => {
    const s = shot;
    setShot(null);
    if (!s) return;
    setShotBusy(true);
    setShotMsg("Uploading the screenshot…");
    try {
      const f = await cropToFile(s, region, `screenshot-${Date.now()}.png`);
      await addFiles([f]);
      setShotMsg("Screenshot attached.");
    } catch (e) {
      setShotMsg(`Screenshot failed — ${e instanceof Error ? e.message : String(e)}`);
    } finally { setShotBusy(false); }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = imagesFromClipboard(e.clipboardData?.items);
    if (!imgs.length) return;
    e.preventDefault();
    setShotMsg(`Pasting ${imgs.length} image${imgs.length === 1 ? "" : "s"}…`);
    void addFiles(imgs).then(() => setShotMsg("Pasted image attached."));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (step === "lock") unlock(); else if (step === "capture") save(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    e.stopPropagation();
  };

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
  const field: React.CSSProperties = {
    background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 8,
    color: CREAM, fontSize: 12, padding: "5px 8px", outline: "none", fontFamily: "inherit",
  };

  if (!box) return null;

  // COLLAPSED: the animated bolt, parked where the window was. Everything typed
  // is still in the draft — this is a fold, not a close.
  if (draft.collapsed) {
    return (
      <button
        onClick={() => patch({ collapsed: false })}
        title="Ideas Bank — your idea is still here. Click to open it back up."
        style={{
          position: "fixed", left: box.x, top: box.y, zIndex: 2147483001,
          width: COLLAPSED_W, height: COLLAPSED_W, borderRadius: 16,
          display: "grid", placeItems: "center", cursor: "pointer",
          background: PANEL, border: `1.5px solid ${GOLD}`, boxShadow: "0 14px 40px -14px rgba(0,0,0,0.9)",
        }}
      >
        <BoltBoil height={30} />
        {hasContent(draft) && (
          <span style={{ position: "absolute", top: -5, right: -5, width: 12, height: 12, borderRadius: 999, background: GOLD, border: `2px solid ${PANEL}` }} />
        )}
      </button>
    );
  }

  return (
    <>
      {/* THE SCRIM IS NOT A BACKDROP. It dims nothing shut: pointer-events are
          off, so the page underneath stays readable, clickable and — the point
          of the screenshot tool — visible. */}
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(3,6,14,0.18)", pointerEvents: "none" }} />

      <div
        onKeyDown={onKey}
        onPaste={onPaste}
        role="dialog"
        aria-label="Ideas Bank"
        style={{
          position: "fixed", left: box.x, top: box.y, width: box.w, height: box.h, zIndex: 2147483001,
          visibility: shot ? "hidden" : "visible",
          background: PANEL, border: `1px solid ${GOLD}55`, borderRadius: 16, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.9)",
          display: "flex", flexDirection: "column", fontFamily: "'Rubik', system-ui, sans-serif", color: CREAM,
        }}
      >
        <div
          className="flex items-center gap-2"
          onPointerDown={startGesture("move")}
          onPointerMove={onGestureMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onDoubleClick={recentre}
          title="Drag to move · double-click to recentre"
          style={{ padding: "10px 12px", borderBottom: `1px solid ${EDGE}`, cursor: "grab", userSelect: "none", touchAction: "none", flex: "0 0 auto" }}
        >
          <span style={{ color: MUTED, fontSize: 12, letterSpacing: "-2px" }} aria-hidden>⋮⋮</span>
          <BoltBoil height={17} />
          <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.04em" }}>Idea Bank{step === "capture" ? ` — ${intentLabel}` : ""}</span>
          {step === "capture" && <button onClick={() => setStep("kind")} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>change</button>}
          {step !== "lock" && <a href="/admin/ideas" style={{ marginLeft: "auto", color: MUTED, fontSize: 11, textDecoration: "underline" }}>all {ideas.length} →</a>}
          <button onClick={() => patch({ collapsed: true })} title="Collapse to the bolt — nothing is lost"
            style={{ marginLeft: step === "lock" ? "auto" : undefined, background: "transparent", border: `1px solid ${EDGE}`, borderRadius: 6, color: MUTED, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "2px 6px" }}>–</button>
          <button onClick={onClose} title="Close (Esc) — your words stay saved" style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 15 }}>×</button>
        </div>

        <div style={{ padding: 14, overflowY: "auto", flex: 1, minHeight: 0 }}>
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
                  <button key={w} onClick={() => setAsWho(w)}
                    style={{ background: asWho === w ? GOLD : "transparent", color: asWho === w ? "#0B1322" : CREAM, border: `1px solid ${asWho === w ? GOLD : EDGE}`, borderRadius: 999, padding: "3px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
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
                    <input value={other} onChange={(e) => patch({ other: e.target.value })} placeholder="write in…"
                      onKeyDown={(e) => { if (e.key === "Enter" && other.trim()) { e.preventDefault(); pick("other"); } }}
                      style={{ ...field, flex: 1, minWidth: 0 }} />
                    <button onClick={() => pick("other")} disabled={!other.trim()} style={{ background: other.trim() ? GOLD : "transparent", color: other.trim() ? "#0B1322" : MUTED, border: `1px solid ${other.trim() ? GOLD : EDGE}`, borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 800, cursor: other.trim() ? "pointer" : "default" }}>go</button>
                  </div>
                </div>
              </div>
              {hasContent(draft) && (
                <button onClick={() => setStep("capture")} style={{ ...secondary, marginTop: 12, borderColor: GOLD, width: "100%" }}>
                  ↩ Back to what you were writing — “{(draft.text.trim() || "your attachment").slice(0, 48)}”
                </button>
              )}
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
                onChange={(e) => patch({ text: e.target.value })}
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
                <button onClick={() => void addScreenshot()} disabled={shotBusy}
                  title="Freeze the screen, then drag a box around exactly what you're looking at"
                  style={{ minHeight: 42, background: "transparent", border: `1px solid ${EDGE}`, color: CREAM, borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: shotBusy ? "default" : "pointer", opacity: shotBusy ? 0.6 : 1 }}>
                  📷 {shotBusy ? "Working…" : "Add screenshot"}
                </button>
                <input ref={file} type="file" multiple style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files) void addFiles(e.target.files); }} />
                <button onClick={() => file.current?.click()}
                  style={{ minHeight: 42, background: "transparent", border: `1px solid ${EDGE}`, color: CREAM, borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  📎 File
                </button>
              </div>

              {/* FILE IT AS — optional. Left alone, AI files it (and re-files it
                  on every organise). Chosen here, AI leaves it alone. */}
              <div className="flex items-center" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: MUTED }}>File it as</span>
                <select value={draft.category ?? ""} onChange={(e) => patch({ category: e.target.value || null })}
                  title="Optional. Leave it on 'AI files it' and the organiser decides."
                  style={{ ...field, cursor: "pointer" }}>
                  <option value="">AI files it</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  <option value={OTHER_CATEGORY}>Other (specify)</option>
                </select>
                {draft.category === OTHER_CATEGORY && (
                  <input value={draft.otherCategory} onChange={(e) => patch({ otherCategory: e.target.value })}
                    placeholder="what should it be filed as?" autoFocus
                    style={{ ...field, flex: 1, minWidth: 140 }} />
                )}
              </div>

              {/* SPLIT INTO PHASES — no splitting happens here; the saved prompt
                  gets an instruction telling Claude Code to ask Lee first. */}
              <label className="flex items-center" style={{ gap: 8, marginTop: 10, fontSize: 12, color: CREAM, cursor: "pointer" }}>
                <input type="checkbox" checked={draft.phased} onChange={(e) => patch({ phased: e.target.checked })} />
                <span>Split into phases <span style={{ color: MUTED }}>— Claude Code asks whether to build it all at once or one phase at a time</span></span>
              </label>

              {voiceMsg && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{voiceMsg}</div>}
              {shotMsg && <div style={{ fontSize: 11.5, color: shotMsg.includes("didn't") || shotMsg.includes("failed") || shotMsg.includes("can't") ? "#F87171" : MUTED, marginTop: 6, lineHeight: 1.4 }}>{shotMsg}</div>}
              {audio && <div style={{ fontSize: 11, color: "#3BF5A0", marginTop: 4 }}>🎙 audio attached — kept whatever the transcript did</div>}
              {files.length > 0 && (
                <div className="flex" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {files.map((f) => (
                    <div key={f.id} style={{ border: `1px solid ${EDGE}`, borderRadius: 8, padding: 4, maxWidth: 132 }}>
                      {f.mime.startsWith("image/")
                        ? <img src={f.url} alt={f.name} style={{ display: "block", width: 120, height: 68, objectFit: "cover", borderRadius: 5 }} />
                        : <div style={{ fontSize: 11, color: MUTED, padding: "8px 4px" }}>📎 {f.name}</div>}
                      <div style={{ fontSize: 9, color: MUTED, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                      <button onClick={() => patch({ files: files.filter((x) => x.id !== f.id) })}
                        style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 10, textDecoration: "underline", padding: 0 }}>remove</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {draftErr && <div style={{ color: "#F87171", fontSize: 11.5, marginTop: 8 }}>{draftErr}</div>}
          {loadErr && <div style={{ color: "#F87171", fontSize: 11, marginTop: 8 }}>{loadErr}</div>}
          {err && <div style={{ color: "#F87171", fontSize: 11.5, marginTop: 8 }}>{err}</div>}
        </div>

        {step !== "kind" && (
          <div className="flex items-center gap-2" style={{ padding: 12, borderTop: `1px solid ${EDGE}`, flexWrap: "wrap", flex: "0 0 auto" }}>
            {step === "lock" && (
              <button onClick={unlock} disabled={!code.trim()} style={{ ...primary(!!code.trim()), marginLeft: "auto" }}>Unlock</button>
            )}
            {step === "capture" && (
              <>
                <span style={{ fontSize: 10.5, color: MUTED }}>⌘↵ save · Esc hides it, keeps it{me ? ` · as ${me}` : ""}</span>
                <button
                  onClick={() => { if (!confirmDiscard) { setConfirmDiscard(true); return; } discard(); setConfirmDiscard(false); setStep("kind"); onClose(); }}
                  onBlur={() => setConfirmDiscard(false)}
                  title="Throw this away for good — the only thing that erases it besides saving"
                  style={{ ...secondary, marginLeft: "auto", color: confirmDiscard ? "#F87171" : MUTED, borderColor: confirmDiscard ? "#F87171" : EDGE }}>
                  {confirmDiscard ? "Really discard?" : "Discard"}
                </button>
                <button onClick={() => save(true)} disabled={!body || busy} title="Keep it open to come back to — Ctrl+I shows your drafts" style={{ ...secondary, opacity: body && !busy ? 1 : 0.5 }}>
                  Save draft
                </button>
                <button onClick={() => save()} disabled={!body || busy} style={primary(!!body && !busy)}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
        )}

        {/* RESIZE — bottom-right corner, 400x300 to 90vw x 90vh. */}
        <div
          onPointerDown={startGesture("size")}
          onPointerMove={onGestureMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          title="Drag to resize"
          style={{
            position: "absolute", right: 0, bottom: 0, width: 20, height: 20,
            cursor: "nwse-resize", touchAction: "none",
            background: `linear-gradient(135deg, transparent 50%, ${GOLD}77 50%)`,
            borderBottomRightRadius: 16,
          }}
        />
      </div>

      {shot && <ShotSelector shot={shot} onCancel={() => { setShot(null); setShotMsg("Screenshot cancelled — nothing was attached."); }} onPick={(r) => void onRegion(r)} />}
    </>
  );
}

// ------------------------------------------------------- screenshot selector

/** The frozen still, full screen, with a crosshair. Dragging a box over the
 *  STILL — not over the live page — is what makes the crop right no matter
 *  which surface the browser share dialog handed over. */
function ShotSelector({ shot, onCancel, onPick }: { shot: Shot; onCancel: () => void; onPick: (r: Rect) => void }) {
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);
  const [to, setTo] = useState<{ x: number; y: number } | null>(null);
  const [tooSmall, setTooSmall] = useState(false);

  useEffect(() => {
    const sync = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const displayed = containedRect({ w: shot.width, h: shot.height }, vp);
  const sel = from && to ? normalizeDrag(from, to) : null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2147483005, cursor: "crosshair",
        background: "rgba(3,6,14,0.72)", touchAction: "none", userSelect: "none",
        fontFamily: "'Rubik', system-ui, sans-serif",
      }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setTooSmall(false); setFrom({ x: e.clientX, y: e.clientY }); setTo({ x: e.clientX, y: e.clientY }); }}
      onPointerMove={(e) => { if (from) setTo({ x: e.clientX, y: e.clientY }); }}
      onPointerUp={() => {
        if (!sel) return;
        if (!isUsableSelection(sel)) { setTooSmall(true); setFrom(null); setTo(null); return; }
        onPick(mapSelection(sel, displayed, { w: shot.width, h: shot.height }));
      }}
    >
      {vp.w > 0 && (
        <img src={shot.dataUrl} alt="" draggable={false}
          style={{ position: "absolute", left: displayed.x, top: displayed.y, width: displayed.w, height: displayed.h, pointerEvents: "none" }} />
      )}
      {sel && sel.w > 0 && sel.h > 0 && (
        <div style={{
          position: "absolute", left: sel.x, top: sel.y, width: sel.w, height: sel.h,
          border: `2px solid ${GOLD}`, background: "rgba(252,163,17,0.12)", pointerEvents: "none",
          boxShadow: "0 0 0 9999px rgba(3,6,14,0.45)",
        }} />
      )}
      <div style={{
        position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
        background: PANEL, border: `1px solid ${GOLD}`, borderRadius: 12, color: CREAM,
        padding: "9px 16px", fontSize: 13, fontWeight: 700, pointerEvents: "none",
        boxShadow: "0 18px 50px -14px rgba(0,0,0,0.9)", display: "flex", alignItems: "center", gap: 9,
      }}>
        <BoltBoil height={16} />
        {tooSmall ? "That was a click, not a box — drag across the part you want." : "Drag a box around what you want. Esc cancels."}
      </div>
    </div>
  );
}
