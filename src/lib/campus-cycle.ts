// THE CAMPUS CAROUSEL — what the solo door's bolt wears before anyone has told us a school.
//
// A static bolt over "pick your school" asks for work and shows nothing in return. Cycling real
// campuses answers the question first: the bolt turns Ole Miss red, then LSU purple, then Auburn
// navy-and-orange, with the line under it naming each one. It is a preview of what picking GETS
// you, which is a far better invitation than an instruction — and it costs the student who only
// wants to press the button precisely nothing, because the button never moves.
//
// WHICH CAMPUSES. Not all 184. The table stores colours for every campus, but only some of them
// are the school's REAL colours — the long tail shares a handful of stand-in pairs (fifteen
// campuses carry the same navy/gold), and cycling those would be showing a student a lie about
// their school, plus several seconds of a bolt that never visibly changes. The SEC and the rest of
// the Power Four are hand-verified and every pair in them is distinct, so that is the run.
//
// Ole Miss leads, always: it is the flagship campus and the first thing a stranger should see.

import { GENERATED_SCHOOLS } from "./schools.generated";

/** One stop in the carousel. */
export type CampusStop = { id: string; name: string; c1: string; c2: string };

/** Conferences whose colours are hand-verified rather than stand-ins. */
const BRANDED_CONFERENCES = new Set(["SEC", "Big Ten", "Big 12", "ACC"]);

/** The flagship — pinned first. */
const LEAD_ID = "ole-miss";

/** How long the loop should be. Roughly 30 seconds at 1.5s a campus: long enough that it never
 *  feels like a short repeating gif, short enough that the whole thing is reachable. */
const MAX_STOPS = 20;

/** The carousel, built once at module load. SEC first (Ole Miss pinned), then the rest of the
 *  Power Four, alphabetical within each — so the campuses most of our students actually attend are
 *  the ones a short visit sees. */
export const CAMPUS_CYCLE: CampusStop[] = (() => {
  const eligible = GENERATED_SCHOOLS.filter(
    (s) => !!s.c1 && !!s.c2 && (s.isSec || BRANDED_CONFERENCES.has(s.conference)),
  );
  const rank = (s: (typeof eligible)[number]) => (s.id === LEAD_ID ? 0 : s.isSec ? 1 : 2);
  return eligible
    .slice()
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, MAX_STOPS)
    .map((s) => ({ id: s.id, name: s.name, c1: s.c1!, c2: s.c2! }));
})();
