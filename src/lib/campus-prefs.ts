// CAMPUS PREFERENCE COOKIES — the LAST USED campus, and the two "skip" answers.
//
// "Last used", never "current". A page whose URL names a campus (/<school>, /go/<school>/<chapter>)
// outranks anything stored here — see the priority list in campus-context.tsx. What this buys is a
// sensible default on the pages that name no campus: the homepage, /chapters, /rep.
//
// WHY COOKIES AND NOT ONLY localStorage. The landing routes are server-rendered. localStorage is
// invisible to the server, so a returning visitor's first paint was the GENERIC page (generic
// <title>, generic hero, "Pick your school") which then swapped to their campus after hydration —
// a visible flicker and a wrong <title> in the tab. A cookie travels with the request, so the
// loader can hand the server renderer the same answer the client would reach, and both paint the
// campus version from the first byte.
//
// localStorage is still written alongside (same keys as before) so every existing reader keeps
// working and an old visitor's stored pick survives the upgrade.
//
// VALUES are picker ids ("ole-miss", "lsu"), never slugs or names — the same vocabulary as
// sa-landing-school. Two sentinels: SKIPPED (the visitor declined to name a school at all) and
// NOT_LISTED (they said their school is not in the list). Both serve the Starter Map with generic
// copy; they differ only in what we learned.
//
// This file is client-safe. Reading cookies on the server lives in campus-prefs.functions.ts.

export const CAMPUS_COOKIE = "sa-school";
export const PROF_SKIP_COOKIE = "sa-prof-skip";
export const CAMPUS_STORE_KEY = "sa-landing-school";
export const PROF_SKIP_STORE_KEY = "sa-landing-prof-skip";

export const SKIPPED = "__skipped__";
export const NOT_LISTED = "__notlisted__";

const MAX_AGE = 60 * 60 * 24 * 365; // one year — a preference, not a session

const setCookie = (name: string, value: string | null) => {
  if (typeof document === "undefined") return;
  try {
    document.cookie = value
      ? `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`
      : `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch { /* cookies disabled */ }
};
const setStore = (key: string, value: string | null) => {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* private mode */ }
};

/** Remember the LAST USED campus (picker id, or a sentinel). null forgets it everywhere. */
export function rememberCampus(id: string | null) {
  setCookie(CAMPUS_COOKIE, id);
  setStore(CAMPUS_STORE_KEY, id);
}

/** Remember that the professor question was skipped for this school. Keyed to the school so a
 *  skip at Ole Miss never silences the question at LSU. null forgets it. */
export function rememberProfSkip(schoolId: string | null) {
  setCookie(PROF_SKIP_COOKIE, schoolId);
  setStore(PROF_SKIP_STORE_KEY, schoolId);
}

/** Client-side read of the last-used campus (cookie first, then localStorage for pre-cookie
 *  visitors). Callers must treat it as a DEFAULT — never as an override for a page's own campus. */
export function readStoredCampus(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${CAMPUS_COOKIE}=([^;]*)`));
    if (m) return decodeURIComponent(m[1]) || null;
    return localStorage.getItem(CAMPUS_STORE_KEY);
  } catch { return null; }
}

export function readStoredProfSkip(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${PROF_SKIP_COOKIE}=([^;]*)`));
    if (m) return decodeURIComponent(m[1]) || null;
    return localStorage.getItem(PROF_SKIP_STORE_KEY);
  } catch { return null; }
}

/** What the server hands a route loader: the same three answers, read from the request cookies. */
export type CampusPrefs = {
  /** Picker id, SKIPPED, NOT_LISTED, or null. */
  campus: string | null;
  /** School id whose professor question was skipped, or null. */
  profSkip: string | null;
};
