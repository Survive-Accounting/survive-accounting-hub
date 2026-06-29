// Reads the curated, hand-verified campus_spirit row for a campus. Returns a
// row ONLY when verified === true AND the required fields (primary_hex, mascot)
// are present — otherwise null, so onboarding shows the neutral on-brand
// fallback. A wrong guess is impossible by design: unverified == no data here.
import { supabase } from "@/integrations/supabase/client";

export interface CampusSpirit {
  primary_hex: string;
  secondary_hex: string | null;
  tertiary_hex: string | null;
  mascot: string;
  greeting: string | null;
  chant: string | null;
}

export async function getCampusSpirit(campusId: string | null): Promise<CampusSpirit | null> {
  if (!campusId) return null;
  try {
    const { data, error } = await (supabase.from("campus_spirit" as never) as any)
      .select("primary_hex, secondary_hex, tertiary_hex, mascot, greeting, chant, verified")
      .eq("campus_id", campusId)
      .maybeSingle();
    if (error || !data) return null;
    if (!data.verified || !data.primary_hex || !data.mascot) return null;
    return {
      primary_hex: data.primary_hex,
      secondary_hex: data.secondary_hex ?? null,
      tertiary_hex: data.tertiary_hex ?? null,
      mascot: data.mascot,
      greeting: data.greeting ?? null,
      chant: data.chant ?? null,
    };
  } catch {
    return null;
  }
}
