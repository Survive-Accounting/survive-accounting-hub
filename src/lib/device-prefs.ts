// SMALL PER-DEVICE PREFERENCES — the "I dismissed this, stop showing it" store.
//
// Not a settings system. This is for the handful of things a student turns off on their own phone
// and expects to stay off: a waitlist card, a promo strip, a tip. It is localStorage, so it is
// per-device by definition, and it survives a reload and a navigation — which is the whole point
// of the requirement. It is NOT account state and must never hold anything we would be sad to
// lose when someone clears their browser.
//
// ── WHY EVERY ACCESS IS WRAPPED ───────────────────────────────────────────────────────────────
// localStorage throws, not returns null, in three situations that all really happen: Safari
// private mode (quota 0 on write), a browser configured to block site data, and SSR, where the
// global does not exist at all. An unguarded read in a component body takes the whole page down.
// Every function here fails closed — "not dismissed" — because showing a card twice is a much
// smaller failure than a white screen.
import { useCallback, useEffect, useState } from "react";

const PREFIX = "sa-pref:";

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(PREFIX + key);
  } catch { return null; }
}

function write(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(PREFIX + key, value);
  } catch { /* private mode / blocked storage — the dismissal is just not remembered */ }
}

export function isDismissed(key: string): boolean {
  return read(`dismissed:${key}`) === "1";
}

export function setDismissed(key: string, value = true): void {
  write(`dismissed:${key}`, value ? "1" : "0");
}

/** A dismissal that survives reloads.
 *
 *  ── WHY IT STARTS FALSE AND CORRECTS ITSELF ─────────────────────────────────────────────────
 *  Reading localStorage during render would make the server and the client disagree — the server
 *  always says "not dismissed" — and React would throw a hydration mismatch, which in this app
 *  means the interactive tree never attaches and every button on the page silently stops working.
 *  So the first render always matches the server, and the effect corrects it a tick later. The
 *  visible cost is one frame of a card that is about to disappear; the alternative is a page that
 *  does not respond to taps. */
export function usePersistedDismiss(key: string): [dismissed: boolean, dismiss: () => void, restore: () => void] {
  const [dismissed, setLocal] = useState(false);

  useEffect(() => { setLocal(isDismissed(key)); }, [key]);

  const dismiss = useCallback(() => { setDismissed(key, true); setLocal(true); }, [key]);
  const restore = useCallback(() => { setDismissed(key, false); setLocal(false); }, [key]);

  return [dismissed, dismiss, restore];
}
