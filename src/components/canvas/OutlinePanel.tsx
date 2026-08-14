// OUTLINE = the Studio's left navigation. Four sections, accordion (one open at a time, the open
// one persisted): VIDEOS (finished/published) · TOPICS · CAMPUSES · MEMOS (opens the memo library
// on the right; it no longer renders by default). Navigation only — all editing happens in the
// canvas / Studio. Intro 1 is the focus course (full-color, editable topics); Intro 2 / IA1 / IA2
// render muted (view-only) beneath it. "Topic" IS a `chapters` row.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNodes } from "@xyflow/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Building2, ChevronDown, ChevronRight, Circle, Eye, EyeOff, GraduationCap, GripVertical, Layers, MessageSquare, Plus, Search, Video, X } from "lucide-react";

import { NEON } from "./theme";
import { CeqVideoLibrary } from "./CeqVideoLibrary";
import { useFrameNav } from "./FrameNavContext";
import { useDecks } from "./DecksContext";
import type { CardNode, DeckDef, LessonBox } from "./types";
import { courseLabel, fetchCourseOptions, topicLabel, type CourseOption } from "@/lib/je-api";
import { createChapter, listAllCardDecks, renameChapter, reorderChapters, setChapterParked, setChapterStatus } from "@/lib/canvas.functions";
import { snapshotDefaultFromOleMiss, type SnapshotDiff } from "@/lib/default-map.functions";
import { copyResolvedIntoLevel, getMapMeta, listTextbooks, registerMapLevel, revertMapToInherited, saveTextbook, setChapterLabelsOn, setMapStatus, type RevertDiff } from "@/lib/map-system.functions";
import { exportCurriculumCsv, importCurriculumCsv, type CsvImportDiff } from "@/lib/curriculum-csv.functions";
import { getInboundFileUrl, listInboundFiles, seedInboundDummies, updateInboundFile, type InboundFileRow } from "@/lib/inbound-files.functions";

// PROVENANCE ARMING (Prompt 2C) — while an inbound file is "armed" (from the Inbound Files
// dashboard's "Open in mapper"), map edits + topic creations stamp its id as source_file_id.
// Module-level so scattered call sites read it at call time; the chip renders from React state.
let armedSourceFile: { id: string; label: string } | null = null;
export const getArmedSourceFileId = (): string | null => armedSourceFile?.id ?? null;
import { listCampusChapterOverrides, searchCampuses, setCampusChapterOverride, type CampusOpt } from "@/lib/campus-overrides.functions";
import {
  createCampusExam, listCampusExams, listCourseCampuses, renameCampusExam,
  setCampusExamCoverage, setCampusExamStatus, setCampusExamTopics, type CampusExamRow, type CourseCampusRow,
} from "@/lib/campus-exams.functions";

type Topic = CourseOption["chapters"][number];

// Course display order — Intro 1 (the focus) first; the rest render muted after it.
const COURSE_ORDER = ["Intro 1", "Intro 2", "IA1", "IA2"];
const courseRank = (name: string) => { const i = COURSE_ORDER.findIndex((o) => o.toLowerCase() === name.trim().toLowerCase()); return i < 0 ? COURSE_ORDER.length + 1 : i; };
const isFocusCourse = (c: CourseOption) => c.course_family === "intro_1" || courseLabel(c).trim().toLowerCase() === "intro 1";

const SEC_TARGETS = ["Ole Miss", "LSU", "Alabama", "Tennessee", "Arkansas", "South Carolina", "Georgia", "Kentucky", "Auburn", "Mississippi State", "Missouri", "Oklahoma", "Texas A&M", "Florida", "Texas", "Vanderbilt"];
const TARGET_SEARCH: Record<string, string> = { "Ole Miss": "University of Mississippi", LSU: "Louisiana State", Alabama: "University of Alabama" };

const setName = (d: DeckDef) => (d.name ?? "Set").replace(/^\s*ch\s*\d+\s*·\s*/i, "").trim() || "Set";
const LAST_SET_KEY = "sa-study-last-set";
const OPEN_SECTION_KEY = "sa-outline-open"; // persist which section is open (accordion)
const COST_KEY = "sa-outline-cost"; // Videos library $ toggle (moved here from the Studio)
type SectionId = "videos" | "topics" | "campuses";

// ---- inline text editor (add / rename) -------------------------------------------------------
// Enter commits; Esc / blur cancels. `rapid` = rapid-fire entry: after Enter the field clears and
// stays focused for the next sibling (used by "+ topic" / "+ set"). onCommit gets {shift} so a
// caller can treat Shift+Enter specially (commit-topic-then-add-child-set).
function InlineInput({ initial = "", placeholder, rapid, onCommit, onCancel }: { initial?: string; placeholder?: string; rapid?: boolean; onCommit: (v: string, opts: { shift: boolean }) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = (shift: boolean) => {
    const t = v.trim();
    if (!t) { onCancel(); return; }
    onCommit(t, { shift });
    if (rapid && !shift) { setV(""); requestAnimationFrame(() => ref.current?.focus()); } // keep open for next sibling
  };
  return (
    <input
      ref={ref} value={v} placeholder={placeholder}
      className="w-full rounded px-1.5 py-1 text-[12px] outline-none"
      style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.border}`, color: NEON.text }}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(e.shiftKey); } else if (e.key === "Escape") onCancel(); }}
      onBlur={() => { const t = v.trim(); if (t && t !== initial) onCommit(t, { shift: false }); onCancel(); }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function OutlinePanel() {
  const nodes = useNodes() as CardNode[];
  const { decks } = useDecks();
  const nav = useFrameNav();
  const courseOptionsQ = useQuery({ queryKey: ["course-options"], queryFn: () => fetchCourseOptions(), staleTime: 600_000, networkMode: "always" });
  const courseOptions = useMemo<CourseOption[]>(() => courseOptionsQ.data ?? [], [courseOptionsQ.data]);

  const courses = useMemo(() => courseOptions.slice().sort((a, b) => courseRank(courseLabel(a)) - courseRank(courseLabel(b)) || courseLabel(a).localeCompare(courseLabel(b))), [courseOptions]);
  const focus = useMemo(() => courses.find(isFocusCourse) ?? null, [courses]);

  const cardDecks = useMemo(() => decks.filter((d) => d.payloadType === "cards"), [decks]);
  // Show sets under their topic regardless of which scene they live in: merge the loaded scene's
  // LIVE decks (they win — unsaved edits stay fresh) with a read-only snapshot of every OTHER scene's
  // card decks. Purely additive — never drops the loaded scene's decks. (Lee: keep it all visible.)
  const allDecksQ = useQuery({ queryKey: ["all-card-decks"], queryFn: () => listAllCardDecks(), staleTime: 60_000, networkMode: "always" });
  const decksByTopic = useMemo(() => {
    const m = new Map<string, DeckDef[]>();
    const seen = new Set<string>();
    const push = (d: DeckDef) => { if (!d.topicId) return; const l = m.get(d.topicId) ?? []; l.push(d); m.set(d.topicId, l); seen.add(d.id); };
    for (const d of cardDecks) push(d);
    for (const d of allDecksQ.data ?? []) if (!seen.has(d.id)) push(d as unknown as DeckDef);
    return m;
  }, [cardDecks, allDecksQ.data]);

  const publishedLessonIds = useMemo(() => {
    const s = new Set<string>();
    for (const n of nodes) { if (n.type !== "lesson") continue; const d = n.data as unknown as LessonBox & { muxPlaybackId?: string }; if (d.status === "PUBLISHED" || d.muxPlaybackId) s.add(n.id); }
    return s;
  }, [nodes]);
  const isPublished = (d: DeckDef) => !!d.lessonId && publishedLessonIds.has(d.lessonId);

  /** CEQs PER SET — the outline's THIRD level (Studio Consolidation D) and the source of the set
   *  row's "n free · n" (prompt C). Ordered by stageOrder, exactly as the Studio's list was.
   *  Loaded-scene sets only: a set whose scene isn't open contributes no nodes, so it renders no
   *  counts and no children rather than a lying "0 free · 0" / an empty tree. */
  const ceqsByDeck = useMemo(() => {
    const m = new Map<string, { id: string; stem: string; free: boolean; order: number }[]>();
    for (const n of nodes) {
      if (n.type !== "ceq") continue;
      const d = n.data as unknown as { deckId?: string; free?: boolean; prompt?: string; stageOrder?: number };
      if (!d.deckId) continue;
      const l = m.get(d.deckId) ?? [];
      l.push({ id: n.id, stem: (d.prompt ?? "").trim() || "Question", free: !!d.free, order: d.stageOrder ?? 0 });
      m.set(d.deckId, l);
    }
    for (const l of m.values()) l.sort((a, b) => a.order - b.order);
    return m;
  }, [nodes]);

  // Published videos = lesson nodes with a Mux playback id (finished/published).
  const videos = useMemo(() => nodes
    .filter((n) => n.type === "lesson" && !!(n.data as { muxPlaybackId?: string }).muxPlaybackId)
    .map((n) => { const d = n.data as unknown as LessonBox & { label?: string; videoChapter?: string; topic?: string }; return { id: n.id, title: (d.label ?? "Video").trim() || "Video", topic: (d.videoChapter ?? d.topic ?? "").trim() }; })
    .sort((a, b) => a.title.localeCompare(b.title)), [nodes]);

  const lastSetId = useMemo(() => { try { return localStorage.getItem(LAST_SET_KEY); } catch { return null; } }, []);
  const openSet = (setId: string) => { try { localStorage.setItem(LAST_SET_KEY, setId); } catch { /* ignore */ } nav.openStudioSet(setId); };

  // LIBRARY (Unassigned) — sets whose topic was cleared (soft-deleted) or never assigned. Recoverable,
  // never destroyed. Shown as a muted bucket under the focus course.
  const libraryDecks = useMemo(() => {
    const seen = new Set<string>(); const out: DeckDef[] = [];
    for (const d of cardDecks) if (!d.topicId) { out.push(d); seen.add(d.id); }
    for (const d of allDecksQ.data ?? []) if (!(d as unknown as DeckDef).topicId && !seen.has(d.id)) { out.push(d as unknown as DeckDef); seen.add(d.id); }
    return out;
  }, [cardDecks, allDecksQ.data]);

  // UNDO TOAST — destructive outline actions (delete topic / delete set) leave a brief undo affordance.
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const [costOn, setCostOn] = useState(() => { try { return localStorage.getItem(COST_KEY) === "1"; } catch { return false; } });

  // Accordion — one section open at a time; the open section is persisted.
  const [open, setOpen] = useState<SectionId | null>(() => { try { return (localStorage.getItem(OPEN_SECTION_KEY) as SectionId | null) ?? null; } catch { return null; } });
  const toggle = (id: SectionId) => setOpen((cur) => { const next = cur === id ? null : id; try { next ? localStorage.setItem(OPEN_SECTION_KEY, next) : localStorage.removeItem(OPEN_SECTION_KEY); } catch { /* ignore */ } return next; });

  return (
    <div className="nodrag nowheel h-full max-h-[74vh] w-full overflow-y-auto px-1 py-1 text-[12px] [.sa-dock_&]:max-h-full" style={{ color: NEON.text }}>
      {courseOptionsQ.isLoading && <p className="px-1.5 py-2 text-[11px] italic" style={{ color: NEON.muted }}>Loading…</p>}

      <SectionHeader open={open === "videos"} onToggle={() => toggle("videos")} icon={<Video className="h-3.5 w-3.5" />} label="Videos" count={videos.length} color={NEON.yellow} />
      {open === "videos" && (
        /* The FULL video library (moved out of the Studio — the Studio has no Videos tab):
           published videos on the course→topic spine, play-in-place, cost estimates behind $. */
        <div className="ml-2 flex h-[46vh] min-h-[220px] flex-col overflow-hidden border-l pl-1.5" style={{ borderColor: NEON.borderSoft }}>
          <CeqVideoLibrary courses={courseOptions} costOn={costOn} onToggleCost={() => { const n = !costOn; setCostOn(n); try { localStorage.setItem(COST_KEY, n ? "1" : "0"); } catch { /* ignore */ } }} />
        </div>
      )}

      <SectionHeader open={open === "topics"} onToggle={() => toggle("topics")} icon={<Layers className="h-3.5 w-3.5" />} label="Topics" count={courses.length} color={NEON.cyan} />
      {open === "topics" && (
        <div className="ml-2 border-l pl-1.5" style={{ borderColor: NEON.borderSoft }}>
          {courses.length === 0 && <div className="px-1 py-1 text-[10px] italic" style={{ color: NEON.muted }}>No courses.</div>}
          {courses.map((c) => <CourseTopics key={c.id} course={c} focus={isFocusCourse(c)} decksByTopic={decksByTopic} ceqsByDeck={ceqsByDeck} isPublished={isPublished} openSet={openSet} lastSetId={lastSetId} showToast={showToast} libraryDecks={isFocusCourse(c) ? libraryDecks : []} />)}
        </div>
      )}

      <SectionHeader open={open === "campuses"} onToggle={() => toggle("campuses")} icon={<Building2 className="h-3.5 w-3.5" />} label="Campuses" count={0} color="#C9A9F5" hideCount />
      {open === "campuses" && (
        <div className="ml-2 border-l pl-1.5" style={{ borderColor: NEON.borderSoft }}>
          {focus ? <CampusesBody course={focus} topics={(focus.chapters ?? []).filter((ch) => ch.status !== "archived").sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9))} /> : <div className="px-1 py-1 text-[10px] italic" style={{ color: NEON.muted }}>Intro 1 course not found.</div>}
        </div>
      )}

      {/* MEMOS — opens the memo library on the right (no longer rendered by default). */}
      <button className="mt-0.5 flex w-full items-center gap-1.5 rounded px-1 py-1.5 text-left hover:bg-white/5" onClick={() => nav.openMemos()}>
        <span className="h-3.5 w-3.5" />
        <MessageSquare className="h-3.5 w-3.5 shrink-0" style={{ color: "#F0B24A" }} />
        <span className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "#F0B24A" }}>Memos</span>
      </button>

      {toast && (
        <div className="sticky bottom-1 z-10 mx-1 mt-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg" style={{ background: "#111A24", border: `1px solid ${NEON.border}`, color: NEON.text }}>
          <span className="min-w-0 flex-1 truncate">{toast.msg}</span>
          {toast.undo && <button className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide hover:bg-white/10" style={{ color: NEON.yellow }} onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button>}
          <button className="shrink-0 opacity-50 hover:opacity-100" onClick={() => setToast(null)}><X className="h-3 w-3" /></button>
        </div>
      )}
    </div>
  );
}

// ---- TOPICS (per course; focus course editable, others muted view-only) ----------------------
// The focus course (Intro 1) is the full authoring surface: rapid-fire add (Enter = another sibling,
// Shift+Enter on a topic = commit + add a child set), double-click rename, hover-✕ delete (empty topic
// instant; with-sets confirmed; sets soft-delete to the Library), drag-reorder = the teaching flow.
function CourseTopics({ course, focus, decksByTopic, ceqsByDeck, isPublished, openSet, lastSetId, showToast, libraryDecks }: {
  course: CourseOption; focus: boolean; decksByTopic: Map<string, DeckDef[]>;
  ceqsByDeck: Map<string, { id: string; stem: string; free: boolean; order: number }[]>;
  isPublished: (d: DeckDef) => boolean; openSet: (id: string) => void; lastSetId: string | null;
  showToast: (msg: string, undo?: () => void) => void; libraryDecks: DeckDef[];
}) {
  const qc = useQueryClient();
  const nav = useFrameNav(); // level-3 CEQ rows open the Studio editor on that question
  const { decks: loadedDecks, createDeck, setDeckTopic, renameDeck, reorderDecksInTopic, setDeckParked } = useDecks();
  const [open, setOpen] = useState(focus);
  const [openTopics, setOpenTopics] = useState<Set<string>>(new Set());
  // LEVEL 3 (Studio Consolidation D) — which sets have their CEQ rows expanded.
  const [openSets, setOpenSets] = useState<Set<string>>(new Set());
  const toggleSetOpen = (id: string) => setOpenSets((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);        // topic id being renamed
  const [renamingSet, setRenamingSet] = useState<string | null>(null);  // deck id being renamed
  const [addingSetFor, setAddingSetFor] = useState<string | null>(null); // topic id whose "+ set" input is open
  const [confirmDel, setConfirmDel] = useState<{ ch: Topic; count: number } | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const [parkOpen, setParkOpen] = useState(false); // "Parked ideas" group collapsed by default
  const refresh = () => qc.invalidateQueries({ queryKey: ["course-options"] });
  const allTopics = useMemo(() => (course.chapters ?? []).filter((ch) => ch.status !== "archived").sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9)), [course]);
  const topics = useMemo(() => allTopics.filter((ch) => !ch.parked), [allTopics]);      // production view
  const parkedTopics = useMemo(() => allTopics.filter((ch) => ch.parked), [allTopics]);   // braindump
  const toggleTopic = (id: string) => setOpenTopics((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const canEditSet = (id: string) => loadedDecks.some((d) => d.id === id); // only loaded-scene sets are mutable here
  const togglePark = async (ch: Topic, parked: boolean) => {
    try {
      await setChapterParked({ data: { id: ch.id, parked } }); refresh();
      showToast(parked ? `Parked "${topicLabel(ch)}".` : `Unparked "${topicLabel(ch)}".`, async () => { await setChapterParked({ data: { id: ch.id, parked: !parked } }); refresh(); });
    } catch (e) { showToast(e instanceof Error ? e.message : "Couldn't park that topic."); }
  };

  // SNAPSHOT FLOW → DEFAULT MAP — preview the diff, then apply (mirrors Ole Miss's exam layout into
  // the campus-agnostic default map; replaces the hand-run util SQL).
  const [snap, setSnap] = useState<SnapshotDiff | null>(null);
  const [snapBusy, setSnapBusy] = useState(false);
  const openSnapshot = async () => {
    setSnapBusy(true);
    try { setSnap(await snapshotDefaultFromOleMiss({ data: { apply: false } })); }
    catch (e) { showToast(e instanceof Error ? e.message : "Couldn't compute the snapshot."); }
    finally { setSnapBusy(false); }
  };
  const applySnapshot = async () => {
    setSnapBusy(true);
    try { await snapshotDefaultFromOleMiss({ data: { apply: true } }); setSnap(null); qc.invalidateQueries({ queryKey: ["default-exam-units"] }); showToast("Starter Map updated from the Ole Miss flow."); }
    catch (e) { showToast(e instanceof Error ? e.message : "Snapshot failed."); }
    finally { setSnapBusy(false); }
  };

  // CSV ROUND-TRIP (Prompt 2B) — export downloads the curriculum; import is a DIFFED DRY-RUN first
  // (the approved screen), then one confirmed Apply. Import never deletes.
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvDiff, setCsvDiff] = useState<CsvImportDiff | null>(null);
  const csvTextRef = useRef<string>("");
  /** `simple` = topic_name, set_name, ceq_stem only — for reading/sharing. The full export stays
   *  the round-trip file (it carries the ids import matches on). */
  const doCsvExport = async (simple = false) => {
    try {
      const { csv } = await exportCurriculumCsv({ data: { simple } });
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = simple ? "curriculum-simple.csv" : "curriculum.csv"; a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { showToast(e instanceof Error ? e.message : "Export failed."); }
  };
  const doCsvDryRun = async (file: File) => {
    setCsvBusy(true);
    try {
      const text = await file.text();
      csvTextRef.current = text;
      setCsvDiff(await importCurriculumCsv({ data: { csv: text, apply: false } }));
    } catch (e) { showToast(e instanceof Error ? e.message : "Couldn't read that CSV."); }
    finally { setCsvBusy(false); }
  };
  const doCsvApply = async () => {
    setCsvBusy(true);
    try {
      const res = await importCurriculumCsv({ data: { csv: csvTextRef.current, apply: true } });
      setCsvDiff(null);
      qc.invalidateQueries({ queryKey: ["course-options"] });
      qc.invalidateQueries({ queryKey: ["all-card-decks"] });
      showToast(`Imported: ${res.newTopics} topics · ${res.newSets} sets · ${res.newCeqs} questions.`);
    } catch (e) { showToast(e instanceof Error ? e.message : "Import failed."); }
    finally { setCsvBusy(false); }
  };

  // create a topic; Shift+Enter → also open its "+ set" input (commit-then-child)
  const addTopic = async (name: string, shift: boolean) => {
    const row = await createChapter({ data: { course_id: course.id, chapter_name: name } });
    refresh();
    if (shift && row?.id) { setAdding(false); setOpenTopics((s) => new Set(s).add(row.id)); setAddingSetFor(row.id); }
  };
  const delTopic = async (ch: Topic, tDecks: DeckDef[]) => {
    if (tDecks.length > 0) {
      if (!tDecks.every((d) => canEditSet(d.id))) { showToast("Some of this topic's sets live in another scene — open it first."); return; }
      setConfirmDel({ ch, count: tDecks.length }); return;
    }
    await setChapterStatus({ data: { id: ch.id, status: "archived" } }); refresh();
    showToast(`Deleted topic "${topicLabel(ch)}".`, async () => { await setChapterStatus({ data: { id: ch.id, status: "active" } }); refresh(); });
  };
  const confirmDeleteTopic = async () => {
    if (!confirmDel) return;
    const { ch } = confirmDel;
    const moved = (decksByTopic.get(ch.id) ?? []).filter((d) => canEditSet(d.id)).map((d) => ({ id: d.id, topicId: d.topicId ?? null, courseId: d.courseId ?? null }));
    for (const m of moved) setDeckTopic(m.id, null, m.courseId ?? course.id);
    await setChapterStatus({ data: { id: ch.id, status: "archived" } }); refresh();
    setConfirmDel(null);
    showToast(`Deleted "${topicLabel(ch)}" · ${moved.length} set(s) → Library.`, async () => {
      await setChapterStatus({ data: { id: ch.id, status: "active" } });
      for (const m of moved) setDeckTopic(m.id, ch.id, m.courseId ?? course.id);
      refresh();
    });
  };
  const delSet = (d: DeckDef) => {
    if (!canEditSet(d.id)) { showToast("This set lives in another scene — open it to remove."); return; }
    const prev = d.topicId ?? null;
    setDeckTopic(d.id, null, d.courseId ?? course.id);
    showToast(`Moved "${setName(d)}" to the Library.`, () => setDeckTopic(d.id, prev, d.courseId ?? course.id));
  };

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const commitOrder = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = topics.map((t) => t.id); const from = ids.indexOf(dragId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1); ids.splice(to, 0, dragId);
    await reorderChapters({ data: { course_id: course.id, ordered_ids: ids } }); refresh();
  };

  // SET drag-and-drop — move a set between topics and reorder within a topic (flow order). Only
  // loaded-scene sets are draggable; drop computes the target topic's full id order and persists it.
  const bySort = (a: DeckDef, b: DeckDef) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || setName(a).localeCompare(setName(b));
  const [setDrag, setSetDrag] = useState<{ id: string; from: string } | null>(null);
  const [setOver, setSetOver] = useState<{ topic: string; index: number } | null>(null);
  const performSetDrop = (targetTopic: string, index: number) => {
    const drag = setDrag; setSetDrag(null); setSetOver(null);
    if (!drag || !canEditSet(drag.id)) return;
    const ids = (decksByTopic.get(targetTopic) ?? []).slice().sort(bySort).map((d) => d.id).filter((x) => x !== drag.id);
    const at = Math.max(0, Math.min(index, ids.length));
    ids.splice(at, 0, drag.id);
    if (drag.from !== targetTopic) setDeckTopic(drag.id, targetTopic, course.id);
    reorderDecksInTopic(ids);
  };

  const dim = focus ? 1 : 0.5; // muted non-focus courses
  return (
    <div className="mb-0.5" style={{ opacity: dim }}>
      <button className="flex w-full items-center gap-1 px-0.5 py-1 text-left hover:bg-white/5" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-80" />}
        <span className="min-w-0 flex-1 truncate uppercase tracking-wide" style={{ color: focus ? NEON.yellow : NEON.muted, fontSize: focus ? 12 : 11, fontWeight: focus ? 900 : 700 }}>{courseLabel(course)}</span>
        {!focus && <span className="shrink-0 text-[8px] uppercase tracking-wider opacity-70" style={{ color: NEON.muted }}>ref</span>}
      </button>
      {open && (
        <div className="ml-2 border-l pl-1.5" style={{ borderColor: NEON.borderSoft }}>
          {topics.length === 0 && <div className="px-1 py-0.5 text-[10px] italic" style={{ color: NEON.muted }}>No topics.</div>}
          {topics.map((ch) => {
            const allDecks = (decksByTopic.get(ch.id) ?? []).slice().sort(bySort);
            const tDecks = allDecks.filter((d) => !d.parked);        // production view
            const parkedDecks = allDecks.filter((d) => !!d.parked);  // muted "Parked" group
            const tOpen = openTopics.has(ch.id);
            const setTarget = setDrag && setOver?.topic === ch.id; // a set is hovering this topic
            return (
              <div key={ch.id} className="rounded" style={{ transition: "background 120ms", background: (overId === ch.id && dragId) || setTarget ? "rgba(79,163,227,0.12)" : "transparent", opacity: dragId === ch.id ? 0.4 : 1 }}
                onDragOver={focus ? (e) => {
                  if (dragId) { e.preventDefault(); if (overId !== ch.id) setOverId(ch.id); }
                  else if (setDrag) { e.preventDefault(); if (setOver?.topic !== ch.id) setSetOver({ topic: ch.id, index: tDecks.filter((d) => d.id !== setDrag.id).length }); } // default: append (rows refine)
                } : undefined}
                onDrop={focus ? (e) => {
                  if (dragId) { e.preventDefault(); void commitOrder(ch.id); setDragId(null); setOverId(null); }
                  else if (setDrag) { e.preventDefault(); performSetDrop(ch.id, setOver?.topic === ch.id ? setOver.index : tDecks.length); }
                } : undefined}>
                <div className="group flex items-center gap-1 px-0.5 py-0.5">
                  {focus && <span className="cursor-grab opacity-0 group-hover:opacity-60" draggable onDragStart={() => setDragId(ch.id)} onDragEnd={() => { setDragId(null); setOverId(null); }} title="Drag to reorder"><GripVertical className="h-3 w-3" /></span>}
                  {/* Clicking a TOPIC expands it AND opens it in the Studio (its first set) — one
                      navigation, no second tree in the Studio. */}
                  <button className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => { toggleTopic(ch.id); const first = tDecks[0]; if (first) openSet(first.id); }}>
                    {tOpen ? <ChevronDown className="h-3 w-3 shrink-0 opacity-70" /> : <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />}
                    {focus && renaming === ch.id ? (
                      <InlineInput initial={topicLabel(ch)} onCommit={async (v) => { setRenaming(null); await renameChapter({ data: { id: ch.id, chapter_name: v } }); refresh(); }} onCancel={() => setRenaming(null)} />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: focus ? NEON.cyan : NEON.muted }} onDoubleClick={focus ? (e) => { e.stopPropagation(); setRenaming(ch.id); } : undefined} title={focus ? "Double-click to rename" : undefined}>{topicLabel(ch)}</span>
                    )}
                    {tDecks.length > 0 && <span className="shrink-0 text-[9px] tabular-nums opacity-45">{tDecks.length}</span>}
                  </button>
                  {focus && renaming !== ch.id && (
                    <button className="shrink-0 rounded p-0.5 opacity-0 hover:bg-white/10 group-hover:opacity-60" title="Park topic (hide from the production view)" onClick={(e) => { e.stopPropagation(); void togglePark(ch, true); }}><Eye className="h-3 w-3" /></button>
                  )}
                  {focus && renaming !== ch.id && (
                    <button className="shrink-0 rounded p-0.5 opacity-0 hover:bg-white/10 group-hover:opacity-60" title="Delete topic" onClick={(e) => { e.stopPropagation(); void delTopic(ch, tDecks); }}><X className="h-3 w-3" /></button>
                  )}
                </div>
                {tOpen && (
                  <div className="ml-4 pb-0.5">
                    {tDecks.length === 0 && !addingSetFor && <div className="px-1 py-0.5 text-[10px] italic" style={{ color: NEON.muted }}>No sets yet</div>}
                    {tDecks.map((d, i) => {
                      const active = d.id === lastSetId; const pub = isPublished(d); const editable = canEditSet(d.id);
                      const dragging = setDrag?.id === d.id;
                      const dropLine = setTarget && setOver?.index === i && setDrag?.id !== d.id;
                      // LEVEL 3 (Studio Consolidation D) — this set's CEQs, in stageOrder.
                      const ceqRows = ceqsByDeck.get(d.id) ?? [];
                      const freeN = ceqRows.reduce((a, q) => a + (q.free ? 1 : 0), 0);
                      const ceqOpen = openSets.has(d.id);
                      return (
                        <div key={d.id}>
                          {dropLine && <div className="mx-1 my-0.5 h-0.5 rounded-full" style={{ background: NEON.cyan }} />}
                          <div
                            className="group flex items-center gap-1 rounded pr-0.5 hover:bg-white/5"
                            style={{ background: active ? "rgba(252,163,17,0.10)" : "transparent", opacity: dragging ? 0.4 : 1, transform: dragging ? "scale(0.98)" : "none", transition: "transform 120ms, opacity 120ms" }}
                            draggable={focus && editable && renamingSet !== d.id}
                            onDragStart={focus && editable ? (e) => { e.dataTransfer.effectAllowed = "move"; setSetDrag({ id: d.id, from: ch.id }); } : undefined}
                            onDragEnd={() => { setSetDrag(null); setSetOver(null); }}
                            onDragOver={focus && setDrag ? (e) => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const below = e.clientY > r.top + r.height / 2; const base = tDecks.filter((x) => x.id !== setDrag.id).findIndex((x) => x.id === d.id); const idx = base < 0 ? tDecks.length : base + (below ? 1 : 0); if (setOver?.topic !== ch.id || setOver?.index !== idx) setSetOver({ topic: ch.id, index: idx }); } : undefined}
                            onDrop={focus && setDrag ? (e) => { e.preventDefault(); e.stopPropagation(); performSetDrop(ch.id, setOver?.topic === ch.id ? setOver.index : tDecks.length); } : undefined}>
                            {focus && renamingSet === d.id ? (
                              <div className="flex-1 px-1.5 py-0.5"><InlineInput initial={setName(d)} onCommit={(v) => { setRenamingSet(null); renameDeck(d.id, v); }} onCancel={() => setRenamingSet(null)} /></div>
                            ) : (<>
                              {/* LEVEL-3 DISCLOSURE — only for sets whose CEQs are actually loaded. */}
                              {ceqRows.length > 0 ? (
                                <button className="grid h-4 w-4 shrink-0 place-items-center" style={{ color: NEON.muted }} onClick={(e) => { e.stopPropagation(); toggleSetOpen(d.id); }} title={ceqOpen ? "Hide questions" : "Show questions"}>
                                  {ceqOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                </button>
                              ) : <span className="h-4 w-4 shrink-0" />}
                              <button className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1.5 text-left" onClick={() => openSet(d.id)} onDoubleClick={focus && editable ? (e) => { e.stopPropagation(); setRenamingSet(d.id); } : undefined} title={`Open "${setName(d)}" in the Studio · ${d.status === "live" ? "LIVE" : "draft"}${pub ? " · video published" : ""}${focus && editable ? " · drag to move/reorder · double-click to rename" : ""}`}>
                                <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: d.status === "live" ? "#3BF5A0" : "#F0B24A", fill: d.status === "live" ? "#3BF5A0" : "transparent" }} />
                                <span className="min-w-0 flex-1 truncate" style={{ color: active ? NEON.yellow : NEON.text }}>{setName(d)}</span>
                                {/* CEQ COUNTS — "n free · n", the CEQS strip's Free/Full moved here
                                    so the whole course's shape reads at a glance, not just the open set. */}
                                {ceqRows.length > 0 && <span className="shrink-0 text-[9.5px] tabular-nums" style={{ color: NEON.muted }} title={`${freeN} free · ${ceqRows.length} total CEQs`}>{freeN} free · {ceqRows.length}</span>}
                              </button>
                            </>)}
                            {focus && editable && renamingSet !== d.id && (
                              <button className="shrink-0 rounded p-0.5 opacity-0 hover:bg-white/10 group-hover:opacity-60" title="Park set (hide from the production view; never served to students)" onClick={(e) => { e.stopPropagation(); setDeckParked(d.id, true); showToast(`Parked "${setName(d)}".`, () => setDeckParked(d.id, false)); }}><Eye className="h-3 w-3" /></button>
                            )}
                            {focus && editable && renamingSet !== d.id && (
                              <button className="shrink-0 rounded p-0.5 opacity-0 hover:bg-white/10 group-hover:opacity-60" title="Move set to the Library" onClick={(e) => { e.stopPropagation(); delSet(d); }}><X className="h-3 w-3" /></button>
                            )}
                          </div>
                          {/* LEVEL 3 — CEQ ROWS. Same shape as the rows prompt B cleaned: number,
                              stem, one status chip. Clicking opens that CEQ in the Studio editor.
                              (Selection checkboxes + the bulk bar + drag-reorder land here next —
                              held back so the tree's width and truncation can be eyeballed first.) */}
                          {ceqOpen && (
                            <div className="ml-5 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
                              {ceqRows.map((q, qi) => (
                                <button
                                  key={q.id}
                                  onClick={() => nav.openStudio(q.id)}
                                  title={q.stem}
                                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-white/5"
                                >
                                  <span className="shrink-0 text-[9.5px] tabular-nums" style={{ color: NEON.muted }}>{qi + 1}.</span>
                                  <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: NEON.text }}>{q.stem}</span>
                                  <span className="shrink-0 rounded px-1 text-[8px] font-black leading-none" style={q.free
                                    ? { color: "#04120B", background: "#3BF5A0", border: "1px solid #3BF5A0" }
                                    : { color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>{q.free ? "🆓" : "$"}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {setTarget && setOver?.index === i + 1 && i === tDecks.length - 1 && setDrag?.id !== d.id && <div className="mx-1 my-0.5 h-0.5 rounded-full" style={{ background: NEON.cyan }} />}
                        </div>
                      );
                    })}

                    {/* PARKED SETS — same eye grammar as parked topics: muted, collapsed at the
                        bottom of the topic, un-park with the eye. Never served to students. */}
                    {parkedDecks.length > 0 && (
                      <div className="mt-0.5">
                        <div className="flex items-center gap-1 px-1 py-0.5">
                          <EyeOff className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} />
                          <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Parked</span>
                          <span className="text-[9px] tabular-nums opacity-60">{parkedDecks.length}</span>
                        </div>
                        {parkedDecks.map((d) => (
                          <div key={d.id} className="group flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/5">
                            <span className="min-w-0 flex-1 truncate text-[11px] italic" style={{ color: NEON.muted }}>{setName(d)}</span>
                            {focus && canEditSet(d.id) && (
                              <button className="shrink-0 rounded p-0.5 opacity-0 hover:bg-white/10 group-hover:opacity-70" title="Un-park (return to the production view)" onClick={() => { setDeckParked(d.id, false); showToast(`Un-parked "${setName(d)}".`, () => setDeckParked(d.id, true)); }}><Eye className="h-3 w-3" style={{ color: NEON.cyan }} /></button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {focus && (addingSetFor === ch.id ? (
                      <div className="px-0.5 py-1"><InlineInput rapid placeholder="New set name… (Enter for another)" onCommit={(v) => { createDeck(v, ch.id, course.id); }} onCancel={() => setAddingSetFor(null)} /></div>
                    ) : (
                      <AddRow label="Add set" onClick={() => setAddingSetFor(ch.id)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {focus && (adding ? (
            <div className="px-0.5 py-1"><InlineInput rapid placeholder="New topic… (Enter = another · Shift+Enter = add a set)" onCommit={(v, o) => { void addTopic(v, o.shift); }} onCancel={() => setAdding(false)} /></div>
          ) : (
            <AddRow label="Add topic" onClick={() => setAdding(true)} />
          ))}

          {/* PARKED IDEAS — authoring-only braindump; collapsed, muted, un-park with the eye */}
          {focus && parkedTopics.length > 0 && (
            <div className="mt-1">
              <button className="flex w-full items-center gap-1 px-0.5 py-1 text-left opacity-70 hover:bg-white/5 hover:opacity-100" onClick={() => setParkOpen((v) => !v)}>
                {parkOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                <EyeOff className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} />
                <span className="min-w-0 flex-1 truncate text-[10.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Parked ideas</span>
                <span className="shrink-0 text-[9px] tabular-nums opacity-60">{parkedTopics.length}</span>
              </button>
              {parkOpen && (
                <div className="ml-4 pb-0.5">
                  {parkedTopics.map((ch) => (
                    <div key={ch.id} className="group flex items-center gap-1 rounded px-0.5 py-0.5 hover:bg-white/5">
                      <span className="min-w-0 flex-1 truncate text-[11px] italic" style={{ color: NEON.muted }}>{topicLabel(ch)}</span>
                      <button className="shrink-0 rounded p-0.5 opacity-0 hover:bg-white/10 group-hover:opacity-70" title="Un-park (return to the production view)" onClick={() => void togglePark(ch, false)}><Eye className="h-3 w-3" style={{ color: NEON.cyan }} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LIBRARY (Unassigned) — recoverable soft-deleted / never-assigned sets */}
          {focus && libraryDecks.length > 0 && (
            <div className="mt-1">
              <button className="flex w-full items-center gap-1 px-0.5 py-1 text-left opacity-70 hover:bg-white/5 hover:opacity-100" onClick={() => setLibOpen((v) => !v)}>
                {libOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                <Archive className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} />
                <span className="min-w-0 flex-1 truncate text-[10.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Library (Unassigned)</span>
                <span className="shrink-0 text-[9px] tabular-nums opacity-60">{libraryDecks.length}</span>
              </button>
              {libOpen && (
                <div className="ml-4 pb-0.5">
                  {libraryDecks.slice().sort((a, b) => setName(a).localeCompare(setName(b))).map((d) => (
                    <button key={d.id} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-white/5" onClick={() => openSet(d.id)} title={`Open "${setName(d)}" · unassigned`}>
                      <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: NEON.muted, fill: "transparent" }} />
                      <span className="min-w-0 flex-1 truncate" style={{ color: NEON.muted }}>{setName(d)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SNAPSHOT FLOW → DEFAULT MAP — course-level; replaces the hand-run util SQL */}
          {focus && (
            <button className="mt-2 flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left text-[10.5px] font-bold uppercase tracking-wider disabled:opacity-40 hover:bg-white/5" style={{ color: "#C9A9F5", border: `1px solid ${NEON.borderSoft}` }} disabled={snapBusy} onClick={() => void openSnapshot()} title="Copy Ole Miss's exam flow into the campus-agnostic Starter Map (unmapped schools read this)">
              <Layers className="h-3 w-3 shrink-0" /> {snapBusy && !snap ? "Computing…" : "Snapshot flow → starter map"}
            </button>
          )}

          {/* CSV ROUND-TRIP (Prompt 2B) — draft topics/stems externally, land them in ONE confirmed
              import. Rows with ids UPDATE, blank ids CREATE, absent rows are UNTOUCHED (never deletes). */}
          {focus && (
            <div className="mt-1 flex gap-1.5">
              <button className="flex-1 rounded px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-white/5" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => void doCsvExport()} title="Full export — every column, including the ids. This is the file Import CSV round-trips.">Export CSV</button>
              <button className="flex-1 rounded px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-white/5" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => void doCsvExport(true)} title="Simple export — topic_name, set_name, ceq_stem only. For reading and sharing; it carries no ids, so it can't be re-imported.">Simple</button>
              <button className="flex-1 rounded px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 hover:bg-white/5" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} disabled={csvBusy} onClick={() => csvFileRef.current?.click()}>{csvBusy ? "Reading…" : "Import CSV…"}</button>
              <input ref={csvFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doCsvDryRun(f); e.target.value = ""; }} />
            </div>
          )}
        </div>
      )}

      {snap && (
        <div className="fixed inset-0 z-[1000] grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setSnap(null)}>
          <div className="w-[340px] rounded-xl p-4" style={{ background: "#0F1720", border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-bold" style={{ color: NEON.text }}>Snapshot flow → starter map</p>
            <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: NEON.muted }}>Rebuild the Starter Map (what unmapped schools show) to mirror Ole Miss's current exam layout.</p>
            <div className="mt-2.5 flex gap-3 text-[11px]">
              <span style={{ color: "#3BF5A0" }}>+{snap.added} added</span>
              <span style={{ color: NEON.yellow }}>{snap.changed} moved</span>
              <span style={{ color: "#F0785A" }}>−{snap.removed} removed</span>
              <span style={{ color: NEON.muted }}>{snap.unchanged} same</span>
            </div>
            <div className="mt-2 rounded p-2 text-[11px]" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}` }}>
              {snap.perExam.length === 0 ? <span style={{ color: NEON.muted }}>Nothing to snapshot (Ole Miss has no active exams mapped).</span> : snap.perExam.map((e) => (
                <div key={e.exam_number} className="flex justify-between"><span style={{ color: NEON.text }}>{e.exam_number === 99 ? "Final" : e.exam_number === 999 ? "Unsorted" : `Exam ${e.exam_number}`}</span><span className="tabular-nums" style={{ color: NEON.muted }}>{e.topics} topic{e.topics === 1 ? "" : "s"}</span></div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${NEON.border}`, color: NEON.muted }} onClick={() => setSnap(null)}>Cancel</button>
              <button className="rounded px-3 py-1.5 text-[12px] font-bold disabled:opacity-40" style={{ background: "#C9A9F5", color: "#160B22" }} disabled={snapBusy || snap.perExam.length === 0} onClick={() => void applySnapshot()}>{snapBusy ? "Applying…" : "Apply to Starter Map"}</button>
            </div>
          </div>
        </div>
      )}

      {/* CSV IMPORT DRY-RUN — the approved screen: diff counts, sample changes, flags with row
          numbers, hard-rejects block Apply. Import never deletes. */}
      {csvDiff && (
        <div className="fixed inset-0 z-[1000] grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setCsvDiff(null)}>
          <div className="w-[360px] max-h-[80vh] overflow-y-auto rounded-xl p-4" style={{ background: "#0F1720", border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-bold">Import preview</p>
            <p className="mt-1.5 text-[12px]">
              <span style={{ color: "#3BF5A0" }}>{csvDiff.newTopics} new topics</span> · <span style={{ color: NEON.yellow }}>{csvDiff.renamedTopics} renamed</span> · <span style={{ color: "#3BF5A0" }}>{csvDiff.newSets} new sets</span> · <span style={{ color: "#3BF5A0" }}>{csvDiff.newCeqs} new questions</span> · <span style={{ color: NEON.yellow }}>{csvDiff.changedStems} stems changed</span> · <span style={{ color: NEON.muted }}>0 deleted</span>
            </p>
            {csvDiff.samples.length > 0 && (
              <div className="mt-2 rounded p-2 text-[10.5px]" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}` }}>
                {csvDiff.samples.map((s, i) => <p key={i} style={{ color: s.startsWith("+") ? "#3BF5A0" : NEON.yellow }}>{s}</p>)}
              </div>
            )}
            {csvDiff.flags.length > 0 && (
              <div className="mt-2 text-[10.5px]" style={{ color: "#F0785A" }}>{csvDiff.flags.map((f, i) => <p key={i}>⚠ {f}</p>)}</div>
            )}
            {csvDiff.rejected.length > 0 && (
              <div className="mt-2 text-[10.5px]" style={{ color: "#E24B4A" }}>
                <p className="font-bold uppercase">Rejected — fix these rows first</p>
                {csvDiff.rejected.slice(0, 8).map((f, i) => <p key={i}>✗ {f}</p>)}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${NEON.border}`, color: NEON.muted }} onClick={() => setCsvDiff(null)}>Cancel</button>
              <button className="rounded px-3 py-1.5 text-[12px] font-bold disabled:opacity-40" style={{ background: NEON.yellow, color: "#0B1322" }} disabled={csvBusy || csvDiff.rejected.length > 0} onClick={() => void doCsvApply()}>
                {csvBusy ? "Applying…" : `Apply ${csvDiff.newTopics + csvDiff.renamedTopics + csvDiff.newSets + csvDiff.renamedSets + csvDiff.newCeqs + csvDiff.changedStems} changes`}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[1000] grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setConfirmDel(null)}>
          <div className="w-[300px] rounded-xl p-4" style={{ background: "#0F1720", border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-bold" style={{ color: NEON.text }}>Delete “{topicLabel(confirmDel.ch)}”?</p>
            <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: NEON.muted }}>It has <b style={{ color: NEON.yellow }}>{confirmDel.count}</b> set{confirmDel.count === 1 ? "" : "s"}. They'll move to the Library (not deleted). You can undo.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${NEON.border}`, color: NEON.muted }} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="rounded px-3 py-1.5 text-[12px] font-bold" style={{ background: "#F0785A", color: "#1A0B08" }} onClick={() => void confirmDeleteTopic()}>Delete topic</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- CAMPUSES (Intro-1 scoped) ---------------------------------------------------------------
// The STARTER MAP is pinned first (same mapper UI, campus_id IS NULL). Campus rows carry a STATUS
// badge (inherited muted / edited cream / verified green ✓) and the status filter is King's queue.
function CampusesBody({ course, topics }: { course: CourseOption; topics: Topic[] }) {
  const [adding, setAdding] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "inherited" | "edited" | "verified">("all");
  const [statusByCampus, setStatusByCampus] = useState<Record<string, string>>({});
  const [booksOpen, setBooksOpen] = useState(false);
  const [inboundOpen, setInboundOpen] = useState(false);
  const [armed, setArmed] = useState<{ id: string; label: string } | null>(armedSourceFile);
  const qc = useQueryClient();
  const campusesQ = useQuery({ queryKey: ["course-campuses", course.id], queryFn: () => listCourseCampuses({ data: { course_id: course.id } }), networkMode: "always" });
  const campuses = campusesQ.data ?? [];
  const missing = campusesQ.isError ? String((campusesQ.error as Error)?.message ?? "") : "";
  const reportStatus = useCallback((campusId: string, s: string) => setStatusByCampus((p) => (p[campusId] === s ? p : { ...p, [campusId]: s })), []);
  const shown = statusFilter === "all" ? campuses : campuses.filter((c) => (statusByCampus[c.campus_id] ?? "inherited") === statusFilter);
  return (
    <>
      {missing && <p className="px-1 py-1 text-[10px] italic leading-snug" style={{ color: "#F0A0A0" }}>{missing}</p>}

      {/* King's queue — filter the campus worklist by map status */}
      <div className="flex items-center gap-1 px-0.5 pb-1">
        {(["all", "inherited", "edited", "verified"] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: statusFilter === s ? "#0B1322" : NEON.muted, background: statusFilter === s ? NEON.yellow : "transparent", border: `1px solid ${statusFilter === s ? NEON.yellow : NEON.borderSoft}` }}>{s}</button>
        ))}
      </div>

      {/* STARTER MAP — pinned first, edited with the exact same mapper UI (campus_id IS NULL) */}
      <CampusRow campus={{ campus_id: "__starter__", name: "Starter Map", exam_count: 0, topic_count: 0 }} course={course} topics={topics} starter onStatus={reportStatus} />

      {!missing && campuses.length === 0 && <div className="px-1 py-0.5 text-[10px] italic" style={{ color: NEON.muted }}>No campuses mapped yet.</div>}
      {shown.map((c) => <CampusRow key={c.campus_id} campus={c} course={course} topics={topics} onStatus={reportStatus} />)}
      {adding ? (
        <AddCampus course={course} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["course-campuses", course.id] }); }} onCancel={() => setAdding(false)} />
      ) : (
        <AddRow label="Add campus" onClick={() => setAdding(true)} />
      )}

      {/* TEXTBOOKS — manager modal (title/edition + ordered chapter list keyed on chapter_key) */}
      <button className="mt-1 flex w-full items-center gap-1 px-1 py-1 text-left text-[9px] font-bold uppercase tracking-wider hover:bg-white/5" style={{ color: "#C9A9F5" }} onClick={() => setBooksOpen(true)}>
        <ChevronRight className="h-3 w-3" /> Textbooks
      </button>
      {booksOpen && <TextbooksModal onClose={() => setBooksOpen(false)} />}

      {/* INBOUND FILES — the provenance worklist; "Open in mapper" ARMS the file so edits link it */}
      <button className="flex w-full items-center gap-1 px-1 py-1 text-left text-[9px] font-bold uppercase tracking-wider hover:bg-white/5" style={{ color: "#C9A9F5" }} onClick={() => setInboundOpen(true)}>
        <ChevronRight className="h-3 w-3" /> Inbound Files
      </button>
      {inboundOpen && <InboundFilesModal onClose={() => setInboundOpen(false)} onArm={(f) => { armedSourceFile = f; setArmed(f); setInboundOpen(false); }} />}
      {armed && (
        <div className="mt-1 flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px]" style={{ background: "rgba(201,169,245,0.12)", color: "#C9A9F5", border: "1px solid rgba(201,169,245,0.3)" }}>
          <span className="min-w-0 flex-1 truncate" title="Map edits + topic creations made now record this file as their source (provenance)">📎 {armed.label} — edits link this file</span>
          <button className="shrink-0 opacity-70 hover:opacity-100" onClick={() => { armedSourceFile = null; setArmed(null); }}><X className="h-3 w-3" /></button>
        </div>
      )}

      <button className="mt-1 flex w-full items-center gap-1 px-1 py-1 text-left text-[9px] font-bold uppercase tracking-wider hover:bg-white/5" style={{ color: NEON.muted }} onClick={() => setShowQueue((v) => !v)}>
        {showQueue ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} SEC target queue
      </button>
      {showQueue && (
        <ol className="ml-3 pb-1">
          {SEC_TARGETS.map((name, i) => {
            const mapped = campuses.some((c) => c.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.name.toLowerCase()));
            return (
              <li key={name} className="flex items-center gap-1.5 px-1 py-0.5 text-[10.5px]" style={{ color: mapped ? "#3BF5A0" : NEON.muted, opacity: mapped ? 1 : 0.8 }}>
                <span className="w-3 shrink-0 text-right tabular-nums opacity-60">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{name}{i === 0 ? " · you" : i === 1 ? " · KING" : ""}</span>
                {mapped && <span className="shrink-0 text-[9px]">✓</span>}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

// One MAP row — a campus, or (starter) the pinned Starter Map (campus_id IS NULL, same UI).
// Status badge: inherited (muted) / edited (cream) / verified (green ✓ — click shows source files).
// INHERITED campuses render the resolved Starter Map read-only + muted; the first edit runs the
// copy-on-write confirm, copies the resolved rows in, then editing proceeds on the campus's own map.
function CampusRow({ campus, course, topics, starter, onStatus }: { campus: CourseCampusRow; course: CourseOption; topics: Topic[]; starter?: boolean; onStatus?: (campusId: string, s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cowConfirm, setCowConfirm] = useState(false); // the copy-on-write moment, made visible once
  const [revertDiff, setRevertDiff] = useState<RevertDiff | null>(null);
  const qc = useQueryClient();
  const campusId = starter ? null : campus.campus_id;
  const scope = { courseId: course.id, campusId, professorId: null as string | null };

  const metaQ = useQuery({ queryKey: ["map-meta", course.id, campusId], queryFn: () => getMapMeta({ data: scope }), networkMode: "always", staleTime: 60_000 });
  const meta = metaQ.data ?? null;
  const status = starter ? (meta?.hasOwnRows ? meta.status : "edited") : (meta?.status ?? "inherited");
  useEffect(() => { if (!starter && meta && onStatus) onStatus(campus.campus_id, meta.status); }, [meta, starter, campus.campus_id, onStatus]);

  const examsQ = useQuery({ queryKey: ["campus-exams", campusId, course.id], queryFn: () => listCampusExams({ data: { campus_id: campusId, course_id: course.id } }), enabled: open, networkMode: "always" });
  const exams = (examsQ.data ?? []).filter((e) => e.status === "active");
  // inherited display = the RESOLVED starter map, read-only + muted
  const inherited = !starter && !!meta && !meta.hasOwnRows;
  const starterQ = useQuery({ queryKey: ["campus-exams", null, course.id], queryFn: () => listCampusExams({ data: { campus_id: null, course_id: course.id } }), enabled: open && inherited, networkMode: "always" });
  const starterExams = (starterQ.data ?? []).filter((e) => e.status === "active");

  const refresh = () => { qc.invalidateQueries({ queryKey: ["campus-exams", campusId, course.id] }); qc.invalidateQueries({ queryKey: ["course-campuses", course.id] }); qc.invalidateQueries({ queryKey: ["map-meta", course.id, campusId] }); };

  const topicIds = useMemo(() => topics.map((t) => t.id), [topics]);
  const ovQ = useQuery({ queryKey: ["campus-overrides", campusId], queryFn: () => listCampusChapterOverrides({ data: { campus_id: campusId!, chapter_ids: topicIds } }), enabled: open && !!campusId && topicIds.length > 0, networkMode: "always" });
  const localOv = useMemo(() => { const m = new Map<string, { local_number: number | null; local_order: number | null }>(); for (const r of ovQ.data ?? []) m.set(r.chapter_id, { local_number: r.local_number, local_order: r.local_order }); return m; }, [ovQ.data]);
  const setLocalNum = async (chapter_id: string, n: number | null) => { if (!campusId) return; const order = localOv.get(chapter_id)?.local_order ?? null; await setCampusChapterOverride({ data: { campus_id: campusId, chapter_id, local_number: n, local_order: order } }); qc.invalidateQueries({ queryKey: ["campus-overrides", campusId] }); };

  // TOPIC-ROW SELECTION + DRAG (Prompt 2A) — rows select with click / Shift+click (range within an
  // exam) / Ctrl+click (toggle); Esc clears. Dragging a selected row moves the WHOLE same-exam
  // selection as a stack (count badge); an unselected row drags alone. Drops show an insertion LINE.
  const [topicSel, setTopicSel] = useState<Set<string>>(() => new Set()); // keys `${examId}|${chapterId}`
  const selAnchor = useRef<{ examId: string; chapterId: string } | null>(null);
  const [tDrag, setTDrag] = useState<{ fromExam: string; ids: string[] } | null>(null);
  const [tOver, setTOver] = useState<{ examId: string; index: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setTopicSel(new Set()); selAnchor.current = null; } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const clickTopicRow = (examId: string, chapterId: string, ev: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    const key = `${examId}|${chapterId}`;
    setTopicSel((prev) => {
      const next = new Set(prev);
      if (ev.shiftKey && selAnchor.current?.examId === examId) {
        const order = exams.find((e) => e.id === examId)?.chapter_ids ?? [];
        const a = order.indexOf(selAnchor.current.chapterId), b = order.indexOf(chapterId);
        if (a >= 0 && b >= 0) { for (const cid of order.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(`${examId}|${cid}`); return next; }
      }
      if (ev.ctrlKey || ev.metaKey) { next.has(key) ? next.delete(key) : next.add(key); }
      else { next.clear(); next.add(key); }
      selAnchor.current = { examId, chapterId };
      return next;
    });
  };
  const startTopicDrag = (examId: string, chapterId: string) => {
    const key = `${examId}|${chapterId}`;
    const order = exams.find((e) => e.id === examId)?.chapter_ids ?? [];
    const ids = topicSel.has(key)
      ? order.filter((cid) => topicSel.has(`${examId}|${cid}`)) // the whole same-exam selection, in exam order
      : [chapterId];
    if (!topicSel.has(key)) { setTopicSel(new Set([key])); selAnchor.current = { examId, chapterId }; }
    setTDrag({ fromExam: examId, ids });
  };
  const dropTopics = async (targetExamId: string, index: number) => {
    const drag = tDrag; setTDrag(null); setTOver(null);
    if (!drag) return;
    const src = exams.find((e) => e.id === drag.fromExam), tgt = exams.find((e) => e.id === targetExamId);
    if (!src || !tgt) return;
    const moved = drag.ids;
    try {
      if (drag.fromExam === targetExamId) {
        const rest = src.chapter_ids.filter((cid) => !moved.includes(cid));
        const at = Math.max(0, Math.min(index, rest.length));
        rest.splice(at, 0, ...moved);
        await setCampusExamTopics({ data: { campus_exam_id: targetExamId, chapter_ids: rest, source_file_id: getArmedSourceFileId() } });
      } else {
        const srcRest = src.chapter_ids.filter((cid) => !moved.includes(cid));
        const tgtRest = tgt.chapter_ids.filter((cid) => !moved.includes(cid));
        const at = Math.max(0, Math.min(index, tgtRest.length));
        tgtRest.splice(at, 0, ...moved);
        await setCampusExamTopics({ data: { campus_exam_id: drag.fromExam, chapter_ids: srcRest, source_file_id: getArmedSourceFileId() } });
        await setCampusExamTopics({ data: { campus_exam_id: targetExamId, chapter_ids: tgtRest, source_file_id: getArmedSourceFileId() } });
      }
      setTopicSel(new Set()); selAnchor.current = null;
      refresh();
    } catch (e) { alert(e instanceof Error ? e.message : "Move failed."); }
  };
  const topicDnd = { sel: topicSel, drag: tDrag, over: tOver, onRowClick: clickTopicRow, onDragStart: startTopicDrag, onDragEnd: () => { setTDrag(null); setTOver(null); }, setOver: setTOver, onDrop: dropTopics };

  const doCow = async () => { setCowConfirm(false); try { await copyResolvedIntoLevel({ data: scope }); refresh(); } catch (e) { alert(e instanceof Error ? e.message : "Copy failed."); } };
  const openRevert = async () => { try { setRevertDiff(await revertMapToInherited({ data: { ...scope, apply: false } })); } catch { /* ignore */ } };
  const doRevert = async () => { if (!revertDiff) return; try { await revertMapToInherited({ data: { ...scope, apply: true } }); setRevertDiff(null); refresh(); } catch (e) { alert(e instanceof Error ? e.message : "Revert failed."); } };
  const markVerified = async () => { try { await setMapStatus({ data: { ...scope, status: "verified" } }); refresh(); } catch (e) { alert(e instanceof Error ? e.message : "Couldn't verify."); } };

  const badgeColor = status === "verified" ? "#3BF5A0" : status === "edited" ? NEON.text : NEON.muted;
  return (
    <div className="mb-0.5" style={starter ? { borderBottom: `1px solid ${NEON.borderSoft}`, paddingBottom: 2, marginBottom: 4 } : undefined}>
      <button className="flex w-full items-center gap-1 px-0.5 py-1 text-left hover:bg-white/5" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown className="h-3 w-3 shrink-0 opacity-70" /> : <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />}
        {starter ? <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: NEON.yellow }} /> : <GraduationCap className="h-3.5 w-3.5 shrink-0" style={{ color: "#C9A9F5" }} />}
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" style={{ color: starter ? NEON.yellow : NEON.text }}>{campus.name}</span>
        <span className="shrink-0 rounded px-1 text-[8.5px] font-bold uppercase tracking-wide" title={status === "verified" ? `Verified from: ${(meta?.verifiedFiles ?? []).map((f) => f.name).join(", ") || "linked file"}` : status} style={{ color: badgeColor, border: `1px solid ${badgeColor}55` }}>{status === "verified" ? "✓ verified" : status}</span>
        {!starter && <span className="shrink-0 text-[9px] tabular-nums opacity-50">{campus.exam_count}ex · {campus.topic_count}t</span>}
      </button>
      {open && (
        <div className="ml-4 border-l pl-1.5" style={{ borderColor: NEON.borderSoft }}>
          {(examsQ.isLoading || (inherited && starterQ.isLoading)) && <div className="px-1 py-0.5 text-[10px] italic" style={{ color: NEON.muted }}>Loading…</div>}

          {inherited ? (
            <>
              <div className="px-1 py-0.5 text-[9.5px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>inherited from Starter Map</div>
              <div style={{ opacity: 0.55 }}>
                {starterExams.map((ex) => (
                  <div key={ex.id} className="px-1 py-0.5">
                    <span className="text-[11.5px] font-semibold" style={{ color: NEON.text }}>▸ {ex.name}</span>
                    <span className="ml-1 text-[9px] tabular-nums" style={{ color: NEON.muted }}>{ex.chapter_ids.length} topics</span>
                  </div>
                ))}
                {!starterQ.isLoading && starterExams.length === 0 && <div className="px-1 py-0.5 text-[10px] italic" style={{ color: NEON.muted }}>Starter Map is empty (apply 0113 + snapshot).</div>}
              </div>
              <button className="mt-0.5 rounded px-1.5 py-1 text-[10.5px] font-bold" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setCowConfirm(true)}>Edit this campus's map…</button>
            </>
          ) : (
            <>
              {exams.map((ex) => <ExamRow key={ex.id} exam={ex} topics={topics} onChange={refresh} localOv={localOv} setLocalNum={setLocalNum} dnd={topicDnd} />)}
              {adding ? (
                <div className="px-0.5 py-1"><InlineInput initial={`Exam ${exams.length + 1}`} placeholder="Exam name…" onCommit={async (v) => { setAdding(false); await createCampusExam({ data: { campus_id: campusId, course_id: course.id, name: v } }); refresh(); }} onCancel={() => setAdding(false)} /></div>
              ) : (
                <AddRow label="Add exam" onClick={() => setAdding(true)} />
              )}
              {/* status controls — verified is manual + requires a linked inbound file (0113) */}
              {!starter && meta?.hasOwnRows && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 px-0.5 pb-1">
                  {status !== "verified" ? (
                    <button className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={() => void markVerified()} title="Requires >=1 linked inbound file (Prompt 2 links them from the Inbound Files dashboard)">mark verified</button>
                  ) : (
                    <>
                      <button className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={async () => { await setMapStatus({ data: { ...scope, status: "edited" } }); refresh(); }}>back to edited</button>
                      <button className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: meta?.chapterLabelsOn ? NEON.cyan : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={async () => { await setChapterLabelsOn({ data: { ...scope, on: !meta?.chapterLabelsOn } }); refresh(); }} title="Chapter labels render student-side ONLY on verified maps with this on">ch labels {meta?.chapterLabelsOn ? "on" : "off"}</button>
                    </>
                  )}
                  <button className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: "#F0785A", border: `1px solid ${NEON.borderSoft}` }} onClick={() => void openRevert()}>revert to inherited</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* copy-on-write confirm — shown ONCE, the moment inheritance becomes a real map */}
      {cowConfirm && (
        <div className="fixed inset-0 z-[1000] grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setCowConfirm(false)}>
          <div className="w-[300px] rounded-xl p-4" style={{ background: "#0F1720", border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-bold">Create {campus.name}'s own map?</p>
            <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: NEON.muted }}>This copies the current Starter Map into {campus.name}'s own rows; edits then apply only to {campus.name}.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${NEON.border}`, color: NEON.muted }} onClick={() => setCowConfirm(false)}>Cancel</button>
              <button className="rounded px-3 py-1.5 text-[12px] font-bold" style={{ background: NEON.yellow, color: "#0B1322" }} onClick={() => void doCow()}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* revert-to-inherited confirm — with the student-side diff */}
      {revertDiff && (
        <div className="fixed inset-0 z-[1000] grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setRevertDiff(null)}>
          <div className="w-[320px] rounded-xl p-4" style={{ background: "#0F1720", border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-bold">Revert {campus.name} to inherited?</p>
            <p className="mt-1.5 text-[11.5px]" style={{ color: NEON.muted }}>Drops this map; students fall back to the {revertDiff.afterLevel === "campus" ? "campus map" : "Starter Map"}:</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
              <div><p className="font-bold uppercase" style={{ color: "#F0785A" }}>Now</p>{revertDiff.before.map((e, i) => <p key={i} style={{ color: NEON.muted }}>{e.label} · {e.topics}t</p>)}</div>
              <div><p className="font-bold uppercase" style={{ color: "#3BF5A0" }}>After</p>{revertDiff.after.map((e, i) => <p key={i} style={{ color: NEON.muted }}>{e.label} · {e.topics}t</p>)}</div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${NEON.border}`, color: NEON.muted }} onClick={() => setRevertDiff(null)}>Cancel</button>
              <button className="rounded px-3 py-1.5 text-[12px] font-bold" style={{ background: "#F0785A", color: "#1A0B08" }} onClick={() => void doRevert()}>Revert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- TEXTBOOKS MANAGER — title/edition + ordered chapter list, keyed on chapter_key ----------
// One line per chapter: "key | number | title". Renumbering an edition = edit the number field
// only; unit links stay keyed on the chapter identity.
function TextbooksModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const booksQ = useQuery({ queryKey: ["textbooks"], queryFn: () => listTextbooks(), networkMode: "always" });
  const books = booksQ.data ?? [];
  const [sel, setSel] = useState<string | "new" | null>(null);
  const cur = sel && sel !== "new" ? books.find((b) => b.id === sel) ?? null : null;
  const [title, setTitle] = useState("");
  const [edition, setEdition] = useState("");
  const [chapterText, setChapterText] = useState("");
  useEffect(() => {
    if (cur) { setTitle(cur.title); setEdition(cur.edition ?? ""); setChapterText(cur.chapters.map((c) => `${c.chapter_key} | ${c.number} | ${c.title}`).join("\n")); }
    else if (sel === "new") { setTitle(""); setEdition(""); setChapterText(""); }
  }, [sel, cur]);
  const save = async () => {
    const chapters = chapterText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [key, num, ...rest] = l.split("|").map((x) => x.trim());
      return { chapter_key: key || "", number: parseInt(num ?? "0", 10) || 0, title: rest.join(" | ") };
    }).filter((c) => c.chapter_key);
    try {
      await saveTextbook({ data: { id: cur?.id ?? null, title: title.trim(), edition: edition.trim() || null, chapters } });
      qc.invalidateQueries({ queryKey: ["textbooks"] });
      setSel(null);
    } catch (e) { alert(e instanceof Error ? e.message : "Save failed."); }
  };
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="w-[380px] max-h-[80vh] overflow-y-auto rounded-xl p-4" style={{ background: "#0F1720", border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold">Textbooks</p>
          <button className="opacity-60 hover:opacity-100" onClick={onClose}><X className="h-3.5 w-3.5" /></button>
        </div>
        {sel === null ? (
          <>
            {books.length === 0 && <p className="mt-2 text-[11px] italic" style={{ color: NEON.muted }}>No textbooks yet (needs 0113).</p>}
            {books.map((b) => (
              <button key={b.id} className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-white/5" onClick={() => setSel(b.id)}>
                <span className="min-w-0 flex-1 truncate">{b.title}{b.edition ? ` · ${b.edition}` : ""}</span>
                <span className="shrink-0 text-[9px] tabular-nums" style={{ color: NEON.muted }}>{b.chapters.length} ch</span>
              </button>
            ))}
            <AddRow label="Add textbook" onClick={() => setSel("new")} />
          </>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title…" className="rounded px-2 py-1.5 text-[12px] outline-none" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.border}`, color: NEON.text }} />
            <input value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="Edition (optional)…" className="rounded px-2 py-1.5 text-[12px] outline-none" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.border}`, color: NEON.text }} />
            <textarea value={chapterText} onChange={(e) => setChapterText(e.target.value)} rows={10} placeholder={"One chapter per line:\nkey | number | title\ne.g. accounting-cycle | 3 | The Accounting Cycle"} className="rounded px-2 py-1.5 font-mono text-[11px] outline-none" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.border}`, color: NEON.text }} />
            <div className="flex justify-end gap-2">
              <button className="rounded px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${NEON.border}`, color: NEON.muted }} onClick={() => setSel(null)}>Back</button>
              <button className="rounded px-3 py-1.5 text-[12px] font-bold disabled:opacity-40" style={{ background: NEON.yellow, color: "#0B1322" }} disabled={!title.trim()} onClick={() => void save()}>Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TopicDnd {
  sel: Set<string>;
  drag: { fromExam: string; ids: string[] } | null;
  over: { examId: string; index: number } | null;
  onRowClick: (examId: string, chapterId: string, ev: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onDragStart: (examId: string, chapterId: string) => void;
  onDragEnd: () => void;
  setOver: (o: { examId: string; index: number } | null) => void;
  onDrop: (targetExamId: string, index: number) => void;
}

function ExamRow({ exam, topics, onChange, localOv, setLocalNum, dnd }: { exam: CampusExamRow; topics: Topic[]; onChange: () => void; localOv: Map<string, { local_number: number | null; local_order: number | null }>; setLocalNum: (chapter_id: string, n: number | null) => void; dnd: TopicDnd }) {
  const [pick, setPick] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [cov, setCov] = useState<number>(exam.coverage_pct ?? 80); // gap-meter % (landing)
  const selected = new Set(exam.chapter_ids);
  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const numOf = (id: string) => localOv.get(id)?.local_number ?? null;
  const toggle = async (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); const ordered = topics.filter((t) => next.has(t.id)).map((t) => t.id); await setCampusExamTopics({ data: { campus_exam_id: exam.id, chapter_ids: ordered, source_file_id: getArmedSourceFileId() } }); onChange(); };
  return (
    <div className="mb-0.5 rounded">
      <div className="group flex items-center gap-1 px-0.5 py-0.5">
        <span className="text-[11px]" style={{ color: "#F0B24A" }}>▸</span>
        {renaming ? (
          <InlineInput initial={exam.name} onCommit={async (v) => { setRenaming(false); await renameCampusExam({ data: { id: exam.id, name: v } }); onChange(); }} onCancel={() => setRenaming(false)} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold" style={{ color: NEON.text }} onDoubleClick={() => setRenaming(true)} title="Double-click to rename">{exam.name}</span>
        )}
        <span className="flex shrink-0 items-center gap-0.5" title="Gap-meter coverage % on the landing (default 80)">
          <input type="number" min={0} max={100} value={cov}
            onChange={(e) => setCov(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            onBlur={() => { void setCampusExamCoverage({ data: { campus_exam_id: exam.id, coverage_pct: cov } }); }}
            className="w-8 rounded bg-transparent px-0.5 text-right text-[10px] outline-none" style={{ border: `1px solid ${NEON.border}`, color: NEON.muted }} />
          <span className="text-[9px]" style={{ color: NEON.muted }}>%</span>
        </span>
        <button className="shrink-0 rounded px-1 py-0.5 text-[10px] opacity-70 hover:bg-white/10 hover:opacity-100" onClick={() => setPick((v) => !v)} title="Choose the topics on this exam">{selected.size} topics ▾</button>
        <button className="shrink-0 rounded px-1 py-0.5 text-[10px] opacity-0 hover:bg-white/10 group-hover:opacity-60" onClick={async () => { await setCampusExamStatus({ data: { id: exam.id, status: "archived" } }); onChange(); }} title="Archive this exam"><X className="h-3 w-3" /></button>
      </div>
      {/* TOPIC ROWS (Prompt 2A) — the exam's topics in MAP order. Click selects (accent left-border
          + tint); Shift+click range · Ctrl+click toggle · Esc clears. Drag reorders within the exam
          or moves between exams under this campus; an insertion LINE shows exactly where the drop
          lands; a selected stack drags together with a count badge. */}
      {exam.chapter_ids.length > 0 && !pick && (
        <div className="ml-3 pb-1"
          onDragOver={(e) => { if (dnd.drag) { e.preventDefault(); if (dnd.over?.examId !== exam.id) dnd.setOver({ examId: exam.id, index: exam.chapter_ids.length }); } }}
          onDrop={(e) => { if (dnd.drag) { e.preventDefault(); dnd.onDrop(exam.id, dnd.over?.examId === exam.id ? dnd.over.index : exam.chapter_ids.length); } }}>
          {exam.chapter_ids.map((cid, i) => {
            const t = topicById.get(cid);
            const key = `${exam.id}|${cid}`;
            const isSel = dnd.sel.has(key);
            const dragging = !!dnd.drag && dnd.drag.fromExam === exam.id && dnd.drag.ids.includes(cid);
            const dragLead = dragging && dnd.drag!.ids[0] === cid;
            const dropLine = dnd.over?.examId === exam.id && dnd.over.index === i;
            const n = numOf(cid);
            return (
              <div key={cid}>
                {dropLine && <div className="mx-1 my-0.5 h-0.5 rounded-full" style={{ background: NEON.cyan }} />}
                <div
                  className="group/tr flex items-center gap-1 rounded pr-0.5 text-[10.5px]"
                  draggable
                  style={{
                    borderLeft: isSel ? `3px solid ${NEON.yellow}` : "3px solid transparent",
                    background: isSel ? "rgba(252,163,17,0.10)" : "transparent",
                    color: NEON.cyan,
                    opacity: dragging ? 0.35 : 1,
                    transform: dragging ? "scale(0.98)" : "none",
                    transition: "transform 120ms, opacity 120ms, background 120ms",
                    cursor: "grab",
                  }}
                  onClick={(e) => dnd.onRowClick(exam.id, cid, e)}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; dnd.onDragStart(exam.id, cid); }}
                  onDragEnd={dnd.onDragEnd}
                  onDragOver={(e) => {
                    if (!dnd.drag) return;
                    e.preventDefault(); e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    const below = e.clientY > r.top + r.height / 2;
                    const base = exam.chapter_ids.filter((x) => !(dnd.drag!.fromExam === exam.id && dnd.drag!.ids.includes(x))).indexOf(cid);
                    const idx = base < 0 ? i + (below ? 1 : 0) : base + (below ? 1 : 0);
                    if (dnd.over?.examId !== exam.id || dnd.over?.index !== idx) dnd.setOver({ examId: exam.id, index: idx });
                  }}
                  onDrop={(e) => { if (dnd.drag) { e.preventDefault(); e.stopPropagation(); dnd.onDrop(exam.id, dnd.over?.examId === exam.id ? dnd.over.index : i); } }}
                >
                  <GripVertical className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover/tr:opacity-50" />
                  <span className="min-w-0 flex-1 truncate py-0.5">{n != null ? `#${n} · ` : ""}{t ? topicLabel(t) : cid.slice(0, 8)}</span>
                  {dragLead && dnd.drag!.ids.length > 1 && <span className="shrink-0 rounded-full px-1.5 text-[9px] font-bold" style={{ background: NEON.yellow, color: "#0B1322" }}>{dnd.drag!.ids.length}</span>}
                </div>
                {dnd.over?.examId === exam.id && dnd.over.index === i + 1 && i === exam.chapter_ids.length - 1 && <div className="mx-1 my-0.5 h-0.5 rounded-full" style={{ background: NEON.cyan }} />}
              </div>
            );
          })}
        </div>
      )}
      {pick && (
        <div className="ml-3 mb-1 max-h-52 overflow-y-auto rounded" style={{ border: `1px solid ${NEON.border}`, background: "rgba(0,0,0,0.25)" }}>
          {topics.length === 0 && <div className="px-2 py-1 text-[10px] italic" style={{ color: NEON.muted }}>No topics yet — add some above.</div>}
          {topics.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-white/5">
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggle(t.id)}>
                <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm text-[9px]" style={{ border: `1px solid ${selected.has(t.id) ? NEON.cyan : NEON.border}`, background: selected.has(t.id) ? NEON.cyan : "transparent", color: "#06121A" }}>{selected.has(t.id) ? "✓" : ""}</span>
                <span className="min-w-0 flex-1 truncate">{topicLabel(t)}</span>
              </button>
              <LocalNumInput value={numOf(t.id)} onCommit={(n) => setLocalNum(t.id, n)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- add-a-campus search ---------------------------------------------------------------------
function AddCampus({ course, onDone, onCancel }: { course: CourseOption; onDone: () => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const resultsQ = useQuery({ queryKey: ["campus-search", q], queryFn: () => searchCampuses({ data: { q } }), enabled: q.trim().length >= 2, networkMode: "always" });
  const results = resultsQ.data ?? [];
  // COPY-ON-WRITE: adding a campus REGISTERS it as inherited (no exam rows — it resolves to the
  // Starter Map until first edited). Pre-0113 (map_meta absent) falls back to the old create-Exam-1.
  const add = async (c: CampusOpt) => {
    try { await registerMapLevel({ data: { courseId: course.id, campusId: c.id, professorId: null } }); }
    catch { await createCampusExam({ data: { campus_id: c.id, course_id: course.id, name: "Exam 1" } }); }
    onDone();
  };
  return (
    <div className="rounded p-1" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${NEON.borderSoft}` }}>
      <div className="flex items-center gap-1 rounded px-1.5 py-1" style={{ background: "rgba(0,0,0,0.3)" }}>
        <Search className="h-3 w-3 shrink-0 opacity-60" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campuses…" className="w-full bg-transparent text-[12px] outline-none" style={{ color: NEON.text }} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }} />
        <button onClick={onCancel} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
      </div>
      <div className="flex flex-wrap gap-1 px-0.5 py-1">
        {SEC_TARGETS.slice(0, 4).map((n) => <button key={n} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(201,169,245,0.14)", color: "#C9A9F5" }} onClick={() => setQ(TARGET_SEARCH[n] ?? n)}>{n}</button>)}
      </div>
      {q.trim().length >= 2 && (
        <div className="max-h-48 overflow-y-auto">
          {resultsQ.isLoading && <div className="px-2 py-1 text-[10px] italic" style={{ color: NEON.muted }}>Searching…</div>}
          {!resultsQ.isLoading && results.length === 0 && <div className="px-2 py-1 text-[10px] italic" style={{ color: NEON.muted }}>No matches.</div>}
          {results.map((c) => (
            <button key={c.id} className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] hover:bg-white/5" onClick={() => add(c)}>
              <Plus className="h-3 w-3 shrink-0 opacity-60" /><span className="min-w-0 flex-1 truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- little shared bits ----------------------------------------------------------------------
function SectionHeader({ open, onToggle, icon, label, count, color, hideCount }: { open: boolean; onToggle: () => void; icon: ReactNode; label: string; count: number; color: string; hideCount?: boolean }) {
  return (
    <button className="flex w-full items-center gap-1.5 rounded px-1 py-1.5 text-left hover:bg-white/5" onClick={onToggle}>
      {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-80" />}
      <span className="shrink-0" style={{ color }}>{icon}</span>
      <span className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color }}>{label}</span>
      {!hideCount && <span className="shrink-0 text-[9px] tabular-nums opacity-45">{count}</span>}
    </button>
  );
}

function LocalNumInput({ value, onCommit }: { value: number | null; onCommit: (n: number | null) => void }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  useEffect(() => { setV(value == null ? "" : String(value)); }, [value]);
  const commit = () => { const t = v.trim(); if (t === "") { if (value != null) onCommit(null); return; } const n = Number(t); if (Number.isFinite(n) && n >= 0) { if (n !== value) onCommit(n); } else setV(value == null ? "" : String(value)); };
  return (
    <input value={v} inputMode="numeric" placeholder="#" title="This campus's local chapter # for this topic"
      className="w-8 shrink-0 rounded px-1 py-0.5 text-center text-[10px] tabular-nums outline-none"
      style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.border}`, color: NEON.text }}
      onClick={(e) => e.stopPropagation()} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); } else if (e.key === "Escape") { setV(value == null ? "" : String(value)); (e.target as HTMLInputElement).blur(); } }}
    />
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] opacity-60 hover:bg-white/5 hover:opacity-100" style={{ color: NEON.muted }} onClick={onClick}>
      <Plus className="h-3 w-3 shrink-0" /> {label}
    </button>
  );
}

// ---- INBOUND FILES DASHBOARD (Prompt 2C) -----------------------------------------------------
// The provenance worklist: date · campus · professor · student email · files (signed-URL open) ·
// reviewed ☐ · notes (inline) · reviewer. Filters: unreviewed-only + campus text. "Open in mapper"
// ARMS the file — subsequent map edits/topic creations stamp source_file_id automatically. Emails
// appear ONLY here (authoring), never student-facing.
function InboundFilesModal({ onClose, onArm }: { onClose: () => void; onArm: (f: { id: string; label: string }) => void }) {
  const qc = useQueryClient();
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [campusFilter, setCampusFilter] = useState("");
  const rowsQ = useQuery({ queryKey: ["inbound-files", unreviewedOnly, campusFilter], queryFn: () => listInboundFiles({ data: { unreviewedOnly, campus: campusFilter || undefined } }), networkMode: "always" });
  const rows = rowsQ.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["inbound-files"] });
  const openFile = async (f: { name: string; path: string; bucket?: string }) => {
    const { url } = await getInboundFileUrl({ data: { path: f.path, bucket: f.bucket ?? "syllabus-submissions" } });
    if (url) window.open(url, "_blank"); else alert("Couldn't sign a URL for that file (dummy rows have no real file).");
  };
  const fmt = (s: string) => { try { return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return "—"; } };
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="w-[520px] max-h-[82vh] overflow-y-auto rounded-xl p-4" style={{ background: "#0F1720", border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold">Inbound Files</p>
          <button className="opacity-60 hover:opacity-100" onClick={onClose}><X className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => setUnreviewedOnly((v) => !v)} className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: unreviewedOnly ? "#0B1322" : NEON.muted, background: unreviewedOnly ? NEON.yellow : "transparent", border: `1px solid ${unreviewedOnly ? NEON.yellow : NEON.borderSoft}` }}>unreviewed only</button>
          <input value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)} placeholder="Filter by campus…" className="min-w-0 flex-1 rounded px-2 py-1 text-[11px] outline-none" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.border}`, color: NEON.text }} />
          <button className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={async () => { const r = await seedInboundDummies(); refresh(); alert(r.seeded ? `Seeded ${r.seeded} test rows.` : "Test rows already exist."); }}>seed test rows</button>
        </div>
        {rowsQ.isLoading && <p className="mt-3 text-[11px] italic" style={{ color: NEON.muted }}>Loading…</p>}
        {!rowsQ.isLoading && rows.length === 0 && <p className="mt-3 text-[11px] italic" style={{ color: NEON.muted }}>No inbound files{unreviewedOnly || campusFilter ? " match the filters" : " yet"} (needs 0113 + submissions).</p>}
        {rows.map((r) => <InboundRow key={r.id} row={r} onOpenFile={openFile} onArm={onArm} onChange={refresh} fmt={fmt} />)}
      </div>
    </div>
  );
}

function InboundRow({ row, onOpenFile, onArm, onChange, fmt }: { row: InboundFileRow; onOpenFile: (f: { name: string; path: string; bucket?: string }) => void; onArm: (f: { id: string; label: string }) => void; onChange: () => void; fmt: (s: string) => string }) {
  const [notes, setNotes] = useState(row.notes ?? "");
  const label = row.files?.[0]?.name ?? row.campus_name ?? "file";
  return (
    <div className="mt-2 rounded-lg p-2.5" style={{ background: "rgba(245,239,230,0.04)", border: `1px solid ${NEON.borderSoft}` }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="shrink-0 tabular-nums" style={{ color: NEON.muted }}>{fmt(row.submitted_at)}</span>
        <span className="min-w-0 font-semibold" style={{ color: NEON.text }}>{row.campus_name ?? "—"}</span>
        {row.professor_name && <span style={{ color: NEON.cyan }}>Prof. {row.professor_name}</span>}
        {row.student_email && <span style={{ color: NEON.muted }}>{row.student_email}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 text-[10px]" style={{ color: row.reviewed ? "#3BF5A0" : NEON.muted }}>
            <input type="checkbox" checked={row.reviewed} onChange={async (e) => { await updateInboundFile({ data: { id: row.id, reviewed: e.target.checked, reviewer: e.target.checked ? "Lee" : null } }); onChange(); }} />
            reviewed{row.reviewer && row.reviewed ? ` · ${row.reviewer}` : ""}
          </label>
        </span>
      </div>
      {(row.files ?? []).length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {row.files.map((f, i) => (
            <button key={i} className="rounded px-1.5 py-0.5 text-[10px] hover:bg-white/10" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => void onOpenFile(f)}>📄 {f.name}</button>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={async () => { if ((row.notes ?? "") !== notes) { await updateInboundFile({ data: { id: row.id, notes: notes || null } }); onChange(); } }} placeholder="Notes…" className="min-w-0 flex-1 rounded px-2 py-1 text-[10.5px] outline-none" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} />
        <button className="shrink-0 rounded px-2 py-1 text-[10px] font-bold" style={{ color: "#C9A9F5", border: `1px solid ${NEON.borderSoft}` }} onClick={() => onArm({ id: row.id, label })} title="Arm this file — map edits made while reviewing link it as their source automatically">Open in mapper</button>
      </div>
    </div>
  );
}
