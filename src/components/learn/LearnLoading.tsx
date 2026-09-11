// ONE LOADING SCREEN (Lee, 2026-09-10). Before this, /learn showed the brand splash (LearnIntro —
// the boiling wordmark, "Loading cram videos...") for a fixed beat and then, when the student tree
// was still loading, a second, plainer "Loading your cram videos…" screen behind it. Two screens
// for one wait, with a flash between them.
//
// Now there is one, and it is a MOMENT (Lee, later the same day: "make the loading animation more
// impactful"). ≤ 1.6 s on the first arrival of a browser session:
//
//   0 ms     navy field (the home page's --bg-page)
//   60–400   the bolt STRIKES in — scale 0.2 → 1 with an overshoot — and a 120 ms white flash
//            blooms from it at impact
//   400–700  the wordmark settles around it: "surv" and "ve" fade in and rise 6px onto the bolt,
//            which is the "i" (the same lockup numbers SurviveWordmark bakes — see WORDMARK below)
//   640–940  "Cram what's on your exam." fades in under it
//   ~1000    the page REVEALS: a circular wipe from the bolt outward, 600 ms
//
// Still loading after the beat: hold on the finished logo with a slow bolt pulse — no spinner, no
// "loading…" text. A repeat arrival in the same session (INTRO_SEEN_KEY) skips the beat and the
// wipe: the finished logo shows only for as long as loading takes, and not at all if nothing is
// loading. prefers-reduced-motion is instant everywhere. A click ends the beat early.
//
// The bolt is the CAMPUS's coloured bolt when the campus is known (BoltBoil with the school's
// c1/c2, the way the home page colours it) and the brand bolt otherwise. Inline keyframes, no
// library. brand/LearnIntro.tsx is the old splash and is no longer mounted anywhere.
import { useEffect, useRef, useState } from "react";

import { BoltBoil, BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { readIntroSeen, writeIntroSeen } from "@/components/learn/learn-gate";
import { NAVY } from "@/components/learn/learn-theme";
import { useTier } from "@/components/learn/use-tier";
import type { School } from "@/lib/schools";

/** The beat — everything before the wipe. */
const BEAT_MS = 1000;
const WIPE_MS = 600;

const CSS = `
@keyframes lkl-strike { 0% { transform: scale(0.2); opacity: 0; } 55% { transform: scale(1.18); opacity: 1; } 78% { transform: scale(0.94); } 100% { transform: scale(1); opacity: 1; } }
@keyframes lkl-flash { 0% { opacity: 0; } 35% { opacity: 0.9; } 100% { opacity: 0; } }
@keyframes lkl-settle { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes lkl-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
.lkl-bolt { display: inline-block; transform-origin: 50% 60%; }
.lkl-anim .lkl-bolt { animation: lkl-strike 340ms cubic-bezier(0.2, 0.9, 0.3, 1.3) 60ms both; }
.lkl-anim .lkl-flash { animation: lkl-flash 120ms linear 330ms both; }
.lkl-anim .lkl-word { animation: lkl-settle 300ms ease-out 400ms both; }
.lkl-anim .lkl-tag { animation: lkl-settle 300ms ease-out 640ms both; }
.lkl-pulse { display: inline-block; animation: lkl-pulse 1600ms ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .lkl-anim .lkl-bolt, .lkl-anim .lkl-flash, .lkl-anim .lkl-word, .lkl-anim .lkl-tag, .lkl-pulse { animation: none !important; } .lkl-anim .lkl-flash { opacity: 0; } }
`;

export function LearnLoading({ loading, school }: { loading: boolean; school: School | null }) {
  const tier = useTier();
  // Nothing renders on the server or before the first effect — the flags live in storage.
  const [mounted, setMounted] = useState(false);
  /** The brand beat has elapsed (or was skipped). */
  const [held, setHeld] = useState(false);
  /** Repeat visit / reduced motion: no beat, no wipe. */
  const [skipAnim, setSkipAnim] = useState(false);
  /** The wipe is running; the overlay is masked open from the bolt outward. */
  const [wiping, setWiping] = useState(false);
  const [shown, setShown] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const boltRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const seen = readIntroSeen();
    const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setSkipAnim(seen || reduce);
    setMounted(true);
    if (seen || reduce) { setHeld(true); return; }
    // The flag is written when the beat COMPLETES, not on mount — StrictMode's double effect and
    // an aborted first paint must not count as "seen".
    const t = window.setTimeout(() => { setHeld(true); writeIntroSeen(); }, BEAT_MS);
    return () => window.clearTimeout(t);
  }, []);

  const show = mounted && (loading || !held);

  // Wipe out once (and only once) when the screen goes from shown to not-shown.
  useEffect(() => {
    if (show) { setShown(true); setWiping(false); return; }
    if (!shown) return;
    if (skipAnim) { setShown(false); return; }
    const root = rootRef.current, bolt = boltRef.current;
    if (!root || !bolt) { setShown(false); return; }
    // THE WIPE: a growing transparent hole in the overlay's mask, centred on the bolt, driven by
    // rAF because a mask gradient's stops are not animatable across engines.
    const b = bolt.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const vw = window.innerWidth, vh = window.innerHeight;
    const reach = Math.hypot(Math.max(cx, vw - cx), Math.max(cy, vh - cy)) + 8;
    setWiping(true);
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / WIPE_MS);
      const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
      const r = e * reach;
      const mask = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${r}px, #000 ${r + 1}px)`;
      root.style.maskImage = mask;
      root.style.webkitMaskImage = mask;
      if (p < 1) raf = requestAnimationFrame(frame);
      else { setWiping(false); setShown(false); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // `shown` is the state this effect writes; reading it back here would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, skipAnim]);

  if (!show && !wiping) return null;

  // WORDMARK — "surv[bolt]ve", the numbers SurviveWordmark bakes from the Logo Lab lockup (bolt
  // 0.8 of the type size, gap 0.03, baseline drop 0.13, 2° lean). Composed here rather than
  // mounted, because the bolt has to strike in on its own while the letters settle around it.
  const size = tier === "narrow" ? 56 : 80;
  const anim = !skipAnim && !held;
  const pulse = held && loading && !skipAnim;
  const boltColours = school?.c1 && school?.c2 ? { red: school.c1, blue: school.c2 } : {};

  return (
    <div
      ref={rootRef}
      role="presentation"
      onClick={() => { if (!held) { setHeld(true); writeIntroSeen(); } }}
      className={`fixed inset-0 z-[130] grid place-items-center overflow-hidden ${anim ? "lkl-anim" : ""}`}
      style={{ background: NAVY.bg, cursor: held ? "default" : "pointer" }}
    >
      <style>{CSS}</style>
      {anim && <div aria-hidden className="lkl-flash pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 22%, rgba(255,255,255,0) 58%)", opacity: 0 }} />}
      <div className="flex flex-col items-center" style={{ gap: size * 0.3 }}>
        <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: "-0.01em", color: BRAND_CREAM, whiteSpace: "nowrap" }}>
          <span className="lkl-word">surv</span>
          <span ref={boltRef} className="lkl-bolt">
            <span className={pulse ? "lkl-pulse" : undefined} style={{ display: "inline-block" }}>
              <BoltBoil height={size * 0.8} {...boltColours} style={{ marginLeft: size * (0.03 * -0.5), marginRight: size * 0.03, transform: `translate(${size * (-1 / 96)}px, ${size * 0.13}px) rotate(2deg)`, transformOrigin: "100% 51%" }} />
            </span>
          </span>
          <span className="lkl-word">ve</span>
        </span>
        <p className="lkl-tag" style={{ margin: 0, fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 600, fontSize: tier === "narrow" ? 14 : 16, letterSpacing: "0.02em", color: BRAND_CREAM }}>
          <span style={{ opacity: 0.75 }}>Cram what's on your exam.</span>
        </p>
      </div>
    </div>
  );
}
