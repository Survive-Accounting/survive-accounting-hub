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

export function openFilmMode(setId: string): void {
  writeFilmHandoff(setId);
  // A new tab, not a popup: the film window itself is opened from the canvas
  // with Lee's own `\` key, which keeps it out of popup-blocker territory.
  window.open("/study/canvas", "_blank", "noopener");
}
