// JE description picker (A12) — the transaction description can be CHOSEN from
// the imported scenario-doc library instead of only free-typed. Filter by
// course + chapter (sets up per-chapter filtered views — roadmap), search, or
// bail to "type custom". Pure content: the caller portals it via CardPopover.
import { useMemo, useState } from "react";
import { PencilLine, Search, X } from "lucide-react";

import { PAPER } from "../theme";
import type { LibraryItem } from "../library";

export function JeScenarioPicker({
  items,
  onPick,
  onCustom,
  onClose,
}: {
  /** JE entries only (pre-filtered by the route). */
  items: LibraryItem[];
  onPick: (item: LibraryItem) => void;
  /** Free-text still allowed — switches the description into its editor. */
  onCustom: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [course, setCourse] = useState("all");
  const [chapter, setChapter] = useState("all");

  const courses = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) m.set(it.courseKey, it.courseLabel);
    return [...m.entries()];
  }, [items]);
  const chapters = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) if (course === "all" || it.courseKey === course) m.set(it.chapterId ?? "none", it.chapterLabel);
    return [...m.entries()];
  }, [items, course]);

  const needle = q.trim().toLowerCase();
  const hits = useMemo(
    () =>
      items.filter(
        (it) =>
          (course === "all" || it.courseKey === course) &&
          (chapter === "all" || (it.chapterId ?? "none") === chapter) &&
          (!needle || it.label.toLowerCase().includes(needle) || it.scenarioTitle.toLowerCase().includes(needle)),
      ),
    [items, course, chapter, needle],
  );

  return (
    <div
      className="nodrag nowheel flex max-h-80 w-80 flex-col rounded-lg p-1.5 shadow-xl"
      style={{ background: "#FFFFFF", border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 16px 40px -12px rgba(20,33,61,0.45)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-1">
        <label className="flex min-w-0 flex-1 items-center gap-1 rounded px-1.5 py-0.5" style={{ border: `1px solid ${PAPER.line}` }}>
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
        <button className="shrink-0 rounded p-0.5" style={{ color: PAPER.inkMuted }} onClick={onClose} title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-1 flex gap-1">
        <select
          value={course}
          onChange={(e) => { setCourse(e.target.value); setChapter("all"); }}
          className="min-w-0 flex-1 rounded px-1 py-0.5 text-[11px] outline-none"
          style={{ border: `1px solid ${PAPER.line}`, color: PAPER.ink, background: "#FFFFFF" }}
        >
          <option value="all">All courses</option>
          {courses.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select
          value={chapter}
          onChange={(e) => setChapter(e.target.value)}
          className="min-w-0 flex-1 rounded px-1 py-0.5 text-[11px] outline-none"
          style={{ border: `1px solid ${PAPER.line}`, color: PAPER.ink, background: "#FFFFFF" }}
        >
          <option value="all">All chapters</option>
          {chapters.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      <button
        className="mb-1 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11.5px] font-semibold hover:bg-black/5"
        style={{ color: PAPER.navy, border: `1px dashed ${PAPER.line}` }}
        onClick={onCustom}
      >
        <PencilLine className="h-3 w-3" /> Type a custom description
      </button>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
        {hits.slice(0, 80).map((it) => (
          <button
            key={it.key}
            className="block w-full rounded px-1.5 py-1 text-left hover:bg-black/5"
            title={`${it.scenarioTitle} · ${it.chapterLabel}`}
            onClick={() => onPick(it)}
          >
            <span className="block truncate text-[11.5px] font-medium" style={{ color: PAPER.ink }}>{it.label}</span>
            <span className="block truncate text-[9.5px]" style={{ color: PAPER.inkMuted }}>{it.courseLabel} · {it.chapterLabel}</span>
          </button>
        ))}
        {hits.length > 80 && (
          <p className="py-1 text-center text-[10px]" style={{ color: PAPER.inkMuted }}>…{hits.length - 80} more — narrow the filters</p>
        )}
        {hits.length === 0 && (
          <p className="px-1 py-2 text-[11px] italic" style={{ color: PAPER.inkMuted }}>
            {items.length === 0 ? "Scenario library still loading (or unavailable) — type a custom description." : "No matches — type it instead."}
          </p>
        )}
      </div>
    </div>
  );
}
