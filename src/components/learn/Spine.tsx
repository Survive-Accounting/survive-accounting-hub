// THE SPINE — the course map, and it follows the scroll.
//
// ── WHY THE HIGHLIGHT IS A MOVING BLOCK ───────────────────────────────────────────────────────
// The obvious implementation is a class on the active row. It blinks: the highlight vanishes from
// one row and appears on another with nothing in between, and at speed that reads as flicker.
//
// So the highlight is ONE absolutely-positioned block behind the rows, and changing topic moves
// it. Because it is a single element with a transform transition, the browser animates the travel
// for free, and a spine that tracks a fast scroll slides continuously instead of strobing. The
// easing overshoots by a hair and settles — that is the slot-machine feel: it arrives somewhere
// rather than stopping.
//
// ── HOW IT KNOWS WHERE THE SCROLL IS ──────────────────────────────────────────────────────────
// The up-next rail tells it. Each card registers its topic id, and on every scroll frame the
// card nearest the top of the rail's reading band wins. That is why the spine "slides as the
// boundary crosses": the winner changes the moment the first card of the next topic reaches the
// line, and because the signal is continuous the marker animates rather than stepping.
//
// Observing the RAIL rather than the spine is deliberate — the spine is short and rarely
// scrolls, so watching it would tell us nothing about where the student is reading.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Circle, CircleCheck, CircleDot, Lock } from "lucide-react";

export type SpineTopic = {
  id: string;
  label: string;
  /** Exam/unit this topic belongs to — the spine groups by it. */
  groupId: string;
  groupLabel: string;
  total: number;
  done: number;
  locked: boolean;
};

export function Spine({ topics, activeId, onPick, position }: {
  topics: SpineTopic[];
  /** The topic the SCROLL is on. Falls back to the selected topic when nothing is visible. */
  activeId: string | null;
  onPick: (topicId: string) => void;
  /** "1/6" — where the active topic sits in the list. */
  position?: { index: number; total: number } | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null);

  // Read by the ref callback, which cannot close over the latest activeId.
  const activeRef = useRef<string | null>(activeId);
  activeRef.current = activeId;

  const measure = (el: HTMLButtonElement | null) => {
    if (!el) return;
    setMarker((prev) =>
      prev && prev.top === el.offsetTop && prev.height === el.offsetHeight
        ? prev
        : { top: el.offsetTop, height: el.offsetHeight });
  };

  /** Stores the row AND measures it when it is the active one. */
  const attachRow = (id: string) => (el: HTMLButtonElement | null) => {
    rowRefs.current[id] = el;
    if (el && id === activeRef.current) measure(el);
  };

  // MEASURE AFTER LAYOUT, not after paint: reading the row's offset in useEffect can catch a
  // frame where the list has rendered but the fonts have not settled, which puts the marker a
  // few pixels off on first load and then jumps it.
  useLayoutEffect(() => {
    if (!activeId) { setMarker(null); return; }
    const el = rowRefs.current[activeId];
    // No element yet is NOT "no marker" — the ref callback will measure it the moment it mounts.
    if (el) measure(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, topics]);

  // Keep the active row in view when the scroll moves the spine past the fold — but never
  // hijack the page scroll, only the spine's own overflow.
  useEffect(() => {
    const el = activeId ? rowRefs.current[activeId] : null;
    const list = listRef.current;
    if (!el || !list) return;
    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    if (elTop < list.scrollTop) list.scrollTo({ top: elTop - 8, behavior: "smooth" });
    else if (elBottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: elBottom - list.clientHeight + 8, behavior: "smooth" });
    }
  }, [activeId]);

  // Group consecutive topics under their exam/unit heading.
  const groups: Array<{ id: string; label: string; items: SpineTopic[] }> = [];
  for (const t of topics) {
    const last = groups[groups.length - 1];
    if (last && last.id === t.groupId) last.items.push(t);
    else groups.push({ id: t.groupId, label: t.groupLabel, items: [t] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between px-1 pb-2">
        <span className="text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--lm-muted)" }}>
          Course map
        </span>
        {position && (
          <span className="text-[10px] font-bold tabular-nums" style={{ color: "var(--lm-accent)" }}>
            {position.index}/{position.total}
          </span>
        )}
      </div>

      <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto pr-1">
        {/* THE MOVING HIGHLIGHT. One block, translated — see the note at the top of this file. */}
        {marker && (
          <div
            aria-hidden
            className="lm-spine-marker pointer-events-none absolute left-0 right-1 rounded-lg"
            style={{
              transform: `translateY(${marker.top}px)`,
              height: marker.height,
              background: "color-mix(in srgb, var(--lm-accent) 14%, transparent)",
              border: "1px solid color-mix(in srgb, var(--lm-accent) 45%, transparent)",
            }}
          />
        )}

        {groups.map((g) => (
          <div key={g.id} className="relative mb-2">
            <div className="px-1.5 pb-1 pt-1.5 text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--lm-muted)" }}>
              {g.label}
            </div>
            {g.items.map((t) => {
              const active = t.id === activeId;
              const allDone = t.done > 0 && t.done === t.total;
              return (
                <button
                  key={t.id}
                  ref={attachRow(t.id)}
                  type="button"
                  onClick={() => onPick(t.id)}
                  title={`${t.label} · ${t.total} video${t.total === 1 ? "" : "s"}`}
                  className="relative flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left"
                  style={{ background: "transparent", border: 0, cursor: "pointer" }}
                >
                  {t.locked ? (
                    <Lock className="h-3 w-3 shrink-0" style={{ color: "#F0B24A" }} />
                  ) : allDone ? (
                    <CircleCheck className="h-3 w-3 shrink-0" style={{ color: "#3BF5A0" }} />
                  ) : t.done > 0 ? (
                    <CircleDot className="h-3 w-3 shrink-0" style={{ color: "var(--lm-accent)" }} />
                  ) : (
                    <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--lm-muted)", opacity: 0.6 }} />
                  )}
                  <span
                    className="min-w-0 flex-1 truncate text-[12px]"
                    style={{ color: active ? "var(--lm-accent)" : "var(--lm-text)", fontWeight: active ? 800 : 500 }}
                  >
                    {t.label}
                  </span>
                  <span className="shrink-0 text-[9px] tabular-nums" style={{ color: t.done > 0 ? "#3BF5A0" : "var(--lm-muted)" }}>
                    {t.done > 0 ? `${t.done}/${t.total}` : t.total}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export type VisibleCandidate = { topicId: string; top: number; bottom: number };

/** THE READING BAND. A line sits 18% down the rail, and the card crossing it is what the student
 *  is reading.
 *
 *  WHY A LINE AND NOT "THE TOPMOST VISIBLE CARD": the topmost visible card is usually one whose
 *  last few pixels are still on screen, which makes the spine lag a whole topic behind the eye.
 *  The 18% line is far enough down that the card under it is genuinely in view, and near enough
 *  to the top that the spine changes as a boundary arrives rather than after it has gone past.
 *
 *  Cards entirely outside the rail are ignored. When none crosses the line the NEAREST one wins,
 *  so a rail scrolled between two cards still answers rather than going blank.
 *
 *  Pure and DOM-free on purpose — see the note in the hook below. */
export function pickVisibleTopic(
  root: { top: number; height: number },
  cards: VisibleCandidate[],
): string | null {
  const line = root.top + root.height * 0.18;
  const bottom = root.top + root.height;
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const c of cards) {
    if (c.bottom < root.top || c.top > bottom) continue;
    const dist = c.top <= line && c.bottom >= line ? 0 : Math.abs(c.top - line);
    // Strictly less-than keeps the FIRST card at a given distance, so a tie resolves to the one
    // earlier in the rail — the one the student reached first.
    if (dist < bestDist) { bestDist = dist; bestId = c.topicId; }
  }
  return bestId;
}

/** WHICH TOPIC IS THE STUDENT LOOKING AT.
 *
 *  Every up-next card registers itself with its topic id; this reports the topic of the card
 *  nearest the top of the rail's reading band. Returns null when nothing qualifies, so the caller
 *  can fall back to the selected topic rather than blanking the spine.
 *
 *  ── WHY SCROLL POSITION AND NOT IntersectionObserver ────────────────────────────────────────
 *  IntersectionObserver was the first implementation and it is the usual answer, but it reports
 *  in discrete steps: it fires when a card crosses a threshold and says nothing in between. The
 *  spine is supposed to SLIDE as the boundary crosses, which means it wants a continuous signal,
 *  and a scroll handler is exactly that — the marker's transform then animates from wherever it
 *  was to wherever it should be, every frame the rail moves.
 *
 *  It is also the version that can be verified: an occluded or backgrounded document suspends
 *  IntersectionObserver callbacks entirely, so the observer build could not be exercised in a
 *  headless pane at all. This one can.
 *
 *  Reads are rAF-throttled: a scroll event can fire many times per frame, and measuring every
 *  one would do layout work the browser then throws away. */
export function useVisibleTopic(rootRef: React.RefObject<HTMLElement | null>): {
  visibleTopicId: string | null;
  registerCard: (topicId: string) => (el: HTMLElement | null) => void;
} {
  const [visibleTopicId, setVisible] = useState<string | null>(null);
  const cards = useRef<Map<HTMLElement, string>>(new Map());
  const frame = useRef<number | null>(null);

  const measure = useCallback(() => {
    frame.current = null;
    const root = rootRef.current;
    if (!root || cards.current.size === 0) return;

    const box = root.getBoundingClientRect();
    const items: VisibleCandidate[] = [];
    for (const [el, topicId] of cards.current) {
      if (!el.isConnected) { cards.current.delete(el); continue; }
      const r = el.getBoundingClientRect();
      items.push({ topicId, top: r.top, bottom: r.bottom });
    }
    const next = pickVisibleTopic({ top: box.top, height: box.height }, items);
    setVisible((prev) => (prev === next ? prev : next));
  }, [rootRef]);

  const schedule = useCallback(() => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // First read after mount, so the spine is correct before anyone scrolls.
    schedule();
    return () => {
      root.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [rootRef, schedule]);

  const registerCard = (topicId: string) => (el: HTMLElement | null) => {
    if (!el) return;
    if (cards.current.get(el) === topicId) return;
    cards.current.set(el, topicId);
    // A newly-mounted card can change the answer (the rail just filled in).
    schedule();
  };

  return { visibleTopicId, registerCard };
}
