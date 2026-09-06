// THE TELEPROMPTER POPOUT (2026-09-06). Lee: "prompter appears in the popped out one, it's in
// the way of filming. Can we have a popout for teleprompter too? I can place it to the side of
// popped out film capture." A second, SEPARATE named window at /v3/teleprompter?set=<id> — the
// existing big-text mirror (routes/v3.teleprompter.tsx) that already follows the active slide via
// prompter-sync.ts's "sa-film-active" broadcast. Not sized like the 9:16 film popout: this one is
// meant to sit beside it on Lee's screen, read from a few feet back, so a wide, shorter window.
import { useCallback } from "react";

export const TELEPROMPTER_POPOUT_NAME = "sa-teleprompter-popout";
export const TELEPROMPTER_POPOUT_FEATURES = "popup=yes,width=560,height=420";

export function teleprompterPopoutHref(setId: string): string {
  return `/v3/teleprompter?set=${encodeURIComponent(setId)}`;
}

/** Opens (or refocuses) the teleprompter window for this set. Click-only, same reason as the
 *  film popout — a popup opened from anywhere but a direct click is blocked. */
export function useTeleprompterPopout(setId: string): () => void {
  return useCallback(() => {
    try {
      const w = window.open(teleprompterPopoutHref(setId), TELEPROMPTER_POPOUT_NAME, TELEPROMPTER_POPOUT_FEATURES);
      w?.focus();
    } catch { /* blocked — nothing more to do than let the click appear to do nothing */ }
  }, [setId]);
}
