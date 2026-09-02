// THE REMEMBERED CHAPTER — client-side only, the sibling of campus-prefs' remembered campus.
//
// A student who has told the homepage which house they are in should not be asked again, and the
// chapter card should wear their letters rather than a rotating sample. That is the whole job.
//
// WHY LOCALSTORAGE AND NOT A COOKIE: the campus cookie exists because the SERVER renders the
// campus (the headline names it, so it must be right in the very first paint). Nothing is
// server-rendered from the chapter — it only changes a line and an icon after mount — so a cookie
// would cost every request a header for no gain. Read it in an effect, never during render.
//
// The school slug is stored WITH the chapter: a chapter only means anything at one campus, and a
// student who switches schools must not keep the old house's letters.

export const CHAPTER_STORE_KEY = "sa-chapter";

export type StoredChapter = {
  /** campuses.slug the chapter belongs to. */
  schoolSlug: string;
  /** campus_greek_chapters.slug — the /go/<school>/<chapter> namespace. */
  slug: string;
  /** Display name ("Alpha Delta Pi"). */
  name: string;
  /** Greek letters when the roster has them; many rows do not, so callers must handle null. */
  letters: string | null;
  /** What students actually call the house ("ADPi"). Optional: values stored before this
   *  existed will not have it, so every reader must tolerate its absence. */
  nickname?: string | null;
};

/** Remember (or forget, with null) the visitor's chapter. Never throws — storage can be denied. */
export function rememberChapter(c: StoredChapter | null): void {
  try {
    if (!c) localStorage.removeItem(CHAPTER_STORE_KEY);
    else localStorage.setItem(CHAPTER_STORE_KEY, JSON.stringify(c));
  } catch { /* private mode / storage denied — the page just forgets, which is fine */ }
}

/** The stored chapter, but ONLY if it belongs to the school passed in. A remembered house at a
 *  campus the visitor has since switched away from is stale, not useful. */
export function readStoredChapter(forSchoolSlug: string | null | undefined): StoredChapter | null {
  if (!forSchoolSlug) return null;
  try {
    const raw = localStorage.getItem(CHAPTER_STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredChapter>;
    if (!v || typeof v.slug !== "string" || typeof v.schoolSlug !== "string") return null;
    if (v.schoolSlug !== forSchoolSlug) return null;
    return { schoolSlug: v.schoolSlug, slug: v.slug, name: typeof v.name === "string" ? v.name : v.slug, letters: typeof v.letters === "string" ? v.letters : null, nickname: typeof v.nickname === "string" ? v.nickname : null };
  } catch { return null; }
}
