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
import { TEST_CAMPUS_SLUG } from "@/lib/test-mode";

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    // THE TEST FIXTURE resolves straight from the database. It is deliberately not in the static
    // school list (that list feeds every picker, ticker and sitemap, and a fake campus must never
    // appear in one), so it needs the one branch that reads a campus by slug instead of by the
    // build snapshot. Everything downstream — the hero, the player, the course code — then behaves
    // exactly as it does for a real campus, which is the whole point of testing on it.
    if (data.slug === TEST_CAMPUS_SLUG) {
      try {
        const { data: c } = await db.from("campuses")
          .select("id,name,short_name,course_family_codes_json").eq("slug", TEST_CAMPUS_SLUG).maybeSingle();
        if (!c?.id) return null;
        const raw = c.course_family_codes_json;
        const j = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
        const { count } = await db.from("campus_greek_chapters")
          .select("*", { count: "exact", head: true }).eq("campus_id", c.id);
        return {
          slug: TEST_CAMPUS_SLUG,
          name: (c.short_name as string) || (c.name as string),
          formalName: (c.name as string),
          campusId: c.id as string,
          courseCode: ((j?.intro_1 ?? "") as string).trim() || null,
          // A colourway of its own, so a tester can never mistake the fixture for a real campus.
          c1: "#2E7D32", c2: "#00695C",
          chapterCount: count ?? 0,
        };
      } catch { return null; }
    }

    const s = schoolBySlug(data.slug);
    if (!s) return null;   // not a listed school — the route redirects home

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
