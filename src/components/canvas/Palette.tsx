// Card palette — left drawer. BLANK templates pinned on top (the improvisation deck),
// then the LIBRARY (every entry / computation / memorize / question from the scenario
// docs), searchable + filtered by course family, chapter, and card type. Fully collapsible.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Layers, Pencil, Search, Trash2 } from "lucide-react";

import { NEON } from "./theme";
import { SNIPPET_DND_MIME } from "./snippet-payload";
import { blankCard, formulaAle, scheduleTemplate, CARD_KIND_LABEL } from "./templates";
import type { LibraryItem } from "./library";
import { cardId, type CardData, type CardKind, type SchedulePreset } from "./types";

/** A saved snippet as the palette needs it (id + name). */
export interface SnippetListItem { id: string; name: string }

/** MY SNIPPETS — the personal clip-bin. Click to spawn at the view center (into
 *  the entered frame); drag onto the canvas to drop it there. Rename + delete
 *  inline. Global across scenes/courses. */
function SnippetSection({ snippets, onSpawn, onRename, onDelete }: {
  snippets: SnippetListItem[];
  onSpawn: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <div className="mb-2">
      <button className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.pink }} onClick={() => setOpen((v) => !v)} title="Your reusable saved clusters">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Layers className="h-3 w-3" /> My snippets <span style={{ color: NEON.muted }}>({snippets.length})</span>
      </button>
      {open && (
        snippets.length === 0 ? (
          <p className="px-1 py-1 text-[10px] italic leading-snug" style={{ color: NEON.muted }}>Select a card (or a group) → “Save as snippet”. They show up here, usable in any scene.</p>
        ) : (
          <div className="space-y-1">
            {snippets.map((s) => (
              <div
                key={s.id}
                draggable={renaming !== s.id}
                onDragStart={(e) => { e.dataTransfer.setData(SNIPPET_DND_MIME, s.id); e.dataTransfer.effectAllowed = "copy"; }}
                className="group flex items-center gap-1 rounded-md px-2 py-1 transition-all hover:-translate-y-px"
                style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(214,84,138,0.06)", cursor: "grab" }}
              >
                {renaming === s.id ? (
                  <input
                    autoFocus
                    defaultValue={s.name}
                    className="w-full bg-transparent text-[12px] outline-none"
                    style={{ color: NEON.text }}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { onRename(s.id, (e.target as HTMLInputElement).value); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) onRename(s.id, v); setRenaming(null); }}
                  />
                ) : (
                  <>
                    <button className="min-w-0 flex-1 truncate text-left text-[12px] font-medium" style={{ color: NEON.text }} onClick={() => onSpawn(s.id)} title="Click to spawn (drag to place). Lands in the entered frame.">{s.name}</button>
                    <button className="shrink-0 opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100" style={{ color: NEON.muted }} title="Rename" onClick={() => setRenaming(s.id)}><Pencil className="h-3 w-3" /></button>
                    <button className="shrink-0 opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100" style={{ color: NEON.red }} title="Delete snippet (spawned copies are untouched)" onClick={() => { if (window.confirm(`Delete snippet “${s.name}”? Cards already spawned from it stay.`)) onDelete(s.id); }}><Trash2 className="h-3 w-3" /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

type BlankSpec = { kind: CardKind; label: string; preset?: SchedulePreset; special?: "ale" | "bigtext" | "bullets" };

/** BLANK reorganized into three groups (design-elements run). */
const CARD_BLANKS: BlankSpec[] = [
  { kind: "je", label: "Journal Entry" },
  { kind: "taccount", label: "T-Account" },
  { kind: "note", label: "Note" },
  { kind: "formula", label: "A = L + E", special: "ale" },
];
const ELEMENT_BLANKS: BlankSpec[] = [
  { kind: "heading", label: "Heading" },
  { kind: "heading", label: "Big Text", special: "bigtext" },
  { kind: "text", label: "Text" },
  { kind: "list", label: "Bulleted List", special: "bullets" },
  { kind: "examcue", label: "Exam Cue" },
  { kind: "ceqtease", label: "CEQ Tease" },
  { kind: "memo", label: "Memo" },
  { kind: "paygate", label: "Payment Gate" },
  { kind: "signupgate", label: "Signup Gate" },
];
const BRIDGE_BLANKS: BlankSpec[] = [
  { kind: "asklee", label: "Ask Lee" },
  { kind: "submitproblem", label: "Submit a Problem" },
  { kind: "shareinvite", label: "Share / Invite" },
];
/** Everything else stays reachable (video slots, schedules, …) — collapsed. */
const MORE_BLANKS: BlankSpec[] = [
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
  { kind: "video", label: "Video (Mux)" },
  { kind: "image", label: "Image" },
  { kind: "legend", label: "Legend card" },
  { kind: "outline", label: "Course outline" },
];

const KIND_FILTERS: (CardKind | "all")[] = ["all", "je", "schedule", "computation", "taccount", "ceq", "memorize"];

/** Focus mode trims the CARDS group to the filming staples (elements/bridge untouched). */
const FOCUS_KINDS: CardKind[] = ["je", "taccount", "note"];

function spawnBlank(b: BlankSpec): CardData {
  if (b.special === "ale") return formulaAle();
  // BIG TEXT: a heavy League-Spartan slab (spartan heading) — no underline,
  // seeded with "A = L + E" as the canonical on-camera example.
  if (b.special === "bigtext") return { kind: "heading", text: "A = L + E", level: 1, spartan: true, underline: false, w: 480, h: 150 };
  // BULLETED LIST: a plain header + bullets design element. Reuses the List card
  // (bulleted markers, per-row space-walk reveal, per-row spotlight), chips off.
  if (b.special === "bullets") return { kind: "list", title: "List", bulleted: true, showChips: false, rows: [{ id: cardId("r"), text: "" }, { id: cardId("r"), text: "" }, { id: cardId("r"), text: "" }], editMode: true };
  if (b.kind === "schedule") return scheduleTemplate(b.preset ?? "generic");
  return blankCard(b.kind);
}

function BlankGroup({ title, color, blanks, onSpawn }: { title: string; color: string; blanks: BlankSpec[]; onSpawn: (d: CardData) => void }) {
  if (blanks.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{title}</div>
      <div className="grid grid-cols-2 gap-1">
        {blanks.map((b) => (
          <button
            key={b.label}
            onClick={() => onSpawn(spawnBlank(b))}
            className="rounded-md px-2 py-1 text-left text-[11.5px] font-medium transition-all hover:-translate-y-px"
            style={{ border: `1px dashed ${NEON.border}`, color: NEON.text, background: "rgba(252,163,17,0.05)" }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MoreBlanks({ onSpawn }: { onSpawn: (d: CardData) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-1">
      <button
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: NEON.muted }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        More
      </button>
      {open && (
        <div className="mt-1 grid grid-cols-2 gap-1">
          {MORE_BLANKS.map((b) => (
            <button
              key={b.label}
              onClick={() => onSpawn(spawnBlank(b))}
              className="rounded-md px-2 py-1 text-left text-[11px] font-medium transition-all hover:-translate-y-px"
              style={{ border: `1px dashed ${NEON.borderSoft}`, color: NEON.muted, background: "rgba(0,0,0,0.2)" }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Palette({
  library,
  onSpawn,
  focus = false,
  sceneCourseKey = null,
  docked = false,
  snippets = [],
  onSpawnSnippet,
  onRenameSnippet,
  onDeleteSnippet,
}: {
  /** Pre-filtered by the route: ACTIVE + AUTHORED only (content reset). */
  library: LibraryItem[];
  onSpawn: (data: CardData) => void;
  /** ON: BLANK section shows only JE / T-account / Note / Heading. */
  focus?: boolean;
  /** Scene course context — the library's course filter follows it. */
  sceneCourseKey?: string | null;
  /** DOCKED (declutter run): fills the drawer panel instead of floating
   *  top-left — no collapse chrome, height from the parent. */
  docked?: boolean;
  /** MY SNIPPETS (PROMPT 2) — the personal clip-bin, global across scenes. */
  snippets?: SnippetListItem[];
  onSpawnSnippet?: (id: string) => void;
  onRenameSnippet?: (id: string, name: string) => void;
  onDeleteSnippet?: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [course, setCourse] = useState<string>("all");
  const [chapter, setChapter] = useState<string>("all");
  const [kind, setKind] = useState<CardKind | "all">("all");
  const [libOpen, setLibOpen] = useState(false); // heavy section — closed by default

  // one truth: the scene's course drives the library's default scope
  useEffect(() => {
    setCourse(sceneCourseKey ?? "all");
    setChapter("all");
  }, [sceneCourseKey]);

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

  return (
    <aside
      className={
        docked
          ? "flex h-full min-h-0 w-full flex-col overflow-y-auto"
          : `absolute left-3 top-14 z-40 flex w-72 flex-col rounded-xl ${libOpen ? "bottom-3" : ""}`
      }
      style={docked ? { color: NEON.text } : { background: NEON.panel, border: `1px solid ${NEON.borderSoft}`, backdropFilter: "blur(8px)", color: NEON.text }}
    >
      {/* BLANK — three groups: CARDS · ELEMENTS · BRIDGE (+ MORE, collapsed) */}
      <div className="px-3 pt-2">
        <BlankGroup
          title="Cards"
          color={NEON.yellow}
          blanks={focus ? CARD_BLANKS.filter((b) => FOCUS_KINDS.includes(b.kind) || b.special === "ale") : CARD_BLANKS}
          onSpawn={onSpawn}
        />
        <BlankGroup title="Elements" color={NEON.cyan} blanks={ELEMENT_BLANKS} onSpawn={onSpawn} />
        <BlankGroup title="Bridge" color={NEON.pinkSoft} blanks={BRIDGE_BLANKS} onSpawn={onSpawn} />
        <MoreBlanks onSpawn={onSpawn} />
        {onSpawnSnippet && (
          <SnippetSection
            snippets={snippets}
            onSpawn={onSpawnSnippet}
            onRename={(id, name) => onRenameSnippet?.(id, name)}
            onDelete={(id) => onDeleteSnippet?.(id)}
          />
        )}
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
