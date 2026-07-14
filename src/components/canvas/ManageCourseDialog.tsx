// MANAGE COURSE (course structure cleanup) — Lee-facing admin for a course's
// name and its chapters. Mirrors ManageAccountsDialog's shell/pattern.
//
// Vocabulary rung: Course → Chapter → Lesson → Card. This dialog edits the
// COURSE and CHAPTER rungs only — Lesson stays the on-canvas scene grouping,
// untouched here. A course's final chapter is conventionally its Region-level
// Check ("Course Wrap-up · Cram Decks" template — see Foundations chapter 8).
//
// Chapters are never deleted, only archived (status column, migration 0089).
// Archived chapters keep every reference that already points at them working
// (scenario docs, scenes) — they're just out of the reorder list and marked
// "(archived)" wherever chapterLabel renders them.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, GripVertical, Pencil, Plus, X } from "lucide-react";

import { createChapter, listChaptersAdmin, renameChapter, renameCourse, reorderChapters, setChapterStatus, type ChapterRow } from "@/lib/canvas.functions";
import { retryUnlessMigrationHint } from "@/lib/pg-errors";
import { NEON } from "./theme";

export function ManageCourseDialog({ courseId, courseName, onClose }: {
  courseId: string;
  courseName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(courseName);
  const [dragId, setDragId] = useState<string | null>(null);
  const [newChapterName, setNewChapterName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; subtitle: string } | null>(null);

  const chaptersQuery = useQuery({
    queryKey: ["chapters-admin", courseId],
    queryFn: () => listChaptersAdmin({ data: { course_id: courseId } }),
    networkMode: "always",
    retry: retryUnlessMigrationHint,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["chapters-admin", courseId] });
  const invalidateCourses = () => {
    void qc.invalidateQueries({ queryKey: ["course-options"] });
    void qc.invalidateQueries({ queryKey: ["je-tree"] });
  };

  const rows = chaptersQuery.data ?? [];
  const active = useMemo(() => rows.filter((r) => r.status === "active").sort((a, b) => a.chapter_number - b.chapter_number), [rows]);
  const archived = useMemo(() => rows.filter((r) => r.status === "archived").sort((a, b) => a.chapter_number - b.chapter_number), [rows]);

  const renameCourseMut = useMutation({
    mutationFn: () => renameCourse({ data: { course_id: courseId, course_name: nameDraft.trim() } }),
    onSuccess: invalidateCourses,
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });
  const createMut = useMutation({
    mutationFn: () => createChapter({ data: { course_id: courseId, chapter_name: newChapterName.trim() } }),
    onSuccess: () => { setNewChapterName(""); invalidate(); invalidateCourses(); },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });
  const renameMut = useMutation({
    mutationFn: (v: { id: string; chapter_name: string; subtitle: string | null }) =>
      renameChapter({ data: { id: v.id, chapter_name: v.chapter_name, subtitle: v.subtitle } }),
    onSuccess: () => { setEditing(null); invalidate(); invalidateCourses(); },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });
  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "active" | "archived" }) => setChapterStatus({ data: v }),
    onSuccess: () => { invalidate(); invalidateCourses(); },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });
  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => reorderChapters({ data: { course_id: courseId, ordered_ids: ids } }),
    onSuccess: () => { invalidate(); invalidateCourses(); },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = active.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    reorderMut.mutate(ids);
  };

  const chapterRow = (ch: ChapterRow, kind: "active" | "archived") => (
    <div
      key={ch.id}
      draggable={kind === "active"}
      onDragStart={() => setDragId(ch.id)}
      onDragOver={(e) => kind === "active" && e.preventDefault()}
      onDrop={() => kind === "active" && onDrop(ch.id)}
      className="flex items-center gap-2 rounded px-1.5 py-1"
      style={{ border: `1px solid ${NEON.borderSoft}`, opacity: dragId === ch.id ? 0.4 : 1 }}
    >
      {kind === "active" && <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab" style={{ color: NEON.muted }} />}
      <span className="shrink-0 rounded px-1 text-[9.5px] font-bold" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>
        Ch {ch.chapter_number}
      </span>
      {editing?.id === ch.id ? (
        <>
          <input
            autoFocus
            className="min-w-0 flex-1 rounded bg-black/30 px-1.5 py-0.5 text-[11.5px] outline-none"
            style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setEditing(null); }}
          />
          <input
            className="w-28 shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[10.5px] italic outline-none"
            style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }}
            placeholder="subtitle…"
            value={editing.subtitle}
            onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setEditing(null); }}
          />
          <button
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{ color: NEON.green, border: `1px solid ${NEON.borderSoft}` }}
            disabled={editing.name.trim().length === 0 || renameMut.isPending}
            onClick={() => renameMut.mutate({ id: ch.id, chapter_name: editing.name.trim(), subtitle: editing.subtitle.trim() || null })}
          >
            save
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: kind === "archived" ? NEON.muted : NEON.text }}>
            {ch.chapter_name}
            {ch.subtitle && <span className="ml-1 opacity-60">· {ch.subtitle}</span>}
          </span>
          <button
            className="shrink-0 rounded p-0.5"
            style={{ color: NEON.muted }}
            title="Rename"
            onClick={() => setEditing({ id: ch.id, name: ch.chapter_name, subtitle: ch.subtitle ?? "" })}
          >
            <Pencil className="h-3 w-3" />
          </button>
        </>
      )}
      {kind === "active" ? (
        <button
          className="shrink-0 rounded p-0.5"
          style={{ color: NEON.red }}
          title="Archive this chapter (existing references keep working)"
          onClick={() => statusMut.mutate({ id: ch.id, status: "archived" })}
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          className="shrink-0 rounded p-0.5"
          style={{ color: NEON.cyan }}
          title="Unarchive"
          onClick={() => statusMut.mutate({ id: ch.id, status: "active" })}
        >
          <ArchiveRestore className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className="absolute inset-0 z-[70] grid place-items-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[560px] max-w-[94vw] flex-col rounded-xl p-4"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Manage course</span>
          <button className="ml-auto" style={{ color: NEON.muted }} onClick={onClose} title="Close"><X className="h-4 w-4" /></button>
        </div>
        {err && <p className="mb-2 rounded px-2 py-1 text-[11px]" style={{ color: NEON.red, border: `1px solid rgba(255,92,122,0.4)` }}>{err}</p>}
        {chaptersQuery.isError && <p className="mb-2 rounded px-2 py-1 text-[11px]" style={{ color: NEON.red, border: `1px solid rgba(255,92,122,0.4)` }}>{(chaptersQuery.error as Error).message}</p>}

        <label className="mb-3 block text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>
          course name
          <div className="mt-0.5 flex gap-1.5">
            <input
              className="min-w-0 flex-1 rounded bg-black/30 px-2 py-1 text-[12px] font-normal normal-case outline-none"
              style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <button
              className="shrink-0 rounded px-2.5 py-1 text-[10.5px] font-bold uppercase disabled:opacity-40"
              style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.5)", background: "rgba(252,163,17,0.12)" }}
              disabled={nameDraft.trim().length === 0 || nameDraft.trim() === courseName || renameCourseMut.isPending}
              onClick={() => renameCourseMut.mutate()}
            >
              rename
            </button>
          </div>
        </label>

        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>
          Chapters ({active.length}) <span className="normal-case opacity-60">— drag the grip to reorder</span>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {active.map((ch) => chapterRow(ch, "active"))}
          {active.length === 0 && !chaptersQuery.isLoading && (
            <p className="py-2 text-[11px] italic" style={{ color: NEON.muted }}>No active chapters yet — add one below.</p>
          )}
          {chaptersQuery.isLoading && <p className="text-[11px] italic" style={{ color: NEON.muted }}>Loading…</p>}

          {archived.length > 0 && (
            <>
              <div className="mt-2 border-t pt-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted, borderColor: NEON.borderSoft }}>
                Archived ({archived.length})
              </div>
              {archived.map((ch) => chapterRow(ch, "archived"))}
            </>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 border-t pt-2" style={{ borderColor: NEON.borderSoft }}>
          <input
            className="min-w-0 flex-1 rounded bg-black/30 px-2 py-1 text-[11.5px] outline-none"
            style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
            placeholder="New chapter name…"
            value={newChapterName}
            onChange={(e) => setNewChapterName(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && newChapterName.trim()) createMut.mutate(); }}
          />
          <button
            className="shrink-0 rounded px-2.5 py-1 text-[10.5px] font-bold uppercase disabled:opacity-40"
            style={{ color: NEON.cyan, border: "1px solid rgba(79,163,227,0.45)" }}
            disabled={newChapterName.trim().length === 0 || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            <Plus className="mr-1 inline h-3 w-3" />add
          </button>
        </div>
      </div>
    </div>
  );
}
