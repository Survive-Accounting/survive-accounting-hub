// CAMPUS PAGES — the per-school SEO surface at /<slug>.
//
// WHY THE COURSE CODE IS FETCHED rather than read from the generated schools table: the generated
// table is a build snapshot, and a code that changes mid-semester must not require a deploy. The
// snapshot is still the fallback, so a database blip degrades to a slightly stale code rather than
// to "your accounting course".
//
// The response is small and cacheable, and the page renders fully server-side, because a campus
// page whose school name arrives after hydration is a campus page Google sees as generic.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { schoolBySlug } from "./schools";

export type CampusPageData = {
  slug: string;
  /** Canonical display name — "Ole Miss", never "University of Mississippi". */
  name: string;
  /** The formal name, for JSON-LD and the one place a legal name reads better. */
  formalName: string;
  campusId: string;
  courseCode: string | null;
  c1: string; c2: string;
  chapterCount: number;
};

export const getCampusPage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<CampusPageData | null> => {
    const s = schoolBySlug(data.slug);
    if (!s) return null;   // not a listed school — the route redirects home

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    let formalName = s.name, courseCode = s.courseCode;
    try {
      const { data: c } = await db.from("campuses")
        .select("name,course_family_codes_json").eq("id", s.campusId).maybeSingle();
      if (c) {
        formalName = (c.name as string) || s.name;
        const raw = c.course_family_codes_json;
        const j = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
        const live = ((j?.intro_1 ?? "") as string).trim();
        if (live) courseCode = live;
      }
    } catch { /* fall back to the build snapshot rather than losing the page */ }

    let chapterCount = 0;
    try {
      const { count } = await db.from("campus_greek_chapters")
        .select("*", { count: "exact", head: true }).eq("campus_id", s.campusId).is("archived_at", null);
      chapterCount = count ?? 0;
    } catch { /* a missing count must not cost the page */ }

    return {
      slug: s.slug, name: s.name, formalName, campusId: s.campusId, courseCode,
      c1: s.c1 ?? "#C62828", c2: s.c2 ?? "#1565C0", chapterCount,
    };
  });
