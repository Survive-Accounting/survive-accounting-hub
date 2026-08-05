// OUTLINE = the Study Canvas launcher (authoring navigation ONLY). Three levels and
// nothing else: Course > Topic > CEQ Set. Clicking a set opens it directly in CEQ
// Studio — the outline is a launcher, not a workspace. Courses render in a fixed order
// and accordion (one open at a time). The last-opened set is remembered across sessions
// and its course is expanded on load. A single dot marks published vs unpublished; no
// counts, no progress bars, no badges. "Topic" IS a `chapters` row (topicId → chapters.id);
// chapter numbering never shows (topicLabel strips it) — the product is textbook-agnostic.
import { useEffect, useMemo, useState } from "react";
import { useNodes } from "@xyflow/react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Circle } from "lucide-react";

import { NEON } from "./theme";
import { useFrameNav } from "./FrameNavContext";
import { useDecks } from "./DecksContext";
import type { CardNode, DeckDef, LessonBox } from "./types";
import { courseLabel, fetchCourseOptions, topicLabel, type CourseOption } from "@/lib/je-api";

// Fixed course order for the launcher (textbook sequence). Unknown/missing → end.
const COURSE_ORDER = ["Start Here", "Intro 1", "Intro 2", "IA1", "IA2"];
const courseRank = (name: string) => {
  const i = COURSE_ORDER.findIndex((o) => o.toLowerCase() === name.trim().toLowerCase());
  return i < 0 ? COURSE_ORDER.length + 1 : i;
};
// Set display name — drop a legacy "Ch N ·" prefix if present (textbook-agnostic).
const setName = (d: DeckDef) => (d.name ?? "Set").replace(/^\s*ch\s*\d+\s*·\s*/i, "").trim() || "Set";
const LAST_SET_KEY = "sa-study-last-set";

export function OutlinePanel() {
  const nodes = useNodes() as CardNode[];
  const { decks } = useDecks();
  const nav = useFrameNav();
  const courseOptionsQ = useQuery({ queryKey: ["course-options"], queryFn: () => fetchCourseOptions(), staleTime: 600_000, networkMode: "always" });
  const courseOptions = useMemo<CourseOption[]>(() => courseOptionsQ.data ?? [], [courseOptionsQ.data]);

  const cardDecks = useMemo(() => decks.filter((d) => d.payloadType === "cards"), [decks]);
  const decksByTopic = useMemo(() => {
    const m = new Map<string, DeckDef[]>();
    for (const d of cardDecks) if (d.topicId) { const l = m.get(d.topicId) ?? []; l.push(d); m.set(d.topicId, l); }
    return m;
  }, [cardDecks]);
  const libraryDecks = useMemo(() => cardDecks.filter((d) => !d.topicId), [cardDecks]);

  // PUBLISHED per set — a set's home lesson (deck.lessonId) is a published video
  // (lesson node status PUBLISHED / a Mux playback id). No lessonId ⇒ shown unpublished.
  const publishedLessonIds = useMemo(() => {
    const s = new Set<string>();
    for (const n of nodes) {
      if (n.type !== "lesson") continue;
      const d = n.data as unknown as LessonBox & { muxPlaybackId?: string };
      if (d.status === "PUBLISHED" || d.muxPlaybackId) s.add(n.id);
    }
    return s;
  }, [nodes]);
  const isPublished = (d: DeckDef) => !!d.lessonId && publishedLessonIds.has(d.lessonId);

  // Courses in fixed order, keeping only those that actually have sets.
  const courses = useMemo(() => {
    const withSets = courseOptions
      .map((c) => ({ c, topics: c.chapters.filter((ch) => (decksByTopic.get(ch.id)?.length ?? 0) > 0) }))
      .filter((x) => x.topics.length > 0);
    return withSets.sort((a, b) => courseRank(courseLabel(a.c)) - courseRank(courseLabel(b.c)) || courseLabel(a.c).localeCompare(courseLabel(b.c)));
  }, [courseOptions, decksByTopic]);

  // ACCORDION — one course open at a time. Default: the last-opened set's course.
  const lastSetId = useMemo(() => { try { return localStorage.getItem(LAST_SET_KEY); } catch { return null; } }, []);
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [initExpanded, setInitExpanded] = useState(false);
  useEffect(() => {
    if (initExpanded || courses.length === 0) return;
    // Expand the course that owns the last-opened set, else the first course.
    const last = lastSetId ? cardDecks.find((d) => d.id === lastSetId) : null;
    const ownerCourseId = last?.topicId
      ? courseOptions.find((c) => c.chapters.some((ch) => ch.id === last.topicId))?.id
      : null;
    setOpenCourse(ownerCourseId ?? courses[0]?.c.id ?? null);
    setInitExpanded(true);
  }, [courses, cardDecks, courseOptions, lastSetId, initExpanded]);

  const openSet = (setId: string) => {
    try { localStorage.setItem(LAST_SET_KEY, setId); } catch { /* ignore */ }
    nav.openStudioSet(setId);
  };

  // h-full lets the docked v2 sidebar (class sa-dock) give it the full column; the
  // 74vh cap still applies inside the v1 drawer, whose panel has no fixed height.
  return (
    <div className="nodrag nowheel h-full max-h-[74vh] w-full overflow-y-auto px-1 py-1 text-[12px] [.sa-dock_&]:max-h-full" style={{ color: NEON.text }}>
      <div className="px-1 pb-1 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: NEON.muted }}>Sets</div>
      {courseOptionsQ.isLoading && <p className="px-1.5 py-2 text-[11px] italic" style={{ color: NEON.muted }}>Loading courses…</p>}
      {!courseOptionsQ.isLoading && courses.length === 0 && (
        <p className="px-1.5 py-2 text-[11px] italic leading-snug" style={{ color: NEON.muted }}>No CEQ sets yet. Create one in CEQ Studio and assign it to a topic.</p>
      )}

      {courses.map(({ c, topics }) => {
        const cOpen = openCourse === c.id;
        return (
          <div key={c.id} className="mb-0.5">
            {/* COURSE (accordion header) */}
            <button
              className="flex w-full items-center gap-1 rounded px-1 py-1 text-left hover:bg-white/5"
              style={{ color: NEON.yellow }}
              onClick={() => setOpenCourse((k) => (k === c.id ? null : c.id))}
              title={cOpen ? "Collapse" : "Expand"}
            >
              {cOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-[12px] font-black uppercase tracking-wide">{courseLabel(c)}</span>
            </button>

            {cOpen && (
              <div className="ml-2 border-l pl-2" style={{ borderColor: NEON.borderSoft }}>
                {topics.map((ch) => {
                  const tDecks = (decksByTopic.get(ch.id) ?? []).slice().sort((a, b) => setName(a).localeCompare(setName(b)));
                  return (
                    <div key={ch.id} className="mb-1">
                      {/* TOPIC (no chapter number — textbook-agnostic) */}
                      <div className="px-1 pt-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>{topicLabel(ch)}</div>
                      {/* SETS */}
                      {tDecks.map((d) => {
                        const pub = isPublished(d);
                        const active = d.id === lastSetId;
                        return (
                          <button
                            key={d.id}
                            className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-white/5"
                            style={{ background: active ? "rgba(252,163,17,0.10)" : "transparent" }}
                            onClick={() => openSet(d.id)}
                            title={`Open "${setName(d)}" in CEQ Studio${pub ? " · published" : " · not published"}`}
                          >
                            <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: pub ? "#3BF5A0" : "rgba(147,160,180,0.45)", fill: pub ? "#3BF5A0" : "transparent" }} />
                            <span className="min-w-0 flex-1 truncate" style={{ color: active ? NEON.yellow : NEON.text }}>{setName(d)}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* LIBRARY (unassigned) — sets with no topic; still launchable. */}
      {libraryDecks.length > 0 && (
        <div className="mt-1 border-t pt-1" style={{ borderColor: NEON.borderSoft }}>
          <div className="px-1 pt-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Library (unassigned)</div>
          {libraryDecks.slice().sort((a, b) => setName(a).localeCompare(setName(b))).map((d) => {
            const pub = isPublished(d);
            const active = d.id === lastSetId;
            return (
              <button key={d.id} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-white/5" style={{ background: active ? "rgba(252,163,17,0.10)" : "transparent" }} onClick={() => openSet(d.id)} title={`Open "${setName(d)}" in CEQ Studio`}>
                <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: pub ? "#3BF5A0" : "rgba(147,160,180,0.45)", fill: pub ? "#3BF5A0" : "transparent" }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: active ? NEON.yellow : NEON.text }}>{setName(d)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
