// THREE TIERS (desktop pass, 2026-09-10). /learn used to know one thing about the viewport —
// "narrow" under 720px — and the desktop was a phone page stretched: four 152px cards huddled at
// the left, Practice pushed to the far right with 900px of nothing between. Three tiers, one hook:
//
//   narrow  < 640      the phone page (strip of fixed frames, bottom tabs, compact entrance)
//   mid     640–1023   a tablet / small laptop: three frames + Practice in a grid
//   wide    ≥ 1024     the desk: four frames + Practice, the grand entrance
//
// SSR-SAFE, AND HYDRATION-SAFE THIS TIME. The old useIsNarrow read matchMedia inside its useState
// initializer, so the server said "not narrow" and the client's first render disagreed — a
// hydration mismatch React 19 refuses to patch (attributes and styles keep the SERVER's values),
// which is exactly how a 800px viewport ended up wearing the wide layout with React state saying
// "mid". So: the server AND the client's first render both say "wide", and the real tier is read
// in a layout effect — before the first paint, so a phone never flashes the desk. matchMedia
// change events and `resize` keep it current after that.
import { useEffect, useLayoutEffect, useState, type DependencyList, type EffectCallback } from "react";

export type Tier = "narrow" | "mid" | "wide";

export const NARROW_MAX = 639;
export const MID_MAX = 1023;

/** The tier for a viewport width — the one rule, so the hook and its test agree. */
export function tierFor(width: number): Tier {
  if (width <= NARROW_MAX) return "narrow";
  if (width <= MID_MAX) return "mid";
  return "wide";
}

function readTier(): Tier {
  if (typeof window === "undefined" || !window.matchMedia) return "wide";
  if (window.matchMedia(`(max-width: ${NARROW_MAX}px)`).matches) return "narrow";
  if (window.matchMedia(`(max-width: ${MID_MAX}px)`).matches) return "mid";
  return "wide";
}

/** useLayoutEffect on the client, useEffect on the server (where layout effects are a no-op that
 *  some React versions warn about). The branch is constant per environment, so hook order holds. */
function useIsoLayoutEffect(effect: EffectCallback, deps: DependencyList): void {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return typeof window === "undefined" ? useEffect(effect, deps) : useLayoutEffect(effect, deps);
}

export function useTier(): Tier {
  const [tier, setTier] = useState<Tier>("wide");
  useIsoLayoutEffect(() => {
    const queries = [window.matchMedia(`(max-width: ${NARROW_MAX}px)`), window.matchMedia(`(max-width: ${MID_MAX}px)`)];
    const on = () => setTier(readTier());
    on();
    for (const q of queries) q.addEventListener("change", on);
    // `resize` as well: a viewport change that arrives without an MQL change event (device
    // emulation, some zoom paths) must still re-tier the page.
    window.addEventListener("resize", on);
    return () => { for (const q of queries) q.removeEventListener("change", on); window.removeEventListener("resize", on); };
  }, []);
  return tier;
}
