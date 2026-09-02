// THE SCHOOL TABLE — one row per selectable school, and the only place these facts live.
//
// There were three namespaces for "which school is this" and nothing tying them together:
//
//   * the landing picker used short ids   — "ole-miss", "lsu", "texas-am"
//   * /go/ URLs used campus slugs         — "university-of-mississippi", "louisiana-state-university"
//   * the Greek picker printed short_name — "Bama", "Mizzou", "OU", "Vandy", "UT Austin"
//
// So /go/ole-miss/... resolved to nothing (the slug is university-of-mississippi), and the same
// school was called three different things depending on which control you were looking at.
//
// NAME IS THE CANONICAL DISPLAY NAME everywhere — picker, campus pages, /go/ pages, flyers, admin.
// A student who picked "Ole Miss" on the front page should not meet "University of Mississippi"
// two clicks later and wonder whether it's the same list. Formal names and nicknames survive as
// SEARCH ALIASES, which are matched but never rendered.
//
// THE ROWS ARE GENERATED from the campuses table — see schools.generated.ts and the generator at
// migration/supabase-migrations/gen_schools.ts. The database is the source of truth; the generated
// file exists so the picker can render 66 schools synchronously on the first paint, in SSR and on
// a bad phone connection, where a fetch would mean a spinner where a list should be.
//
// WHY NOT EVERY CAMPUS: the table is the SEC 16 plus the hand-verified seed. A student who picks a
// school with no course code gets a worse experience than one asked to tell us about it, so the
// rest of the 945 campuses go through "My school isn't listed" instead.
//
// COURSE CODES ARE HERE NOW, unlike before, because they are part of what makes a campus page
// publishable and the picker needs them to decide which schools it may list. They remain fetched
// at runtime wherever a mid-semester change must not require a deploy (listCampusIntroCodes); this
// copy is the build-time snapshot the picker and the generated pages read.

import { GENERATED_SCHOOLS, type GeneratedSchool } from "./schools.generated";
import { TEST_CAMPUS_NAME, TEST_CAMPUS_SLUG, TEST_COURSE_CODE } from "./test-mode";

export type SecSchool = {
  /** Landing-picker id. Stable, short, used in stored preferences. */
  id: string;
  /** campuses.id — the join key for course codes, professors, maps and entitlements. */
  campusId: string;
  /** campuses.slug — the /go/<school>/<chapter> namespace. */
  slug: string;
  /** THE canonical display name. */
  name: string;
};

export type School = GeneratedSchool;

/** Every selectable school: the SEC 16 plus the seeded campuses. */
export const ALL_SCHOOLS: School[] = GENERATED_SCHOOLS;

/** The SEC 16 alone, for surfaces that group by conference. */
export const SEC_SCHOOL_TABLE: SecSchool[] = GENERATED_SCHOOLS.filter((s) => s.isSec);

/** Non-SEC seeded schools, alphabetical. */
export const OTHER_SCHOOLS: School[] = GENERATED_SCHOOLS.filter((s) => !s.isSec);

const BY_ID = new Map(ALL_SCHOOLS.map((s) => [s.id, s]));
const BY_CAMPUS = new Map(ALL_SCHOOLS.map((s) => [s.campusId, s]));
const BY_SLUG = new Map(ALL_SCHOOLS.map((s) => [s.slug, s]));

// ── THE TEST FIXTURE: LOOKUPS ONLY ─────────────────────────────────────────────────────────────
//
// A tester walking the /go/test-university/test-chapter run sheet was shown "ACCY 201 at Ole Miss"
// — the fixture campus is not a listed school, so every schoolBySlug() call fell through to the
// default campus and the hero named a REAL university. That makes the fixture useless for the one
// thing it exists for: telling test output apart from real output at a glance.
//
// So the row is registered in the lookup maps and NOWHERE ELSE. ALL_SCHOOLS, SEC_SCHOOL_TABLE,
// OTHER_SCHOOLS and searchSchools() all read the generated array, which is untouched — the fixture
// therefore cannot appear in a picker, a ticker, a sitemap or a search result. Resolution works;
// enumeration does not. campusId stays empty on purpose: the real id lives in the database and is
// carried by the loaders, and putting a guess here would collide with a real campus.
const TEST_SCHOOL: School = {
  id: TEST_CAMPUS_SLUG, campusId: "", slug: TEST_CAMPUS_SLUG, name: TEST_CAMPUS_NAME,
  isSec: false, conference: "Other", courseCode: TEST_COURSE_CODE,
  // The fixture's own colourway, matching the campus page, so no test screenshot can be mistaken
  // for a real school's.
  c1: "#2E7D32", c2: "#00695C", aliases: [],
};
BY_ID.set(TEST_SCHOOL.id, TEST_SCHOOL);
BY_SLUG.set(TEST_SCHOOL.slug, TEST_SCHOOL);

export const schoolById = (id: string | null | undefined): School | null => (id ? BY_ID.get(id) ?? null : null);
export const schoolByCampusId = (id: string | null | undefined): School | null => (id ? BY_CAMPUS.get(id) ?? null : null);
export const schoolBySlug = (slug: string | null | undefined): School | null => (slug ? BY_SLUG.get(slug) ?? null : null);

/** Resolve either namespace — picker id OR campus slug. Links get typed and forwarded, and there
 *  is no reason a reader should have to know which form we meant. */
export const schoolByAny = (v: string | null | undefined): School | null => schoolById(v) ?? schoolBySlug(v);

/** Canonical name for a campus slug, for surfaces that only carry the slug (Greek pages).
 *  Falls back to whatever the caller already had rather than inventing a name. */
export function canonicalSchoolName(slug: string | null | undefined, fallback: string): string {
  return schoolBySlug(slug)?.name ?? fallback;
}

/** Bolt colours for a school, by /go/ slug. Falls back to the brand red/blue for anything not in
 *  the table — the same rule the landing picker uses, so a Greek picker row and a landing picker
 *  row show the same school in the same colours. */
export function boltForSlug(slug: string | null | undefined): { c1: string; c2: string } {
  const s = schoolBySlug(slug);
  return s?.c1 && s.c2 ? { c1: s.c1, c2: s.c2 } : { c1: "#C62828", c2: "#1565C0" };
}

/** Course code for a slug, or null. Callers must render "your accounting course" for null rather
 *  than inventing a code. */
export const courseCodeForSlug = (slug: string | null | undefined): string | null => schoolBySlug(slug)?.courseCode ?? null;

const normalize = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u2010-\u2015]/g, "-").replace(/[^a-z0-9]+/g, " ").trim();

/** Search across canonical names AND aliases. Aliases are matched, never displayed, so typing
 *  "Bama", "UIUC" or "Mississippi" lands on the school under the name the rest of the app uses. */
export function searchSchools<T extends { name: string; aliases: string[] }>(query: string, pool: T[] = ALL_SCHOOLS as unknown as T[]): T[] {
  const q = normalize(query);
  if (!q) return pool;
  const scored = pool.map((s) => {
    const name = normalize(s.name);
    const hay = [name, ...s.aliases.map(normalize)];
    // Rank: exact name, name prefix, alias prefix, then any substring. Without this "Miami"
    // ranks Miami (OH) and Miami identically and the order is whatever sort was stable.
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (hay.some((h) => h === q)) score = 2;
    else if (hay.some((h) => h.startsWith(q) || h.split(" ").some((w) => w.startsWith(q)))) score = 3;
    else if (hay.some((h) => h.includes(q))) score = 4;
    return { s, score };
  }).filter((x) => x.score >= 0);
  scored.sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name));
  return scored.map((x) => x.s);
}
