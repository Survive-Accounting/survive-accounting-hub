// CEQ STUDIO (prompt 5) — one panel for day-to-day CEQ authoring, replacing the
// old deck UI's day-to-day use (the deck panel stays untouched). Three panes,
// reusing EXISTING models only: SETS = named CARD decks; QUESTIONS = a set's CEQ
// cards (free stems/choices) with a per-choice CHAIN editor (the prompt-1 model,
// one model / two doors); MEMO LIBRARY = every memo with label + category (incl
// ELEMENT), search/filter, bulk triage for the unfiled pile, and drag-onto-a-choice
// to attach to a chain. No new storage beyond panel prefs.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { BadgeCheck, CheckCircle2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Circle, ClipboardPaste, Clapperboard, Copy, Crown, ExternalLink, FileText, FolderInput, Globe, LayoutGrid, Library, Lightbulb, ListChecks, Loader2, Lock, Play, Plus, Search, Square, Star, Trash2, Unlock, WrapText, X, ArrowUp, ArrowDown, Link2, Film } from "lucide-react";

import { courseLabel, fetchCourseOptions, topicLabel, type CourseOption } from "@/lib/je-api";
import { createChapter } from "@/lib/canvas.functions";

import { addDeck, deckMembersOf, newDeckDef, removeDeck, updateDeck } from "./deck-defs";
import { nextStageOrder } from "./BaseCard";
import { addNodesAndEdgesCmd, addNodesCmd, bus, compositeCmd, patchDataCmd, patchDataFnCmd, removeNodesCmd, type Command, type RfLike } from "./commands";
import { memoAnchorId } from "./MemoLightbulb";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { CeqChainEditor } from "./CeqChainEditor";
import { listChainTemplates } from "./ceq-chain-templates";
import { MemoPickerModal } from "./MemoPickerModal";
import { activeSlots, CeqPreviewer, dealCentre, defaultMemoPos, paletteSlots, rackOf } from "./CeqPreviewer";
import { resolveCardSpot, resolveMemoSpot, stampFromTemplate, templateFor, withInstanceSpot, type Spot } from "./ceq-geom";
import { autoClipName, buildStitch, fmtDur, loadPrefs, readDuration, savePrefs, stageTake, stitchManifest, stitchRuntime, videoFromDrop, videosFromDrop, withPrev, type CeqStudioPrefs } from "./ceq-takes";
import { buildSetExport } from "./ceq-export";
import { SetFilmstrip, type StripItem } from "./SetFilmstrip";
import { checkFilmReadiness, type ReadinessReport } from "./film-readiness";
import { FILM_LOCK_CSS, FilmContext, isTypingTarget } from "./film-lock";
import { MEMO_KIND_META, MEMO_KIND_ORDER, kindFromCategory, type PlaybookKind } from "./memo-kinds";
import { applyToDeck, ceqStitchId, gateBlocks, itemsFromTakes, migrationPlan, newStitch, planReport, publishGate, setStitchId, type MigrationInput, type MigrationPlan, type StitchDef } from "./stitch-defs";
import { StitchPreview } from "./StitchPreview";
import { applyTemplate, loadTemplates, saveTemplate, templateFromDeck, type SetTemplate } from "./set-profile";
import { IdeaBank } from "./IdeaBank";
import { TakesInbox } from "./TakesInbox";
import { type ObsStatus } from "./obs-bridge";
import { attachTargets, currentTakes, saveTake, type TakeRecord, type TakeTarget } from "./takes-store";
import { subscribeSlate, type SlateState } from "./film-slate";
import { assignRunTo, fillDownRuns, normRun, type RunChange } from "./film-runs";
import { isoDay, saveRoomTone, todaysRoomTone } from "./room-tone";
import { resolveWorkerRender, startDissectStitch, type DissectStitchResult } from "@/lib/render-worker.functions";
import { groupedStageElements, type StageElementSpec } from "./stage-elements";
import { MISCONCEPTION_SEEDS, questionMisconceptions, toSlug } from "./ceq-misconceptions";
import { ingestNumOf } from "./ceq-walk";
import { CeqStitch, type StitchRow } from "./CeqStitch";
import { vidCourseMatch, vidTopicMatch } from "./CeqVideoLibrary";
import { DEFAULT_CROSSFADE_MS, WARP_REVERSED_TAIL_S } from "./segment-assembly";
import { detectAuphonicSlots, resolveCeqConcat, resolvePipelineTestAuphonic, startCeqConcat, startPipelineTestAuphonic } from "@/lib/publish.functions";
import { renderStitchViaWorker, wakeRenderWorker } from "./render-worker-client";
import type { LessonBox } from "./types";
import { MEMO_CATEGORIES } from "./cards/MemoCardNode";
import { useFrameNav } from "./FrameNavContext";
import { cardId, type CalloutSettings, type CeqCard, type ChainSound, type CeqChainItem, type CeqChoice, type CeqInstanceGeom, type DeckDef, type DeckLayout, type DeckSlotLayout, type GlobalClips, type TakeRef, type TakeRole } from "./types";
import { NEON } from "./theme";
import { Bolt } from "./brand";
import { Z } from "./z-layers";
import { BufferedInput, BufferedTextarea } from "./ui";

const memoText = (title?: string, body?: string) => ((title && title.trim()) || (body || "").replace(/[*_=~`#>]/g, "").trim() || "memo");
/** A question's ordered CLIP STACK — the new `takes` list, else the legacy single
 *  `take` migrated as a one-item list. The single source of truth for stitch/publish. */
const cardClips = (d?: { takes?: TakeRef[]; take?: TakeRef }): TakeRef[] => (d?.takes && d.takes.length ? d.takes : d?.take ? [d.take] : []);
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);
// Hoisted, not a const arrow — see tdz-hazards.test.ts: a module-scope arrow
// is in a temporal dead zone until the module body reaches it, and a bundler may
// render a component first. This one killed the previewer in production (08-16).
function LETTER(i: number): string { return String.fromCharCode(65 + (i % 26)); }
const NONE = "__uncat__";
const MEMO_DND = "text/sa-studio-memo";
const QREORDER = "text/sa-ceq-qreorder"; // dragging a question ROW to reorder
/** Bulk-action-bar button. 11px floor — this bar carries every row action now, so it has to be
 *  read at a glance rather than decoded from 8px emoji. */
const BULK_BTN = "rounded px-1.5 py-0.5 text-[11px] font-bold";
const SET_DND = "text/sa-ceq-set"; // dragging a SET row onto a topic / the Library

/** Locked-display preview of a stem: each blur range collapses to one ░ block (mirrors the
 *  server-side redaction in fetchStudentTree — keep the two in visual agreement). */
function redactStem(text: string, ranges: { s: number; e: number }[]): string {
  if (!ranges.length) return text;
  const sorted = ranges.slice().sort((a, b) => a.s - b.s);
  let out = "", pos = 0;
  for (const r of sorted) {
    const s = Math.max(0, Math.min(text.length, r.s)), e = Math.max(s, Math.min(text.length, r.e));
    if (s > pos) out += text.slice(pos, s);
    if (e > s) out += "░░░░";
    pos = Math.max(pos, e);
  }
  return out + text.slice(pos);
}
const TABS_SS = "sa-ceq-studio-set-tabs"; // sessionStorage: open set tabs + active (per session)
const LAYOUT_Q0 = "__layout0__"; // Question 0 sentinel — the set BASELINE as an editable stage (never films/stitches/counts/deals)

/** Inline "add a misconception" row (Tools tab): slug + one-line description. */
function NewMisconceptionRow({ onAdd }: { onAdd: (slug: string, description: string) => string | null }) {
  const [slug, setSlug] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <div className="mt-1 flex items-center gap-1">
      <input className="w-28 rounded bg-black/40 px-1.5 py-0.5 text-[9.5px] uppercase outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} placeholder="NEW_SLUG" value={slug} onChange={(e) => setSlug(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <input className="min-w-0 flex-1 rounded bg-black/40 px-1.5 py-0.5 text-[9.5px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} placeholder="one-line description…" value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && onAdd(slug, desc)) { setSlug(""); setDesc(""); } }} />
      <button className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { if (onAdd(slug, desc)) { setSlug(""); setDesc(""); } }}>add</button>
    </div>
  );
}

export function CeqStudio({ decks, setDecks, globalClips, setGlobalClips, initialCeqId, initialSetId, onPopOut, popped, onClose }: { decks: DeckDef[]; setDecks: (fn: (prev: DeckDef[]) => DeckDef[]) => void; globalClips?: GlobalClips; setGlobalClips?: (patch: Partial<GlobalClips>) => void; initialCeqId?: string | null; initialSetId?: string | null; onPopOut?: () => void; popped?: boolean; onClose: () => void }) {
  const gc = globalClips ?? {};
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const nodes = useNodes(); // reactive
  const nav = useFrameNav();
  const cardDecks = decks.filter((d) => d.payloadType === "cards");
  // SET TABS (unified layout) — open sets are internal Studio tabs; the ACTIVE tab is
  // `setId`. Last-open restored per SESSION (sessionStorage, not prefs).
  const [openTabs, setOpenTabs] = useState<string[]>(() => { try { const r = JSON.parse(sessionStorage.getItem(TABS_SS) || "{}") as { open?: string[] }; return Array.isArray(r.open) ? r.open.filter((x): x is string => typeof x === "string") : []; } catch { return []; } });
  const [setId, setSetId] = useState<string | null>(() => { try { const r = JSON.parse(sessionStorage.getItem(TABS_SS) || "{}") as { active?: string }; if (typeof r.active === "string" && cardDecks.some((d) => d.id === r.active)) return r.active; } catch { /* ignore */ } return null; });
  const [qId, setQId] = useState<string | null>(null);
  useEffect(() => { try { sessionStorage.setItem(TABS_SS, JSON.stringify({ open: openTabs, active: setId })); } catch { /* ignore */ } }, [openTabs, setId]);
  /** Open a set as a Studio tab (adds to the strip if absent) and activate it. */
  const openSetTab = (id: string) => { setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id])); setSetId(id); setQId(null); };
  const closeSetTab = (id: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((x) => x !== id);
      if (setId === id) { const at = prev.indexOf(id); setSetId(next[Math.max(0, at - 1)] ?? null); setQId(null); }
      return next;
    });
  };
  const [publishOpen, setPublishOpen] = useState(false);
  /** The dry-run plan awaiting an explicit Apply. Never auto-applies. */
  const [migration, setMigration] = useState<MigrationPlan | null>(null);
  // IN-APP CONFIRM (memo paths) — replaces window.confirm so it themes + works in the popout.
  const [confirmBox, setConfirmBox] = useState<{ msg: string; onYes: () => void } | null>(null); // the Publish panel (per active set)
  // PUBLISH FREE+FULL COMBO — preflight checklist → confirm → sequential publish.
  const [combo, setCombo] = useState<{ free: "pending" | "running" | "done" | "error"; full: "pending" | "running" | "done" | "error"; running: boolean } | null>(null);
  // RENDER WORKER preflight (Fly ffmpeg worker) — probed when the Publish panel
  // opens. Three states the checklist distinguishes: not configured (legacy Mux
  // concat fallback, non-blocking), healthy (renders on the worker), and
  // configured-but-unreachable (BLOCKS — never a silent fallback once opted in).
  const [workerState, setWorkerState] = useState<{ configured: boolean; healthy: boolean; detail: string } | null>(null);
  useEffect(() => {
    if (!publishOpen) return;
    setWorkerState(null);
    // wakeRenderWorker retries "unreachable" for ~30s — the worker self-exits
    // when idle, so the first probe after a break has to ride out a cold start.
    void wakeRenderWorker((n) => setWorkerState({ configured: true, healthy: false, detail: n }))
      .then(setWorkerState)
      .catch((e) => setWorkerState({ configured: true, healthy: false, detail: e instanceof Error ? e.message : String(e) }));
  }, [publishOpen]);
  useEffect(() => { if (!publishOpen) setCombo(null); }, [publishOpen]);
  useEffect(() => { setCombo(null); }, [setId]);
  // OPEN FROM A CEQ (Lee) — pre-select the set (its deck) + that question.
  useEffect(() => {
    if (!initialCeqId) return;
    const n = rf.getNode(initialCeqId);
    const deckId = (n?.data as { deckId?: string } | undefined)?.deckId;
    if (deckId && cardDecks.some((d) => d.id === deckId)) { setOpenTabs((p) => (p.includes(deckId) ? p : [...p, deckId])); setSetId(deckId); }
    setQId(initialCeqId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCeqId]);
  // OPEN FROM A SET (Lee — the study-canvas outline launcher) — activate that set,
  // no question preselected. Runs even before any CEQ node is mounted on the canvas.
  useEffect(() => {
    if (!initialSetId) return;
    if (cardDecks.some((d) => d.id === initialSetId)) openSetTab(initialSetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSetId]);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null); // "Ready to film?" panel
  // ADD MENU — anchored to the button but PORTALED to the document body. It used to be
  // an absolutely-positioned child of the strip toolbar, which is `overflow-x-auto`:
  // that clips any child that escapes the row, so the menu rendered behind/under the
  // Studio and was unusable. Portal + fixed coords + the named Z scale fixes it for
  // good (and keeps working when the Studio is popped out to a 2nd window).
  const [addAt, setAddAt] = useState<{ x: number; y: number } | null>(null);
  const addOpen = addAt !== null;
  const [addQuery, setAddQuery] = useState("");
  const openAddMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAddAt(addOpen ? null : { x: r.left, y: r.bottom + 4 });
  };
  const closeAdd = () => { setAddAt(null); setAddQuery(""); };
  /** ELEMENT CLIPBOARD (Lee) — copy a staged element off one frame and paste it onto
   *  another. Holds the card's DATA only (never the node id or its stage spot), so a
   *  paste is always a fresh, independent card: editing the copy can't touch the
   *  original. Session-only, like the memo clipboard. */
  const [elClip, setElClip] = useState<{ label: string; data: Record<string, unknown> } | null>(null);
  /** COMPONENT CLIPBOARD: the staged element currently selected in the previewer
   *  (Ctrl+C copies IT — exact edited form — instead of the frame). */
  const [selStageEl, setSelStageEl] = useState<string | null>(null);
  /** Which clipboard Ctrl+V should prefer — the one Lee filled LAST. */
  const lastClipRef = useRef<"items" | "memos" | "q" | "el" | null>(null);
  // REHEARSAL (film-prep tool 2) — a silent full-screen walkthrough on the SAME
  // surface Recording Mode films (so it renders exactly like the take), plus a tiny
  // corner counter and a 500ms run-boundary interstitial. No recording, no timers.
  const [rehearse, setRehearse] = useState(false);
  const [takesNoteOpen, setTakesNoteOpen] = useState(false); // tool 4 — the set's sticky note
  const [runCard, setRunCard] = useState<string | null>(null); // interstitial text ("B")
  const prevRunRef = useRef<string | undefined>(undefined);
  const runCardTimer = useRef<number | null>(null);
  const [chainFor, setChainFor] = useState<string | null>(null); // CEQ node whose chain editor is open
  // MEMOS-EARN-THEIR-PANEL: chain work is the moment the library earns its screen —
  // opening the chain editor opens the panel alongside it.
  useEffect(() => { if (chainFor) setLibOpen(true); }, [chainFor]);
  const [note, setNote] = useState<string | null>(null);
  const [memoQuery, setMemoQuery] = useState("");
  const [memoSort, setMemoSort] = useState<"recent" | "az">("recent"); // library sort
  const [catFilter, setCatFilter] = useState<Set<string>>(() => new Set([...MEMO_KIND_ORDER, NONE])); // PLAYBOOK (P4): filter by KIND
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [editorOpen, setEditorOpen] = useState(true); // collapsible stem/choices editor
  // MEMOS-EARN-THEIR-PANEL (Krug pass): the library defaults CLOSED — it is the
  // densest panel and is only needed mid-chain-work. It opens itself when the
  // chain editor opens, on "/" (search), and on any explicit open-memo action.
  const [libOpen, setLibOpen] = useState(false);
  // MEMO SPEED PASS (Lee) — quick-add + recent strip + last-used category + search focus.
  const [qaText, setQaText] = useState(""); // quick-add input (Enter creates, no modal)
  const [lastMemoCat, setLastMemoCat] = useState<string>("OTHER TIPS"); // last-used category for quick-add
  const [recentMemoIds, setRecentMemoIds] = useState<string[]>([]); // 5 most recently created/edited/chained
  const touchRecent = (id: string) => setRecentMemoIds((p) => [id, ...p.filter((x) => x !== id)].slice(0, 5));
  const memoSearchRef = useRef<HTMLInputElement>(null);
  const [setsOpen, setSetsOpen] = useState(true); // collapsible sets pane
  // TOPICS SPINE (Lee) — the sets pane is an outline over the REAL Course → Topic
  // model (courses/chapters rows, Manage Course order). No more free-text filters.
  const [assignFor, setAssignFor] = useState<string | null>(null); // deck id whose course/topic picker is open
  const [assignCourseSel, setAssignCourseSel] = useState<string>("lib"); // picker's course selection ("lib" = Library)
  const [newSetForm, setNewSetForm] = useState<{ name: string; courseId: string; topicId: string } | null>(null); // inline New Set form ("" = Library)
  // PAID-DISPLAY BLUR (Lee) — the last text selection inside the STEM textarea, so the "Blur on
  // locked" button can mark it as a redaction range. Tagged with its qid so a stale selection can't
  // mark a different question. Ranges live on CeqCard.blurRanges; they render redacted ONLY on
  // locked/paid surfaces (server-side, fetchStudentTree) — never in Studio or the free tab.
  const [stemSel, setStemSel] = useState<{ qid: string; s: number; e: number } | null>(null);
  const [previewSelMemo, setPreviewSelMemo] = useState<string | null>(null); // memo selected in the previewer
  const [shortsQueueOpen, setShortsQueueOpen] = useState(false); // shorts-worthy worklist overlay
  // RECORDING MODE (#3) — a film-safe filming surface: an opaque navy full-window layer (at
  // the reserved Z.recording tier) that covers ALL Studio chrome and shows only the live CEQ
  // card + reveal state. Toggled by R (enter) / R (exit); the ONLY live keys are the deal /
  // walk / sweep allowlist. The `\` film pop-out is unchanged and separate. Authoring is
  // untouched — this is a second render branch on the same previewer + data.
  const [recording, setRecording] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false); // pointer auto-hides after 1s idle while recording
  const studioRootRef = useRef<HTMLDivElement>(null); // Recording Mode portals to THIS window's body (works popped too)
  const [prefs, setPrefsState] = useState<CeqStudioPrefs>(() => loadPrefs()); // panel prefs (wrap toggle + shared transition)
  const setPrefs = (p: Partial<CeqStudioPrefs>) => setPrefsState((cur) => { const n = { ...cur, ...p }; savePrefs(n); return n; });
  const wrapStems = !!prefs.wrapStems;
  const [takeBusy, setTakeBusy] = useState<string | null>(null); // slot key currently uploading
  // Cursor auto-hide while recording — a parked pointer must never sit in the OBS shot; any
  // movement brings it back for another second.
  useEffect(() => {
    if (!recording) { setCursorHidden(false); return; }
    let t: number | undefined;
    const bump = () => { setCursorHidden(false); if (t) window.clearTimeout(t); t = window.setTimeout(() => setCursorHidden(true), 1000); };
    bump();
    const doc = studioRootRef.current?.ownerDocument ?? document;
    doc.addEventListener("mousemove", bump);
    return () => { doc.removeEventListener("mousemove", bump); if (t) window.clearTimeout(t); };
  }, [recording]);
  // BATCH TAKE INGEST (Lee) — drop N clips → match → CONFIRM table → bulk upload.
  const [ingest, setIngest] = useState<{ file: File; name: string; duration: number; qId: string | null; lookback: boolean; include: boolean; status: "pending" | "uploading" | "done" | "error"; error?: string }[] | null>(null);
  const [ingestBusy, setIngestBusy] = useState(false);
  const ingestFileRef = useRef<HTMLInputElement>(null);
  const [takePreview, setTakePreview] = useState<string | null>(null); // slot key previewed inline (clip stack)
  const [clipRefsOpen, setClipRefsOpen] = useState<string | null>(null); // `${ceqId}:${clipIdx}` whose refs picker is open
  const [starOnly, setStarOnly] = useState(false); // Starred filter on the question list
  // (The per-row "…" action menu is gone — its items live in the bulk bar, reached by selecting
  //  the row. Studio Consolidation B.)
  // BULK QUESTION OPS (Lee) — multi-select question rows + one action bar.
  const [qSel, setQSel] = useState<Set<string>>(() => new Set());
  // DISSECT (P5) — which CEQ's moments editor is open (null = closed).
  const [dissectQ, setDissectQ] = useState<string | null>(null);
  // SMART STITCH — the panel's job state: idle → running (phase note) →
  // preview (fileUrl + manifest, awaiting Finalize) → finalized/cleared.
  const [stitchJob, setStitchJob] = useState<null | { phase: string; running: boolean; fileUrl?: string; path?: string; result?: DissectStitchResult; trims?: ({ start: number; end: number } | null)[] }>(null);
  useEffect(() => { setStitchJob(null); }, [dissectQ]);
  const roomToneRef = useRef<HTMLInputElement>(null);
  /** Run (or re-run with manual trims) the ingest stitch for the open dissect CEQ. */
  const runStitch = (ceqId: string, trims?: ({ start: number; end: number } | null)[]) => { void (async () => {
    const dd = rf.getNode(ceqId)?.data as unknown as CeqCard | undefined;
    const clips = cardClips(dd);
    if (!clips.length) { setStitchJob({ phase: "no clips on this CEQ yet — upload takes first", running: false }); return; }
    setStitchJob({ phase: "enqueuing…", running: true, trims });
    try {
      const rt = todaysRoomTone();
      // SLATE HEADS (F1): a clip filmed with the in-frame slate carries its own
      // exact head trim — deterministic, no guessing.
      const heads = clips.map((c) => (c.slateEndMs != null ? c.slateEndMs / 1000 : null));
      const { jobId, path, machineId } = await startDissectStitch({ data: { urls: clips.map((c) => c.url), ...(rt ? { roomToneUrl: rt.url } : {}), ...(heads.some((h) => h != null) ? { heads } : {}), ...(trims ? { trims } : {}) } });
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        const r = await resolveWorkerRender({ data: { jobId, path, machineId } });
        if (r.state === "error") throw new Error(r.error ?? "worker error");
        if (r.state === "done" && r.fileUrl) { setStitchJob({ phase: "preview ready — play it, re-trim if needed, then Finalize", running: false, fileUrl: r.fileUrl, path, result: r.result ?? undefined, trims: (r.result?.trims as ({ start: number; end: number } | null)[] | undefined) ?? trims }); return; }
        setStitchJob((p) => ({ ...(p ?? { running: true }), phase: r.note || r.state, running: true, trims }));
      }
    } catch (err) { setStitchJob({ phase: "FAILED: " + (err instanceof Error ? err.message : String(err)), running: false, trims }); }
  })(); };
  // LAYOUT REWORK — entering the base frame remembers where to return; leaving
  // it (Done) opens the SAVE-TIME apply choice. Application is author-time only.
  const layoutReturnRef = useRef<string | null>(null);
  const [applyPanel, setApplyPanel] = useState<null | { conform: number; hand: number; opted: number }>(null);
  const enterLayoutEdit = () => { if (qId !== LAYOUT_Q0) layoutReturnRef.current = qId; setQId(LAYOUT_Q0); };
  const exitLayoutEdit = () => {
    const back = layoutReturnRef.current ?? questions[0]?.id ?? null;
    if (back) setQId(back);
    const ds = questions.map((qn) => rf.getNode(qn.id)?.data as unknown as CeqCard | undefined);
    setApplyPanel({
      conform: ds.filter((d) => d && !d.geom && !d.ignoreLayout).length,
      hand: ds.filter((d) => d && !!d.geom && !d.ignoreLayout).length,
      opted: ds.filter((d) => !!d?.ignoreLayout).length,
    });
  };
  // SET PROFILE (P6) — the production-profile panel + templates.
  const [profileOpen, setProfileOpen] = useState(false);
  // IDEA BANK (P7) — null closed · "capture" = the F7 quick popover · "board".
  const [ideaBank, setIdeaBank] = useState<null | "board" | "capture">(null);
  // TAKES INBOX (T1/T2) — the drawer, the armed target, and the OBS status the
  // Studio renders. EVERY status surface here is studio-only: the chip, the
  // recording dot, the armed badge and the countdown never render inside the
  // film popout, the capture window or the Recording Mode portal.
  const [takesOpen, setTakesOpen] = useState(false);
  const [armedTarget, setArmedTarget] = useState<TakeTarget | null>(null);
  /** AUTO-ADVANCE (F1): after a keep, roll straight into the next shot.
   *  Default ON; held back while a dissect CEQ still has unfilmed moments. */
  const [autoAdvance, setAutoAdvance] = useState<boolean>(() => localStorage.getItem("sa-auto-advance") !== "0");
  const [obsState, setObsState] = useState<{ status: ObsStatus; recording: boolean; detail?: string }>({ status: "off", recording: false });
  /** FILMING MODE (F2) — a workspace-level container switch, not a fork. It
   *  re-arranges the SAME surfaces: the spine stays the spine, the takes inbox
   *  becomes an inline rail, and the authoring chrome (stem/choice editor, memo
   *  library, layout tools, tab strip) is simply not rendered. It writes NOTHING
   *  to any set — leaving it puts every surface back exactly as it was. */
  const [filming, setFilming] = useState<boolean>(() => localStorage.getItem("sa-filming-mode") === "1");
  const [binStat, setBinStat] = useState({ count: 0, bytes: 0 });
  // ONE COUNTDOWN (F1): the slate store is the single source — the capture window
  // renders it IN FRAME and the studio MIRRORS it here. There used to be a second,
  // independent studio timer; two clocks meant the studio could show "2" while the
  // trim point was being recorded off the other one.
  const [slate, setSlate] = useState<SlateState>({ count: null, speak: false });
  useEffect(() => subscribeSlate(setSlate), []);
  /** RUN COVERAGE (F1): every frame walked while OBS rolls, so a blast across a run
   *  attaches to ALL of them — not just where it started and where it stopped. */
  const coveredRef = useRef<string[]>([]);
  const onRecordStart = useCallback(() => { coveredRef.current = []; }, []);
  useEffect(() => {
    if (!obsState.recording || !qId || qId === LAYOUT_Q0) return;
    if (!coveredRef.current.includes(qId)) coveredRef.current = [...coveredRef.current, qId];
  }, [qId, obsState.recording]);
  /** Arm from the spine selection (or the open frame) — T2. */
  const armFromSelection = () => {
    const ids = qSel.size ? questions.filter((q) => qSel.has(q.id)).map((q) => q.id) : qId && qId !== LAYOUT_Q0 ? [qId] : [];
    if (!ids.length) { setNote("Select frames in the spine (or open one) to arm uploads."); return; }
    const first = rf.getNode(ids[0])?.data as unknown as CeqCard | undefined;
    const runLetter = first?.run?.trim();
    const kind: TakeTarget["kind"] = ids.length === 1 ? "ceq" : runLetter && ids.every((iid) => ((rf.getNode(iid)?.data as unknown as CeqCard | undefined)?.run ?? "").trim() === runLetter) ? "run" : "range";
    const label = kind === "run" ? "run " + runLetter : kind === "ceq" ? (first?.shorthand || "1 frame") : ids.length + " frames";
    setArmedTarget({ kind, ids, label });
    setTakesOpen(true);
    setNote("ARMED → " + label + " · takes that finish now bank against it.");
  };
  // F8 = quick capture, OUTSIDE film mode only: dead while recording/rehearsing
  // (the film controller owns the keyboard — that's what the notepad is for),
  // and the film popout is a separate window this listener never sees.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F7" || recording) return; // F7 (moved off F8 — takes triage owns that)
      if (isTypingTarget()) return;
      e.preventDefault();
      setIdeaBank((v) => (v ? null : "capture"));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);
  const [tplList, setTplList] = useState<SetTemplate[]>(() => loadTemplates());
  const lastQSelRef = useRef<string | null>(null);
  // Switching sets (tab click, chip jump, session restore) DROPS the selection — the
  // bar must never stay armed with the previous set's questions (bulkPatchQ resolves
  // ids scene-wide, so a stale qSel would silently mutate cards that aren't on screen).
  useEffect(() => { setQSel((prev) => (prev.size > 0 ? new Set<string>() : prev)); lastQSelRef.current = null; }, [setId]);
  const toggleQSel = (id: string, shift: boolean) => {
    setQSel((prev) => {
      const n = new Set(prev);
      if (shift && lastQSelRef.current) {
        const ids = questions.map((q) => q.id);
        const a = ids.indexOf(lastQSelRef.current), b = ids.indexOf(id);
        if (a >= 0 && b >= 0) { for (let i = Math.min(a, b); i <= Math.max(a, b); i++) n.add(ids[i]); lastQSelRef.current = id; return n; }
      }
      n.has(id) ? n.delete(id) : n.add(id);
      lastQSelRef.current = id;
      return n;
    });
  };
  const [dragKey, setDragKey] = useState<string | null>(null); // slot key a clip is hovering
  const [publishBusy, setPublishBusy] = useState<"free" | "full" | null>(null);
  const [expandedQ, setExpandedQ] = useState<Set<string>>(new Set()); // questions whose memo list stays shown
  const [selChainMemos, setSelChainMemos] = useState<Set<string>>(new Set()); // outline memo selection (memoNodeId)
  const [memoClip, setMemoClip] = useState<{ label: string; title: string; body: string; memoKind: string; category: string; subcategory: string; x: number; y: number; scale: number; choiceIdx: number }[]>([]); // copied chain memos
  const [itemsClip, setItemsClip] = useState<{ memoNodeId: string; choiceIdx: number; label: string; title: string; body: string; memoKind: string; category: string; subcategory: string; sound?: ChainSound; hideChoiceLabel?: boolean; hideArrow?: boolean }[]>([]); // "copy items" clipboard (memos, for new/exact paste)
  const [qClip, setQClip] = useState<{ prompt: string; scale: number; noteOnly?: boolean; callout?: CalloutSettings; run?: string; choices: { text: string; correct?: boolean }[]; memos: { label: string; title: string; body: string; memoKind: string; category: string; subcategory: string; x: number; y: number; scale: number; choiceIdx: number }[] }[] | null>(null); // FRAME CLIPBOARD (spine): copied frames, in spine order; choiceIdx -1 = stem chain
  // MEMO WORKFLOW (Lee) — the +💡 picker modal, inline edits (replacing prompt()),
  // bulk-field inline entry, and the library scope filter (question|set|all).
  const [pickModal, setPickModal] = useState<{ ceqId: string; choiceId: string } | null>(null); // +💡 add-memo modal target
  const [editMemo, setEditMemo] = useState<string | null>(null); // library row being inline-renamed
  const [editMemoVal, setEditMemoVal] = useState("");
  const [editChain, setEditChain] = useState<string | null>(null); // chain-memo row being inline-renamed (key ceqId|choiceId|idx)
  const [editChainVal, setEditChainVal] = useState("");
  const [bulkField, setBulkField] = useState<{ field: "subcategory" | "label" | "course"; label: string } | null>(null); // inline bulk-field entry
  const [bulkVal, setBulkVal] = useState("");
  const [justCreated, setJustCreated] = useState<Set<string>>(() => new Set()); // fresh (unchained) memos kept visible past the scope filter
  const memoScope: "question" | "set" | "all" = prefs.memoScope ?? "set"; // default: This set
  // Legacy stored "sets" maps to the merged Topics tab; the old union stays in the
  // prefs type so old localStorage blobs keep parsing.
  // Legacy pref values map forward: "sets" folded into Topics long ago; "tools"
  // became STUDENT (Lee: that tab is for student-facing previews, not authoring).
  // The Studio's Topics tab was retired — the leftmost dashboard OutlinePanel is the ONE topic/set
  // navigation now. Legacy stored prefs ("sets"/"topics"/undefined) fold forward to Videos (the CEQ
  // editor), "tools" → Student. Preview keeps its own left-rail set switcher (see 1977 block).
  const topTab: "videos" | "preview" | "student" =
    prefs.topTab === "preview" || prefs.topTab === "student" ? prefs.topTab : prefs.topTab === "tools" ? "student" : "videos";
  const wrapMemos = !!prefs.wrapMemos;

  // TOPICS SPINE (Lee) — the real Course → Topic rows (Manage Course order), same
  // fetch path the canvas uses everywhere else.
  const courseOptionsQ = useQuery({ queryKey: ["course-options"], queryFn: () => fetchCourseOptions(), staleTime: 600_000, networkMode: "always" });
  const courseOptions = useMemo(() => courseOptionsQ.data ?? [], [courseOptionsQ.data]);
  // ONE-TIME MIGRATION — decks that predate the spine (courseId strictly undefined)
  // are matched by their legacy free-text tags: course string → course row (name/code,
  // "Foundations" falls back to the foundations-family / "Start Here" course), then
  // "Ch N" → that course's ACTIVE chapter with number N. Unmatchable ⇒ Library (null).
  // Idempotent: after this pass courseId/topicId are string-or-null, never undefined.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current || courseOptions.length === 0) return;
    const pending = decks.filter((d) => d.payloadType === "cards" && d.courseId === undefined && d.topicId === undefined);
    migratedRef.current = true;
    if (pending.length === 0) return;
    const report: string[] = [];
    setDecks((prev) => prev.map((d) => {
      if (d.payloadType !== "cards" || d.courseId !== undefined || d.topicId !== undefined) return d;
      const cstr = (d.course ?? "").trim().toLowerCase();
      const course = courseOptions.find((c) => (c.course_name ?? "").toLowerCase() === cstr || (c.code ?? "").toLowerCase() === cstr)
        ?? (cstr === "foundations" ? courseOptions.find((c) => c.course_family === "foundations" || /start\s*here/i.test(c.course_name ?? "")) : undefined);
      const chNum = /ch\s*\.?\s*(\d+)/i.exec(d.chapter ?? "")?.[1];
      const topic = course && chNum ? course.chapters.find((ch) => ch.number === Number(chNum) && ch.status !== "archived") : undefined;
      if (course && topic) { report.push(`"${d.name}" → ${courseLabel(course)} / ${topicLabel(topic)}`); return { ...d, courseId: course.id, topicId: topic.id }; }
      report.push(`"${d.name}" → Library (unmatched: ${d.course ?? "no course"} · ${d.chapter ?? "no chapter"})`);
      return { ...d, courseId: course?.id ?? null, topicId: null };
    }));
    console.info(`[CEQ Studio] topics-spine migration (${pending.length} sets):\n${report.join("\n")}`);
    setNote(`Organized ${pending.length} set${pending.length === 1 ? "" : "s"} under Course → Topic — mapping in the console. Unmatched sets are in the Library.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseOptions, decks]);
  /** Assign / reassign a set. null topic ⇒ Library. Keeps the legacy course/chapter
   *  display tags in sync (the publish passthrough still reads them). */
  const assignSet = (deckId: string, course: CourseOption | null, topic: CourseOption["chapters"][number] | null) => {
    setDecks((prev) => updateDeck(prev, deckId, {
      courseId: course?.id ?? null,
      topicId: topic?.id ?? null,
      ...(course ? { course: courseLabel(course) } : {}),
      ...(topic ? { chapter: `Ch ${topic.number ?? "?"}` } : {}),
    }));
    setAssignFor(null);
    setNote(topic && course ? `Moved set → ${courseLabel(course)} / ${topicLabel(topic)}.` : "Returned set to the Library (unassigned).");
  };
  // OUTLINE SELECTION (Lee) — the last course/topic row clicked, which is what the
  // footer "+ Add" button is context-aware about. Independent of setId (the open SET):
  // clicking a row still toggles its expand state, this just rides along.
  const [outlineSel, setOutlineSel] = useState<{ courseId: string; topicId: string | null } | null>(null);
  const [addMenu, setAddMenu] = useState(false); // the nothing-selected dropdown
  const [newTopicFor, setNewTopicFor] = useState<string | null>(null); // courseId whose inline "new topic" row is open
  const [newTopicName, setNewTopicName] = useState("");
  const qc = useQueryClient();
  /** NEW TOPIC — reuses the SAME server fn Manage course uses (chapter_number is
   *  assigned server-side as max(active)+1, so a new topic lands at the bottom of the
   *  outline, which is exactly what "position = list order" means here). Both course
   *  caches must be invalidated or the 10-minute staleTime hides the new row. */
  const createTopicMut = useMutation({
    mutationFn: (v: { course_id: string; chapter_name: string }) => createChapter({ data: v }),
    onSuccess: (row) => {
      setNewTopicFor(null); setNewTopicName("");
      void qc.invalidateQueries({ queryKey: ["course-options"] });
      void qc.invalidateQueries({ queryKey: ["je-tree"] });
      setNote(`Added topic "${row.chapter_name}" — it's at the end of the course.`);
    },
    onError: (e: unknown) => setNote(`Couldn't add the topic: ${e instanceof Error ? e.message : String(e)}`),
  });
  /** MISCONCEPTIONS — registry (seeds + Lee's custom, prefs-described) and the
   *  read-only derivations. The only WRITE anywhere is the memo's own slug patch. */
  const misconceptionDefs = useMemo(() => {
    const custom = Object.entries(prefs.misconceptions ?? {}).map(([slug, description]) => ({ slug, description }));
    const used = new Set<string>();
    for (const n of nodes) if (n.type === "memo") { const s = (n.data as { misconceptionId?: string }).misconceptionId; if (s) used.add(s); }
    const known = new Set([...MISCONCEPTION_SEEDS.map((d) => d.slug), ...custom.map((d) => d.slug)]);
    const orphans = [...used].filter((s) => !known.has(s)).map((slug) => ({ slug, description: "(no description — add one in Tools)" }));
    return [...MISCONCEPTION_SEEDS, ...custom, ...orphans];
  }, [prefs.misconceptions, nodes]);
  const memoSlugOf = (mid: string) => (rf.getNode(mid)?.data as { misconceptionId?: string } | undefined)?.misconceptionId;
  const setMemoMisconception = (ids: string[], slug: string | null) => {
    const cmds = ids.map((id) => patchDataCmd(rfl, id, { misconceptionId: slug ?? undefined }, "tag misconception")).filter((c): c is NonNullable<typeof c> => !!c);
    const cmd = compositeCmd(cmds, "tag misconception"); if (cmd) bus.dispatch(cmd);
    setNote(slug ? `Tagged ${ids.length} memo${ids.length === 1 ? "" : "s"} → ${slug}.` : "Cleared the misconception tag.");
  };
  const addMisconceptionDef = (rawSlug: string, description: string) => {
    const slug = toSlug(rawSlug);
    if (!slug) { setNote("Slug must be 2-32 chars: A-Z, 0-9, underscores."); return null; }
    setPrefs({ misconceptions: { ...(prefs.misconceptions ?? {}), [slug]: description.trim() } });
    return slug;
  };

  /** A set's TOPIC NAME for display — resolved from the spine (topicId), never from
   *  the legacy `deck.chapter` tag, which stores "Ch N" and is still parsed by the
   *  migration + video matchers. Empty string when the set is unassigned. */
  /** SET NAME for display — hide the legacy "Ch N ·" prefix on screen WITHOUT
   *  touching the stored name. (The "clean set names" button strips it for real.) */
  const setDisplayName = (name: string): string => name.replace(/^chs*d+s*[·.-]s*/i, "").trim() || name;
  const deckTopicName = (d: DeckDef | null | undefined): string => {
    if (!d?.topicId) return "";
    for (const c of courseOptions) { const ch = c.chapters.find((x) => x.id === d.topicId); if (ch) return topicLabel(ch); }
    return "";
  };
  const decksByTopic = useMemo(() => { const m = new Map<string, DeckDef[]>(); for (const d of cardDecks) if (d.topicId) { const l = m.get(d.topicId) ?? []; l.push(d); m.set(d.topicId, l); } return m; }, [cardDecks]);
  const libraryDecks = useMemo(() => cardDecks.filter((d) => !d.topicId), [cardDecks]);
  // Per-set Free/Full counts for the outline badges.
  const deckCounts = useMemo(() => {
    const m = new Map<string, { free: number; full: number }>();
    for (const d of cardDecks) {
      const mem = deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], d.id).filter((n) => (n as { type?: string }).type === "ceq");
      m.set(d.id, { free: mem.filter((n) => !!((n as { data?: { free?: boolean } }).data?.free)).length, full: mem.length });
    }
    return m;
  }, [cardDecks, nodes]);
  // READINESS (Topics tab) — live per-set gaps, aggregated per topic. This IS the
  // cross-set readiness board (no separate overlay): clips missing (free/full),
  // intro/outro/wrap presence, est. FULL runtime, published count.
  const deckReadiness = useMemo(() => {
    const m = new Map<string, { missFull: number; missFree: number; intro: boolean; outro: boolean; wrapN: number; runtimeS: number; shortReady: boolean }>();
    for (const d of cardDecks) {
      const mem = deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], d.id).filter((n) => (n as { type?: string }).type === "ceq");
      const ceqs = mem.map((n) => { const dd = rf.getNode(n.id)?.data as unknown as CeqCard | undefined; return { id: n.id, prompt: dd?.prompt ?? "", takes: cardClips(dd), free: dd?.free, short: dd?.short }; });
      const missFull = ceqs.filter((c) => c.takes.length === 0).length;
      const missFree = ceqs.filter((c) => c.free && c.takes.length === 0).length;
      const intro = !!(d.intro ?? gc.intro); const outro = !!(d.outro ?? gc.outro);
      const stitch = buildStitch("full", { intro: d.intro ?? gc.intro, hook: d.hookTake, outro: d.outro ?? gc.outro, wrap: d.wrap, ceqs });
      m.set(d.id, { missFull, missFree, intro, outro, wrapN: d.wrap?.length ?? 0, runtimeS: stitchRuntime(stitch.items), shortReady: ceqs.some((c) => c.short && c.takes.length > 0) });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardDecks, nodes, gc.intro, gc.outro]);
  // Published videos matched onto the spine (same matching the Videos tab uses).
  const pubVidsByTopic = useMemo(() => {
    const m = new Map<string, { id: string; name: string; paid: boolean }[]>();
    for (const n of nodes) {
      if (n.type !== "lesson" || !(n.data as { muxPlaybackId?: string | null }).muxPlaybackId) continue;
      const d = n.data as unknown as LessonBox;
      const c = vidCourseMatch(courseOptions, d.videoCourse || "");
      const t = c ? vidTopicMatch(c, d.videoChapter || d.topic || "") : undefined;
      if (!t) continue;
      const l = m.get(t.id) ?? []; l.push({ id: n.id, name: d.label || "Lesson", paid: (d.access ?? "FREE") === "PAID" }); m.set(t.id, l);
    }
    return m;
  }, [nodes, courseOptions]);
  // Outline expand state — persisted per user in panel prefs. COLLAPSED BY DEFAULT:
  // a topic-first outline opens as a short list of courses you drill into, not a wall.
  // A stored flag always wins, so anything Lee has already expanded stays expanded —
  // the default only decides never-touched nodes. (The dflt arg is kept in the
  // signatures so the many call sites stay untouched and read/toggle can't drift.)
  const outlineExp = prefs.setsOutline ?? {};
  const isExp = (key: string, _dflt?: boolean) => outlineExp[key] ?? false;
  const toggleExp = (key: string, dflt?: boolean) => setPrefs({ setsOutline: { ...outlineExp, [key]: !isExp(key, dflt) } });
  const deck = cardDecks.find((d) => d.id === setId) ?? null;
  // Open set tabs resolved to live decks (stale session ids drop out silently).
  const tabDecks = useMemo(() => openTabs.map((id) => cardDecks.find((d) => d.id === id)).filter((d): d is DeckDef => !!d), [openTabs, cardDecks]);
  // An active set always has a visible tab chip (covers session-restore edge cases).
  useEffect(() => { if (setId && cardDecks.some((d) => d.id === setId)) setOpenTabs((p) => (p.includes(setId) ? p : [...p, setId])); }, [setId, cardDecks]);
  // FIRST-FRAME-RULE (Krug pass): an open set always shows a real frame — never the
  // "Select a question" placeholder. Whenever a set is open with nothing selected,
  // frame 1 selects itself (covers open-from-outline, set switches, and the first
  // insert into an empty set). Explicit Q0/layout selection is untouched.
  useEffect(() => {
    if (!deck || qId) return;
    const first = deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], deck.id).filter((n) => (n as { type?: string }).type === "ceq")[0];
    if (first) { setQId(first.id); setExpandedQ((s) => new Set(s).add(first.id)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.id, qId, nodes]);
  const questions = useMemo(() => (deck ? deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], deck.id).filter((n) => (n as { type?: string }).type === "ceq") : []), [deck, nodes]);
  // STABLE identity — this feeds the previewer's build() deps. A fresh array every
  // render re-seeded the preview constantly, which is what made an in-progress move
  // snap back to the saved geometry mid-edit.
  const deckCeqIds = useMemo(() => questions.map((q) => q.id), [questions]);
  // CEQ-only order for the student counter — note frames never count ("Q 14/29" skips them)
  const counterIds = useMemo(() => questions.filter((q) => !(rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.noteOnly).map((q) => q.id), [questions, nodes]); // eslint-disable-line react-hooks/exhaustive-deps
  const starCount = useMemo(() => questions.reduce((n, q) => n + ((rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.starred ? 1 : 0), 0), [questions, nodes]); // eslint-disable-line react-hooks/exhaustive-deps
  const qNode = qId ? nodes.find((n) => n.id === qId) : null;
  const qd = qNode?.data as unknown as CeqCard | undefined;
  // Re-seed signature for the live previewer — CONTENT only (stem/choices/chain), NOT
  // positions, so dragging a memo (which writes position back) never re-seeds/fights.
  const ceqSig = qd ? `${qId}|${qd.boss ? "B" : ""}|${qd.prompt}|${qd.choices.map((c) => `${c.text}:${c.correct ? 1 : 0}:${(c.chain ?? []).map((it) => `${it.memoNodeId}~${it.label}~${it.sound ?? ""}~${it.hideChoiceLabel ? 1 : 0}~${it.hideArrow ? 1 : 0}`).join(",")}`).join("|")}` : "";
  // The frame the set will be dealt into — the previewer mirrors ITS size so the
  // composition you build == the dealt frame exactly. Defaults to a 1600×900 stage.
  // Mirror a canvas frame's size ONLY when it actually hosts this deck's CEQs (you
  // dealt the set there). Entering an unrelated frame — the intro frame, another
  // lesson's frame — must NOT rescale the previewer: a 450px intro frame halved the
  // overview stack spacing and scrambled every question. Default: the 1600x900 stage.
  const curFrame = nav.currentFrameId ? rf.getNode(nav.currentFrameId) : null;
  const curHostsDeck = !!(curFrame && deck && nodes.some((n) => n.parentId === curFrame.id && n.type === "ceq" && (n.data as { deckId?: string }).deckId === deck.id));
  const targetFrame = curHostsDeck ? curFrame : null;
  const frameW = (targetFrame?.data as { w?: number } | undefined)?.w ?? targetFrame?.width ?? 1600;
  const frameH = (targetFrame?.data as { h?: number } | undefined)?.h ?? targetFrame?.height ?? 900;
  // Chain arrows for the previewer — any edge whose SOURCE is a memo in this CEQ's
  // chains (memo → choice, memo → memo, …). Reactive so drawn arrows show at once.
  const allEdges = useEdges();
  const chainMemoIds = useMemo(() => { const s = new Set<string>(); (qd?.choices ?? []).forEach((c) => (c.chain ?? []).forEach((it) => s.add(it.memoNodeId))); return s; }, [ceqSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const previewEdges = useMemo(() => allEdges.filter((e) => chainMemoIds.has(e.source)).map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })), [allEdges, chainMemoIds]);
  // DERIVED Free/Full stitch lists — order comes from `questions` (deck order) ONLY.
  const stitchCeqs = useMemo(() => questions.map((q) => { const d = rf.getNode(q.id)?.data as unknown as CeqCard | undefined; return { id: q.id, prompt: d?.prompt ?? "", takes: cardClips(d), free: d?.free }; }), [questions, nodes]); // eslint-disable-line react-hooks/exhaustive-deps
  // RESOLVED intro/outro = the set's own local drop, else the GLOBAL fallback. Preview,
  // stitch lists and publish all read these, so what you preview is what publishes.
  const resolvedIntro = deck?.intro ?? gc.intro;
  const resolvedOutro = deck?.outro ?? gc.outro;
  const frontBumpers = prefs.frontBumpers ?? [];
  const backBumpers = prefs.backBumpers ?? [];
  const stitchFree = useMemo(() => buildStitch("free", { intro: resolvedIntro, hook: deck?.hookTake, outro: resolvedOutro, wrap: deck?.wrap, frontBumpers, backBumpers, ceqs: stitchCeqs }), [stitchCeqs, resolvedIntro, resolvedOutro, gc.transition, deck?.wrap, deck?.hookTake, frontBumpers, backBumpers]);
  const stitchFull = useMemo(() => buildStitch("full", { intro: resolvedIntro, hook: deck?.hookTake, outro: resolvedOutro, wrap: deck?.wrap, frontBumpers, backBumpers, ceqs: stitchCeqs }), [stitchCeqs, resolvedIntro, resolvedOutro, gc.transition, deck?.wrap, deck?.hookTake, frontBumpers, backBumpers]);
  const freeCount = stitchCeqs.filter((c) => c.free).length;
  /** PREVIEW ROWS — the cut's FULL order including clip-less CEQs (greyed 1..N
   *  in the Preview tab's list), interleaved at their deck positions: intro/front
   *  bumpers/hook, then every cut CEQ (clips or placeholder), then wrap/back bumpers/outro.
   *  Bumper + wrap rows carry their INDEX (it.clip) so the table's ✕/＋ hit the right clip. */
  const stitchRowsFor = (mode: "free" | "full"): StitchRow[] => {
    const stitch = mode === "free" ? stitchFree : stitchFull;
    const rows: Omit<StitchRow, "num">[] = [];
    for (const it of stitch.items) {
      if (it.kind === "ceq" || it.kind === "wrap" || it.kind === "backBumper" || it.kind === "outro") break;
      rows.push({ key: it.kind === "frontBumper" ? `frontBumper:${it.clip}` : it.kind, kind: it.kind, label: it.label, take: it.take, clip: it.kind === "frontBumper" ? it.clip : undefined });
    }
    const ceqItems = stitch.items.filter((i) => i.kind === "ceq");
    for (const c of stitchCeqs) {
      if (mode === "free" && !c.free) continue;
      const its = ceqItems.filter((i) => i.ceqId === c.id);
      if (its.length) its.forEach((it, k) => rows.push({ key: `${c.id}:${k}`, kind: "ceq", label: it.label, take: it.take, ceqId: c.id, clip: k, free: c.free }));
      else rows.push({ key: `${c.id}:missing`, kind: "ceq", label: c.prompt || "Question", ceqId: c.id, clip: 0, free: c.free });
    }
    stitch.items.forEach((it, i) => { if (it.kind === "wrap" || it.kind === "backBumper" || it.kind === "outro") rows.push({ key: `${it.kind}:${i}`, kind: it.kind, label: it.label, take: it.take, clip: (it.kind === "wrap" || it.kind === "backBumper") ? it.clip : undefined }); });
    return rows.map((r, i) => ({ ...r, num: i + 1 }));
  };
  const stitchRows = useMemo(() => ({ free: stitchRowsFor("free"), full: stitchRowsFor("full") }), [stitchFree, stitchFull, stitchCeqs]); // eslint-disable-line react-hooks/exhaustive-deps
  /** PREVIEW-list per-clip ops (the clip table's ✕ / ＋ / replace). All write the
   *  CEQ node's `takes[]` through the undo bus (Ctrl+Z restores), and clear the
   *  legacy single `take` so `cardClips` reads one source. Replacing keeps ONE prior
   *  (withPrev) on the replaced clip only; delete is a plain removal (undoable).
   *  The staged file itself stays in the bucket — only the reference changes. */
  const replaceClipAt = async (ceqId: string, clip: number, file: File) => {
    if (!rf.getNode(ceqId)) throw new Error("That question no longer exists in this set.");
    const fresh = await stageTake(file);
    const clips = cardClips(rf.getNode(ceqId)?.data as unknown as CeqCard | undefined);
    const next = clips.length === 0 ? [fresh] : clips.map((c, i) => (i === clip ? withPrev(fresh, clips[clip]) : c));
    patchQ(ceqId, { takes: next, take: undefined });
    setNote(`${clips.length ? `Clip ${clip + 1} replaced` : "Take attached"} (${fmtDur(fresh.duration)}).`);
  };
  const addClipAfter = async (ceqId: string, clip: number, file: File, role?: TakeRole) => {
    if (!rf.getNode(ceqId)) throw new Error("That question no longer exists in this set.");
    const staged = await stageTake(file);
    const clips = cardClips(rf.getNode(ceqId)?.data as unknown as CeqCard | undefined);
    const at = Math.min(Math.max(clip + 1, 0), clips.length);
    // Stamp the chosen type + an auto filename (role-NN) so the Type column + exports read it.
    const ext = file.name.includes(".") ? file.name.split(".").pop()! : "mp4";
    const fresh: TakeRef = role ? { ...staged, role, name: autoClipName(role, at + 1, ext) } : staged;
    const next = [...clips.slice(0, at), fresh, ...clips.slice(at)];
    patchQ(ceqId, { takes: next, take: undefined });
    setNote(`Clip added (${fmtDur(fresh.duration)}) — ${next.length} on this question.`);
  };
  const deleteClipAt = (ceqId: string, clip: number) => {
    if (!rf.getNode(ceqId)) return;
    const clips = cardClips(rf.getNode(ceqId)?.data as unknown as CeqCard | undefined);
    const next = clips.filter((_, i) => i !== clip);
    patchQ(ceqId, { takes: next, take: undefined });
    setNote(next.length ? `Clip removed — ${next.length} left (Ctrl+Z to undo).` : "Last clip removed — this question has no clip now (Ctrl+Z to undo).");
  };
  /** Change an existing CEQ clip's TYPE (Type-column dropdown). */
  const setClipRole = (ceqId: string, clip: number, role: TakeRole) => {
    const clips = cardClips(rf.getNode(ceqId)?.data as unknown as CeqCard | undefined);
    if (!clips[clip]) return;
    patchQ(ceqId, { takes: clips.map((c, i) => (i === clip ? { ...c, role } : c)), take: undefined });
  };
  /** FRONT / BACK BUMPERS — global clips (prefs) stitched after the intro / before the
   *  outro. Add appends (auto-named 01,02,03… / 1001,1002…); delete removes by index. */
  const addBumper = async (kind: "frontBumper" | "backBumper", file: File) => {
    const staged = await stageTake(file);
    const list = (kind === "frontBumper" ? prefs.frontBumpers : prefs.backBumpers) ?? [];
    const ext = file.name.includes(".") ? file.name.split(".").pop()! : "mp4";
    const fresh: TakeRef = { ...staged, role: kind, name: autoClipName(kind, list.length + 1, ext) };
    setPrefs(kind === "frontBumper" ? { frontBumpers: [...list, fresh] } : { backBumpers: [...list, fresh] });
    setNote(`${kind === "frontBumper" ? "Front" : "Back"} bumper added (${fmtDur(fresh.duration)}) — ${list.length + 1} total.`);
  };
  const deleteBumper = (kind: "frontBumper" | "backBumper", idx: number) => {
    const list = (kind === "frontBumper" ? prefs.frontBumpers : prefs.backBumpers) ?? [];
    const next = list.filter((_, i) => i !== idx);
    setPrefs(kind === "frontBumper" ? { frontBumpers: next } : { backBumpers: next });
    setNote(`${kind === "frontBumper" ? "Front" : "Back"} bumper removed — ${next.length} left.`);
  };
  // SHORTS QUEUE (Lee) — every shorts-flagged CEQ across ALL sets, with its set +
  // question number, stem and angle note. Lee's batch-filming worklist.
  const shortsList = useMemo(() => rf.getNodes()
    .filter((n) => n.type === "ceq" && !!(n.data as { short?: boolean }).short)
    .map((n) => {
      const d = n.data as unknown as CeqCard & { deckId?: string };
      const dk = d.deckId ? cardDecks.find((x) => x.id === d.deckId) : null;
      const members = d.deckId ? deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], d.deckId).filter((m) => (m as { type?: string }).type === "ceq") : [];
      const qnum = members.findIndex((m) => m.id === n.id) + 1;
      return { id: n.id, deckId: d.deckId, setName: dk?.name ?? "Loose", tqq: `${deckTopicName(dk) || dk?.name || "Set"} · Q${qnum || "?"}`, stem: d.prompt || "Question", note: d.shortNote || "" };
    }), [nodes, cardDecks]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- SETS -----------------------------------------------------------------
  /** Create a set from the inline New Set form — asks course + topic (or Library). */
  const createSet = () => {
    if (!newSetForm || !newSetForm.name.trim()) return;
    const course = newSetForm.courseId ? courseOptions.find((c) => c.id === newSetForm.courseId) ?? null : null;
    const topic = course && newSetForm.topicId ? course.chapters.find((ch) => ch.id === newSetForm.topicId) ?? null : null;
    const def = {
      ...newDeckDef(newSetForm.name.trim(), "cards"),
      lessonId: (nav.currentFrameId ? (rf.getNode(nav.currentFrameId)?.parentId ?? null) : null),
      courseId: course?.id ?? null,
      topicId: topic?.id ?? null,
      ...(course ? { course: courseLabel(course) } : {}),
      ...(topic ? { chapter: `Ch ${topic.number ?? "?"}` } : {}),
      // DEFAULT QUESTION 0 — the baseline is never empty: centred card + two memo
      // slots right-stacked (the classic deal geometry), sculptable from row 0.
      layout: { card: { ...dealCentre(frameW, frameH), scale: 1 }, memoSlots: paletteSlots(frameW, frameH).map((sl, i) => (i < 2 ? sl : { ...sl, off: true })) }, // full rack; first two ON, rest ready to switch on
    };
    setDecks((prev) => addDeck(prev, def));
    setSetId(def.id); setQId(null); setNewSetForm(null);
    setNote(topic && course ? `Created "${def.name}" under ${courseLabel(course)} / ${topicLabel(topic)}.` : `Created "${def.name}" in the Library (unassigned).`);
  };
  /** Open the existing New Set form pre-filled for a course/topic ("" = Library). */
  const openNewSet = (courseId: string, topicId: string) => { setAddMenu(false); setNewTopicFor(null); setNewSetForm({ name: `Set ${cardDecks.length + 1}`, courseId, topicId }); };
  const renameSet = (d: DeckDef) => { const n = window.prompt("Rename set", d.name); if (n) setDecks((prev) => updateDeck(prev, d.id, { name: n.trim() })); };
  const deleteSet = (d: DeckDef) => {
    const members = deckMembersOf(rf.getNodes() as { id: string; data?: { deckId?: string; stageOrder?: number } }[], d.id);
    const cmd = compositeCmd(members.map((m) => patchDataCmd(rfl, m.id, { deckId: undefined }, "unassign")).filter((c): c is NonNullable<typeof c> => !!c), `clear ${d.name}`);
    if (cmd) bus.dispatch(cmd);
    setDecks((prev) => removeDeck(prev, d.id));
    if (setId === d.id) { setSetId(null); setQId(null); }
  };
  /** One SET row in the outline (draggable onto a topic / the Library) + its inline
   *  course/topic picker. Badges: Free/Full counts + laid marker. */
  const renderSetRow = (d: DeckDef) => {
    const counts = deckCounts.get(d.id) ?? { free: 0, full: 0 };
    const laid = (d.slots?.length ?? 0) > 0;
    const on = setId === d.id;
    return (
      <div key={d.id}>
        <div draggable className="ml-4 flex cursor-grab items-center gap-1 rounded px-1 py-0.5" style={{ background: on ? "rgba(252,163,17,0.12)" : "transparent", border: `1px solid ${on ? NEON.border : "transparent"}` }}
          onDragStart={(e) => { e.dataTransfer.setData(SET_DND, d.id); e.dataTransfer.effectAllowed = "move"; }}
          title="Click to open · drag onto a topic to assign · double-click to rename">
          <button className="min-w-0 flex-1 truncate text-left text-[10.5px] font-semibold" style={{ color: on ? NEON.yellow : NEON.text }} onClick={() => openSetTab(d.id)} onDoubleClick={() => renameSet(d)} title={d.name}>{setDisplayName(d.name)}</button>
          <span className="shrink-0 rounded px-1 text-[7.5px] font-bold tabular-nums" style={{ color: counts.free > 0 ? "#3BF5A0" : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} title={`${counts.free} free · ${counts.full} full${laid ? " · laid" : ""}`}>{counts.free}F·{counts.full}{laid ? "▦" : ""}</span>
          <button className="shrink-0" style={{ color: assignFor === d.id ? NEON.yellow : NEON.muted }} onClick={() => { setAssignFor((k) => (k === d.id ? null : d.id)); setAssignCourseSel(d.courseId ?? "lib"); }} title="Assign to a Course → Topic (or the Library)"><FolderInput className="h-3 w-3" /></button>
          <button className="shrink-0" style={{ color: NEON.red }} onClick={() => deleteSet(d)} title="Delete set (keeps cards loose)"><Trash2 className="h-3 w-3" /></button>
        </div>
        {assignFor === d.id && (
          <div className="mb-1 ml-4 flex flex-col gap-1 rounded p-1" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}` }}>
            <select value={assignCourseSel} onChange={(e) => setAssignCourseSel(e.target.value)} className="rounded bg-black/40 px-1 py-0.5 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}>
              <option value="lib">Library (unassigned)</option>
              {courseOptions.map((c) => <option key={c.id} value={c.id}>{courseLabel(c)}</option>)}
            </select>
            {assignCourseSel === "lib" ? (
              <button className="rounded px-1 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => assignSet(d.id, null, null)}>move to Library</button>
            ) : (
              <select value="" onChange={(e) => { const c = courseOptions.find((x) => x.id === assignCourseSel); const t = c?.chapters.find((ch) => ch.id === e.target.value); if (c && t) assignSet(d.id, c, t); }} className="rounded bg-black/40 px-1 py-0.5 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}>
                <option value="">pick a topic…</option>
                {courseOptions.find((c) => c.id === assignCourseSel)?.chapters.filter((ch) => ch.status !== "archived").map((ch) => <option key={ch.id} value={ch.id}>{topicLabel(ch)}</option>)}
              </select>
            )}
          </div>
        )}
      </div>
    );
  };

  /** EXPORT the set as one markdown doc (clipboard + download) — assembly here,
   *  formatting in the pure ceq-export module so the document shape is testable. */
  const exportSet = async () => {
    if (!deck) return;
    const rows = spineRows(deck);
    const slotOf = (local?: TakeRef, global?: TakeRef): { state: "custom" | "global" | "empty"; name?: string; duration?: number } =>
      local ? { state: "custom", name: local.name, duration: local.duration } : global ? { state: "global", name: global.name, duration: global.duration } : { state: "empty" };
    const memoTextOf = (mid: string) => { const md = rf.getNode(mid)?.data as { title?: string; body?: string; label?: string } | undefined; return (md?.body || md?.title || md?.label || "").trim(); };
    const tqqOf = (qid: string) => { const n = questions.findIndex((q) => q.id === qid) + 1; return `${deckTopicName(deck) || deck.name} · Q${n || "?"}`; };
    const eq = questions.map((q, qi) => {
      const d = rf.getNode(q.id)?.data as unknown as CeqCard | undefined;
      return {
        tqq: `${deckTopicName(deck) || deck.name} · Q${qi + 1}`,
        stem: d?.prompt || "Question",
        choices: (d?.choices ?? []).map((c) => ({ text: c.text, correct: c.correct, chain: (c.chain ?? []).map((it) => ({ label: it.label, body: memoTextOf(it.memoNodeId), sound: it.sound })) })),
        flags: { boss: d?.boss, chachingSilenced: d?.confirmSfx === false, short: d?.short, shortNote: d?.shortNote, starred: d?.starred, free: d?.free },
        scripts: { suggested: d?.suggestedScript, revised: d?.revisedScript ?? d?.note, transcript: d?.transcript },
        clips: cardClips(d).map((t, i) => ({ name: t.name ?? "clip", duration: t.duration, lookback: i > 0, refs: (t.refs ?? []).map(tqqOf) })),
      };
    });
    const md = buildSetExport({
      setName: deck.name,
      course: rows ? courseLabel(rows.course) : deck.course,
      topic: rows ? topicLabel(rows.topic) : undefined,
      freeCount, fullCount: questions.length,
      runtimeFreeS: stitchRuntime(stitchFree.items), runtimeFullS: stitchRuntime(stitchFull.items),
      clipCoverage: { withBase: eq.filter((q) => q.clips.length > 0).length, total: eq.length },
      questions: eq,
      introFrame: { exists: !!(deck.introFrameId && rf.getNode(deck.introFrameId)), clip: deck.hookTake ? { name: deck.hookTake.name ?? "clip", duration: deck.hookTake.duration } : undefined },
      wrap: (deck.wrap ?? []).map((w) => ({ name: w.name ?? "clip", duration: w.duration, refs: (w.refs ?? []).map(tqqOf) })),
      slots: { intro: slotOf(deck.intro, gc.intro), outro: slotOf(deck.outro, gc.outro) },
      misconceptions: (() => { const m = new Map<string, string[]>(); questions.forEach((q, qi) => { const qc = (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.choices; for (const sl of questionMisconceptions(qc, memoSlugOf)) { const l = m.get(sl) ?? []; l.push(`${deckTopicName(deck) || deck.name} · Q${qi + 1}`); m.set(sl, l); } }); return [...m.entries()].map(([slug, qs]) => ({ slug, questions: qs })); })(),
    });
    try { await navigator.clipboard.writeText(md); } catch { /* clipboard can be blocked; the download still lands */ }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `${deck.name.replace(/[^A-Za-z0-9 _-]+/g, "").trim() || "ceq-set"}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setNote(`Exported "${deck.name}" (${Math.round(md.length / 102.4) / 10}KB markdown) — copied to the clipboard + downloaded.`);
  };
  /** COVERS-STARRED — stamp the currently-★ questions onto a clip's references in
   *  one click (union: existing refs are kept). */
  const starredIds = () => questions.filter((q) => (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.starred).map((q) => q.id);
  const stampStarredOnClip = (ceqId: string, idx: number) => {
    const ids = starredIds(); if (ids.length === 0) return;
    const t = cardClips(rf.getNode(ceqId)?.data as unknown as CeqCard | undefined)[idx];
    setClipRefs(ceqId, idx, [...new Set([...(t?.refs ?? []), ...ids.filter((id) => id !== ceqId)])]);
    setNote(`Stamped ${ids.filter((id) => id !== ceqId).length} starred question(s) onto the clip's references.`);
  };
  const stampStarredOnWrap = (idx: number) => {
    if (!deck) return; const ids = starredIds(); if (ids.length === 0) return;
    setDecks((prev) => updateDeck(prev, deck.id, { wrap: (deck.wrap ?? []).map((w, i) => (i === idx ? { ...w, refs: [...new Set([...(w.refs ?? []), ...ids])] } : w)) }));
    setNote(`Stamped ${ids.length} starred question(s) onto wrap ${idx + 1}'s references.`);
  };

  /** SET INTRO FRAME — open it, creating it on first use as a DEEP COPY of the
   *  lesson's CEQ HOOK frame (cards, script, @marks — the full duplicate machinery),
   *  so Lee edits a real frame that already looks like Foundations #1.2. The new
   *  frame's id is recorded on the deck; it is never a deck member, so counts, the
   *  deal and Free/Full totals can't see it. Fails LOUD when no hook frame exists. */
  const openIntroFrame = () => {
    if (!deck) return;
    const existing = deck.introFrameId ? rf.getNode(deck.introFrameId) : null;
    if (existing) { nav.enter(existing.id); onClose(); return; }
    const all = rf.getNodes();
    const lessonId = deck.lessonId ?? (nav.currentFrameId ? rf.getNode(nav.currentFrameId)?.parentId : undefined);
    const isHook = (n: (typeof all)[number]) => n.type === "frame" && /hook/i.test(((n.data as { title?: string }).title ?? ""));
    const src = all.find((n) => n.parentId === lessonId && isHook(n)) ?? all.find(isHook);
    if (!src) { setNote("No CEQ HOOK frame found to seed the intro from — name a frame's title 'CEQ HOOK' (like Foundations #1.2), then reopen the Intro row."); return; }
    const deckId = deck.id;
    nav.duplicate(src.id, { onCreated: (newId) => {
      setDecks((prev) => updateDeck(prev, deckId, { introFrameId: newId }));
      nav.enter(newId);
      onClose(); // land on the frame — the Studio overlay was hiding it
      setNote("Intro frame created (a copy of the CEQ HOOK frame). Edit its text on the canvas, then reopen the Studio and drop its clip on the Intro row.");
    } });
  };
  const dropHookTake = async (f: File) => {
    if (!deck) return;
    setNote(`Uploading intro clip "${f.name}"…`);
    try { const fresh = await stageTake(f); setDecks((prev) => updateDeck(prev, deck.id, { hookTake: withPrev(fresh, deck.hookTake) })); setNote(`Intro clip attached (${fmtDur(fresh.duration)}) — stitches after the boilerplate intro, before the takes.`); }
    catch (e) { setNote(`Intro clip upload failed: ${e instanceof Error ? e.message : String(e)}`); }
  };

  /** OUTLINE FOOTER — one context-aware "+ Add", shared by the Sets and Topics tabs.
   *  What it offers follows the last outline row clicked: a topic ⇒ add a CEQ set to
   *  it, a course ⇒ add a topic to it, nothing ⇒ a small menu. Also hosts the inline
   *  new-set form and the inline new-topic name row, so both tabs get them. */
  const renderOutlineFooter = () => {
    const selCourse = outlineSel ? courseOptions.find((c) => c.id === outlineSel.courseId) : undefined;
    const selTopic = selCourse && outlineSel?.topicId ? selCourse.chapters.find((ch) => ch.id === outlineSel.topicId) : undefined;
    const BTN = "m-1 flex items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase";
    const ITEM = "rounded px-1.5 py-1 text-left text-[10px] font-bold hover:bg-white/5 disabled:opacity-40";
    if (newSetForm) {
      return (
        <div className="m-1 flex flex-col gap-1 rounded p-1.5" style={{ border: `1px dashed ${NEON.borderSoft}` }}>
          <input autoFocus className="nodrag rounded bg-black/40 px-1.5 py-0.5 text-[10.5px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} placeholder="Set name…" value={newSetForm.name} onChange={(e) => setNewSetForm({ ...newSetForm, name: e.target.value })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") createSet(); else if (e.key === "Escape") setNewSetForm(null); }} />
          <select value={newSetForm.courseId} onChange={(e) => setNewSetForm({ ...newSetForm, courseId: e.target.value, topicId: "" })} className="rounded bg-black/40 px-1 py-0.5 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}>
            <option value="">Library (unassigned)</option>
            {courseOptions.map((c) => <option key={c.id} value={c.id}>{courseLabel(c)}</option>)}
          </select>
          {newSetForm.courseId && (
            <select value={newSetForm.topicId} onChange={(e) => setNewSetForm({ ...newSetForm, topicId: e.target.value })} className="rounded bg-black/40 px-1 py-0.5 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}>
              <option value="">pick a topic…</option>
              {courseOptions.find((c) => c.id === newSetForm.courseId)?.chapters.filter((ch) => ch.status !== "archived").map((ch) => <option key={ch.id} value={ch.id}>{topicLabel(ch)}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1">
            <button className="flex-1 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase disabled:opacity-40" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} disabled={!newSetForm.name.trim() || (!!newSetForm.courseId && !newSetForm.topicId)} onClick={createSet}>create</button>
            <button className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setNewSetForm(null)}>✕</button>
          </div>
        </div>
      );
    }
    if (newTopicFor) {
      const c = courseOptions.find((x) => x.id === newTopicFor);
      const commit = () => { const n = newTopicName.trim(); if (n && !createTopicMut.isPending) createTopicMut.mutate({ course_id: newTopicFor, chapter_name: n }); };
      return (
        <div className="m-1 flex flex-col gap-1 rounded p-1.5" style={{ border: `1px dashed ${NEON.borderSoft}` }}>
          <div className="text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>New topic in {c ? courseLabel(c) : "course"}</div>
          <input autoFocus className="nodrag rounded bg-black/40 px-1.5 py-0.5 text-[10.5px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} placeholder="Topic name…" value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commit(); else if (e.key === "Escape") { setNewTopicFor(null); setNewTopicName(""); } }} />
          <div className="flex items-center gap-1">
            <button className="flex-1 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase disabled:opacity-40" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} disabled={!newTopicName.trim() || createTopicMut.isPending} onClick={commit}>{createTopicMut.isPending ? "adding…" : "add topic"}</button>
            <button className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setNewTopicFor(null); setNewTopicName(""); }}>✕</button>
          </div>
          <div className="text-[8px] italic" style={{ color: NEON.muted }}>Lands at the end of the course — reorder in Manage course.</div>
        </div>
      );
    }
    if (addMenu) {
      return (
        <div className="m-1 flex flex-col gap-0.5 rounded p-1" style={{ border: `1px dashed ${NEON.borderSoft}` }}>
          <div className="px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>Add…</div>
          {/* Courses have NO create path in the app (the DB is only ever read or
              renamed) — offered but disabled rather than silently missing. */}
          <button className={ITEM} style={{ color: NEON.muted }} disabled title="Courses aren't created in the Studio — they're set up in the database. Ask for a course-create pass if you need one.">New course (not available here)</button>
          <button className={ITEM} style={{ color: NEON.text }} onClick={() => { setAddMenu(false); setNewTopicFor(courseOptions[0]?.id ?? null); }} disabled={courseOptions.length === 0} title="Add a topic to a course">New topic…</button>
          <button className={ITEM} style={{ color: NEON.text }} onClick={() => openNewSet("", "")} title="Create a CEQ set — pick its course + topic, or leave it in the Library">New CEQ set…</button>
          <button className={`${ITEM} mt-0.5`} style={{ color: NEON.muted }} onClick={() => setAddMenu(false)}>cancel</button>
        </div>
      );
    }
    if (selTopic && selCourse) return <button className={BTN} style={{ color: NEON.yellow, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => openNewSet(selCourse.id, selTopic.id)} title={`Create a CEQ set under ${topicLabel(selTopic)}`}><Plus className="h-3 w-3" /> <span className="min-w-0 truncate">Add CEQ set to {topicLabel(selTopic)}</span></button>;
    if (selCourse) return <button className={BTN} style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => { setNewTopicName(""); setNewTopicFor(selCourse.id); }} title={`Add a topic to ${courseLabel(selCourse)}`}><Plus className="h-3 w-3" /> <span className="min-w-0 truncate">Add topic to {courseLabel(selCourse)}</span></button>;
    return <button className={BTN} style={{ color: NEON.yellow, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => setAddMenu(true)} title="Add a course, topic, or CEQ set — or click a course/topic in the outline first for a one-click add"><Plus className="h-3 w-3" /> Add…</button>;
  };

  // ---- QUESTIONS ------------------------------------------------------------
  const addQuestion = () => {
    if (!deck) return;
    const order = nextStageOrder(rf.getNodes() as never);
    const id = cardId("ceq");
    const node = { id, type: "ceq", position: { x: 80, y: 80 + questions.length * 40 }, selected: false, data: { kind: "ceq", title: deck.name, prompt: "New question", choices: [{ id: cardId("ch"), text: "Choice A", correct: true }, { id: cardId("ch"), text: "Choice B" }], deckId: deck.id, deckMember: true, tucked: true, stageOrder: order, slotIndex: questions.length, deckCategory: "ceq:studio", deckPos: { x: 80, y: 80 + questions.length * 40 } } };
    const cmd = addNodesCmd(rfl, [node] as never, "add question"); if (cmd) bus.dispatch(cmd);
    setQId(id);
  };
  /** INSERT A FRAME at strip position `at` (frames rename §3) — CEQ frame or Note
   *  frame. Same renumber pattern as duplicateQuestion: everything at/below `at`
   *  shifts down one stageOrder, one undo step. Note frames are CEQ cards with
   *  noteOnly (no choices, never counted) so the whole card system just works. */
  const insertFrame = (at: number, frameKind: "ceq" | "note" | "intro" | "outro") => {
    if (!deck) return;
    const id = cardId("ceq");
    const pos = { x: 520, y: 210 };
    const node = {
      id, type: "ceq", position: pos, selected: false,
      data: {
        kind: "ceq", title: deck.name,
        prompt: frameKind === "ceq" ? "New question" : frameKind === "intro" ? "Here is what you need to see…" : frameKind === "outro" ? "" : "New note — trigger words, headspace, a tip",
        ...(frameKind !== "ceq" ? { noteOnly: true, frameMode: frameKind } : {}),
        ...(frameKind === "outro" ? { callout: { hidden: true } } : {}),
        choices: frameKind === "ceq" ? [{ id: cardId("ch"), text: "Choice A", correct: true }, { id: cardId("ch"), text: "Choice B" }] : [],
        deckId: deck.id, deckMember: true, tucked: true, stageOrder: at, slotIndex: at, deckCategory: "ceq:studio", deckPos: pos,
      },
    };
    // NOTE frames arrive with a BOLT element already staged (Lee, 08-15): the
    // callout's built-in bolt is retired — this one is a free object: move it,
    // resize it, recolor it to any SEC school (or a student, for personalized
    // videos). Delete it like any element if the frame doesn't want it.
    // NOTE/INTRO arrive with the free bolt; OUTRO arrives with the full Survive
    // lockup (wordmark · the promise · the url) on a BARE frame. Both are
    // ordinary elements — delete, move, recolour, or start the frame over.
    const boltNode = frameKind === "outro"
      ? { id: cardId("el"), type: "logo", position: { x: 490, y: 300 }, selected: false, data: { kind: "logo", mode: "outro", w: 620, h: 300, stage: { ceqId: id, x: 490, y: 300, scale: 1 } } }
      : frameKind === "ceq" ? null
      : { id: cardId("el"), type: "logo", position: { x: 430, y: 250 }, selected: false, data: { kind: "logo", mode: "bolt", w: 90, h: 120, stage: { ceqId: id, x: 430, y: 250, scale: 1 } } };
    const newOrder = [...questions.slice(0, at), { id }, ...questions.slice(at)];
    const reindex = newOrder.map((q, idx) => (q.id === id ? null : patchDataCmd(rfl, q.id, { stageOrder: idx }, "reorder"))).filter((c): c is NonNullable<typeof c> => !!c);
    const add = addNodesCmd(rfl, (boltNode ? [node, boltNode] : [node]) as never, frameKind === "ceq" ? "add CEQ frame" : "add " + frameKind + " frame");
    const cmd = compositeCmd([add, ...reindex].filter((c): c is NonNullable<typeof c> => !!c), "insert frame");
    if (cmd) bus.dispatch(cmd);
    setQId(id);
    setExpandedQ((s) => new Set(s).add(id));
  };
  /** ADD AN ELEMENT to the open question's surface. The card is a normal canvas node
   *  (so every existing card feature keeps working) carrying `data.stage`, which is
   *  what puts it on the CEQ stage instead of loose on the canvas. Lands centred-ish
   *  and VISIBLE; the eye toggle in the strip hides it until Lee reveals it. */
  /** Put a card's data onto the OPEN frame's stage. Shared by "add new" and "paste". */
  const stageCardData = (card: Record<string, unknown>, label: string, size?: { w: number; h: number }, offset = 0) => {
    if (!qId || qId === LAYOUT_Q0) { setNote("Open a question first — elements are staged onto a frame."); return; }
    const sz = size ?? { w: 420, h: 260 };
    // Centre on the 1600×900 stage, nudged up so it doesn't bury the choices. A paste
    // offsets slightly so it can't land exactly on top of an existing element.
    const x = Math.round((frameW - sz.w) / 2) + offset;
    const y = Math.round((frameH - sz.h) / 2) - 60 + offset;
    const kind = String(card.kind ?? "note");
    const node = { id: cardId("el"), type: kind, position: { x, y }, selected: false, data: { ...card, stage: { ceqId: qId, x, y, scale: 1 } } };
    const cmd = addNodesCmd(rfl, [node] as never, label);
    if (cmd) bus.dispatch(cmd);
  };
  const addStageElement = (spec: StageElementSpec) => {
    const card = spec.make() as unknown as Record<string, unknown>;
    stageCardData(card, `add ${spec.label}`, spec.size);
    closeAdd();
    setNote(`Added ${spec.label} to this question — drag to place, ⧉ to copy it onto another frame, 👁 to hide it until you reveal it.`);
  };
  /** Copy a staged element (data only — a fresh card on paste, never a shared one). */
  const copyStageElement = (nid: string) => {
    const d = rf.getNode(nid)?.data as Record<string, unknown> | undefined;
    if (!d) return;
    const { stage: _stage, ...rest } = d;
    void _stage;
    const label = String(rest.title ?? rest.kind ?? "element");
    setElClip({ label, data: rest });
    lastClipRef.current = "el";
    setNote(`Copied "${label}" — open another frame and paste it from the Add menu.`);
  };
  const pasteStageElement = () => {
    if (!elClip) return;
    stageCardData(structuredClone(elClip.data), `paste ${elClip.label}`, undefined, 24);
    closeAdd();
    setNote(`Pasted "${elClip.label}" onto this question.`);
  };
  /** Elements staged on the OPEN question (for the show/hide row). */
  const stagedHere = useMemo(() => (qId && qId !== LAYOUT_Q0
    ? nodes.filter((n) => (n.data as { stage?: { ceqId?: string } } | undefined)?.stage?.ceqId === qId)
      .map((n) => ({ id: n.id, kind: (n.data as { kind?: string }).kind ?? "card", title: (n.data as { title?: string }).title, hidden: !!(n.data as { stage?: { hidden?: boolean } }).stage?.hidden }))
    : []), [qId, nodes]);
  const toggleStageHidden = (nid: string) => {
    const st = (rf.getNode(nid)?.data as { stage?: { ceqId: string; x: number; y: number; scale: number; hidden?: boolean } } | undefined)?.stage;
    if (!st) return;
    const c = patchDataCmd(rfl, nid, { stage: { ...st, hidden: !st.hidden } }, "show/hide element");
    if (c) bus.dispatch(c);
  };
  const removeStageElement = (nid: string) => { const c = removeNodesCmd(rfl, [nid], "remove element"); if (c) bus.dispatch(c); };


  /** MERGED RAIL (F2) — the per-CEQ attached clips, the other half of "what video
   *  exists for this CEQ?". It renders INSIDE the takes inbox so the two lists that
   *  answered the same question become one. Read-only here by design: reordering and
   *  deleting stay in Publish ▸ Clips, because a filming pass should not be one
   *  mis-click from dropping a take. */
  const clipsPanel = useMemo(() => {
    // LABELS MATCH THE SPINE (Lee, 08-16): a truncated stem told you nothing at a
    // glance. Notes get the note icon and their mode word; questions get Q1, Q2, …
    // numbered exactly as the filmstrip numbers them — notes never take a number,
    // so the two lists can never disagree about which frame is which.
    let ceqN = 0;
    const rows = questions.map((q) => {
      const d = rf.getNode(q.id)?.data as unknown as CeqCard | undefined;
      const noteOnly = !!d?.noteOnly;
      if (!noteOnly) ceqN += 1;
      return {
        id: q.id,
        run: d?.run,
        clips: cardClips(d),
        noteOnly,
        label: noteOnly ? (d?.frameMode ?? "note") : `Q${ceqN}`,
        stem: (d?.shorthand || d?.prompt || "frame").slice(0, 70), // the tooltip
      };
    });
    const filmed = rows.filter((r) => r.clips.length).length;
    return (
      <div className="mb-2 rounded" style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${NEON.borderSoft}` }}>
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.cyan }}>Attached clips</span>
          <span className="text-[8px] tabular-nums" style={{ color: NEON.muted }}>{filmed}/{rows.length} frames filmed</span>
        </div>
        <div className="max-h-[34vh] overflow-y-auto px-1 pb-1">
          {rows.map((r) => (
            <div key={r.id} className="mb-0.5 rounded px-1 py-0.5" style={{ background: r.id === qId ? "rgba(252,163,17,0.14)" : "transparent" }}>
              <button className="flex w-full items-center gap-1 text-left" onClick={() => setQId(r.id)} title={r.stem}>
                {r.noteOnly && <FileText className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} />}
                <span className="shrink-0 text-[9px] font-bold uppercase tabular-nums" style={{ color: r.id === qId ? NEON.yellow : NEON.muted }}>{r.label}</span>
                {r.run && <span className="shrink-0 rounded px-1 text-[7.5px] font-black" style={{ color: "#0B1322", background: NEON.cyan }} title={`Run ${r.run} — filmed in one take`}>{r.run}</span>}
                <span className="ml-auto shrink-0 text-[8px] font-bold tabular-nums" style={{ color: r.clips.length ? "#3BF5A0" : NEON.muted }}>{r.clips.length ? `${r.clips.length} clip${r.clips.length === 1 ? "" : "s"}` : "—"}</span>
              </button>
              {r.id === qId && r.clips.map((t, ci) => (
                <div key={t.path} className="ml-2 mt-0.5">
                  <button className="flex w-full items-center gap-1 text-left text-[9px]" style={{ color: NEON.muted }} onClick={() => setTakePreview((k) => (k === `${r.id}:${ci}` ? null : `${r.id}:${ci}`))} title="Preview this clip">
                    <Play className="h-2.5 w-2.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{ci + 1}. {t.name || "clip"}</span>
                    <span className="shrink-0 tabular-nums">{fmtDur(t.duration)}</span>
                    {t.slateEndMs != null && <span className="shrink-0" title="Filmed with the slate — this clip has a deterministic head trim">⏱</span>}
                  </button>
                  {takePreview === `${r.id}:${ci}` && <video src={t.url} controls playsInline preload="none" className="mt-0.5 w-full rounded" style={{ background: "#000", aspectRatio: "16 / 9", maxHeight: 150 }} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }, [questions, rf, qId, takePreview]);
  /** The filmstrip's mini-card data — read once per nodes change. */
  const stripItems = useMemo<StripItem[]>(() => questions.map((q) => {
    const d = rf.getNode(q.id)?.data as unknown as CeqCard | undefined;
    return { id: q.id, stem: d?.prompt ?? "", shorthand: d?.shorthand, run: d?.run, noteOnly: !!d?.noteOnly, frameMode: d?.frameMode, free: !!d?.free, clips: cardClips(d).length, starred: !!d?.starred };
  }), [questions, nodes]); // eslint-disable-line react-hooks/exhaustive-deps
  /** `coalesceKey` (optional) merges a keystroke burst into ONE undo step — pass it
   *  from live-committing text fields so a typed stem isn't 60 Ctrl+Z presses. */
  const patchQ = (id: string, patch: Record<string, unknown>, coalesceKey?: string) => { const c = patchDataCmd(rfl, id, patch, "edit question", coalesceKey); if (c) bus.dispatch(c); };
  /** Duplicate a question into the same set (fresh stem/choices, EMPTY chains) — a
   *  fast start for a similar question. */
  const duplicateQuestion = (srcId: string) => {
    const src = rf.getNode(srcId); if (!src || !deck) return;
    const sd = src.data as unknown as CeqCard;
    const i = questions.findIndex((q) => q.id === srcId);
    const insertAt = i < 0 ? questions.length : i + 1; // DIRECTLY below the source
    const id = cardId("ceq");
    const pos = { x: 520, y: 210 };
    const node = { id, type: "ceq", position: pos, selected: false, data: { kind: "ceq", title: deck.name, prompt: sd.prompt, choices: sd.choices.map((c) => ({ id: cardId("ch"), text: c.text, correct: c.correct })), scale: sd.scale, deckId: deck.id, deckMember: true, tucked: true, stageOrder: insertAt, slotIndex: insertAt, deckCategory: "ceq:studio", deckPos: pos } };
    // Renumber stageOrder = new index so the dupe lands right under the source and
    // everything below it shifts down one (instead of appending at the bottom).
    const newOrder = [...questions.slice(0, insertAt), { id }, ...questions.slice(insertAt)];
    const reindex = newOrder.map((q, idx) => (q.id === id ? null : patchDataCmd(rfl, q.id, { stageOrder: idx }, "reorder"))).filter((c): c is NonNullable<typeof c> => !!c);
    const add = addNodesCmd(rfl, [node] as never, "duplicate question");
    const cmd = compositeCmd([add, ...reindex].filter((c): c is NonNullable<typeof c> => !!c), "duplicate question");
    if (cmd) bus.dispatch(cmd);
    setQId(id);
    setExpandedQ((s) => new Set(s).add(id));
    setNote("Duplicated the question directly below (empty chains) — edit the stem.");
  };
  /* Single-question delete retired — `bulkDelete` handles one row or many through the bulk bar,
     with a count-bearing confirm. (Studio Consolidation B.) */
  /** Jump to the next/prev question in the set (Space / ‹ › in the previewer). */
  const gotoQuestion = (dir: 1 | -1) => {
    if (questions.length === 0) return;
    const i = questions.findIndex((q) => q.id === qId);
    // CLAMP, don't wrap: from Q0 (i<0, e.g. the Layout stage) both directions
    // land on Q1; Shift+Space back from Q1 STAYS at Q1 (never wraps to the last
    // question, never reaches the authoring-only Q0). Q0 isn't in `questions`.
    const ni = i < 0 ? 0 : Math.max(0, Math.min(questions.length - 1, i + dir));
    setQId(questions[ni].id);
    setExpandedQ((s) => new Set(s).add(questions[ni].id));
  };

  // ---- TAKE SLOTS (per-CEQ + per-set intro/outro + shared transition) --------
  /** Stage a dropped clip and APPEND it to a CEQ's clip stack (base first, lookbacks
   *  after). Migrates a legacy single `take` into the list. */
  const dropTake = async (ceqId: string, file: File) => {
    if (takeBusy) return; setTakeBusy(ceqId); setNote("Uploading clip to Supabase…");
    try {
      const fresh = await stageTake(file);
      const clips = cardClips(rf.getNode(ceqId)?.data as unknown as CeqCard | undefined);
      patchQ(ceqId, { takes: [...clips, fresh], take: undefined });
      setNote(`Attached clip ${clips.length + 1} (${fmtDur(fresh.duration)}) — ✓ to manage the stack.`);
    } catch (e) { setNote(`Clip upload failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setTakeBusy(null); }
  };
  /** Remove one clip from a CEQ's stack. */
  const removeClip = (ceqId: string, idx: number) => { const clips = cardClips(rf.getNode(ceqId)?.data as unknown as CeqCard | undefined); patchQ(ceqId, { takes: clips.filter((_, i) => i !== idx), take: undefined }); };
  /** Reorder a clip within a CEQ's stack (base ↔ lookbacks). */
  const reorderClip = (ceqId: string, idx: number, dir: -1 | 1) => { const clips = [...cardClips(rf.getNode(ceqId)?.data as unknown as CeqCard | undefined)]; const j = idx + dir; if (j < 0 || j >= clips.length) return; [clips[idx], clips[j]] = [clips[j], clips[idx]]; patchQ(ceqId, { takes: clips, take: undefined }); };
  /** Set which earlier questions a clip references (reference picker, per clip). */
  const setClipRefs = (ceqId: string, idx: number, refs: string[]) => { const clips = cardClips(rf.getNode(ceqId)?.data as unknown as CeqCard | undefined).map((t, i) => (i === idx ? { ...t, refs: refs.length ? refs : undefined } : t)); patchQ(ceqId, { takes: clips, take: undefined }); };
  /** Stage a dropped clip into a set's INTRO/OUTRO (per set), the shared TRANSITION,
   *  the set's WRAP stack (0..n, appended), or the LOOKBACK vertical promo (staging
   *  only, re-downloadable — no pipeline). */
  const dropSlot = async (kind: "intro" | "outro" | "wrap" | "lookback", file: File) => {
    const key = `${kind}:${setId}`;
    if (takeBusy || !deck) return;
    setTakeBusy(key); setNote(`Uploading ${kind}…`);
    try {
      const fresh = await stageTake(file);
      if (kind === "wrap" && deck) setDecks((prev) => updateDeck(prev, deck.id, { wrap: [...(deck.wrap ?? []), fresh] }));
      else if (kind === "lookback" && deck) setDecks((prev) => updateDeck(prev, deck.id, { lookback: withPrev(fresh, deck.lookback) }));
      else if (deck && (kind === "intro" || kind === "outro")) setDecks((prev) => updateDeck(prev, deck.id, { [kind]: withPrev(fresh, deck[kind]) }));
      setNote(`Attached ${kind} (${fmtDur(fresh.duration)}).`);
    } catch (e) { setNote(`${kind} upload failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setTakeBusy(null); }
  };
  /** Remove one clip from the set's WRAP stack. */
  const removeWrapClip = (idx: number) => { if (!deck) return; setDecks((prev) => updateDeck(prev, deck.id, { wrap: (deck.wrap ?? []).filter((_, i) => i !== idx) })); };
  /** Clear every STAR in the current set (confirm-guarded). Stars are inert notes. */
  const clearAllStars = () => {
    const starred = questions.filter((q) => (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.starred);
    if (starred.length === 0) { setNote("No stars to clear."); return; }
    if (!window.confirm(`Clear the ${starred.length} star${starred.length === 1 ? "" : "s"} in "${deck?.name ?? "this set"}"?`)) return;
    const cmd = compositeCmd(starred.map((q) => patchDataCmd(rfl, q.id, { starred: false }, "clear star")).filter((c): c is NonNullable<typeof c> => !!c), "clear all stars");
    if (cmd) bus.dispatch(cmd);
    setNote(`Cleared ${starred.length} star${starred.length === 1 ? "" : "s"}.`);
  };
  const clearTake = (ceqId: string) => { patchQ(ceqId, { take: undefined, takes: undefined }); if (takePreview === ceqId) setTakePreview(null); };

  // ---- BATCH TAKE INGEST (Lee) ------------------------------------------------
  /** Question number from a filename: "1.03"→3 (topic.question), "q3"→3, leading
   *  "03"/"3-"→3. Null when no number is found. */
  /** Build the CONFIRM table from dropped files — NOTHING uploads until confirmed.
   *  Match order: (a) filename question number → that question; (b) else deck order
   *  onto questions missing base clips. Durations read from metadata for the table. */
  const matchIngest = async (files: File[]) => {
    if (files.length === 0 || !deck) return;
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const taken = new Set<string>();
    const rows: NonNullable<typeof ingest> = sorted.map((f) => {
      const n = ingestNumOf(f.name);
      let qid: string | null = null;
      if (n != null && n >= 1 && n <= questions.length) { const cand = questions[n - 1].id; if (!taken.has(cand)) { qid = cand; taken.add(cand); } }
      return { file: f, name: f.name, duration: 0, qId: qid, lookback: false, include: true, status: "pending" as const };
    });
    const missing = questions.filter((q) => !taken.has(q.id) && cardClips(rf.getNode(q.id)?.data as unknown as CeqCard | undefined).length === 0).map((q) => q.id);
    let mi = 0;
    for (const r of rows) if (!r.qId && mi < missing.length) { r.qId = missing[mi]; mi += 1; }
    setIngest(rows); // show the table immediately…
    const withDur = await Promise.all(rows.map(async (r) => ({ ...r, duration: await readDuration(r.file) })));
    setIngest((cur) => (cur && cur.length === withDur.length && cur.every((c, i) => c.file === withDur[i].file) ? withDur.map((w, i) => ({ ...w, qId: cur[i].qId, lookback: cur[i].lookback, include: cur[i].include })) : cur)); // …then fill durations without clobbering edits
  };
  /** CONFIRMED upload: sequential staging; failures mark the row and RETRY re-runs
   *  ONLY failures/pending (done rows are never re-uploaded). Base = clips[0]
   *  (replaces the base, keeping one prev); lookback-toggled rows append. */
  const runIngest = async () => {
    if (!ingest || ingestBusy) return;
    setIngestBusy(true);
    const rows = [...ingest];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.include || !r.qId || r.status === "done") continue;
      rows[i] = { ...r, status: "uploading", error: undefined }; setIngest([...rows]);
      try {
        const fresh = await stageTake(r.file);
        const d = rf.getNode(r.qId)?.data as unknown as CeqCard | undefined;
        const clips = cardClips(d);
        const takes = r.lookback ? [...clips, fresh] : clips.length === 0 ? [fresh] : [withPrev(fresh, clips[0]), ...clips.slice(1)];
        patchQ(r.qId, { takes, take: undefined });
        rows[i] = { ...rows[i], status: "done" };
      } catch (e) {
        rows[i] = { ...rows[i], status: "error", error: e instanceof Error ? e.message : String(e) };
      }
      setIngest([...rows]);
    }
    setIngestBusy(false);
    const done = rows.filter((r) => r.status === "done").length;
    const err = rows.filter((r) => r.status === "error").length;
    setNote(`Batch ingest: ${done} clip${done === 1 ? "" : "s"} attached${err ? ` · ${err} failed — Retry uploads only the failures` : ""}.`);
  };

  /** GLOBAL clip inheritance (Lee) — intro/outro resolve to `local ?? global`.
   *  Toggle the globe on a slot: if the set is already INHERITING the global, turn
   *  the shared global OFF for everyone; otherwise PROMOTE this slot's resolved clip
   *  to the shared global AND drop this set's local so it inherits the global too
   *  (every set then reads the one file). Stored in the SCENE (globalClips), the
   *  same shared place the transition lives — persists across sessions/deploys. */
  const toggleGlobal = (kind: "intro" | "outro") => {
    if (!deck) return;
    const local = kind === "intro" ? deck.intro : deck.outro;
    const global = kind === "intro" ? gc.intro : gc.outro;
    if (!local && global) { // inheriting → clear the shared global for all sets
      setGlobalClips?.(kind === "intro" ? { intro: undefined } : { outro: undefined });
      setNote(`Cleared the global ${kind} — sets no longer inherit it.`);
      return;
    }
    const resolved = local ?? global;
    if (!resolved) return;
    setGlobalClips?.(kind === "intro" ? { intro: resolved } : { outro: resolved });
    setDecks((prev) => updateDeck(prev, deck.id, kind === "intro" ? { intro: undefined } : { outro: undefined }));
    setNote(`Global ${kind} set → every set without its own now inherits "${resolved.name ?? "the clip"}".`);
  };
  /** Clear a set's LOCAL intro/outro override — the slot falls back to the global. */
  const clearSlotLocal = (kind: "intro" | "outro") => {
    if (!deck) return;
    setDecks((prev) => updateDeck(prev, deck.id, kind === "intro" ? { intro: undefined } : { outro: undefined }));
    const global = kind === "intro" ? gc.intro : gc.outro;
    setNote(global ? `Cleared this set's ${kind} — it falls back to the global.` : `Cleared this set's ${kind}.`);
  };

  /** BASELINE LAYOUT writes ride the undo bus like every other canvas edit (Ctrl+Z
   *  restores the previous baseline). Same-set writes coalesce, so a sculpting burst
   *  of drags is one undo step; a no-op write (drag back to the same spot) is skipped
   *  entirely so it never pollutes the stack. */
  const saveBaselineLayout = (deckId: string, layout: DeckLayout) => {
    const before = decks.find((d) => d.id === deckId)?.layout;
    if (JSON.stringify(before ?? null) === JSON.stringify(layout ?? null)) return;
    bus.dispatch({
      label: "baseline layout",
      do: () => setDecks((prev) => updateDeck(prev, deckId, { layout })),
      undo: () => setDecks((prev) => updateDeck(prev, deckId, { layout: before })),
      coalesceKey: `baseline:${deckId}`,
    });
    setNote("Saved as the set's baseline layout — every question deals here now.");
  };

  /** INSTANCE GEOMETRY write — one question's own card/memo spots. Rides the bus like
   *  every other card edit (so Ctrl+Z works), skips no-op writes so a drag-and-back
   *  never pollutes the stack, and coalesces per question so a sculpting burst is ONE
   *  undo step. NEVER touches deck.layout: the template is Question 0's business. */
  const saveInstanceGeom = (questionId: string, g: CeqInstanceGeom) => {
    const before = (rf.getNode(questionId)?.data as unknown as CeqCard | undefined)?.geom;
    if (JSON.stringify(before ?? null) === JSON.stringify(g ?? null)) return;
    const c = patchDataCmd(rfl, questionId, { geom: g }, "move CEQ geometry", `geom:${questionId}`);
    if (c) bus.dispatch(c);
  };



  /** F3 — the stitch being previewed. Null = the panel is closed. */
  const [previewStitch, setPreviewStitch] = useState<StitchDef | null>(null);

  /** Every take in this set, by storage path — what a stitch's items resolve
   *  against. Built from the cards, so a stitch can never reference a clip that
   *  is not really attached somewhere. */
  const takesByPath = useMemo(() => {
    const m = new Map<string, TakeRef>();
    for (const q of questions) for (const t of cardClips(rf.getNode(q.id)?.data as unknown as CeqCard | undefined)) m.set(t.path, t);
    if (deck?.intro) m.set(deck.intro.path, deck.intro);
    for (const w of deck?.wrap ?? []) m.set(w.path, w);
    if (deck?.outro) m.set(deck.outro.path, deck.outro);
    return m;
  }, [questions, rf, deck]);

  /** Open the preview for a CEQ (or the whole set). An existing stitch is used
   *  as-is; otherwise one is DERIVED from the clip stack and previewed WITHOUT
   *  being saved — previewing must never write. */
  const openStitchPreview = (scope: { kind: "ceq"; ceqId: string } | { kind: "set" }) => {
    if (!deck) return;
    const id = scope.kind === "ceq" ? ceqStitchId(scope.ceqId) : setStitchId(deck.id);
    const existing = (deck.stitches ?? []).find((x) => x.id === id);
    if (existing) { setPreviewStitch(existing); return; }
    const clips = scope.kind === "ceq"
      ? cardClips(rf.getNode(scope.ceqId)?.data as unknown as CeqCard | undefined)
      : [deck.intro, ...questions.flatMap((q) => cardClips(rf.getNode(q.id)?.data as unknown as CeqCard | undefined)), ...(deck.wrap ?? []), deck.outro].filter((t): t is TakeRef => !!t);
    if (!clips.length) { setNote("Nothing to preview — that has no clips attached yet."); return; }
    setPreviewStitch(newStitch(id, scope, scope.kind === "ceq" ? itemsFromTakes(clips, scope.ceqId) : clips.map((c) => ({ takePath: c.path })), scope.kind === "set" ? "set cut" : undefined));
  };

  /** Persist an edited stitch onto the set. The panel already routed the edit
   *  through `recut`, so the rev is bumped and derived publications are stale. */
  const saveStitch = (next: StitchDef) => {
    setPreviewStitch(next);
    if (!deck) return;
    const list = deck.stitches ?? [];
    const has = list.some((x) => x.id === next.id);
    setDecks((prev) => updateDeck(prev, deck.id, { stitches: has ? list.map((x) => (x.id === next.id ? next : x)) : [...list, next] }));
  };
  /** STITCH / PUBLICATION MIGRATION (08-16) — gather the WHOLE scene into the pure
   *  planner. Reading only: this builds the input, `migrationPlan` builds the records,
   *  and nothing is written until applyStitchMigration runs. */
  const buildMigrationInput = (): MigrationInput => {
    const all = rf.getNodes();
    const lessons: MigrationInput["lessons"] = [];
    for (const d of cardDecks) {
      for (const access of ["FREE", "PAID"] as const) {
        const lid = targetLessonFor(d, access);
        if (!lid) continue;
        const ld = rf.getNode(lid)?.data as unknown as LessonBox | undefined;
        if (!ld) continue;
        if (lessons.some((x) => x.id === lid)) continue; // one lesson, one row
        lessons.push({ id: lid, deckId: d.id, access, muxAssetId: ld.muxAssetId ?? null, muxPlaybackId: ld.muxPlaybackId ?? null, ...(ld.muxPublishedAt != null ? { muxPublishedAt: ld.muxPublishedAt } : {}), ...(ld.muxDurationS != null ? { muxDurationS: ld.muxDurationS } : {}), ...(ld.ceqManifest ? { ceqManifest: ld.ceqManifest } : {}) });
      }
    }
    const cards: MigrationInput["cards"] = [];
    for (const nd of all) {
      if (nd.type !== "ceq") continue;
      const cd = nd.data as unknown as CeqCard & { deckId?: string };
      if (!cd?.deckId) continue;
      const takes = cardClips(cd);
      if (!takes.length && !cd.stitched) continue;
      cards.push({ id: nd.id, deckId: cd.deckId, ...(cd.run ? { run: cd.run } : {}), takes, ...(cd.stitched ? { stitched: cd.stitched } : {}), ...(cd.dissect?.moments?.length ? { moments: cd.dissect.moments.map((m) => ({ id: m.id, ...(m.startMs != null ? { startMs: m.startMs } : {}), ...(m.label ? { label: m.label } : {}) })) } : {}) });
    }
    return { decks: cardDecks.map((d) => ({ id: d.id, name: d.name, stitches: d.stitches, publications: d.publications, intro: d.intro, outro: d.outro, wrap: d.wrap, lookback: d.lookback })), cards, lessons };
  };

  /** DRY RUN — builds the plan and shows the table. Writes NOTHING. */
  const dryRunStitchMigration = () => {
    const plan = migrationPlan(buildMigrationInput());
    setMigration(plan);
    setNote(`Dry run: ${plan.totals.ceqStitches} ceq-stitches · ${plan.totals.setStitches} set-stitches · ${plan.totals.publications} publications would be ADDED. Nothing written.`);
  };

  /** APPLY — the same plan object the report was printed from, so what lands is
   *  exactly what Lee read. One undoable write per set; no take, no lesson field and
   *  no existing record is touched. */
  const applyStitchMigration = (plan: MigrationPlan) => {
    let sets = 0;
    setDecks((prev) => {
      let next = prev;
      for (const p of plan.perDeck) {
        if (!p.ceqStitches.length && !p.setStitches.length && !p.publications.length) continue;
        const d = next.find((x) => x.id === p.deckId);
        if (!d) continue;
        next = updateDeck(next, p.deckId, applyToDeck({ id: d.id, name: d.name, stitches: d.stitches, publications: d.publications }, p));
        sets++;
      }
      return next;
    });
    setMigration(null);
    setNote(`Migration applied to ${sets} set${sets === 1 ? "" : "s"}: ${plan.totals.ceqStitches + plan.totals.setStitches} stitches + ${plan.totals.publications} publications ADDED. No take, no lesson field and no existing record was changed — re-running it now would plan nothing.`);
  };
  /** APPLY THE LAYOUT TO EVERY QUESTION — re-stamp each question's instance from the
   *  template. Confirm-guarded (it overwrites hand-placed geometry) and ONE composite,
   *  so a single Ctrl+Z puts every question back exactly where it was. Questions the
   *  stamp wouldn't change are skipped, so the undo entry only covers real edits. */
  const applyLayoutToAll = (opts?: { silent?: boolean }) => {
    if (!deck) return 0;
    const cmds: NonNullable<ReturnType<typeof patchDataCmd>>[] = [];
    let optedOut = 0;
    for (const q of questions) {
      const d = rf.getNode(q.id)?.data as unknown as CeqCard | undefined; if (!d) continue;
      if (d.ignoreLayout) { optedOut++; continue; } // per-frame opt-out (layout rework)
      const chainCount = (d.choices ?? []).reduce((n, c) => n + (c.chain?.length ?? 0), 0);
      const g = stampFromTemplate(deck.layout, chainCount, frameW, frameH);
      // FORCE-STAMP every question (was: skip when geom already matched — that left
      // the question Lee "Set layout" FROM looking divergent from the rest, since a
      // matching question was silently skipped instead of re-conformed).
      const c = patchDataCmd(rfl, q.id, { geom: g }, "apply layout"); if (c) cmds.push(c);
    }
    if (cmds.length === 0) { if (!opts?.silent) setNote("No questions to stamp."); return 0; }
    const cmd = compositeCmd(cmds, `apply layout to ${cmds.length} question${cmds.length === 1 ? "" : "s"}`);
    if (cmd) bus.dispatch(cmd);
    setNote(`Re-stamped ${cmds.length} question${cmds.length === 1 ? "" : "s"} from the layout${optedOut ? ` (${optedOut} opted out, untouched)` : ""} — one Ctrl+Z puts them all back.`);
    return cmds.length;
  };
  /** LAYOUT MODE toggle — a PLAIN toggle now (layout rework). The apply decision
   *  lives at SAVE TIME (the Done → apply-choice panel), never at toggle time,
   *  and never in a window.confirm. Application stays author-time only. */
  const setLayoutMode = (on: boolean) => {
    if (!deck) return;
    setDecks((prev) => updateDeck(prev, deck.id, { layoutMode: on }));
    setNote(on ? "Layout overlay ON — future deals conform to the base frame. Edit it via View ▸ Edit set layout…" : "Layout overlay OFF — deals land where each question was last authored.");
  };

  /** The set's assigned spine rows (courseId/topicId → the real course + chapter). */
  const spineRows = (d: DeckDef | null): { course: CourseOption; topic: CourseOption["chapters"][number] } | null => {
    if (!d?.topicId) return null;
    const course = courseOptions.find((c) => c.id === d.courseId) ?? courseOptions.find((c) => c.chapters.some((ch) => ch.id === d.topicId));
    const topic = course?.chapters.find((ch) => ch.id === d.topicId);
    return course && topic ? { course, topic } : null;
  };
  /** Which lesson a Free/Full publish attaches to — resolved from the set's OUTLINE
   *  assignment (courseId/topicId): the CEQ lesson of the matching access whose topic
   *  string points at the assigned topic (same matcher the Videos tab uses, so attach
   *  targeting and video filing agree). Falls back to the set's explicitly LINKED
   *  lesson when its access matches. NEVER a first-match scan: nothing resolves ⇒
   *  null, and publish blocks loud (both accesses — PAID included). */
  const targetLesson = (access: "FREE" | "PAID"): string | null => targetLessonFor(deck, access);
  /** The lesson a set's Free/Full publish attaches to. Parameterised by deck so
   *  the stitch migration can resolve every set in the scene, not only the open
   *  one — it is the SAME resolver publish uses, so the migration cannot invent a
   *  different mapping than the one that actually shipped. */
  const targetLessonFor = (deck: DeckDef | null | undefined, access: "FREE" | "PAID"): string | null => {
    const rows = spineRows(deck ?? null);
    if (rows) {
      const cand = rf.getNodes().find((n) => {
        const ld = n.data as unknown as LessonBox;
        return n.type === "lesson" && ld.category === "CEQ" && (ld.access ?? "FREE") === access && !!ld.topic && vidTopicMatch(rows.course, ld.topic)?.id === rows.topic.id;
      });
      if (cand) return cand.id;
    }
    const dl = deck?.lessonId ? rf.getNode(deck.lessonId) : null;
    const dld = dl?.data as unknown as LessonBox | undefined;
    return dl && dld?.category === "CEQ" && (dld.access ?? "FREE") === access ? dl.id : null;
  };

  /** PUBLISH the Free/Full stitch: Mux concat (hard-cut) → Auphonic → Supabase → Mux
   *  → attach to the Free/Paid lesson + store the manifest. FAILS LOUD on any missing
   *  clip (no silent skips at publish, unlike preview). Runs on the deployed env. */
  const publishStitch = async (mode: "free" | "full"): Promise<boolean> => {
    if (publishBusy || !deck) return false;
    // LIBRARY sets are not publishable — publish attaches to a lesson under a topic.
    if (!deck.topicId) { setNote("Publish blocked — assign this set to a Course → Topic first (it's in the Library)."); return false; }
    const stitch = mode === "free" ? stitchFree : stitchFull;
    if (stitch.missing.length > 0) { setNote(`Publish blocked — ${stitch.missing.length} CEQ(s) in the ${mode} cut have no clip: ${stitch.missing.map((m) => (m.prompt || "?").slice(0, 18)).join(", ")}. Attach clips first.`); return false; }
    if (stitch.items.filter((i) => i.kind === "ceq").length === 0) { setNote(`No CEQ clips in the ${mode} cut.`); return false; }
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    // Resolve the target lesson + the Mux passthrough scheme UP FRONT — no lesson ⇒
    // block HERE, before any Mux/Auphonic money is spent (both accesses; a PAID gap
    // is a loud block, never a publish-without-attach).
    const access = mode === "free" ? "FREE" : "PAID";
    const rows = spineRows(deck);
    const lessonId = targetLesson(access);
    if (!lessonId) { setNote(`Publish blocked — no ${access} CEQ lesson found under ${rows ? `${courseLabel(rows.course)} / ${topicLabel(rows.topic)}` : "this set's topic"} to attach to. Create one (category CEQ, access ${access}, topic "${rows ? topicLabel(rows.topic) : "this topic"}") or link one to this set.`); return false; }
    const ld = rf.getNode(lessonId)?.data as unknown as LessonBox | undefined;
    // Passthrough + library-grouping strings come from the SPINE (the Videos tab's
    // matchers round-trip them exactly), never from legacy free-text tags — a
    // migrated-but-never-reassigned set must not file its video under "Unfiled".
    const course = rows?.course.course_name || deck.course || "Course";
    const topic = rows ? `Ch ${rows.topic.number}` : (ld?.topic || deck.chapter || "Topic");
    const lessonName = ld?.label || deck.name;
    const sanitize = (s: string) => s.replace(/\//g, "-").trim();
    const passthrough = `${sanitize(course)}/${sanitize(topic)}/${sanitize(lessonName)}/${mode}`.slice(0, 250);
    const title = `${lessonName} — ${mode === "free" ? "Free" : "Full"} CEQ`;
    // WARP INTRO (opt-in) — run the intro clip (items[0]) through the warp_intro stage
    // (reversed tail + white-flash snap + forward clip + music bed). It is only actually
    // APPLIED when the render worker is up (the legacy Mux concat can't stage), so the
    // runtime + chapter-manifest accounting for the added reversed tail is deferred until
    // after the worker probe (warpApplied) — otherwise a legacy fallback would store
    // offsets 1.82s late for a video that plays the intro forward.
    const warpOn = !!prefs.warpIntro && stitch.items[0]?.kind === "intro";
    setPublishBusy(mode); setNote(`Publishing ${mode} — detecting the Auphonic preset…`);
    try {
      // Don't double intro/outro if the Auphonic preset already prepends/appends them.
      const slots = await detectAuphonicSlots();
      let items = stitch.items;
      if (slots.hasOutro) items = items.filter((i) => i.kind !== "outro");
      // Keep the intro clip when warping (the worker consumes it); only strip it when
      // Auphonic prepends its own intro.
      if (slots.hasIntro && !warpOn) items = items.filter((i) => i.kind !== "intro");
      // HARD GATE before any render/Auphonic/Mux spend: warp keeps the app intro to warp it,
      // so if Auphonic ALSO prepends one you'd get two intros + a manifest short by the
      // Auphonic intro's length. Block, like every other publish gate.
      if (warpOn && slots.hasIntro) { setNote("Publish blocked — Warp intro is ON but the Auphonic preset also prepends an intro (you'd get two, and the chapter offsets would be wrong). Remove the intro from the Auphonic preset, or turn off warp."); return false; }
      const urls = items.map((i) => i.take.url);
      // 1) RENDER the stitch. Worker configured → the Fly ffmpeg worker (REAL
      //    crossfades at DEFAULT_CROSSFADE_MS, matching the manifest's offsets;
      //    the home of the queued brand-intro/music-bed stages). Not configured →
      //    the legacy Mux multi-input concat (hard cut). Configured-but-down →
      //    throw HERE, before any money is spent — never a silent fallback.
      let stitchedUrl: string; let renderNote: string;
      // wake-aware probe: a cold worker (self-exited when idle) boots on the
      // first request — "unreachable" retries ~30s before it counts as down.
      const wp = await wakeRenderWorker((n) => setNote(`Render worker: ${n}`));
      if (wp.configured && !wp.healthy) throw new Error(`Render worker configured but not healthy — fix it or unset RENDER_WORKER_URL. (${wp.detail})`);
      if (warpOn && !wp.configured) setNote("Warp intro needs the render worker (the legacy Mux concat can't stage) — publishing without the warp.");
      // The warp is only APPLIED on the worker path; drive runtime + manifest off this, not
      // the mere intent, so a legacy fallback doesn't inflate offsets/duration by the tail.
      const warpApplied = warpOn && wp.configured;
      const runtimeS = Math.round((warpApplied ? WARP_REVERSED_TAIL_S : 0) + stitchRuntime(stitch.items) - Math.max(0, stitch.items.length - 1) * (DEFAULT_CROSSFADE_MS / 1000));
      if (wp.configured) {
        // shared render/poll loop (render-worker-client): 60-min budget above
        // the worker's 50-min whole-job ceiling. WARP passes the music bed (served
        // from /audio) + the shared reversedTailS so worker + manifest agree.
        const warp = warpApplied ? { bedUrl: `${window.location.origin}/audio/intro-music.mp3`, reversedTailS: WARP_REVERSED_TAIL_S } : undefined;
        stitchedUrl = await renderStitchViaWorker(items, mode, (n) => setNote(`Render worker: ${n}`), warp);
        renderNote = `ffmpeg worker (${items.length} clips${warpApplied ? " + warp intro" : ""}, ${DEFAULT_CROSSFADE_MS}ms crossfades)`;
      } else {
        const { assetId } = await startCeqConcat({ data: { urls, passthrough: `ceq-concat-${mode}` } });
        let mp4Url: string | null = null;
        for (let i = 0; i < 120 && !mp4Url; i++) { const r: Awaited<ReturnType<typeof resolveCeqConcat>> = await resolveCeqConcat({ data: { assetId } }); if (r.status === "errored") throw new Error(r.error ?? "Mux concat failed"); if (r.status === "ready") { mp4Url = r.mp4Url; break; } setNote(`Mux concatenating ${items.length} clips…`); await sleep(4000); }
        if (!mp4Url) throw new Error("Timed out waiting for the Mux concat.");
        stitchedUrl = mp4Url; renderNote = `Mux concat asset ${assetId} (legacy hard cut — render worker not configured)`;
      }
      // 2) Auphonic → Supabase → FINAL Mux (reuse the staged pipeline; carry passthrough + title)
      const { auphonicUuid } = await startPipelineTestAuphonic({ data: { fileUrl: stitchedUrl } });
      let muxAssetId: string | null = null; let final: string | null = null;
      for (let i = 0; i < 240 && !final; i++) { const r: Awaited<ReturnType<typeof resolvePipelineTestAuphonic>> = await resolvePipelineTestAuphonic({ data: { auphonicUuid, muxAssetId, passthrough, title } }); muxAssetId = r.muxAssetId; if (r.stage === "errored") throw new Error(r.error ?? "Pipeline errored"); if (r.stage === "ready") { final = r.playbackId; break; } setNote(r.stage === "auphonic" ? `Auphonic: ${r.auphonicStatus ?? "processing"}…` : "Mux ingesting the processed file…"); await sleep(5000); }
      if (!final) throw new Error("Timed out waiting for the final Mux asset.");
      // 3) manifest + attach to the Free/Paid CEQ lesson (+ library metadata).
      // lessonId is guaranteed — publish blocks up front when nothing resolves.
      // Warp adds the reversed tail to the intro's rendered length — add it to the intro's
      // duration ONLY when the warp was actually applied (worker path) so the chapter offsets
      // match the rendered file; on the legacy Mux fallback the intro is native length.
      const manifestItems = warpApplied
        ? stitch.items.map((it) => (it.kind === "intro" ? { ...it, take: { ...it.take, duration: (it.take.duration ?? 0) + WARP_REVERSED_TAIL_S } } : it))
        : stitch.items;
      const manifest = stitchManifest(manifestItems, DEFAULT_CROSSFADE_MS);
      const prevAsset = ld?.muxAssetId ?? null;
      rf.updateNodeData(lessonId, { muxAssetId, muxPlaybackId: final, status: "PUBLISHED", ceqManifest: manifest, muxPublishedAt: Date.now(), muxDurationS: runtimeS, videoCourse: course, videoChapter: topic });
      setNote(`Published ${mode} ✓ → attached to the ${access} lesson (${manifest.length} CEQs indexed). passthrough "${passthrough}".${prevAsset ? ` Old Mux asset ${prevAsset} superseded — delete it in Mux manually.` : ""} Render: ${renderNote}.`);
      return true;
    } catch (e) { setNote(`Publish ${mode} failed: ${e instanceof Error ? e.message : String(e)}`); return false; }
    finally { setPublishBusy(null); }
  };
  /** PREFLIGHT for the Free+Full combo — every gate the two publishes will hit,
   *  checked up front with specifics. Recomputed live at render. */
  const comboChecks = () => [
    { label: "Assigned to a Course → Topic", ok: !!deck?.topicId, detail: deck?.topicId ? "" : "Library set — assign it first" },
    { label: "FREE lesson to attach to", ok: !!targetLesson("FREE"), detail: targetLesson("FREE") ? "" : "No FREE CEQ lesson under this topic — create or link one" },
    { label: "PAID lesson to attach to", ok: !!targetLesson("PAID"), detail: targetLesson("PAID") ? "" : "No PAID CEQ lesson under this topic — create or link one" },
    { label: `Free cut non-empty (${freeCount} flagged)`, ok: freeCount > 0, detail: freeCount > 0 ? "" : "Flag questions F for the free cut" },
    { label: "No missing clips — free cut", ok: stitchFree.missing.length === 0, detail: stitchFree.missing.map((m) => clip(m.prompt || "?", 18)).join(", ") },
    { label: "No missing clips — full cut", ok: stitchFull.missing.length === 0, detail: stitchFull.missing.map((m) => clip(m.prompt || "?", 18)).join(", ") },
    { label: "Intro resolved (local or global)", ok: !!resolvedIntro, detail: resolvedIntro ? "" : "Drop an intro or set a global" },
    { label: "Outro resolved (local or global)", ok: !!resolvedOutro, detail: resolvedOutro ? "" : "Drop an outro or set a global" },
    // Render worker: not configured = legacy Mux fallback (ok, says so) ·
    // healthy = worker renders (ok) · configured-but-down = BLOCKS (fail loud).
    { label: "Render worker", ok: !!workerState && (!workerState.configured || workerState.healthy), detail: workerState ? workerState.detail : "checking…" },
  ];
  /** Run the combo: Free first, then Full, statuses live. A Free failure STOPS the
   *  run (Full stays pending) so the partial state is unambiguous. */
  const runCombo = async () => {
    setCombo({ free: "running", full: "pending", running: true });
    const okFree = await publishStitch("free");
    if (!okFree) { setCombo({ free: "error", full: "pending", running: false }); return; }
    setCombo({ free: "done", full: "running", running: true });
    const okFull = await publishStitch("full");
    setCombo({ free: "done", full: okFull ? "done" : "error", running: false });
  };
  // (The test render moved into the PREVIEW pane — CeqStitch's ⚡ "true render",
  // Lee's original vision for preview: double-check the stitch as clips land.)
  const dragProps = (key: string, onFile: (f: File) => void) => ({
    onDragOver: (e: React.DragEvent) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); if (dragKey !== key) setDragKey(key); } },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragKey((k) => (k === key ? null : k)); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragKey(null); const f = videoFromDrop(e); if (f) void onFile(f); },
  });
  /** Reorder questions by dragging one row onto another (replaces the up/down arrows). */
  const moveQuestion = (srcId: string, targetId: string) => {
    if (srcId === targetId) return;
    const ids = questions.map((q) => q.id);
    const from = ids.indexOf(srcId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1); ids.splice(to, 0, srcId);
    const cmd = compositeCmd(ids.map((id, idx) => patchDataCmd(rfl, id, { stageOrder: idx }, "reorder")).filter((c): c is NonNullable<typeof c> => !!c), "reorder questions (drag)");
    if (cmd) bus.dispatch(cmd);
  };
  /** Merged DnD for a question row: a FILE drop appends a take clip (dragProps); a
   *  dragged ROW (QREORDER mime) reorders. dragProps only reacts to Files, so both
   *  coexist on one row. */
  const qRowDnd = (qid: string) => {
    const dp = dragProps(qid, (f) => dropTake(qid, f));
    return {
      onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(QREORDER)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragKey !== `qre:${qid}`) setDragKey(`qre:${qid}`); } else dp.onDragOver(e); },
      onDragLeave: (e: React.DragEvent) => { if (dragKey === `qre:${qid}`) { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragKey(null); } else dp.onDragLeave(e); },
      onDrop: (e: React.DragEvent) => { const src = e.dataTransfer.getData(QREORDER); if (src) { e.preventDefault(); setDragKey(null); moveQuestion(src, qid); } else dp.onDrop(e); },
    };
  };
  /** Reorder a chain memo within its choice (the outline "renumber"). */
  /** Reorder by MEMO ID (the on-memo ↑/↓ cluster) — finds the memo's choice + index
   *  and delegates to the existing reorder. */
  /** Move a memo earlier/later in the QUESTION'S FULL REVEAL WALK (choice order → within-
   *  choice chain order), not just within one choice's chain. Within a choice it's a simple
   *  swap; at a choice boundary it MOVES the memo into the neighbouring choice's chain so
   *  ↑/↓ traverse the entire walk. (Previously it only swapped within a single choice, so a
   *  memo that was alone in its choice's chain — one memo per choice — could never move.) */
  const reorderChainByMemo = (memoNodeId: string, dir: -1 | 1) => {
    if (!qId || qId === LAYOUT_Q0) return;
    const cc = (rf.getNode(qId)?.data as unknown as CeqCard | undefined)?.choices ?? [];
    const flat: { ci: number; p: number; id: string }[] = [];
    cc.forEach((ch, ci) => (ch.chain ?? []).forEach((it, p) => flat.push({ ci, p, id: it.memoNodeId })));
    const g = flat.findIndex((f) => f.id === memoNodeId);
    if (g < 0) return;
    const gj = g + dir;
    if (gj < 0 || gj >= flat.length) return; // already at the very top / bottom of the whole walk
    const a = flat[g], b = flat[gj];
    if (a.ci === b.ci) { reorderChainMemo(qId, cc[a.ci].id, a.p, dir); return; } // same choice → swap
    // cross-choice: splice the item out of choice a and into choice b beside its new neighbour.
    // dir -1 → land just before b (b.p); dir +1 → land just after b (b.p + 1).
    const toIndex = dir === -1 ? b.p : b.p + 1;
    const c = patchDataFnCmd(rfl, qId, (prev) => {
      const choices = (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => ({ ...ch, chain: [...(ch.chain ?? [])] }));
      const [item] = choices[a.ci].chain.splice(a.p, 1);
      if (!item) return { choices };
      choices[b.ci].chain.splice(toIndex, 0, item);
      return { choices };
    }, "reorder memo across choices");
    if (c) bus.dispatch(c);
  };
  const reorderChainMemo = (ceqId: string, choiceId: string, idx: number, dir: -1 | 1) => {
    const c = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => { if (ch.id !== choiceId) return ch; const arr = [...(ch.chain ?? [])]; const j = idx + dir; if (j < 0 || j >= arr.length) return ch; [arr[idx], arr[j]] = [arr[j], arr[idx]]; return { ...ch, chain: arr }; }) }), "renumber chain");
    if (c) bus.dispatch(c);
  };
  /** Flat walk list for a question (choice order → chain index) for the outline. */
  const walkOf = (q: { id: string }) => { const cc = (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.choices ?? []; const list: { choiceId: string; idx: number; label: string; letter: string; num: number; memoNodeId: string; sound?: ChainSound }[] = []; cc.forEach((ch, ci) => (ch.chain ?? []).forEach((it, i) => list.push({ choiceId: ch.id, idx: i, label: it.label, letter: LETTER(ci), num: list.length + 1, memoNodeId: it.memoNodeId, sound: it.sound }))); return list; };
  const patchChoice = (id: string, choiceId: string, patch: Partial<CeqChoice>, coalesceKey?: string) => { const c = patchDataFnCmd(rfl, id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => (ch.id === choiceId ? { ...ch, ...patch } : ch)) }), "edit choice", coalesceKey); if (c) bus.dispatch(c); };
  const setCorrect = (id: string, choiceId: string) => { const c = patchDataFnCmd(rfl, id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => ({ ...ch, correct: ch.id === choiceId })) }), "mark correct"); if (c) bus.dispatch(c); };
  const addChoice = (id: string) => { const c = patchDataFnCmd(rfl, id, (prev) => ({ choices: [...(prev as unknown as { choices: CeqChoice[] }).choices, { id: cardId("ch"), text: "" }] }), "add choice"); if (c) bus.dispatch(c); };
  const removeChoice = (id: string, choiceId: string) => { const c = patchDataFnCmd(rfl, id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.filter((ch) => ch.id !== choiceId) }), "remove choice"); if (c) bus.dispatch(c); };
  const reorderQ = (id: string, dir: -1 | 1) => {
    const arr = [...questions]; const i = arr.findIndex((q) => q.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const cmd = compositeCmd(arr.map((q, idx) => patchDataCmd(rfl, q.id, { stageOrder: idx }, "reorder")).filter((c): c is NonNullable<typeof c> => !!c), "reorder questions");
    if (cmd) bus.dispatch(cmd);
  };

  // ---- BULK QUESTION OPS (Lee) — every action = ONE undoable composite step. -----
  /** Patch every selected question (null patch = skip that question). Returns count. */
  const bulkPatchQ = (label: string, patch: (d: CeqCard | undefined) => Partial<CeqCard> | null) => {
    const cmds = [...qSel].map((id) => { const d = rf.getNode(id)?.data as unknown as CeqCard | undefined; const p = patch(d); return p ? patchDataCmd(rfl, id, p as never, label) : null; }).filter((c): c is NonNullable<typeof c> => !!c);
    const cmd = compositeCmd(cmds, label); if (cmd) bus.dispatch(cmd);
    return cmds.length;
  };
  const selData = () => [...qSel].map((id) => rf.getNode(id)?.data as unknown as CeqCard | undefined);
  const bulkStar = () => { const allOn = selData().every((d) => !!d?.starred); const n = bulkPatchQ(allOn ? "bulk unstar" : "bulk star", () => ({ starred: !allOn })); setNote(`${allOn ? "Unstarred" : "Starred"} ${n} question${n === 1 ? "" : "s"} (one undo).`); };
  const bulkFree = () => { const allOn = selData().every((d) => !!d?.free); const n = bulkPatchQ(allOn ? "bulk un-free" : "bulk free", () => ({ free: !allOn })); setNote(`${allOn ? "Removed" : "Added"} ${n} question${n === 1 ? "" : "s"} ${allOn ? "from" : "to"} the FREE cut.`); };
  const bulkBoss = () => { const allOn = selData().every((d) => !!d?.boss); const n = bulkPatchQ("bulk boss", () => ({ boss: !allOn })); setNote(`Boss ${allOn ? "off" : "on"} for ${n} question${n === 1 ? "" : "s"}.`); };
  const bulkChaching = () => { const allSilenced = selData().every((d) => d?.confirmSfx === false); const n = bulkPatchQ("bulk chaching", () => ({ confirmSfx: allSilenced ? true : false })); setNote(`Chaching-on-correct ${allSilenced ? "ON" : "OFF"} for ${n} question${n === 1 ? "" : "s"}.`); };
  // ---- RUN LETTERS (film-prep) — a RUN is the span captured in ONE take. --------
  // The decisions (which letter is next, what fill-down does to a half-lettered
  // set, when an assignment splits a run) live in film-runs.ts so they're tested;
  // this half is only dispatch + the toast. Cleared letters are written as "" —
  // every reader normalizes through normRun, and the readiness check already
  // treats blank as missing.
  const applyRunChange = (change: RunChange, label: string) => {
    const cmds = change.changes
      .map((c) => patchDataCmd(rfl, c.id, { run: c.run ?? "" } as never, label))
      .filter((c): c is NonNullable<typeof c> => !!c);
    const cmd = compositeCmd(cmds, label);
    if (cmd) bus.dispatch(cmd);
    return cmds.length;
  };
  /** Stamp the selection (or the open frame) with a letter; null clears it. */
  const assignRun = (letter: string | null) => {
    const ids = qSel.size > 0 ? [...qSel] : qId && qId !== LAYOUT_Q0 ? [qId] : [];
    if (ids.length === 0) { setNote("Pick frames in the strip first (ctrl-click / shift-click)."); return; }
    const L = normRun(letter);
    const change = assignRunTo(stripItems, ids, letter);
    const n = applyRunChange(change, L ? `assign run ${L}` : "clear run");
    if (n === 0) { setNote(L ? `Those frames are already run ${L}.` : "No run letter to clear there."); return; }
    const head = L
      ? `Run ${L} → ${n} frame${n === 1 ? "" : "s"}`
      : `Cleared the run letter on ${n} frame${n === 1 ? "" : "s"}`;
    setNote([`${head} (one undo).`, ...change.warnings].join(" "));
  };
  /** Every unlettered frame inherits the letter above it — the 256-frame path. */
  const fillRunsDown = () => {
    const n = applyRunChange(fillDownRuns(stripItems), "fill down runs");
    setNote(n === 0
      ? "Every frame in this set already has a run letter."
      : `Filled ${n} frame${n === 1 ? "" : "s"} down from the letters above (one undo).`);
  };
  /** SHUFFLE CHOICES (Lee) — reorder each selected question's choices so the correct
   *  answer stops living at A. Reordering the ARRAY is exactly right: the letter comes
   *  from array position, while every choice keeps its own id — so chained memos,
   *  memo→choice arrows (anchored on anc:<choiceId>) and per-choice sounds all follow
   *  their choice to its new letter. Nothing is rewritten, only reordered.
   *
   *  "None of these" style options stay pinned LAST (shuffling them mid-list reads as
   *  a typo on camera), and a shuffle that lands on the original order is retried so
   *  the action never silently does nothing. */
  const shuffleChoices = () => {
    const ids = qSel.size > 0 ? [...qSel] : qId && qId !== LAYOUT_Q0 ? [qId] : [];
    if (ids.length === 0) { setNote("Select questions in the strip first (ctrl-click / shift-click)."); return; }
    const isPinned = (t: string) => /^\s*none of (these|the above)/i.test(t);
    let moved = 0;
    const cmds = ids.map((id) => {
      const d = rf.getNode(id)?.data as unknown as CeqCard | undefined;
      const all = d?.choices ?? [];
      if (all.length < 2) return null;
      const pinned = all.filter((c) => isPinned(c.text));
      const pool = all.filter((c) => !isPinned(c.text));
      if (pool.length < 2) return null;
      const before = pool.map((c) => c.id).join("|");
      let next = pool;
      for (let attempt = 0; attempt < 6; attempt++) {
        next = [...pool];
        for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; }
        if (next.map((c) => c.id).join("|") !== before) break;
      }
      if (next.map((c) => c.id).join("|") === before) return null; // genuinely unshufflable
      moved += 1;
      return patchDataCmd(rfl, id, { choices: [...next, ...pinned] } as never, "shuffle choices");
    }).filter((c): c is NonNullable<typeof c> => !!c);
    const cmd = compositeCmd(cmds, "shuffle choices");
    if (cmd) bus.dispatch(cmd);
    setNote(moved ? `Shuffled choices on ${moved} question${moved === 1 ? "" : "s"} — chains + arrows followed their choice. One undo.` : "Nothing to shuffle.");
  };
  const bulkShort = () => { const allOn = selData().every((d) => !!d?.short); const n = bulkPatchQ("bulk short", () => ({ short: !allOn })); setNote(`Shorts flag ${allOn ? "cleared" : "set"} on ${n} question${n === 1 ? "" : "s"}.`); };
  const bulkClearClips = () => {
    const withClips = selData().filter((d) => cardClips(d).length > 0).length;
    if (withClips === 0) { setNote("No clips to clear in the selection."); return; }
    if (!window.confirm(`Clear ALL clips from ${withClips} selected question${withClips === 1 ? "" : "s"}? (Ctrl+Z restores; staged files stay in storage.)`)) return;
    const n = bulkPatchQ("bulk clear clips", (d) => (cardClips(d).length ? { takes: undefined, take: undefined } : null));
    setNote(`Cleared clips on ${n} question${n === 1 ? "" : "s"} (one undo).`);
  };
  const bulkSwapPrev = () => {
    const n = bulkPatchQ("bulk swap takes", (d) => {
      const clips = cardClips(d);
      if (!clips.some((t) => t.prev)) return null;
      const swapped = clips.map((t) => (t.prev ? { ...t.prev, refs: t.refs, prev: { url: t.url, path: t.path, name: t.name, duration: t.duration } } : t));
      return { takes: swapped, take: undefined };
    });
    setNote(n ? `Swapped to the previous take on ${n} question${n === 1 ? "" : "s"} (swap again to undo, or Ctrl+Z).` : "No prior takes exist in the selection.");
  };
  /** Vinyl on the LAST chain item of each selected question's CORRECT-choice chain. */
  const bulkVinylLast = () => {
    let skipped = 0;
    const cmds: NonNullable<ReturnType<typeof patchDataFnCmd>>[] = [];
    for (const id of qSel) {
      const d = rf.getNode(id)?.data as unknown as CeqCard | undefined;
      const correct = d?.choices.find((c) => c.correct);
      if (!correct || !(correct.chain?.length)) { skipped++; continue; }
      const p = patchDataFnCmd(rfl, id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => { if (!c.correct || !(c.chain?.length)) return c; return { ...c, chain: c.chain.map((it, i) => (i === (c.chain?.length ?? 0) - 1 ? { ...it, sound: "vinylScratch" as ChainSound } : it)) }; }) }), "vinyl on last"); if (p) cmds.push(p);
    }
    const cmd = compositeCmd(cmds, "vinyl on last chain item"); if (cmd) bus.dispatch(cmd);
    setNote(`💿 Vinyl set on the last correct-chain item of ${cmds.length} question${cmds.length === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped (no correct-choice chain)` : ""}.`);
  };
  /** DUPLICATE every selected question, each directly below its source. One undoable step.
   *  Built as a single composite so N dupes are ONE Ctrl+Z, not N. */
  const bulkDuplicate = () => {
    if (!deck || qSel.size === 0) return;
    // Walk the CURRENT order once and build the post-duplication order, so every clone lands
    // directly under its source and stageOrder stays dense for everything below.
    const order: { id: string; isNew: boolean; srcId?: string }[] = [];
    for (const q of questions) {
      order.push({ id: q.id, isNew: false });
      if (qSel.has(q.id)) order.push({ id: cardId("ceq"), isNew: true, srcId: q.id });
    }
    const pos = { x: 520, y: 210 };
    const nodes = order.filter((o) => o.isNew).map((o) => {
      const sd = rf.getNode(o.srcId as string)?.data as unknown as CeqCard | undefined;
      const idx = order.findIndex((x) => x.id === o.id);
      return { id: o.id, type: "ceq", position: pos, selected: false, data: { kind: "ceq", title: deck.name, prompt: sd?.prompt ?? "Question", choices: (sd?.choices ?? []).map((c) => ({ id: cardId("ch"), text: c.text, correct: c.correct })), scale: sd?.scale, deckId: deck.id, deckMember: true, tucked: true, stageOrder: idx, slotIndex: idx, deckCategory: "ceq:studio", deckPos: pos } };
    });
    const add = addNodesCmd(rfl, nodes as never, "duplicate questions");
    const reindex = order.map((o, idx) => (o.isNew ? null : patchDataCmd(rfl, o.id, { stageOrder: idx }, "reorder"))).filter((c): c is NonNullable<typeof c> => !!c);
    const cmd = compositeCmd([add, ...reindex].filter((c): c is NonNullable<typeof c> => !!c), "duplicate questions");
    if (cmd) bus.dispatch(cmd);
    setQSel(new Set());
    setNote(`Duplicated ${nodes.length} question${nodes.length === 1 ? "" : "s"} below each original (one undo) — edit the stems.`);
  };
  /** DELETE every selected question. Confirms with the count; one undoable step. */
  const bulkDelete = () => {
    const ids = [...qSel];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} question${ids.length === 1 ? "" : "s"}? (Ctrl+Z restores them; chained memos stay in the library.)`)) return;
    const rm = removeNodesCmd(rfl, ids, "delete questions");
    if (!rm) return;
    if (qId && qSel.has(qId)) { const survivor = questions.find((q) => !qSel.has(q.id)); setQId(survivor ? survivor.id : null); }
    bus.dispatch(rm);
    setQSel(new Set());
    setNote(`Deleted ${ids.length} question${ids.length === 1 ? "" : "s"} (Ctrl+Z to undo).`);
  };
  /** SELECT ALL / NONE for the visible question list (respects the ★-only filter). */
  const visibleQs = () => questions.filter((q) => !starOnly || !!(rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.starred);
  const allSelected = (() => { const v = visibleQs(); return v.length > 0 && v.every((q) => qSel.has(q.id)); })();
  const toggleSelectAll = () => { const v = visibleQs(); setQSel(allSelected ? new Set() : new Set(v.map((q) => q.id))); };
  /** Stamp a saved chain TEMPLATE onto every selected question with NO chains yet —
   *  never overwrites; slots land at the SET BASELINE. One undoable step. */
  const applyTemplateToSelection = (tplId: string) => {
    const tpl = listChainTemplates().find((t) => t.id === tplId);
    if (!tpl) return;
    const targets = questions.filter((q) => qSel.has(q.id)).filter((q) => { const d = rf.getNode(q.id)?.data as unknown as CeqCard | undefined; return !(d?.choices ?? []).some((c) => (c.chain?.length ?? 0) > 0); });
    const skipped = qSel.size - targets.length;
    const cmds: NonNullable<ReturnType<typeof patchDataFnCmd>>[] = [];
    for (const q of targets) {
      const d = rf.getNode(q.id)?.data as unknown as CeqCard | undefined; if (!d) continue;
      const newNodes: Record<string, unknown>[] = [];
      const newEdges: Record<string, unknown>[] = [];
      const perChoice = new Map<string, NonNullable<CeqChoice["chain"]>>();
      let flat = 0;
      d.choices.forEach((c, ci) => {
        const slots = tpl.slots[ci] ?? [];
        const items: NonNullable<CeqChoice["chain"]> = [];
        for (const slot of slots) {
          const memoId = cardId("memo");
          const spot = baselineSpot(flat); flat += 1;
          newNodes.push({ id: memoId, type: "memo", position: { x: Math.round(spot.x), y: Math.round(spot.y) }, selected: false, data: { kind: "memo", memoKind: "note", title: slot.label, body: "", ...(spot.scale != null ? { scale: spot.scale } : {}) } });
          newEdges.push({ id: `chn-${c.id}-${memoId}`, source: memoId, sourceHandle: "l", target: q.id, targetHandle: memoAnchorId(c.id), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } });
          items.push({ kind: slot.kind, memoNodeId: memoId, label: slot.label });
        }
        if (items.length) perChoice.set(c.id, items);
      });
      if (newNodes.length) { const a = addNodesAndEdgesCmd(rfl, newNodes as never, newEdges as never, "stamp template"); if (a) cmds.push(a); }
      const p = patchDataFnCmd(rfl, q.id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => (perChoice.has(ch.id) ? { ...ch, chain: [...(ch.chain ?? []), ...(perChoice.get(ch.id) ?? [])] } : ch)) }), "apply template"); if (p) cmds.push(p);
    }
    const cmd = compositeCmd(cmds, `template → ${targets.length} questions`); if (cmd) bus.dispatch(cmd);
    setNote(`Stamped "${tpl.name}" onto ${targets.length} question${targets.length === 1 ? "" : "s"} (one undo)${skipped > 0 ? ` · ${skipped} skipped (already have chains)` : ""}.`);
  };

  /* DEAL INTO FRAME — retired (film-run fixes 2.1). It staged a set into a canvas frame
     for the old whiteboard workflow; the filmstrip + previewer replaced it and it had
     stopped being part of any real run. Nothing else called it. */

  // ---- MEMO LIBRARY ---------------------------------------------------------
  const memos = useMemo(() => rf.getNodes().filter((n) => n.type === "memo").map((n, i) => { const d = n.data as { label?: string; title?: string; body?: string; category?: string; subcategory?: string; course?: string; playbookKind?: string }; return { id: n.id, order: i, label: d.label || memoText(d.title, d.body), category: (d.category || "").toUpperCase(), subcategory: d.subcategory || "", course: d.course || "", body: d.body || "", playbookKind: d.playbookKind || "" }; }), [nodes]);
  const courses = useMemo(() => [...new Set(memos.map((m) => m.course).filter(Boolean))].sort(), [memos]);
  // USAGE (Lee) — where each memo is chained, ACROSS ALL SETS. A memo counts once per
  // CEQ (a "place" = one question / T.QQ), so a memo on two choices of the same
  // question is one place. Powers the ×N ripple signal + the Set/Question scope.
  const memoUsage = useMemo(() => {
    const map = new Map<string, { ceqId: string; tqq: string }[]>();
    for (const n of rf.getNodes()) {
      if (n.type !== "ceq") continue;
      const d = n.data as unknown as CeqCard & { deckId?: string };
      const ids = new Set<string>();
      (d.choices ?? []).forEach((c) => (c.chain ?? []).forEach((it) => { if (it.memoNodeId) ids.add(it.memoNodeId); }));
      if (ids.size === 0) continue;
      const dk = d.deckId ? cardDecks.find((x) => x.id === d.deckId) : null;
      const members = d.deckId ? deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], d.deckId).filter((m) => (m as { type?: string }).type === "ceq") : [];
      const qnum = members.findIndex((m) => m.id === n.id) + 1;
      const tqq = `${deckTopicName(dk) || dk?.name || "Set"} · Q${qnum || "?"}`;
      ids.forEach((mid) => { const arr = map.get(mid) ?? []; arr.push({ ceqId: n.id, tqq }); map.set(mid, arr); });
    }
    return map;
  }, [nodes, cardDecks]);
  const usageOf = (id: string) => memoUsage.get(id)?.length ?? 0;
  const usageTip = (id: string) => { const u = memoUsage.get(id) ?? []; return u.length > 1 ? `Chained in ${u.length} places — editing ripples to all:\n${u.map((x) => x.tqq).join("\n")}` : u.length === 1 ? `Chained in 1 place: ${u[0].tqq}` : "Not chained anywhere yet"; };
  // SCOPE (Lee) — memos chained on the current SET's questions (setMemoIds) and on the
  // current QUESTION (chainMemoIds, already computed). The library filters to these.
  const setMemoIds = useMemo(() => {
    const s = new Set<string>();
    for (const q of questions) { const d = rf.getNode(q.id)?.data as unknown as CeqCard | undefined; (d?.choices ?? []).forEach((c) => (c.chain ?? []).forEach((it) => it.memoNodeId && s.add(it.memoNodeId))); }
    return s;
  }, [questions, nodes]);
  // Effective scope: fall back to a broader scope when the narrower one has nothing to
  // anchor to (no set selected → all; no question selected → set).
  const effScope: "question" | "set" | "all" = memoScope === "question" ? (qId ? "question" : deck ? "set" : "all") : memoScope === "set" ? (deck ? "set" : "all") : "all";
  const inScope = (id: string) => effScope === "all" || justCreated.has(id) || id === previewSelMemo || (effScope === "set" ? setMemoIds.has(id) : chainMemoIds.has(id));
  // Full memo list (with body) for the +💡 picker modal — searches ALL memos.
  const memosForPicker = useMemo(() => rf.getNodes().filter((n) => n.type === "memo").map((n) => { const d = n.data as { label?: string; title?: string; body?: string; category?: string }; return { id: n.id, label: d.label || memoText(d.title, d.body), body: d.body || "", category: (d.category || "").toUpperCase() }; }), [nodes]);
  // PLAYBOOK KIND (P4): display DERIVES the kind — playbookKind if stamped,
  // else the legacy-category mapping — so the panel is correct before AND
  // after the migration materializes the field. "" normalizes to unfiled.
  const pkOf = (m: { playbookKind?: string; category: string }): PlaybookKind | null => ((m.playbookKind || undefined) as PlaybookKind | undefined) ?? kindFromCategory(m.category);
  const shownMemos = memos
    .filter((m) => inScope(m.id))
    .filter((m) => catFilter.has(pkOf(m) ?? NONE))
    .filter((m) => courseFilter === "all" || m.course === courseFilter)
    .filter((m) => { const q = memoQuery.trim().toLowerCase(); return !q || m.label.toLowerCase().includes(q) || m.subcategory.toLowerCase().includes(q) || m.body.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || (pkOf(m) ?? "").includes(q); })
    .sort((a, b) => (memoSort === "az" ? a.label.localeCompare(b.label) : b.order - a.order)); // recent = newest node first
  const toggleCat = (c: string) => setCatFilter((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkCategory = (cat: string) => { if (sel.size === 0) return; const cmd = compositeCmd([...sel].map((id) => patchDataCmd(rfl, id, { category: cat }, "set category")).filter((c): c is NonNullable<typeof c> => !!c), "bulk categorise"); if (cmd) bus.dispatch(cmd); setNote(`Set ${sel.size} memo${sel.size === 1 ? "" : "s"} → ${cat}`); };
  /** Apply an inline bulk-field value to the selected memos (replaces window.prompt). */
  const applyBulkField = (field: "subcategory" | "label" | "course", val: string) => { if (sel.size === 0) return; const cmd = compositeCmd([...sel].map((id) => patchDataCmd(rfl, id, { [field]: val.trim() }, `set ${field}`)).filter((c): c is NonNullable<typeof c> => !!c), `bulk ${field}`); if (cmd) bus.dispatch(cmd); setNote(`Set ${field} on ${sel.size} memo${sel.size === 1 ? "" : "s"}.`); setBulkField(null); setBulkVal(""); };
  /** REMOVE DUPLICATES — keep one memo per (title/label · body · category · subcat),
   *  delete the rest that AREN'T referenced by a chain/attach edge (never breaks a chain). */
  const removeDupes = () => {
    const memoNodes = rf.getNodes().filter((n) => n.type === "memo");
    const referenced = new Set(rf.getEdges().map((e) => e.source));
    const seen = new Set<string>();
    const toDelete: string[] = [];
    for (const n of memoNodes) {
      const d = n.data as { title?: string; body?: string; category?: string; subcategory?: string; label?: string };
      const key = `${(d.label || d.title || "").trim().toLowerCase()}␟${(d.body || "").trim().toLowerCase()}␟${(d.category || "").toLowerCase()}␟${(d.subcategory || "").toLowerCase()}`;
      if (seen.has(key)) { if (!referenced.has(n.id)) toDelete.push(n.id); } else seen.add(key);
    }
    if (toDelete.length === 0) { setNote("No removable duplicates found."); return; }
    const cmd = removeNodesCmd(rfl, toDelete, `remove ${toDelete.length} duplicate memos`);
    if (cmd) bus.dispatch(cmd);
    setSel(new Set());
    setNote(`Removed ${toDelete.length} duplicate memo${toDelete.length === 1 ? "" : "s"} (kept referenced ones).`);
  };
  const allShownSel = shownMemos.length > 0 && shownMemos.every((m) => sel.has(m.id));

  /** DELETE memos from the LIBRARY — removes the nodes (+ their arrows) and strips
   *  them from any chain that referenced them. One undoable step. */
  const deleteMemos = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const cmds: NonNullable<ReturnType<typeof patchDataCmd>>[] = [];
    for (const n of rf.getNodes()) {
      if (n.type !== "ceq") continue;
      const choices = (n.data as { choices?: CeqChoice[] }).choices ?? [];
      if (!choices.some((c) => (c.chain ?? []).some((it) => idSet.has(it.memoNodeId)))) continue;
      const p = patchDataFnCmd(rfl, n.id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => ({ ...c, chain: (c.chain ?? []).filter((it) => !idSet.has(it.memoNodeId)) })) }), "unchain");
      if (p) cmds.push(p);
    }
    const rm = removeNodesCmd(rfl, ids, `delete ${ids.length} memo${ids.length === 1 ? "" : "s"}`); // removes nodes + their arrows
    if (rm) cmds.push(rm);
    const cmd = compositeCmd(cmds, "delete memos"); if (cmd) bus.dispatch(cmd);
    setSel((p) => { const n = new Set(p); ids.forEach((id) => n.delete(id)); return n; });
    setNote(`Deleted ${ids.length} memo${ids.length === 1 ? "" : "s"} from the library.`);
  };

  /** REMOVE a memo from a CHAIN — detach it from the choice (drop the chain entry +
   *  the arrow) but KEEP the memo node in the library. */
  const removeFromChain = (ceqId: string, memoNodeId: string) => {
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => ({ ...c, chain: (c.chain ?? []).filter((it) => it.memoNodeId !== memoNodeId) })) }), "remove from chain");
    const gone = new Set(rf.getEdges().filter((e) => e.source === memoNodeId && e.target === ceqId).map((e) => e.id));
    const snap = gone.size ? structuredClone(rf.getEdges().filter((e) => gone.has(e.id))) : [];
    const edgeCmd = gone.size ? { label: "remove chain arrow", do: () => rf.setEdges((eds) => eds.filter((e) => !gone.has(e.id))), undo: () => rf.setEdges((eds) => [...eds, ...structuredClone(snap)]) } : null;
    const cmd = compositeCmd([patch, edgeCmd].filter((c): c is NonNullable<typeof c> => !!c), "remove from chain"); if (cmd) bus.dispatch(cmd);
    setPreviewSelMemo(null);
    setNote("Removed memo from the chain (still in the library).");
  };

  // ---- COPY / PASTE memos across questions (speed) --------------------------
  /** Copy the outline-selected chain memos (data + frame-local position + which
   *  choice index they hang off) to the memo clipboard. */
  const copyMemos = () => {
    if (selChainMemos.size === 0) return;
    const clips: typeof memoClip = [];
    for (const q of questions) {
      const cc = (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.choices ?? [];
      cc.forEach((ch, ci) => (ch.chain ?? []).forEach((it) => {
        if (!selChainMemos.has(it.memoNodeId)) return;
        const m = rf.getNode(it.memoNodeId); if (!m) return;
        const md = m.data as { title?: string; body?: string; memoKind?: string; category?: string; subcategory?: string; scale?: number };
        clips.push({ label: it.label, title: md.title ?? "", body: md.body ?? "", memoKind: md.memoKind ?? "note", category: md.category ?? "", subcategory: md.subcategory ?? "", x: Math.round(m.position.x), y: Math.round(m.position.y), scale: md.scale ?? 1, choiceIdx: ci });
      }));
    }
    setMemoClip(clips);
    setNote(`Copied ${clips.length} memo${clips.length === 1 ? "" : "s"} — select a question, Ctrl+V to paste (same spot).`);
  };
  /** Paste the copied memos into `qId` — fresh nodes at the SAME frame-local spot,
   *  chained to the SAME choice index (A→A, B→B, …). */
  const pasteMemos = (targetId: string | null) => {
    if (memoClip.length === 0 || !targetId) return;
    const target = rf.getNode(targetId); if (!target) return;
    const tChoices = (target.data as unknown as CeqCard).choices ?? [];
    const newNodes: Record<string, unknown>[] = [];
    const newEdges: Record<string, unknown>[] = [];
    const adds = new Map<string, { kind: "memo"; memoNodeId: string; label: string }[]>();
    for (const clip of memoClip) {
      const ch = tChoices[clip.choiceIdx]; if (!ch) continue;
      const memoId = cardId("memo");
      newNodes.push({ id: memoId, type: "memo", position: { x: clip.x, y: clip.y }, selected: false, data: { kind: "memo", memoKind: clip.memoKind, title: clip.title, body: clip.body, category: clip.category, subcategory: clip.subcategory, scale: clip.scale } });
      newEdges.push({ id: `chn-${ch.id}-${memoId}`, source: memoId, sourceHandle: "l", target: targetId, targetHandle: memoAnchorId(ch.id), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } });
      const arr = adds.get(ch.id) ?? []; arr.push({ kind: "memo", memoNodeId: memoId, label: clip.label }); adds.set(ch.id, arr);
    }
    if (newNodes.length === 0) { setNote("Nothing pasted — the target question lacks those choice slots."); return; }
    const add = addNodesAndEdgesCmd(rfl, newNodes as never, newEdges as never, "paste memos"); if (add) bus.dispatch(add);
    const patch = patchDataFnCmd(rfl, targetId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (adds.has(c.id) ? { ...c, chain: [...(c.chain ?? []), ...adds.get(c.id)!] } : c)) }), "paste chain memos"); if (patch) bus.dispatch(patch);
    setNote(`Pasted ${newNodes.length} memo${newNodes.length === 1 ? "" : "s"} into the question.`);
  };

  const toggleChainSel = (memoNodeId: string) => setSelChainMemos((p) => { const n = new Set(p); n.has(memoNodeId) ? n.delete(memoNodeId) : n.add(memoNodeId); return n; });

  // ---- COPY ITEMS (Lee) — copy the actual memos between questions, then paste as NEW
  //      independent copies OR EXACT shared references (edits ripple). ---------------
  /** Capture the given memo nodes (by id) off the CURRENT question — choice index +
   *  label + flags + content. Shared by Copy items and Send to starred. */
  const captureItems = (memoNodeIds: string[]): typeof itemsClip => {
    if (!qd) return [];
    const idSet = new Set(memoNodeIds);
    const clips: typeof itemsClip = [];
    qd.choices.forEach((c, ci) => (c.chain ?? []).forEach((it) => {
      if (!idSet.has(it.memoNodeId)) return;
      const md = rf.getNode(it.memoNodeId)?.data as { title?: string; body?: string; memoKind?: string; category?: string; subcategory?: string } | undefined;
      clips.push({ memoNodeId: it.memoNodeId, choiceIdx: ci, label: it.label, title: md?.title ?? "", body: md?.body ?? "", memoKind: md?.memoKind ?? "note", category: md?.category ?? "", subcategory: md?.subcategory ?? "", sound: it.sound, hideChoiceLabel: it.hideChoiceLabel, hideArrow: it.hideArrow });
    }));
    return clips;
  };
  const copyItems = (memoNodeIds: string[]) => {
    const clips = captureItems(memoNodeIds);
    if (clips.length === 0) { setNote("No memos to copy."); return; }
    setItemsClip(clips);
    setNote(`Copied ${clips.length} item${clips.length === 1 ? "" : "s"} — open another question, then Ctrl+V (new copies) or right-click → paste (new/shared).`);
  };
  /** SEND TO STARRED (Lee, bulk) — every ★ question in the set receives NEW independent
   *  copies of the given memos, at the same choice letters. One undoable step. */
  const sendToStarred = (memoNodeIds: string[]) => {
    if (!qId) return;
    const clips = captureItems(memoNodeIds);
    if (clips.length === 0) { setNote("No memos to send."); return; }
    const targets = questions.filter((q) => q.id !== qId && !!(rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.starred);
    if (targets.length === 0) { setNote("No starred questions to send to — star (☆) some first."); return; }
    const cmds: NonNullable<ReturnType<typeof patchDataFnCmd>>[] = [];
    let placed = 0;
    for (const t of targets) {
      const tChoices = (rf.getNode(t.id)?.data as unknown as CeqCard | undefined)?.choices ?? [];
      const newNodes: Record<string, unknown>[] = [];
      const newEdges: Record<string, unknown>[] = [];
      const adds = new Map<string, NonNullable<CeqChoice["chain"]>>();
      let flat = tChoices.reduce((s, c) => s + (c.chain?.length ?? 0), 0); // next baseline slot for THIS question
      clips.forEach((clip) => {
        const ch = tChoices[clip.choiceIdx]; if (!ch) return;
        const memoId = cardId("memo");
        const spot = baselineSpot(flat); flat += 1;
        newNodes.push({ id: memoId, type: "memo", position: { x: Math.round(spot.x), y: Math.round(spot.y) }, selected: false, data: { kind: "memo", memoKind: clip.memoKind, title: clip.title, body: clip.body, category: clip.category, subcategory: clip.subcategory, sourceId: clip.memoNodeId, ...(spot.scale != null ? { scale: spot.scale } : {}) } });
        newEdges.push({ id: `chn-${ch.id}-${memoId}`, source: memoId, sourceHandle: "l", target: t.id, targetHandle: memoAnchorId(ch.id), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } });
        const arr = adds.get(ch.id) ?? []; arr.push({ kind: "memo", memoNodeId: memoId, label: clip.label, sound: clip.sound, hideChoiceLabel: clip.hideChoiceLabel, hideArrow: clip.hideArrow }); adds.set(ch.id, arr);
        placed++;
      });
      if (newNodes.length === 0) continue;
      const add = addNodesAndEdgesCmd(rfl, newNodes as never, newEdges as never, "send memos"); if (add) cmds.push(add);
      const patch = patchDataFnCmd(rfl, t.id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (adds.has(c.id) ? { ...c, chain: [...(c.chain ?? []), ...(adds.get(c.id) ?? [])] } : c)) }), "send chain memos"); if (patch) cmds.push(patch);
    }
    if (placed === 0) { setNote("Nothing sent — the starred questions lack those choice slots."); return; }
    const cmd = compositeCmd(cmds, "send memos to starred"); if (cmd) bus.dispatch(cmd);
    setNote(`Sent ${clips.length} memo${clips.length === 1 ? "" : "s"} to ${targets.length} starred question${targets.length === 1 ? "" : "s"} (new copies · Ctrl+Z undoes all).`);
  };
  /** COPY STYLE TO ALL IN SET (Lee, bulk) — geometry goes to the shared baseline
   *  (memoSlots, which every question renders from) and the SETTINGS (caption/arrow/
   *  sound — copied exactly, including "off") are patched onto every question's chain
   *  items. Single memo = its size + settings apply to ALL memos (positions kept);
   *  multi-select = slot-mapped (selection memo #1 → every question's memo #1, 2→2…). */
  const applyStyleToSet = (styles: { idx: number; x: number; y: number; scale: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: ChainSound }[]) => {
    if (!deck || styles.length === 0) return;
    const single = styles.length === 1;
    const slots: (DeckSlotLayout | undefined)[] = [...(deck.layout?.memoSlots ?? [])];
    if (single) {
      const s = styles[0];
      slots[s.idx] = { x: s.x, y: s.y, scale: s.scale };
      for (let i = 0; i < slots.length; i++) if (slots[i] && i !== s.idx) slots[i] = { ...slots[i]!, scale: s.scale };
    } else {
      styles.forEach((s) => { slots[s.idx] = { x: s.x, y: s.y, scale: s.scale }; });
    }
    // The baseline-geometry write joins the composite so the whole action stays ONE
    // undo step (Ctrl+Z restores slots + settings together).
    const layoutBefore = deck.layout;
    const layoutAfter = { ...(deck.layout ?? {}), memoSlots: slots as DeckSlotLayout[] };
    const bySlot = new Map(styles.map((s) => [s.idx, s]));
    const cmds: Command[] = [{
      label: "style to set — baseline geometry",
      do: () => setDecks((prev) => updateDeck(prev, deck.id, { layout: layoutAfter })),
      undo: () => setDecks((prev) => updateDeck(prev, deck.id, { layout: layoutBefore })),
    }];
    for (const q of questions) {
      const p = patchDataFnCmd(rfl, q.id, (prev) => {
        let flat = -1;
        return { choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => ({ ...c, chain: (c.chain ?? []).map((it) => { flat += 1; const s = single ? styles[0] : bySlot.get(flat); return s ? { ...it, hideChoiceLabel: s.hideChoiceLabel, hideArrow: s.hideArrow, sound: s.sound } : it; }) })) };
      }, "style to set");
      if (p) cmds.push(p);
    }
    const cmd = compositeCmd(cmds, "copy style to set"); if (cmd) bus.dispatch(cmd);
    setNote(single ? `Applied that memo's size + settings to every memo in the set (${questions.length} questions · Ctrl+Z undoes the settings).` : `Applied ${styles.length} styles slot-by-slot (1→1, 2→2…) across ${questions.length} questions.`);
  };
  /** Paste the copied items onto the CURRENT question at the SAME choice index. `new` =
   *  fresh independent memo nodes; `exact` = chain the SAME shared memo nodes (edits
   *  ripple — confirm-guarded). */
  const pasteItems = (mode: "new" | "exact") => {
    if (itemsClip.length === 0 || !qId) return;
    const tChoices = (rf.getNode(qId)?.data as unknown as CeqCard | undefined)?.choices ?? [];
    if (mode === "exact" && !window.confirm(`Paste ${itemsClip.length} item${itemsClip.length === 1 ? "" : "s"} as SHARED references? Editing them will change the original memo(s) everywhere — including the question you copied from.`)) return;
    const newNodes: Record<string, unknown>[] = [];
    const newEdges: Record<string, unknown>[] = [];
    const adds = new Map<string, CeqChoice["chain"]>();
    let placed = 0;
    let flat = tChoices.reduce((s, c) => s + (c.chain?.length ?? 0), 0); // next baseline slot
    itemsClip.forEach((clip) => {
      const ch = tChoices[clip.choiceIdx]; if (!ch) return;
      if (mode === "exact" && (ch.chain ?? []).some((it) => it.memoNodeId === clip.memoNodeId)) return; // already shared here
      let memoId = clip.memoNodeId;
      const spot = baselineSpot(flat); flat += 1;
      if (mode === "new") {
        memoId = cardId("memo");
        newNodes.push({ id: memoId, type: "memo", position: { x: Math.round(spot.x), y: Math.round(spot.y) }, selected: false, data: { kind: "memo", memoKind: clip.memoKind, title: clip.title, body: clip.body, category: clip.category, subcategory: clip.subcategory, sourceId: clip.memoNodeId, ...(spot.scale != null ? { scale: spot.scale } : {}) } });
      }
      newEdges.push({ id: `chn-${ch.id}-${memoId}`, source: memoId, sourceHandle: "l", target: qId, targetHandle: memoAnchorId(ch.id), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } });
      const arr = (adds.get(ch.id) ?? []) as NonNullable<CeqChoice["chain"]>; arr.push({ kind: "memo", memoNodeId: memoId, label: clip.label, sound: clip.sound, hideChoiceLabel: clip.hideChoiceLabel, hideArrow: clip.hideArrow }); adds.set(ch.id, arr);
      placed++;
    });
    if (placed === 0) { setNote("Nothing pasted — the target question lacks those choice slots (or the memo is already shared here)."); return; }
    const add = addNodesAndEdgesCmd(rfl, newNodes as never, newEdges as never, `paste ${mode} items`); if (add) bus.dispatch(add);
    const patch = patchDataFnCmd(rfl, qId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (adds.has(c.id) ? { ...c, chain: [...(c.chain ?? []), ...(adds.get(c.id) ?? [])] } : c)) }), "paste items"); if (patch) bus.dispatch(patch);
    setNote(`Pasted ${placed} ${mode === "exact" ? "shared" : "new"} item${placed === 1 ? "" : "s"} into the question.`);
  };

  /** Copy the CURRENT question (stem + choices + its chain memos, deep) to the
   *  question clipboard. */
  /** FRAME CLIPBOARD (Lee, 08-15): copy the SPINE-SELECTED frame(s) at full
   *  fidelity — noteOnly, callout, run letter and STEM chain travel too (the
   *  old copy silently dropped them). Frames are copied from the spine only;
   *  in-frame Ctrl+C belongs to components. */
  const copyFrames = (ids: string[]) => {
    const ordered = questions.filter((q) => ids.includes(q.id)).map((q) => q.id);
    const clips: NonNullable<typeof qClip> = [];
    for (const fid of ordered) {
      const node = rf.getNode(fid);
      const d = node?.data as unknown as CeqCard | undefined; if (!d) continue;
      const memos: NonNullable<typeof qClip>[number]["memos"] = [];
      const pull = (items: CeqChainItem[] | undefined, choiceIdx: number) => (items ?? []).forEach((it) => {
        const m = rf.getNode(it.memoNodeId); if (!m) return;
        const md = m.data as { title?: string; body?: string; memoKind?: string; category?: string; subcategory?: string; scale?: number };
        memos.push({ label: it.label, title: md.title ?? "", body: md.body ?? "", memoKind: md.memoKind ?? "note", category: md.category ?? "", subcategory: md.subcategory ?? "", x: Math.round(m.position.x), y: Math.round(m.position.y), scale: md.scale ?? 1, choiceIdx });
      });
      d.choices.forEach((ch, ci) => pull(ch.chain, ci));
      pull(d.stemChain, -1);
      clips.push({ prompt: d.prompt, scale: (node?.data as { scale?: number } | undefined)?.scale ?? 1, noteOnly: d.noteOnly, callout: d.callout ? structuredClone(d.callout) : undefined, run: d.run, choices: d.choices.map((c) => ({ text: c.text, correct: c.correct })), memos });
    }
    if (!clips.length) return;
    setQClip(clips);
    setMemoClip([]);
    lastClipRef.current = "q";
    setNote(`Copied ${clips.length} frame${clips.length === 1 ? "" : "s"} — Ctrl+V pastes below the selected spine row.`);
  };
  /** Paste the copied question into the current set (fresh ids, its memos too). */
  /** Paste the copied frame(s) BELOW the last spine-selected frame (or the open
   *  one) — fresh ids, memos + chains rebuilt (stem chains too), stageOrder
   *  reindexed with insertFrame's pattern. One undoable composite. */
  const pasteFrames = () => {
    if (!qClip?.length || !deck) return;
    const idxOf = (fid: string) => questions.findIndex((q) => q.id === fid);
    const selIdx = [...qSel].map(idxOf).filter((i) => i >= 0);
    const openIdx = qId && qId !== LAYOUT_Q0 ? idxOf(qId) : -1;
    const at = (selIdx.length ? Math.max(...selIdx) : openIdx >= 0 ? openIdx : questions.length - 1) + 1;
    const newNodes: Record<string, unknown>[] = [];
    const newEdges: Record<string, unknown>[] = [];
    const newIds: string[] = [];
    qClip.forEach((clip, k) => {
      const ceqId = cardId("ceq");
      newIds.push(ceqId);
      const choiceIds = clip.choices.map(() => cardId("ch"));
      const chainByChoice = new Map<string, { kind: "memo"; memoNodeId: string; label: string }[]>();
      const stemChain: { kind: "memo"; memoNodeId: string; label: string }[] = [];
      for (const mc of clip.memos) {
        const memoId = cardId("memo");
        newNodes.push({ id: memoId, type: "memo", position: { x: mc.x, y: mc.y }, selected: false, data: { kind: "memo", memoKind: mc.memoKind, title: mc.title, body: mc.body, category: mc.category, subcategory: mc.subcategory, scale: mc.scale } });
        if (mc.choiceIdx === -1) { stemChain.push({ kind: "memo", memoNodeId: memoId, label: mc.label }); continue; }
        const cid = choiceIds[mc.choiceIdx]; if (!cid) continue;
        newEdges.push({ id: `chn-${cid}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: memoAnchorId(cid), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } });
        const arr = chainByChoice.get(cid) ?? []; arr.push({ kind: "memo", memoNodeId: memoId, label: mc.label }); chainByChoice.set(cid, arr);
      }
      newNodes.push({ id: ceqId, type: "ceq", position: { x: 520, y: 210 }, selected: false, data: { kind: "ceq", title: deck.name, prompt: clip.prompt, scale: clip.scale, ...(clip.noteOnly ? { noteOnly: true } : {}), ...(clip.callout ? { callout: structuredClone(clip.callout) } : {}), ...(clip.run ? { run: clip.run } : {}), ...(stemChain.length ? { stemChain } : {}), choices: clip.choices.map((c, i) => ({ id: choiceIds[i], text: c.text, correct: c.correct, ...(chainByChoice.has(choiceIds[i]) ? { chain: chainByChoice.get(choiceIds[i]) } : {}) })), deckId: deck.id, deckMember: true, tucked: true, stageOrder: at + k, slotIndex: at + k, deckCategory: "ceq:studio", deckPos: { x: 520, y: 210 } } });
    });
    const reindex = questions.slice(at).map((q, i) => patchDataCmd(rfl, q.id, { stageOrder: at + qClip.length + i }, "reorder")).filter((c): c is NonNullable<typeof c> => !!c);
    const add = addNodesAndEdgesCmd(rfl, newNodes as never, newEdges as never, "paste frames");
    const cmd = compositeCmd([...(add ? [add] : []), ...reindex], `paste ${qClip.length} frame${qClip.length === 1 ? "" : "s"}`);
    if (cmd) bus.dispatch(cmd);
    setQId(newIds[0]);
    setNote(`Pasted ${qClip.length} frame${qClip.length === 1 ? "" : "s"} below ${selIdx.length ? "the selected row" : "the open frame"} (one undo).`);
  };

  // SELECTING a memo in the previewer SURFACES it in the library: open the pane +
  // scroll its row into view (the row also gets a highlight below). The scroll ref is
  // attached to the selected row in the shownMemos map.
  const selMemoRowRef = useRef<HTMLDivElement | null>(null);
  // Selecting a memo in the previewer scrolls the library row into view IF the
  // library is already open — but no longer force-OPENS it (Lee: single-click
  // kept reopening the library and cluttering layout editing; double-click a memo
  // opens it now, via onOpenMemoLib). scrollIntoView on a hidden row is a no-op.
  useEffect(() => { if (!previewSelMemo || !libOpen) return; const t = window.setTimeout(() => selMemoRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60); return () => window.clearTimeout(t); }, [previewSelMemo, libOpen]);

  // KEYBOARD — Delete (detach/delete), Ctrl+C/Ctrl+V (copy/paste memos),
  // Ctrl+D (duplicate the question). Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.key === "c" || e.key === "C")) { e.preventDefault(); if (selChainMemos.size > 0) { copyMemos(); lastClipRef.current = "memos"; } else if (selStageEl) copyStageElement(selStageEl); else if (qSel.size > 0) copyFrames([...qSel]); else setNote("Nothing copyable selected — click a component on the stage, or select frame rows in the spine. (The open frame is no longer copied implicitly.)"); return; }
      if (ctrl && (e.key === "v" || e.key === "V")) { e.preventDefault(); if (lastClipRef.current === "el" && elClip && qId && qId !== LAYOUT_Q0) pasteStageElement(); else if (itemsClip.length > 0 && qId && qId !== LAYOUT_Q0) pasteItems("new"); else if (memoClip.length > 0 && qId && qId !== LAYOUT_Q0) pasteMemos(qId); else if (elClip && qId && qId !== LAYOUT_Q0) pasteStageElement(); else if (qClip?.length) pasteFrames(); return; }
      if (ctrl && (e.key === "d" || e.key === "D")) { if (qId && qId !== LAYOUT_Q0) { e.preventDefault(); duplicateQuestion(qId); } return; }
      if (e.key === "/") { e.preventDefault(); setLibOpen(true); window.setTimeout(() => memoSearchRef.current?.focus(), 60); return; } // "/" focuses the memo search from anywhere
      // ` = wipe temporary state (backtick sweep): here that means the strip
      // multi-select. The previewer's own handler owns practice/highlight resets.
      if (!recording && (e.code === "Backquote" || e.key === "`") && qSel.size > 0) { setQSel(new Set()); return; }
      // KEYBOARD FLOW (Studio Consolidation D) — with a CEQ open in the editor, ↑/↓ walk
      // prev/next in the set without the mouse. Recording/film keeps its own key model
      // (this handler is behind !recording already via the outer gate on typing + the
      // recording surface swallowing keys), and PageUp/Down remain the film-mode walk.
      if (!recording && (e.key === "ArrowUp" || e.key === "ArrowDown") && qId && qId !== LAYOUT_Q0) { e.preventDefault(); gotoQuestion(e.key === "ArrowDown" ? 1 : -1); return; }
      // INSERT FRAME (frames rename §3): Ctrl/Cmd+Enter = new frame BELOW the
      // selected one, +Shift = ABOVE. The chooser opens on the strip's [+] for
      // type choice; the keyboard path inserts a CEQ frame (the 90% case) — a
      // note is one click away on the strip.
      if (!recording && e.key === "Enter" && (e.ctrlKey || e.metaKey) && deck) {
        e.preventDefault();
        const i = qId && qId !== LAYOUT_Q0 ? questions.findIndex((q) => q.id === qId) : questions.length - 1;
        insertFrame(e.shiftKey ? Math.max(0, i) : i + 1, "ceq");
        return;
      }
      if (e.key === "Escape" && qSel.size > 0) { setQSel(new Set()); return; } // Esc clears the question selection
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (previewSelMemo && qId) { e.preventDefault(); removeFromChain(qId, previewSelMemo); return; }
      if (sel.size > 0) { e.preventDefault(); deleteMemos([...sel]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSelMemo, qId, sel, selChainMemos, memoClip, qClip, itemsClip, qSel, recording, questions, deck]);

  /** NEXT-SLOT PLACEMENT — a new memo at flat chain index N lands in the Nth ACTIVE
   *  palette slot (position + size; slots Lee switched OFF are skipped entirely).
   *  Past the last active slot it stacks BELOW it at that slot's size, so two memos
   *  can never be born at the same coordinate. */
  const baselineSpot = (flatIdx: number): { x: number; y: number; scale?: number } => {
    const live = activeSlots(rackOf(deck?.layout?.memoSlots, frameW, frameH));
    const s = live[flatIdx];
    if (s) return { x: s.x, y: s.y, scale: s.scale };
    const last = live[live.length - 1];
    if (last) return { x: last.x, y: last.y + Math.round(150 * (last.scale ?? 1)) * (flatIdx - live.length + 1), scale: last.scale };
    return { ...defaultMemoPos(frameW, frameH, flatIdx), scale: 1 };
  };

  /** CREATE a brand-new memo (text + category from the +💡 modal or right-click),
   *  attached to a choice's chain + SNAPPED to the next baseline slot. */
  const createMemoChained = (ceqId: string, choiceId: string, text: string, category: string) => {
    const label = text.trim() || "Memo";
    const memoId = cardId("memo");
    const qNodeRef = rf.getNode(ceqId);
    const cc = (qNodeRef?.data as unknown as CeqCard | undefined)?.choices ?? [];
    const chainCount = cc.reduce((s, ch) => s + (ch.chain?.length ?? 0), 0);
    // Next slot for THIS question (its own instance first, then the template's active
    // slots) — and PARENT the memo to the question's frame. Slot coordinates are
    // frame-local, so an unparented memo landed at those numbers in WORLD space, i.e.
    // nowhere near the frame: created-but-not-placed, which is what Lee was seeing.
    const frameId = qNodeRef?.parentId ?? nav.currentFrameId ?? undefined;
    const spot = resolveMemoSpot((qNodeRef?.data as unknown as CeqCard | undefined)?.geom, templateFor((qNodeRef?.data as unknown as CeqCard | undefined)?.ignoreLayout, deck?.layout), chainCount, frameW, frameH);
    const memoNode = { id: memoId, type: "memo", ...(frameId ? { parentId: frameId } : {}), position: { x: Math.round(spot.x), y: Math.round(spot.y) }, selected: false, data: { kind: "memo", memoKind: "note", title: label, body: "", category, scale: spot.scale } };
    if (choiceId === "__stem__") {
      // STEM CHAIN (P2) — chained to the QUESTION: walks out before any choice,
      // in authored order. No canvas chain-arrow (there is no choice anchor).
      const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ stemChain: [...((prev as unknown as { stemChain?: CeqChainItem[] }).stemChain ?? []), { kind: "memo" as const, memoNodeId: memoId, label }] }), "attach memo to question");
      if (patch) bus.dispatch(patch);
      touchRecent(memoId);
      setNote(`Attached "${clip(label, 24)}" to the QUESTION — walks out before any choice.`);
      return;
    }
    const edge = { id: `chn-${choiceId}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: memoAnchorId(choiceId), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    // ONE undo step: the node+edge, the chain entry, and the instance slot together —
    // it used to be two dispatches, so undo left an orphan memo with a dangling arrow.
    const add = addNodesAndEdgesCmd(rfl, [memoNode] as never, [edge] as never, "create chain memo");
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: [...(c.chain ?? []), { kind: "memo" as const, memoNodeId: memoId, label }] } : c)) }), "add memo to chain");
    const geomCmd = patchDataCmd(rfl, ceqId, { geom: withInstanceSpot((qNodeRef?.data as unknown as CeqCard | undefined)?.geom, chainCount, spot) }, "place memo");
    const cmd = compositeCmd([add, patch, geomCmd].filter((c): c is NonNullable<typeof c> => !!c), "add memo to choice"); if (cmd) bus.dispatch(cmd);
    setLastMemoCat(category || lastMemoCat);
    touchRecent(memoId);
    setNote(`Created "${clip(label, 24)}" and chained it — placed at slot ${chainCount + 1} in this question.`);
  };
  /** RIGHT-CLICK empty frame space → "Add memo here": UNCHAINED, placed AT the click
   *  point (the one case click position wins over slots) at baseline slot-1's SIZE. */
  const addMemoAt = (pos: { x: number; y: number }, text: string, category: string) => {
    const label = text.trim() || "Memo";
    const s1 = deck?.layout?.memoSlots?.[0];
    const memoId = cardId("memo");
    // Frame-local click point ⇒ must be parented to the frame, or it lands at those
    // coordinates in world space instead of where Lee clicked.
    const frameId = (qId && qId !== LAYOUT_Q0 ? rf.getNode(qId)?.parentId : null) ?? nav.currentFrameId ?? undefined;
    const node = { id: memoId, type: "memo", ...(frameId ? { parentId: frameId } : {}), position: { x: Math.round(pos.x), y: Math.round(pos.y) }, selected: false, data: { kind: "memo", memoKind: "note", title: label, label: clip(label, 40), body: "", category, ...(s1?.scale != null ? { scale: s1.scale } : {}) } };
    const add = addNodesCmd(rfl, [node] as never, "add memo here"); if (add) bus.dispatch(add);
    setJustCreated((p) => new Set(p).add(memoId));
    touchRecent(memoId);
    setLastMemoCat(category);
    setNote(`Added "${clip(label, 24)}" (unchained) at the click point — it's in the library.`);
  };
  /** Commit an inline rename of a CHAIN memo (label on the item + title on the node).
   *  Replaces the old window.prompt("Memo label"). */
  const commitEditChain = (ceqId: string, choiceId: string, idx: number, memoNodeId: string, next: string) => {
    const label = next.trim() || "Memo";
    const p1 = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: (c.chain ?? []).map((it, i) => (i === idx ? { ...it, label } : it)) } : c)) }), "rename memo label"); if (p1) bus.dispatch(p1);
    const p2 = patchDataCmd(rfl, memoNodeId, { title: label, label }, "rename memo"); if (p2) bus.dispatch(p2);
    setEditChain(null); setEditChainVal("");
  };
  /** Toggle a chain item's REVEAL sound (fires on its Enter reveal in film). Quick
   *  vinyl toggle for Lee's memo workflow — the full picker lives in the chain editor. */
  const setChainSound = (ceqId: string, choiceId: string, idx: number, sound: ChainSound | undefined) => {
    const c = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => (ch.id === choiceId ? { ...ch, chain: (ch.chain ?? []).map((it, i) => (i === idx ? { ...it, sound } : it)) } : ch)) }), "chain reveal sound"); if (c) bus.dispatch(c);
  };
  /** Patch the chain item that references `memoNodeId` (display toggles from the memo
   *  node in the previewer — hide choice label / hide arrow / vinyl). Undoable. */
  const patchChainItem = (ceqId: string, memoNodeId: string, patch: Partial<CeqChainItem>) => {
    const c = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => ({ ...ch, chain: (ch.chain ?? []).map((it) => (it.memoNodeId === memoNodeId ? { ...it, ...patch } : it)) })) }), "memo display toggle"); if (c) bus.dispatch(c);
  };
  /** DUPLICATE a library memo → a copy ("<label> copy", same category/kind, sourceId
   *  link back to the original) placed beside it; opens the copy for inline rename. */
  const duplicateMemo = (id: string) => {
    const src = rf.getNode(id); if (!src) return;
    const d = src.data as { memoKind?: string; title?: string; body?: string; category?: string; subcategory?: string; course?: string; label?: string; scale?: number };
    const label = `${d.label || memoText(d.title, d.body)} copy`;
    const memoId = cardId("memo");
    const memoNode = { id: memoId, type: "memo", parentId: src.parentId, position: { x: src.position.x + 28, y: src.position.y + 28 }, selected: false, data: { kind: "memo", memoKind: d.memoKind ?? "note", title: label, body: d.body ?? "", category: d.category ?? "", subcategory: d.subcategory ?? "", course: d.course ?? "", label, sourceId: id, scale: d.scale } };
    const add = addNodesCmd(rfl, [memoNode] as never, "duplicate memo"); if (add) bus.dispatch(add);
    setJustCreated((p) => new Set(p).add(memoId)); // keep the (unchained) copy visible under any scope
    setEditMemo(memoId); setEditMemoVal(label); // open the copy for inline editing
    touchRecent(memoId);
    setNote(`Duplicated memo → "${clip(label, 24)}" (linked to the original).`);
  };
  /** Commit an inline rename of a LIBRARY memo. Must ripple to EVERY chaining question's
   *  `chain[].label` (the previewer + film render that copy), not just the node — otherwise
   *  the library row changes and the CEQ sets keep the old name. Routes through
   *  renameMemoEverywhere (includeCurrent=false: a library rename isn't scoped to the open
   *  question, so we only touch questions that actually chain this memo). */
  const commitEditMemo = (id: string, next: string) => {
    renameMemoEverywhere(id, next, false);
    setEditMemo(null); setEditMemoVal("");
  };
  /** QUICK-ADD (Lee, speed pass) — Enter in the pinned library input creates a memo
   *  instantly: category = LAST-USED, label = the text. No modal on this path. */
  const quickAddMemo = () => {
    const text = qaText.trim();
    if (!text) return;
    const memoId = cardId("memo");
    const node = { id: memoId, type: "memo", position: { x: 80 + (memos.length % 6) * 24, y: 80 + (memos.length % 6) * 24 }, selected: false, data: { kind: "memo", memoKind: "note", title: text, label: clip(text, 40), body: "", category: lastMemoCat } };
    const add = addNodesCmd(rfl, [node] as never, "quick-add memo"); if (add) bus.dispatch(add);
    setJustCreated((p) => new Set(p).add(memoId));
    touchRecent(memoId);
    setQaText("");
    setNote(`Added "${clip(text, 24)}" · ${lastMemoCat}.`);
  };
  /** ONE-CLICK CATEGORY — clicking a memo's category chip cycles MEMO_CATEGORIES. */
  const cycleCategory = (id: string, cur: string) => {
    const idx = (MEMO_CATEGORIES as readonly string[]).indexOf(cur);
    const next = MEMO_CATEGORIES[(idx + 1) % MEMO_CATEGORIES.length];
    const p = patchDataCmd(rfl, id, { category: next }, "cycle category"); if (p) bus.dispatch(p);
    setLastMemoCat(next);
    touchRecent(id);
  };
  /** PLAYBOOK (P4) quick-reassign — cycle kind through the taxonomy, then unfiled.
   *  Writes playbookKind only; the legacy category is never touched. */
  const cycleKind = (id: string, cur: PlaybookKind | null) => {
    const order: (PlaybookKind | null)[] = [...MEMO_KIND_ORDER, null];
    const next = order[(order.indexOf(cur) + 1) % order.length];
    const p = patchDataCmd(rfl, id, { playbookKind: next ?? "" }, "set playbook kind"); if (p) bus.dispatch(p);
    touchRecent(id);
  };
  // Search focus: autofocus whenever the library opens; "/" (global, below) also lands here.
  useEffect(() => { if (libOpen) { const t = window.setTimeout(() => memoSearchRef.current?.focus(), 60); return () => window.clearTimeout(t); } }, [libOpen]);

  // ---- RIGHT-CLICK A MEMO in the previewer (rename / duplicate / category / delete) --
  /** RENAME everywhere: the previewer + film render the CHAIN item's label, so a
   *  rename must patch every chaining question's `chain[].label` AND the node's own
   *  title — otherwise the library row changes and the card on camera doesn't. One
   *  undo step. */
  const renameMemoEverywhere = (memoNodeId: string, next: string, includeCurrent = true) => {
    const label = next.trim() || "Memo";
    const ceqIds = new Set((memoUsage.get(memoNodeId) ?? []).map((u) => u.ceqId));
    // includeCurrent=false for a LIBRARY rename (not scoped to the open question); the
    // previewer/right-click paths keep true so the just-attached memo's own question is hit.
    if (includeCurrent && qId && qId !== LAYOUT_Q0) ceqIds.add(qId);
    const cmds: NonNullable<ReturnType<typeof patchDataCmd>>[] = [];
    for (const cid of ceqIds) {
      const p = patchDataFnCmd(rfl, cid, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => ({ ...c, chain: (c.chain ?? []).map((it) => (it.memoNodeId === memoNodeId ? { ...it, label } : it)) })) }), "rename chain label");
      if (p) cmds.push(p);
    }
    const node = patchDataCmd(rfl, memoNodeId, { title: label, label }, "rename memo"); if (node) cmds.push(node);
    const cmd = compositeCmd(cmds, "rename memo"); if (cmd) bus.dispatch(cmd);
    touchRecent(memoNodeId);
    setNote(`Renamed → "${clip(label, 24)}"${ceqIds.size > 1 ? ` (${ceqIds.size} questions chain it)` : ""}.`);
  };
  /** DUPLICATE into the same chain — a library copy would be unchained and therefore
   *  invisible in the previewer, so clone the node AND append it to the same choice's
   *  chain at the next baseline slot. One undo step. */
  const duplicateChainMemo = (ceqId: string, memoNodeId: string) => {
    const src = rf.getNode(memoNodeId); if (!src) return;
    const cc = (rf.getNode(ceqId)?.data as unknown as CeqCard | undefined)?.choices ?? [];
    const host = cc.find((c) => (c.chain ?? []).some((it) => it.memoNodeId === memoNodeId));
    if (!host) { setNote("That memo isn't chained to this question — duplicate it from the library instead."); return; }
    const d = src.data as { memoKind?: string; title?: string; body?: string; category?: string; subcategory?: string; course?: string; label?: string; scale?: number };
    const label = `${d.label || memoText(d.title, d.body)} copy`;
    const memoId = cardId("memo");
    const spot = baselineSpot(cc.reduce((s, ch) => s + (ch.chain?.length ?? 0), 0));
    const memoNode = { id: memoId, type: "memo", position: { x: Math.round(spot.x), y: Math.round(spot.y) }, selected: false, data: { kind: "memo", memoKind: d.memoKind ?? "note", title: label, body: d.body ?? "", category: d.category ?? "", subcategory: d.subcategory ?? "", course: d.course ?? "", label, sourceId: memoNodeId, ...(spot.scale != null ? { scale: spot.scale } : {}) } };
    const edge = { id: `chn-${host.id}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: memoAnchorId(host.id), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    const add = addNodesAndEdgesCmd(rfl, [memoNode] as never, [edge] as never, "duplicate memo");
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === host.id ? { ...c, chain: [...(c.chain ?? []), { kind: "memo" as const, memoNodeId: memoId, label }] } : c)) }), "chain the copy");
    const cmd = compositeCmd([add, patch].filter((c): c is NonNullable<typeof c> => !!c), "duplicate memo into chain"); if (cmd) bus.dispatch(cmd);
    touchRecent(memoId);
    setNote(`Duplicated → "${clip(label, 24)}" on the same choice (next baseline slot).`);
  };
  /** SET a chosen category on the acted-on memo(s) — one undo step (the library's
   *  chip cycles instead; this picks directly). */
  const setMemoCategory = (ids: string[], cat: string) => {
    const cmds = ids.map((id) => patchDataCmd(rfl, id, { category: cat }, "set category")).filter((c): c is NonNullable<typeof c> => !!c);
    const cmd = compositeCmd(cmds, "set memo category"); if (cmd) bus.dispatch(cmd);
    setLastMemoCat(cat);
    ids.forEach(touchRecent);
    setNote(`Category → ${cat} (${ids.length} memo${ids.length === 1 ? "" : "s"}).`);
  };
  /** DELETE from the previewer — confirm-guarded (it removes the memo from EVERY
   *  question that chains it, not just this one) then reuses the library's existing
   *  one-step delete. The guard lives here so the library row × and the Delete key
   *  keep their current behaviour. */
  const deleteMemosGuarded = (ids: string[]) => {
    if (ids.length === 0) return;
    const uses = ids.reduce((s, id) => s + usageOf(id), 0);
    // IN-APP confirm (no native dialog): themed, and works in the popped-out Studio
    // where a native confirm binds to the opener window.
    setConfirmBox({
      msg: `Delete ${ids.length} memo${ids.length === 1 ? "" : "s"} from the scene${uses ? ` — chained in ${uses} place${uses === 1 ? "" : "s"}` : ""}? Ctrl+Z restores everything.`,
      onYes: () => { setPreviewSelMemo(null); deleteMemos(ids); },
    });
  };

  /** Drop a memo onto a choice → attach it (existing node) to that choice's chain. */
  const attachMemoToChoice = (ceqId: string, choiceId: string, memoId: string) => {
    const m = rf.getNode(memoId); if (!m) return;
    const md = m.data as { label?: string; title?: string; body?: string };
    const label = md.label || memoText(md.title, md.body);
    if (choiceId === "__stem__") {
      // STEM CHAIN (P2) — chained to the QUESTION: walks out before any choice,
      // in authored order. No canvas chain-arrow (there is no choice anchor).
      const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ stemChain: [...((prev as unknown as { stemChain?: CeqChainItem[] }).stemChain ?? []), { kind: "memo" as const, memoNodeId: memoId, label }] }), "attach memo to question");
      if (patch) bus.dispatch(patch);
      touchRecent(memoId);
      setNote(`Attached "${clip(label, 24)}" to the QUESTION — walks out before any choice.`);
      return;
    }
    const edge = { id: `chn-${choiceId}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: memoAnchorId(choiceId), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    const add = addNodesAndEdgesCmd(rfl, [] as never, [edge] as never, "chain arrow"); if (add) bus.dispatch(add);
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: [...(c.chain ?? []), { kind: "memo" as const, memoNodeId: memoId, label }] } : c)) }), "attach memo");
    if (patch) bus.dispatch(patch);
    touchRecent(memoId);
    setNote(`Attached "${clip(label, 24)}" to choice.`);
  };

  // ---- REHEARSAL wiring (tool 2) ------------------------------------------------
  const startRehearse = () => {
    if (!deck || questions.length === 0) return;
    prevRunRef.current = undefined;
    setQId(questions[0].id);
    setRecording(true); // the film-true surface
    setRehearse(true);
  };
  const exitRehearse = () => {
    setRehearse(false);
    setRecording(false);
    setRunCard(null);
    prevRunRef.current = undefined;
  };
  // keys: ←/→ walk (PageUp/PageDown already walk via the recording surface);
  // Esc exits; ANY key skips a showing interstitial. Capture-phase so the walk
  // keys never leak into other handlers while rehearsing.
  useEffect(() => {
    if (!rehearse) return;
    const onKey = (e: KeyboardEvent) => {
      if (runCardTimer.current != null) { setRunCard(null); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); exitRehearse(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); gotoQuestion(1); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); gotoQuestion(-1); return; }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rehearse, qId, questions]);
  // run-boundary interstitial: fires when the frame under the cursor changes run
  useEffect(() => {
    if (!rehearse || !qId || qId === LAYOUT_Q0) return;
    const run = ((rf.getNode(qId)?.data as unknown as CeqCard | undefined)?.run ?? "").trim() || undefined;
    if (prevRunRef.current !== undefined && run && run !== prevRunRef.current) {
      setRunCard(run);
      if (runCardTimer.current != null) window.clearTimeout(runCardTimer.current);
      runCardTimer.current = window.setTimeout(() => { setRunCard(null); runCardTimer.current = null; }, 500);
    }
    prevRunRef.current = run;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rehearse, qId]);

  const COL = "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg";
  const HEAD = "flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider";
  // ONE previewer prop set, rendered in EITHER the authoring pane (recMode=false) or the
  // Recording Mode portal (recMode=true). recMode drives the previewer's chrome/key/interaction
  // suppression; the enter/exit callbacks flip the studio-level `recording` flag.
  /* TRANSPORT ROW SLOTS (film-run fixes §2.3 + §2.6). The row lives in the previewer but
     the data lives here, so the Studio supplies the controls as nodes:
       left  = the open question's CLIP STACK, hoisted out of the editor toolbar;
       right = the four per-CEQ flags as icon toggles, hoisted out of the EDIT STEM row,
               where the ‹ › question arrows used to be. On/off reads at a glance: a
               filled, coloured chip is ON, a muted outline is OFF.
     Both are Q0-blind — the layout stage is not a question and carries no flags. */
  const transportClips = qId && qId !== LAYOUT_Q0 ? (() => {
    const clips = cardClips(rf.getNode(qId)?.data as unknown as CeqCard | undefined);
    return (
      <button className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: takePreview === qId ? "#0B1322" : clips.length ? "#3BF5A0" : NEON.muted, background: takePreview === qId ? "#3BF5A0" : "transparent", border: "1px solid rgba(59,245,160,0.4)" }} onClick={() => setTakePreview((k) => (k === qId ? null : qId))} title={clips.length ? `${clips.length} clip${clips.length === 1 ? "" : "s"} on the open question — manage the stack (base + lookbacks)` : "No clips on the open question yet — open the stack to see the drop target"}>
        {clips.length ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />} Clips{clips.length ? ` (${clips.length})` : ""}
      </button>
    );
  })() : null;
  const FLAG_ON = { star: "#FFD23F", boss: NEON.yellow, chaching: "#3BF5A0", short: "#FF8B9E" } as const;
  const flagBtn = (key: keyof typeof FLAG_ON, on: boolean, label: string, tip: string, Icon: typeof Star) => (
    <button
      key={key}
      className="grid h-6 w-6 place-items-center rounded"
      aria-label={label}
      aria-pressed={on}
      style={on ? { color: "#0B1322", background: FLAG_ON[key], border: `1px solid ${FLAG_ON[key]}` } : { color: NEON.muted, background: "transparent", border: `1px solid ${NEON.borderSoft}` }}
      onClick={() => { if (qId && qId !== LAYOUT_Q0) toggleFlag(key); }}
      title={tip}
    ><Icon className="h-3.5 w-3.5" /></button>
  );
  const toggleFlag = (key: keyof typeof FLAG_ON) => {
    if (!qId || qId === LAYOUT_Q0) return;
    const d = rf.getNode(qId)?.data as unknown as CeqCard | undefined;
    if (key === "star") patchQ(qId, { starred: !d?.starred });
    else if (key === "boss") patchQ(qId, { boss: !d?.boss });
    // Cha-ching is an OPT-OUT: absent/true = plays. The toggle writes the inverse.
    else if (key === "chaching") patchQ(qId, { confirmSfx: d?.confirmSfx === false });
    else patchQ(qId, { short: !d?.short });
  };
  const transportFlags = qd && qId && qId !== LAYOUT_Q0 ? (<>
    {flagBtn("star", !!qd.starred, "Star", "Star — a performer's note. Inert: NO effect on spacewalk / stitch / publish.", Star)}
    {flagBtn("boss", !!qd.boss, "Boss", "Boss card — fires the cram-launch cue when this question is dealt (film)", Crown)}
    {flagBtn("chaching", qd.confirmSfx !== false, "Cha-ching on correct", "Cha-ching on correct — plays by DEFAULT on the correct-Enter (film); click to silence it for this question", BadgeCheck)}
    {flagBtn("short", !!qd.short, "Short", "Flag this CEQ as shorts-worthy — it joins the Shorts queue worklist", Clapperboard)}
  </>) : null;

  const renderPreviewer = (recMode: boolean) => (
    <CeqPreviewer transportLeft={transportClips} transportRight={transportFlags} ceqId={qId} mainRf={rf} mainSig={ceqSig} frameW={frameW} frameH={frameH} chainEdges={previewEdges} baseline={deck?.layout} world={deck?.world} worldIntensity={deck?.worldIntensity} worldMotion={deck?.worldMotion} onSaveBaseline={(l) => { if (deck) saveBaselineLayout(deck.id, l); }} onSaveInstance={(g) => { if (qId && qId !== LAYOUT_Q0) saveInstanceGeom(qId, g); }} layoutOn={deck?.layoutMode !== false} onSetLayoutMode={setLayoutMode} onApplyLayoutToAll={() => { const n = questions.length; if (n > 0 && window.confirm(`Re-stamp all ${n} question${n === 1 ? "" : "s"} from the layout?

This overwrites any hand-placed card/memo positions in this set. One Ctrl+Z undoes all of it.`)) applyLayoutToAll(); }} onSetWorld={(w) => { if (deck) { setDecks((prev) => updateDeck(prev, deck.id, { world: w })); setNote(w ? `Visual world set for this set — shows in the previewer + film mode.` : "Cleared the set's visual world."); } }} onPatchChainItem={(memoNodeId, patch) => { if (qId) patchChainItem(qId, memoNodeId, patch); }} onReorderChainMemo={reorderChainByMemo} onAttachMemo={(choiceId, memoId) => { if (qId) attachMemoToChoice(qId, choiceId, memoId); }} deckCeqIds={deckCeqIds} counterIds={counterIds} stageSig={stagedHere.map((e) => `${e.id}:${e.hidden ? 1 : 0}`).join(",")} onSelectQuestion={(id) => { setQId(id); setExpandedQ((s) => new Set(s).add(id)); }} onCopyItems={copyItems} onPasteItems={pasteItems} hasItemsClip={itemsClip.length} onSendToStarred={sendToStarred} onCopyStyleToSet={applyStyleToSet} starredCount={starCount} layoutMode={qId === LAYOUT_Q0} onAddMemoAtChoice={(choiceId, text, category) => { if (qId && qId !== LAYOUT_Q0) createMemoChained(qId, choiceId, text, category); }} onAddMemoAt={addMemoAt} onRenameMemo={renameMemoEverywhere} onEditStem={(cid, text) => patchQ(cid, { prompt: text }, `q:${cid}:prompt`)} onDuplicateMemo={(mid) => { if (qId && qId !== LAYOUT_Q0) duplicateChainMemo(qId, mid); }} onSetMemoCategory={setMemoCategory} onDeleteMemo={deleteMemosGuarded} onSetMisconception={setMemoMisconception} misconceptionSlugs={misconceptionDefs.map((d) => d.slug)} onSelectMemo={setPreviewSelMemo} onNextQuestion={() => gotoQuestion(1)} onPrevQuestion={() => gotoQuestion(-1)} showProgress={deck?.showProgress} onSetShowProgress={(b) => { if (deck) setDecks((prev) => updateDeck(prev, deck.id, { showProgress: b })); }} bossAutoArm={deck?.bossAutoArm} onOpenMemoLib={(id) => { setLibOpen(true); setPreviewSelMemo(id); }} topicName={(() => { const rows = spineRows(deck); return rows ? topicLabel(rows.topic).replace(/^ch\s*\d+\s*[·.\-:]\s*/i, "").replace(/\s*\(archived\)\s*$/i, "").trim() : undefined; })()} recording={recMode} onToggleBoss={(cid) => { const cur = !!(rf.getNode(cid)?.data as unknown as CeqCard | undefined)?.boss; patchQ(cid, { boss: !cur }); setNote(cur ? "Boss mark removed." : "👑 Marked as a BOSS — it joins the boss compilation pool."); }} revealAnswers={deck?.revealAnswers} onEditLayout={enterLayoutEdit} onSelectStageEl={setSelStageEl} onExitRecording={() => { setRecording(false); setRehearse(false); setRunCard(null); }} />
  );
  return (
    <div ref={studioRootRef} className={popped ? "flex h-full w-full flex-col" : "absolute inset-0 flex flex-col"} style={{ background: "rgba(6,10,20,0.98)", color: NEON.text, zIndex: popped ? undefined : Z.overlay }}>
      {/* RECORDING MODE (#3) — an opaque navy full-window layer at Z.recording (above ALL
          Studio chrome AND the canvas navbar/sidebar), portaled to THIS window's <body> so
          it also works when the Studio is popped out. Shows ONLY the live CEQ card + reveal
          state; the previewer itself hides its chrome + swallows non-allowlisted keys. */}
      {recording && studioRootRef.current && createPortal(
        <div className="sa-rec-surface film-mode fixed inset-0" style={{ zIndex: Z.recording, background: "#080D18", cursor: cursorHidden ? "none" : undefined }}>
          {/* Force the cursor hidden across EVERYTHING in the shot — ReactFlow sets its own
              pane cursor, which would otherwise sit in-frame after the 1s idle. */}
          {cursorHidden && <style>{`.sa-rec-surface, .sa-rec-surface * { cursor: none !important; }`}</style>}
          {/* FILM-TRUE (A1/A3): the recording surface is a filming surface — cards must
              KNOW it (chrome/resize hidden, glow clicks live). It never had FilmContext,
              which is why a scale grip could sit in the shot (Lee's 08-14 screenshot). */}
          <style>{FILM_LOCK_CSS}</style>
          <div className="h-full w-full"><FilmContext.Provider value={true}>{renderPreviewer(true)}</FilmContext.Provider></div>
          {/* REHEARSAL chrome (tool 2): the ONLY chrome — a tiny corner counter. */}
          {rehearse && qId && qId !== LAYOUT_Q0 && (() => {
            const d = rf.getNode(qId)?.data as unknown as CeqCard | undefined;
            const n = counterIds.indexOf(qId) + 1;
            return (
              <div className="pointer-events-none fixed left-3 top-3 rounded px-2 py-1 text-[11px] font-bold tabular-nums" style={{ color: "rgba(245,239,230,0.55)", background: "rgba(8,13,24,0.65)" }}>
                {d?.noteOnly ? "note" : `Q ${n}/${counterIds.length}`}{d?.run ? ` · run ${d.run}` : ""}
              </div>
            );
          })()}
          {/* Run-boundary interstitial — 500ms, any key skips. */}
          {rehearse && runCard && (
            <div className="fixed inset-0 grid place-items-center" style={{ background: "rgba(8,13,24,0.88)" }}>
              <span className="text-[42px] font-black tracking-widest" style={{ color: "rgba(245,239,230,0.85)" }}>— Run {runCard} —</span>
            </div>
          )}
        </div>,
        studioRootRef.current.ownerDocument.body,
      )}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        {/* STUDIO HEADER, left — the SET's identity: its name + the draft/live control, which used
            to sit in the deleted CEQS strip (Studio Consolidation C). The bolt + STUDIO lockup
            moved to the app navbar in prompt A; it renders here only when popped out, where there
            is no navbar to carry it. */}
        <div className="flex min-w-0 items-center gap-2">
          {popped && <span className="flex shrink-0 items-center gap-2 text-[14px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.yellow }}><span className="inline-block h-4 w-3"><Bolt c1={NEON.yellow} c2={NEON.yellow} /></span> Studio</span>}
          {deck ? (
            <>
              <span className="min-w-0 truncate text-[13px] font-black" style={{ color: NEON.text }} title={setDisplayName(deck.name)}>{setDisplayName(deck.name)}</span>
              {/* LIVE ON STUDENT SIDE — instant draft⇄live toggle, no publish flow. Student queries
                  filter status='live' server-side; draft never reaches the client. */}
              <button
                className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={deck.status === "live" ? { color: "#0B1322", background: "#3BF5A0", border: "1px solid #3BF5A0" } : { color: "#F0B24A", background: "transparent", border: "1px solid rgba(240,178,74,0.5)" }}
                onClick={() => setDecks((prev) => updateDeck(prev, deck.id, { status: deck.status === "live" ? "draft" : "live" }))}
                title={deck.status === "live" ? "Live on student side — students can see this set. Click to pull it back to draft (author-only)." : "Draft — author-only, students never see it. Click to go Live on the student side."}
              >
                <Globe className="h-3 w-3" /> {deck.status === "live" ? "Live" : "Draft"}
              </button>
              {/* FREE / PAID (film-run fixes §2.7) — the SET's paywall, `deck.access`. This is
                  the real gate: entitlements.functions.ts and /learn both branch on
                  access === "paid", and /landing hides paid sets from the free tab. It is
                  NOT the same axis as the per-CEQ `free` flag, which only decides which
                  questions land in the free CUT of this set's video. New sets default to
                  free; until now nothing in the UI could change that. */}
              <button
                className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={deck.access === "paid" ? { color: "#0B1322", background: NEON.yellow, border: `1px solid ${NEON.yellow}` } : { color: "#3BF5A0", background: "transparent", border: "1px solid rgba(59,245,160,0.5)" }}
                onClick={() => setDecks((prev) => updateDeck(prev, deck.id, { access: deck.access === "paid" ? "free" : "paid" }))}
                title={deck.access === "paid" ? "Paid — this set is locked behind checkout on the student side. Click to make it free." : "Free — this set plays signed-out. Click to lock it behind checkout."}
              >
                {deck.access === "paid" ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />} {deck.access === "paid" ? "Paid" : "Free"}
              </button>
              {/* TAKE LOGGER (film-prep tool 4) — a sticky note on the set: "run A = clip
                  0047, redo Q9". Collapsed to the 🗒 icon until it has content; autosaves
                  through the deck (pool save carries it). No structure, no parsing. */}
              <div className="relative shrink-0">
                <button
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style={deck.takesNote?.trim() ? { color: "#0B1322", background: NEON.yellow, border: `1px solid ${NEON.yellow}` } : { color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
                  onClick={() => setTakesNoteOpen((v) => !v)}
                  title={deck.takesNote?.trim() ? `Takes note:\n${deck.takesNote}` : "Takes — a free-text sticky note for this set (clip numbers, redos). Autosaved."}
                >🗒{deck.takesNote?.trim() ? " Takes" : ""}</button>
                {takesNoteOpen && (
                  <div className="absolute left-0 top-8 z-[74] flex w-72 flex-col gap-1.5 rounded-lg p-2" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, boxShadow: "0 14px 36px -12px rgba(0,0,0,0.7)" }}>
                    <textarea
                      autoFocus
                      className="nodrag h-28 w-full resize-y rounded bg-black/30 p-1.5 text-[11px] leading-snug outline-none"
                      style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
                      placeholder={"run A = clip 0047\nrun B = 0048\nredo Q9"}
                      value={deck.takesNote ?? ""}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => setDecks((prev) => updateDeck(prev, deck.id, { takesNote: e.target.value }))}
                    />
                    <div className="flex items-center gap-2">
                      <button className="rounded px-2 py-0.5 text-[9.5px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} title="Stamp today as this set's last-filmed date (read-only elsewhere)" onClick={() => setDecks((prev) => updateDeck(prev, deck.id, { lastFilmedAt: new Date().toISOString().slice(0, 10) }))}>Mark filmed today</button>
                      {deck.lastFilmedAt && <span className="text-[9.5px]" style={{ color: NEON.muted }}>last filmed {deck.lastFilmedAt}</span>}
                      <button className="ml-auto rounded px-1.5 py-0.5 text-[9.5px]" style={{ color: NEON.muted }} onClick={() => setTakesNoteOpen(false)}>close</button>
                    </div>
                  </div>
                )}
              </div>
              {deck.lastFilmedAt && !takesNoteOpen && <span className="shrink-0 text-[9px]" style={{ color: NEON.muted }} title="Set manually via 'Mark filmed today' in the Takes note">filmed {deck.lastFilmedAt}</span>}
            </>
          ) : (
            <span className="text-[12px] font-bold" style={{ color: NEON.muted }}>No set open</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {note && <span className="text-[10px]" style={{ color: NEON.muted }}>{note}</span>}
          <button className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: shortsList.length ? "#0B0F1E" : NEON.muted, background: shortsList.length ? "#FF8B9E" : "transparent", border: `1px solid ${shortsList.length ? "#FF8B9E" : NEON.borderSoft}` }} title="Shorts queue — every shorts-flagged CEQ across all sets (batch-filming worklist)" onClick={() => setShortsQueueOpen(true)}>🎬 Shorts {shortsList.length > 0 && `(${shortsList.length})`}</button>
          {!popped && onPopOut && <button className="grid h-7 w-7 place-items-center rounded" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }} title="Pop out to a window (2nd monitor · capture-invisible)" onClick={onPopOut}><ExternalLink className="h-4 w-4" /></button>}
          <button className="grid h-7 w-7 place-items-center rounded" style={{ border: `1px solid ${NEON.borderSoft}` }} title="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
      </div>
      {/* TOP BAR — Videos · Topics (the editor) · Preview (the stitch) · Student
          (student-facing previews). Preview is a FIRST-CLASS tab so the editor
          and the video preview stop competing for the same center pane. */}
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1" style={{ borderColor: NEON.borderSoft }}>
        {/* STUDENT tab hidden (film-run fixes §6.2) — the "Student view · soon" pill in the
            canvas navbar is the future entry point. The tab's code stays wired; only the
            button is gone, so re-showing it is a one-line change. */}
        {([["videos", "CEQs"], ["preview", "Publish"]] as const).map(([k, l]) => (
          <button key={k} className="rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: topTab === k ? "#0B1322" : NEON.muted, background: topTab === k ? NEON.yellow : "transparent", border: `1px solid ${topTab === k ? NEON.yellow : NEON.borderSoft}` }} onClick={() => { setPrefs({ topTab: k }); if (!setsOpen) setSetsOpen(true); }}>{l}</button>
        ))}
        {/* MEMOS — the ONE way in (film-run fixes §6.1). It replaces two right-edge vertical
            tabs (this Studio's collapsed rail and the canvas route's fixed edge tab). The
            library still opens as the same right-side panel, still defaults CLOSED, and
            still has its own ✕ — this is just the handle. */}
        <button className="ml-2 flex items-center gap-1.5 rounded px-3 py-1 text-[10px] font-black uppercase tracking-wider" style={{ color: filming ? "#0B1322" : "#FF8B9E", background: filming ? "#FF5A6E" : "transparent", border: `1px solid ${filming ? "#FF5A6E" : "rgba(255,90,110,0.55)"}` }} onClick={() => { const v = !filming; setFilming(v); localStorage.setItem("sa-filming-mode", v ? "1" : "0"); setNote(v ? "FILMING MODE — spine, take rail, status. Authoring chrome is hidden, not changed; nothing was written to this set." : "AUTHORING MODE — everything back."); }} title="Switch the whole workspace between AUTHORING (everything) and FILMING (spine + take rail + status). A container change only — no set data is touched either way.">
          <Clapperboard className="h-3.5 w-3.5" /> {filming ? "Filming" : "Authoring"}
        </button>
        {topTab !== "preview" && !filming && (<>
          <button className="ml-2 flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: libOpen ? "#0B1322" : NEON.cyan, background: libOpen ? NEON.cyan : "transparent", border: `1px solid ${libOpen ? NEON.cyan : NEON.borderSoft}` }} onClick={() => setLibOpen((v) => !v)} title={libOpen ? "Close Elements" : "Elements — the memo library: search, quick-add, and drag memos onto choices"}>
            <Library className="h-3 w-3" /> Elements <span className="tabular-nums opacity-70">{memos.length}</span>
          </button>
          <button className="ml-1 flex items-center gap-1 rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: autoAdvance ? "#0B1322" : NEON.muted, background: autoAdvance ? "#3BF5A0" : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => { const v = !autoAdvance; setAutoAdvance(v); localStorage.setItem("sa-auto-advance", v ? "1" : "0"); setNote(v ? "AUTO-ADVANCE ON — a keep rolls you into the next frame (dissect CEQs wait for their moments)." : "Auto-advance OFF — keeps leave the spine where it is."); }} title="After F10 (keep), advance to the next frame automatically. A dissect CEQ with unfilmed moments always stays put.">⏭ auto</button>
          <button className="ml-1 flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: obsState.recording ? "#FF5A6E" : obsState.status === "connected" ? "#3BF5A0" : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setTakesOpen((v) => !v)} title="Takes inbox — OBS records, takes land here, review locally, Keep or Trash (F10 / F8). Nothing uploads until you Keep.">🎬 Takes{obsState.recording ? " ●" : ""}{armedTarget ? " · armed" : ""}</button>
          <button className="ml-1 flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setIdeaBank("board")} title="Idea bank — sticky notes by category, F7 quick-captures from anywhere in the Studio (never in film mode). Export for Claude = the overnight-prompt feeder.">📌</button>
        </>)}
      </div>
      {/* ONE-NAV-TRUCE (Krug pass): the internal set-tab strip is GONE — it was the
          third navigation showing the same objects as the outline. The outline is the
          ONE cross-set list; the filmstrip is the inside of a set; the header names
          the open set. openTabs/setId machinery stays (session restore, outline
          clicks) — only the redundant chip row was removed. */}
      {/* STITCH PREVIEW (F3) — watch it, read the math, adjust it, approve it.
          Approving is a decision, not a publish: nothing uploads from here. */}
      {previewStitch && (() => {
        const derived = (deck?.publications ?? []).filter((p) => p.stitchId === previewStitch.id);
        const blockers = derived.flatMap((p) => gateBlocks(publishGate(p, previewStitch, { totalS: previewStitch.cut?.totalS, lessonId: targetLesson(p.shipped?.access ?? "FREE"), access: p.shipped?.access ?? null })).map((g) => ({ id: g.id, text: g.text })));
        return (
          <StitchPreview
            stitch={previewStitch}
            takes={takesByPath}
            onChange={saveStitch}
            blockers={blockers.length ? blockers : undefined}
            onApprove={(st) => { saveStitch(st); setPreviewStitch(null); setNote(`Cut approved (rev ${st.rev}) and saved on the set. Nothing has been uploaded — publish when you are ready, and re-cutting later is always possible.`); }}
            onClose={() => setPreviewStitch(null)}
          />
        );
      })()}
      {/* IDEA BANK — a Studio-level overlay, NOT a CEQS-pane child. It used to
          mount inside the questions pane, so the 📌 button rendered on every tab
          but silently did nothing on Publish, and F7 there captured nothing. A
          capture tool that works on some screens is a capture tool you stop
          trusting. Still dead while recording — the film controller owns the keys. */}
      {ideaBank && !recording && <IdeaBank mode={ideaBank} onClose={() => setIdeaBank(null)} />}
      {/* STITCH MIGRATION (08-16) — dry run → read the table → Apply. The report and
          the write come from the SAME plan object, so what lands is what was read. */}
      {migration && (
        <div className="absolute inset-0 z-[80] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.72)" }} onClick={() => setMigration(null)}>
          <div className="mt-10 flex max-h-[82vh] w-[720px] max-w-[95vw] flex-col overflow-hidden rounded-xl shadow-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
              <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: NEON.yellow }}>Stitch migration — dry run</span>
              <span className="text-[10px]" style={{ color: NEON.muted }}>nothing written yet</span>
              <button className="ml-auto grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setMigration(null)} title="Close — writes nothing"><X className="h-4 w-4" /></button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto px-3 py-2 text-[10.5px] leading-relaxed" style={{ color: NEON.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{planReport(migration)}</pre>
            <div className="flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
              <button className="rounded px-3 py-1 text-[10px] font-black uppercase tracking-wider disabled:opacity-40" style={{ background: NEON.yellow, color: "#0B1322" }} disabled={!migration.totals.ceqStitches && !migration.totals.setStitches && !migration.totals.publications} onClick={() => applyStitchMigration(migration)} title="Add exactly the records in the table above. Nothing is deleted, no take is touched, and lesson mux fields stay as they are.">Apply — add {migration.totals.ceqStitches + migration.totals.setStitches} stitches + {migration.totals.publications} publications</button>
              <button className="rounded px-2.5 py-1 text-[10px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setMigration(null)}>Not yet</button>
              <span className="ml-auto text-[9px]" style={{ color: NEON.muted }}>idempotent — running it again plans nothing</span>
            </div>
          </div>
        </div>
      )}
      {/* SHORTS QUEUE (Lee) — the batch-filming worklist of every shorts-flagged CEQ. */}
      {shortsQueueOpen && (
        <div className="absolute inset-0 z-[70] flex flex-col" style={{ background: "rgba(6,10,20,0.97)" }} onClick={() => setShortsQueueOpen(false)}>
          <div className="mx-auto mt-10 flex max-h-[80vh] w-[560px] max-w-[92vw] flex-col overflow-hidden rounded-xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
              <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#FF8B9E" }}>🎬 Shorts queue</span>
              <span className="text-[10px]" style={{ color: NEON.muted }}>{shortsList.length} flagged</span>
              <button className="ml-auto grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setShortsQueueOpen(false)} title="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {shortsList.length === 0 ? (
                <div className="px-2 py-6 text-center text-[11px] italic" style={{ color: NEON.muted }}>No CEQs flagged as shorts yet — toggle 🎬 Short on a question.</div>
              ) : shortsList.map((s) => (
                <button key={s.id} className="mb-1 flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}` }} title="Jump to this question" onClick={() => { if (s.deckId) openSetTab(s.deckId); setQId(s.id); setExpandedQ((x) => new Set(x).add(s.id)); setShortsQueueOpen(false); }}>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase tabular-nums" style={{ color: "#FF8B9E", border: "1px solid rgba(255,92,110,0.5)" }}>{s.tqq}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: NEON.text }}>{s.stem}</span>
                  </div>
                  {s.note && <div className="pl-1 text-[10px] italic" style={{ color: NEON.yellow }}>angle: {s.note}</div>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STATUS STRIP (F2) — the four things worth knowing while filming, and
          nothing else. Studio window only; none of it may reach the capture window. */}
      {filming && (
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1" style={{ borderColor: NEON.borderSoft, background: "rgba(0,0,0,0.25)" }}>
          <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ color: obsState.recording ? "#0B1322" : obsState.status === "connected" ? "#3BF5A0" : NEON.muted, background: obsState.recording ? "#FF5A6E" : "transparent", border: `1px solid ${NEON.borderSoft}` }} title={obsState.detail || "OBS WebSocket"}>{obsState.recording ? "● REC" : `OBS ${obsState.status === "connected" ? "●" : "○"}`}</span>
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: armedTarget ? "#0B1322" : NEON.muted, background: armedTarget ? "#B79CFF" : "transparent", border: `1px solid ${NEON.borderSoft}` }} title={armedTarget ? armedTarget.ids.length + " frame(s) armed" : "Nothing armed — takes attach by coverage (what was on screen)"}>{armedTarget ? `armed: ${armedTarget.label ?? armedTarget.kind}` : "not armed"}</span>
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: todaysRoomTone() ? "#3BF5A0" : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} title="Room tone for today — the smart stitcher fills gaps with it. Upload it from the Publish panel.">🎙 {todaysRoomTone() ? "room tone ✓" : "no room tone"}</span>
          <span className="text-[9px] font-bold uppercase" style={{ color: NEON.muted }} title="Files moved to Recycle — never deleted; empty it from Explorer.">recycle {binStat.count}</span>
          <span className="ml-auto text-[9px] uppercase" style={{ color: NEON.muted }}>F9 roll · F10 keep · F8 trash <span title="F10 and F8 are APP keys — this window needs focus. Only OBS\u2019s F9 is global.">(app focus)</span></span>
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* LEFT RAIL — STUDENT tab only. The Studio has NO topic/set tree and no video
            library of its own: the leftmost DASHBOARD outline is the ONE navigation
            (Videos lives there too; clicking a topic or set there opens it here), and open
            sets switch via the SET TAB STRIP above. CEQs + Publish render full width. */}
        {topTab === "student" && !filming && (!setsOpen ? (
          <button className="flex w-8 shrink-0 flex-col items-center gap-2 rounded-lg py-2" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)", color: NEON.cyan }} onClick={() => setSetsOpen(true)} title="Show the left rail">
            <ListChecks className="h-4 w-4" />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ writingMode: "vertical-rl" }}>{topTab}</span>
          </button>
        ) : (
        <div className={COL} style={{ maxWidth: 240, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
          {topTab === "student" && (<>
            {/* STUDENT (Lee) — this tab is for student-facing previews of CEQ
                sets/cards as they'll ship. Those views land here; the authoring
                utilities below keep an interim home until they do. */}
            <div className="border-b px-2 py-1.5 text-[9px] leading-snug" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>Student-facing previews of CEQ sets & cards land here. Below: authoring utilities (interim home).</div>
            <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>Misconceptions <span style={{ color: NEON.muted }}>observed scope</span></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5 text-[10px]" style={{ color: NEON.text }}>
              {misconceptionDefs.map((def) => {
                const memoIds = nodes.filter((n) => n.type === "memo" && (n.data as { misconceptionId?: string }).misconceptionId === def.slug).map((n) => n.id);
                const qIds = new Set<string>();
                const topics = new Set<string>();
                for (const d of cardDecks) {
                  const mem = deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], d.id).filter((n) => (n as { type?: string }).type === "ceq");
                  for (const q of mem) { const qc = (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.choices; if (questionMisconceptions(qc, memoSlugOf).includes(def.slug)) { qIds.add(q.id); if (d.topicId) topics.add(deckTopicName(d) || d.name); } }
                }
                return (
                  <div key={def.slug} className="mb-1.5 rounded border px-1.5 py-1" style={{ borderColor: NEON.borderSoft }}>
                    <div className="flex items-center gap-1.5"><span className="font-black" style={{ color: NEON.yellow }}>{def.slug}</span><span className="text-[8.5px]" style={{ color: NEON.muted }}>{memoIds.length} memo(s) · {qIds.size} question(s)</span></div>
                    <div className="text-[9px]" style={{ color: NEON.muted }}>{def.description}</div>
                    {topics.size > 0 && <div className="text-[8px]" style={{ color: NEON.cyan }}>topics: {[...topics].join(" · ")}</div>}
                  </div>
                );
              })}
              <NewMisconceptionRow onAdd={addMisconceptionDef} />
            </div>

            <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>Tools</div>
            <div className="grid flex-1 place-items-center p-3 text-center text-[10.5px] leading-relaxed" style={{ color: NEON.muted }}>🛠 Coming soon —<br />batch take ingest · publish queue ·<br />shorts factory.</div>
          </>)}
        </div>
        ))}

        {/* PANE 2 — QUESTIONS + editor */}
        <div className={COL} style={{ flex: 1.4, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
          {/* PREVIEW TAB takes over this pane wholesale — the editor and the
              video preview stop competing for the same center (Lee). The left
              outline stays live so sets switch without leaving Preview. */}
          {topTab === "preview" ? (
            deck ? (
              /* key: switching sets REMOUNTS the preview — a rendered file, seek
                 offsets and re-render flags from set A must never survive into
                 set B (review: seeks used B's offsets against A's video). */
              <>
                {/* PUBLISH-TAB ACTION ROW (Studio Consolidation C). Export and Publish moved here
                    from the deleted CEQS strip. This is NOT cosmetic: that strip held their ONLY
                    entry point — no hotkey, no menu — so deleting the strip without this row would
                    have made both features unreachable. Preview needed no relocation: the button
                    only switched to this tab, and the tab IS the entry point. Runtime rides along
                    because the strip's ~free/full estimate died with it. */}
                <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-1.5" style={{ borderColor: NEON.borderSoft }}>
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Free {freeCount} · Full {questions.length}</span>
                  <span className="text-[10px] tabular-nums" style={{ color: NEON.cyan }} title="Estimated runtime = summed durations of the stitch clips (intro + set intro + takes + wrap + outro)">~{fmtDur(stitchRuntime(stitchFree.items))} / {fmtDur(stitchRuntime(stitchFull.items))}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => void exportSet()} title="Export this set as one markdown doc — every question, chain, flag, script layer and clip, in deck order. Copies to the clipboard AND downloads.">Export</button>
                    <button className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: "#3BF5A0", border: "1px solid rgba(59,245,160,0.5)" }} onClick={() => openStitchPreview({ kind: "set" })} title="PREVIEW THE CUT — play the whole set's stitch locally with its trims and gaps, see the per-clip math, adjust it, then approve. Nothing uploads.">▶ Preview cut</button>
                    <button className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={dryRunStitchMigration} title="STITCH MIGRATION — dry run. Builds a stitch for every CEQ clip stack, a set stitch for the intro/wrap/outro, and a shipped publication for every published lesson. Shows the table; writes nothing until you click Apply.">⧉ Stitches…</button>
                    <button className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: publishOpen ? "#0B0F1E" : "#3BF5A0", background: publishOpen ? "#3BF5A0" : "transparent", border: "1px solid rgba(59,245,160,0.5)" }} onClick={() => setPublishOpen(true)} title="Publish panel — Publish Free / Full, the lookback vertical, and the intro/outro/wrap clips (one home)">{publishBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />} Publish</button>
                  </div>
                </div>
                <CeqStitch key={deck.id} freeRows={stitchRows.free} fullRows={stitchRows.full} initialMode="full" onExit={() => setPrefs({ topTab: "videos" })} onJumpCeq={(id) => setQId(id)} onReplaceClip={replaceClipAt} onAddClipAfter={addClipAfter} onDeleteClip={deleteClipAt} onSetClipRole={setClipRole} onToggleFree={(id) => patchQ(id, { free: !(rf.getNode(id)?.data as unknown as CeqCard | undefined)?.free })} onAddWrap={(f) => dropSlot("wrap", f)} onDeleteWrap={removeWrapClip} onAddBumper={addBumper} onDeleteBumper={deleteBumper} />
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-[11px]" style={{ color: NEON.muted }}>Open a set (pick one in the outline) to preview its stitch.</div>
            )
          ) : (<>
          {/* SLIM STRIP (replaces the deleted CEQS sub-header). Left = the three things you reach
              for while filming a set: the batch-take dropzone, the set's Intro frame, and the 0·
              Layout baseline — all three used to eat vertical space at the top of the CEQ list —
              then Deal into frame, which is a filming action and stays one click.
              Right = list-scoped view controls (★ filter, wrap).
              GONE from here: the set name + draft/live (now the Studio header), Free/Full counts
              (now the outline set row), and Preview/Export/Publish (now the Publish tab). */}
          {deck && (
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1" style={{ borderColor: NEON.borderSoft }}>
              <div className="flex shrink-0 items-center gap-1 rounded border border-dashed px-2 py-0.5 text-[9.5px] leading-none" style={{ borderColor: dragKey === "ingest" ? NEON.yellow : NEON.borderSoft, color: NEON.muted, background: dragKey === "ingest" ? "rgba(252,163,17,0.12)" : "transparent", cursor: "pointer" }}
                onClick={() => ingestFileRef.current?.click()}
                onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); if (dragKey !== "ingest") setDragKey("ingest"); } }}
                onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragKey((k) => (k === "ingest" ? null : k)); }}
                onDrop={(e) => { e.preventDefault(); setDragKey(null); void matchIngest(videosFromDrop(e)); }}
                title="Batch takes — drop multiple clips (or click to browse); a confirm table opens before anything uploads. Name clips 01, 02… or q1.03 for auto-match.">
                ⬇ <b>batch takes</b>
                <span className="nodrag ml-1 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 text-[9px] font-bold uppercase" style={{ color: todaysRoomTone() ? "#3BF5A0" : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={(e) => { e.stopPropagation(); roomToneRef.current?.click(); }} title="ROOM TONE — a few seconds of your recorded silence. Uploading stores it stamped with today's date; the smart stitcher automatically fills dissect gaps with it (no per-CEQ steps). Re-upload same-day replaces.">🎙 room tone{todaysRoomTone() ? " ✓" : ""}</span>
                <input ref={roomToneRef} type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; void (async () => { try { const t = await stageTake(f); saveRoomTone({ date: isoDay(), url: t.url, path: t.path, name: f.name }); setNote("Room tone saved for " + isoDay() + " — dissect stitches today use it automatically."); } catch (err) { setNote("Room tone upload FAILED: " + (err instanceof Error ? err.message : String(err))); } })(); }} />
                <input ref={ingestFileRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void matchIngest(fs); }} />
              </div>
              {/* SET INTRO — a filmable, fully editable frame (a copy of the CEQ HOOK frame) with
                  its own take slot. Never a question: no counts, no deal, no choices semantics. */}
              <button className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[9.5px] font-bold leading-none" style={{ color: NEON.text, border: `1px solid ${dragKey === "hook" ? NEON.yellow : NEON.borderSoft}`, background: dragKey === "hook" ? "rgba(252,163,17,0.14)" : "transparent" }} onClick={openIntroFrame} {...dragProps("hook", dropHookTake)}
                title="The set's INTRO — opens (creating on first use) an editable frame copied from the CEQ HOOK frame. Films like a question: drop its clip here; it stitches after the boilerplate intro, before the CEQ takes, in BOTH cuts. No clip = skipped silently.">
                <Film className="h-3 w-3" style={{ color: NEON.cyan }} /> Intro
                {deck.hookTake
                  ? <span className="tabular-nums" style={{ color: "#3BF5A0" }}>{fmtDur(deck.hookTake.duration)}</span>
                  : <span style={{ color: NEON.muted }}>drop clip</span>}
              </button>
              {/* QUESTION 0 — the set's LAYOUT as an editable stage. Never films, never stitches. */}
              <button className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[9.5px] font-bold leading-none" style={{ color: qId === LAYOUT_Q0 ? NEON.yellow : NEON.text, border: `1px solid ${qId === LAYOUT_Q0 ? NEON.border : NEON.borderSoft}`, background: qId === LAYOUT_Q0 ? "rgba(252,163,17,0.14)" : "transparent" }} onClick={() => setQId(LAYOUT_Q0)}
                title="Question 0 — sculpt the baseline: drag the LAYOUT card + memo slots and every question deals there. Not content: never films, stitches or counts.">
                <LayoutGrid className="h-3 w-3" style={{ color: NEON.yellow }} /> 0 · Layout
                <span className="tabular-nums" style={{ color: NEON.muted }}>{deck.layout?.memoSlots?.length ?? 0}</span>
              </button>
              {/* TOOLBAR DIET (film-run fixes §2.1–2.3): "Deal into frame" is gone (retired),
                  "+ Frame" is gone (frames are inserted from the left rail's + affordances),
                  and "Clips" moved down to the transport row beside FILM. */}
              {/* ADD (Lee) — the ONE menu for every element that can go on a question:
                  grouped, alphabetical inside each group, type-to-filter. Replaces the
                  two v1-toolbar menus (cards + design elements) that v2 chrome hid. */}
              <button className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[9.5px] font-bold leading-none" style={{ color: addOpen ? "#0B1322" : NEON.yellow, background: addOpen ? NEON.yellow : "transparent", border: `1px solid ${addOpen ? NEON.yellow : NEON.borderSoft}` }} onClick={openAddMenu} title="Add an element onto this question — it films with the card and can be hidden until you reveal it">
                <Plus className="h-3 w-3" /> Add
              </button>
              {/* STAGED ON THIS QUESTION — show/hide + remove. 👁 is the film toggle:
                  hidden elements ghost here and never reach the camera. */}
              {stagedHere.map((el) => (
                <span key={el.id} className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold leading-none" style={{ color: el.hidden ? NEON.muted : "#3BF5A0", border: `1px solid ${el.hidden ? NEON.borderSoft : "rgba(59,245,160,0.4)"}` }} title={el.hidden ? "Hidden — click 👁 to put it on camera" : "On camera — click 👁 to hide it"}>
                  <button onClick={() => toggleStageHidden(el.id)} title={el.hidden ? "Show on camera" : "Hide until revealed"}>{el.hidden ? "🙈" : "👁"}</button>
                  <span className="max-w-[76px] truncate">{el.title || el.kind}</span>
                  <button style={{ color: NEON.cyan }} onClick={() => copyStageElement(el.id)} title="Copy this element — then open another frame and paste it from the Add menu">⧉</button>
                  <button style={{ color: NEON.red }} onClick={() => removeStageElement(el.id)} title="Remove this element from the question">✕</button>
                </span>
              ))}

              <div className="ml-auto flex shrink-0 items-center gap-1">
                {/* READY TO FILM? (film-prep tool 1) — read-only pass/fail panel; failures
                    click through to the offending frame. */}
                <button className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[9.5px] font-bold leading-none" style={{ color: "#3BF5A0", border: "1px solid rgba(59,245,160,0.4)" }} title="Run the film-readiness checks on this set — correct choices, stems, exhibits, run letters, shorthands. Read-only; fixes happen in the editor." onClick={() => {
                  setReadiness(checkFilmReadiness(questions.map((qn) => {
                    const d = rf.getNode(qn.id)?.data as unknown as CeqCard | undefined;
                    return { id: qn.id, prompt: d?.prompt ?? "", noteOnly: !!d?.noteOnly, choices: (d?.choices ?? []).map((ch) => ({ text: ch.text, correct: ch.correct })), exhibit: d?.exhibit, run: d?.run, shorthand: d?.shorthand, chainCount: (d?.choices ?? []).reduce((a, ch) => a + (ch.chain?.length ?? 0), 0), dissect: d?.dissect, takeMomentIds: cardClips(d).map((t) => t.momentId).filter((x): x is string => !!x) };
                  }), deck?.profile));
                }}><ListChecks className="h-3 w-3" /> Ready to film?</button>
                {/* REHEARSE (tool 2) — coffee + walkthrough before OBS opens. */}
                <button className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[9.5px] font-bold leading-none" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} title="Rehearse — full-screen, film-true walkthrough from Q1. →/PageDown next, ←/PageUp back, Esc exits. A slim '— Run B —' card marks take boundaries. Nothing records, nothing logs." onClick={startRehearse}><Play className="h-3 w-3" /> Rehearse</button>
                {/* TOOLBAR DIET (frames rename §5): the ★ FILTER is gone — it filtered the
                    deleted list column, so it filtered nothing. The star COUNT + clear stay
                    (real actions); stars themselves show on the filmstrip. */}
                {starCount > 0 && <span className="flex items-center gap-1 px-1 text-[9.5px] font-bold" style={{ color: "#FFD23F" }} title="Starred questions in this set (performer's notes) — shown on the filmstrip">★ {starCount}</span>}
                {starCount > 0 && <button className="rounded px-1.5 py-0.5 text-[9.5px] font-bold" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={clearAllStars} title="Clear ALL stars in this set (confirm)">clear ★</button>}
                {selChainMemos.size > 0 && <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={copyMemos} title="Copy the selected memos (Ctrl+C)"><Copy className="h-3 w-3" /> copy {selChainMemos.size}</button>}
                {memoClip.length > 0 && qId && <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => pasteMemos(qId)} title="Paste the copied memos into this question (Ctrl+V)"><ClipboardPaste className="h-3 w-3" /> paste {memoClip.length}</button>}
                {/* WRAP toggle removed (§5): it styled rows in the deleted list column. */}
              </div>
            </div>
          )}
          {/* Empty state: the Studio has no set tree of its own — the old "on the left" copy was a
              leftover from the retired Topics tab and pointed at nothing. */}
          {!deck ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-[11px]" style={{ color: NEON.muted }}>No set open — pick one in the outline on the far left.</div>
          ) : (
            <div className="flex min-h-0 flex-1">
              {/* LINEAR BOARD (frames rename §2) — the vertical filmstrip IS the set's shape:
                  frame 1 at top, scroll down; the selected frame renders large in the editor
                  beside it. The outline stays the cross-set list; this rail is the inside of
                  ONE set. Hover a gap → [+] → CEQ/Note chooser. */}
              <SetFilmstrip
                items={stripItems}
                qId={qId === LAYOUT_Q0 ? null : qId}
                onSelect={(id) => { setQId(id); setExpandedQ((s) => new Set(s).add(id)); }}
                onInsert={insertFrame}
                sel={qSel}
                onSelChange={setQSel}
                // Markers act on the SELECTION when there is one, else the open frame —
                // so the ⋮ menu is the single home for them (they were loose text
                // buttons in the bottom bar).
                formulaNote={deck?.profile?.formula}
                actions={{
                  shuffleChoices,
                  star: () => (qSel.size ? bulkStar() : qId && qId !== LAYOUT_Q0 ? patchQ(qId, { starred: !(rf.getNode(qId)?.data as unknown as CeqCard | undefined)?.starred }) : undefined),
                  boss: () => (qSel.size ? bulkBoss() : qId && qId !== LAYOUT_Q0 ? patchQ(qId, { boss: !(rf.getNode(qId)?.data as unknown as CeqCard | undefined)?.boss }) : undefined),
                  chaching: () => (qSel.size ? bulkChaching() : qId && qId !== LAYOUT_Q0 ? patchQ(qId, { confirmSfx: (rf.getNode(qId)?.data as unknown as CeqCard | undefined)?.confirmSfx === false }) : undefined),
                  short: () => (qSel.size ? bulkShort() : qId && qId !== LAYOUT_Q0 ? patchQ(qId, { short: !(rf.getNode(qId)?.data as unknown as CeqCard | undefined)?.short }) : undefined),
                  free: () => (qSel.size ? bulkFree() : qId && qId !== LAYOUT_Q0 ? patchQ(qId, { free: !(rf.getNode(qId)?.data as unknown as CeqCard | undefined)?.free }) : undefined),
                  assignRun,
                  dissect: () => { if (qId && qId !== LAYOUT_Q0) setDissectQ(qId); },
                  profile: () => setProfileOpen(true),
                  frameMode: () => {
                    const ids = qSel.size ? [...qSel] : qId && qId !== LAYOUT_Q0 ? [qId] : [];
                    if (!ids.length) return;
                    const order = ["note", "intro", "outro"] as const;
                    const cur = (rf.getNode(ids[0])?.data as unknown as CeqCard | undefined)?.frameMode ?? "note";
                    const next = order[(order.indexOf(cur) + 1) % order.length];
                    const cmds = ids.map((iid) => { const dd = rf.getNode(iid)?.data as unknown as CeqCard | undefined; return dd?.noteOnly ? patchDataCmd(rfl, iid, { frameMode: next }, "frame mode") : null; }).filter((c): c is NonNullable<typeof c> => !!c);
                    if (!cmds.length) { setNote("Frame mode applies to NON-CEQ frames (note / intro / outro)."); return; }
                    const cmd = compositeCmd(cmds, "frame mode"); if (cmd) bus.dispatch(cmd);
                    setNote(cmds.length + " frame" + (cmds.length === 1 ? "" : "s") + " → " + next.toUpperCase() + " (a label + a starting point — everything on the frame stays yours).");
                  },
                  armUploads: () => armFromSelection(),
                  armedLabel: armedTarget?.label,
                  uploadClip: (file: File) => { void (async () => {
                    const ids = qSel.size ? questions.filter((q) => qSel.has(q.id)).map((q) => q.id) : qId && qId !== LAYOUT_Q0 ? [qId] : [];
                    if (!ids.length) { setNote("Select frames in the spine (or open one) first — then Upload clip."); return; }
                    setNote("Uploading clip for " + ids.length + " frame" + (ids.length === 1 ? "" : "s") + "…");
                    try {
                      const t = await stageTake(file);
                      const first = ids[0];
                      const d0 = rf.getNode(first)?.data as unknown as CeqCard | undefined;
                      const take = ids.length > 1 ? { ...t, coversFrameIds: ids } : t;
                      patchQ(first, { takes: [...cardClips(d0), take] });
                      setNote("Clip (" + fmtDur(t.duration) + ") attached — covers " + ids.length + " frame" + (ids.length === 1 ? "" : "s") + " from the first selected. Review in Publish ▸ Clips.");
                    } catch (err) { setNote("Upload FAILED: " + (err instanceof Error ? err.message : String(err))); }
                  })(); },
                  revealAnswers: () => { if (!deck) return; const on = !deck.revealAnswers; setDecks((prev) => updateDeck(prev, deck.id, { revealAnswers: on })); setNote(on ? "ANSWERS REVEALED — every CEQ in this set deals with the correct choice already green (recap mode)." : "Answers hidden again — normal practice dealing."); },
                  revealAnswersOn: deck?.revealAnswers,
                  ignoreLayout: () => { const ids = qSel.size ? [...qSel] : qId && qId !== LAYOUT_Q0 ? [qId] : []; if (!ids.length) return; const allOn = ids.every((iid) => !!(rf.getNode(iid)?.data as unknown as CeqCard | undefined)?.ignoreLayout); const cmds = ids.map((iid) => patchDataCmd(rfl, iid, { ignoreLayout: !allOn }, "layout opt-out")).filter((c): c is NonNullable<typeof c> => !!c); const cmd = compositeCmd(cmds, "layout opt-out"); if (cmd) bus.dispatch(cmd); setNote(ids.length + " frame" + (ids.length === 1 ? "" : "s") + (allOn ? " back on the set layout" : " now IGNORE the set layout") + "."); },
                  fillDownRuns: fillRunsDown,
                  previewStitch: () => { if (qId && qId !== LAYOUT_Q0) openStitchPreview({ kind: "ceq", ceqId: qId }); else setNote("Open a frame first — the stitch preview is per CEQ (or use Publish ▸ Preview cut for the whole set)."); },
                }}
              />
              {/* (SET CLIPS moved to the Publish panel — one home for the publish path.) */}
              {/* READY TO FILM? panel — pass/fail list + counts; ✗ rows link to frames. */}
              {/* DISSECT MOMENTS EDITOR (P5) — the pre-filming shot list for one CEQ.
                  Toggle dissect on/off; add / rename / reorder / waive moments; tag an
                  existing take to a moment. All writes go through patchQ (undoable). */}
              {/* SET PRODUCTION PROFILE (P6) — compact per-set panel + templates. */}
              {/* EDITING SET LAYOUT (layout rework) — the unmistakable state. */}
              {qId === LAYOUT_Q0 && (
                <div className="absolute left-1/2 top-2 z-[72] flex -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-1.5 shadow-xl" style={{ background: "rgba(252,163,17,0.95)", color: "#0B1322" }}>
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="text-[10.5px] font-black uppercase tracking-wider">Editing set layout — the base frame every frame deals from</span>
                  <button className="rounded px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: "#0B1322", color: NEON.yellow }} onClick={exitLayoutEdit}>Done</button>
                </div>
              )}
              {/* SAVE-TIME APPLY CHOICE (layout rework): after editing the base frame,
                  the explicit decision — with the honest counts — or nothing yet. */}
              {applyPanel && deck && (
                <div className="absolute inset-0 z-[73] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.6)" }} onClick={() => setApplyPanel(null)}>
                  <div className="mt-16 w-[400px] max-w-[94vw] rounded-xl p-3 shadow-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
                    <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: NEON.yellow }}>Layout saved — apply it?</div>
                    <div className="mt-1.5 text-[10.5px] leading-relaxed" style={{ color: NEON.text }}>
                      <b>{applyPanel.conform}</b> frame{applyPanel.conform === 1 ? "" : "s"} already follow the layout and will re-conform.<br />
                      <b style={{ color: applyPanel.hand ? "#FFD23F" : undefined }}>{applyPanel.hand}</b> ha{applyPanel.hand === 1 ? "s" : "ve"} hand-placed geometry that applying will overwrite (one Ctrl+Z restores).<br />
                      <b>{applyPanel.opted}</b> opted out (📐) and will not be touched.
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button className="rounded px-2.5 py-1 text-[10px] font-black uppercase" style={{ background: NEON.yellow, color: "#0B1322" }} onClick={() => { setApplyPanel(null); applyLayoutToAll(); }}>Apply to {applyPanel.conform + applyPanel.hand} frame{applyPanel.conform + applyPanel.hand === 1 ? "" : "s"}</button>
                      <button className="rounded px-2.5 py-1 text-[10px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setApplyPanel(null)}>Not yet — future deals only</button>
                    </div>
                  </div>
                </div>
              )}
              {(takesOpen || filming) && !recording && (
                <TakesInbox
                  inline={filming}
                  onRecycle={setBinStat}
                  clipsPanel={filming ? clipsPanel : undefined}
                  onClose={() => setTakesOpen(false)}
                  armed={armedTarget}
                  onDisarm={() => { setArmedTarget(null); setNote("Uploads disarmed — new takes land unattached."); }}
                  liveFrameIds={() => Array.from(new Set([...coveredRef.current, ...(qId && qId !== LAYOUT_Q0 ? [qId] : [])]))}
                  onObsState={setObsState}
                  onRecordStart={onRecordStart}
                  onUpload={async (t: TakeRecord, file: File) => {
                    // AUTO-ATTACH (F1): the frames that were ON SCREEN while this
                    // take rolled win; the armed target is the fallback. Several
                    // frames ⇒ run coverage across them (coversFrameIds).
                    const ids = attachTargets(t, questions.map((q) => q.id));
                    if (!ids.length) throw new Error("nothing to attach to — arm a target or film with a frame open");
                    const staged = await stageTake(file);
                    const first = ids[0];
                    const d0 = rf.getNode(first)?.data as unknown as CeqCard | undefined;
                    const take = { ...staged, ...(ids.length > 1 ? { coversFrameIds: ids } : {}), ...(t.slateEndMs != null ? { slateEndMs: t.slateEndMs } : {}) };
                    patchQ(first, { takes: [...cardClips(d0), take] });
                    // AUTO-ADVANCE (F1) — but a dissect CEQ with moments still to
                    // shoot keeps the spine parked so Lee rolls the next moment.
                    const last = ids[ids.length - 1];
                    const dLast = rf.getNode(last)?.data as unknown as CeqCard | undefined;
                    const dz = dLast?.dissect;
                    const covered = new Set((cardClips(dLast).map((c) => c.momentId).filter(Boolean) as string[]));
                    const nextMoment = dz?.on ? dz.moments.find((m) => !m.waived && !covered.has(m.id)) : undefined;
                    if (nextMoment) {
                      setQId(last);
                      setNote(`Attached. STAYING PUT — dissect moment "${nextMoment.label || "(unnamed)"}" is still unfilmed.`);
                    } else if (autoAdvance) {
                      const idx = questions.findIndex((q) => q.id === last);
                      const next = idx >= 0 ? questions[idx + 1] : undefined;
                      if (next) { setQId(next.id); setNote("Attached → advanced to the next frame. Roll when ready."); }
                      else setNote("Attached — that was the last frame in the set.");
                    } else {
                      setNote(`Attached to ${ids.length} frame${ids.length === 1 ? "" : "s"}.`);
                    }
                    return { url: staged.url, path: staged.path };
                  }}
                />
              )}
              {/* COUNTDOWN (T1 addendum) — STUDIO ONLY. Never rendered inside the
                  film popout, the capture window or the Recording Mode portal:
                  nothing status-related may exist where OBS captures. */}
              {(slate.count != null || slate.speak) && !recording && (
                <div className="pointer-events-none absolute inset-0 z-[80] grid place-items-center" style={{ background: "rgba(4,7,14,0.35)" }}>
                  <span style={{ fontSize: 180, fontWeight: 900, lineHeight: 1, color: slate.speak ? "#3BF5A0" : NEON.yellow, textShadow: "0 8px 40px rgba(0,0,0,0.7)" }}>{slate.speak ? "SPEAK" : slate.count}</span>
                </div>
              )}
              {profileOpen && deck && (() => {
                const pf = deck.profile ?? {};
                const setPf = (patch: Partial<NonNullable<DeckDef["profile"]>>) => setDecks((prev) => updateDeck(prev, deck.id, { profile: { ...pf, ...patch } }));
                const noteCount = questions.filter((qn) => !!(rf.getNode(qn.id)?.data as unknown as CeqCard | undefined)?.noteOnly).length;
                const SEL = "w-full rounded bg-black/40 px-1 py-0.5 text-[10px]";
                const LBL = "pt-1.5 text-[8px] font-bold uppercase tracking-wide";
                return (
                  <div className="absolute inset-0 z-[73] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.6)" }} onClick={() => setProfileOpen(false)}>
                    <div className="mt-10 flex max-h-[82vh] w-[400px] max-w-[94vw] flex-col overflow-y-auto rounded-xl p-3 shadow-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: NEON.cyan }}>⚙ Production profile</span>
                        <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={() => setProfileOpen(false)}><X className="h-3 w-3" /></button>
                      </div>
                      <span className="truncate text-[9.5px]" style={{ color: NEON.muted }}>{deck.name}</span>
                      <div className={LBL} style={{ color: NEON.muted }}>Production style</div>
                      <select className={SEL} style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} value={pf.style ?? "runs"} onChange={(e) => setPf({ style: e.target.value as NonNullable<typeof pf.style> })}>
                        <option value="runs">runs (default) — spans filmed in one take</option>
                        <option value="dissect-heavy">dissect-heavy — most CEQs clip-sequenced</option>
                        <option value="mixed">mixed</option>
                      </select>
                      <div className={LBL} style={{ color: NEON.muted }}>Clip mapping</div>
                      <select className={SEL} style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} value={pf.clipMapping ?? "take-per-run"} onChange={(e) => setPf({ clipMapping: e.target.value as NonNullable<typeof pf.clipMapping> })}>
                        <option value="take-per-run">1 take per run</option>
                        <option value="clips-per-ceq">many clips per CEQ</option>
                      </select>
                      <div className={LBL} style={{ color: NEON.muted }}>Note-frame budget <span className="normal-case" style={{ color: noteCount > (pf.noteBudget ?? Infinity) ? "#FFD23F" : NEON.muted }}>— {noteCount} in this set{pf.noteBudget != null ? ` / ${pf.noteBudget} budget` : ""}</span></div>
                      <input type="number" min={0} className={SEL} style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} value={pf.noteBudget ?? ""} placeholder="no budget (soft cap when set)" onChange={(e) => setPf({ noteBudget: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} />
                      <div className={LBL} style={{ color: NEON.muted }}>Default callout style</div>
                      <div className="flex items-center gap-1">
                        <select className={SEL} style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} value={pf.calloutKind ?? ""} onChange={(e) => setPf({ calloutKind: (e.target.value || undefined) as NonNullable<typeof pf.calloutKind> })}>
                          <option value="">plain (no banner)</option>
                          {(["cheat-code", "memorize-this", "deeper-idea", "recap", "distractor"] as const).map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                        <button className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black" style={{ color: pf.boltOnBrand ? "#0B1322" : NEON.muted, background: pf.boltOnBrand ? NEON.yellow : "transparent", border: `1px solid ${pf.boltOnBrand ? NEON.yellow : NEON.borderSoft}` }} onClick={() => setPf({ boltOnBrand: !pf.boltOnBrand })} title="Is the boiling bolt on-brand for this set's callouts?">⚡ bolt</button>
                      </div>
                      <div className={LBL} style={{ color: NEON.muted }}>Formula — the creative intent (shown atop the strip)</div>
                      <BufferedTextarea className="min-h-[54px] w-full rounded bg-black/30 px-1.5 py-1 text-[10px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} value={pf.formula ?? ""} onCommit={(v: string) => setPf({ formula: v || undefined })} placeholder="e.g. fast + ruthless: no notes, boss on Q7, dissect the two hard ones" />
                      <div className="mt-2 border-t pt-2" style={{ borderColor: NEON.borderSoft }}>
                        <div className="text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Templates (profile + layout + world · copy-on-write)</div>
                        <div className="mt-1 flex items-center gap-1">
                          <button className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setTplList(saveTemplate(templateFromDeck(deck.name, deck)))} title="Save THIS set's profile + layout + world as a named template (name = the set's name)">Save as template</button>
                          <select className="min-w-0 flex-1 rounded bg-black/40 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} defaultValue="" onChange={(e) => { const t = tplList.find((x) => x.name === e.target.value); if (t) { setDecks((prev) => updateDeck(prev, deck.id, applyTemplate(t))); setNote(`Applied template "${t.name}" (copy — nothing links back).`); } e.currentTarget.value = ""; }} title="Apply a saved template to THIS set — copy-on-write, nothing links back">
                            <option value="" disabled>apply template…</option>
                            {tplList.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                          </select>
                        </div>
                        <div className="pt-1 text-[8px]" style={{ color: NEON.muted }}>Templates live on this machine (localStorage) — v1, single-author by design.</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {dissectQ && (() => {
                const dd = rf.getNode(dissectQ)?.data as unknown as CeqCard | undefined;
                const dz = dd?.dissect ?? { on: false, moments: [] };
                const clips = cardClips(dd);
                const patchDz = (next: NonNullable<CeqCard["dissect"]>) => patchQ(dissectQ, { dissect: next });
                const mv = (i: number, dir: -1 | 1) => { const ms = [...dz.moments]; const j = i + dir; if (j < 0 || j >= ms.length) return; [ms[i], ms[j]] = [ms[j], ms[i]]; patchDz({ ...dz, moments: ms }); };
                return (
                  <div className="absolute inset-0 z-[73] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.6)" }} onClick={() => setDissectQ(null)}>
                    <div className="mt-10 flex max-h-[80vh] w-[480px] max-w-[94vw] flex-col overflow-hidden rounded-xl shadow-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
                        <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: "#B79CFF" }}>🔬 Dissect</span>
                        <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: NEON.muted }}>{(dd?.shorthand || dd?.prompt || "").slice(0, 48)}</span>
                        <button className="rounded px-2 py-0.5 text-[9px] font-black uppercase" style={{ color: dz.on ? "#0B1322" : NEON.muted, background: dz.on ? "#B79CFF" : "transparent", border: `1px solid ${dz.on ? "#B79CFF" : NEON.borderSoft}` }} onClick={() => patchDz({ ...dz, on: !dz.on })} title="ON: this CEQ films as a clip SEQUENCE (run-letter check exempt; every moment must be filmed or waived). OFF: normal run coverage — clips preserved.">{dz.on ? "ON" : "OFF"}</button>
                        <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={() => setDissectQ(null)}><X className="h-3 w-3" /></button>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto p-2">
                        {dz.moments.length === 0 && <div className="px-1 py-2 text-[10px] italic" style={{ color: NEON.muted }}>No planned moments yet — this list is the shot list on film day. Typical: setup · the trap · resolution · takeaway.</div>}
                        {dz.moments.map((m, i) => (
                          <div key={m.id} className="mb-1 flex items-center gap-1 rounded px-1 py-0.5" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}`, opacity: m.waived ? 0.55 : 1 }}>
                            <span className="w-4 shrink-0 text-center text-[9px] font-black tabular-nums" style={{ color: "#B79CFF" }}>{i + 1}</span>
                            <BufferedInput className="min-w-0 flex-1 rounded bg-black/30 px-1 py-0.5 text-[10.5px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}`, textDecoration: m.waived ? "line-through" : undefined }} value={m.label} onCommit={(v: string) => patchDz({ ...dz, moments: dz.moments.map((x) => (x.id === m.id ? { ...x, label: v } : x)) })} placeholder="moment label (free text)" />
                            <select className="w-[104px] shrink-0 rounded bg-black/40 text-[8.5px]" style={{ color: clips.some((c) => c.momentId === m.id) ? "#3BF5A0" : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} value={String(clips.findIndex((c) => c.momentId === m.id))} onChange={(e) => { const ci = Number(e.target.value); const takes = clips.map((c, k) => ({ ...c, momentId: k === ci ? m.id : c.momentId === m.id ? undefined : c.momentId })); patchQ(dissectQ, { takes }); }} title="Tag one of this CEQ's takes to this moment (readiness counts it covered)">
                              <option value="-1">no take</option>
                              {clips.map((c, k) => <option key={k} value={String(k)}>{(c.name || `clip ${k + 1}`).slice(0, 16)}</option>)}
                            </select>
                            <button className="shrink-0 rounded px-1 text-[8px] font-bold uppercase" style={{ color: m.waived ? "#FFD23F" : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => patchDz({ ...dz, moments: dz.moments.map((x) => (x.id === m.id ? { ...x, waived: !x.waived } : x)) })} title="Waive — deliberately not filming this moment (readiness treats it as covered)">waive</button>
                            <button className="shrink-0" style={{ color: NEON.muted }} onClick={() => mv(i, -1)} title="Move up"><ArrowUp className="h-3 w-3" /></button>
                            <button className="shrink-0" style={{ color: NEON.muted }} onClick={() => mv(i, 1)} title="Move down"><ArrowDown className="h-3 w-3" /></button>
                            <button className="shrink-0" style={{ color: NEON.red }} onClick={() => patchDz({ ...dz, moments: dz.moments.filter((x) => x.id !== m.id) })} title="Remove this moment (takes keep their files)"><X className="h-3 w-3" /></button>
                          </div>
                        ))}
                        <button className="mt-1 flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold" style={{ color: "#B79CFF", border: `1px dashed ${NEON.borderSoft}` }} onClick={() => patchDz({ ...dz, on: true, moments: [...dz.moments, { id: cardId("dm"), label: "" }] })}><Plus className="h-3 w-3" /> Add a moment</button>
                      </div>
                      {/* SMART STITCH — trim/breathe/level the moment clips into ONE asset. */}
                      <div className="border-t px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
                        <div className="flex items-center gap-2">
                          <button className="rounded px-2 py-1 text-[10px] font-black uppercase disabled:opacity-40" style={{ color: "#0B1322", background: "#B79CFF" }} disabled={!!stitchJob?.running} onClick={() => runStitch(dissectQ!)} title="Auto-trim head/tail silence, insert breathing gaps (room tone), loudness-match, micro-fade the joints — one seamless asset. Sources are never touched; re-stitch anytime.">⚙ Stitch clips</button>
                          <span className="text-[8.5px] font-bold uppercase" style={{ color: todaysRoomTone() ? "#3BF5A0" : NEON.muted }}>{todaysRoomTone() ? "room tone: today's ✓" : "room tone: none (using fallback)"}</span>
                          {(dd as CeqCard | undefined)?.stitched && <span className="ml-auto text-[8.5px] font-bold uppercase" style={{ color: "#3BF5A0" }}>stitched ✓ {fmtDur((dd as CeqCard).stitched!.duration)}</span>}
                        </div>
                        {stitchJob && (
                          <div className="mt-1.5 text-[9px]" style={{ color: stitchJob.phase.startsWith("FAILED") ? "#FF8B9E" : NEON.muted }}>{stitchJob.phase}</div>
                        )}
                        {stitchJob?.fileUrl && stitchJob.result && (
                          <div className="mt-1.5 rounded p-1.5" style={{ border: `1px solid ${NEON.borderSoft}` }}>
                            <video src={stitchJob.fileUrl} controls className="max-h-[180px] w-full rounded" />
                            <div className="mt-1 text-[8.5px]" style={{ color: NEON.muted }}>
                              total {stitchJob.result.totalS.toFixed(1)}s · {stitchJob.result.clips.map((c, k) => "clip " + (k + 1) + " " + c.durS.toFixed(1) + "s").join(" · ")}
                            </div>
                            {/* per-clip re-trim: seconds into the SOURCE; blank = keep detection */}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {stitchJob.result.trims.map((t, k) => (
                                <span key={k} className="inline-flex items-center gap-0.5 text-[8.5px]" style={{ color: NEON.muted }}>
                                  {k + 1}:
                                  <input defaultValue={t.start} className="w-11 rounded bg-black/30 px-1 text-[9px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} data-trim-start={k} title={"clip " + (k + 1) + " IN point (seconds into the source)"} />
                                  <input defaultValue={t.end} className="w-11 rounded bg-black/30 px-1 text-[9px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} data-trim-end={k} title={"clip " + (k + 1) + " OUT point (seconds into the source)"} />
                                </span>
                              ))}
                              <button className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: "#B79CFF", border: `1px solid ${NEON.borderSoft}` }} onClick={(e) => {
                                const root = (e.currentTarget as HTMLElement).parentElement!;
                                const trims = stitchJob.result!.trims.map((t, k) => {
                                  const sEl = root.querySelector('[data-trim-start="' + k + '"]') as HTMLInputElement | null;
                                  const eEl = root.querySelector('[data-trim-end="' + k + '"]') as HTMLInputElement | null;
                                  const sv = parseFloat(sEl?.value ?? ""); const ev = parseFloat(eEl?.value ?? "");
                                  return Number.isFinite(sv) && Number.isFinite(ev) && ev > sv ? { start: sv, end: ev } : { start: t.start, end: t.end };
                                });
                                runStitch(dissectQ!, trims);
                              }} title="Re-run the stitch with these manual in/out points (they win over detection)">↻ Re-stitch</button>
                              <button className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase" style={{ color: "#0B1322", background: "#3BF5A0" }} onClick={() => {
                                const res = stitchJob.result!;
                                const ms = dz.moments.map((m, k) => ({ ...m, startMs: Math.round((res.clips[k]?.startS ?? 0) * 1000) }));
                                patchQ(dissectQ!, { stitched: { url: stitchJob.fileUrl!, path: stitchJob.path ?? "", name: "dissect-stitch.mp4", duration: res.totalS }, dissect: { ...dz, moments: ms } });
                                setStitchJob(null);
                                setNote("Stitched asset finalized (" + res.totalS.toFixed(1) + "s) — publish plays it as ONE seamless clip; moment chapters written" + (dz.moments.length !== res.clips.length ? " (note: " + dz.moments.length + " moments vs " + res.clips.length + " clips — order-matched)" : "") + ". Sources stay archived in the clip stack.");
                              }} title="Attach the stitched asset as THIS CEQ's playback file (publish prefers it) and write each moment's chapter offset. Sources stay in the clip stack untouched.">✓ Finalize</button>
                            </div>
                          </div>
                        )}
                        <div className="mt-1.5 text-[8.5px]" style={{ color: NEON.muted }}>Clips play in take order; chapters come from the stitch manifest. Sources are never modified — re-stitch anytime.</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {readiness && deck && (
                <div className="absolute inset-0 z-[73] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.6)" }} onClick={() => setReadiness(null)}>
                  <div className="mt-8 flex max-h-[85vh] w-[460px] max-w-[94vw] flex-col overflow-hidden rounded-xl shadow-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
                      <ListChecks className="h-4 w-4" style={{ color: readiness.ready ? "#3BF5A0" : NEON.yellow }} />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Ready to film? — {setDisplayName(deck.name)}</span>
                      <span className="text-[11px] font-black" style={{ color: readiness.ready ? "#3BF5A0" : NEON.yellow }}>{readiness.ready ? "READY ✓" : "NOT YET"}</span>
                      <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setReadiness(null)} title="Close"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                      <div className="mb-2 px-1 text-[10.5px] font-bold" style={{ color: NEON.muted }}>
                        {readiness.counts.ceq} CEQ frame{readiness.counts.ceq === 1 ? "" : "s"} · {readiness.counts.notes} note frame{readiness.counts.notes === 1 ? "" : "s"} · {readiness.counts.runs} run{readiness.counts.runs === 1 ? "" : "s"}
                      </div>
                      {readiness.checks.map((c) => (
                        <div key={c.key} className="mb-1.5 rounded px-1.5 py-1" style={{ border: `1px solid ${c.ok ? "rgba(59,245,160,0.25)" : "rgba(255,92,108,0.35)"}` }}>
                          <div className="flex items-start gap-1.5 text-[10.5px]">
                            <span className="shrink-0 font-black" style={{ color: c.ok ? "#3BF5A0" : NEON.red }}>{c.ok ? "✓" : "✗"}</span>
                            <span className="min-w-0 flex-1 font-semibold" style={{ color: c.ok ? NEON.text : NEON.red }}>{c.label}{!c.ok && <span style={{ color: NEON.muted }}> — {c.fails.length}</span>}</span>
                          </div>
                          {!c.ok && (
                            <div className="mt-0.5 flex flex-col">
                              {c.fails.map((f) => (
                                <button key={`${c.key}-${f.id}`} className="rounded px-1.5 py-0.5 text-left text-[10px] hover:bg-white/5" style={{ color: NEON.cyan }} title="Open this frame in the editor" onClick={() => { setQId(f.id); setExpandedQ((s) => new Set(s).add(f.id)); setReadiness(null); }}>
                                  → {f.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {publishOpen && deck && (
                <div className="absolute inset-0 z-[72] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.6)" }} onClick={() => setPublishOpen(false)}>
                  <div className="mt-8 flex max-h-[85vh] w-[440px] max-w-[94vw] flex-col overflow-hidden rounded-xl shadow-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
                      <Film className="h-4 w-4" style={{ color: "#3BF5A0" }} />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Publish — {setDisplayName(deck.name)}</span>
                      <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setPublishOpen(false)} title="Close"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {!deck.topicId ? (
                      <div className="px-1 py-4 text-center text-[11px] italic" style={{ color: NEON.muted }}>Library set — assign it to a Course → Topic (drag it in the Sets outline, or 📁 on its row) to unlock publishing.</div>
                    ) : (<>
                      {/* WARP INTRO (opt-in) — runs the intro clip through the reversed-tail +
                          white-flash + music-bed warp before the concat. Needs the render worker. */}
                      <label className="mb-2 flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[10px]" style={{ color: NEON.text, border: `1px solid ${prefs.warpIntro ? "rgba(252,163,17,0.5)" : NEON.borderSoft}`, background: prefs.warpIntro ? "rgba(252,163,17,0.08)" : "transparent" }} title="Warp intro: reversed intro tail → white-flash snap at the beat → forward intro, with a reversed→forward music bed (public/audio/intro-music.mp3) fading into Q1. Needs the render worker; applies to the intro take slot only.">
                        <input type="checkbox" className="nodrag" checked={!!prefs.warpIntro} onChange={(e) => setPrefs({ warpIntro: e.target.checked })} />
                        <span className="font-bold uppercase tracking-wide" style={{ color: prefs.warpIntro ? NEON.yellow : NEON.muted }}>⚡ Warp intro</span>
                        <span className="min-w-0 flex-1 truncate" style={{ color: NEON.muted }}>reversed tail + flash + music bed on the intro</span>
                      </label>
                      <div className="mb-2 flex items-center gap-2">
                        <button className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-[10px] font-bold uppercase disabled:opacity-50" style={{ color: "#3BF5A0", border: "1px solid rgba(59,245,160,0.5)" }} disabled={!!publishBusy} onClick={() => publishStitch("free")} title="Concat the FREE stitch → Auphonic → Mux → attach to the FREE CEQ lesson">{publishBusy === "free" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />} Publish Free</button>
                        <button className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-[10px] font-bold uppercase disabled:opacity-50" style={{ color: "#FF8B9E", border: "1px solid rgba(255,92,108,0.5)" }} disabled={!!publishBusy} onClick={() => publishStitch("full")} title="Concat the FULL stitch → Auphonic → Mux → attach to the PAID CEQ lesson">{publishBusy === "full" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />} Publish Full</button>
                      </div>
                      {/* FREE+FULL COMBO — preflight checklist gates the confirm; on
                          confirm publishes Free then Full sequentially, statuses live. */}
                      {combo === null ? (
                        <button className="mb-2 flex w-full items-center justify-center gap-1 rounded px-2 py-1.5 text-[10px] font-bold uppercase disabled:opacity-50" style={{ color: "#0B0F1E", background: NEON.yellow, border: `1px solid ${NEON.yellow}` }} disabled={!!publishBusy} onClick={() => setCombo({ free: "pending", full: "pending", running: false })} title="Preflight both cuts, then publish Free and Full back-to-back">⚡ Publish Free + Full</button>
                      ) : (
                        <div className="mb-2 flex flex-col gap-1 rounded p-1.5" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}` }}>
                          {(combo.free === "pending" && combo.full === "pending" && !combo.running) ? (<>
                            <div className="text-[8.5px] font-bold uppercase tracking-wide" style={{ color: NEON.cyan }}>Preflight</div>
                            {comboChecks().map((c) => (
                              <div key={c.label} className="flex items-start gap-1.5 text-[9.5px]">
                                <span className="shrink-0 font-black" style={{ color: c.ok ? "#3BF5A0" : NEON.red }}>{c.ok ? "✓" : "✗"}</span>
                                <span className="min-w-0 flex-1" style={{ color: c.ok ? NEON.text : NEON.red }}>{c.label}{!c.ok && c.detail ? <span className="opacity-80"> — {c.detail}</span> : null}</span>
                              </div>
                            ))}
                            <div className="mt-1 flex items-center gap-1.5">
                              <button className="flex-1 rounded px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-40" style={{ color: "#0B0F1E", background: "#3BF5A0", border: "1px solid #3BF5A0" }} disabled={!comboChecks().every((c) => c.ok) || !!publishBusy} onClick={() => void runCombo()} title={comboChecks().every((c) => c.ok) ? "Publish Free, then Full" : "Fix the ✗ items first — the run is blocked"}>confirm — publish both</button>
                              <button className="rounded px-2 py-1 text-[10px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setCombo(null)}>cancel</button>
                            </div>
                          </>) : (<>
                            <div className="text-[8.5px] font-bold uppercase tracking-wide" style={{ color: NEON.cyan }}>Publishing Free + Full</div>
                            {(["free", "full"] as const).map((m) => { const st = combo[m]; return (
                              <div key={m} className="flex items-center gap-1.5 text-[10px]">
                                <span className="grid h-4 w-4 shrink-0 place-items-center">{st === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: NEON.cyan }} /> : st === "done" ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#3BF5A0" }} /> : st === "error" ? <span style={{ color: NEON.red, fontWeight: 900 }}>✗</span> : <Circle className="h-3.5 w-3.5" style={{ color: NEON.muted }} />}</span>
                                <span style={{ color: st === "error" ? NEON.red : NEON.text }}>{m === "free" ? "Free" : "Full"} {st === "running" ? "— publishing… (see the status note)" : st === "done" ? "— published ✓" : st === "error" ? "— FAILED (details in the header note)" : combo.free === "error" ? "— not started (free failed)" : "— queued"}</span>
                              </div>
                            ); })}
                            {!combo.running && <button className="mt-1 rounded px-2 py-1 text-[10px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setCombo(null)}>close</button>}
                          </>)}
                        </div>
                      )}
                      {/* LOOKBACK — ONE vertical social file, staged + re-downloadable. NO
                          pipeline: Lee posts socials manually. */}
                      <div className="mb-2 flex flex-col gap-1 rounded p-1" style={{ background: dragKey === `lookback:${setId}` ? "rgba(252,163,17,0.14)" : "rgba(0,0,0,0.15)", outline: dragKey === `lookback:${setId}` ? `1px dashed ${NEON.yellow}` : `1px solid ${NEON.borderSoft}` }} {...dragProps(`lookback:${setId}`, (f) => dropSlot("lookback", f))}>
                        <div className="flex items-center gap-1 text-[8px] font-bold uppercase" style={{ color: NEON.muted }}><span className="w-14 shrink-0">Lookback</span><span className="min-w-0 flex-1 truncate">vertical for socials — drop to stage (no pipeline)</span>{takeBusy === `lookback:${setId}` && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: NEON.cyan }} />}</div>
                        {deck.lookback && (
                          <div className="flex items-center gap-1 text-[8.5px]" style={{ color: NEON.muted }}>
                            <span className="min-w-0 flex-1 truncate" title={deck.lookback.name}>{deck.lookback.name || "vertical"} · {fmtDur(deck.lookback.duration)}</span>
                            <a className="rounded px-1 text-[8px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} href={deck.lookback.url} download target="_blank" rel="noreferrer" title="Re-download the staged file">download</a>
                            <button className="grid h-4 w-4 place-items-center" style={{ color: NEON.red }} onClick={() => setDecks((prev) => updateDeck(prev, deck.id, { lookback: undefined }))} title="Remove (file stays in staging)"><X className="h-3 w-3" /></button>
                          </div>
                        )}
                      </div>
                <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: NEON.borderSoft }}>
                  <div className="px-0.5 text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Set clips — drop a video</div>
                  {([
                    { label: "Intro", kind: "intro", key: `intro:${setId}`, local: deck.intro, global: gc.intro, onFile: (f: File) => dropSlot("intro", f) },
                    { label: "Outro", kind: "outro", key: `outro:${setId}`, local: deck.outro, global: gc.outro, onFile: (f: File) => dropSlot("outro", f) },
                  ] as const).map((s) => {
                    // RESOLVED = the set's own clip, else the shared global fallback. The
                    // globe/CLEAR + GLOBAL/CUSTOM badge only apply to intro/outro (gkind);
                    // the transition is inherently shared (SHARED badge, drop-to-replace).
                    const gkind: "intro" | "outro" | null = s.kind === "intro" || s.kind === "outro" ? s.kind : null;
                    const resolved = s.local ?? s.global;
                    const inheriting = !!gkind && !s.local && !!s.global; // showing the shared global
                    const badge = !gkind ? "SHARED" : s.local ? "CUSTOM" : s.global ? "GLOBAL" : null;
                    return (
                    <div key={s.key}>
                      <div className="flex items-center gap-1 rounded px-1 py-0.5" style={{ background: dragKey === s.key ? "rgba(252,163,17,0.14)" : "rgba(0,0,0,0.2)", outline: dragKey === s.key ? `1px dashed ${NEON.yellow}` : `1px solid ${NEON.borderSoft}` }} {...dragProps(s.key, s.onFile)}>
                        <span className="w-14 shrink-0 text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>{s.label}</span>
                        <span className="min-w-0 flex-1 truncate text-[9px]" style={{ color: resolved ? NEON.text : NEON.muted }} title={resolved?.name}>{resolved ? `${resolved.name} · ${fmtDur(resolved.duration)}` : "drop a clip"}</span>
                        {badge && <span className="shrink-0 rounded px-1 text-[7px] font-bold uppercase tracking-wide" style={badge === "GLOBAL" ? { color: "#7CC4FF", border: "1px solid rgba(124,196,255,0.5)" } : badge === "CUSTOM" ? { color: NEON.yellow, border: `1px solid ${NEON.border}` } : { color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} title={badge === "GLOBAL" ? "Inheriting the shared global clip" : badge === "CUSTOM" ? "This set's own clip — overrides the global" : "Shared across every set"}>{badge}</span>}
                        {gkind && (
                          <button className="grid h-4 w-4 shrink-0 place-items-center disabled:opacity-30" style={{ color: inheriting ? "#7CC4FF" : NEON.muted }} disabled={!resolved} onClick={() => toggleGlobal(gkind)} title={inheriting ? `Inheriting the global ${gkind} — click to turn the global OFF for every set` : `Make this the GLOBAL ${gkind} — every set without its own inherits it`}><Globe className="h-3 w-3" /></button>
                        )}
                        {gkind && s.local && (
                          <button className="grid h-4 w-4 shrink-0 place-items-center" style={{ color: NEON.red }} onClick={() => { clearSlotLocal(gkind); if (takePreview === s.key) setTakePreview(null); }} title="Clear this set's clip — fall back to the global"><X className="h-3 w-3" /></button>
                        )}
                        <button className="grid h-4 w-4 shrink-0 place-items-center" onClick={() => setTakePreview((k) => (k === s.key ? null : s.key))} title={resolved ? "Preview" : "Drop a clip to attach"}>{takeBusy === s.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: NEON.cyan }} /> : resolved ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#3BF5A0" }} /> : <Circle className="h-3.5 w-3.5" style={{ color: NEON.muted }} />}</button>
                      </div>
                      {takePreview === s.key && resolved && (
                        <div className="my-1 ml-1"><video src={resolved.url} controls playsInline className="w-full rounded" style={{ background: "#000", aspectRatio: "16 / 9" }} /></div>
                      )}
                    </div>
                    );
                  })}
                  {/* WRAP — 0..n end-of-video lookback/summary clips (played AFTER the last
                      question clip, BEFORE the outro). Its own stack, drop to append. */}
                  <div className="mt-1 flex flex-col gap-1 rounded p-1" style={{ background: dragKey === `wrap:${setId}` ? "rgba(252,163,17,0.14)" : "rgba(0,0,0,0.15)", outline: dragKey === `wrap:${setId}` ? `1px dashed ${NEON.yellow}` : `1px solid ${NEON.borderSoft}` }} {...dragProps(`wrap:${setId}`, (f) => dropSlot("wrap", f))}>
                    <div className="flex items-center gap-1 text-[8px] font-bold uppercase" style={{ color: NEON.muted }}><span className="w-14 shrink-0">Wrap</span><span className="min-w-0 flex-1 truncate">end-of-video lookbacks — drop to add{(deck.wrap?.length ?? 0) > 0 ? ` · ${deck.wrap!.length}` : ""}</span>{takeBusy === `wrap:${setId}` && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: NEON.cyan }} />}</div>
                    {(deck.wrap ?? []).map((t, wi) => (
                      <div key={t.path} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1 text-[8.5px]" style={{ color: NEON.muted }}>
                          <span className="shrink-0 rounded px-1 font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }}>W{wi + 1}</span>
                          <span className="min-w-0 flex-1 truncate" title={t.name}>{t.name || "clip"} · {fmtDur(t.duration)}</span>
                          <button className="grid h-4 w-4 place-items-center" onClick={() => setTakePreview((k) => (k === `wrap:${setId}:${wi}` ? null : `wrap:${setId}:${wi}`))} title="Preview"><CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#3BF5A0" }} /></button>
                          <button className="grid h-4 w-4 place-items-center disabled:opacity-25" style={{ color: "#FFD23F" }} disabled={starCount === 0} onClick={() => stampStarredOnWrap(wi)} title={starCount ? `Covers starred — stamp the ${starCount} ★ question(s) onto this wrap clip’s references` : "Star questions first, then stamp them here"}>★</button>
                          <button className="grid h-4 w-4 place-items-center" style={{ color: NEON.red }} onClick={() => removeWrapClip(wi)} title="Remove wrap clip"><X className="h-3 w-3" /></button>
                        </div>
                        {takePreview === `wrap:${setId}:${wi}` && <video src={t.url} controls playsInline preload="none" className="w-full rounded" style={{ background: "#000", aspectRatio: "16 / 9" }} />}
                      </div>
                    ))}
                  </div>
                </div>
                    </>)}
                    </div>
                  </div>
                </div>
              )}
              {/* WYSIWYG previewer (top) + collapsible stem/choices editor (bottom) */}
              <div className="flex min-h-0 flex-1 flex-col">
                {/* CLIP STACK for the OPEN question — the list column's per-row stack, re-hosted in
                    the editor (Studio Consolidation D). Toggled by the strip's Clips chip; the whole
                    panel is the video drop target (base take first, then lookbacks). */}
                {takePreview && takePreview === qId && qId !== LAYOUT_Q0 && (() => {
                  const clips = cardClips(rf.getNode(qId)?.data as unknown as CeqCard | undefined);
                  const dp = dragProps(qId, (f) => dropTake(qId, f));
                  return (
                    <div className="max-h-[45%] shrink-0 overflow-y-auto border-b p-2" style={{ borderColor: dragKey === qId ? NEON.yellow : NEON.borderSoft, background: dragKey === qId ? "rgba(252,163,17,0.08)" : "rgba(0,0,0,0.15)" }} {...dp}>
                      <div className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.cyan }}>
                        Clips — drop a video here to {clips.length ? "append a lookback" : "add the base take"}
                        <button className="ml-auto grid h-4 w-4 place-items-center" style={{ color: NEON.muted }} onClick={() => setTakePreview(null)} title="Close"><X className="h-3 w-3" /></button>
                      </div>
                      {clips.length === 0 && <div className="text-[9px] italic" style={{ color: NEON.muted }}>No clips yet — drop a video anywhere in this panel.</div>}
                      {clips.map((t, ci) => { const rk = `${qId}:${ci}`; const refsOpen = clipRefsOpen === rk; return (
                        <div key={t.path} className="mb-1 flex flex-col gap-0.5 rounded p-1" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}` }}>
                          <div className="flex items-center gap-1 text-[8.5px]" style={{ color: NEON.muted }}>
                            <span className="shrink-0 rounded px-1 font-bold uppercase" style={{ color: ci === 0 ? "#3BF5A0" : NEON.cyan, border: `1px solid ${NEON.borderSoft}` }}>{ci === 0 ? "base" : `L${ci}`}</span>
                            <span className="min-w-0 flex-1 truncate" title={t.name}>{t.name || "clip"} · {fmtDur(t.duration)}</span>
                            <button disabled={ci === 0} className="grid h-4 w-4 place-items-center disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => reorderClip(qId, ci, -1)} title="Move earlier"><ArrowUp className="h-3 w-3" /></button>
                            <button disabled={ci === clips.length - 1} className="grid h-4 w-4 place-items-center disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => reorderClip(qId, ci, 1)} title="Move later"><ArrowDown className="h-3 w-3" /></button>
                            <button className="grid h-4 place-items-center rounded px-0.5 text-[8px] font-bold" style={{ color: (t.refs?.length || refsOpen) ? NEON.yellow : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setClipRefsOpen((k) => (k === rk ? null : rk))} title="References earlier questions (lookback)">↩{t.refs?.length ? t.refs.length : ""}</button>
                            <button className="grid h-4 w-4 place-items-center disabled:opacity-25" style={{ color: "#FFD23F" }} disabled={starCount === 0} onClick={() => stampStarredOnClip(qId, ci)} title={starCount ? `Covers starred — stamp the ${starCount} ★ question(s) onto this clip's references` : "Star questions first, then stamp them as this clip's references"}>★</button>
                            <button className="grid h-4 w-4 place-items-center" style={{ color: NEON.red }} onClick={() => removeClip(qId, ci)} title="Remove this clip"><X className="h-3 w-3" /></button>
                          </div>
                          <video src={t.url} controls playsInline preload="none" className="w-full rounded" style={{ background: "#000", aspectRatio: "16 / 9", maxHeight: 160 }} />
                          {refsOpen && (
                            <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded p-1" style={{ background: "rgba(0,0,0,0.3)" }}>
                              <div className="text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>References — earlier questions this clip reviews</div>
                              {questions.filter((qq) => qq.id !== qId).map((qq) => { const on = (t.refs ?? []).includes(qq.id); const qp = (rf.getNode(qq.id)?.data as unknown as CeqCard | undefined)?.prompt || "Question"; return (
                                <button key={qq.id} className="flex items-center gap-1 truncate text-left text-[9px]" style={{ color: on ? NEON.yellow : NEON.text }} onClick={() => setClipRefs(qId, ci, on ? (t.refs ?? []).filter((x) => x !== qq.id) : [...(t.refs ?? []), qq.id])}>{on ? "☑" : "☐"} {clip(qp, 44)}</button>
                              ); })}
                            </div>
                          )}
                        </div>
                      ); })}
                      {clips.length > 0 && <button className="text-[8px] italic" style={{ color: NEON.red }} onClick={() => clearTake(qId)} title="Remove all clips">clear all</button>}
                    </div>
                  );
                })()}
                <div className="min-h-0 flex-1">
                  {/* Authoring pane shows the previewer only when NOT recording — Recording
                      Mode renders the SAME previewer in a full-window portal (below). */}
                  {!recording && renderPreviewer(false)}
                </div>
                {qd && !filming && (
                  <div className="shrink-0 border-t" style={{ borderColor: NEON.borderSoft }}>
                    <div className="flex items-center gap-1 px-2 py-1">
                      <button className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }} onClick={() => setEditorOpen((v) => !v)}>{editorOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} edit stem & choices</button>
                      {/* STAR / BOSS / CHA-CHING / SHORT moved to the transport row as icon
                          toggles (film-run fixes §2.6) — this row is now just the collapse
                          toggle and CHAINS & TEMPLATES. The Short ANGLE field stays below,
                          since it only appears once the flag is on. */}
                      <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setChainFor(qId)} title="Per-choice chains + save/load template (same model as the card popover)"><Link2 className="h-3 w-3" /> chains & templates</button>
                    </div>
                    {qd.short && (
                      <div className="flex items-center gap-1.5 px-2 pb-1">
                        <span className="shrink-0 text-[8px] font-bold uppercase" style={{ color: "#FF8B9E" }}>Short angle</span>
                        <BufferedInput className="nodrag min-w-0 flex-1 rounded bg-black/30 px-1.5 py-0.5 text-[10px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} value={qd.shortNote ?? ""} onCommit={(v) => patchQ(qId!, { shortNote: v }, `q:${qId}:shortNote`)} placeholder="one-line angle (e.g. the contra trap)" onKeyDown={(e) => e.stopPropagation()} />
                      </div>
                    )}
                    {editorOpen && (
                      <div className="max-h-[38vh] overflow-y-auto px-2 pb-2">
                        <div className="flex flex-col gap-2">
                          {/* SCRIPT LAYERS — capture only. Revised is what Lee says
                              (seeded from the legacy note); transcript is the future
                              Mux caption target. Export includes whatever is set. */}
                          <details className="rounded border px-1.5 py-1" style={{ borderColor: NEON.borderSoft }}>
                            <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Script{(qd.suggestedScript || qd.revisedScript || qd.transcript || qd.note) ? " ·" : ""}{qd.suggestedScript ? " S" : ""}{(qd.revisedScript ?? qd.note) ? " R" : ""}{qd.transcript ? " T" : ""}</summary>
                            <div className="mt-1 flex flex-col gap-1">
                              <BufferedTextarea rows={2} className="nodrag w-full resize-none rounded px-1.5 py-1 text-[11px] outline-none" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} placeholder="Suggested script…" value={qd.suggestedScript ?? ""} onCommit={(v) => patchQ(qId!, { suggestedScript: v }, `q:${qId}:sug`)} onKeyDown={(e) => e.stopPropagation()} />
                              <BufferedTextarea rows={2} className="nodrag w-full resize-none rounded px-1.5 py-1 text-[11px] outline-none" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} placeholder="Revised script (what you actually say)…" value={qd.revisedScript ?? qd.note ?? ""} onCommit={(v) => patchQ(qId!, { revisedScript: v }, `q:${qId}:rev`)} onKeyDown={(e) => e.stopPropagation()} />
                              <BufferedTextarea rows={2} className="nodrag w-full resize-none rounded px-1.5 py-1 text-[11px] outline-none" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} placeholder="Transcript (Mux import lands here later)…" value={qd.transcript ?? ""} onCommit={(v) => patchQ(qId!, { transcript: v }, `q:${qId}:tr`)} onKeyDown={(e) => e.stopPropagation()} />
                            </div>
                          </details>
                          {/* PAID-DISPLAY BLUR (film-run fixes §4.2) — no longer a permanent button.
                              It surfaces as a mini selection toolbar over the stem the moment you
                              highlight text, and vanishes the moment the selection collapses. Ranges
                              redact ONLY on locked/paid surfaces (server-side); Studio + the free tab
                              always show the full stem. Ranges are character offsets, so re-mark after
                              rewording. onMouseDown is prevented so clicking it can't steal the
                              selection out of the textarea before the handler reads it. */}
                          <div className="relative">
                            <BufferedTextarea rows={2} className="nodrag w-full resize-none rounded px-2 py-1.5 text-[13px] outline-none" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={qd.prompt} onCommit={(v) => patchQ(qId!, { prompt: v }, `q:${qId}:prompt`)} placeholder="The question stem…" onKeyDown={(e) => e.stopPropagation()}
                              onSelect={(e) => { const t = e.target as HTMLTextAreaElement; setStemSel(t.selectionStart !== t.selectionEnd ? { qid: qId!, s: t.selectionStart, e: t.selectionEnd } : null); }} />
                            {stemSel && stemSel.qid === qId && stemSel.s !== stemSel.e && (
                              <button
                                className="absolute -top-2 right-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide shadow-lg"
                                style={{ color: "#0B1322", background: NEON.yellow, border: `1px solid ${NEON.yellow}` }}
                                onMouseDown={(ev) => ev.preventDefault()}
                                onClick={() => { patchQ(qId!, { blurRanges: [...(qd.blurRanges ?? []), { s: stemSel.s, e: stemSel.e }] }, `q:${qId}:blur`); setStemSel(null); }}
                                title="Mark the selected stem text to render blurred (░) on locked/paid display only"
                              >🔒 Blur on locked</button>
                            )}
                          </div>
                          {(qd.blurRanges?.length ?? 0) > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: NEON.muted }} title="How the stem reads on a locked/paid surface (re-mark after rewording the stem)">
                                locked: {redactStem(qd.prompt, qd.blurRanges ?? [])}
                              </span>
                              <button className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => patchQ(qId!, { blurRanges: [] }, `q:${qId}:blur`)} title="Remove all blur marks on this stem">clear</button>
                            </div>
                          )}
                          {/* TEXT DIET (film-run fixes §4.1) — the header used to spell out the whole
                              interaction model. Dropping a memo on a choice and the +💡 chain button
                              both still work; they just don't need captioning any more. */}
                          <div className="text-[9px] tracking-wide" style={{ color: NEON.muted }}>click ○ to mark correct</div>
                          {qd.choices.map((ch, ci) => (
                            <div key={ch.id} className="flex items-center gap-1 rounded px-1 py-0.5" style={{ border: `1px solid ${ch.correct ? "rgba(59,245,160,0.5)" : NEON.borderSoft}` }}
                              onDragOver={(e) => { if (e.dataTransfer.types.includes(MEMO_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                              onDrop={(e) => { const mid = e.dataTransfer.getData(MEMO_DND); if (mid) { e.preventDefault(); attachMemoToChoice(qId!, ch.id, mid); } }}>
                              <button className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] font-black" style={{ color: ch.correct ? "#0B0F1E" : NEON.muted, background: ch.correct ? "#3BF5A0" : "transparent", border: `1px solid ${ch.correct ? "#3BF5A0" : NEON.borderSoft}` }} onClick={() => setCorrect(qId!, ch.id)} title="Mark correct">{LETTER(ci)}</button>
                              <BufferedInput className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" style={{ color: NEON.text }} value={ch.text} onCommit={(v) => patchChoice(qId!, ch.id, { text: v }, `q:${qId}:${ch.id}:text`)} placeholder={`Choice ${LETTER(ci)}`} onKeyDown={(e) => e.stopPropagation()} />
                              {(ch.chain?.length ?? 0) > 0 && <span className="shrink-0 text-[8px] tabular-nums" style={{ color: NEON.cyan }} title="chain items">⛓{ch.chain!.length}</span>}
                              <button className="shrink-0 rounded px-1 text-[9px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setPickModal({ ceqId: qId!, choiceId: ch.id })} title="Add a memo to this choice — search existing (shared) or create new">+💡</button>
                              <button className="shrink-0" style={{ color: NEON.red }} onClick={() => removeChoice(qId!, ch.id)} title="Remove choice"><X className="h-3 w-3" /></button>
                            </div>
                          ))}
                          <button className="flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => addChoice(qId!)}><Plus className="h-3 w-3" /> choice</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          </>)}
        </div>

        {/* PANE 3 — MEMO LIBRARY (collapsible to a thin rail). HIDDEN in Preview: that
            view is Recording mode — a filming cockpit, no memo library. */}
        {/* The collapsed vertical "MEMOS (30)" rail is gone (film-run fixes §6.1) — the
            MEMOS button in the tab row above is the single entry point. Closed = nothing
            here at all, so the editor gets the width back. */}
        {topTab === "preview" || !libOpen || filming ? null : (
        <div className={COL} style={{ maxWidth: 260, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
          <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>Memo library <span style={{ color: NEON.muted }}>({memos.length})</span>
            <button className="ml-auto grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={() => setLibOpen(false)} title="Collapse the memo library"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
          {/* QUICK-ADD (speed pass) — type + Enter creates a memo instantly (category =
              last-used). No modal on this path; +💡 keeps the search-or-create modal. */}
          <div className="flex items-center gap-1 px-1.5 pt-1.5">
            <Plus className="h-3 w-3 shrink-0" style={{ color: "#3BF5A0" }} />
            <input value={qaText} onChange={(e) => setQaText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") quickAddMemo(); else if (e.key === "Escape") setQaText(""); }} placeholder={`quick add… Enter → ${lastMemoCat}`} className="min-w-0 flex-1 rounded bg-black/30 px-1.5 py-0.5 text-[10.5px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} />
          </div>
          <div className="flex items-center gap-1 px-1.5 pt-1.5"><Search className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} /><input ref={memoSearchRef} value={memoQuery} onChange={(e) => setMemoQuery(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setMemoQuery(""); }} placeholder="search… ( / from anywhere · Esc clears)" className="min-w-0 flex-1 bg-transparent text-[10.5px] outline-none" style={{ color: NEON.text }} />
            <button className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setMemoSort((s) => (s === "recent" ? "az" : "recent"))} title="Toggle sort: most recent ↔ A–Z">{memoSort === "recent" ? "recent" : "A–Z"}</button>
            <button className="grid h-5 w-5 shrink-0 place-items-center rounded" style={{ color: wrapMemos ? NEON.yellow : NEON.muted, border: `1px solid ${wrapMemos ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` }} onClick={() => setPrefs({ wrapMemos: !wrapMemos })} title="Wrap memo labels ↔ truncate"><WrapText className="h-3 w-3" /></button>
          </div>
          {/* SCOPE (Lee) — narrow the library to the current question / set, or show all.
              Persists in panel prefs; category chips + search work WITHIN the scope. */}
          <div className="flex items-center gap-1 px-1.5 pt-1.5">
            <span className="text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>Scope</span>
            {([["question", "Question"], ["set", "Set"], ["all", "All"]] as const).map(([k, lbl]) => { const on = memoScope === k; const disabled = (k === "set" && !deck) || (k === "question" && !qId); return (
              <button key={k} disabled={disabled} className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase disabled:opacity-30" style={{ color: on ? "#0B1322" : NEON.muted, background: on ? NEON.cyan : "transparent", border: `1px solid ${on ? NEON.cyan : NEON.borderSoft}` }} onClick={() => setPrefs({ memoScope: k })} title={k === "question" ? "Only memos chained on the selected question" : k === "set" ? "Only memos chained anywhere in this set" : "Every memo in the scene"}>{lbl}</button>
            ); })}
            {effScope !== memoScope && <span className="text-[7.5px] italic" style={{ color: NEON.muted }} title="Nothing selected for the chosen scope — showing the next-broadest">→ {effScope}</span>}
          </div>
          {courses.length > 0 && (
            <div className="flex items-center gap-1 px-1.5 pt-1"><span className="text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>Course</span>
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="min-w-0 flex-1 rounded bg-black/40 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}>
                <option value="all">all courses</option>
                {courses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-1 p-1.5">
            {[...MEMO_KIND_ORDER, NONE].map((c) => { const on = catFilter.has(c); const meta = c === NONE ? null : MEMO_KIND_META[c as PlaybookKind]; return (
              <button key={c} className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: on ? "#0B1322" : NEON.muted, background: on ? NEON.yellow : "transparent", border: `1px solid ${on ? NEON.yellow : NEON.borderSoft}` }} onClick={() => toggleCat(c)} title={meta ? (meta.group === "CALLOUT" ? "Callout kind — renders as a callout card" : "Support kind — chain/reference material") : "No kind assigned (always a valid state)"}>{meta ? meta.glyph + " " + meta.label : "Unfiled"}</button>
            ); })}
          </div>
          <div className="flex items-center justify-between px-1.5 text-[9px]" style={{ color: NEON.muted }}>
            <button className="flex items-center gap-1 rounded px-1 py-0.5 font-bold uppercase" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} onClick={() => setSel((p) => { const n = new Set(p); if (allShownSel) shownMemos.forEach((m) => n.delete(m.id)); else shownMemos.forEach((m) => n.add(m.id)); return n; })} disabled={shownMemos.length === 0}>{allShownSel ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />} {allShownSel ? "none" : "all"}</button>
            <span>{sel.size} selected</span>
          </div>
          {/* RECENT STRIP (speed pass) — the 5 most recently created/edited/chained
              memos, ALWAYS visible regardless of scope/filters; drag-to-chain works. */}
          {recentMemoIds.length > 0 && (
            <div className="shrink-0 border-b px-1 pb-1" style={{ borderColor: NEON.borderSoft }}>
              <div className="px-0.5 pt-1 text-[7.5px] font-bold uppercase tracking-wide" style={{ color: NEON.cyan }}>Recent</div>
              {recentMemoIds.map((id) => { const m = memos.find((x) => x.id === id); if (!m) return null; return (
                <div key={id} draggable className="flex cursor-grab items-center gap-1 rounded px-1 py-0.5" style={{ background: "rgba(79,163,227,0.08)", border: `1px solid ${NEON.borderSoft}` }}
                  onDragStart={(e) => { e.dataTransfer.setData(MEMO_DND, id); e.dataTransfer.effectAllowed = "copy"; }}
                  title="Recent — drag onto a choice to chain it">
                  <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: NEON.text }}>{m.label}</span>
                  <button className="shrink-0 rounded px-1 text-[7px] font-bold uppercase" style={{ color: m.category ? NEON.cyan : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => cycleCategory(m.id, m.category)} title={`Category: ${m.category || "unfiled"} — click to cycle`}>{m.category === "ELEMENT" ? "🧩" : m.category ? m.category.slice(0, 4) : "UNF"}</button>
                </div>
              ); })}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {shownMemos.length === 0 && <div className="px-1 py-2 text-[9.5px] italic" style={{ color: NEON.muted }}>No memos match — or none exist yet.</div>}
            {([...MEMO_KIND_ORDER, null] as (PlaybookKind | null)[]).map((gk) => {
              const items = shownMemos.filter((m) => pkOf(m) === gk);
              if (items.length === 0) return null;
              const gMeta = gk ? MEMO_KIND_META[gk] : null;
              return (
                <div key={gk ?? "__unfiled"}>
                  <div className="flex items-center gap-1 px-0.5 pb-0.5 pt-1.5 text-[7.5px] font-bold uppercase tracking-wide" style={{ color: gMeta?.group === "CALLOUT" ? NEON.yellow : NEON.cyan }}>
                    <span>{gMeta ? gMeta.glyph + " " + gMeta.label : "🗂 Unfiled"}</span>
                    <span className="opacity-60">· {items.length}</span>
                    {gMeta && <span className="ml-auto rounded px-1 opacity-50" style={{ border: `1px solid ${NEON.borderSoft}` }}>{gMeta.group}</span>}
                  </div>
            {items.map((m) => { const on = sel.has(m.id); const uses = usageOf(m.id); const editing = editMemo === m.id; const picked = m.id === previewSelMemo; return (
              <div key={m.id} ref={picked ? selMemoRowRef : undefined} draggable={!editing} className="flex cursor-grab items-center gap-1 rounded px-1 py-0.5" style={{ background: picked ? "rgba(79,163,227,0.22)" : on ? "rgba(252,163,17,0.1)" : "rgba(0,0,0,0.2)", border: `1px solid ${picked ? NEON.cyan : on ? NEON.border : NEON.borderSoft}` }}
                onDragStart={(e) => { e.dataTransfer.setData(MEMO_DND, m.id); e.dataTransfer.effectAllowed = "copy"; }}
                title="Drag onto a choice to attach · ☐ selects · click the label to rename · click the chip to cycle category">
                <button className="shrink-0" style={{ color: on ? NEON.yellow : NEON.muted }} onClick={() => toggleSel(m.id)}>{on ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}</button>
                {editing ? (
                  <input autoFocus className="nodrag min-w-0 flex-1 rounded bg-black/40 px-1 text-[10.5px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.border}` }} value={editMemoVal} onChange={(e) => setEditMemoVal(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitEditMemo(m.id, editMemoVal); else if (e.key === "Escape") { setEditMemo(null); setEditMemoVal(""); } }} onBlur={() => commitEditMemo(m.id, editMemoVal)} />
                ) : (
                  <span className={`min-w-0 flex-1 cursor-text text-[10.5px] ${wrapMemos ? "whitespace-normal break-words" : "truncate"}`} style={{ color: NEON.text }} onClick={() => { setEditMemo(m.id); setEditMemoVal(m.label); }} title="Click to rename">{m.label}{m.subcategory && <span className="ml-1 text-[8px]" style={{ color: NEON.cyan }}>· {m.subcategory}</span>}</span>
                )}
                {/* ×N usage — the "shared, edits ripple" signal; tooltip lists the T.QQ ids. */}
                {uses > 1 && <span className="shrink-0 text-[7.5px] font-bold tabular-nums" style={{ color: "#7CC4FF" }} title={usageTip(m.id)}>×{uses}</span>}
                <button className="shrink-0 rounded px-1 text-[7.5px] font-bold uppercase" style={{ color: pkOf(m) ? NEON.cyan : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => cycleKind(m.id, pkOf(m))} title={"Kind: " + (pkOf(m) ? MEMO_KIND_META[pkOf(m)!].label : "unfiled") + " — click to cycle through the taxonomy (quick-reassign)"}>{pkOf(m) ? MEMO_KIND_META[pkOf(m)!].glyph : "UNF"}</button>
                <button className="shrink-0" style={{ color: NEON.muted }} onClick={() => duplicateMemo(m.id)} title="Duplicate this memo (a linked copy, opens for editing)"><Copy className="h-3 w-3" /></button>
                <button className="shrink-0" style={{ color: NEON.red }} onClick={() => deleteMemos([m.id])} title="Delete this memo from the library (also unchains it)"><X className="h-3 w-3" /></button>
              </div>
            ); })}
                </div>
              );
            })}
          </div>
          {/* bulk triage */}
          <div className="flex flex-col gap-1 border-t p-1.5" style={{ borderColor: NEON.borderSoft }}>
            <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>
              <span>Bulk ({sel.size})</span>
              <div className="flex items-center gap-1">
                <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.red, border: `1px solid ${NEON.borderSoft}` }} onClick={() => deleteMemos([...sel])} disabled={sel.size === 0} title="Delete the selected memos from the library (Delete key)">delete ({sel.size})</button>
                <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.red, border: `1px solid ${NEON.borderSoft}` }} onClick={removeDupes} title="Delete duplicate memos (same title/body/category/subcat); keeps any that are attached to a chain">remove dupes</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {MEMO_CATEGORIES.map((c) => <button key={c} className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => bulkCategory(c)} disabled={sel.size === 0} title="Set the top-level category">{c === "ELEMENT" ? "🧩 ELEMENT" : c}</button>)}
              <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setBulkField({ field: "subcategory", label: "Sub-category" }); setBulkVal(""); }} disabled={sel.size === 0} title="Set a sub-category under the category">set sub…</button>
              <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setBulkField({ field: "label", label: "Title" }); setBulkVal(""); }} disabled={sel.size === 0} title="Set the memo TITLE / display name (not the category)">set title…</button>
              <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setBulkField({ field: "course", label: "Course tag" }); setBulkVal(""); }} disabled={sel.size === 0} title="Tag with a course (for the course filter)">set course…</button>
            </div>
            {/* Inline bulk-field entry (replaces the old window.prompt). Enter applies, Esc cancels. */}
            {bulkField && (
              <div className="flex items-center gap-1">
                <span className="shrink-0 text-[8px] font-bold uppercase" style={{ color: NEON.cyan }}>{bulkField.label}</span>
                <input autoFocus className="nodrag min-w-0 flex-1 rounded bg-black/40 px-1 py-0.5 text-[9.5px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.border}` }} value={bulkVal} onChange={(e) => setBulkVal(e.target.value)} placeholder={`${bulkField.label} for ${sel.size} memo${sel.size === 1 ? "" : "s"}…`} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") applyBulkField(bulkField.field, bulkVal); else if (e.key === "Escape") { setBulkField(null); setBulkVal(""); } }} />
                <button className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={() => applyBulkField(bulkField.field, bulkVal)}>set</button>
                <button className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setBulkField(null); setBulkVal(""); }}>✕</button>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* BATCH INGEST CONFIRM TABLE — file → matched question → duration; per-row
          override + exclude + base/lookback; NOTHING uploads until confirmed. Failures
          retry individually (done rows never re-upload). */}
      {ingest && deck && (
        <div className="absolute inset-0 z-[73] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.6)" }} onClick={() => { if (!ingestBusy) setIngest(null); }}>
          <div className="mt-8 flex max-h-[85vh] w-[600px] max-w-[95vw] flex-col overflow-hidden rounded-xl shadow-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
              <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Batch takes — {setDisplayName(deck.name)}</span>
              <span className="text-[10px] tabular-nums" style={{ color: NEON.muted }}>{ingest.filter((r) => r.include && r.qId).length}/{ingest.length} matched</span>
              <button className="ml-auto grid h-6 w-6 place-items-center rounded disabled:opacity-40" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} disabled={ingestBusy} onClick={() => setIngest(null)} title="Close (nothing already uploaded is undone)"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {ingest.map((r, i) => { const setRow = (patch: Partial<NonNullable<typeof ingest>[number]>) => setIngest((cur) => (cur ? cur.map((x, j) => (j === i ? { ...x, ...patch } : x)) : cur)); return (
                <div key={`${r.name}-${i}`} className="mb-1 flex items-center gap-1.5 rounded px-1.5 py-1" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${r.status === "error" ? "rgba(255,92,108,0.6)" : r.status === "done" ? "rgba(59,245,160,0.5)" : NEON.borderSoft}`, opacity: r.include ? 1 : 0.45 }}>
                  <button className="shrink-0" style={{ color: r.include ? NEON.yellow : NEON.muted }} disabled={ingestBusy || r.status === "done"} onClick={() => setRow({ include: !r.include })} title="Include / exclude this file">{r.include ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}</button>
                  <span className="w-40 shrink-0 truncate text-[10px]" style={{ color: NEON.text }} title={r.name}>{r.name}</span>
                  <span className="w-9 shrink-0 text-[9px] tabular-nums" style={{ color: NEON.muted }}>{r.duration ? fmtDur(r.duration) : "…"}</span>
                  <select value={r.qId ?? ""} disabled={ingestBusy || r.status === "done"} onChange={(e) => setRow({ qId: e.target.value || null })} className="min-w-0 flex-1 rounded bg-black/40 px-1 py-0.5 text-[9.5px]" style={{ color: r.qId ? NEON.text : NEON.red, border: `1px solid ${NEON.borderSoft}` }} title="Matched question — override here">
                    <option value="">— skip (no match) —</option>
                    {questions.map((q, qi) => { const stem = (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.prompt ?? "Question"; return <option key={q.id} value={q.id}>{qi + 1}. {clip(stem, 38)}</option>; })}
                  </select>
                  <button className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: r.lookback ? "#0B0F1E" : NEON.muted, background: r.lookback ? NEON.cyan : "transparent", border: `1px solid ${r.lookback ? NEON.cyan : NEON.borderSoft}` }} disabled={ingestBusy || r.status === "done"} onClick={() => setRow({ lookback: !r.lookback })} title={r.lookback ? "Will APPEND as a lookback clip" : "Will attach as the BASE clip (replaces an existing base, keeping one prev)"}>{r.lookback ? "LB" : "base"}</button>
                  <span className="grid h-4 w-4 shrink-0 place-items-center" title={r.error ?? r.status}>{r.status === "uploading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: NEON.cyan }} /> : r.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#3BF5A0" }} /> : r.status === "error" ? <span style={{ color: NEON.red, fontWeight: 900 }}>✗</span> : <Circle className="h-3.5 w-3.5" style={{ color: NEON.muted }} />}</span>
                </div>
              ); })}
              {ingest.some((r) => r.status === "error") && <div className="px-1 text-[9px]" style={{ color: NEON.red }}>Failed rows keep their file — Retry uploads only those (successes are never re-uploaded).</div>}
            </div>
            <div className="flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
              <span className="min-w-0 flex-1 truncate text-[9px] italic" style={{ color: NEON.muted }}>Nothing touches storage until you confirm.</span>
              <button className="rounded px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-40" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} disabled={ingestBusy} onClick={() => setIngest(null)}>cancel</button>
              <button className="rounded px-2.5 py-1 text-[10px] font-bold uppercase disabled:opacity-40" style={{ color: "#0B0F1E", background: "#3BF5A0", border: "1px solid #3BF5A0" }} disabled={ingestBusy || !ingest.some((r) => r.include && r.qId && r.status !== "done")} onClick={() => void runIngest()}>
                {ingestBusy ? "uploading…" : ingest.some((r) => r.status === "error") ? "retry failures" : `upload ${ingest.filter((r) => r.include && r.qId && r.status !== "done").length}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ADD MENU — portaled to the document body at fixed coords. Living inside the
          strip toolbar meant `overflow-x-auto` clipped it (it rendered behind the
          Studio and couldn't be used). Z.modal puts it above the Studio overlay. */}
      {addOpen && addAt && studioRootRef.current && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: Z.modal }} onClick={closeAdd} />
          <div
            className="fixed flex max-h-[62vh] w-64 flex-col rounded-xl p-2"
            style={{ left: Math.min(addAt.x, (studioRootRef.current.ownerDocument.defaultView?.innerWidth ?? 1200) - 280), top: addAt.y, zIndex: Z.modal + 1, background: NEON.panelSolid, border: `1px solid ${NEON.border}`, boxShadow: "0 18px 44px -16px rgba(0,0,0,0.8)" }}
          >
            <input autoFocus value={addQuery} onChange={(e) => setAddQuery(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") closeAdd(); }} placeholder="Filter…" className="mb-1.5 shrink-0 rounded bg-black/40 px-2 py-1 text-[11px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* PASTE sits at the top when something's on the element clipboard —
                  the copy→other frame→paste loop without leaving this one menu. */}
              {elClip && (
                <button className="mb-1.5 w-full rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/10" style={{ color: NEON.cyan, border: `1px solid rgba(79,209,224,0.5)` }} onClick={pasteStageElement} title="Paste the copied element onto this question (a fresh, independent copy)">
                  ⧉ Paste “{elClip.label.slice(0, 22)}”
                </button>
              )}
              {groupedStageElements(addQuery).map((g) => (
                <div key={g.group} className="mb-1.5">
                  <div className="mb-0.5 px-1 text-[8.5px] font-bold uppercase tracking-widest" style={{ color: NEON.muted }}>{g.group}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {g.items.map((it) => (
                      <button key={it.label} className="rounded px-1.5 py-1 text-left text-[10.5px] font-medium hover:bg-white/10" style={{ color: NEON.text, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => addStageElement(it)} title={`Add ${it.label} to this question`}>{it.label}</button>
                    ))}
                  </div>
                </div>
              ))}
              {groupedStageElements(addQuery).length === 0 && <div className="px-1 py-3 text-center text-[10px] italic" style={{ color: NEON.muted }}>Nothing matches “{addQuery}”.</div>}
            </div>
          </div>
        </>,
        studioRootRef.current.ownerDocument.body,
      )}
      {chainFor && <CeqChainEditor nodeId={chainFor} onClose={() => setChainFor(null)} />}
      {confirmBox && (
        <div className="absolute inset-0 z-[80] grid place-items-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setConfirmBox(null)}>
          <div className="w-[340px] rounded-lg p-3" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-[11.5px]" style={{ color: NEON.text }}>{confirmBox.msg}</div>
            <div className="flex justify-end gap-1.5">
              <button className="rounded px-2 py-1 text-[10px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setConfirmBox(null)}>cancel</button>
              <button className="rounded px-2 py-1 text-[10px] font-bold uppercase" style={{ color: "#0B0F1E", background: NEON.red }} onClick={() => { confirmBox.onYes(); setConfirmBox(null); }}>delete</button>
            </div>
          </div>
        </div>
      )}
      {pickModal && (
        <MemoPickerModal
          memos={memosForPicker}
          usageCount={usageOf}
          categories={MEMO_CATEGORIES}
          defaultCategory="OTHER TIPS"
          onPick={(memoId) => { attachMemoToChoice(pickModal.ceqId, pickModal.choiceId, memoId); setPickModal(null); }}
          onCreate={(text, category) => { createMemoChained(pickModal.ceqId, pickModal.choiceId, text, category); setPickModal(null); }}
          onClose={() => setPickModal(null)}
        />
      )}
    </div>
  );
}
