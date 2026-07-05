// Server functions for the JE Scenario Engine's admin surface (the /je raw editor).
// Writes go through the SERVICE-ROLE client here because je_scenarios' RLS allows anon
// SELECT only — the browser client can never write it. Same shape as onboarding.functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { scenarioDocV2Schema } from "@/lib/je/scenario-schema";

const saveScenarioSchema = z.object({
  /** Raw JSON text from the editor — parsed and Zod-validated server-side. */
  docJson: z.string().min(2),
});

export interface SaveScenarioResult {
  ok: true;
  slug: string;
  action: "inserted" | "updated";
}

/**
 * Upsert one scenario from raw doc JSON (validated against the full v2 schema).
 * Updates match by slug and keep the existing chapter link; a brand-new slug lands
 * unassigned (the importer / a later authoring pass sets its chapter).
 */
export const saveScenarioDoc = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveScenarioSchema.parse(data))
  .handler(async ({ data }): Promise<SaveScenarioResult> => {
    let json: unknown;
    try {
      json = JSON.parse(data.docJson);
    } catch (e) {
      throw new Error(`Not valid JSON: ${e instanceof Error ? e.message : e}`);
    }
    const parsed = scenarioDocV2Schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
      throw new Error(`Schema validation failed:\n${issues}`);
    }
    const doc = parsed.data;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: exErr } = await (supabaseAdmin.from("je_scenarios" as never) as any)
      .select("id")
      .eq("slug", doc.slug)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);

    if (existing) {
      const { error } = await (supabaseAdmin.from("je_scenarios" as never) as any)
        .update({ title: doc.title, doc })
        .eq("slug", doc.slug);
      if (error) throw new Error(error.message);
      return { ok: true, slug: doc.slug, action: "updated" };
    }

    const { error } = await (supabaseAdmin.from("je_scenarios" as never) as any).insert({
      slug: doc.slug,
      title: doc.title,
      doc,
    });
    if (error) throw new Error(error.message);
    return { ok: true, slug: doc.slug, action: "inserted" };
  });
