// OUTLINE = the Studio's left navigation. Four sections, accordion (one open at a time, the open
// one persisted): VIDEOS (finished/published) · TOPICS · CAMPUSES · MEMOS (opens the memo library
// on the right; it no longer renders by default). Navigation only — all editing happens in the
// canvas / Studio. Intro 1 is the focus course (full-color, editable topics); Intro 2 / IA1 / IA2
// render muted (view-only) beneath it. "Topic" IS a `chapters` row.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNodes } from "@xyflow/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, ChevronRight, Circle, GraduationCap, GripVertical, Layers, MessageSquare, Plus, Search, Video, X } from "lucide-react";

import { NEON } from "./theme";
import { useFrameNav } from "./FrameNavContext";
import { useDecks } from "./DecksContext";
import type { CardNode, DeckDef, LessonBox } from "./types";
import { courseLabel, fetchCourseOptions, topicLabel, type CourseOption } from "@/lib/je-api";
import { createChapter, renameChapter, reorderChapters } from "@/lib/canvas.functions";
import { listCampusChapterOverrides, searchCampuses, setCampusChapterOverride, type CampusOpt } from "@/lib/campus-overrides.functions";
import {
  createCampusExam, listCampusExams, listCourseCampuses, renameCampusExam,
  setCampusExamStatus, setCampusExamTopics, type CampusExamRow, type CourseCampusRow,
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
type SectionId = "videos" | "topics" | "campuses";

// ---- inline text editor (add / rename), Enter commits · Esc / blur cancels -------------------
function InlineInput({ initial = "", placeholder, onCommit, onCancel }: { initial?: string; placeholder?: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref} value={v} placeholder={placeholder}
      className="w-full rounded px-1.5 py-1 text-[12px] outline-none"
      style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.border}`, color: NEON.text }}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { const t = v.trim(); if (t) onCommit(t); else onCancel(); } else if (e.key === "Escape") onCancel(); }}
      onBlur={() => { const t = v.trim(); if (t && t !== initial) onCommit(t); else onCancel(); }}
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
  const decksByTopic = useMemo(() => {
    const m = new Map<string, DeckDef[]>();
    for (const d of cardDecks) if (d.topicId) { const l = m.get(d.topicId) ?? []; l.push(d); m.set(d.topicId, l); }
    return m;
  }, [cardDecks]);

  const publishedLessonIds = useMemo(() => {
    const s = new Set<string>();
    for (const n of nodes) { if (n.type !== "lesson") continue; const d = n.data as unknown as LessonBox & { muxPlaybackId?: string }; if (d.status === "PUBLISHED" || d.muxPlaybackId) s.add(n.id); }
    return s;
  }, [nodes]);
  const isPublished = (d: DeckDef) => !!d.lessonId && publishedLessonIds.has(d.lessonId);

  // Published videos = lesson nodes with a Mux playback id (finished/published).
  const videos = useMemo(() => nodes
    .filter((n) => n.type === "lesson" && !!(n.data as { muxPlaybackId?: string }).muxPlaybackId)
    .map((n) => { const d = n.data as unknown as LessonBox & { label?: string; videoChapter?: string; topic?: string }; return { id: n.id, title: (d.label ?? "Video").trim() || "Video", topic: (d.videoChapter ?? d.topic ?? "").trim() }; })
    .sort((a, b) => a.title.localeCompare(b.title)), [nodes]);

  const lastSetId = useMemo(() => { try { return localStorage.getItem(LAST_SET_KEY); } catch { return null; } }, []);
  const openSet = (setId: string) => { try { localStorage.setItem(LAST_SET_KEY, setId); } catch { /* ignore */ } nav.openStudioSet(setId); };

  // Accordion — one section open at a time; the open section is persisted.
  const [open, setOpen] = useState<SectionId | null>(() => { try { return (localStorage.getItem(OPEN_SECTION_KEY) as SectionId | null) ?? null; } catch { return null; } });
  const toggle = (id: SectionId) => setOpen((cur) => { const next = cur === id ? null : id; try { next ? localStorage.setItem(OPEN_SECTION_KEY, next) : localStorage.removeItem(OPEN_SECTION_KEY); } catch { /* ignore */ } return next; });

  return (
    <div className="nodrag nowheel h-full max-h-[74vh] w-full overflow-y-auto px-1 py-1 text-[12px] [.sa-dock_&]:max-h-full" style={{ color: NEON.text }}>
      {courseOptionsQ.isLoading && <p className="px-1.5 py-2 text-[11px] italic" style={{ color: NEON.muted }}>Loading…</p>}

      <SectionHeader open={open === "videos"} onToggle={() => toggle("videos")} icon={<Video className="h-3.5 w-3.5" />} label="Videos" count={videos.length} color={NEON.yellow} />
      {open === "videos" && (
        <div className="ml-2 border-l pl-1.5" style={{ borderColor: NEON.borderSoft }}>
          {videos.length === 0 && <div className="px-1 py-1 text-[10px] italic" style={{ color: NEON.muted }}>No published videos yet.</div>}
          {videos.map((v) => (
            <div key={v.id} className="flex items-center gap-1.5 px-1.5 py-1" title={v.title}>
              <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: "#3BF5A0", fill: "#3BF5A0" }} />
              <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: NEON.text }}>{v.title}</span>
              {v.topic && <span className="shrink-0 truncate text-[9px]" style={{ color: NEON.muted, maxWidth: 90 }}>{v.topic}</span>}
            </div>
          ))}
        </div>
      )}

      <SectionHeader open={open === "topics"} onToggle={() => toggle("topics")} icon={<Layers className="h-3.5 w-3.5" />} label="Topics" count={courses.length} color={NEON.cyan} />
      {open === "topics" && (
        <div className="ml-2 border-l pl-1.5" style={{ borderColor: NEON.borderSoft }}>
          {courses.length === 0 && <div className="px-1 py-1 text-[10px] italic" style={{ color: NEON.muted }}>No courses.</div>}
          {courses.map((c) => <CourseTopics key={c.id} course={c} focus={isFocusCourse(c)} decksByTopic={decksByTopic} isPublished={isPublished} openSet={openSet} lastSetId={lastSetId} />)}
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
    </div>
  );
}

// ---- TOPICS (per course; focus course editable, others muted view-only) ----------------------
function CourseTopics({ course, focus, decksByTopic, isPublished, openSet, lastSetId }: {
  course: CourseOption; focus: boolean; decksByTopic: Map<string, DeckDef[]>;
  isPublished: (d: DeckDef) => boolean; openSet: (id: string) => void; lastSetId: string | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(focus);
  const [openTopics, setOpenTopics] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["course-options"] });
  const topics = useMemo(() => (course.chapters ?? []).filter((ch) => ch.status !== "archived").sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9)), [course]);
  const toggleTopic = (id: string) => setOpenTopics((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const commitOrder = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = topics.map((t) => t.id); const from = ids.indexOf(dragId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1); ids.splice(to, 0, dragId);
    await reorderChapters({ data: { course_id: course.id, ordered_ids: ids } }); refresh();
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
            const tDecks = (decksByTopic.get(ch.id) ?? []).slice().sort((a, b) => setName(a).localeCompare(setName(b)));
            const tOpen = openTopics.has(ch.id);
            return (
              <div key={ch.id} className="rounded"
                style={{ background: overId === ch.id && dragId ? "rgba(79,163,227,0.12)" : "transparent", opacity: dragId === ch.id ? 0.4 : 1 }}
                onDragOver={focus ? (e) => { if (dragId) { e.preventDefault(); if (overId !== ch.id) setOverId(ch.id); } } : undefined}
                onDrop={focus ? (e) => { if (dragId) { e.preventDefault(); void commitOrder(ch.id); setDragId(null); setOverId(null); } } : undefined}>
                <div className="group flex items-center gap-1 px-0.5 py-0.5">
                  {focus && <span className="cursor-grab opacity-0 group-hover:opacity-60" draggable onDragStart={() => setDragId(ch.id)} onDragEnd={() => { setDragId(null); setOverId(null); }} title="Drag to reorder"><GripVertical className="h-3 w-3" /></span>}
                  <button className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => toggleTopic(ch.id)}>
                    {tOpen ? <ChevronDown className="h-3 w-3 shrink-0 opacity-70" /> : <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />}
                    {focus && renaming === ch.id ? (
                      <InlineInput initial={topicLabel(ch)} onCommit={async (v) => { setRenaming(null); await renameChapter({ data: { id: ch.id, chapter_name: v } }); refresh(); }} onCancel={() => setRenaming(null)} />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: focus ? NEON.cyan : NEON.muted }} onDoubleClick={focus ? (e) => { e.stopPropagation(); setRenaming(ch.id); } : undefined} title={focus ? "Double-click to rename" : undefined}>{topicLabel(ch)}</span>
                    )}
                    {tDecks.length > 0 && <span className="shrink-0 text-[9px] tabular-nums opacity-45">{tDecks.length}</span>}
                  </button>
                </div>
                {tOpen && (
                  <div className="ml-4 pb-0.5">
                    {tDecks.length === 0 && <div className="px-1 py-0.5 text-[10px] italic" style={{ color: NEON.muted }}>No sets yet</div>}
                    {tDecks.map((d) => {
                      const active = d.id === lastSetId; const pub = isPublished(d);
                      return (
                        <button key={d.id} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-white/5" style={{ background: active ? "rgba(252,163,17,0.10)" : "transparent" }} onClick={() => openSet(d.id)} title={`Open "${setName(d)}" in the Studio · ${d.status === "live" ? "LIVE" : "draft"}${pub ? " · video published" : ""}`}>
                          <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: d.status === "live" ? "#3BF5A0" : "#F0B24A", fill: d.status === "live" ? "#3BF5A0" : "transparent" }} />
                          <span className="min-w-0 flex-1 truncate" style={{ color: active ? NEON.yellow : NEON.text }}>{setName(d)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {focus && (adding ? (
            <div className="px-0.5 py-1"><InlineInput placeholder="New topic name…" onCommit={async (v) => { setAdding(false); await createChapter({ data: { course_id: course.id, chapter_name: v } }); refresh(); }} onCancel={() => setAdding(false)} /></div>
          ) : (
            <AddRow label="Add topic" onClick={() => setAdding(true)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- CAMPUSES (Intro-1 scoped) ---------------------------------------------------------------
function CampusesBody({ course, topics }: { course: CourseOption; topics: Topic[] }) {
  const [adding, setAdding] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const qc = useQueryClient();
  const campusesQ = useQuery({ queryKey: ["course-campuses", course.id], queryFn: () => listCourseCampuses({ data: { course_id: course.id } }), networkMode: "always" });
  const campuses = campusesQ.data ?? [];
  const missing = campusesQ.isError ? String((campusesQ.error as Error)?.message ?? "") : "";
  return (
    <>
      {missing && <p className="px-1 py-1 text-[10px] italic leading-snug" style={{ color: "#F0A0A0" }}>{missing}</p>}
      {!missing && campuses.length === 0 && <div className="px-1 py-0.5 text-[10px] italic" style={{ color: NEON.muted }}>No campuses mapped yet.</div>}
      {campuses.map((c) => <CampusRow key={c.campus_id} campus={c} course={course} topics={topics} />)}
      {adding ? (
        <AddCampus course={course} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["course-campuses", course.id] }); }} onCancel={() => setAdding(false)} />
      ) : (
        <AddRow label="Add campus" onClick={() => setAdding(true)} />
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

function CampusRow({ campus, course, topics }: { campus: CourseCampusRow; course: CourseOption; topics: Topic[] }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const examsQ = useQuery({ queryKey: ["campus-exams", campus.campus_id, course.id], queryFn: () => listCampusExams({ data: { campus_id: campus.campus_id, course_id: course.id } }), enabled: open, networkMode: "always" });
  const exams = (examsQ.data ?? []).filter((e) => e.status === "active");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["campus-exams", campus.campus_id, course.id] }); qc.invalidateQueries({ queryKey: ["course-campuses", course.id] }); };

  const topicIds = useMemo(() => topics.map((t) => t.id), [topics]);
  const ovQ = useQuery({ queryKey: ["campus-overrides", campus.campus_id], queryFn: () => listCampusChapterOverrides({ data: { campus_id: campus.campus_id, chapter_ids: topicIds } }), enabled: open && topicIds.length > 0, networkMode: "always" });
  const localOv = useMemo(() => { const m = new Map<string, { local_number: number | null; local_order: number | null }>(); for (const r of ovQ.data ?? []) m.set(r.chapter_id, { local_number: r.local_number, local_order: r.local_order }); return m; }, [ovQ.data]);
  const setLocalNum = async (chapter_id: string, n: number | null) => { const order = localOv.get(chapter_id)?.local_order ?? null; await setCampusChapterOverride({ data: { campus_id: campus.campus_id, chapter_id, local_number: n, local_order: order } }); qc.invalidateQueries({ queryKey: ["campus-overrides", campus.campus_id] }); };

  return (
    <div className="mb-0.5">
      <button className="flex w-full items-center gap-1 px-0.5 py-1 text-left hover:bg-white/5" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown className="h-3 w-3 shrink-0 opacity-70" /> : <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />}
        <GraduationCap className="h-3.5 w-3.5 shrink-0" style={{ color: "#C9A9F5" }} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" style={{ color: NEON.text }}>{campus.name}</span>
        <span className="shrink-0 text-[9px] tabular-nums opacity-50">{campus.exam_count}ex · {campus.topic_count}t</span>
      </button>
      {open && (
        <div className="ml-4 border-l pl-1.5" style={{ borderColor: NEON.borderSoft }}>
          {examsQ.isLoading && <div className="px-1 py-0.5 text-[10px] italic" style={{ color: NEON.muted }}>Loading…</div>}
          {exams.map((ex) => <ExamRow key={ex.id} exam={ex} topics={topics} onChange={refresh} localOv={localOv} setLocalNum={setLocalNum} />)}
          {adding ? (
            <div className="px-0.5 py-1"><InlineInput initial={`Exam ${exams.length + 1}`} placeholder="Exam name…" onCommit={async (v) => { setAdding(false); await createCampusExam({ data: { campus_id: campus.campus_id, course_id: course.id, name: v } }); refresh(); }} onCancel={() => setAdding(false)} /></div>
          ) : (
            <AddRow label="Add exam" onClick={() => setAdding(true)} />
          )}
        </div>
      )}
    </div>
  );
}

function ExamRow({ exam, topics, onChange, localOv, setLocalNum }: { exam: CampusExamRow; topics: Topic[]; onChange: () => void; localOv: Map<string, { local_number: number | null; local_order: number | null }>; setLocalNum: (chapter_id: string, n: number | null) => void }) {
  const [pick, setPick] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const selected = new Set(exam.chapter_ids);
  const selectedTopics = topics.filter((t) => selected.has(t.id));
  const numOf = (id: string) => localOv.get(id)?.local_number ?? null;
  const toggle = async (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); const ordered = topics.filter((t) => next.has(t.id)).map((t) => t.id); await setCampusExamTopics({ data: { campus_exam_id: exam.id, chapter_ids: ordered } }); onChange(); };
  return (
    <div className="mb-0.5 rounded">
      <div className="group flex items-center gap-1 px-0.5 py-0.5">
        <span className="text-[11px]" style={{ color: "#F0B24A" }}>▸</span>
        {renaming ? (
          <InlineInput initial={exam.name} onCommit={async (v) => { setRenaming(false); await renameCampusExam({ data: { id: exam.id, name: v } }); onChange(); }} onCancel={() => setRenaming(false)} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold" style={{ color: NEON.text }} onDoubleClick={() => setRenaming(true)} title="Double-click to rename">{exam.name}</span>
        )}
        <button className="shrink-0 rounded px-1 py-0.5 text-[10px] opacity-70 hover:bg-white/10 hover:opacity-100" onClick={() => setPick((v) => !v)} title="Choose the topics on this exam">{selected.size} topics ▾</button>
        <button className="shrink-0 rounded px-1 py-0.5 text-[10px] opacity-0 hover:bg-white/10 group-hover:opacity-60" onClick={async () => { await setCampusExamStatus({ data: { id: exam.id, status: "archived" } }); onChange(); }} title="Archive this exam"><X className="h-3 w-3" /></button>
      </div>
      {selectedTopics.length > 0 && !pick && (
        <div className="ml-3 flex flex-wrap gap-1 pb-1">
          {selectedTopics.map((t) => { const n = numOf(t.id); return <span key={t.id} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(79,163,227,0.14)", color: NEON.cyan }}>{n != null ? `#${n} · ` : ""}{topicLabel(t)}</span>; })}
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
  const add = async (c: CampusOpt) => { await createCampusExam({ data: { campus_id: c.id, course_id: course.id, name: "Exam 1" } }); onDone(); };
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
