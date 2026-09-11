// THE PRACTICE CARD (Lee, 2026-09-11) — the last card in every study rail, the same footprint as
// a video card, "the logical next step after watching the shorts", never a utility panel.
//
//   ┌──────────────┐
//   │              │   the cram machine (CramMachine, variant = sectionIndex % 3), centred, ~80% of
//   │   [machine]  │   the width, balanced a little above the centre of the top ~58% of the card,
//   │              │   whole, never cropped, with breathing room
//   │ Practice     │   the one word
//   │ ~10 min      │   the RECOMMENDED ROUND's time (learn-gate's practiceTimeLabel: at most 15
//   │            → │   questions at 40 s) — not the bank size. "97 questions" is off the card.
//   └──────────────┘
//
// IDLE: the whole machine floats 0 → -3px → 0 over ~4.2 s, each section on its own phase
// (animation-delay from sectionIndex) so a page of cards never bobs in unison. Nothing inside
// the machine moves while idle — it looks dormant until it is powered.
// HOVER / FOCUS: the card lifts, the machine scales 1.03, and the power-up plays ONCE per entry
// (CramMachine's `run`); after it the machine rests powered, the bolt on the paper. Title and
// meta never move — no layout shift on hover.
// TOUCH (no hover): the power-up plays once when the card first becomes prominently visible
// (IntersectionObserver ≥ 60%); a tap navigates immediately, nothing waits on the animation.
// REDUCED MOTION: no float, no run; powered from the first paint.
// A11y: a real <button>, its label the topic, visible focus ring; the art is aria-hidden.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Lock } from "lucide-react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { BOLT_LIT, BOLT_SHADE } from "@/components/brand-cards/bolt-boil";
import { CramMachine, machineForSection } from "@/components/learn/CramMachine";
import { practiceTimeLabel } from "@/components/learn/learn-gate";
import { LK } from "@/components/learn/learn-theme";
import type { School } from "@/lib/schools";

export const PRACTICE_CARD_CSS = `
.lk-practice { position: relative; display: flex; flex-direction: column; width: var(--lk-card-w); aspect-ratio: 9 / 16; border-radius: 12px; background: var(--lk-surface); border: 1px solid var(--lk-border); box-shadow: var(--lk-shadow); color: var(--lk-text); text-align: left; cursor: pointer; padding: 0; overflow: hidden; transition: transform 220ms cubic-bezier(.2,.7,.2,1), box-shadow 220ms cubic-bezier(.2,.7,.2,1), border-color 220ms; font-family: ${BRAND_SANS}; }
.lk-practice[data-ready="false"] { cursor: default; opacity: .6; }
@media (hover: hover) { .lk-practice[data-ready="true"]:hover { transform: translateY(-5px) scale(1.015); box-shadow: 0 22px 40px -16px rgba(20,33,61,.35), 0 2px 6px rgba(20,33,61,.08); border-color: var(--lk-border2); } }
.lk-practice[data-ready="true"]:focus-visible { outline: 2px solid var(--lk-acc); outline-offset: 3px; transform: translateY(-5px) scale(1.015); }
.lk-practice-art { flex: 0 0 58%; display: flex; align-items: center; justify-content: center; padding: 10% 8% 4%; }
.lk-practice-float { width: 82%; aspect-ratio: 1 / 1; animation: lk-practice-float 4.2s ease-in-out infinite; will-change: transform; }
@keyframes lk-practice-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.lk-practice-meta { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; padding: 4px 14px 14px; gap: 3px; }
.lk-practice-title { font-size: 20px; line-height: 1.1; }
.lk-practice-time { font-size: 13px; font-weight: 600; color: var(--lk-muted); font-variant-numeric: tabular-nums; }
.lk-practice-go { position: absolute; right: 12px; bottom: 12px; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: var(--lk-acc); color: var(--lk-acc-ink); transition: transform 220ms cubic-bezier(.2,.7,.2,1); }
@media (hover: hover) { .lk-practice:hover .lk-practice-go { transform: translateX(2px); } }
@media (prefers-reduced-motion: reduce) { .lk-practice, .lk-practice-go { transition: none; } .lk-practice-float { animation: none; } .lk-practice[data-ready="true"]:hover { transform: none; } }
`;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function canHover(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(hover: hover)").matches;
}

export function PracticeCard({ topicName, sectionIndex, school, bank, ready, locked, onPractice, onLocked }: {
  topicName: string;
  /** The topic's position on the page — picks the machine (index % 3) and the float's phase. */
  sectionIndex: number;
  school: School | null;
  /** The topic's question bank — the card shows the ROUND's time, not this number. */
  bank: number;
  /** There is something to practice (a set with questions, not paid-locked). */
  ready: boolean;
  /** The topic's practice is behind the paywall — the lock, and onLocked on tap. */
  locked: boolean;
  onPractice: () => void;
  onLocked: () => void;
}) {
  const variant = machineForSection(sectionIndex);
  const primary = school?.c1 ?? BOLT_LIT;
  const secondary = school?.c2 ?? BOLT_SHADE;
  const [run, setRun] = useState(0);
  const [powered, setPowered] = useState(false);
  const [lift, setLift] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const settle = useRef<number | null>(null);

  // Reduced motion: powered from the first client paint, never a run. (In an effect — never a
  // matchMedia read inside useState: the server cannot know, and a hydration mismatch follows.)
  useEffect(() => { if (prefersReducedMotion()) setPowered(true); }, []);

  const play = useCallback(() => {
    if (prefersReducedMotion()) { setPowered(true); return; }
    setRun((r) => r + 1);
    if (settle.current) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => setPowered(true), 1800);
  }, []);
  useEffect(() => () => { if (settle.current) window.clearTimeout(settle.current); }, []);

  // No hover (a phone): one run the first time the card is prominently in view.
  useEffect(() => {
    if (canHover() || powered || typeof IntersectionObserver === "undefined") return;
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.intersectionRatio >= 0.6)) { play(); io.disconnect(); } }, { threshold: [0.6] });
    io.observe(el);
    return () => io.disconnect();
  }, [play, powered]);

  const enter = () => { setLift(true); if (canHover()) play(); };
  const leave = () => setLift(false);
  const time = practiceTimeLabel(bank);
  const label = locked ? `${topicName} practice is in the paid set` : ready ? `Practice ${topicName}` : "Practice comes once this topic has questions";
  return (
    <button
      ref={ref}
      type="button"
      className="lk-practice"
      data-ready={ready || locked}
      disabled={!ready && !locked}
      onClick={() => { if (locked) onLocked(); else if (ready) onPractice(); }}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={() => { setLift(true); play(); }}
      onBlur={leave}
      aria-label={label}
      title={label}
    >
      <div className="lk-practice-art" aria-hidden>
        <div className="lk-practice-float" style={{ animationDelay: `${-((sectionIndex * 0.9) % 4.2)}s` }}>
          <CramMachine variant={variant} primary={primary} secondary={secondary} run={run} powered={powered} lift={lift} />
        </div>
      </div>
      <div className="lk-practice-meta">
        <span className="lk-disp lk-practice-title">Practice</span>
        <span className="lk-practice-time">{locked ? "In the paid set" : (time ?? "No questions yet")}</span>
      </div>
      {(ready || locked) && (
        <span className="lk-practice-go" aria-hidden style={{ color: LK.accInk }}>
          {locked ? <Lock className="h-3.5 w-3.5" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      )}
    </button>
  );
}
