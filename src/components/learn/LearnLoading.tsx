// ONE LOADING SCREEN (Lee, 2026-09-10). Before this, /learn showed the brand splash (LearnIntro —
// the boiling wordmark, "Loading cram videos...") for a fixed beat and then, when the student tree
// was still loading, a second, plainer "Loading your cram videos…" screen behind it. Two screens
// for one wait, with a flash between them.
//
// Now there is one. The splash is the loading screen: it stays up while the tree loads AND for
// at least the brand beat, then fades once both are done. On a repeat arrival in the same browser
// session (INTRO_SEEN_KEY, sessionStorage) the beat and the fade are skipped entirely — the
// splash shows only for as long as loading actually takes, and not at all if nothing is loading.
// prefers-reduced-motion is treated like a repeat visit. A click ends the beat early.
//
// brand/LearnIntro.tsx is left as it was (not ours to edit in this pass); this replaces its mount
// on /learn. The look is the same mark, the same line, the same navy.
import { useEffect, useState } from "react";

import { BRAND_CREAM, SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { readIntroSeen, writeIntroSeen } from "@/components/learn/learn-gate";

const HOLD_MS = 1400;
const FADE_MS = 420;

export function LearnLoading({ loading }: { loading: boolean }) {
  // Nothing renders on the server or before the first effect — the flags live in storage.
  const [mounted, setMounted] = useState(false);
  /** The brand beat has elapsed (or was skipped). */
  const [held, setHeld] = useState(false);
  /** Repeat visit / reduced motion: no beat, no fade. */
  const [skipAnim, setSkipAnim] = useState(false);
  const [fading, setFading] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const seen = readIntroSeen();
    const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setSkipAnim(seen || reduce);
    setMounted(true);
    if (seen || reduce) { setHeld(true); return; }
    // The flag is written when the beat COMPLETES, not on mount — StrictMode's double effect and
    // an aborted first paint must not count as "seen".
    const t = window.setTimeout(() => { setHeld(true); writeIntroSeen(); }, HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);

  const show = mounted && (loading || !held);

  // Fade out once (and only once) when the screen goes from shown to not-shown.
  useEffect(() => {
    if (show) { setShown(true); setFading(false); return; }
    if (!shown) return;
    if (skipAnim) { setShown(false); return; }
    setFading(true);
    const t = window.setTimeout(() => { setFading(false); setShown(false); }, FADE_MS);
    return () => window.clearTimeout(t);
    // `shown` is the state this effect writes; reading it back here would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, skipAnim]);

  if (!show && !fading) return null;

  return (
    <div
      role="presentation"
      onClick={() => { if (!held) { setHeld(true); writeIntroSeen(); } }}
      className="fixed inset-0 z-[130] grid cursor-pointer place-items-center"
      style={{ background: "#0A1220", opacity: fading ? 0 : 1, transition: skipAnim ? undefined : `opacity ${FADE_MS}ms ease` }}
    >
      <div className="flex flex-col items-center gap-4">
        {/* No boilFrame → the wordmark's own CSS boil runs, exactly like the footer mark. */}
        <SurviveWordmark size={72} />
        <p style={{ fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 600, fontSize: 14, letterSpacing: "0.04em", color: BRAND_CREAM, opacity: 0.7 }}>
          Loading cram videos...
        </p>
      </div>
    </div>
  );
}
