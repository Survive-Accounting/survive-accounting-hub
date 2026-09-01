// BLAST OFF → FILM. Opens the study canvas on this set, in a new tab.
//
// The canvas film surface is the one that already has everything filming needs
// — identical frame geometry on every flip, highlight-to-yellow on stems and
// choices, the spotlight rig, chains, reveal, and the brand bolt cursor. So
// blast-off does not film; it hands over.
//
// Reuses the same 2-minute localStorage intent the film-pick handoff uses, and
// the same consume-once effect on the canvas side. One mechanism, not two.
import { writeFilmHandoff } from "@/lib/film-handoff";

/** The canvas's own outline-collapsed preference. Arriving from Blast Off, the
 *  running order is already decided, so the topic tree is just something to
 *  close before filming — Lee, on landing in the canvas: "it lands oddly, close
 *  the topic thing by default."
 *
 *  Set through the canvas's PUBLISHED preference key rather than by reaching
 *  into its state: the canvas reads this on mount already, so the handoff needs
 *  no new prop and no change to that route. It is a real preference, so it
 *  stays collapsed afterwards — the « / » control puts it back. */
const OUTLINE_COLLAPSED_KEY = "sa-outline-collapsed";

export function openFilmMode(setId: string): void {
  writeFilmHandoff(setId);
  try { localStorage.setItem(OUTLINE_COLLAPSED_KEY, "1"); } catch { /* cosmetic */ }
  // A new tab, not a popup: the film window itself is opened from the canvas
  // with Lee's own `\` key, which keeps it out of popup-blocker territory.
  window.open("/study/canvas", "_blank", "noopener");
}
