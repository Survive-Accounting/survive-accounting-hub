// CEQ STUDIO (prompt 5) — one panel for day-to-day CEQ authoring, replacing the
// old deck UI's day-to-day use (the deck panel stays untouched). Three panes,
// reusing EXISTING models only: SETS = named CARD decks; QUESTIONS = a set's CEQ
// cards (free stems/choices) with a per-choice CHAIN editor (the prompt-1 model,
// one model / two doors); MEMO LIBRARY = every memo with label + category (incl
// ELEMENT), search/filter, bulk triage for the unfiled pile, and drag-onto-a-choice
// to attach to a chain. No new storage beyond panel prefs.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { CheckCircle2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Circle, ClipboardPaste, Copy, ExternalLink, FolderInput, Globe, LayoutGrid, Library, Lightbulb, ListChecks, Loader2, Play, Plus, Search, Square, Trash2, WrapText, X, ArrowUp, ArrowDown, Link2, Film } from "lucide-react";

import { chapterLabel, courseLabel, fetchCourseOptions, type CourseOption } from "@/lib/je-api";

import { addDeck, deckMembersOf, newDeckDef, removeDeck, updateDeck } from "./deck-defs";
import { nextStageOrder } from "./BaseCard";
import { addNodesAndEdgesCmd, addNodesCmd, bus, compositeCmd, patchDataCmd, patchDataFnCmd, removeNodesCmd, type Command, type RfLike } from "./commands";
import { memoAnchorId } from "./MemoLightbulb";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { CeqChainEditor } from "./CeqChainEditor";
import { listChainTemplates } from "./ceq-chain-templates";
import { MemoPickerModal } from "./MemoPickerModal";
import { CeqPreviewer, dealCentre, defaultMemoPos } from "./CeqPreviewer";
import { seedCeqSets } from "./ceq-seed";
import { buildStitch, fmtDur, loadPrefs, readDuration, savePrefs, stageTake, stitchManifest, stitchRuntime, videoFromDrop, videosFromDrop, withPrev, type CeqStudioPrefs } from "./ceq-takes";
import { CeqStitch } from "./CeqStitch";
import { CeqVideoLibrary, vidCourseMatch, vidTopicMatch } from "./CeqVideoLibrary";
import { DEFAULT_CROSSFADE_MS } from "./segment-assembly";
import { detectAuphonicSlots, resolveCeqConcat, resolvePipelineTestAuphonic, startCeqConcat, startPipelineTestAuphonic } from "@/lib/publish.functions";
import type { LessonBox } from "./types";
import { MEMO_CATEGORIES } from "./cards/MemoCardNode";
import { useFrameNav } from "./FrameNavContext";
import { cardId, type CeqCard, type ChainSound, type CeqChainItem, type CeqChoice, type DeckDef, type DeckLayout, type DeckSlotLayout, type GlobalClips, type TakeRef } from "./types";
import { NEON } from "./theme";

const memoText = (title?: string, body?: string) => ((title && title.trim()) || (body || "").replace(/[*_=~`#>]/g, "").trim() || "memo");
/** A question's ordered CLIP STACK — the new `takes` list, else the legacy single
 *  `take` migrated as a one-item list. The single source of truth for stitch/publish. */
const cardClips = (d?: { takes?: TakeRef[]; take?: TakeRef }): TakeRef[] => (d?.takes && d.takes.length ? d.takes : d?.take ? [d.take] : []);
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);
const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const NONE = "__uncat__";
const MEMO_DND = "text/sa-studio-memo";
const QREORDER = "text/sa-ceq-qreorder"; // dragging a question ROW to reorder
const SET_DND = "text/sa-ceq-set"; // dragging a SET row onto a topic / the Library
const TABS_SS = "sa-ceq-studio-set-tabs"; // sessionStorage: open set tabs + active (per session)
const LAYOUT_Q0 = "__layout0__"; // Question 0 sentinel — the set BASELINE as an editable stage (never films/stitches/counts/deals)

export function CeqStudio({ decks, setDecks, globalClips, setGlobalClips, initialCeqId, onPopOut, popped, onClose }: { decks: DeckDef[]; setDecks: (fn: (prev: DeckDef[]) => DeckDef[]) => void; globalClips?: GlobalClips; setGlobalClips?: (patch: Partial<GlobalClips>) => void; initialCeqId?: string | null; onPopOut?: () => void; popped?: boolean; onClose: () => void }) {
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
  const [publishOpen, setPublishOpen] = useState(false); // the Publish panel (per active set)
  // PUBLISH FREE+FULL COMBO — preflight checklist → confirm → sequential publish.
  const [combo, setCombo] = useState<{ free: "pending" | "running" | "done" | "error"; full: "pending" | "running" | "done" | "error"; running: boolean } | null>(null);
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
  const [chainFor, setChainFor] = useState<string | null>(null); // CEQ node whose chain editor is open
  const [note, setNote] = useState<string | null>(null);
  const [memoQuery, setMemoQuery] = useState("");
  const [memoSort, setMemoSort] = useState<"recent" | "az">("recent"); // library sort
  const [catFilter, setCatFilter] = useState<Set<string>>(() => new Set([...MEMO_CATEGORIES, NONE]));
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [editorOpen, setEditorOpen] = useState(true); // collapsible stem/choices editor
  const [libOpen, setLibOpen] = useState(true); // collapsible memo-library pane
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
  const [previewSelMemo, setPreviewSelMemo] = useState<string | null>(null); // memo selected in the previewer
  const [shortsQueueOpen, setShortsQueueOpen] = useState(false); // shorts-worthy worklist overlay
  const [prefs, setPrefsState] = useState<CeqStudioPrefs>(() => loadPrefs()); // panel prefs (wrap toggle + shared transition)
  const setPrefs = (p: Partial<CeqStudioPrefs>) => setPrefsState((cur) => { const n = { ...cur, ...p }; savePrefs(n); return n; });
  const wrapStems = !!prefs.wrapStems;
  const [takeBusy, setTakeBusy] = useState<string | null>(null); // slot key currently uploading
  // BATCH TAKE INGEST (Lee) — drop N clips → match → CONFIRM table → bulk upload.
  const [ingest, setIngest] = useState<{ file: File; name: string; duration: number; qId: string | null; lookback: boolean; include: boolean; status: "pending" | "uploading" | "done" | "error"; error?: string }[] | null>(null);
  const [ingestBusy, setIngestBusy] = useState(false);
  const ingestFileRef = useRef<HTMLInputElement>(null);
  const [takePreview, setTakePreview] = useState<string | null>(null); // slot key previewed inline (clip stack)
  const [clipRefsOpen, setClipRefsOpen] = useState<string | null>(null); // `${ceqId}:${clipIdx}` whose refs picker is open
  const [starOnly, setStarOnly] = useState(false); // Starred filter on the question list
  const [qMenu, setQMenu] = useState<string | null>(null); // question row whose "…" action menu is open
  // BULK QUESTION OPS (Lee) — multi-select question rows + one action bar.
  const [qSel, setQSel] = useState<Set<string>>(() => new Set());
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
  const [stitchMode, setStitchMode] = useState<"free" | "full" | null>(null); // center = sequential preview
  const [publishBusy, setPublishBusy] = useState<"free" | "full" | null>(null);
  const [expandedQ, setExpandedQ] = useState<Set<string>>(new Set()); // questions whose memo list stays shown
  const [selChainMemos, setSelChainMemos] = useState<Set<string>>(new Set()); // outline memo selection (memoNodeId)
  const [memoClip, setMemoClip] = useState<{ label: string; title: string; body: string; memoKind: string; category: string; subcategory: string; x: number; y: number; scale: number; choiceIdx: number }[]>([]); // copied chain memos
  const [itemsClip, setItemsClip] = useState<{ memoNodeId: string; choiceIdx: number; label: string; title: string; body: string; memoKind: string; category: string; subcategory: string; sound?: ChainSound; hideChoiceLabel?: boolean; hideArrow?: boolean }[]>([]); // "copy items" clipboard (memos, for new/exact paste)
  const [qClip, setQClip] = useState<{ prompt: string; scale: number; choices: { text: string; correct?: boolean }[]; memos: { label: string; title: string; body: string; memoKind: string; category: string; subcategory: string; x: number; y: number; scale: number; choiceIdx: number }[] } | null>(null); // copied whole question
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
  const topTab: "videos" | "topics" | "sets" | "tools" = prefs.topTab ?? "sets"; // top bar tab
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
      if (course && topic) { report.push(`"${d.name}" → ${courseLabel(course)} / ${chapterLabel(topic)}`); return { ...d, courseId: course.id, topicId: topic.id }; }
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
    setNote(topic && course ? `Moved set → ${courseLabel(course)} / ${chapterLabel(topic)}.` : "Returned set to the Library (unassigned).");
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
    const m = new Map<string, { missFull: number; missFree: number; intro: boolean; outro: boolean; wrapN: number; runtimeS: number }>();
    for (const d of cardDecks) {
      const mem = deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], d.id).filter((n) => (n as { type?: string }).type === "ceq");
      const ceqs = mem.map((n) => { const dd = rf.getNode(n.id)?.data as unknown as CeqCard | undefined; return { id: n.id, prompt: dd?.prompt ?? "", takes: cardClips(dd), free: dd?.free }; });
      const missFull = ceqs.filter((c) => c.takes.length === 0).length;
      const missFree = ceqs.filter((c) => c.free && c.takes.length === 0).length;
      const intro = !!(d.intro ?? gc.intro); const outro = !!(d.outro ?? gc.outro);
      const stitch = buildStitch("full", { intro: d.intro ?? gc.intro, transition: gc.transition, outro: d.outro ?? gc.outro, wrap: d.wrap, ceqs });
      m.set(d.id, { missFull, missFree, intro, outro, wrapN: d.wrap?.length ?? 0, runtimeS: stitchRuntime(stitch.items) });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardDecks, nodes, gc.intro, gc.outro, gc.transition]);
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
  // Outline expand state — persisted in panel prefs; default open where sets live.
  const outlineExp = prefs.setsOutline ?? {};
  const isExp = (key: string, dflt: boolean) => outlineExp[key] ?? dflt;
  const toggleExp = (key: string, dflt: boolean) => setPrefs({ setsOutline: { ...outlineExp, [key]: !isExp(key, dflt) } });
  const deck = cardDecks.find((d) => d.id === setId) ?? null;
  // Open set tabs resolved to live decks (stale session ids drop out silently).
  const tabDecks = useMemo(() => openTabs.map((id) => cardDecks.find((d) => d.id === id)).filter((d): d is DeckDef => !!d), [openTabs, cardDecks]);
  // An active set always has a visible tab chip (covers session-restore edge cases).
  useEffect(() => { if (setId && cardDecks.some((d) => d.id === setId)) setOpenTabs((p) => (p.includes(setId) ? p : [...p, setId])); }, [setId, cardDecks]);
  const questions = useMemo(() => (deck ? deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], deck.id).filter((n) => (n as { type?: string }).type === "ceq") : []), [deck, nodes]);
  const starCount = useMemo(() => questions.reduce((n, q) => n + ((rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.starred ? 1 : 0), 0), [questions, nodes]); // eslint-disable-line react-hooks/exhaustive-deps
  const qNode = qId ? nodes.find((n) => n.id === qId) : null;
  const qd = qNode?.data as unknown as CeqCard | undefined;
  // Re-seed signature for the live previewer — CONTENT only (stem/choices/chain), NOT
  // positions, so dragging a memo (which writes position back) never re-seeds/fights.
  const ceqSig = qd ? `${qId}|${qd.prompt}|${qd.choices.map((c) => `${c.text}:${c.correct ? 1 : 0}:${(c.chain ?? []).map((it) => `${it.memoNodeId}~${it.label}~${it.sound ?? ""}~${it.hideChoiceLabel ? 1 : 0}~${it.hideArrow ? 1 : 0}`).join(",")}`).join("|")}` : "";
  // The frame the set will be dealt into — the previewer mirrors ITS size so the
  // composition you build == the dealt frame exactly. Defaults to a 1600×900 stage.
  const targetFrame = nav.currentFrameId ? rf.getNode(nav.currentFrameId) : null;
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
  const stitchFree = useMemo(() => buildStitch("free", { intro: resolvedIntro, transition: gc.transition, outro: resolvedOutro, wrap: deck?.wrap, ceqs: stitchCeqs }), [stitchCeqs, resolvedIntro, resolvedOutro, gc.transition, deck?.wrap]);
  const stitchFull = useMemo(() => buildStitch("full", { intro: resolvedIntro, transition: gc.transition, outro: resolvedOutro, wrap: deck?.wrap, ceqs: stitchCeqs }), [stitchCeqs, resolvedIntro, resolvedOutro, gc.transition, deck?.wrap]);
  const freeCount = stitchCeqs.filter((c) => c.free).length;
  // SHORTS QUEUE (Lee) — every shorts-flagged CEQ across ALL sets, with its set +
  // question number, stem and angle note. Lee's batch-filming worklist.
  const shortsList = useMemo(() => rf.getNodes()
    .filter((n) => n.type === "ceq" && !!(n.data as { short?: boolean }).short)
    .map((n) => {
      const d = n.data as unknown as CeqCard & { deckId?: string };
      const dk = d.deckId ? cardDecks.find((x) => x.id === d.deckId) : null;
      const members = d.deckId ? deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], d.deckId).filter((m) => (m as { type?: string }).type === "ceq") : [];
      const qnum = members.findIndex((m) => m.id === n.id) + 1;
      return { id: n.id, deckId: d.deckId, setName: dk?.name ?? "Loose", tqq: `${dk?.chapter || dk?.name || "Set"} · Q${qnum || "?"}`, stem: d.prompt || "Question", note: d.shortNote || "" };
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
      layout: { card: { ...dealCentre(frameW, frameH), scale: 1 }, memoSlots: [{ ...defaultMemoPos(frameW, frameH, 0), scale: 1 }, { ...defaultMemoPos(frameW, frameH, 1), scale: 1 }] },
    };
    setDecks((prev) => addDeck(prev, def));
    setSetId(def.id); setQId(null); setNewSetForm(null);
    setNote(topic && course ? `Created "${def.name}" under ${courseLabel(course)} / ${chapterLabel(topic)}.` : `Created "${def.name}" in the Library (unassigned).`);
  };
  const runSeed = () => {
    if (!window.confirm("Seed the Ch 1–5 CEQ sets? Re-seeding replaces each seeded set's cards (idempotent) — your other sets are untouched.")) return;
    const rep = seedCeqSets(rf, setDecks);
    const total = rep.reduce((s, r) => s + r.count, 0);
    setNote(`Seeded ${rep.length} sets · ${total} questions${rep.some((r) => r.replaced) ? " (replaced existing)" : ""}. Chains/memos empty — add your voice.`);
  };
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
          <button className="min-w-0 flex-1 truncate text-left text-[10.5px] font-semibold" style={{ color: on ? NEON.yellow : NEON.text }} onClick={() => openSetTab(d.id)} onDoubleClick={() => renameSet(d)}>{d.name}</button>
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
                {courseOptions.find((c) => c.id === assignCourseSel)?.chapters.filter((ch) => ch.status !== "archived").map((ch) => <option key={ch.id} value={ch.id}>{chapterLabel(ch)}</option>)}
              </select>
            )}
          </div>
        )}
      </div>
    );
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
  const patchQ = (id: string, patch: Record<string, unknown>) => { const c = patchDataCmd(rfl, id, patch, "edit question"); if (c) bus.dispatch(c); };
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
  /** Delete a question from the set — removes the CEQ card + its chain arrows (the
   *  chained memos stay in the library). Undoable via the command bus. */
  const deleteQuestion = (id: string) => {
    const rm = removeNodesCmd(rfl, [id], "delete question");
    if (!rm) return;
    if (qId === id) { const i = questions.findIndex((q) => q.id === id); const next = questions[i + 1] ?? questions[i - 1] ?? null; setQId(next ? next.id : null); }
    bus.dispatch(rm);
    setNote("Deleted the question (Ctrl+Z to undo).");
  };
  /** Jump to the next/prev question in the set (Space / ‹ › in the previewer). */
  const gotoQuestion = (dir: 1 | -1) => {
    if (questions.length === 0) return;
    const i = questions.findIndex((q) => q.id === qId);
    const ni = i < 0 ? (dir > 0 ? 0 : questions.length - 1) : (i + dir + questions.length) % questions.length;
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
  const dropSlot = async (kind: "intro" | "outro" | "transition" | "wrap" | "lookback", file: File) => {
    const key = kind === "transition" ? "transition" : `${kind}:${setId}`;
    if (takeBusy || (kind !== "transition" && !deck)) return;
    setTakeBusy(key); setNote(`Uploading ${kind}…`);
    try {
      const fresh = await stageTake(file);
      if (kind === "transition") setGlobalClips?.({ transition: withPrev(fresh, gc.transition) });
      else if (kind === "wrap" && deck) setDecks((prev) => updateDeck(prev, deck.id, { wrap: [...(deck.wrap ?? []), fresh] }));
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
  const ingestNumOf = (name: string): number | null => {
    const base = name.replace(/\.[a-z0-9]+$/i, "");
    let m = /(?:^|[^0-9])(\d+)\.(\d{1,2})(?:[^0-9]|$)/.exec(base);
    if (m) return Number(m[2]);
    m = /(?:^|[^a-z0-9])q\s*(\d{1,2})(?:[^0-9]|$)/i.exec(base);
    if (m) return Number(m[1]);
    m = /^(\d{1,2})(?:[^0-9]|$)/.exec(base);
    if (m) return Number(m[1]);
    return null;
  };
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

  /** Which lesson a Free/Full publish attaches to: the CEQ lesson (category CEQ) of
   *  the matching access in the set's topic; falls back to the set's linked lesson. */
  const targetLesson = (access: "FREE" | "PAID"): string | null => {
    const dl = deck?.lessonId ? rf.getNode(deck.lessonId) : null;
    const topic = (dl?.data as unknown as LessonBox | undefined)?.topic;
    const cand = rf.getNodes().find((n) => { const ld = n.data as unknown as LessonBox; return n.type === "lesson" && ld.category === "CEQ" && (ld.access ?? "FREE") === access && (!topic || ld.topic === topic); });
    return cand?.id ?? (access === "FREE" ? deck?.lessonId ?? null : null);
  };

  /** PUBLISH the Free/Full stitch: Mux concat (hard-cut) → Auphonic → Supabase → Mux
   *  → attach to the Free/Paid lesson + store the manifest. FAILS LOUD on any missing
   *  clip (no silent skips at publish, unlike preview). Runs on the deployed env. */
  const publishStitch = async (mode: "free" | "full"): Promise<boolean> => {
    if (publishBusy || !deck) return false;
    // LIBRARY sets are not publishable — publish attaches to a lesson under a topic.
    if (!deck.topicId) { setNote("This set is in the Library (unassigned) — assign it to a Course → Topic before publishing."); return false; }
    const stitch = mode === "free" ? stitchFree : stitchFull;
    if (stitch.missing.length > 0) { setNote(`Publish blocked — ${stitch.missing.length} CEQ(s) in the ${mode} cut have no clip: ${stitch.missing.map((m) => (m.prompt || "?").slice(0, 18)).join(", ")}. Attach clips first.`); return false; }
    if (stitch.items.filter((i) => i.kind === "ceq").length === 0) { setNote(`No CEQ clips in the ${mode} cut.`); return false; }
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    // Resolve the target lesson + the Mux passthrough scheme UP FRONT so the final
    // asset carries them: {course}/{topic}/{lesson-name}/{free|full}.
    const access = mode === "free" ? "FREE" : "PAID";
    const lessonId = targetLesson(access);
    const ld = lessonId ? (rf.getNode(lessonId)?.data as unknown as LessonBox | undefined) : undefined;
    const course = deck.course || "Course";
    const topic = ld?.topic || deck.chapter || "Topic";
    const lessonName = ld?.label || deck.name;
    const sanitize = (s: string) => s.replace(/\//g, "-").trim();
    const passthrough = `${sanitize(course)}/${sanitize(topic)}/${sanitize(lessonName)}/${mode}`.slice(0, 250);
    const title = `${lessonName} — ${mode === "free" ? "Free" : "Full"} CEQ`;
    const runtimeS = Math.round(stitchRuntime(stitch.items) - Math.max(0, stitch.items.length - 1) * (DEFAULT_CROSSFADE_MS / 1000));
    setPublishBusy(mode); setNote(`Publishing ${mode} — detecting the Auphonic preset…`);
    try {
      // Don't double intro/outro if the Auphonic preset already prepends/appends them.
      const slots = await detectAuphonicSlots();
      let items = stitch.items;
      if (slots.hasOutro) items = items.filter((i) => i.kind !== "outro");
      if (slots.hasIntro) items = items.filter((i) => i.kind !== "intro");
      const urls = items.map((i) => i.take.url);
      // 1) Mux multi-input concat (hard cut)
      const { assetId } = await startCeqConcat({ data: { urls, passthrough: `ceq-concat-${mode}` } });
      let mp4Url: string | null = null;
      for (let i = 0; i < 120 && !mp4Url; i++) { const r: Awaited<ReturnType<typeof resolveCeqConcat>> = await resolveCeqConcat({ data: { assetId } }); if (r.status === "errored") throw new Error(r.error ?? "Mux concat failed"); if (r.status === "ready") { mp4Url = r.mp4Url; break; } setNote(`Mux concatenating ${items.length} clips…`); await sleep(4000); }
      if (!mp4Url) throw new Error("Timed out waiting for the Mux concat.");
      // 2) Auphonic → Supabase → FINAL Mux (reuse the staged pipeline; carry passthrough + title)
      const { auphonicUuid } = await startPipelineTestAuphonic({ data: { fileUrl: mp4Url } });
      let muxAssetId: string | null = null; let final: string | null = null;
      for (let i = 0; i < 240 && !final; i++) { const r: Awaited<ReturnType<typeof resolvePipelineTestAuphonic>> = await resolvePipelineTestAuphonic({ data: { auphonicUuid, muxAssetId, passthrough, title } }); muxAssetId = r.muxAssetId; if (r.stage === "errored") throw new Error(r.error ?? "Pipeline errored"); if (r.stage === "ready") { final = r.playbackId; break; } setNote(r.stage === "auphonic" ? `Auphonic: ${r.auphonicStatus ?? "processing"}…` : "Mux ingesting the processed file…"); await sleep(5000); }
      if (!final) throw new Error("Timed out waiting for the final Mux asset.");
      // 3) manifest + attach to the Free/Paid CEQ lesson (+ library metadata)
      const manifest = stitchManifest(stitch.items, DEFAULT_CROSSFADE_MS);
      if (lessonId) {
        const prevAsset = ld?.muxAssetId ?? null;
        rf.updateNodeData(lessonId, { muxAssetId, muxPlaybackId: final, status: "PUBLISHED", ceqManifest: manifest, muxPublishedAt: Date.now(), muxDurationS: runtimeS, videoCourse: course, videoChapter: topic });
        setNote(`Published ${mode} ✓ → attached to the ${access} lesson (${manifest.length} CEQs indexed). passthrough "${passthrough}".${prevAsset ? ` Old Mux asset ${prevAsset} superseded — delete it in Mux manually.` : ""} Concat asset: ${assetId}.`);
      } else setNote(`Published ${mode} ✓ (playback ${final}) — no ${access} CEQ lesson found to attach to. Final asset ${muxAssetId}, concat ${assetId}.`);
      return true;
    } catch (e) { setNote(`Publish ${mode} failed: ${e instanceof Error ? e.message : String(e)}`); return false; }
    finally { setPublishBusy(null); }
  };
  /** PREFLIGHT for the Free+Full combo — every gate the two publishes will hit,
   *  checked up front with specifics. Recomputed live at render. */
  const comboChecks = () => [
    { label: "Assigned to a Course → Topic", ok: !!deck?.topicId, detail: deck?.topicId ? "" : "Library set — assign it first" },
    { label: `Free cut non-empty (${freeCount} flagged)`, ok: freeCount > 0, detail: freeCount > 0 ? "" : "Flag questions F for the free cut" },
    { label: "No missing clips — free cut", ok: stitchFree.missing.length === 0, detail: stitchFree.missing.map((m) => clip(m.prompt || "?", 18)).join(", ") },
    { label: "No missing clips — full cut", ok: stitchFull.missing.length === 0, detail: stitchFull.missing.map((m) => clip(m.prompt || "?", 18)).join(", ") },
    { label: "Intro resolved (local or global)", ok: !!resolvedIntro, detail: resolvedIntro ? "" : "Drop an intro or set a global" },
    { label: "Outro resolved (local or global)", ok: !!resolvedOutro, detail: resolvedOutro ? "" : "Drop an outro or set a global" },
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
  const reorderChainMemo = (ceqId: string, choiceId: string, idx: number, dir: -1 | 1) => {
    const c = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => { if (ch.id !== choiceId) return ch; const arr = [...(ch.chain ?? [])]; const j = idx + dir; if (j < 0 || j >= arr.length) return ch; [arr[idx], arr[j]] = [arr[j], arr[idx]]; return { ...ch, chain: arr }; }) }), "renumber chain");
    if (c) bus.dispatch(c);
  };
  /** Flat walk list for a question (choice order → chain index) for the outline. */
  const walkOf = (q: { id: string }) => { const cc = (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.choices ?? []; const list: { choiceId: string; idx: number; label: string; letter: string; num: number; memoNodeId: string; sound?: ChainSound }[] = []; cc.forEach((ch, ci) => (ch.chain ?? []).forEach((it, i) => list.push({ choiceId: ch.id, idx: i, label: it.label, letter: LETTER(ci), num: list.length + 1, memoNodeId: it.memoNodeId, sound: it.sound }))); return list; };
  const patchChoice = (id: string, choiceId: string, patch: Partial<CeqChoice>) => { const c = patchDataFnCmd(rfl, id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => (ch.id === choiceId ? { ...ch, ...patch } : ch)) }), "edit choice"); if (c) bus.dispatch(c); };
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

  /** DEAL the set into the current frame — reparent its CEQ cards (a tucked stack)
   *  AND their chain memos, each at the EXACT position it holds in this previewer.
   *  The CEQ sits at the deal-centre; memos keep their frame-local spots but are
   *  hidden in film until Enter-walked (the hiddenOf reconciler owns that). So the
   *  frame is film-ready — no post-deal editing. */
  const dealIntoFrame = () => {
    const frameId = nav.currentFrameId;
    if (!frameId || !deck) { setNote("Enter a frame first, then Deal."); return; }
    const frame = rf.getNode(frameId);
    if (!frame || frame.type !== "frame") { setNote("Enter a frame first, then Deal."); return; }
    const fw = (frame.data as { w?: number }).w ?? frame.width ?? 1600;
    const fh = (frame.data as { h?: number }).h ?? frame.height ?? 900;
    const members = questions.map((q) => rf.getNode(q.id)).filter((n): n is NonNullable<typeof n> => !!n);
    const memberIds = new Set(members.map((m) => m.id));
    // Card + memos land at the SET BASELINE (deck.layout), NOT the drifting previewer
    // positions — every question deals identically. dealSpot is the stack flip-spot
    // (stackStep reads it now); memos key off the FLAT chain index PER question so
    // slot 1 of every question sits in the same baseline spot. Default = centre / right-stack.
    const cardBase = deck.layout?.card;
    const dealSpot = cardBase ? { x: Math.round(cardBase.x), y: Math.round(cardBase.y) } : dealCentre(fw, fh);
    const memoPlace = new Map<string, { x: number; y: number; scale?: number }>();
    for (const m of members) { let i = 0; for (const ch of ((m.data as unknown as CeqCard).choices ?? [])) for (const it of (ch.chain ?? [])) { if (it.memoNodeId) memoPlace.set(it.memoNodeId, deck.layout?.memoSlots?.[i] ?? defaultMemoPos(fw, fh, i)); i++; } }
    bus.dispatch({
      label: `deal ${deck.name} into frame`,
      do: () => rf.setNodes((nds) => nds.map((n) => {
        if (memberIds.has(n.id)) { const mi = members.findIndex((m) => m.id === n.id); return { ...n, parentId: frameId, position: { x: dealSpot.x, y: dealSpot.y }, data: { ...n.data, tucked: mi > 0, deckMember: true, staged: undefined, minimized: undefined, ...(cardBase?.scale != null ? { scale: cardBase.scale } : {}) } } as typeof n; }
        if (memoPlace.has(n.id)) { const p = memoPlace.get(n.id)!; return { ...n, parentId: frameId, position: { x: p.x, y: p.y }, data: { ...n.data, ...(p.scale != null ? { scale: p.scale } : {}) } } as typeof n; }
        return n;
      })),
      undo: () => { /* transient staging move — re-deal to redo; not separately undone */ },
    });
    const c = patchDataCmd(rfl, frameId, { stackDeal: true, dealSpot }, "stack deal"); if (c) bus.dispatch(c);
    setNote(`Dealt ${members.length} question${members.length === 1 ? "" : "s"} + ${memoPlace.size} memo${memoPlace.size === 1 ? "" : "s"} at the set baseline. Film-ready (Enter reveals the memos).`);
  };

  // ---- MEMO LIBRARY ---------------------------------------------------------
  const memos = useMemo(() => rf.getNodes().filter((n) => n.type === "memo").map((n, i) => { const d = n.data as { label?: string; title?: string; body?: string; category?: string; subcategory?: string; course?: string }; return { id: n.id, order: i, label: d.label || memoText(d.title, d.body), category: (d.category || "").toUpperCase(), subcategory: d.subcategory || "", course: d.course || "" }; }), [nodes]);
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
      const tqq = `${dk?.chapter || dk?.name || "Set"} · Q${qnum || "?"}`;
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
  const shownMemos = memos
    .filter((m) => inScope(m.id))
    .filter((m) => catFilter.has(m.category || NONE))
    .filter((m) => courseFilter === "all" || m.course === courseFilter)
    .filter((m) => { const q = memoQuery.trim().toLowerCase(); return !q || m.label.toLowerCase().includes(q) || m.subcategory.toLowerCase().includes(q); })
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
  const copyQuestion = () => {
    if (!qId || !qd) return;
    const memos: NonNullable<typeof qClip>["memos"] = [];
    qd.choices.forEach((ch, ci) => (ch.chain ?? []).forEach((it) => {
      const m = rf.getNode(it.memoNodeId); if (!m) return;
      const md = m.data as { title?: string; body?: string; memoKind?: string; category?: string; subcategory?: string; scale?: number };
      memos.push({ label: it.label, title: md.title ?? "", body: md.body ?? "", memoKind: md.memoKind ?? "note", category: md.category ?? "", subcategory: md.subcategory ?? "", x: Math.round(m.position.x), y: Math.round(m.position.y), scale: md.scale ?? 1, choiceIdx: ci });
    }));
    setQClip({ prompt: qd.prompt, scale: (qNode?.data as { scale?: number } | undefined)?.scale ?? 1, choices: qd.choices.map((c) => ({ text: c.text, correct: c.correct })), memos });
    setMemoClip([]);
    setNote(`Copied the question (${memos.length} memo${memos.length === 1 ? "" : "s"}) — Ctrl+V to paste into this set.`);
  };
  /** Paste the copied question into the current set (fresh ids, its memos too). */
  const pasteQuestion = () => {
    if (!qClip || !deck) return;
    const order = nextStageOrder(rf.getNodes() as never);
    const ceqId = cardId("ceq");
    const choiceIds = qClip.choices.map(() => cardId("ch"));
    const chainByChoice = new Map<string, { kind: "memo"; memoNodeId: string; label: string }[]>();
    const memoNodes: Record<string, unknown>[] = [];
    const newEdges: Record<string, unknown>[] = [];
    for (const clip of qClip.memos) {
      const cid = choiceIds[clip.choiceIdx]; if (!cid) continue;
      const memoId = cardId("memo");
      memoNodes.push({ id: memoId, type: "memo", position: { x: clip.x, y: clip.y }, selected: false, data: { kind: "memo", memoKind: clip.memoKind, title: clip.title, body: clip.body, category: clip.category, subcategory: clip.subcategory, scale: clip.scale } });
      newEdges.push({ id: `chn-${cid}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: memoAnchorId(cid), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } });
      const arr = chainByChoice.get(cid) ?? []; arr.push({ kind: "memo", memoNodeId: memoId, label: clip.label }); chainByChoice.set(cid, arr);
    }
    const ceqNode = { id: ceqId, type: "ceq", position: { x: 520, y: 210 }, selected: false, data: { kind: "ceq", title: deck.name, prompt: qClip.prompt, scale: qClip.scale, choices: qClip.choices.map((c, i) => ({ id: choiceIds[i], text: c.text, correct: c.correct, ...(chainByChoice.has(choiceIds[i]) ? { chain: chainByChoice.get(choiceIds[i]) } : {}) })), deckId: deck.id, deckMember: true, tucked: true, stageOrder: order, slotIndex: questions.length, deckCategory: "ceq:studio", deckPos: { x: 520, y: 210 } } };
    const add = addNodesAndEdgesCmd(rfl, [ceqNode, ...memoNodes] as never, newEdges as never, "paste question"); if (add) bus.dispatch(add);
    setQId(ceqId);
    setNote(`Pasted a question (${qClip.memos.length} memo${qClip.memos.length === 1 ? "" : "s"}).`);
  };

  // SELECTING a memo in the previewer SURFACES it in the library: open the pane +
  // scroll its row into view (the row also gets a highlight below). The scroll ref is
  // attached to the selected row in the shownMemos map.
  const selMemoRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (!previewSelMemo) return; setLibOpen(true); const t = window.setTimeout(() => selMemoRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60); return () => window.clearTimeout(t); }, [previewSelMemo]);

  // KEYBOARD — Delete (detach/delete), Ctrl+C/Ctrl+V (copy/paste memos),
  // Ctrl+D (duplicate the question). Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.key === "c" || e.key === "C")) { e.preventDefault(); if (selChainMemos.size > 0) copyMemos(); else if (qId) copyQuestion(); return; }
      if (ctrl && (e.key === "v" || e.key === "V")) { e.preventDefault(); if (itemsClip.length > 0 && qId && qId !== LAYOUT_Q0) pasteItems("new"); else if (memoClip.length > 0 && qId && qId !== LAYOUT_Q0) pasteMemos(qId); else if (qClip) pasteQuestion(); return; }
      if (ctrl && (e.key === "d" || e.key === "D")) { if (qId && qId !== LAYOUT_Q0) { e.preventDefault(); duplicateQuestion(qId); } return; }
      if (e.key === "/") { e.preventDefault(); setLibOpen(true); window.setTimeout(() => memoSearchRef.current?.focus(), 60); return; } // "/" focuses the memo search from anywhere
      if (e.key === "Escape" && qSel.size > 0) { setQSel(new Set()); return; } // Esc clears the question selection
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (previewSelMemo && qId) { e.preventDefault(); removeFromChain(qId, previewSelMemo); return; }
      if (sel.size > 0) { e.preventDefault(); deleteMemos([...sel]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSelMemo, qId, sel, selChainMemos, memoClip, qClip, itemsClip, qSel]);

  /** NEXT-SLOT PLACEMENT (Question 0) — a new memo at flat chain index N lands at
   *  baseline slot N (position + size). Overflow (all slots occupied) stacks below the
   *  LAST slot at slot-N's size. No baseline at all ⇒ the classic default stagger. */
  const baselineSpot = (flatIdx: number): { x: number; y: number; scale?: number } => {
    const slots = deck?.layout?.memoSlots ?? [];
    const s = slots[flatIdx];
    if (s) return s;
    const last = slots[slots.length - 1];
    if (last) return { x: last.x, y: last.y + Math.round(150 * (last.scale ?? 1)) * (flatIdx - slots.length + 1), scale: last.scale };
    return { ...defaultMemoPos(frameW, frameH, flatIdx), scale: 1 };
  };
  /** CREATE a brand-new memo (text + category from the +💡 modal or right-click),
   *  attached to a choice's chain + SNAPPED to the next baseline slot. */
  const createMemoChained = (ceqId: string, choiceId: string, text: string, category: string) => {
    const label = text.trim() || "Memo";
    const memoId = cardId("memo");
    const cc = (rf.getNode(ceqId)?.data as unknown as CeqCard | undefined)?.choices ?? [];
    const chainCount = cc.reduce((s, ch) => s + (ch.chain?.length ?? 0), 0);
    const spot = baselineSpot(chainCount);
    const memoNode = { id: memoId, type: "memo", position: { x: Math.round(spot.x), y: Math.round(spot.y) }, selected: false, data: { kind: "memo", memoKind: "note", title: label, body: "", category, ...(spot.scale != null ? { scale: spot.scale } : {}) } };
    const edge = { id: `chn-${choiceId}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: memoAnchorId(choiceId), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    const add = addNodesAndEdgesCmd(rfl, [memoNode] as never, [edge] as never, "create chain memo"); if (add) bus.dispatch(add);
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: [...(c.chain ?? []), { kind: "memo" as const, memoNodeId: memoId, label }] } : c)) }), "add memo to chain"); if (patch) bus.dispatch(patch);
    setLastMemoCat(category || lastMemoCat);
    touchRecent(memoId);
    setNote(`Created memo "${clip(label, 24)}" — placed at the next baseline slot.`);
  };
  /** RIGHT-CLICK empty frame space → "Add memo here": UNCHAINED, placed AT the click
   *  point (the one case click position wins over slots) at baseline slot-1's SIZE. */
  const addMemoAt = (pos: { x: number; y: number }, text: string, category: string) => {
    const label = text.trim() || "Memo";
    const s1 = deck?.layout?.memoSlots?.[0];
    const memoId = cardId("memo");
    const node = { id: memoId, type: "memo", position: { x: Math.round(pos.x), y: Math.round(pos.y) }, selected: false, data: { kind: "memo", memoKind: "note", title: label, label: clip(label, 40), body: "", category, ...(s1?.scale != null ? { scale: s1.scale } : {}) } };
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
  /** Commit an inline rename of a LIBRARY memo (title + label on the node). */
  const commitEditMemo = (id: string, next: string) => {
    const label = next.trim() || "Memo";
    const p = patchDataCmd(rfl, id, { title: label, label }, "rename memo"); if (p) bus.dispatch(p);
    setEditMemo(null); setEditMemoVal("");
    touchRecent(id);
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
  // Search focus: autofocus whenever the library opens; "/" (global, below) also lands here.
  useEffect(() => { if (libOpen) { const t = window.setTimeout(() => memoSearchRef.current?.focus(), 60); return () => window.clearTimeout(t); } }, [libOpen]);

  /** Drop a memo onto a choice → attach it (existing node) to that choice's chain. */
  const attachMemoToChoice = (ceqId: string, choiceId: string, memoId: string) => {
    const m = rf.getNode(memoId); if (!m) return;
    const md = m.data as { label?: string; title?: string; body?: string };
    const label = md.label || memoText(md.title, md.body);
    const edge = { id: `chn-${choiceId}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: memoAnchorId(choiceId), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    const add = addNodesAndEdgesCmd(rfl, [] as never, [edge] as never, "chain arrow"); if (add) bus.dispatch(add);
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: [...(c.chain ?? []), { kind: "memo" as const, memoNodeId: memoId, label }] } : c)) }), "attach memo");
    if (patch) bus.dispatch(patch);
    touchRecent(memoId);
    setNote(`Attached "${clip(label, 24)}" to choice.`);
  };

  const COL = "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg";
  const HEAD = "flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider";
  return (
    <div className={popped ? "flex h-full w-full flex-col" : "absolute inset-0 z-[60] flex flex-col"} style={{ background: "rgba(6,10,20,0.98)", color: NEON.text }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <div className="flex items-center gap-2 text-[14px] font-bold uppercase tracking-[0.18em]" style={{ color: NEON.yellow }}><ListChecks className="h-4 w-4" /> CEQ Studio</div>
        <div className="flex items-center gap-2">
          {note && <span className="text-[10px]" style={{ color: NEON.muted }}>{note}</span>}
          <button className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: shortsList.length ? "#0B0F1E" : NEON.muted, background: shortsList.length ? "#FF8B9E" : "transparent", border: `1px solid ${shortsList.length ? "#FF8B9E" : NEON.borderSoft}` }} title="Shorts queue — every shorts-flagged CEQ across all sets (batch-filming worklist)" onClick={() => setShortsQueueOpen(true)}>🎬 Shorts {shortsList.length > 0 && `(${shortsList.length})`}</button>
          {!popped && onPopOut && <button className="grid h-7 w-7 place-items-center rounded" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }} title="Pop out to a window (2nd monitor · capture-invisible)" onClick={onPopOut}><ExternalLink className="h-4 w-4" /></button>}
          <button className="grid h-7 w-7 place-items-center rounded" style={{ border: `1px solid ${NEON.borderSoft}` }} title="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
      </div>
      {/* TOP BAR — Videos · Topics · Sets · Tools; every tab speaks the same Obsidian
          outline grammar in the left rail. */}
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1" style={{ borderColor: NEON.borderSoft }}>
        {([["videos", "Videos"], ["topics", "Topics"], ["sets", "Sets"], ["tools", "Tools"]] as const).map(([k, l]) => (
          <button key={k} className="rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: topTab === k ? "#0B1322" : NEON.muted, background: topTab === k ? NEON.yellow : "transparent", border: `1px solid ${topTab === k ? NEON.yellow : NEON.borderSoft}` }} onClick={() => { setPrefs({ topTab: k }); if (!setsOpen) setSetsOpen(true); }}>{l}</button>
        ))}
      </div>
      {/* SET TAB STRIP — open sets are INTERNAL Studio tabs (not browser tabs); multiple
          open at once, close per-tab, last-open restored per session. */}
      {tabDecks.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-3 py-1" style={{ borderColor: NEON.borderSoft }}>
          {tabDecks.map((d) => { const on = setId === d.id; return (
            <div key={d.id} className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5" style={{ background: on ? "rgba(252,163,17,0.14)" : "rgba(0,0,0,0.25)", border: `1px solid ${on ? NEON.border : NEON.borderSoft}` }}>
              <button className="max-w-[150px] truncate text-[10px] font-semibold" style={{ color: on ? NEON.yellow : NEON.text }} onClick={() => { setSetId(d.id); setQId(null); }} title={d.name}>{d.name}</button>
              <button className="grid h-3.5 w-3.5 place-items-center" style={{ color: NEON.muted }} onClick={() => closeSetTab(d.id)} title="Close tab"><X className="h-3 w-3" /></button>
            </div>
          ); })}
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

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* LEFT RAIL — the active top-bar tab (Videos / Topics / Sets / Tools), all on
            the same Obsidian outline grammar. Collapsible to a slim strip. */}
        {!setsOpen ? (
          <button className="flex w-8 shrink-0 flex-col items-center gap-2 rounded-lg py-2" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)", color: NEON.cyan }} onClick={() => setSetsOpen(true)} title="Show the left rail">
            <ListChecks className="h-4 w-4" />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ writingMode: "vertical-rl" }}>{topTab}</span>
          </button>
        ) : (
        <div className={COL} style={{ maxWidth: 240, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
          {topTab === "videos" && <CeqVideoLibrary courses={courseOptions} costOn={!!prefs.costOn} onToggleCost={() => setPrefs({ costOn: !prefs.costOn })} />}
          {topTab === "tools" && (<>
            <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>Tools</div>
            <div className="grid flex-1 place-items-center p-3 text-center text-[10.5px] leading-relaxed" style={{ color: NEON.muted }}>🛠 Coming soon —<br />batch take ingest · publish queue ·<br />shorts factory.</div>
          </>)}
          {topTab === "topics" && (<>
            {/* TOPICS — the "is this topic FINISHED" view + THE readiness board: per-topic
                chips derived LIVE (missing clips, intro/outro/wrap, runtime, published).
                Click a chip to jump to the gap. */}
            <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>Topics <span style={{ color: NEON.muted }}>readiness</span>
              <button className="ml-auto grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={() => setSetsOpen(false)} title="Collapse the left rail"><ChevronLeft className="h-3.5 w-3.5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {courseOptions.length === 0 && <div className="px-1.5 py-2 text-[10px] italic" style={{ color: NEON.muted }}>{courseOptionsQ.isError ? "Couldn't load the Course → Topic rows." : "Loading courses…"}</div>}
              {courseOptions.map((c) => {
                const cTopics = c.chapters.filter((ch) => ch.status !== "archived" || decksByTopic.has(ch.id));
                const cHas = cardDecks.some((d) => d.courseId === c.id && !!d.topicId) || cTopics.some((ch) => pubVidsByTopic.has(ch.id));
                const cKey = `topc:${c.id}`;
                const cOpen = isExp(cKey, cHas);
                return (
                  <div key={c.id}>
                    <button className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10.5px] font-bold uppercase tracking-wide" style={{ color: cHas ? NEON.cyan : NEON.muted }} onClick={() => toggleExp(cKey, cHas)}>
                      {cOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{courseLabel(c)}</span>
                    </button>
                    {cOpen && cTopics.map((ch) => {
                      const tDecks = decksByTopic.get(ch.id) ?? [];
                      const vids = pubVidsByTopic.get(ch.id) ?? [];
                      let missFull = 0, missFree = 0, runtimeS = 0, wrapN = 0;
                      let introAll = tDecks.length > 0, outroAll = tDecks.length > 0;
                      for (const d of tDecks) { const r = deckReadiness.get(d.id); if (!r) continue; missFull += r.missFull; missFree += r.missFree; runtimeS += r.runtimeS; wrapN += r.wrapN; introAll = introAll && r.intro; outroAll = outroAll && r.outro; }
                      const firstGap = tDecks.find((d) => (deckReadiness.get(d.id)?.missFull ?? 0) > 0) ?? tDecks[0];
                      const tKey = `topt:${ch.id}`;
                      const tOpen = isExp(tKey, tDecks.length > 0);
                      return (
                        <div key={ch.id} className="ml-1.5">
                          <button className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px]" style={{ color: tDecks.length || vids.length ? NEON.text : NEON.muted }} onClick={() => toggleExp(tKey, tDecks.length > 0)}>
                            {tOpen ? <ChevronDown className="h-2.5 w-2.5 shrink-0" /> : <ChevronRight className="h-2.5 w-2.5 shrink-0" />}
                            <span className="min-w-0 flex-1 truncate">{chapterLabel(ch)}</span>
                          </button>
                          {(tDecks.length > 0 || vids.length > 0) && (
                            <div className="ml-4 flex flex-wrap items-center gap-1 pb-0.5">
                              <button className="rounded px-1 text-[7.5px] font-bold tabular-nums" style={missFull > 0 ? { color: "#FF8B9E", border: "1px solid rgba(255,92,108,0.5)" } : { color: "#3BF5A0", border: "1px solid rgba(59,245,160,0.4)" }} onClick={() => firstGap && openSetTab(firstGap.id)} title={missFull > 0 ? `${missFull} question(s) missing clips (${missFree} in the free cut) — click to open the gap` : "Every question has a clip"}>{missFull > 0 ? `✂ ${missFull} (${missFree}F)` : "✂ ✓"}</button>
                              <button className="rounded px-1 text-[7.5px] font-bold" style={introAll && outroAll ? { color: "#3BF5A0", border: "1px solid rgba(59,245,160,0.4)" } : { color: NEON.yellow, border: `1px solid ${NEON.border}` }} onClick={() => { if (tDecks[0]) { openSetTab(tDecks[0].id); setPublishOpen(true); } }} title={`Intro ${introAll ? "✓" : "✗"} · Outro ${outroAll ? "✓" : "✗"} · ${wrapN} wrap clip(s) — click to open the Publish panel`}>I{introAll ? "✓" : "✗"} O{outroAll ? "✓" : "✗"} W{wrapN}</button>
                              <span className="rounded px-1 text-[7.5px] font-bold tabular-nums" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} title="Estimated FULL runtime (summed clips)">⏱ {fmtDur(runtimeS)}</span>
                              <button className="rounded px-1 text-[7.5px] font-bold tabular-nums" style={vids.length > 0 ? { color: "#3BF5A0", border: "1px solid rgba(59,245,160,0.4)" } : { color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setPrefs({ topTab: "videos" })} title={`${vids.length} published video(s) — click for the Videos tab`}>▶ {vids.length}</button>
                            </div>
                          )}
                          {tOpen && tDecks.map((d) => renderSetRow(d))}
                          {tOpen && vids.map((v) => (
                            <div key={v.id} className="ml-4 flex items-center gap-1 px-1 py-0.5 text-[9px]" style={{ color: NEON.muted }}>
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#3BF5A0" }} />
                              <span className="min-w-0 flex-1 truncate">{v.name}</span>
                              <span className="shrink-0 text-[7px] font-bold uppercase" style={{ color: v.paid ? "#FF8B9E" : "#3BF5A0" }}>{v.paid ? "Paid" : "Free"}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </>)}
          {topTab === "sets" && (<>
          <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>Sets <span style={{ color: NEON.muted }}>({cardDecks.length})</span>
            <button className="ml-auto grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={() => setSetsOpen(false)} title="Collapse the left rail"><ChevronLeft className="h-3.5 w-3.5" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {courseOptionsQ.isLoading && <div className="px-1.5 py-2 text-[10px] italic" style={{ color: NEON.muted }}>Loading courses…</div>}
            {courseOptionsQ.isError && (
              <>
                <div className="px-1.5 py-1 text-[9.5px]" style={{ color: NEON.red }}>Couldn't load Course → Topic rows — flat list:</div>
                {cardDecks.filter((d) => !!d.topicId).map((d) => renderSetRow(d))}
              </>
            )}
            {!courseOptionsQ.isError && courseOptions.map((c) => {
              const cTopics = c.chapters.filter((ch) => ch.status !== "archived" || decksByTopic.has(ch.id));
              const cHasSets = cardDecks.some((d) => d.courseId === c.id && !!d.topicId);
              const cKey = `c:${c.id}`;
              const cOpen = isExp(cKey, cHasSets);
              return (
                <div key={c.id}>
                  <button className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10.5px] font-bold uppercase tracking-wide" style={{ color: cHasSets ? NEON.cyan : NEON.muted }} onClick={() => toggleExp(cKey, cHasSets)}>
                    {cOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{courseLabel(c)}</span>
                  </button>
                  {cOpen && cTopics.map((ch) => {
                    const tDecks = decksByTopic.get(ch.id) ?? [];
                    const tKey = `t:${ch.id}`;
                    const tOpen = isExp(tKey, tDecks.length > 0);
                    const dropOn = dragKey === `sett:${ch.id}`;
                    return (
                      <div key={ch.id} className="ml-2">
                        <button className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px]" style={{ color: tDecks.length ? NEON.text : NEON.muted, background: dropOn ? "rgba(252,163,17,0.16)" : "transparent", outline: dropOn ? `1px dashed ${NEON.yellow}` : "none" }}
                          onClick={() => toggleExp(tKey, tDecks.length > 0)}
                          onDragOver={(e) => { if (e.dataTransfer.types.includes(SET_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragKey !== `sett:${ch.id}`) setDragKey(`sett:${ch.id}`); } }}
                          onDragLeave={() => setDragKey((k) => (k === `sett:${ch.id}` ? null : k))}
                          onDrop={(e) => { const id = e.dataTransfer.getData(SET_DND); if (id) { e.preventDefault(); setDragKey(null); assignSet(id, c, ch); } }}
                          title={`${chapterLabel(ch)} — drop a set here to assign it`}>
                          {tOpen ? <ChevronDown className="h-2.5 w-2.5 shrink-0" /> : <ChevronRight className="h-2.5 w-2.5 shrink-0" />}
                          <span className="min-w-0 flex-1 truncate">{chapterLabel(ch)}</span>
                          {tDecks.length > 0 && <span className="shrink-0 text-[8px] font-bold tabular-nums" style={{ color: NEON.muted }}>{tDecks.length}</span>}
                        </button>
                        {tOpen && tDecks.map((d) => renderSetRow(d))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {/* LIBRARY (unassigned) — untied sets; also a drop target to unassign. */}
            {!courseOptionsQ.isError && (
              <div className="mt-1 border-t pt-1" style={{ borderColor: NEON.borderSoft }}>
                <button className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10.5px] font-bold uppercase tracking-wide" style={{ color: libraryDecks.length ? NEON.yellow : NEON.muted, background: dragKey === "sett:lib" ? "rgba(252,163,17,0.16)" : "transparent", outline: dragKey === "sett:lib" ? `1px dashed ${NEON.yellow}` : "none" }}
                  onClick={() => toggleExp("lib", true)}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes(SET_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragKey !== "sett:lib") setDragKey("sett:lib"); } }}
                  onDragLeave={() => setDragKey((k) => (k === "sett:lib" ? null : k))}
                  onDrop={(e) => { const id = e.dataTransfer.getData(SET_DND); if (id) { e.preventDefault(); setDragKey(null); assignSet(id, null, null); } }}
                  title="Unassigned sets — drop a set here to return it to the Library">
                  {isExp("lib", true) ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">Library (unassigned)</span>
                  <span className="shrink-0 text-[8px] font-bold tabular-nums" style={{ color: NEON.muted }}>{libraryDecks.length}</span>
                </button>
                {isExp("lib", true) && libraryDecks.map((d) => renderSetRow(d))}
                {isExp("lib", true) && libraryDecks.length === 0 && <div className="ml-4 px-1 py-0.5 text-[9px] italic" style={{ color: NEON.muted }}>Empty — every set has a topic.</div>}
              </div>
            )}
          </div>
          {newSetForm ? (
            <div className="m-1 flex flex-col gap-1 rounded p-1.5" style={{ border: `1px dashed ${NEON.borderSoft}` }}>
              <input autoFocus className="nodrag rounded bg-black/40 px-1.5 py-0.5 text-[10.5px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} placeholder="Set name…" value={newSetForm.name} onChange={(e) => setNewSetForm({ ...newSetForm, name: e.target.value })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") createSet(); else if (e.key === "Escape") setNewSetForm(null); }} />
              <select value={newSetForm.courseId} onChange={(e) => setNewSetForm({ ...newSetForm, courseId: e.target.value, topicId: "" })} className="rounded bg-black/40 px-1 py-0.5 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}>
                <option value="">Library (unassigned)</option>
                {courseOptions.map((c) => <option key={c.id} value={c.id}>{courseLabel(c)}</option>)}
              </select>
              {newSetForm.courseId && (
                <select value={newSetForm.topicId} onChange={(e) => setNewSetForm({ ...newSetForm, topicId: e.target.value })} className="rounded bg-black/40 px-1 py-0.5 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}>
                  <option value="">pick a topic…</option>
                  {courseOptions.find((c) => c.id === newSetForm.courseId)?.chapters.filter((ch) => ch.status !== "archived").map((ch) => <option key={ch.id} value={ch.id}>{chapterLabel(ch)}</option>)}
                </select>
              )}
              <div className="flex items-center gap-1">
                <button className="flex-1 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase disabled:opacity-40" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} disabled={!newSetForm.name.trim() || (!!newSetForm.courseId && !newSetForm.topicId)} onClick={createSet}>create</button>
                <button className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setNewSetForm(null)}>✕</button>
              </div>
            </div>
          ) : (
            <button className="m-1 flex items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => setNewSetForm({ name: `Set ${cardDecks.length + 1}`, courseId: "", topicId: "" })}><Plus className="h-3 w-3" /> new set</button>
          )}
          <button className="mx-1 mb-1 flex items-center justify-center gap-1 rounded px-1 py-1 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={runSeed} title="Create the Ch 1–5 CEQ sets (Free + Full each) — mechanical stems/choices, empty chains. Idempotent.">seed Ch 1–5</button>
          </>)}
        </div>
        )}

        {/* PANE 2 — QUESTIONS + editor */}
        <div className={COL} style={{ flex: 1.4, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
          <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>
            <span className="truncate">Questions {deck && <span style={{ color: NEON.muted }}>· {deck.name}</span>}</span>
            {deck && <span className="shrink-0 text-[8.5px] font-bold tabular-nums" style={{ color: NEON.muted }} title="Free-flagged CEQs · all CEQs">Free {freeCount} · Full {questions.length}</span>}
            {deck && <span className="shrink-0 text-[8.5px] tabular-nums" style={{ color: NEON.cyan }} title="Estimated runtime = summed durations of the stitch clips (intro + transition + takes + outro)">~{fmtDur(stitchRuntime(stitchFree.items))}/{fmtDur(stitchRuntime(stitchFull.items))}</span>}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {deck && (starOnly || starCount > 0) && <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: starOnly ? "#0B1322" : "#FFD23F", background: starOnly ? "#FFD23F" : "transparent", border: `1px solid ${starOnly ? "#FFD23F" : NEON.borderSoft}` }} onClick={() => setStarOnly((v) => !v)} title="Show only STARRED questions (performer's notes)">★ {starCount}</button>}
              {deck && starCount > 0 && <button className="rounded px-1 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={clearAllStars} title="Clear ALL stars in this set (confirm)">clear ★</button>}
              {deck && <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setStitchMode("full")} title="Sequential rhythm preview — plays the Free/Full stitch list back-to-back (no render)"><Play className="h-3 w-3" /> preview</button>}
              {deck && <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: publishOpen ? "#0B0F1E" : "#3BF5A0", background: publishOpen ? "#3BF5A0" : "transparent", border: "1px solid rgba(59,245,160,0.5)" }} onClick={() => setPublishOpen(true)} title="Publish panel — Publish Free / Full, the lookback vertical, and the intro/transition/outro/wrap clips (one home)">{publishBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />} Publish</button>}
              {deck && <button className="grid h-5 w-5 place-items-center rounded" style={{ color: wrapStems ? NEON.yellow : NEON.muted, border: `1px solid ${wrapStems ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` }} onClick={() => setPrefs({ wrapStems: !wrapStems })} title="Wrap question text ↔ clamp to 2 lines"><WrapText className="h-3 w-3" /></button>}
              {deck && selChainMemos.size > 0 && <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={copyMemos} title="Copy the selected memos (Ctrl+C)"><Copy className="h-3 w-3" /> copy {selChainMemos.size}</button>}
              {deck && memoClip.length > 0 && qId && <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => pasteMemos(qId)} title="Paste the copied memos into this question (Ctrl+V)"><ClipboardPaste className="h-3 w-3" /> paste {memoClip.length}</button>}
              {deck && <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={dealIntoFrame} title="Deal this set into the frame you're in (stack; Space flips, Enter-walks chains)"><Film className="h-3 w-3" /> deal into frame</button>}
            </div>
          </div>
          {!deck ? (
            <div className="grid flex-1 place-items-center text-[11px]" style={{ color: NEON.muted }}>Pick or create a set on the left.</div>
          ) : (
            <div className="flex min-h-0 flex-1">
              {/* OUTLINE — CEQ → its chain memos. Each row is a TAKE drop target. */}
              <div className="min-h-0 w-56 shrink-0 overflow-y-auto border-r p-1" style={{ borderColor: NEON.borderSoft }}>
                {/* BATCH TAKE INGEST — drop a whole filming session; a CONFIRM table
                    gates every upload (nothing touches storage until confirmed). */}
                <div className="mb-1 rounded border border-dashed px-1.5 py-1 text-center text-[8.5px] leading-snug" style={{ borderColor: dragKey === "ingest" ? NEON.yellow : NEON.borderSoft, color: NEON.muted, background: dragKey === "ingest" ? "rgba(252,163,17,0.12)" : "transparent", cursor: "pointer" }}
                  onClick={() => ingestFileRef.current?.click()}
                  onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); if (dragKey !== "ingest") setDragKey("ingest"); } }}
                  onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragKey((k) => (k === "ingest" ? null : k)); }}
                  onDrop={(e) => { e.preventDefault(); setDragKey(null); void matchIngest(videosFromDrop(e)); }}
                  title="Batch takes — drop multiple clips (or click to browse); a confirm table opens before anything uploads">
                  ⬇ <b>batch takes</b> — drop clips here<br /><span style={{ opacity: 0.7 }}>name clips 01, 02… or q1.03 for auto-match</span>
                  <input ref={ingestFileRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void matchIngest(fs); }} />
                </div>
                {/* BULK ACTION BAR — appears with a selection; every action is ONE
                    undoable composite step across the selected questions. */}
                {qSel.size > 0 && (
                  <div className="mb-1 flex flex-wrap items-center gap-1 rounded p-1" style={{ background: "rgba(252,163,17,0.08)", border: `1px solid ${NEON.border}` }}>
                    <span className="px-0.5 text-[8.5px] font-bold uppercase tabular-nums" style={{ color: NEON.yellow }}>{qSel.size} sel</span>
                    <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: "#FFD23F", border: `1px solid ${NEON.borderSoft}` }} onClick={bulkStar} title="Star / unstar all selected (one undo)">★</button>
                    <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={bulkFree} title="Add/remove all selected from the FREE cut (one undo)">F</button>
                    <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={bulkBoss} title="Boss flag on/off for all selected (one undo)">👑</button>
                    <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={bulkChaching} title="Chaching-on-correct on/off for all selected (one undo)">🪙</button>
                    <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: "#FF8B9E", border: `1px solid ${NEON.borderSoft}` }} onClick={bulkShort} title="Shorts flag on/off for all selected (one undo)">🎬</button>
                    <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.red, border: `1px solid ${NEON.borderSoft}` }} onClick={bulkClearClips} title="Clear ALL clips from the selected questions (confirm; one undo)">✂ clear</button>
                    <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={bulkSwapPrev} title="Swap every clip to its PREVIOUS version where one exists (one undo)">⇄ prev</button>
                    <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={bulkVinylLast} title="Vinyl scratch on the LAST chain item of each selected question's correct-choice chain (skips chainless; one undo)">💿 last</button>
                    {(() => { const tpls = listChainTemplates(); return tpls.length > 0 ? (
                      <select value="" onChange={(e) => { if (e.target.value) applyTemplateToSelection(e.target.value); }} className="rounded bg-black/40 px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} title="Stamp a chain template onto selected questions with NO chains yet (never overwrites; slots land at the baseline)">
                        <option value="">template…</option>
                        {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : null; })()}
                    <button className="ml-auto rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setQSel(new Set())} title="Clear selection (Esc)">✕</button>
                  </div>
                )}
                {/* QUESTION 0 — the set's LAYOUT as an editable stage. Never films,
                    never stitches, never counts in Free/Full, never deals. */}
                <div className="mb-0.5 flex items-center gap-1 rounded px-1 py-0.5" style={{ background: qId === LAYOUT_Q0 ? "rgba(252,163,17,0.14)" : "transparent", border: `1px solid ${qId === LAYOUT_Q0 ? NEON.border : NEON.borderSoft}` }}>
                  <LayoutGrid className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} />
                  <button className="min-w-0 flex-1 truncate text-left text-[10.5px] font-bold" style={{ color: qId === LAYOUT_Q0 ? NEON.yellow : NEON.text }} onClick={() => setQId(LAYOUT_Q0)} title="Question 0 — sculpt the baseline: drag the LAYOUT card + memo slots and every question deals there. Not content: never films, stitches or counts.">0 · Layout</button>
                  <span className="shrink-0 text-[8px] font-bold tabular-nums" style={{ color: NEON.muted }} title="Baseline memo slots">{deck.layout?.memoSlots?.length ?? 0} slots</span>
                </div>
                {questions.length === 0 && <div className="px-1 py-1 text-[9.5px] italic" style={{ color: NEON.muted }}>No questions — add one below.</div>}
                {questions.map((q, i) => { const qdata = rf.getNode(q.id)?.data as unknown as CeqCard | undefined; if (starOnly && !qdata?.starred) return null; const p = qdata?.prompt || "Question"; const expanded = expandedQ.has(q.id); const walk = expanded ? walkOf(q) : []; const clips = cardClips(qdata); const starred = !!qdata?.starred; const chained = (qdata?.choices ?? []).some((c) => (c.chain?.length ?? 0) > 0); const boss = !!qdata?.boss; const chainSound = (qdata?.choices ?? []).some((c) => (c.chain ?? []).some((it) => !!it.sound)); const chachingOff = qdata?.confirmSfx === false; const isShort = !!qdata?.short; const dropOn = dragKey === q.id; const reOn = dragKey === `qre:${q.id}`; return (
                  <div key={q.id}>
                    <div className="flex items-start gap-0.5 rounded py-0.5" style={{ background: dropOn ? "rgba(252,163,17,0.14)" : undefined, outline: dropOn ? `1px dashed ${NEON.yellow}` : reOn ? `1px solid ${NEON.cyan}` : undefined }} {...qRowDnd(q.id)}>
                      <button className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center" style={{ color: qSel.has(q.id) ? NEON.yellow : NEON.muted }} onClick={(e) => toggleQSel(q.id, e.shiftKey)} title="Select for bulk actions (Shift+click = range · Esc clears)">{qSel.has(q.id) ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}</button>
                      <span className="mt-0.5 shrink-0 cursor-grab select-none text-[11px] leading-none" style={{ color: NEON.muted }} draggable onDragStart={(e) => { e.dataTransfer.setData(QREORDER, q.id); e.dataTransfer.effectAllowed = "move"; }} title="Drag to reorder">⠿</span>
                      <button className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center" style={{ color: NEON.muted }} onClick={() => setExpandedQ((s) => { const n = new Set(s); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })} title={expanded ? "Collapse memos" : "Show memos"}>{expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</button>
                      <button className={`min-w-0 flex-1 rounded px-1 py-0.5 text-left text-[10.5px] ${wrapStems ? "whitespace-normal break-words" : "line-clamp-2"}`} style={{ background: qId === q.id ? "rgba(252,163,17,0.14)" : "transparent", color: qId === q.id ? NEON.yellow : NEON.text }} onClick={() => { setQId(q.id); setExpandedQ((s) => new Set(s).add(q.id)); }}><span className="tabular-nums opacity-60">{i + 1}.</span> {p}</button>
                      {chained && <span className="mt-0.5 shrink-0" title="Has ≥1 chain item"><Lightbulb className="h-3 w-3" style={{ color: "rgba(252,163,17,0.55)" }} /></span>}
                      {boss && <span className="mt-0.5 shrink-0 text-[10px] leading-none" title="Boss card — cram launch fires when this question is dealt (film)">👑</span>}
                      {chainSound && <span className="mt-0.5 shrink-0 text-[9px] leading-none" title="A chain item has a reveal sound">🔊</span>}
                      {chachingOff && <span className="mt-0.5 shrink-0 text-[9px] leading-none" title="Chaching-on-correct silenced for this question">🔇</span>}
                      {isShort && <span className="mt-0.5 shrink-0 text-[9px] leading-none" title={`Shorts-worthy${qdata?.shortNote ? ` — ${qdata.shortNote}` : ""}`}>🎬</span>}
                      <button className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center text-[11px] leading-none" style={{ color: starred ? "#FFD23F" : NEON.muted }} onClick={() => patchQ(q.id, { starred: !starred })} title={starred ? "Starred — a performer's note (affects nothing). Click to unstar." : "Star this question — a performer's note; NO effect on spacewalk / stitch / publish"}>{starred ? "★" : "☆"}</button>
                      {qdata?.free && <span className="mt-0.5 shrink-0 rounded text-[8px] font-black" style={{ color: "#3BF5A0" }} title="In the FREE cut">F</span>}
                      <button className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center" onClick={() => setTakePreview((k) => (k === q.id ? null : q.id))} title={clips.length ? `${clips.length} clip${clips.length === 1 ? "" : "s"} — click to manage the stack · drop a video to append a lookback` : "Drop a video clip here to add this question's base take"}>{takeBusy === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: NEON.cyan }} /> : clips.length ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#3BF5A0" }} /> : <Circle className="h-3.5 w-3.5" style={{ color: NEON.muted }} />}</button>
                      {clips.length > 1 && <span className="mt-0.5 shrink-0 text-[8px] font-bold tabular-nums" style={{ color: "#3BF5A0" }} title={`${clips.length} clips (base + ${clips.length - 1} lookback)`}>{clips.length}</span>}
                      <button className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-[12px] font-black leading-none" style={{ color: qMenu === q.id ? NEON.yellow : NEON.muted, background: qMenu === q.id ? "rgba(252,163,17,0.14)" : "transparent" }} onClick={() => setQMenu((k) => (k === q.id ? null : q.id))} title="More — free · duplicate · delete">⋯</button>
                    </div>
                    {qMenu === q.id && (
                      <div className="mb-1 ml-6 flex flex-col gap-0.5 rounded p-1" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}>
                        <button className="rounded px-1.5 py-0.5 text-left text-[10px] font-bold" style={{ color: qdata?.free ? "#3BF5A0" : NEON.text }} onClick={() => patchQ(q.id, { free: !qdata?.free })}>{qdata?.free ? "✓ In free cut — remove" : "Add to free cut"}</button>
                        <button className="rounded px-1.5 py-0.5 text-left text-[10px] font-bold" style={{ color: NEON.text }} onClick={() => { duplicateQuestion(q.id); setQMenu(null); }}>Duplicate below</button>
                        <button className="rounded px-1.5 py-0.5 text-left text-[10px] font-bold" style={{ color: NEON.red }} onClick={() => { deleteQuestion(q.id); setQMenu(null); }}>Delete question</button>
                      </div>
                    )}
                    {takePreview === q.id && (
                      <div className="my-1 ml-4 flex flex-col gap-1">
                        {clips.length === 0 && <div className="text-[8.5px] italic" style={{ color: NEON.muted }}>No clips yet — drop a video on this row to add the base explanation.</div>}
                        {clips.map((t, ci) => { const rk = `${q.id}:${ci}`; const refsOpen = clipRefsOpen === rk; return (
                          <div key={t.path} className="flex flex-col gap-0.5 rounded p-1" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}` }}>
                            <div className="flex items-center gap-1 text-[8.5px]" style={{ color: NEON.muted }}>
                              <span className="shrink-0 rounded px-1 font-bold uppercase" style={{ color: ci === 0 ? "#3BF5A0" : NEON.cyan, border: `1px solid ${NEON.borderSoft}` }}>{ci === 0 ? "base" : `L${ci}`}</span>
                              <span className="min-w-0 flex-1 truncate" title={t.name}>{t.name || "clip"} · {fmtDur(t.duration)}</span>
                              <button disabled={ci === 0} className="grid h-4 w-4 place-items-center disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => reorderClip(q.id, ci, -1)} title="Move earlier"><ArrowUp className="h-3 w-3" /></button>
                              <button disabled={ci === clips.length - 1} className="grid h-4 w-4 place-items-center disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => reorderClip(q.id, ci, 1)} title="Move later"><ArrowDown className="h-3 w-3" /></button>
                              <button className="grid h-4 place-items-center rounded px-0.5 text-[8px] font-bold" style={{ color: (t.refs?.length || refsOpen) ? NEON.yellow : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setClipRefsOpen((k) => (k === rk ? null : rk))} title="References earlier questions (lookback)">↩{t.refs?.length ? t.refs.length : ""}</button>
                              <button className="grid h-4 w-4 place-items-center" style={{ color: NEON.red }} onClick={() => removeClip(q.id, ci)} title="Remove this clip"><X className="h-3 w-3" /></button>
                            </div>
                            <video src={t.url} controls playsInline preload="none" className="w-full rounded" style={{ background: "#000", aspectRatio: "16 / 9" }} />
                            {refsOpen && (
                              <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded p-1" style={{ background: "rgba(0,0,0,0.3)" }}>
                                <div className="text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>References — earlier questions this clip reviews</div>
                                {questions.filter((qq) => qq.id !== q.id).map((qq) => { const on = (t.refs ?? []).includes(qq.id); const qp = (rf.getNode(qq.id)?.data as unknown as CeqCard | undefined)?.prompt || "Question"; return (
                                  <button key={qq.id} className="flex items-center gap-1 truncate text-left text-[9px]" style={{ color: on ? NEON.yellow : NEON.text }} onClick={() => setClipRefs(q.id, ci, on ? (t.refs ?? []).filter((x) => x !== qq.id) : [...(t.refs ?? []), qq.id])}>{on ? "☑" : "☐"} {clip(qp, 44)}</button>
                                ); })}
                              </div>
                            )}
                          </div>
                        ); })}
                        <div className="text-[8px] italic" style={{ color: NEON.muted }}>Drop a video on the row to append a lookback clip. {clips.length > 0 && <button className="ml-1" style={{ color: NEON.red }} onClick={() => clearTake(q.id)} title="Remove all clips">clear all</button>}</div>
                      </div>
                    )}
                    {expanded && walk.map((w) => { const msel = selChainMemos.has(w.memoNodeId); const ek = `${q.id}|${w.choiceId}|${w.idx}`; const vinyl = w.sound === "vinylScratch"; return (
                      <div key={`${w.choiceId}-${w.idx}`} className="ml-3 flex items-center gap-0.5 rounded py-0.5 text-[9.5px]" style={{ background: msel ? "rgba(79,163,227,0.18)" : "transparent" }}>
                        <button className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[7.5px] font-black" style={{ color: "#0B0F1E", background: msel ? NEON.cyan : NEON.yellow }} onClick={() => toggleChainSel(w.memoNodeId)} title="Select for copy (Ctrl+C) — click to toggle">{w.num}</button>
                        {editChain === ek ? (
                          <input autoFocus className="nodrag min-w-0 flex-1 rounded bg-black/40 px-1 text-[9.5px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.border}` }} value={editChainVal} onChange={(e) => setEditChainVal(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitEditChain(q.id, w.choiceId, w.idx, w.memoNodeId, editChainVal); else if (e.key === "Escape") { setEditChain(null); setEditChainVal(""); } }} onBlur={() => commitEditChain(q.id, w.choiceId, w.idx, w.memoNodeId, editChainVal)} />
                        ) : (
                          <span className="min-w-0 flex-1 cursor-text truncate" style={{ color: NEON.text }} title={`Choice ${w.letter}: ${w.label} — double-click to rename`} onDoubleClick={() => { setEditChain(ek); setEditChainVal(w.label); }}>{w.label}</span>
                        )}
                        {/* VINYL on entry (Lee) — one-click reveal-sound toggle; the full sound picker lives in the chain editor. */}
                        <button className="grid h-3.5 w-3.5 shrink-0 place-items-center" style={{ color: vinyl ? NEON.yellow : NEON.muted, opacity: vinyl ? 1 : 0.45 }} onClick={() => setChainSound(q.id, w.choiceId, w.idx, vinyl ? undefined : "vinylScratch")} title={vinyl ? "💿 Vinyl scratch plays on this item's reveal (film) — click to remove" : "Play the vinyl scratch on this item's reveal (film)"}>💿</button>
                        <button disabled={w.idx === 0} className="grid h-3.5 w-3.5 place-items-center disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => reorderChainMemo(q.id, w.choiceId, w.idx, -1)} title="Earlier in walk"><ArrowUp className="h-2.5 w-2.5" /></button>
                        <button className="grid h-3.5 w-3.5 place-items-center" style={{ color: NEON.muted }} onClick={() => reorderChainMemo(q.id, w.choiceId, w.idx, 1)} title="Later in walk"><ArrowDown className="h-2.5 w-2.5" /></button>
                        <button className="grid h-3.5 w-3.5 place-items-center" style={{ color: NEON.red }} onClick={() => removeFromChain(q.id, w.memoNodeId)} title="Remove from chain (keeps the memo in the library)"><X className="h-2.5 w-2.5" /></button>
                      </div>
                    ); })}
                  </div>
                ); })}
                <button className="mt-1 flex w-full items-center justify-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={addQuestion}><Plus className="h-3 w-3" /> question</button>
              </div>
              {/* (SET CLIPS moved to the Publish panel — one home for the publish path.) */}
              {publishOpen && deck && (
                <div className="absolute inset-0 z-[72] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.6)" }} onClick={() => setPublishOpen(false)}>
                  <div className="mt-8 flex max-h-[85vh] w-[440px] max-w-[94vw] flex-col overflow-hidden rounded-xl shadow-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
                      <Film className="h-4 w-4" style={{ color: "#3BF5A0" }} />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Publish — {deck.name}</span>
                      <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setPublishOpen(false)} title="Close"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {!deck.topicId ? (
                      <div className="px-1 py-4 text-center text-[11px] italic" style={{ color: NEON.muted }}>Library set — assign it to a Course → Topic (drag it in the Sets outline, or 📁 on its row) to unlock publishing.</div>
                    ) : (<>
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
                    { label: "Transition", kind: "transition", key: "transition", local: gc.transition, global: undefined as TakeRef | undefined, onFile: (f: File) => dropSlot("transition", f) },
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
                <div className="min-h-0 flex-1">
                  {stitchMode ? (
                    <CeqStitch free={stitchFree.items} full={stitchFull.items} freeMissing={stitchFree.missing} fullMissing={stitchFull.missing} initialMode={stitchMode} onExit={() => setStitchMode(null)} onJumpCeq={(id) => setQId(id)} />
                  ) : (
                    <CeqPreviewer ceqId={qId} mainRf={rf} mainSig={ceqSig} frameW={frameW} frameH={frameH} chainEdges={previewEdges} baseline={deck?.layout} world={deck?.world} worldIntensity={deck?.worldIntensity} worldMotion={deck?.worldMotion} onSaveBaseline={(l) => { if (deck) saveBaselineLayout(deck.id, l); }} onSetWorld={(w) => { if (deck) { setDecks((prev) => updateDeck(prev, deck.id, { world: w })); setNote(w ? `Visual world set for this set — shows in the previewer + film mode.` : "Cleared the set's visual world."); } }} onPatchChainItem={(memoNodeId, patch) => { if (qId) patchChainItem(qId, memoNodeId, patch); }} onAttachMemo={(choiceId, memoId) => { if (qId) attachMemoToChoice(qId, choiceId, memoId); }} deckCeqIds={questions.map((q) => q.id)} onSelectQuestion={(id) => { setQId(id); setExpandedQ((s) => new Set(s).add(id)); }} onCopyItems={copyItems} onPasteItems={pasteItems} hasItemsClip={itemsClip.length} onSendToStarred={sendToStarred} onCopyStyleToSet={applyStyleToSet} starredCount={starCount} layoutMode={qId === LAYOUT_Q0} onAddMemoAtChoice={(choiceId, text, category) => { if (qId && qId !== LAYOUT_Q0) createMemoChained(qId, choiceId, text, category); }} onAddMemoAt={addMemoAt} onSelectMemo={setPreviewSelMemo} onNextQuestion={() => gotoQuestion(1)} onPrevQuestion={() => gotoQuestion(-1)} />
                  )}
                </div>
                {qd && (
                  <div className="shrink-0 border-t" style={{ borderColor: NEON.borderSoft }}>
                    <div className="flex items-center gap-1 px-2 py-1">
                      <button className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }} onClick={() => setEditorOpen((v) => !v)}>{editorOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} edit stem & choices</button>
                      {/* SOUND FLAGS (sound pass) — Boss (cram-launch on deal) + Chaching on correct (opt-out). */}
                      <button className="ml-2 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: qd.starred ? "#0B1322" : NEON.muted, background: qd.starred ? "#FFD23F" : "transparent", border: `1px solid ${qd.starred ? "#FFD23F" : NEON.borderSoft}` }} onClick={() => patchQ(qId!, { starred: !qd.starred })} title="Star — a performer's note. Inert: NO effect on spacewalk / stitch / publish.">{qd.starred ? "★" : "☆"} Star</button>
                      <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: qd.boss ? "#0B0F1E" : NEON.muted, background: qd.boss ? NEON.yellow : "transparent", border: `1px solid ${qd.boss ? NEON.yellow : NEON.borderSoft}` }} onClick={() => patchQ(qId!, { boss: !qd.boss })} title="Boss card — fires the cram-launch cue when this question is dealt (film)">👑 Boss</button>
                      <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: qd.confirmSfx === false ? NEON.muted : "#3BF5A0", border: `1px solid ${qd.confirmSfx === false ? NEON.borderSoft : "rgba(59,245,160,0.5)"}` }} onClick={() => patchQ(qId!, { confirmSfx: qd.confirmSfx === false })} title="Chaching on correct — plays by DEFAULT on the correct-Enter (film); click to silence it for this question (opt-out)">Chaching on correct {qd.confirmSfx === false ? "✗" : "✓"}</button>
                      {/* SHORTS-WORTHY (verticals) — flag + optional one-line angle (note row below). */}
                      <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: qd.short ? "#0B0F1E" : NEON.muted, background: qd.short ? "#FF8B9E" : "transparent", border: `1px solid ${qd.short ? "#FF8B9E" : NEON.borderSoft}` }} onClick={() => patchQ(qId!, { short: !qd.short })} title="Flag this CEQ as shorts-worthy — it joins the Shorts queue worklist">🎬 Short</button>
                      <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setChainFor(qId)} title="Per-choice chains + save/load template (same model as the card popover)"><Link2 className="h-3 w-3" /> chains & templates</button>
                    </div>
                    {qd.short && (
                      <div className="flex items-center gap-1.5 px-2 pb-1">
                        <span className="shrink-0 text-[8px] font-bold uppercase" style={{ color: "#FF8B9E" }}>Short angle</span>
                        <input className="nodrag min-w-0 flex-1 rounded bg-black/30 px-1.5 py-0.5 text-[10px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} value={qd.shortNote ?? ""} onChange={(e) => patchQ(qId!, { shortNote: e.target.value })} placeholder="one-line angle (e.g. the contra trap)" onKeyDown={(e) => e.stopPropagation()} />
                      </div>
                    )}
                    {editorOpen && (
                      <div className="max-h-[38vh] overflow-y-auto px-2 pb-2">
                        <div className="flex flex-col gap-2">
                          <textarea rows={2} className="nodrag w-full resize-none rounded px-2 py-1.5 text-[13px] outline-none" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={qd.prompt} onChange={(e) => patchQ(qId!, { prompt: e.target.value })} placeholder="The question stem…" />
                          <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Choices — click ○ to mark correct · +💡 or drop a memo to chain it</div>
                          {qd.choices.map((ch, ci) => (
                            <div key={ch.id} className="flex items-center gap-1 rounded px-1 py-0.5" style={{ border: `1px solid ${ch.correct ? "rgba(59,245,160,0.5)" : NEON.borderSoft}` }}
                              onDragOver={(e) => { if (e.dataTransfer.types.includes(MEMO_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                              onDrop={(e) => { const mid = e.dataTransfer.getData(MEMO_DND); if (mid) { e.preventDefault(); attachMemoToChoice(qId!, ch.id, mid); } }}>
                              <button className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] font-black" style={{ color: ch.correct ? "#0B0F1E" : NEON.muted, background: ch.correct ? "#3BF5A0" : "transparent", border: `1px solid ${ch.correct ? "#3BF5A0" : NEON.borderSoft}` }} onClick={() => setCorrect(qId!, ch.id)} title="Mark correct">{LETTER(ci)}</button>
                              <input className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" style={{ color: NEON.text }} value={ch.text} onChange={(e) => patchChoice(qId!, ch.id, { text: e.target.value })} placeholder={`Choice ${LETTER(ci)}`} />
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
        </div>

        {/* PANE 3 — MEMO LIBRARY (collapsible to a thin rail to give the previewer room) */}
        {!libOpen ? (
          <button className="flex w-8 shrink-0 flex-col items-center gap-2 rounded-lg py-2" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)", color: NEON.cyan }} onClick={() => setLibOpen(true)} title="Show the memo library">
            <Library className="h-4 w-4" />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ writingMode: "vertical-rl" }}>Memos ({memos.length})</span>
          </button>
        ) : (
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
            {[...MEMO_CATEGORIES, NONE].map((c) => { const on = catFilter.has(c); return (
              <button key={c} className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: on ? "#0B1322" : NEON.muted, background: on ? NEON.yellow : "transparent", border: `1px solid ${on ? NEON.yellow : NEON.borderSoft}` }} onClick={() => toggleCat(c)}>{c === NONE ? "Unfiled" : c}</button>
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
            {shownMemos.map((m) => { const on = sel.has(m.id); const uses = usageOf(m.id); const editing = editMemo === m.id; const picked = m.id === previewSelMemo; return (
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
                <button className="shrink-0 rounded px-1 text-[7.5px] font-bold uppercase" style={{ color: m.category ? NEON.cyan : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => cycleCategory(m.id, m.category)} title={`Category: ${m.category || "unfiled"} — click to cycle (${MEMO_CATEGORIES.join(" → ")})`}>{m.category === "ELEMENT" ? "🧩" : m.category ? m.category.slice(0, 4) : "UNF"}</button>
                <button className="shrink-0" style={{ color: NEON.muted }} onClick={() => duplicateMemo(m.id)} title="Duplicate this memo (a linked copy, opens for editing)"><Copy className="h-3 w-3" /></button>
                <button className="shrink-0" style={{ color: NEON.red }} onClick={() => deleteMemos([m.id])} title="Delete this memo from the library (also unchains it)"><X className="h-3 w-3" /></button>
              </div>
            ); })}
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
              <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Batch takes — {deck.name}</span>
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
      {chainFor && <CeqChainEditor nodeId={chainFor} onClose={() => setChainFor(null)} />}
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
