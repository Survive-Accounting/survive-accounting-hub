// Server-side read of the campus preference cookies (see campus-prefs.ts for why they exist).
// Called from route loaders so the SERVER render already knows the visitor's campus.
import { createServerFn } from "@tanstack/react-start";

import { CAMPUS_COOKIE, PROF_SKIP_COOKIE, type CampusPrefs } from "@/lib/campus-prefs";

const clean = (v: string | undefined | null) => {
  const s = (v ?? "").trim();
  // Picker ids and the two sentinels are short [a-z0-9_-] tokens; anything else is not ours.
  return s && /^[a-z0-9_-]{1,40}$/i.test(s) ? s : null;
};

export const readCampusPrefs = createServerFn({ method: "GET" })
  .handler(async (): Promise<CampusPrefs> => {
    try {
      const { getCookie } = await import("@tanstack/react-start/server");
      return { campus: clean(getCookie(CAMPUS_COOKIE)), profSkip: clean(getCookie(PROF_SKIP_COOKIE)) };
    } catch {
      return { campus: null, profSkip: null };
    }
  });

