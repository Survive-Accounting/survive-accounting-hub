// THE RAIL (learn v3, 09-03) — YouTube's skinny icon rail, on the page background, sticky.
//
// The rail is the CONTENT TYPES, not the topics: Cram · Practice · Problems · Tools · Review · You.
// The hamburger expands it into the path — topics that open to their sets — and clicking a set
// opens the player right there. On a phone the same six become bottom tabs and the path is a sheet.
import { Check, ChevronDown, ChevronRight, Circle, Lock, Menu, X } from "lucide-react";
import { useState } from "react";

import { INK } from "@/components/learn/learn-theme";
import type { StudentSet, StudentTopic } from "@/lib/student.functions";

// Only what the page actually has today (09-03 simplification): the other types come back to
// the rail when their rows exist.
export type RailKey = "cram" | "practice" | "problems" | "tools" | "review" | "you";
export const RAIL_ITEMS: { key: RailKey; label: string }[] = [
  { key: "cram", label: "Cram" },
  { key: "practice", label: "Practice" },
];

export function RailIcon({ k, on }: { k: RailKey; on?: boolean }) {
  const stroke = on ? "var(--lk-acc)" : "currentColor";
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (k) {
    case "cram": return <svg {...p}><path d="M13 2 L4 14 h7 l-1 8 l9 -12 h-7 z" /></svg>;
    case "practice": return <svg {...p}><path d="M9 11l3 3 8-8" /><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11" /></svg>;
    case "problems": return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h6" /></svg>;
    case "tools": return <svg {...p}><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></svg>;
    case "review": return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></svg>;
    case "you": return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
  }
}

export type PathTopic = { topic: StudentTopic; sets: { set: StudentSet; done: boolean; playable: boolean; locked: boolean }[]; done: number };

/** Desktop: the skinny rail, or the expanded path. */
export function LearnRail({ active, onPick, expanded, onToggle, path, activeSetId, onOpenSet }: {
  active: RailKey;
  onPick: (k: RailKey) => void;
  expanded: boolean;
  onToggle: () => void;
  path: PathTopic[];
  activeSetId: string | null;
  onOpenSet: (setId: string) => void;
}) {
  return (
    <aside className="flex shrink-0 flex-col" style={{ width: expanded ? 300 : 80, transition: "width 160ms ease", background: INK.bg, padding: "12px 8px", position: "sticky", top: 0, height: "100%", overflowY: "auto", scrollbarWidth: "none" }}>
      <button type="button" onClick={onToggle} className="mb-2 grid h-10 w-10 place-items-center rounded-lg" style={{ background: "transparent", border: 0, color: INK.text, cursor: "pointer" }} aria-label={expanded ? "Collapse" : "Your path"} title={expanded ? "Collapse" : "Your path"}>
        {expanded ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {expanded ? (
        <PathList path={path} activeSetId={activeSetId} onOpenSet={onOpenSet} />
      ) : (
        <div className="flex flex-col items-center gap-1">
          {RAIL_ITEMS.map((it) => (
            <div key={it.key} className="flex flex-col items-center">
              <button type="button" className="lk-rail-item" data-on={active === it.key} onClick={() => onPick(it.key)} title={it.label}>
                <RailIcon k={it.key} on={active === it.key} />
                {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

/** The path: topics open to their sets. Shorthand set names, click = play. Also the phone sheet. */
export function PathList({ path, activeSetId, onOpenSet }: { path: PathTopic[]; activeSetId: string | null; onOpenSet: (setId: string) => void }) {
  const activeTopic = path.find((p) => p.sets.some((s) => s.set.id === activeSetId))?.topic.id ?? path.find((p) => p.done < p.sets.length)?.topic.id ?? path[0]?.topic.id ?? null;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] ?? id === activeTopic;
  return (
    <div className="flex flex-col gap-1 px-1">
      <div className="px-2 pb-1 text-[10.5px] font-extrabold uppercase" style={{ letterSpacing: "0.14em", color: INK.muted }}>Your path</div>
      {path.map(({ topic, sets, done }) => {
        const all = sets.length > 0 && done === sets.length;
        const o = isOpen(topic.id);
        return (
          <div key={topic.id}>
            <button type="button" onClick={() => setOpen((m) => ({ ...m, [topic.id]: !o }))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left" style={{ background: o ? INK.surface : "transparent", border: 0, color: INK.text, cursor: "pointer" }}>
              {o ? <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: INK.muted }} /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: INK.muted }} />}
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{topic.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums" style={{ color: all ? INK.green : INK.muted }}>{all ? <Check className="h-3.5 w-3.5" /> : done > 0 ? `${done}/${sets.length}` : sets.length}</span>
            </button>
            {o && (
              <div className="ml-4 flex flex-col border-l py-1 pl-3" style={{ borderColor: INK.border }}>
                {sets.map(({ set, done: d, playable, locked }) => {
                  const on = set.id === activeSetId;
                  return (
                    <button key={set.id} type="button" disabled={!playable && !locked} onClick={() => onOpenSet(set.id)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left disabled:cursor-default" style={{ background: "transparent", border: 0, color: on ? "var(--lk-acc)" : playable || locked ? INK.text : INK.dim, cursor: "pointer" }}>
                      {locked ? <Lock className="h-3 w-3 shrink-0" style={{ color: INK.muted }} /> : d ? <Check className="h-3 w-3 shrink-0" style={{ color: INK.green }} /> : <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: on ? "var(--lk-acc)" : INK.dim }} />}
                      <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ fontWeight: on ? 700 : 500 }}>{set.shortLabel || set.name}</span>
                      {!playable && !locked && <span className="text-[10px]" style={{ color: INK.dim }}>soon</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Phone: the six as bottom tabs. */
export function LearnTabs({ active, onPick }: { active: RailKey; onPick: (k: RailKey) => void }) {
  return (
    <nav className="flex shrink-0 px-1 pb-3 pt-2" style={{ background: INK.bg, borderTop: `1px solid ${INK.border}` }}>
      {RAIL_ITEMS.map((it) => (
        <button key={it.key} type="button" onClick={() => onPick(it.key)} className="flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-semibold" style={{ background: "transparent", border: 0, color: active === it.key ? INK.text : INK.muted, cursor: "pointer" }}>
          <RailIcon k={it.key} on={active === it.key} />
          {it.label}
        </button>
      ))}
    </nav>
  );
}
