// Card palette — left drawer. BLANK templates pinned on top (the improvisation deck),
// then the LIBRARY (every entry / computation / memorize / question from the scenario
// docs), searchable + filtered by course family, chapter, and card type. Fully collapsible.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";

import { NEON } from "./theme";
import { blankCard, scheduleTemplate, CARD_KIND_LABEL } from "./templates";
import type { LibraryItem } from "./library";
import type { CardData, CardKind, SchedulePreset } from "./types";

const BLANKS: { kind: CardKind; label: string; preset?: SchedulePreset }[] = [
  { kind: "je", label: "Journal Entry" },
  { kind: "taccount", label: "T-Account" },
  { kind: "list", label: "List (reveal)" },
  { kind: "schedule", label: "Table (generic)", preset: "generic" },
  { kind: "schedule", label: "Amortization", preset: "amortization" },
  { kind: "schedule", label: "Depreciation", preset: "depreciation" },
  { kind: "schedule", label: "FIFO/LIFO layers", preset: "fifo" },
  { kind: "schedule", label: "Bank rec", preset: "bankrec" },
  { kind: "schedule", label: "Income stmt", preset: "incomestmt" },
  { kind: "schedule", label: "Balance sheet", preset: "balancesheet" },
  { kind: "computation", label: "Computation" },
  { kind: "ceq", label: "Question (CEQ)" },
  { kind: "memorize", label: "Memorize" },
  { kind: "note", label: "Note" },
  { kind: "video", label: "Video (Mux)" },
  { kind: "image", label: "Image" },
  { kind: "legend", label: "Legend card" },
];

const KIND_FILTERS: (CardKind | "all")[] = ["all", "je", "schedule", "computation", "taccount", "ceq", "memorize"];

export function Palette({
  library,
  onSpawn,
  collapsed,
  onToggle,
}: {
  library: LibraryItem[];
  onSpawn: (data: CardData) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [q, setQ] = useState("");
  const [course, setCourse] = useState<string>("all");
  const [chapter, setChapter] = useState<string>("all");
  const [kind, setKind] = useState<CardKind | "all">("all");
  const [libOpen, setLibOpen] = useState(false); // heavy section — closed by default

  const courses = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of library) m.set(it.courseKey, it.courseLabel);
    return [...m.entries()];
  }, [library]);

  const chapters = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of library) if (course === "all" || it.courseKey === course) m.set(it.chapterId ?? "none", it.chapterLabel);
    return [...m.entries()];
  }, [library, course]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return library.filter(
      (it) =>
        (course === "all" || it.courseKey === course) &&
        (chapter === "all" || (it.chapterId ?? "none") === chapter) &&
        (kind === "all" || it.kind === kind) &&
        (!needle || it.label.toLowerCase().includes(needle) || it.scenarioTitle.toLowerCase().includes(needle)),
    );
  }, [library, q, course, chapter, kind]);

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        title="Open card palette"
        className="absolute left-3 top-3 z-40 grid h-9 w-9 place-items-center rounded-lg"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.pink, boxShadow: NEON.glow }}
      >
        <ChevronsRight className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside
      className={`absolute left-3 top-3 z-40 flex w-72 flex-col rounded-xl ${libOpen ? "bottom-3" : ""}`}
      style={{ background: NEON.panel, border: `1px solid ${NEON.borderSoft}`, backdropFilter: "blur(8px)", color: NEON.text }}
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: NEON.pink }}>Cards</span>
        <button onClick={onToggle} title="Collapse palette" className="ml-auto" style={{ color: NEON.muted }}>
          <ChevronsLeft className="h-4 w-4" />
        </button>
      </div>

      {/* BLANK — the improvisation deck */}
      <div className="px-3 pt-2">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Blank</div>
        <div className="grid grid-cols-2 gap-1">
          {BLANKS.map((b) => (
            <button
              key={b.label}
              onClick={() => onSpawn(b.kind === "schedule" ? scheduleTemplate(b.preset ?? "generic") : blankCard(b.kind))}
              className="rounded-md px-2 py-1 text-left text-[11.5px] font-medium transition-all hover:-translate-y-px"
              style={{ border: `1px dashed ${NEON.border}`, color: NEON.text, background: "rgba(252,163,17,0.05)" }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* LIBRARY — collapsible; a 1,000-item list is prep clutter mid-lesson */}
      <div className={`mt-3 flex flex-col px-3 pb-3 ${libOpen ? "min-h-0 flex-1" : ""}`}>
        <button
          className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: NEON.cyan }}
          onClick={() => setLibOpen((v) => !v)}
          title={libOpen ? "Collapse library" : "Expand library"}
        >
          {libOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Library <span style={{ color: NEON.muted }}>({filtered.length})</span>
        </button>
        {libOpen && (
        <>
        <div className="mb-1.5 flex items-center gap-1 rounded-md px-2 py-1" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.3)" }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: NEON.muted }} />
          <input
            className="w-full bg-transparent text-[12px] outline-none placeholder:opacity-40"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="mb-1.5 flex gap-1">
          <select value={course} onChange={(e) => { setCourse(e.target.value); setChapter("all"); }} className="min-w-0 flex-1 rounded bg-black/40 px-1 py-0.5 text-[11px] outline-none" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>
            <option value="all">All courses</option>
            {courses.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select value={chapter} onChange={(e) => setChapter(e.target.value)} className="min-w-0 flex-1 rounded bg-black/40 px-1 py-0.5 text-[11px] outline-none" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>
            <option value="all">All chapters</option>
            {chapters.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="mb-1.5 flex flex-wrap gap-1">
          {KIND_FILTERS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                color: kind === k ? NEON.bg : NEON.muted,
                background: kind === k ? NEON.cyan : "transparent",
                border: `1px solid ${kind === k ? NEON.cyan : NEON.borderSoft}`,
              }}
            >
              {k === "all" ? "all" : CARD_KIND_LABEL[k].split(" ")[0].toLowerCase()}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
          {filtered.slice(0, 120).map((it) => (
            <button
              key={it.key}
              onClick={() => onSpawn(it.make())}
              className="block w-full rounded-md px-2 py-1.5 text-left transition-all hover:-translate-y-px"
              style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.25)" }}
              title={`${it.scenarioTitle} · ${it.chapterLabel}`}
            >
              <div className="truncate text-[12px] font-medium" style={{ color: NEON.text }}>{it.label}</div>
              <div className="truncate text-[10px]" style={{ color: NEON.muted }}>
                <span style={{ color: NEON.cyan }}>{CARD_KIND_LABEL[it.kind]}</span> · {it.courseLabel} · {it.chapterLabel}
              </div>
            </button>
          ))}
          {filtered.length > 120 && <div className="py-1 text-center text-[10.5px]" style={{ color: NEON.muted }}>…{filtered.length - 120} more — narrow the filters</div>}
          {filtered.length === 0 && <div className="py-3 text-center text-[11px] italic" style={{ color: NEON.muted }}>No matches.</div>}
        </div>
        </>
        )}
      </div>
    </aside>
  );
}
