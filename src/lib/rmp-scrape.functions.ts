// RateMyProfessors scrape — calls RMP's public GraphQL API directly using the
// well-known anonymous credentials embedded in their web app. We extract the
// legacy school ID from the pasted URL, query every professor at that school
// (paginated), filter to Accounting-ish departments, and match by name to
// existing campus_lead_suggestions + outreach_leads for the same campus.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql";
// Public credential baked into RMP's own JS bundle: "test:test" base64.
const RMP_AUTH = "Basic dGVzdDp0ZXN0";
const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

type RmpTeacherNode = {
  id: string;
  legacyId: number;
  firstName: string | null;
  lastName: string | null;
  department: string | null;
  avgRating: number | null;
  numRatings: number | null;
  avgDifficulty: number | null;
  wouldTakeAgainPercent: number | null;
};

const TEACHERS_QUERY = `
query TeacherSearchPaginationQuery(
  $count: Int!
  $cursor: String
  $query: TeacherSearchQuery!
) {
  search: newSearch {
    teachers(query: $query, first: $count, after: $cursor) {
      edges {
        cursor
        node {
          id
          legacyId
          firstName
          lastName
          department
          avgRating
          numRatings
          avgDifficulty
          wouldTakeAgainPercent
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      resultCount
    }
  }
}`;

function nameKey(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first ?? "").trim().toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
  const l = (last ?? "").trim().toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
  return `${f}|${l}`;
}

/** Extract the numeric legacy school ID from any RMP URL form we see. */
function extractSchoolLegacyId(url: string): number | null {
  // /search/professors/1391, /school/1391, /school?sid=1391, /campusRatings.jsp?sid=1391
  const patterns = [
    /\/search\/professors\/(\d+)/i,
    /\/school\/(\d+)/i,
    /[?&]sid=(\d+)/i,
    /[?&]schoolID=(\d+)/i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

function encodeSchoolGlobalId(legacyId: number): string {
  // RMP uses base64("School-<legacyId>") for the GraphQL schoolID arg.
  return Buffer.from(`School-${legacyId}`).toString("base64");
}

async function rmpGraphql<T>(variables: Record<string, unknown>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(RMP_GRAPHQL_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: RMP_AUTH,
        // RMP rejects requests without a browser-ish UA.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ query: TEACHERS_QUERY, variables }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`RMP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) throw new Error(`RMP GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
    if (!json.data) throw new Error("RMP GraphQL: empty data");
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllTeachersAtSchool(schoolGlobalId: string): Promise<RmpTeacherNode[]> {
  const out: RmpTeacherNode[] = [];
  let cursor: string | null = null;
  // Safety cap — most accounting departments are small; bail after ~5 pages.
  for (let page = 0; page < 5; page++) {
    const data = await rmpGraphql<{
      search: {
        teachers: {
          edges: Array<{ cursor: string; node: RmpTeacherNode }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    }>({
      count: PAGE_SIZE,
      cursor,
      query: { schoolID: schoolGlobalId, text: "" },
    });
    const edges = data.search?.teachers?.edges ?? [];
    for (const e of edges) out.push(e.node);
    const pi = data.search?.teachers?.pageInfo;
    if (!pi?.hasNextPage || !pi.endCursor) break;
    cursor = pi.endCursor;
  }
  return out;
}

function isAccountingDept(dept: string | null): boolean {
  if (!dept) return false;
  const d = dept.toLowerCase();
  return d.includes("accounting") || d.includes("accountancy");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Save URLs back to the campus so they persist for next time.
    await supabaseAdmin
      .from("campuses")
      .update({ rmp_page_url: data.urls.join("\n") } as never)
      .eq("id", data.campusId);

    const perPage: Array<{ url: string; found: number; matched: number; error?: string }> = [];
    const allAccountingTeachers: RmpTeacherNode[] = [];
    const seenLegacy = new Set<number>();

    for (const url of data.urls) {
      const legacy = extractSchoolLegacyId(url);
      if (legacy == null) {
        perPage.push({
          url,
          found: 0,
          matched: 0,
          error: "Could not find a school ID in this URL. Paste an RMP school or search URL (e.g. .../search/professors/1391).",
        });
        continue;
      }
      try {
        const teachers = await fetchAllTeachersAtSchool(encodeSchoolGlobalId(legacy));
        const accounting = teachers.filter((t) => isAccountingDept(t.department));
        let added = 0;
        for (const t of accounting) {
          if (seenLegacy.has(t.legacyId)) continue;
          seenLegacy.add(t.legacyId);
          allAccountingTeachers.push(t);
          added += 1;
        }
        perPage.push({ url, found: added, matched: 0 });
      } catch (e) {
        perPage.push({
          url,
          found: 0,
          matched: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (allAccountingTeachers.length === 0) {
      return { perPage, totalFound: 0, totalMatched: 0, totalUpdated: 0 };
    }

    // Load existing campus_lead_suggestions + outreach_leads for the campus
    // to match by name. We update BOTH so triage rows show RMP before import,
    // and already-imported leads get scored for the campaign builder.
    const [{ data: suggestions, error: sErr }, { data: leads, error: lErr }] = await Promise.all([
      supabaseAdmin
        .from("campus_lead_suggestions")
        .select("id,first_name,last_name")
        .eq("campus_id", data.campusId)
        .eq("research_mode", "faculty_scrape")
        .is("archived_at", null),
      supabaseAdmin
        .from("outreach_leads")
        .select("id,first_name,last_name")
        .eq("campus_id", data.campusId),
    ]);
    if (sErr) throw new Error(`load suggestions: ${sErr.message}`);
    if (lErr) throw new Error(`load leads: ${lErr.message}`);

    const sugByName = new Map<string, string>();
    for (const s of (suggestions ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      sugByName.set(nameKey(s.first_name, s.last_name), s.id);
    }
    const leadByName = new Map<string, string>();
    for (const l of (leads ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      leadByName.set(nameKey(l.first_name, l.last_name), l.id);
    }

    const nowIso = new Date().toISOString();
    let suggestionsUpdated = 0;
    let leadsUpdated = 0;

    for (const t of allAccountingTeachers) {
      const key = nameKey(t.firstName, t.lastName);
      const profileUrl = `https://www.ratemyprofessors.com/professor/${t.legacyId}`;
      const update: Record<string, unknown> = {
        rmp_checked_at: nowIso,
        rmp_profile_url: profileUrl,
      };
      if (t.avgRating != null) update.rmp_rating = t.avgRating;
      if (t.numRatings != null) update.rmp_num_ratings = t.numRatings;
      if (t.wouldTakeAgainPercent != null && t.wouldTakeAgainPercent >= 0)
        update.rmp_would_take_again = t.wouldTakeAgainPercent;
      if (t.avgDifficulty != null) update.rmp_difficulty = t.avgDifficulty;

      const sId = sugByName.get(key);
      if (sId) {
        const { error } = await supabaseAdmin
          .from("campus_lead_suggestions")
          .update(update as never)
          .eq("id", sId);
        if (!error) suggestionsUpdated += 1;
      }
      const lId = leadByName.get(key);
      if (lId) {
        const { error } = await supabaseAdmin
          .from("outreach_leads")
          .update(update as never)
          .eq("id", lId);
        if (!error) leadsUpdated += 1;
      }
    }

    const totalMatched = suggestionsUpdated + leadsUpdated;
    // Attribute matches to the first URL for the summary toast.
    if (perPage.length > 0) perPage[0].matched = totalMatched;

    return {
      perPage,
      totalFound: allAccountingTeachers.length,
      totalMatched,
      totalUpdated: totalMatched,
    };
  });

export const resetCampusLeads = createServerFn({ method: "POST" })
  .inputValidator((data: { campusId: string }) =>
    z.object({ campusId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
