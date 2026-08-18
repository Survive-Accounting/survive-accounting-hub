// THE SCHOOL TABLE — one row per SEC school, and the only place these facts live.
//
// There were three namespaces for "which school is this" and nothing tying them together:
//
//   * the landing picker used short ids   — "ole-miss", "lsu", "texas-am"
//   * /go/ URLs used campus slugs         — "university-of-mississippi", "louisiana-state-university"
//   * the Greek picker printed short_name — "Bama", "Mizzou", "OU", "Vandy", "UT Austin"
//
// So /go/ole-miss/... resolved to nothing (the slug is university-of-mississippi), and the same
// school was called three different things depending on which control you were looking at. Every
// mapping below was verified against the campuses table rather than inferred from the names: all
// sixteen resolve to a slugged campus with is_sec = true.
//
// NAME IS THE LANDING PICKER'S NAME. That is the canonical display name everywhere, Greek pages
// included — a student who picked "Ole Miss" on the front page should not meet "University of
// Mississippi" two clicks later and wonder whether it's the same list. The DB keeps its formal
// `name` for records and its `short_name` nicknames for whatever else wants them; neither is
// rendered to students any more.
//
// COURSE CODES ARE NOT HERE ON PURPOSE. They live in campuses.course_family_codes_json.intro_1 and
// are fetched at runtime (listCampusIntroCodes), because a code that changes mid-semester must not
// require a deploy — and a hardcoded copy would be a second source of truth for the exact fact this
// module exists to have only one of.

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

export const SEC_SCHOOL_TABLE: SecSchool[] = [
  { id: "ole-miss",          campusId: "7b92a320-b196-43f2-a241-77a0805816fe", slug: "university-of-mississippi",        name: "Ole Miss" },
  { id: "lsu",               campusId: "698dd98f-dd92-46c1-8f28-e930568cb15d", slug: "louisiana-state-university",       name: "LSU" },
  { id: "alabama",           campusId: "b3af67c6-99a5-4677-83d5-aa7d11a89c17", slug: "university-of-alabama",            name: "Alabama" },
  { id: "tennessee",         campusId: "9c4775be-7d82-4a3e-840c-349c5e15d8e8", slug: "university-of-tennessee-knoxville", name: "Tennessee" },
  { id: "arkansas",          campusId: "e631c8de-37a3-4aae-a948-a64bd20ea4c5", slug: "university-of-arkansas",           name: "Arkansas" },
  { id: "south-carolina",    campusId: "5f5bd18d-b92f-4d56-aced-23bce4c983d5", slug: "university-of-south-carolina",     name: "South Carolina" },
  { id: "georgia",           campusId: "3f570e37-5394-4058-baab-508948befedb", slug: "university-of-georgia",            name: "Georgia" },
  { id: "kentucky",          campusId: "ae339230-577e-4569-a7d1-d1e45d1cfe91", slug: "university-of-kentucky",           name: "Kentucky" },
  { id: "auburn",            campusId: "e330e87c-5467-4c05-9d3d-6cd2398de036", slug: "auburn-university",                name: "Auburn" },
  { id: "mississippi-state", campusId: "95246fc8-1ce6-409e-b454-d03c82766719", slug: "mississippi-state-university",     name: "Mississippi State" },
  { id: "missouri",          campusId: "f16686c2-edc6-43f8-9638-6890f52c829a", slug: "university-of-missouri",           name: "Missouri" },
  { id: "oklahoma",          campusId: "91e62f9c-43b0-41f3-a84d-002824754da6", slug: "university-of-oklahoma",           name: "Oklahoma" },
  { id: "texas-am",          campusId: "92e4a5d9-eeb3-4065-ac8a-5a4390fbc584", slug: "texas-aandm-university",           name: "Texas A&M" },
  { id: "florida",           campusId: "4c5126b1-3fe0-48fe-a1db-1e41d06e4642", slug: "university-of-florida",            name: "Florida" },
  { id: "texas",             campusId: "faad6039-be72-4f5c-8ad5-ca7b95e2889f", slug: "university-of-texas-at-austin",     name: "Texas" },
  { id: "vanderbilt",        campusId: "972451c3-bc5e-48d7-9f88-868a55378efa", slug: "vanderbilt-university",            name: "Vanderbilt" },
];

const BY_ID = new Map(SEC_SCHOOL_TABLE.map((s) => [s.id, s]));
const BY_CAMPUS = new Map(SEC_SCHOOL_TABLE.map((s) => [s.campusId, s]));
const BY_SLUG = new Map(SEC_SCHOOL_TABLE.map((s) => [s.slug, s]));

export const schoolById = (id: string | null | undefined): SecSchool | null => (id ? BY_ID.get(id) ?? null : null);
export const schoolByCampusId = (id: string | null | undefined): SecSchool | null => (id ? BY_CAMPUS.get(id) ?? null : null);
export const schoolBySlug = (slug: string | null | undefined): SecSchool | null => (slug ? BY_SLUG.get(slug) ?? null : null);

/** Canonical name for a campus slug, for surfaces that only carry the slug (Greek pages).
 *  Falls back to whatever the caller already had rather than inventing a name. */
export function canonicalSchoolName(slug: string | null | undefined, fallback: string): string {
  return schoolBySlug(slug)?.name ?? fallback;
}
