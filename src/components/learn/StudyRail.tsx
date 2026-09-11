// THE STUDY RAIL (the design email, 2026-09-10, built 09-11): one horizontally scrolling row per
// topic, its items dynamic — `[...videos, practice]`. Practice is simply the LAST item after the
// final video: 1 video → [v][practice], 5 → [v]×5[practice], 8 → [v]×8[practice]. NEVER a
// reserved slot, never a blank fake card, never a gap before Practice; zero videos still shows
// Practice. This replaced the fixed grid of four frames + Practice pinned in column five (Lee's
// 09-10 spec) — the email called that "THE architectural fix" and Lee's 09-11 brief repeats it.
//
//   <StudySection>            heading (TopicHead / TopicRow in LearnHome) + the rail
//     <StudyRail>             the flex row: scroll-snap, hidden scrollbar, overflow-only controls
//       {videos.map(Short)}   fixed-width 9:16 cards — 256px wide, 232px mid, min(84vw, 340px) phone
//       <PracticeCard />      the same footprint, last
//
// Cards never stretch to fill the width (the email: "3.5–5 cards may be visible depending on
// viewport; cards should NOT stretch"). The rail bleeds to the column's right edge on every tier
// so a half-visible card says "more". The right-edge fade and the arrow exist ONLY while the rail
// actually overflows to the right (ResizeObserver + scroll); a quiet left arrow appears once it
// has scrolled. On a phone the arrows are hidden — you swipe; snap is mandatory there, proximity
// elsewhere. Width per tier lives in --lk-card-w so Short and PracticeCard share one number.
import { Children, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { LK } from "@/components/learn/learn-theme";
import type { Tier } from "@/components/learn/use-tier";

/** The card width per tier — one number for videos and Practice alike. */
export const CARD_W: Record<Tier, string> = { narrow: "min(84vw, 340px)", mid: "232px", wide: "256px" };
export const RAIL_GAP: Record<Tier, number> = { narrow: 12, mid: 16, wide: 18 };

export const STUDY_RAIL_CSS = `
.lk-rail-wrap { position: relative; min-width: 0; }
.lk-rail { display: flex; align-items: stretch; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; scrollbar-width: none; -webkit-overflow-scrolling: touch; scroll-padding-inline: var(--lk-rail-pad, 0px); padding-bottom: 6px; }
.lk-rail[data-tier="narrow"] { scroll-snap-type: x mandatory; }
.lk-rail::-webkit-scrollbar { display: none; }
.lk-rail > * { scroll-snap-align: start; flex: 0 0 auto; }
/* The rail's end: a spacer the width of the bleed, so the last card stops short of the edge —
   a scroll container's own padding-right is not honoured reliably by every engine. */
.lk-rail::after { content: ""; flex: 0 0 var(--lk-rail-end, 0px); }
.lk-rail-fade { pointer-events: none; position: absolute; top: 0; bottom: 6px; width: 72px; transition: opacity 160ms; }
.lk-rail-fade[data-side="right"] { right: 0; background: linear-gradient(to right, transparent, var(--lk-bg)); }
.lk-rail-fade[data-side="left"] { left: 0; background: linear-gradient(to left, transparent, var(--lk-bg)); }
.lk-rail-btn { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 999px; display: grid; place-items: center; background: var(--lk-surface); color: var(--lk-text); border: 1px solid var(--lk-border); box-shadow: var(--lk-shadow); cursor: pointer; opacity: .92; transition: opacity 160ms, transform 160ms; }
.lk-rail-btn[data-side="right"] { right: 10px; }
.lk-rail-btn[data-side="left"] { left: 10px; }
@media (hover: hover) { .lk-rail-btn:hover { opacity: 1; transform: translateY(-50%) scale(1.06); } }
.lk-rail-btn:focus-visible { outline: 2px solid var(--lk-acc); outline-offset: 2px; }
/* A CARD IN THE RAIL: fixed width, 9:16, no stretching. Hover lifts 4–6px at ~1.015 (the email). */
.lk-short[data-rail="true"] { width: var(--lk-card-w); height: auto; aspect-ratio: 9 / 16; padding: 12px; transition: transform 220ms cubic-bezier(.2,.7,.2,1), box-shadow 220ms cubic-bezier(.2,.7,.2,1); }
.lk-short[data-rail="true"] .lk-short-t { font-size: 14px; }
@media (hover: hover) { .lk-short[data-rail="true"]:hover { transform: translateY(-5px) scale(1.015); box-shadow: 0 18px 34px -14px rgba(0,0,0,.55); } }
.lk-short:focus-visible { outline: 2px solid var(--lk-acc); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .lk-short[data-rail="true"], .lk-rail-btn { transition: none; } .lk-short[data-rail="true"]:hover { transform: none; } }
`;

export function StudyRail({ tier, children, label, style, ariaHidden, bleed = 0 }: {
  tier: Tier;
  children: ReactNode;
  /** The rail's accessible name — the topic. */
  label: string;
  style?: CSSProperties;
  ariaHidden?: boolean;
  /** How far past the column's right edge the rail may run (the column's side padding). */
  bleed?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  const [back, setBack] = useState(false);
  const narrow = tier === "narrow";
  const gap = RAIL_GAP[tier];
  const count = Children.count(children);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const check = () => { setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4); setBack(el.scrollLeft > 4); };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    for (const c of Array.from(el.children)) ro?.observe(c);
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); };
  }, [count, tier]);
  const step = (dir: 1 | -1) => {
    const el = ref.current; if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const w = (first?.getBoundingClientRect().width ?? 240) + gap;
    el.scrollBy({ left: dir * w * (narrow ? 1 : 2), behavior: "smooth" });
  };
  return (
    <div className="lk-rail-wrap" style={{ marginRight: -bleed, ...style }} aria-hidden={ariaHidden || undefined}>
      <div ref={ref} className="lk-rail" data-tier={tier} role="group" aria-label={label} style={{ gap, ["--lk-card-w" as string]: CARD_W[tier], ["--lk-rail-pad" as string]: "0px", ["--lk-rail-end" as string]: Math.max(bleed, 4) + "px" } as CSSProperties}>
        {children}
      </div>
      {back && <div aria-hidden className="lk-rail-fade" data-side="left" style={{ width: narrow ? 28 : 56 }} />}
      {more && <div aria-hidden className="lk-rail-fade" data-side="right" style={{ width: narrow ? 40 : 84 }} />}
      {!narrow && back && (
        <button type="button" className="lk-rail-btn" data-side="left" aria-label="Previous videos" onClick={() => step(-1)}><ChevronLeft className="h-5 w-5" /></button>
      )}
      {!narrow && more && (
        <button type="button" className="lk-rail-btn" data-side="right" aria-label="More videos" onClick={() => step(1)} style={{ color: LK.text }}><ChevronRight className="h-5 w-5" /></button>
      )}
    </div>
  );
}
