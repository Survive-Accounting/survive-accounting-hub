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

/** THE V3 PRESET (Lee, 2026-09-03, after his first send-to-film: "I want 120
 *  fade on by default. Bolt on … the spine, the edit stem, script, click to
 *  mark correct, like so much of this is already taken care of in the review
 *  phase in v3. Let's shelve most of this stuff … it's in landscape mode. I
 *  want it to default to vertical"). The studio already has a switch that
 *  drops exactly that authoring chrome — FILMING MODE (F2, `sa-filming-mode`)
 *  — so the handoff flips it on, sets the vertical frame, the 120 fade and
 *  the bolt, all through the studio's own published preference keys. Every
 *  one of them is still a toggle in the studio; nothing here is a fork. */
const V3_PRESET: Record<string, string> = {
  "sa-filming-mode": "1",
  "sa-orientation": "9:16",
  "sa-fade-ms": "120",
  "sa-brand-cursor": "1",
};

export function openFilmMode(setId: string): void {
  writeFilmHandoff(setId);
  try {
    localStorage.setItem(OUTLINE_COLLAPSED_KEY, "1");
    for (const [k, v] of Object.entries(V3_PRESET)) localStorage.setItem(k, v);
  } catch { /* cosmetic */ }
  // A new tab, not a popup: the film window itself is opened from the canvas
  // with Lee's own `\` key, which keeps it out of popup-blocker territory.
  window.open("/study/canvas", "_blank", "noopener");
}
