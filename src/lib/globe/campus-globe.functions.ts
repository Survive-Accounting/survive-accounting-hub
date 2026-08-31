// CAMPUS GLOBE (server) — the live status data behind <CampusGlobe>. A status display, not
// decoration: every number here is read from the same tables the campaign page counts from,
// and nothing is ever seeded, sampled, or invented.
//
// TIERS come straight from campuses.campus_status, the column the research pipeline maintains
// (the same authority getCampaignCounts uses — see campaign.functions.ts for why it is a stored
// flag, not a formula):
//   · shell / backlog → "in the system" (dim points)
//   · ready           → ready (brighter)
//   · live            → launched (lit and pulsing)
//
// ARC EVENTS are REAL events only: approved chapter claims (greek_chapter_claims →
// campus_greek_chapters → campus). Before launch there are zero, so the arcs layer renders
// EMPTY — that is the honest state, not a bug. When claims land, arcs appear on their own.
// (A campus going live has no event timestamp today; if the pipeline ever records one, add it
// here as a second event source.)
//
// COLOURS: SEC colours come from brand.tsx via schools.ts (the DB disagrees on three SEC schools
// — same override the bolt uses); other campuses use their own color_primary/secondary where
// reviewed; campuses with no colours get none and the client falls back to the hologram accent.
import { createServerFn } from "@tanstack/react-start";

import { ALL_SCHOOLS } from "@/lib/schools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same shape the other server modules use
type DB = { from: (t: string) => any };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export type GlobeStatus = "system" | "ready" | "live";

export interface GlobeCampus {
  slug: string | null;
  name: string;
  state: string | null;
  status: GlobeStatus;
  /** School colours where known — SEC override first, then reviewed DB colours, else null. */
  c1: string | null;
  c2: string | null;
}

/** One real launch/claim event, newest first. Arcs are drawn between consecutive events. */
export interface GlobeEvent {
  kind: "chapter_claimed";
  campusSlug: string | null;
  campusState: string | null;
  campusName: string;
  at: string;
}

export interface GlobeData {
  campuses: GlobeCampus[];
  events: GlobeEvent[];
  counts: { system: number; ready: number; live: number };
  /** Campuses that could not be honestly placed (no usable state) — shown as "+N more". */
  unplaced: number;
}

const PAGE = 1000;

export const getGlobeData = createServerFn({ method: "GET" })
  .handler(async (): Promise<GlobeData> => {
    const db = await admin();

    // SEC/seed colour override, keyed by campus slug (same source the bolt reads).
    const seedColors = new Map<string, { c1: string | null; c2: string | null }>(
      ALL_SCHOOLS.map((s) => [s.slug, { c1: s.c1 ?? null, c2: s.c2 ?? null }]),
    );

    // Page past PostgREST's 1,000-row cap — there are ~970 non-excluded campuses and the
    // count must not silently truncate (SESSION-CONTEXT §5).
    type Row = { slug: string | null; name: string | null; short_name: string | null; state: string | null; campus_status: string | null; color_primary: string | null; color_secondary: string | null; colors_reviewed: boolean | null };
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data } = await db.from("campuses")
        .select("slug,name,short_name,state,campus_status,color_primary,color_secondary,colors_reviewed")
        .neq("campus_status", "excluded")
        .range(from, from + PAGE - 1);
      const page = (data ?? []) as Row[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }

    const counts = { system: 0, ready: 0, live: 0 };
    const campuses: GlobeCampus[] = rows.map((r) => {
      const status: GlobeStatus = r.campus_status === "live" ? "live" : r.campus_status === "ready" ? "ready" : "system";
      counts[status] += 1;
      const seed = r.slug ? seedColors.get(r.slug) : undefined;
      // Only REVIEWED DB colours are trusted for non-seeded campuses — unreviewed scraped
      // colours are exactly the kind of plausible-wrong data the colour audit exists to catch.
      const dbOk = !!r.colors_reviewed && !!r.color_primary;
      return {
        slug: r.slug,
        name: r.short_name || r.name || "Campus",
        state: r.state,
        status,
        c1: seed?.c1 ?? (dbOk ? r.color_primary : null),
        c2: seed?.c2 ?? (dbOk ? r.color_secondary : null),
      };
    });

    // Real claim events, newest first. Approved claims only: an approved claim is a chapter
    // that actually joined the program; a pending one is still a conversation.
    const events: GlobeEvent[] = [];
    try {
      const { data: claims } = await db.from("greek_chapter_claims")
        .select("campus_greek_chapter_id,status,decided_at,created_at")
        .eq("status", "approved").order("decided_at", { ascending: false }).limit(24);
      for (const cl of (claims ?? []) as Array<{ campus_greek_chapter_id: string; decided_at: string | null; created_at: string }>) {
        const { data: roster } = await db.from("campus_greek_chapters").select("campus_id").eq("id", cl.campus_greek_chapter_id).maybeSingle();
        if (!roster?.campus_id) continue;
        const { data: campus } = await db.from("campuses").select("slug,state,name,short_name").eq("id", roster.campus_id).maybeSingle();
        if (!campus) continue;
        events.push({
          kind: "chapter_claimed",
          campusSlug: campus.slug ?? null,
          campusState: campus.state ?? null,
          campusName: campus.short_name || campus.name || "Campus",
          at: cl.decided_at ?? cl.created_at,
        });
      }
    } catch { /* events are additive — the globe stands without them */ }

    // Placement is resolved client-side (campus-geo.ts); report the honest gap here so the
    // legend can say "+N not yet mapped" instead of quietly dropping them.
    const { campusLatLng } = await import("@/lib/globe/campus-geo");
    const unplaced = campuses.filter((c) => !campusLatLng(c.slug, c.state)).length;

    return { campuses, events, counts, unplaced };
  });
