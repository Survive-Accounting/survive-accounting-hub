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

// JS run inside Firecrawl's browser to expand the paginated list. Tolerates
// the button being absent / renamed — it just bails out of the loop instead
// of failing the whole scrape (which is what a `click` action would do).
const SHOW_MORE_JS = `
(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 12; i++) {
    // Scroll to bottom first so lazy-rendered buttons mount.
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(600);
    const btn = Array.from(document.querySelectorAll('button, a'))
      .find(el => /show\\s*more/i.test((el.textContent || '').trim()));
    if (!btn) break;
    try { btn.click(); } catch (e) { break; }
    await sleep(1500);
  }
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(800);
})();
`;

type FirecrawlActions = Array<Record<string, unknown>>;

async function postFirecrawl(url: string, apiKey: string, actions: FirecrawlActions | null): Promise<RmpProfessor[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      url,
      onlyMainContent: false,
      waitFor: 2500,
      formats: [
        {
          type: "json",
          prompt:
            'Extract every professor card visible on this RateMyProfessors page. Return JSON shaped as {"professors": [{"firstName","lastName","department","profileUrl","overallRating","numRatings","wouldTakeAgainPercent","levelOfDifficulty"}]}. overallRating and levelOfDifficulty are numbers 0-5. wouldTakeAgainPercent is a number 0-100 or null if not shown. numRatings is an integer. Skip cards without a name. If the page is a single professor profile, return one item.',
        },
      ],
    };
    if (actions) body.actions = actions;
    const res = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Firecrawl ${res.status}: ${text.slice(0, 200)}`);
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

async function firecrawlScrapeRmp(url: string, apiKey: string): Promise<RmpProfessor[]> {
  // First try with a JS-based Show-More expander.
  try {
    return await postFirecrawl(url, apiKey, [
      { type: "wait", milliseconds: 2000 },
      { type: "executeJavascript", script: SHOW_MORE_JS },
      { type: "wait", milliseconds: 1500 },
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Fall back to a plain scrape (no actions) so we at least get the first page.
    if (/SCRAPE_ACTION_ERROR|Action.*failed|ActionError/i.test(msg)) {
      return await postFirecrawl(url, apiKey, null);
    }
    throw e;
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
