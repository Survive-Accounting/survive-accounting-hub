// Server fns for the AI Suggestions panel and the "Copy last bundles" button.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listRecentDebugBundles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ limit: z.number().int().min(1).max(20).default(5) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("scrape_debug_bundles")
      .select("id,campus_id,campus_name,kind,created_at,duration_ms,credits_estimate_usd,urls_attempted,contacts_inserted,contacts_with_email,host_fail_count,news_filter_hits,pagination_walked,map_fallback_used,summary,payload")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { bundles: rows ?? [] };
  });

export const listImprovementSuggestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("scrape_improvement_suggestions")
      .select("id,bundle_id,campus_id,campus_name,model,pattern_tag,severity,title,suggestion,applies_to_verticals,shipped_at,milestone_id,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    // Roll up recurring patterns: count by pattern_tag, latest example wins for title/suggestion.
    type Row = NonNullable<typeof rows>[number];
    const byTag = new Map<string, { tag: string; count: number; severity: string; latest: Row; campuses: Set<string>; verticals: Set<string>; shipped: boolean }>();
    for (const r of (rows ?? []) as Row[]) {
      const tag = r.pattern_tag ?? "unknown";
      const existing = byTag.get(tag);
      if (existing) {
        existing.count++;
        if (r.campus_name) existing.campuses.add(r.campus_name);
        for (const v of r.applies_to_verticals ?? []) existing.verticals.add(v);
        if (r.shipped_at) existing.shipped = true;
      } else {
        const campuses = new Set<string>();
        if (r.campus_name) campuses.add(r.campus_name);
        const verticals = new Set<string>(r.applies_to_verticals ?? []);
        byTag.set(tag, { tag, count: 1, severity: r.severity ?? "low", latest: r, campuses, verticals, shipped: !!r.shipped_at });
      }
    }
    const grouped = Array.from(byTag.values())
      .map((g) => ({
        pattern_tag: g.tag,
        count: g.count,
        severity: g.severity,
        title: g.latest.title,
        suggestion: g.latest.suggestion,
        latest_at: g.latest.created_at,
        latest_suggestion_id: g.latest.id,
        campus_count: g.campuses.size,
        latest_campus: g.latest.campus_name,
        applies_to_verticals: Array.from(g.verticals),
        any_shipped: g.shipped,
      }))
      .sort((a, b) => b.count - a.count || (b.latest_at > a.latest_at ? 1 : -1));

    return { suggestions: rows ?? [], grouped };
  });
