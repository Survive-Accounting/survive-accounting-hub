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

/** Fallback colours for a campus row with no stored pair — the house mark, never a guess.
 *  A campus WITH a stored pair keeps its own two school colours; this is only the neutral. */
const HOUSE = { c1: "#006BA6", c2: "#00456E" };

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

/** One campus, addressed by EITHER namespace — the picker id ("ole-miss") or the /go/ slug
 *  ("university-of-mississippi"). Both are in circulation: Greek and council pages carry slugs
 *  from the database, while hand-written showcase lists are written in ids, and a helper that only
 *  understood one of them silently returned the house red/blue for the other. That is exactly what
 *  the partner index pages were doing — SHOWCASE lists ids, the lookup was by slug, so every bolt
 *  on those pages wore brand colours and a plate reading "OLE-MISS".
 *
 *  `over` lets a caller supply a name or code it already resolved (a council page knows its own
 *  school's verified code); anything it omits comes from the generated table. An id that matches
 *  nothing still falls back to the house colourway rather than inventing one. */
export function boltCampusFor(idOrSlug: string, over: Partial<BoltCampus> = {}): BoltCampus {
  const s = GENERATED_SCHOOLS.find((x) => x.id === idOrSlug || x.slug === idOrSlug);
  return {
    id: s?.id ?? idOrSlug,
    name: s?.name ?? idOrSlug,
    code: s?.courseCode ?? null,
    primary: s?.c1 ?? HOUSE.c1,
    secondary: s?.c2 ?? HOUSE.c2,
    accent: (s && BOLT_ACCENTS[s.id]) ?? null,
    ...over,
  };
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
