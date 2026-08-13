// JE description picker (A12, course-scoped in the content reset) — the
// transaction description is CHOSEN from the scene-course's AUTHORED library
// (or free-typed). No scene course → an empty state points Lee at canvas
// settings. "Include archived" (buried at the bottom) folds the archived
// imported docs back in for reference/gap-filling — they're never deleted.
// Pure content: the caller portals it via CardPopover.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, PencilLine, Plus, Search, X } from "lucide-react";

import { chapterLabel, courseLabel, fetchCourseOptions } from "@/lib/je-api";
import { listScenarioPlacements, placeScenario, unplaceScenario } from "@/lib/canvas.functions";
import { PAPER } from "../theme";
import type { LibraryItem } from "../library";

/** Manage where one scenario is placed — existing placements (with remove) +
 *  "Also place in…" (course + chapter). The blast-radius knob: edit once, it's
 *  the same scenario everywhere placed. */
function PlacementPanel({ scenarioId, onChanged }: { scenarioId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const courses = useQuery({ queryKey: ["course-options"], queryFn: fetchCourseOptions, staleTime: 600_000, networkMode: "always" });
  const placements = useQuery({
    queryKey: ["scenario-placements", scenarioId],
    queryFn: () => listScenarioPlacements({ data: { scenario_id: scenarioId } }),
    staleTime: 30_000, networkMode: "always",
  });
  const [courseId, setCourseId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [busy, setBusy] = useState(false);
  const course = (courses.data ?? []).find((c) => c.id === courseId) ?? null;

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["scenario-placements", scenarioId] }); void qc.invalidateQueries({ queryKey: ["je-tree"] }); onChanged(); };

  const add = async () => {
    if (!courseId || !chapterId) return;
    setBusy(true);
    try { await placeScenario({ data: { scenario_id: scenarioId, course_id: courseId, chapter_id: chapterId } }); setChapterId(""); refresh(); }
    finally { setBusy(false); }
  };
  const remove = async (chId: string) => { setBusy(true); try { await unplaceScenario({ data: { scenario_id: scenarioId, chapter_id: chId } }); refresh(); } finally { setBusy(false); } };

  return (
    <div className="mb-1 rounded px-1.5 py-1.5" style={{ background: "#F7F4EE", border: `1px solid ${PAPER.line}` }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: PAPER.inkMuted }}>Used in</div>
      {(placements.data ?? []).length === 0 && <div className="text-[10px] italic" style={{ color: PAPER.inkFaint }}>Not placed anywhere yet.</div>}
      <div className="space-y-0.5">
        {(placements.data ?? []).map((p) => (
          <div key={p.chapter_id} className="flex items-center gap-1 text-[10.5px]" style={{ color: PAPER.ink }}>
            <span className="min-w-0 flex-1 truncate">{p.course_name ?? "?"} · {p.chapter_number != null ? `Ch ${p.chapter_number}` : (p.chapter_name ?? "")}{p.chapter_number != null && p.chapter_name ? ` ${p.chapter_name}` : ""}</span>
            <button className="shrink-0 rounded p-0.5 hover:bg-black/5 disabled:opacity-40" style={{ color: PAPER.red }} title="Remove placement" disabled={busy} onClick={() => void remove(p.chapter_id)}><X className="h-3 w-3" /></button>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1 border-t pt-1.5" style={{ borderColor: PAPER.line }}>
        <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setChapterId(""); }} className="min-w-0 flex-1 rounded px-1 py-0.5 text-[10px] outline-none" style={{ border: `1px solid ${PAPER.line}`, color: PAPER.ink, background: "#FFF" }}>
          <option value="">course…</option>
          {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{courseLabel(c)}</option>)}
        </select>
        <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} disabled={!course} className="min-w-0 flex-1 rounded px-1 py-0.5 text-[10px] outline-none" style={{ border: `1px solid ${PAPER.line}`, color: PAPER.ink, background: "#FFF" }}>
          <option value="">chapter…</option>
          {(course?.chapters ?? []).map((ch) => <option key={ch.id} value={ch.id}>{chapterLabel(ch)}</option>)}
        </select>
        <button className="shrink-0 rounded p-1 disabled:opacity-40" style={{ color: PAPER.navy, border: `1px solid ${PAPER.line}` }} title="Also place in this course-chapter" disabled={!courseId || !chapterId || busy} onClick={() => void add()}><Plus className="h-3 w-3" /></button>
      </div>
    </div>
  );
}

export function JeScenarioPicker({
  items,
  courseId,
  courseName,
  contentResetMissing,
  onPick,
  onCustom,
  onClose,
}: {
  /** The FULL je library (unfiltered) — scoping happens here. */
  items: LibraryItem[];
  courseId: string | null;
  courseName: string | null;
  contentResetMissing: boolean;
  onPick: (item: LibraryItem) => void;
  /** Free-text still allowed — switches the description into its editor. */
  onCustom: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [chapter, setChapter] = useState("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [placingId, setPlacingId] = useState<string | null>(null); // scenarioId whose placements panel is open

  const inCourse = useMemo(() => items.filter((it) => courseId && it.courseKey === courseId), [items, courseId]);
  const scoped = useMemo(
    () => inCourse.filter((it) => (includeArchived ? true : it.status === "active" && it.source === "authored")),
    [inCourse, includeArchived],
  );
  const chapters = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of scoped) m.set(it.chapterId ?? "none", it.chapterLabel);
    return [...m.entries()];
  }, [scoped]);

  const needle = q.trim().toLowerCase();
  const hits = useMemo(
    () =>
      scoped.filter(
        (it) =>
          (chapter === "all" || (it.chapterId ?? "none") === chapter) &&
          (!needle || it.label.toLowerCase().includes(needle) || it.scenarioTitle.toLowerCase().includes(needle)),
      ),
    [scoped, chapter, needle],
  );

  const customBtn = (
    <button
      className="mb-1 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11.5px] font-semibold hover:bg-black/5"
      style={{ color: PAPER.navy, border: `1px dashed ${PAPER.line}` }}
      onClick={onCustom}
    >
      <PencilLine className="h-3 w-3" /> Type a custom description
    </button>
  );

  return (
    <div
      className="nodrag nowheel flex max-h-80 w-80 flex-col rounded-lg p-1.5 shadow-xl"
      style={{ background: "#FFFFFF", border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 16px 40px -12px rgba(20,33,61,0.45)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate px-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: PAPER.inkMuted }}>
          {courseName ? `${courseName} scenarios` : "Scenario library"}
        </span>
        <button className="shrink-0 rounded p-0.5" style={{ color: PAPER.inkMuted }} onClick={onClose} title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {contentResetMissing ? (
        <p className="px-1 py-2 text-[11px] leading-relaxed" style={{ color: PAPER.red }}>
          Scenario lifecycle columns missing — run migration/supabase-migrations/0087_content_reset.sql in the Supabase SQL editor.
        </p>
      ) : !courseId ? (
        <>
          <p className="px-1 py-2 text-[11.5px] leading-relaxed" style={{ color: PAPER.inkMuted }}>
            No course set for this scene. Set the <b>scene course</b> in canvas settings (toolbar gear) to browse its library.
          </p>
          {customBtn}
        </>
      ) : (
        <>
          <label className="mb-1 flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5" style={{ border: `1px solid ${PAPER.line}` }}>
            <Search className="h-3 w-3 shrink-0" style={{ color: PAPER.inkMuted }} />
            <input
              className="w-full bg-transparent text-[11.5px] outline-none"
              style={{ color: PAPER.ink }}
              placeholder="Search scenarios…"
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onClose(); e.stopPropagation(); }}
            />
          </label>
          <select
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            className="mb-1 w-full rounded px-1 py-0.5 text-[11px] outline-none"
            style={{ border: `1px solid ${PAPER.line}`, color: PAPER.ink, background: "#FFFFFF" }}
          >
            <option value="all">All chapters</option>
            {chapters.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>

          {customBtn}

          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
            {hits.slice(0, 80).map((it) => (
              <div key={it.key}>
                <div className="group/it flex items-center gap-0.5 rounded hover:bg-black/5">
                  <button
                    className="min-w-0 flex-1 rounded px-1.5 py-1 text-left"
                    title={`${it.scenarioTitle} · ${it.chapterLabel}`}
                    onClick={() => onPick(it)}
                  >
                    <span className="block truncate text-[11.5px] font-medium" style={{ color: it.status === "archived" ? PAPER.inkMuted : PAPER.ink }}>
                      {it.label}
                      {it.status === "archived" && <span className="ml-1 rounded px-1 text-[8.5px] font-bold uppercase" style={{ border: `1px solid ${PAPER.line}`, color: PAPER.inkMuted }}>archived</span>}
                    </span>
                    <span className="block truncate text-[9.5px]" style={{ color: PAPER.inkMuted }}>{it.chapterLabel}</span>
                  </button>
                  <button
                    className="mr-0.5 shrink-0 rounded p-1 opacity-40 hover:opacity-100"
                    style={{ color: placingId === it.scenarioId ? PAPER.navy : PAPER.inkMuted }}
                    title="Manage placements — also place this scenario in other course-chapters"
                    onClick={(e) => { e.stopPropagation(); setPlacingId((cur) => (cur === it.scenarioId ? null : it.scenarioId)); }}
                  >
                    <Layers className="h-3.5 w-3.5" />
                  </button>
                </div>
                {placingId === it.scenarioId && <PlacementPanel scenarioId={it.scenarioId} onChanged={() => {}} />}
              </div>
            ))}
            {hits.length > 80 && (
              <p className="py-1 text-center text-[10px]" style={{ color: PAPER.inkMuted }}>…{hits.length - 80} more — narrow the filters</p>
            )}
            {hits.length === 0 && (
              <p className="px-1 py-2 text-[11px] italic leading-relaxed" style={{ color: PAPER.inkMuted }}>
                {scoped.length === 0
                  ? "Nothing authored for this course yet — build a JE and use Save to library (gear)."
                  : "No matches — type it instead."}
              </p>
            )}
          </div>

          {/* reference use only — Lee's archived imports stay reachable */}
          <label className="mt-1 flex cursor-pointer items-center gap-1 border-t px-1 pt-1 text-[9.5px]" style={{ color: includeArchived ? PAPER.navy : PAPER.inkFaint, borderColor: PAPER.line }}>
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} style={{ accentColor: "#14213D" }} />
            include archived (imported reference)
          </label>
        </>
      )}
    </div>
  );
}
