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
// The up-next rail tells it. Each card in the rail registers its topic id, an IntersectionObserver
// watches which cards are actually on screen, and the topmost visible one wins. That is why the
// spine "slides as the boundary crosses": the winner changes the moment the first card of the
// next topic becomes the highest visible card.
//
// Observing the RAIL rather than the spine is deliberate — the spine is short and rarely
// scrolls, so watching it would tell us nothing about where the student is reading.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

  // MEASURE AFTER LAYOUT, not after paint: reading the row's offset in useEffect can catch a
  // frame where the list has rendered but the fonts have not settled, which puts the marker a
  // few pixels off on first load and then jumps it.
  useLayoutEffect(() => {
    const el = activeId ? rowRefs.current[activeId] : null;
    const list = listRef.current;
    if (!el || !list) { setMarker(null); return; }
    setMarker({ top: el.offsetTop, height: el.offsetHeight });
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
                  ref={(el) => { rowRefs.current[t.id] = el; }}
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

/** WHICH TOPIC IS THE STUDENT LOOKING AT.
 *
 *  Every up-next card registers itself with its topic id; this reports the topic of the HIGHEST
 *  visible card. Returns null when nothing is on screen, so the caller can fall back to the
 *  selected topic rather than blanking the spine.
 *
 *  rootMargin trims the top of the viewport so a card half-hidden behind the sticky player does
 *  not count as "what you are looking at". */
export function useVisibleTopic(rootRef: React.RefObject<HTMLElement | null>): {
  visibleTopicId: string | null;
  registerCard: (topicId: string) => (el: HTMLElement | null) => void;
} {
  const [visibleTopicId, setVisible] = useState<string | null>(null);
  const els = useRef<Map<Element, string>>(new Map());
  const observer = useRef<IntersectionObserver | null>(null);
  const onScreen = useRef<Map<Element, number>>(new Map());

  useEffect(() => {
    const root = rootRef.current ?? null;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onScreen.current.set(e.target, e.boundingClientRect.top);
          else onScreen.current.delete(e.target);
        }
        // The topmost visible card wins — that is the one whose topic the reader is in.
        let bestEl: Element | null = null;
        let bestTop = Infinity;
        for (const [el, top] of onScreen.current) {
          if (top < bestTop) { bestTop = top; bestEl = el; }
        }
        setVisible(bestEl ? els.current.get(bestEl) ?? null : null);
      },
      { root, rootMargin: "-12% 0px -55% 0px", threshold: 0 },
    );
    observer.current = io;
    // Anything registered before the observer existed is picked up now.
    for (const el of els.current.keys()) io.observe(el);
    return () => { io.disconnect(); observer.current = null; onScreen.current.clear(); };
  }, [rootRef]);

  const registerCard = (topicId: string) => (el: HTMLElement | null) => {
    if (!el) return;
    if (els.current.get(el) === topicId) return;
    els.current.set(el, topicId);
    observer.current?.observe(el);
  };

  return { visibleTopicId, registerCard };
}
