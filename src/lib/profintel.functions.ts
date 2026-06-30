// Server functions for ProfIntel faculty mobility. Anon can't INSERT into
// `campuses` (RLS allows only SELECT/UPDATE), so creating a destination campus
// for a moved professor runs service-role here.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const createCampusSchema = z.object({
  name: z.string().trim().min(2).max(200),
  state: z.string().trim().max(60).nullable().optional(),
});

// Creates a GATED campus for a moved-faculty destination we don't have yet.
// ready_for_outreach=false + approval_status='pending' keep it OUT of the
// student onboarding search (which filters ready_for_outreach=true) until it's
// vetted. De-dupes on a case-insensitive name so we reuse an existing campus
// rather than spawning a duplicate.
export const createMobilityCampus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createCampusSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string; name: string; existed: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("campuses").select("id,name").ilike("name", data.name).maybeSingle();
    if (existing) {
      return { id: existing.id as string, name: (existing.name as string) ?? data.name, existed: true };
    }
    const { data: row, error } = await supabaseAdmin
      .from("campuses")
      .insert({
        name: data.name,
        state: data.state ?? null,
        ready_for_outreach: false,
        approval_status: "pending",
        is_active: true,
        outreach_notes: "Created via ProfIntel (faculty move) — vet before student-facing use.",
      } as never)
      .select("id,name")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, name: (row.name as string) ?? data.name, existed: false };
  });
