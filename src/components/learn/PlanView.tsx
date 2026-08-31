// THE PLAN VIEW — the layout Lee wants to test: topics down the left, videos across the right.
//
// ── THE CLAIM BEING TESTED ────────────────────────────────────────────────────────────────────
// The existing two-column grid answers "what videos are there". This answers "where am I in the
// course" — topics read top to bottom like a syllabus, and each topic's videos scroll sideways,
// so the vertical axis is PROGRESS THROUGH THE COURSE and the horizontal axis is progress through
// a topic. A grid conflates the two: scrolling down means both "later topic" and "more videos"
// depending on where you are, which is why a student cannot tell how far through they are.
//
// It is behind a flag against the grid rather than replacing it, because that claim might be
// wrong and the only way to know is to look at both. `LEARN_PLAN_LAYOUT` picks; the URL can
// override it per-visit (?layout=grid) so Lee can compare without a deploy.
//
// ── ON THE HORIZONTAL SCROLL ──────────────────────────────────────────────────────────────────
// Horizontal scrollers are easy to ship badly. Three things make this one behave:
//   * scroll-snap, so a flick lands on a card rather than between two.
//   * overscroll-behavior-x: contain, so reaching the end of a row does not trigger the
//     browser's back-swipe gesture — the single worst failure mode of a sideways rail on iOS.
//   * The row is the scroller, NOT the page. A page that scrolls sideways is a bug; a row that
//     does is a control.
import { useState } from "react";

import { ChevronDown, ChevronRight, Lock } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

/** WHICH LAYOUT SHIPS. "rail" is the one being tested; "grid" is what /learn had.
 *  ?layout=grid / ?layout=rail overrides per visit — see learn.tsx's validateSearch. */
export const LEARN_PLAN_LAYOUT: "rail" | "grid" = "rail";

export type PlanTopic = {
  id: string;
  label: string;
  /** Exam / unit heading this topic sits under. */
  groupLabel: string;
  done: number;
  total: number;
  locked: boolean;
};

export function PlanView({ topics, activeId, onPick, renderRow }: {
  topics: PlanTopic[];
  activeId: string | null;
  onPick: (topicId: string) => void;
  /** The topic's video cards. Supplied by the caller so this file stays layout-only and never
   *  learns what a set is. */
  renderRow: (topicId: string) => React.ReactNode;
}) {
  // Collapsed state is per topic, defaulting to OPEN. A collapsible rail whose rows all start
  // shut is a list of headings — the student has to work to see the thing they came for.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (topics.length === 0) return null;

  // Group consecutive topics under their exam heading, the same grouping the spine uses.
  const groups: Array<{ label: string; items: PlanTopic[] }> = [];
  for (const t of topics) {
    const last = groups[groups.length - 1];
    if (last && last.label === t.groupLabel) last.items.push(t);
    else groups.push({ label: t.groupLabel, items: [t] });
  }

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: BRAND_SANS }}>
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <p className="pb-2 text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--lm-muted)" }}>
            {g.label}
          </p>

          <div className="flex flex-col gap-3">
            {g.items.map((t) => {
              const open = !collapsed[t.id];
              const active = t.id === activeId;
              const allDone = t.done > 0 && t.done === t.total;
              return (
                <div
                  key={t.id}
                  className="rounded-xl"
                  style={{
                    border: `1px solid ${active ? "color-mix(in srgb, var(--lm-accent) 45%, transparent)" : "var(--lm-border)"}`,
                    background: active ? "color-mix(in srgb, var(--lm-accent) 5%, transparent)" : "transparent",
                  }}
                >
                  {/* THE TOPIC ROW — the left-hand rail. It is a heading AND the collapse control
                      AND the topic selector, which is three jobs for one row: tapping the caret
                      collapses, tapping the label selects. Split so a student reaching for one
                      never gets the other. */}
                  <div className="flex items-center gap-1 px-2.5 py-2">
                    <button
                      type="button"
                      onClick={() => setCollapsed((p) => ({ ...p, [t.id]: open }))}
                      aria-expanded={open}
                      aria-label={open ? `Collapse ${t.label}` : `Expand ${t.label}`}
                      className="grid shrink-0 place-items-center rounded-lg"
                      style={{ height: 34, width: 30, color: "var(--lm-muted)", background: "none", border: 0, cursor: "pointer" }}
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => onPick(t.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      style={{ background: "none", border: 0, cursor: "pointer", minHeight: 34 }}
                    >
                      {t.locked && <Lock className="h-3 w-3 shrink-0" style={{ color: "#F0B24A" }} />}
                      <span
                        className="min-w-0 flex-1 truncate text-[13.5px]"
                        style={{ fontFamily: BRAND_DISPLAY, color: active ? "var(--lm-accent)" : "var(--lm-text)", fontWeight: active ? 900 : 700 }}
                      >
                        {t.label}
                      </span>
                      <span
                        className="shrink-0 text-[10.5px] font-bold tabular-nums"
                        style={{ color: allDone ? "#3BF5A0" : "var(--lm-muted)" }}
                      >
                        {t.done > 0 ? `${t.done}/${t.total}` : `${t.total}`}
                      </span>
                    </button>
                  </div>

                  {/* THE VIDEOS — one horizontal row per topic. See the note at the top. */}
                  {open && (
                    <div
                      className="flex gap-2.5 overflow-x-auto px-2.5 pb-3"
                      style={{ scrollSnapType: "x mandatory", overscrollBehaviorX: "contain" }}
                    >
                      {renderRow(t.id)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
