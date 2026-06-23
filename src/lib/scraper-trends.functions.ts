// Server fns for the Scraper Trends dashboard: rolls up scrape_debug_bundles
// into a daily time series, manages fix milestones, and uses Lovable AI to
// generate periodic "performance verdict" rollups that attribute metric
// changes to shipped fixes and flag cross-vertical applicability.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---- Trends ---------------------------------------------------------------

export const getScraperTrends = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(7).max(365).default(30) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: bundles, error }, { data: milestones }] = await Promise.all([
      supabaseAdmin
        .from("scrape_debug_bundles")
        .select("created_at,kind,duration_ms,credits_estimate_usd,urls_attempted,contacts_inserted,contacts_with_email,host_fail_count,news_filter_hits,pagination_walked,map_fallback_used")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(20_000),
      supabaseAdmin
        .from("scraper_fix_milestones")
        .select("id,name,description,deployed_at,tags")
        .gte("deployed_at", since)
        .order("deployed_at", { ascending: true }),
    ]);
    if (error) throw new Error(error.message);

    type Day = {
      day: string;
      runs: number;
      successRuns: number;
      contactsInserted: number;
      emailsFound: number;
      hostFails: number;
      paginationRuns: number;
      mapFallbackRuns: number;
      durationMsSum: number;
      costUsd: number;
    };
    const byDay = new Map<string, Day>();
    for (const r of (bundles ?? []) as Array<{
      created_at: string;
      duration_ms: number | null;
      credits_estimate_usd: number | null;
      urls_attempted: number;
      contacts_inserted: number;
      contacts_with_email: number;
      host_fail_count: number;
      pagination_walked: number;
      map_fallback_used: boolean;
    }>) {
      const day = r.created_at.slice(0, 10);
      const d = byDay.get(day) ?? {
        day, runs: 0, successRuns: 0, contactsInserted: 0, emailsFound: 0,
        hostFails: 0, paginationRuns: 0, mapFallbackRuns: 0, durationMsSum: 0, costUsd: 0,
      };
      d.runs++;
      if (r.host_fail_count < r.urls_attempted) d.successRuns++;
      d.contactsInserted += r.contacts_inserted;
      d.emailsFound += r.contacts_with_email;
      d.hostFails += r.host_fail_count;
      if (r.pagination_walked > 0) d.paginationRuns++;
      if (r.map_fallback_used) d.mapFallbackRuns++;
      d.durationMsSum += r.duration_ms ?? 0;
      d.costUsd += Number(r.credits_estimate_usd ?? 0);
      byDay.set(day, d);
    }

    const series = Array.from(byDay.values())
      .map((d) => ({
        day: d.day,
        runs: d.runs,
        successRatePct: d.runs > 0 ? Math.round((d.successRuns / d.runs) * 1000) / 10 : 0,
        emailsPerRun: d.runs > 0 ? Math.round((d.emailsFound / d.runs) * 10) / 10 : 0,
        contactsPerRun: d.runs > 0 ? Math.round((d.contactsInserted / d.runs) * 10) / 10 : 0,
        costPerContactUsd: d.contactsInserted > 0
          ? Math.round((d.costUsd / d.contactsInserted) * 10000) / 10000
          : null,
        avgDurationSec: d.runs > 0 ? Math.round(d.durationMsSum / d.runs / 100) / 10 : 0,
        paginationRunsPct: d.runs > 0 ? Math.round((d.paginationRuns / d.runs) * 1000) / 10 : 0,
        mapFallbackPct: d.runs > 0 ? Math.round((d.mapFallbackRuns / d.runs) * 1000) / 10 : 0,
        totalCostUsd: Math.round(d.costUsd * 100) / 100,
      }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return { series, milestones: milestones ?? [], totalRuns: bundles?.length ?? 0 };
  });

// ---- Milestones -----------------------------------------------------------

export const listFixMilestones = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("scraper_fix_milestones")
      .select("id,name,description,deployed_at,tags,suggestion_id")
      .order("deployed_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { milestones: rows ?? [] };
  });

export const createFixMilestone = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      suggestionId: z.string().uuid().optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("scraper_fix_milestones")
      .insert({
        name: data.name,
        description: data.description ?? null,
        suggestion_id: data.suggestionId ?? null,
        tags: data.tags ?? [],
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (data.suggestionId) {
      await supabaseAdmin
        .from("scrape_improvement_suggestions")
        .update({
          shipped_at: new Date().toISOString(),
          milestone_id: (row as { id: string }).id,
        } as never)
        .eq("id", data.suggestionId);
    }
    return { ok: true, id: (row as { id: string }).id };
  });

export const deleteFixMilestone = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("scraper_fix_milestones")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Verdicts -------------------------------------------------------------

export const listPerformanceVerdicts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(20).default(5) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("scraper_performance_verdicts")
      .select("id,window_start,window_end,model,summary,what_changed,fix_attribution,vertical_applicability,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { verdicts: rows ?? [] };
  });

export const generatePerformanceVerdict = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(7).max(180).default(30) }).parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) throw new Error("AI_GATEWAY_API_KEY is not configured on the server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - data.days * 24 * 60 * 60 * 1000);

    // Build a compact aggregate snapshot for the AI. Don't ship raw bundles.
    const [{ data: bundles }, { data: milestones }, { data: suggestions }] = await Promise.all([
      supabaseAdmin
        .from("scrape_debug_bundles")
        .select("created_at,duration_ms,credits_estimate_usd,urls_attempted,contacts_inserted,contacts_with_email,host_fail_count,news_filter_hits,pagination_walked,map_fallback_used")
        .gte("created_at", windowStart.toISOString())
        .limit(20_000),
      supabaseAdmin
        .from("scraper_fix_milestones")
        .select("id,name,description,deployed_at,tags")
        .gte("deployed_at", windowStart.toISOString())
        .order("deployed_at", { ascending: true }),
      supabaseAdmin
        .from("scrape_improvement_suggestions")
        .select("pattern_tag,severity,title,suggestion,applies_to_verticals,created_at,shipped_at")
        .gte("created_at", windowStart.toISOString())
        .limit(2_000),
    ]);

    type B = NonNullable<typeof bundles>[number];
    const rows = (bundles ?? []) as B[];

    // Aggregate per-day for the prompt (compact).
    const byDay = new Map<string, { runs: number; emails: number; contacts: number; hostFails: number; pagWalked: number; mapFb: number; dur: number; cost: number }>();
    for (const r of rows) {
      const k = r.created_at.slice(0, 10);
      const d = byDay.get(k) ?? { runs: 0, emails: 0, contacts: 0, hostFails: 0, pagWalked: 0, mapFb: 0, dur: 0, cost: 0 };
      d.runs++;
      d.emails += r.contacts_with_email;
      d.contacts += r.contacts_inserted;
      d.hostFails += r.host_fail_count;
      if (r.pagination_walked > 0) d.pagWalked++;
      if (r.map_fallback_used) d.mapFb++;
      d.dur += r.duration_ms ?? 0;
      d.cost += Number(r.credits_estimate_usd ?? 0);
      byDay.set(k, d);
    }
    const dailySeries = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, d]) => ({
        day,
        runs: d.runs,
        emails_per_run: d.runs ? +(d.emails / d.runs).toFixed(2) : 0,
        contacts_per_run: d.runs ? +(d.contacts / d.runs).toFixed(2) : 0,
        host_fail_rate: d.runs ? +(d.hostFails / Math.max(1, d.runs * 3)).toFixed(2) : 0,
        pag_walked_pct: d.runs ? +(d.pagWalked / d.runs * 100).toFixed(1) : 0,
        map_fb_pct: d.runs ? +(d.mapFb / d.runs * 100).toFixed(1) : 0,
        avg_duration_s: d.runs ? +(d.dur / d.runs / 1000).toFixed(1) : 0,
        cost_per_contact: d.contacts ? +(d.cost / d.contacts).toFixed(4) : null,
      }));

    // Roll up recurring patterns.
    const patternMap = new Map<string, { count: number; verticals: Set<string>; example: string }>();
    for (const s of (suggestions ?? []) as Array<{ pattern_tag: string | null; suggestion: string; applies_to_verticals: string[] | null }>) {
      const tag = s.pattern_tag ?? "unknown";
      const p = patternMap.get(tag) ?? { count: 0, verticals: new Set<string>(), example: s.suggestion };
      p.count++;
      for (const v of s.applies_to_verticals ?? []) p.verticals.add(v);
      patternMap.set(tag, p);
    }
    const topPatterns = Array.from(patternMap.entries())
      .map(([tag, p]) => ({ pattern_tag: tag, count: p.count, verticals: Array.from(p.verticals), example: p.example.slice(0, 200) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    const snapshot = {
      window_days: data.days,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      total_runs: rows.length,
      milestones: (milestones ?? []).map((m: { id: string; name: string; description: string | null; deployed_at: string; tags: string[] }) => ({
        id: m.id, name: m.name, description: m.description, deployed_at: m.deployed_at, tags: m.tags,
      })),
      daily_series: dailySeries,
      top_patterns: topPatterns,
    };

    const system = `You analyze long-term performance of a university-faculty web scraper.
Given daily aggregated metrics, fix milestones (when fixes shipped), and recurring failure patterns,
write a JSON report with these exact keys:

{
  "summary": "<1 paragraph, <=600 chars: what got better/worse, the most impactful fix, headline trend>",
  "what_changed": {
    "improved": [{"metric": "...", "delta_pct": number, "note": "..."}],
    "regressed": [{"metric": "...", "delta_pct": number, "note": "..."}]
  },
  "fix_attribution": [
    {"milestone_id": "<uuid or null>", "milestone_name": "...", "metric": "...", "impact_summary": "...", "confidence": "low|med|high"}
  ],
  "vertical_applicability": [
    {"vertical": "accounting_firms|law_firms|investment_banks|consultancies|hospitals|government|nonprofits|other",
     "applicable_patterns": ["pattern_tag", ...],
     "notes": "<why this fix/pattern generalizes to this vertical>"}
  ]
}

Compare the first third of the window to the last third for trend deltas.
Be specific. Use numbers. Avoid hedging language. Strict JSON only.`;

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(snapshot) },
      ],
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    let parsed: Record<string, unknown> = {};
    try {
      const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
      }
      const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      // No response_format on Vercel AI Gateway, so strip any markdown fences first.
      const unfenced = content.replace(/```json/gi, "").replace(/```/g, "").trim();
      try { parsed = JSON.parse(unfenced); } catch { parsed = { summary: content.slice(0, 600) }; }
    } finally {
      clearTimeout(timer);
    }

    const { data: row, error } = await supabaseAdmin
      .from("scraper_performance_verdicts")
      .insert({
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        model: "google/gemini-2.5-flash",
        summary: String(parsed.summary ?? "").slice(0, 4000) || null,
        what_changed: (parsed.what_changed ?? null) as never,
        fix_attribution: (parsed.fix_attribution ?? null) as never,
        vertical_applicability: (parsed.vertical_applicability ?? null) as never,
        metrics_snapshot: snapshot as never,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });
