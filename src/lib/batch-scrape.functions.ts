// Batch-scrape server helpers. The batch RUN itself is orchestrated client-side
// (BatchScrapePanel) by reusing the exact discover → faculty → rmp sequence the
// single-campus auto-scrape already uses, so there's no separate orchestration
// backend to maintain. This file holds the one privileged operation that needs
// the service-role client: a global reset of scraped leads.

import { createServerFn } from "@tanstack/react-start";

/**
 * Hard-reset every lead that came from the scraper (faculty + RMP), across all
 * campuses. Deletes campaign links first (FK), then the leads, then the triage
 * suggestions. Use this to wipe test data before a fresh re-scrape.
 *
 * NOTE: this does NOT touch manually-added leads (source != faculty_scrape/rmp_scrape).
 */
export const resetAllScrapedLeads = createServerFn({ method: "POST" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: leads } = await supabaseAdmin
      .from("outreach_leads")
      .select("id")
      .in("source", ["faculty_scrape", "rmp_scrape"]);
    const leadIds = ((leads ?? []) as Array<{ id: string }>).map((r) => r.id);

    let deletedLeads = 0;
    if (leadIds.length > 0) {
      // Remove campaign membership first so the FK on outreach_leads is clear.
      await supabaseAdmin
        .from("outreach_campaign_leads")
        .delete()
        .in("outreach_lead_id", leadIds);
      const { error: leadErr } = await supabaseAdmin
        .from("outreach_leads")
        .delete()
        .in("id", leadIds);
      if (leadErr) throw new Error(`lead delete failed: ${leadErr.message}`);
      deletedLeads = leadIds.length;
    }

    const { count, error: sugErr } = await supabaseAdmin
      .from("campus_lead_suggestions")
      .delete({ count: "exact" })
      .in("research_mode", ["faculty_scrape", "rmp_scrape"]);
    if (sugErr) throw new Error(`suggestion delete failed: ${sugErr.message}`);

    return {
      ok: true as const,
      deletedLeads,
      deletedSuggestions: count ?? 0,
    };
  },
);
