// ONE LOADING SCREEN (Lee, 2026-09-10). Before this, /learn showed the brand splash (LearnIntro —
// the boiling wordmark, "Loading cram videos...") for a fixed beat and then, when the student tree
// was still loading, a second, plainer "Loading your cram videos…" screen behind it. Two screens
// for one wait, with a flash between them.
//
// Now there is one, and it is a MOMENT (Lee, later the same day: "make the loading animation more
// impactful"). ≤ 1.4 s on the first arrival of a browser session:
//
//   0 ms     navy field (the home page's --bg-page)
//   60–400   the bolt STRIKES in — scale 0.2 → 1 with an overshoot — and a 120 ms white flash
//            blooms from it at impact
//   400–700  the wordmark settles around it: "surv" and "ve" fade in and rise 6px onto the bolt,
//            which is the "i" (the same lockup numbers SurviveWordmark bakes — see WORDMARK below)
//   640–940  "Cram what's on your exam." fades in under it
//   ~1000    THE DROP-IN (Lee, 2026-09-11: "we have such a cool animation when you pick a school
//            in the / homepage. It drops into the door. instead of full screen 'Cram videos
//            loading', let's do the same drop in animation from home page, but make it drop in
//            to bolt's position top left"): the letters and the navy fade, and the bolt FLIES to
//            the navbar's bolt — translate + scale over 320 ms with the home page's SwitchFlourish
//            curve — where LearnTop's bolt catches it (keyed by `arrive`, .lk-bolt-arrive).
//
// Still loading after the beat: hold on the finished logo with a slow bolt pulse — no spinner, no
// "loading…" text. A repeat arrival in the same session (INTRO_SEEN_KEY) skips the beat and the
// drop: the finished logo shows only for as long as loading takes, and not at all if nothing is
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

/** The beat — everything before the drop. */
const BEAT_MS = 1000;
/** The drop — the bolt's flight to the navbar (the home page's SwitchFlourish is 250 ms). */
const FLY_MS = 320;
/** The navbar bolt's element id — LearnTop marks its bolt with it; the drop lands there. */
export const NAV_BOLT_ID = "lk-nav-bolt";

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
/* THE DROP: the field and the letters fade, the bolt's wrapper flies (the strike animation owns
   the bolt's own transform, so the flight is on a wrapper around it). */
.lkl-root { transition: background-color ${FLY_MS}ms ease-in; }
.lkl-root[data-fly="true"] { background-color: transparent !important; pointer-events: none; }
.lkl-root[data-fly="true"] .lkl-word, .lkl-root[data-fly="true"] .lkl-tag { opacity: 0 !important; transition: opacity 160ms ease-in; animation: none !important; }
.lkl-fly { display: inline-block; transition: transform ${FLY_MS}ms cubic-bezier(.5, 0, .75, 0); transform-origin: 50% 50%; will-change: transform; }
@media (prefers-reduced-motion: reduce) { .lkl-anim .lkl-bolt, .lkl-anim .lkl-flash, .lkl-anim .lkl-word, .lkl-anim .lkl-tag, .lkl-pulse { animation: none !important; } .lkl-anim .lkl-flash { opacity: 0; } .lkl-fly, .lkl-root { transition: none; } }
`;

export function LearnLoading({ loading, school, onArrive }: {
  loading: boolean;
  school: School | null;
  /** Fires the moment the bolt lands on the navbar — LearnTop pops its bolt to catch it. */
  onArrive?: () => void;
}) {
  const tier = useTier();
  // Nothing renders on the server or before the first effect — the flags live in storage.
  const [mounted, setMounted] = useState(false);
  /** The brand beat has elapsed (or was skipped). */
  const [held, setHeld] = useState(false);
  /** Repeat visit / reduced motion: no beat, no drop. */
  const [skipAnim, setSkipAnim] = useState(false);
  /** The drop is in flight: the overlay fades while the bolt flies to the navbar. */
  const [fly, setFly] = useState<{ dx: number; dy: number; scale: number } | null>(null);
  const [shown, setShown] = useState(false);
  const boltRef = useRef<HTMLSpanElement>(null);
  const arriveRef = useRef(onArrive);
  arriveRef.current = onArrive;

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

  // Drop once (and only once) when the screen goes from shown to not-shown.
  useEffect(() => {
    if (show) { setShown(true); setFly(null); return; }
    if (!shown) return;
    if (skipAnim) { setShown(false); return; }
    const bolt = boltRef.current;
    const target = document.getElementById(NAV_BOLT_ID)?.getBoundingClientRect() ?? null;
    if (!bolt || !target || target.width === 0) { setShown(false); return; }
    // THE FLIGHT: from the splash bolt's centre to the navbar bolt's centre, scaled to its height —
    // the home page's SwitchFlourish maths, aimed at the bar instead of the door.
    const b = bolt.getBoundingClientRect();
    setFly({
      dx: Math.round(target.left + target.width / 2 - (b.left + b.width / 2)),
      dy: Math.round(target.top + target.height / 2 - (b.top + b.height / 2)),
      scale: Math.max(0.15, Math.min(1, target.height / b.height)),
    });
    const t = window.setTimeout(() => { setShown(false); setFly(null); arriveRef.current?.(); }, FLY_MS + 30);
    return () => window.clearTimeout(t);
    // `shown` is the state this effect writes; reading it back here would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, skipAnim]);

  if (!show && !shown) return null;

  // WORDMARK — "surv[bolt]ve", the numbers SurviveWordmark bakes from the Logo Lab lockup (bolt
  // 0.8 of the type size, gap 0.03, baseline drop 0.13, 2° lean). Composed here rather than
  // mounted, because the bolt has to strike in on its own while the letters settle around it.
  const size = tier === "narrow" ? 56 : 80;
  const anim = !skipAnim && !held;
  const pulse = held && loading && !skipAnim && !fly;
  const boltColours = school?.c1 && school?.c2 ? { red: school.c1, blue: school.c2 } : {};

  return (
    <div
      role="presentation"
      onClick={() => { if (!held) { setHeld(true); writeIntroSeen(); } }}
      className={`lkl-root fixed inset-0 z-[130] grid place-items-center overflow-hidden ${anim ? "lkl-anim" : ""}`}
      data-fly={fly ? "true" : undefined}
      style={{ backgroundColor: NAVY.bg, cursor: held ? "default" : "pointer" }}
    >
      <style>{CSS}</style>
      {anim && <div aria-hidden className="lkl-flash pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 22%, rgba(255,255,255,0) 58%)", opacity: 0 }} />}
      <div className="flex flex-col items-center" style={{ gap: size * 0.3 }}>
        <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: "-0.01em", color: BRAND_CREAM, whiteSpace: "nowrap" }}>
          <span className="lkl-word">surv</span>
          <span className="lkl-fly" style={fly ? { transform: `translate(${fly.dx}px, ${fly.dy}px) scale(${fly.scale})` } : undefined}>
            <span ref={boltRef} className="lkl-bolt">
              <span className={pulse ? "lkl-pulse" : undefined} style={{ display: "inline-block" }}>
                <BoltBoil height={size * 0.8} {...boltColours} style={{ marginLeft: size * (0.03 * -0.5), marginRight: size * 0.03, transform: `translate(${size * (-1 / 96)}px, ${size * 0.13}px) rotate(2deg)`, transformOrigin: "100% 51%" }} />
              </span>
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
