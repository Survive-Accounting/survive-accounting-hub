// ANIMATED CAMPUS BOLT — WHICH CAMPUSES, IN WHAT ORDER.
//
// The school TABLE is not the school ORDER. src/lib/schools.generated.ts is generated from the
// campuses table and comes out alphabetical, which is the worst possible rotation: three maroon
// schools in a row, and whichever school starts with "A" gets the opening slot forever.
//
// So the order is a hand-written list — CURATED_CAMPUS_ORDER in bolt-config.ts — and this module
// is the two small functions that apply it. Editing the rotation means editing that array and
// nothing else.
import { GENERATED_SCHOOLS } from "@/lib/schools.generated";

import { BOLT_ACCENTS, CURATED_CAMPUS_ORDER } from "./bolt-config";
import type { BoltCampus } from "./bolt-palette";

/** Fallback colours for a campus row with no stored pair — the house red/blue, never a guess. */
const HOUSE = { c1: "#C62828", c2: "#1565C0" };

/** Every school in the table as a campus the bolt can wear. Colours are the EXACT stored hex; the
 *  light-colour rule in bolt-palette decides what actually gets painted. */
export function allBoltCampuses(): BoltCampus[] {
  return GENERATED_SCHOOLS.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.courseCode,
    primary: s.c1 ?? HOUSE.c1,
    secondary: s.c2 ?? HOUSE.c2,
    accent: BOLT_ACCENTS[s.id] ?? null,
  }));
}

/** Apply the curated sequence.
 *
 *  Named campuses play first, in the order the array lists them. Anything the array does not
 *  mention still plays — it just plays afterwards, keeping whatever order it arrived in. That is
 *  deliberate: the rotation can never silently drop a campus because someone forgot to add it to
 *  the list, and the list can be trimmed to three schools without breaking anything. */
export function orderCampuses<T extends { id: string }>(
  campuses: T[],
  order: string[] = CURATED_CAMPUS_ORDER,
): T[] {
  const byId = new Map(campuses.map((c) => [c.id, c]));
  const out: T[] = [];
  const taken = new Set<string>();
  for (const id of order) {
    const hit = byId.get(id);
    if (hit && !taken.has(id)) {
      out.push(hit);
      taken.add(id);
    }
  }
  for (const c of campuses) if (!taken.has(c.id)) out.push(c);
  return out;
}

/** The production rotation: every school, curated order. */
export function curatedBoltCampuses(): BoltCampus[] {
  return orderCampuses(allBoltCampuses());
}
