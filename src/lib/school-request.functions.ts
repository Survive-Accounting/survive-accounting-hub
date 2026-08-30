// "Request your school" — PUBLIC (students submit from the picker, no admin gate). Captures
// the school + optional email as a demand signal; matches an existing campus when it can so
// Lee sees the ask against a real row. Service-role write, server-only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const requestSchool = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        schoolName: z.string().trim().min(2).max(200),
        email: z.string().trim().email().max(200).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    // Best-effort match to an existing campus so the request lands against a real row.
    const { data: hit } = await db
      .from("campuses")
      .select("id")
      .ilike("name", data.schoolName)
      .is("merged_into_id", null)
      .limit(1)
      .maybeSingle();
    const { error } = await db.from("growth_school_requests").insert({
      school_name: data.schoolName,
      email: data.email || null,
      campus_id: hit?.id ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
