// Active-roster governance (admin). Which campuses + professors are "active" for
// the student-facing /order pickers. Service-role writes; the UI lives behind the
// /outreach AdminGate. `active_roster` / `source` / `activated_at` are post-typegen
// columns (migration 0045), hence the `as any` casts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type RosterCampus = { id: string; name: string; activeRoster: string | null; profCount: number };
export type RosterProfessor = {
  id: string; name: string; title: string | null; email: string | null; department: string | null;
  source: string | null; activatedAt: string | null;
  rmpRating: number | null; rmpNumRatings: number | null; rmpProfileUrl: string | null;
};

// Every campus + its active-roster state + count of active professors.
// Sorted active-first, then alphabetical.
export const listActiveRosterCampuses = createServerFn({ method: "GET" })
  .handler(async (): Promise<RosterCampus[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: camps } = await (supabaseAdmin.from("campuses") as any)
      .select("id,name,active_roster").order("name", { ascending: true }).limit(2000);
    const { data: profs } = await (supabaseAdmin.from("campus_lead_suggestions") as any)
      .select("campus_id").not("active_roster", "is", null).is("archived_at", null).limit(5000);
    const counts: Record<string, number> = {};
    for (const p of (profs ?? []) as Array<{ campus_id: string }>) counts[p.campus_id] = (counts[p.campus_id] ?? 0) + 1;
    const rows: RosterCampus[] = ((camps ?? []) as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string, name: (c.name as string) ?? "", activeRoster: (c.active_roster as string) ?? null, profCount: counts[c.id as string] ?? 0,
    }));
    rows.sort((a, b) => (a.activeRoster ? 0 : 1) - (b.activeRoster ? 0 : 1) || a.name.localeCompare(b.name));
    return rows;
  });

// Flip a campus in/out of the SEC active roster.
export const toggleCampusRoster = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("campuses") as any)
      .update({ active_roster: data.active ? "sec" : null }).eq("id", data.campusId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Professors on a campus's active roster (with provenance + RMP data if present).
export const listRosterProfessors = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<RosterProfessor[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await (supabaseAdmin.from("campus_lead_suggestions") as any)
      .select("id,first_name,last_name,title,email,department,source,activated_at,rmp_rating,rmp_num_ratings,rmp_profile_url")
      .eq("campus_id", data.campusId).not("active_roster", "is", null).is("archived_at", null)
      .order("last_name", { ascending: true }).limit(1000);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: [r.first_name, r.last_name].map((x) => (x ?? "") as string).join(" ").trim(),
      title: (r.title as string) ?? null,
      email: (r.email as string) ?? null,
      department: (r.department as string) ?? null,
      source: (r.source as string) ?? null,
      activatedAt: (r.activated_at as string) ?? null,
      rmpRating: (r.rmp_rating as number) ?? null,
      rmpNumRatings: (r.rmp_num_ratings as number) ?? null,
      rmpProfileUrl: (r.rmp_profile_url as string) ?? null,
    }));
  });

// Remove one professor from the roster (does NOT delete the row).
export const removeProfessorFromRoster = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("campus_lead_suggestions") as any)
      .update({ active_roster: null }).eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
