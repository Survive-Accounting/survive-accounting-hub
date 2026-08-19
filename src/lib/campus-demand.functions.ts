// WHICH COURSE CODE TO FIND NEXT — ranked by students who actually asked.
//
// Every selection of a school we cannot name a course for is one student telling us where the
// next hour of research pays. That is a far better queue than guessing from enrolment numbers,
// and it costs nothing to collect.
//
// BEST-EFFORT BY CONSTRUCTION. The handler never throws: a logging failure must not cost someone
// their exam. But it does NOT swallow silently either — a previous best-effort logger returned 200
// while writing nothing, because it validated against a closed enum that its dynamic value could
// never satisfy, and only a DB query found it. This one reports whether the row landed, and the
// caller may ignore that; what matters is that "it worked" is never assumed.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const logCampusCodeDemand = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    campusId: z.string().uuid().optional(),
    campusSlug: z.string().trim().max(160).optional(),
    campusName: z.string().trim().max(200).optional(),
    /** Where the pick happened — "landing", "campus-page", "write-in". Free text on purpose:
     *  a closed enum is exactly what made the last logger fail silently. */
    source: z.string().trim().max(40).default("unknown"),
  }).parse(d))
  .handler(async ({ data }): Promise<{ logged: boolean }> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as unknown as { from: (t: string) => any };
      const { error } = await db.from("campus_code_demand").insert({
        campus_id: data.campusId ?? null,
        campus_slug: data.campusSlug ?? null,
        campus_name: data.campusName ?? null,
        source: data.source,
      });
      // A missing table means 20260819_1615 has not been applied yet. Expected, not an incident.
      if (error) { console.warn("campus_code_demand not logged:", error.message); return { logged: false }; }
      return { logged: true };
    } catch (e) {
      console.warn("campus_code_demand threw:", (e as Error).message);
      return { logged: false };
    }
  });
