// THE ARRIVAL FLOURISH (Lee, 2026-09-11: "we have such a cool animation when you pick a school in
// the / homepage. It drops into the door. instead of full screen 'Cram videos loading', let's do
// the same drop in animation from home page, but make it drop in to bolt's position top left" —
// and, after the first cut still filled the screen with navy: "I'm still seeing the wipe whole
// screen, not the drop in").
//
// So this is the home page's SwitchFlourish, aimed at the navbar. NO full-screen field: the page
// — navbar, cream, hero — is there from the first paint, and over it, pointer-events none:
//
//   0 ms      a soft radial wash in the campus's ink (fades over ~380 ms) and the bolt, 96px, in
//             the campus's colours, boiling, with "ACCT 200 · Tennessee" under it, popping in
//             (scale .7 → 1, 150 ms)
//   ≥ 500 ms  the moment the student tree has loaded (never before the beat is up): the bolt
//             FLIES to the navbar's bolt — translate + scale over 250 ms on the home page's curve,
//             fading as it lands — and LearnTop's bolt pops to catch it (`arrive`)
//
// Still loading after the beat: the bolt keeps boiling in the centre — no spinner, no "loading…".
// A repeat arrival in the same session (INTRO_SEEN_KEY) shows nothing at all; prefers-reduced-
// motion shows nothing at all. Inline keyframes, no library. brand/LearnIntro.tsx is the old
// splash and is no longer mounted anywhere.
import { useEffect, useRef, useState } from "react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY } from "@/components/canvas/brand";
import { readIntroSeen, writeIntroSeen } from "@/components/learn/learn-gate";
import { LK } from "@/components/learn/learn-theme";
import { useTier } from "@/components/learn/use-tier";
import type { School } from "@/lib/schools";

/** The beat — the bolt is on screen at least this long before it flies. */
const BEAT_MS = 500;
/** The flight — the home page's SwitchFlourish is 250 ms. */
const FLY_MS = 250;
/** The navbar bolt's element id — LearnTop marks its bolt with it; the drop lands there. */
export const NAV_BOLT_ID = "lk-nav-bolt";

const CSS = `
@keyframes lkl-wash { 0% { opacity: 0; } 32% { opacity: .42; } 100% { opacity: 0; } }
@keyframes lkl-core { 0% { opacity: 0; transform: scale(.7); } 100% { opacity: 1; transform: scale(1); } }
.lkl-wash { position: absolute; inset: 0; animation: lkl-wash 380ms ease forwards; }
.lkl-core { display: grid; justify-items: center; gap: 12px; animation: lkl-core 150ms ease-out both; }
/* Two elements on purpose: the OUTER one flies (inline transform), the INNER one pops in (keyframes). */
.lkl-fly { position: relative; transition: transform ${FLY_MS}ms cubic-bezier(.5, 0, .75, 0), opacity ${FLY_MS}ms ease-in; will-change: transform; }
@media (prefers-reduced-motion: reduce) { .lkl-wash, .lkl-core { animation: none; } .lkl-fly { transition: none; } }
`;

export function LearnLoading({ loading, school, campusName, courseCode, onArrive }: {
  loading: boolean;
  school: School | null;
  campusName: string | null;
  courseCode: string | null;
  /** Fires the moment the bolt lands on the navbar — LearnTop pops its bolt to catch it. */
  onArrive?: () => void;
}) {
  const tier = useTier();
  /** "play" once the client knows this is a first arrival; "skip" otherwise; null before it knows. */
  const [mode, setMode] = useState<"play" | "skip" | null>(null);
  const [beatUp, setBeatUp] = useState(false);
  const [fly, setFly] = useState<{ dx: number; dy: number; scale: number } | null>(null);
  const [done, setDone] = useState(false);
  const boltRef = useRef<HTMLDivElement>(null);
  const arriveRef = useRef(onArrive);
  arriveRef.current = onArrive;

  useEffect(() => {
    const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (readIntroSeen() || reduce) { setMode("skip"); return; }
    setMode("play");
    const t = window.setTimeout(() => setBeatUp(true), BEAT_MS);
    return () => window.clearTimeout(t);
  }, []);

  // THE FLIGHT — when the tree is in and the beat is up. Measured from the flourish's bolt to the
  // navbar's; if the navbar bolt cannot be found (it always can — LearnTop is in the same tree),
  // the bolt simply fades where it is.
  useEffect(() => {
    if (mode !== "play" || !beatUp || loading || fly || done) return;
    const from = boltRef.current?.getBoundingClientRect();
    const to = document.getElementById(NAV_BOLT_ID)?.getBoundingClientRect();
    if (from && to && to.width > 0) {
      setFly({ dx: Math.round(to.left + to.width / 2 - (from.left + from.width / 2)), dy: Math.round(to.top + to.height / 2 - (from.top + from.height / 2)), scale: Math.max(0.15, Math.min(1, to.height / from.height)) });
    } else {
      setFly({ dx: 0, dy: 0, scale: 0.8 });
    }
    const t = window.setTimeout(() => { setDone(true); writeIntroSeen(); arriveRef.current?.(); }, FLY_MS + 20);
    return () => window.clearTimeout(t);
  }, [mode, beatUp, loading, fly, done]);

  if (mode !== "play" || done) return null;

  const size = tier === "narrow" ? 72 : 96;
  const line = [courseCode, campusName].filter(Boolean).join(" · ");
  const c1 = school?.c1, c2 = school?.c2;
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 130, pointerEvents: "none", display: "grid", placeItems: "center" }}>
      <style>{CSS}</style>
      <div className="lkl-wash" style={{ background: `radial-gradient(60% 50% at 50% 44%, ${c1 ?? "var(--lk-acc)"} 0%, transparent 72%)` }} />
      <div className="lkl-fly" style={fly ? { transform: `translate(${fly.dx}px, ${fly.dy}px) scale(${fly.scale})`, opacity: 0 } : undefined}>
        <div className="lkl-core">
          <div ref={boltRef} style={{ lineHeight: 0 }}>
            <BoltBoil height={size} red={c1 ?? undefined} blue={c2 ?? undefined} />
          </div>
          {line && (
            <span style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: tier === "narrow" ? 14 : 16, letterSpacing: "0.02em", color: LK.text, whiteSpace: "nowrap", opacity: fly ? 0 : 1, transition: "opacity 160ms ease-in" }}>
              {line}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
