// RateMyProfessors scrape — uses Firecrawl with a click-loop on the
// "Show More" button so we get past the initial paginated batch on a school
// listing page. Extracted professors are matched by name to existing
// outreach_leads for the same campus and the rmp_* columns are populated.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
const SCRAPE_TIMEOUT_MS = 90_000;

type RmpProfessor = {
  firstName?: string | null;
  lastName?: string | null;
  department?: string | null;
  profileUrl?: string | null;
  overallRating?: number | null;
  numRatings?: number | null;
  wouldTakeAgainPercent?: number | null;
  levelOfDifficulty?: number | null;
};

function nameKey(first: string | null | undefined, last: string | null | undefined): string {
  return `${(first ?? "").trim().toLowerCase()}|${(last ?? "").trim().toLowerCase()}`;
}

async function firecrawlScrapeRmp(url: string, apiKey: string): Promise<RmpProfessor[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const res = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        onlyMainContent: false,
        waitFor: 2000,
        // Click "Show More" up to 10 times to expand the paginated list.
        actions: [
          { type: "wait", milliseconds: 2000 },
          { type: "click", selector: 'button:has-text("Show More")' },
          { type: "wait", milliseconds: 1200 },
          { type: "click", selector: 'button:has-text("Show More")' },
          { type: "wait", milliseconds: 1200 },
          { type: "click", selector: 'button:has-text("Show More")' },
          { type: "wait", milliseconds: 1200 },
          { type: "click", selector: 'button:has-text("Show More")' },
          { type: "wait", milliseconds: 1200 },
          { type: "click", selector: 'button:has-text("Show More")' },
          { type: "wait", milliseconds: 1200 },
          { type: "click", selector: 'button:has-text("Show More")' },
          { type: "wait", milliseconds: 1200 },
          { type: "click", selector: 'button:has-text("Show More")' },
          { type: "wait", milliseconds: 1200 },
          { type: "click", selector: 'button:has-text("Show More")' },
          { type: "wait", milliseconds: 1200 },
        ],
        formats: [
          {
            type: "json",
            prompt:
              'Extract every professor card visible on this RateMyProfessors page. Return JSON shaped as {"professors": [{"firstName","lastName","department","profileUrl","overallRating","numRatings","wouldTakeAgainPercent","levelOfDifficulty"}]}. overallRating and levelOfDifficulty are numbers 0-5. wouldTakeAgainPercent is a number 0-100 or null if not shown. numRatings is an integer. Skip cards without a name. If the page is a single professor profile, return one item.',
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Firecrawl ${res.status}: ${body.slice(0, 160)}`);
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: { json?: { professors?: RmpProfessor[] } };
      error?: string;
    };
    if (json.success === false) throw new Error(json.error ?? "Firecrawl returned success=false");
    const profs = json.data?.json?.professors ?? [];
    return Array.isArray(profs) ? profs : [];
  } finally {
    clearTimeout(timer);
  }
}

export const scrapeCampusRmp = createServerFn({ method: "POST" })
  .inputValidator((data: { campusId: string; urls: string[] }) =>
    z
      .object({
        campusId: z.string().uuid(),
        urls: z.array(z.string().url()).min(1).max(8),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Save URLs back to the campus so they persist for next time.
    await supabaseAdmin
      .from("campuses")
      .update({ rmp_page_url: data.urls.join("\n") } as never)
      .eq("id", data.campusId);

    const perPage: Array<{ url: string; found: number; matched: number; error?: string }> = [];
    const allProfs: RmpProfessor[] = [];

    for (const url of data.urls) {
      try {
        const profs = await firecrawlScrapeRmp(url, apiKey);
        allProfs.push(...profs);
        perPage.push({ url, found: profs.length, matched: 0 });
      } catch (e) {
        perPage.push({
          url,
          found: 0,
          matched: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (allProfs.length === 0) {
      return { perPage, totalFound: 0, totalMatched: 0, totalUpdated: 0 };
    }

    // Load existing outreach_leads for the campus to match by name.
    const { data: leads, error: leadsErr } = await supabaseAdmin
      .from("outreach_leads")
      .select("id,first_name,last_name")
      .eq("campus_id", data.campusId);
    if (leadsErr) throw new Error(`load leads: ${leadsErr.message}`);

    const byName = new Map<string, string>();
    for (const l of (leads ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      byName.set(nameKey(l.first_name, l.last_name), l.id);
    }

    let totalUpdated = 0;
    const nowIso = new Date().toISOString();

    // Build per-URL match counts as we update.
    const urlMatchTally = new Map<string, number>();

    for (const p of allProfs) {
      const id = byName.get(nameKey(p.firstName, p.lastName));
      if (!id) continue;
      const update: Record<string, unknown> = { rmp_checked_at: nowIso };
      if (p.overallRating != null) update.rmp_rating = p.overallRating;
      if (p.numRatings != null) update.rmp_num_ratings = p.numRatings;
      if (p.wouldTakeAgainPercent != null) update.rmp_would_take_again = p.wouldTakeAgainPercent;
      if (p.levelOfDifficulty != null) update.rmp_difficulty = p.levelOfDifficulty;
      if (p.profileUrl) update.rmp_profile_url = p.profileUrl;
      const { error: upErr } = await supabaseAdmin
        .from("outreach_leads")
        .update(update as never)
        .eq("id", id);
      if (!upErr) {
        totalUpdated += 1;
        // best-effort attribution to the first URL that contained the page;
        // we don't track per-URL provenance, so just bump the first one.
        const first = data.urls[0];
        urlMatchTally.set(first, (urlMatchTally.get(first) ?? 0) + 1);
      }
    }

    // Stamp every same-campus lead as "checked" (even non-matches) so we know
    // they were considered.
    const allLeadIds = (leads ?? []).map((l) => (l as { id: string }).id);
    if (allLeadIds.length > 0) {
      await supabaseAdmin
        .from("outreach_leads")
        .update({ rmp_checked_at: nowIso } as never)
        .in("id", allLeadIds)
        .is("rmp_checked_at", null);
    }

    // Apply rough per-URL match counts to the response.
    for (const row of perPage) {
      row.matched = urlMatchTally.get(row.url) ?? 0;
    }

    return {
      perPage,
      totalFound: allProfs.length,
      totalMatched: totalUpdated,
      totalUpdated,
    };
  });

export const resetCampusLeads = createServerFn({ method: "POST" })
  .inputValidator((data: { campusId: string }) =>
    z.object({ campusId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Count first so we can show a confirm summary if needed.
    const { count: leadsBefore } = await supabaseAdmin
      .from("outreach_leads")
      .select("id", { count: "exact", head: true })
      .eq("campus_id", data.campusId)
      .in("source", ["faculty_scrape", "rmp_scrape"]);

    const { count: sugsBefore } = await supabaseAdmin
      .from("campus_lead_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("campus_id", data.campusId)
      .in("research_mode", ["faculty_scrape", "rmp_scrape"]);

    const { error: lErr } = await supabaseAdmin
      .from("outreach_leads")
      .delete()
      .eq("campus_id", data.campusId)
      .in("source", ["faculty_scrape", "rmp_scrape"]);
    if (lErr) throw new Error(`delete leads: ${lErr.message}`);

    const { error: sErr } = await supabaseAdmin
      .from("campus_lead_suggestions")
      .delete()
      .eq("campus_id", data.campusId)
      .in("research_mode", ["faculty_scrape", "rmp_scrape"]);
    if (sErr) throw new Error(`delete suggestions: ${sErr.message}`);

    return {
      leadsDeleted: leadsBefore ?? 0,
      suggestionsDeleted: sugsBefore ?? 0,
    };
  });
