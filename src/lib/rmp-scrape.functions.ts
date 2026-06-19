// RateMyProfessors scrape — calls RMP's public GraphQL API directly using the
// well-known anonymous credentials embedded in their web app. We extract the
// legacy school ID from the pasted URL, query every professor at that school
// (paginated), filter to Accounting-ish departments, and match by name to
// existing campus_lead_suggestions + outreach_leads for the same campus.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseDirectoryCards, cardMatchKey } from "@/lib/directory-cards";

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

/** Normalize a name into a match key. Uses ONLY the first token of the first
 *  name (so "Julie Ann" and "Julie" collide), strips diacritics, and drops
 *  punctuation. Returns `${first}|${last}` — `first` can be empty when the
 *  source only gives an initial or nothing (RMP often does this). */
function nameKey(first: string | null | undefined, last: string | null | undefined): string {
  const firstRaw = (first ?? "").trim().toLowerCase().normalize("NFKD");
  // Take the first alphabetic token only; a single letter ("J") counts as
  // empty so it falls through to the last-name fallback during matching.
  const firstToken = (firstRaw.match(/[a-z]+/g) ?? [])[0] ?? "";
  const f = firstToken.length >= 2 ? firstToken : "";
  const l = (last ?? "").trim().toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
  return `${f}|${l}`;
}

/** First-letter of first name, for last-name fallback disambiguation. */
function firstInitial(first: string | null | undefined): string {
  const m = (first ?? "").trim().toLowerCase().normalize("NFKD").match(/[a-z]/);
  return m ? m[0] : "";
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

type TeachersPage = {
  search: {
    teachers: {
      edges: Array<{ cursor: string; node: RmpTeacherNode }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
};

async function fetchAllTeachersAtSchool(schoolGlobalId: string): Promise<RmpTeacherNode[]> {
  const out: RmpTeacherNode[] = [];
  let cursor: string | null = null;
  // Safety cap — most accounting departments are small; bail after ~5 pages.
  for (let page = 0; page < 5; page++) {
    const data: TeachersPage = await rmpGraphql<TeachersPage>({
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
    // Also load the cached faculty directory pages so we can REVERSE-LOOKUP
    // any RMP professors that didn't match an existing row — scan cached
    // markdown for their name, insert a new lead suggestion if found.
    const [
      { data: suggestions, error: sErr },
      { data: leads, error: lErr },
      { data: campusRow, error: cErr },
    ] = await Promise.all([
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
      supabaseAdmin
        .from("campuses")
        .select("faculty_scrape_cache")
        .eq("id", data.campusId)
        .maybeSingle(),
    ]);
    if (sErr) throw new Error(`load suggestions: ${sErr.message}`);
    if (lErr) throw new Error(`load leads: ${lErr.message}`);
    if (cErr) throw new Error(`load campus: ${cErr.message}`);

    const sugByName = new Map<string, string>();
    // last_name -> list of (firstInitial, id) for fallback when RMP only
    // gives a first initial (or nothing). Keeps us from reverse-inserting
    // a duplicate that we already have under a fuller name.
    const sugByLast = new Map<string, Array<{ initial: string; id: string }>>();
    for (const s of (suggestions ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      sugByName.set(nameKey(s.first_name, s.last_name), s.id);
      const lastKey = (s.last_name ?? "").trim().toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
      if (lastKey) {
        const arr = sugByLast.get(lastKey) ?? [];
        arr.push({ initial: firstInitial(s.first_name), id: s.id });
        sugByLast.set(lastKey, arr);
      }
    }
    const leadByName = new Map<string, string>();
    const leadByLast = new Map<string, Array<{ initial: string; id: string }>>();
    for (const l of (leads ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      leadByName.set(nameKey(l.first_name, l.last_name), l.id);
      const lastKey = (l.last_name ?? "").trim().toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
      if (lastKey) {
        const arr = leadByLast.get(lastKey) ?? [];
        arr.push({ initial: firstInitial(l.first_name), id: l.id });
        leadByLast.set(lastKey, arr);
      }
    }

    /** Resolve to an existing id by (a) exact first+last key, or (b) last
     *  name + matching first initial when one side has no full first name,
     *  or (c) unique last-name match (only one prof with that last name in
     *  the dept) when RMP gives an empty first. */
    const resolveId = (
      first: string | null,
      last: string | null,
      byName: Map<string, string>,
      byLast: Map<string, Array<{ initial: string; id: string }>>,
    ): string | undefined => {
      const direct = byName.get(nameKey(first, last));
      if (direct) return direct;
      const lastKey = (last ?? "").trim().toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
      if (!lastKey) return undefined;
      const candidates = byLast.get(lastKey) ?? [];
      if (candidates.length === 0) return undefined;
      const init = firstInitial(first);
      if (init) {
        const m = candidates.find((c) => c.initial === init);
        if (m) return m.id;
      } else if (candidates.length === 1) {
        // RMP gave no first name and only one prof has this last name → safe.
        return candidates[0].id;
      }
      return undefined;
    };

    const nowIso = new Date().toISOString();
    let suggestionsUpdated = 0;
    let leadsUpdated = 0;
    const unmatchedTeachers: RmpTeacherNode[] = [];

    for (const t of allAccountingTeachers) {
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

      const sId = resolveId(t.firstName, t.lastName, sugByName, sugByLast);
      const lId = resolveId(t.firstName, t.lastName, leadByName, leadByLast);
      if (sId) {
        const { error } = await supabaseAdmin
          .from("campus_lead_suggestions")
          .update(update as never)
          .eq("id", sId);
        if (!error) suggestionsUpdated += 1;
      }
      if (lId) {
        const { error } = await supabaseAdmin
          .from("outreach_leads")
          .update(update as never)
          .eq("id", lId);
        if (!error) leadsUpdated += 1;
      }
      if (!sId && !lId) unmatchedTeachers.push(t);
    }

    // ----- REVERSE LOOKUP: scan cached directory pages for unmatched profs ----
    const cache = (campusRow as { faculty_scrape_cache?: Record<string, { markdown?: string; links?: string[] }> } | null)?.faculty_scrape_cache ?? {};
    const cachePages = Object.entries(cache);
    let reverseInserted = 0;
    const reverseRows: Array<Record<string, unknown>> = [];
    if (cachePages.length > 0 && unmatchedTeachers.length > 0) {
      for (const t of unmatchedTeachers) {
        const fn = (t.firstName ?? "").trim();
        const ln = (t.lastName ?? "").trim();
        if (!fn || !ln) continue;
        const re = new RegExp(`\\b${escapeRe(fn)}\\b[\\s\\S]{0,40}?\\b${escapeRe(ln)}\\b`, "i");
        const lnSlug = ln.toLowerCase().replace(/[^a-z]/g, "");
        const fnSlug = fn.toLowerCase().replace(/[^a-z]/g, "");

        // Scan ALL cached pages and score candidates. The directory listing
        // typically has the name as a bare anchor with no title nearby;
        // harvested profile pages have the title text right next to the
        // name. Scoring promotes profile-shaped pages + pages where a
        // title was actually extractable, so we don't lock onto the first
        // (usually nav-heavy) hit.
        type Cand = {
          pageUrl: string;
          title: string | null;
          email: string | null;
          profileUrlFromDir: string | null;
          score: number;
        };
        const candidates: Cand[] = [];
        for (const [pageUrl, payload] of cachePages) {
          const md = payload?.markdown ?? "";
          if (!md) continue;
          const m = md.match(re);
          if (!m || m.index == null) continue;
          const idx = m.index;
          const winStart = Math.max(0, idx - 400);
          const windowText = md.slice(winStart, idx + 800);
          const localHit = windowText.match(re);
          const localStart = localHit?.index ?? 0;
          const localEnd = localStart + (localHit?.[0].length ?? 0);
          const title = extractTitleNear(windowText, localStart, localEnd);
          const emailMatch = windowText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
          const email = emailMatch ? emailMatch[0].toLowerCase() : null;

          const links = (payload?.links ?? []) as string[];
          let profileUrlFromDir: string | null = null;
          try {
            const dirHost = new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase();
            for (const link of links) {
              try {
                const u = new URL(link);
                const h = u.hostname.replace(/^www\./, "").toLowerCase();
                if (h !== dirHost && !h.endsWith(`.${dirHost}`)) continue;
                const last = (u.pathname.split("/").filter(Boolean).at(-1) ?? "").toLowerCase();
                if (!last) continue;
                if (
                  last === lnSlug ||
                  last === `${fnSlug}-${lnSlug}` ||
                  last === `${lnSlug}-${fnSlug}` ||
                  last === `${fnSlug}.${lnSlug}` ||
                  last.includes(`${fnSlug}-${lnSlug}`)
                ) {
                  profileUrlFromDir = link;
                  break;
                }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }

          const urlLc = pageUrl.toLowerCase();
          const isProfileShaped =
            /\/(profile|profiles|people|faculty|staff|bio)\b/.test(urlLc) ||
            /[?&]id=/.test(urlLc) ||
            urlLc.includes(lnSlug);
          let score = 0;
          if (isProfileShaped) score += 8;
          if (title) score += 10;
          if (email) score += 2;
          score += Math.max(0, 4 - Math.floor(md.length / 50_000));
          candidates.push({ pageUrl, title, email, profileUrlFromDir, score });
        }
        if (candidates.length === 0) continue;
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        // Borrow signal from any candidate that has it — the best-scoring
        // page may still be missing one field that a sibling page has.
        const titleFromAny = best.title ?? candidates.find((c) => c.title)?.title ?? null;
        const emailFromAny = best.email ?? candidates.find((c) => c.email)?.email ?? null;
        const profileUrlFromAny =
          best.profileUrlFromDir ?? candidates.find((c) => c.profileUrlFromDir)?.profileUrlFromDir ?? null;

        const rmpProfileUrl = `https://www.ratemyprofessors.com/professor/${t.legacyId}`;
        reverseRows.push({
          campus_id: data.campusId,
          first_name: fn,
          last_name: ln,
          title: titleFromAny,
          email: emailFromAny,
          source_url: profileUrlFromAny ?? best.pageUrl,
          research_mode: "faculty_scrape",
          research_label: "rmp_reverse_lookup_v1",
          status: "pending",
          lead_type: "professor",
          rmp_checked_at: nowIso,
          rmp_profile_url: rmpProfileUrl,
          rmp_rating: t.avgRating,
          rmp_num_ratings: t.numRatings,
          rmp_difficulty: t.avgDifficulty,
          rmp_would_take_again: t.wouldTakeAgainPercent != null && t.wouldTakeAgainPercent >= 0 ? t.wouldTakeAgainPercent : null,
          notes: `RMP reverse-lookup: best of ${candidates.length} cached page hit(s) on ${best.pageUrl}`,
          raw_payload: {
            source: "rmp_reverse_lookup",
            directory_url: best.pageUrl,
            candidate_pages: candidates.length,
            rmp_legacy_id: t.legacyId,
            rmp_department: t.department,
            found_email: !!emailFromAny,
            found_title: !!titleFromAny,
            found_profile_url: !!profileUrlFromAny,
          },
        });
      }

      if (reverseRows.length > 0) {
        // Dedupe against ACTIVE suggestions for this campus by email and by name.
        const candEmails = reverseRows.map((r) => r.email).filter((e): e is string => !!e);
        let existingEmails = new Set<string>();
        if (candEmails.length > 0) {
          const { data: ex } = await supabaseAdmin
            .from("campus_lead_suggestions")
            .select("email")
            .eq("campus_id", data.campusId)
            .is("archived_at", null)
            .in("email", candEmails);
          existingEmails = new Set((ex ?? []).map((r: { email: string | null }) => r.email).filter((e): e is string => !!e));
        }
        const toInsert = reverseRows.filter((r) => {
          const e = r.email as string | null;
          if (e && existingEmails.has(e)) return false;
          // Belt-and-suspenders: use the same fuzzy resolver as the matching
          // pass so middle initials / RMP-anonymized first names don't slip
          // through and create duplicates of profs we already have.
          if (resolveId(r.first_name as string, r.last_name as string, sugByName, sugByLast)) return false;
          return true;
        });
        if (toInsert.length > 0) {
          const { error } = await supabaseAdmin.from("campus_lead_suggestions").insert(toInsert as never);
          if (!error) reverseInserted = toInsert.length;
        }
      }
    }

    const totalMatched = suggestionsUpdated + leadsUpdated + reverseInserted;
    // Attribute matches to the first URL for the summary toast.
    if (perPage.length > 0) perPage[0].matched = totalMatched;

    return {
      perPage,
      totalFound: allAccountingTeachers.length,
      totalMatched,
      totalUpdated: suggestionsUpdated + leadsUpdated,
      reverseInserted,
      reverseAttempted: unmatchedTeachers.length,
      cachedPages: cachePages.length,
    };
  });

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Heuristic title extractor used by the RMP reverse-lookup. Scans a small
// text window around a name hit on a cached directory page and pulls the
// nearest faculty title. Generalizable across academia (Professor, Lecturer,
// Instructor, Chair, Dean…) and adjacent verticals (Director, Partner,
// Analyst, Resident, MD) — the patterns are ordered most-specific-first so
// "Assistant Professor of Accounting" beats a bare "Professor".
const TITLE_PATTERNS: RegExp[] = [
  // Academic — full rank + optional "of <discipline>" (case-insensitive,
  // tolerate lowercase markdown text like "professor of accounting").
  /\b((?:Distinguished\s+|Senior\s+|Visiting\s+|Adjunct\s+|Clinical\s+|Research\s+|Teaching\s+|Emeritus\s+|Emerita\s+)?(?:Assistant|Associate|Full)?\s*(?:Professor|Lecturer|Instructor|Fellow|Scholar)(?:\s+of\s+[A-Za-z][A-Za-z &'-]{2,40})?)\b/i,
  // Standalone academic titles
  /\b(Senior\s+Lecturer|Clinical\s+Professor|Adjunct\s+Professor|Visiting\s+Professor|Emeritus\s+Professor|Emerita\s+Professor|Department\s+Chair|Chairperson|Dean(?:\s+of\s+[A-Za-z][A-Za-z &'-]{2,40})?|Provost|Director(?:\s+of\s+[A-Za-z][A-Za-z &'-]{2,40})?)\b/i,
  // Endowed / named chairs (e.g. "Fettig/Whirlpool Faculty Fellow",
  // "KPMG Professor of Accounting", "Eli Lilly Chair in …")
  /\b([A-Z][A-Za-z./&'-]{2,40}(?:\s+[A-Z][A-Za-z./&'-]{2,40}){0,3}\s+(?:Faculty\s+Fellow|Chair(?:\s+in\s+[A-Za-z][A-Za-z &'-]{2,40})?|Professor(?:\s+of\s+[A-Za-z][A-Za-z &'-]{2,40})?))\b/,
  // Industry-adjacent (IB, consulting, hospitals, gov, law)
  /\b(Managing\s+Director|Executive\s+Director|Vice\s+President|President|Partner|Principal|Senior\s+Manager|Manager|Analyst|Associate|Counsel|Attorney|Resident|Fellow|Physician|MD|RN|Secretary|Commissioner|Chief\s+[A-Z][a-z]+(?:\s+Officer)?)\b/i,
];

const TITLE_NOISE_RE = /\b(skip to|menu|copyright|navigation|toggle)\b/i;

function extractTitleNear(
  windowText: string,
  nameStart: number,
  nameEnd: number,
): string | null {
  // 1) Markdown-adjacent-line: many directory cards render as
  //    `**Name**` on one line and the title on the immediate next line.
  const tail = windowText.slice(nameEnd, Math.min(windowText.length, nameEnd + 300));
  const nextLineMatch = tail.match(/^[\s,|·•\-–—:]*\n+\s*([^\n]{4,120})/);
  if (nextLineMatch) {
    const line = nextLineMatch[1].replace(/[*_`[\]()]/g, "").trim();
    for (const re of TITLE_PATTERNS) {
      const m = line.match(re);
      if (m) {
        const t = m[1].replace(/\s+/g, " ").trim();
        if (t.length >= 4 && t.length <= 90) return t;
      }
    }
  }

  // 2) Tight windows AFTER then BEFORE the name. Keep tight to avoid
  //    snagging a neighbouring person's title from a list view.
  const tails = [
    windowText.slice(nameEnd, Math.min(windowText.length, nameEnd + 220)),
    windowText.slice(Math.max(0, nameStart - 200), nameStart),
  ];
  for (const segment of tails) {
    if (!segment) continue;
    // Noise filter applied per-line, not whole-segment, so a single
    // navbar word doesn't disqualify the whole window.
    for (const re of TITLE_PATTERNS) {
      const m = segment.match(re);
      if (!m) continue;
      const t = m[1].replace(/\s+/g, " ").trim();
      if (t.length < 4 || t.length > 90) continue;
      if (TITLE_NOISE_RE.test(t)) continue;
      return t;
    }
  }
  return null;
}



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
