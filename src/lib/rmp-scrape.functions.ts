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

async function rmpGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
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
      body: JSON.stringify({ query, variables }),
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
    const data: TeachersPage = await rmpGraphql<TeachersPage>(TEACHERS_QUERY, {
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

const SCHOOLS_QUERY = `
query SchoolSearchQuery($text: String!) {
  search: newSearch {
    schools(query: { text: $text }) {
      edges {
        node {
          id
          legacyId
          name
          city
          state
        }
      }
    }
  }
}`;

type SchoolNode = { id: string; legacyId: number; name: string; city: string | null; state: string | null };

/** Look up an RMP school by name via RMP's own GraphQL — no SerpAPI dependency.
 *  Returns the canonical /school/<legacyId> URL of the best name match, or null. */
export async function findRmpSchoolUrlByName(campusName: string, stateHint?: string | null): Promise<string | null> {
  if (!campusName.trim()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(RMP_GRAPHQL_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: RMP_AUTH,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ query: SCHOOLS_QUERY, variables: { text: campusName } }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { search?: { schools?: { edges?: Array<{ node: SchoolNode }> } } };
    };
    const edges = json.data?.search?.schools?.edges ?? [];
    if (edges.length === 0) return null;
    const wantLc = campusName.toLowerCase();
    const stateLc = (stateHint ?? "").toLowerCase().trim();
    // Prefer an exact-ish name match, optionally biased by state when given.
    let best = edges[0].node;
    let bestScore = -1;
    for (const e of edges) {
      const n = e.node;
      const nameLc = (n.name ?? "").toLowerCase();
      let s = 0;
      if (nameLc === wantLc) s += 10;
      else if (nameLc.startsWith(wantLc) || wantLc.startsWith(nameLc)) s += 6;
      else if (nameLc.includes(wantLc) || wantLc.includes(nameLc)) s += 3;
      if (stateLc && (n.state ?? "").toLowerCase() === stateLc) s += 2;
      if (s > bestScore) { bestScore = s; best = n; }
    }
    if (bestScore <= 0) return null;
    return `https://www.ratemyprofessors.com/school/${best.legacyId}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}


function isAccountingDept(dept: string | null): boolean {
  if (!dept) return false;
  const d = dept.toLowerCase();
  return d.includes("accounting") || d.includes("accountancy");
}

// Broader "business school" net. RMP frequently files accounting professors
// under a generic department label ("Business", "Management", "Finance") — so
// schools like Walton/Arkansas return ZERO "Accounting" profs even though the
// people are there. We never INSERT a businessish prof on its own (too noisy),
// but we do (a) match them against existing accounting leads and (b) accept
// them when their name also appears in a cached accounting directory page.
function isBusinessishDept(dept: string | null): boolean {
  if (!dept) return false;
  const d = dept.toLowerCase();
  return (
    isAccountingDept(dept) ||
    d.includes("business") ||
    d.includes("management") ||
    d.includes("finance") ||
    /\btax\b/.test(d) ||
    /\baudit\b/.test(d)
  );
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
    // Keep EVERY teacher at the school (deduped) — not just the ones RMP labels
    // "Accounting" — so we can match mislabeled-dept profs against existing
    // accounting leads. `found` still reports the accounting-labeled count as
    // the headline number.
    const allTeachers: RmpTeacherNode[] = [];
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
        let added = 0;
        for (const t of teachers) {
          if (seenLegacy.has(t.legacyId)) continue;
          seenLegacy.add(t.legacyId);
          allTeachers.push(t);
          if (isAccountingDept(t.department)) added += 1;
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

    const accountingTeachers = allTeachers.filter((t) => isAccountingDept(t.department));
    if (allTeachers.length === 0) {
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
      opts: { strict?: boolean } = {},
    ): string | undefined => {
      const direct = byName.get(nameKey(first, last));
      if (direct) return direct;
      // Strict mode: exact first+last only. Used when matching RMP profs from
      // OTHER departments, where a last-name-only fallback would let an
      // unrelated "J. Smith" in Biology hijack the accounting lead.
      if (opts.strict) return undefined;
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
    const buildRmpUpdate = (t: RmpTeacherNode): Record<string, unknown> => {
      const update: Record<string, unknown> = {
        rmp_checked_at: nowIso,
        rmp_profile_url: `https://www.ratemyprofessors.com/professor/${t.legacyId}`,
      };
      if (t.avgRating != null) update.rmp_rating = t.avgRating;
      if (t.numRatings != null) update.rmp_num_ratings = t.numRatings;
      if (t.wouldTakeAgainPercent != null && t.wouldTakeAgainPercent >= 0)
        update.rmp_would_take_again = t.wouldTakeAgainPercent;
      if (t.avgDifficulty != null) update.rmp_difficulty = t.avgDifficulty;
      return update;
    };

    let suggestionsUpdated = 0;
    let leadsUpdated = 0;
    // A lead/suggestion is only allowed to receive RMP data once, so an
    // accounting-dept match always wins over a later loose cross-dept match.
    const matchedSugIds = new Set<string>();
    const matchedLeadIds = new Set<string>();
    const unmatchedTeachers: RmpTeacherNode[] = [];

    // Two passes so accounting-labeled profs claim their lead first:
    //   pass 1 — accounting dept, loose match (initials / unique last name OK)
    //   pass 2 — every other dept, STRICT exact-name match only
    // This is the core "Walton/Arkansas files accounting under Business" fix:
    // we attach RMP onto an EXISTING accounting lead regardless of how RMP
    // labels the professor's department.
    const matchPass = async (teachers: RmpTeacherNode[], strict: boolean) => {
      for (const t of teachers) {
        const update = buildRmpUpdate(t);
        const sId = resolveId(t.firstName, t.lastName, sugByName, sugByLast, { strict });
        const lId = resolveId(t.firstName, t.lastName, leadByName, leadByLast, { strict });
        if (sId && !matchedSugIds.has(sId)) {
          const { error } = await supabaseAdmin
            .from("campus_lead_suggestions")
            .update(update as never)
            .eq("id", sId);
          if (!error) { suggestionsUpdated += 1; matchedSugIds.add(sId); }
        }
        if (lId && !matchedLeadIds.has(lId)) {
          const { error } = await supabaseAdmin
            .from("outreach_leads")
            .update(update as never)
            .eq("id", lId);
          if (!error) { leadsUpdated += 1; matchedLeadIds.add(lId); }
        }
        // Only a teacher that resolved to NOBODY is a candidate for insertion.
        if (!sId && !lId) unmatchedTeachers.push(t);
      }
    };

    await matchPass(accountingTeachers, false);
    await matchPass(allTeachers.filter((t) => !isAccountingDept(t.department)), true);

    // ----- REVERSE LOOKUP: scan cached directory pages for unmatched profs ----
    const cache = (campusRow as { faculty_scrape_cache?: Record<string, { markdown?: string; links?: string[] }> } | null)?.faculty_scrape_cache ?? {};
    const cachePages = Object.entries(cache);
    let reverseInserted = 0;
    const reverseRows: Array<Record<string, unknown>> = [];
    // Only scan the cache for plausibly-accounting unmatched profs (accounting
    // or generic business/management/finance depts) — never the whole school's
    // teacher list, which would be slow and could false-match common names.
    const reverseCandidates = unmatchedTeachers.filter((t) => isBusinessishDept(t.department));
    if (cachePages.length > 0 && reverseCandidates.length > 0) {
      for (const t of reverseCandidates) {
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
          // Prefer the email paired INSIDE the same card block as this name.
          // The old "first email in a 1200-char window" heuristic would grab
          // a neighbor's email when directory cards were tightly packed —
          // exact mis-pair bug the card-block parser eliminates.
          const wantKey = cardMatchKey(fn, ln);
          const cardHit = parseDirectoryCards(md).find(
            (c) => cardMatchKey(c.first_name, c.last_name) === wantKey,
          );
          let email: string | null = cardHit?.email ?? null;
          if (!email) {
            // Last-resort fallback: only accept the windowed email when its
            // local part actually contains the person's last name (or vice
            // versa) — rejects neighbor emails on dense directory pages.
            // Also accept it when the local part matches the UID segment of
            // a profile URL on the same page (Walton uses /uid/mandic/...
            // paired with mandic@uark.edu — name-free locals).
            const emailMatch = windowText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
            const candidate = emailMatch ? emailMatch[0].toLowerCase() : null;
            if (candidate) {
              const local = candidate.split("@")[0].replace(/[^a-z0-9]/g, "");
              const uidMatch = windowText.match(/\/uid\/([A-Za-z0-9._-]+)\/[^)\s]*name\/[^)\s]*/i);
              const uid = uidMatch ? uidMatch[1].toLowerCase().replace(/[^a-z0-9]/g, "") : "";
              if (local.includes(lnSlug) || lnSlug.includes(local) || (uid && uid === local)) {
                email = candidate;
              }
            }
          }

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

    // ----- RMP-ONLY INSERTS (cache-independent) -------------------------------
    // Accounting-dept profs RMP knows about that matched no existing lead AND
    // weren't recovered from a cached directory page (e.g. the faculty scrape
    // found nobody, or missed them). Without this their rating/difficulty — the
    // whole point of RMP — is silently discarded. Insert as clearly-flagged
    // review rows. They carry NO email (RMP doesn't expose one); a reviewer
    // backfills it, or a later faculty scrape fills it in by name. Kept strict
    // to accounting-labeled depts so we never seed generic business faculty.
    const nameKeysAlreadyInserted = new Set<string>(
      reverseRows.map((r) => nameKey(r.first_name as string, r.last_name as string)),
    );
    const rmpOnlyRows: Array<Record<string, unknown>> = [];
    for (const t of unmatchedTeachers) {
      if (!isAccountingDept(t.department)) continue;
      const fn = (t.firstName ?? "").trim();
      const ln = (t.lastName ?? "").trim();
      if (!fn || !ln) continue;
      const key = nameKey(fn, ln);
      // Skip names already present as active suggestions/leads or just inserted
      // by the reverse-lookup, so we don't create duplicates.
      if (sugByName.has(key) || leadByName.has(key) || nameKeysAlreadyInserted.has(key)) continue;
      nameKeysAlreadyInserted.add(key);
      rmpOnlyRows.push({
        campus_id: data.campusId,
        first_name: fn,
        last_name: ln,
        title: null,
        email: null,
        source_url: `https://www.ratemyprofessors.com/professor/${t.legacyId}`,
        research_mode: "faculty_scrape",
        research_label: "rmp_only",
        status: "pending",
        lead_type: "professor",
        rmp_checked_at: nowIso,
        rmp_profile_url: `https://www.ratemyprofessors.com/professor/${t.legacyId}`,
        rmp_rating: t.avgRating,
        rmp_num_ratings: t.numRatings,
        rmp_difficulty: t.avgDifficulty,
        rmp_would_take_again: t.wouldTakeAgainPercent != null && t.wouldTakeAgainPercent >= 0 ? t.wouldTakeAgainPercent : null,
        notes: `RMP-only: accounting professor on RateMyProfessors with no matching directory entry (dept: ${t.department ?? "n/a"}). Email needs backfill before outreach.`,
        raw_payload: {
          source: "rmp_only",
          rmp_legacy_id: t.legacyId,
          rmp_department: t.department,
          no_directory_match: true,
        },
      });
    }
    let rmpOnlyInserted = 0;
    if (rmpOnlyRows.length > 0) {
      const { error } = await supabaseAdmin.from("campus_lead_suggestions").insert(rmpOnlyRows as never);
      if (!error) rmpOnlyInserted = rmpOnlyRows.length;
    }

    const totalMatched = suggestionsUpdated + leadsUpdated + reverseInserted + rmpOnlyInserted;
    // Attribute matches to the first URL for the summary toast.
    if (perPage.length > 0) perPage[0].matched = totalMatched;

    return {
      perPage,
      totalFound: accountingTeachers.length,
      totalMatched,
      totalUpdated: suggestionsUpdated + leadsUpdated,
      reverseInserted,
      rmpOnlyInserted,
      reverseAttempted: reverseCandidates.length,
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



// ===================== RMP course-code signal =====================
// Per-rating "Class" labels (e.g. "ACCT201") cross-referenced against a campus's
// researched Intro/Intermediate course codes — the strongest "they teach it"
// signal short of a course schedule. NEVER fabricated: only labels actually on
// the RMP page; empty when a professor's ratings carry none.

const RATINGS_QUERY = `
query TeacherRatings($id: ID!, $count: Int!) {
  node(id: $id) {
    ... on Teacher {
      ratings(first: $count) {
        edges { node { class } }
      }
    }
  }
}`;

const TARGET_FAMILIES = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"] as const;
type TargetFamily = (typeof TARGET_FAMILIES)[number];

function encodeTeacherGlobalId(legacyId: number): string {
  return Buffer.from(`Teacher-${legacyId}`).toString("base64");
}

function legacyIdFromRmpUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = url.match(/\/professor\/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Normalize a course code / class label for matching: uppercase, drop all
 *  non-alphanumerics. "ACCY 201" / "accy201" → "ACCY201". */
function normCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Distinct, non-empty class labels from a professor's RMP ratings (raw,
 *  deduped, capped). Empty on any error or when no rating carries a label. */
async function fetchTeacherClasses(legacyId: number): Promise<string[]> {
  try {
    const data = await rmpGraphql<{ node?: { ratings?: { edges?: Array<{ node?: { class?: string | null } }> } } }>(
      RATINGS_QUERY,
      { id: encodeTeacherGlobalId(legacyId), count: 100 },
    );
    const edges = data.node?.ratings?.edges ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of edges) {
      const c = (e.node?.class ?? "").trim();
      if (!c) continue;
      const k = normCode(c);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(c);
      if (out.length >= 40) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Cross-reference a professor's RMP class labels against a campus's target
 *  course codes. A target matches when a normalized RMP label equals or
 *  contains the normalized target code (which must include a digit + be >= 5
 *  chars, so a bare "ACCT" can't false-match). */
function crossRefClasses(
  rawClasses: string[],
  targetCodes: Partial<Record<TargetFamily, string>>,
): { matchJson: Record<string, { code: string; count: number }>; count: number; families: TargetFamily[] } {
  const normedClasses = rawClasses.map(normCode).filter(Boolean);
  const matchJson: Record<string, { code: string; count: number }> = {};
  const families: TargetFamily[] = [];
  let total = 0;
  for (const fam of TARGET_FAMILIES) {
    const raw = targetCodes[fam];
    if (!raw) continue;
    const t = normCode(raw);
    if (t.length < 5 || !/[0-9]/.test(t)) continue; // need prefix+number
    const count = normedClasses.filter((c) => c === t || c.includes(t)).length;
    if (count > 0) {
      matchJson[fam] = { code: raw, count };
      families.push(fam);
      total += count;
    }
  }
  return { matchJson, count: total, families };
}

function targetCodesFromCampus(codesJson: unknown): Partial<Record<TargetFamily, string>> {
  const out: Partial<Record<TargetFamily, string>> = {};
  if (codesJson && typeof codesJson === "object") {
    const obj = codesJson as Record<string, unknown>;
    for (const fam of TARGET_FAMILIES) {
      const v = obj[fam];
      if (typeof v === "string" && v.trim()) out[fam] = v.trim();
    }
  }
  return out;
}

/** Capture RMP class labels for a campus's RMP-matched leads, cross-reference
 *  against the campus's researched course codes, and write the signal +
 *  (on a match) raise teaching flags/confidence. Cheap: RMP GraphQL only, one
 *  ratings call per matched professor. Idempotent — safe to re-run. */
export const crossReferenceRmpCourses = createServerFn({ method: "POST" })
  .inputValidator((data: { campusId: string; limit?: number }) =>
    z.object({ campusId: z.string().uuid(), limit: z.number().int().min(1).max(300).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campus } = await supabaseAdmin
      .from("campuses")
      .select("id, course_family_codes_json")
      .eq("id", data.campusId)
      .maybeSingle();
    const targetCodes = targetCodesFromCampus(
      (campus as { course_family_codes_json?: unknown } | null)?.course_family_codes_json,
    );
    if (Object.keys(targetCodes).length === 0) {
      return { skipped: "no_target_course_codes", processed: 0, withCodes: 0, withMatch: 0 };
    }

    const cap = data.limit ?? 200;
    const applyToRow = async (
      table: "campus_lead_suggestions" | "outreach_leads",
      row: { id: string; rmp_profile_url: string | null },
    ): Promise<"none" | "codes" | "match"> => {
      const legacy = legacyIdFromRmpUrl(row.rmp_profile_url);
      if (legacy == null) return "none";
      const raw = await fetchTeacherClasses(legacy);
      if (raw.length === 0) return "none";
      const { matchJson, count, families } = crossRefClasses(raw, targetCodes);
      const patch: Record<string, unknown> = {
        rmp_course_codes: raw,
        rmp_course_match_json: matchJson,
        rmp_course_match_count: count,
      };
      if (families.length > 0) {
        // Strong "they teach it" signal — set matched-family flags + raise conf.
        for (const fam of families) patch[`teaches_${fam}`] = "true";
        patch.teaching_confidence = "high";
      }
      const { error } = await supabaseAdmin.from(table).update(patch as never).eq("id", row.id);
      if (error) return "none";
      return families.length > 0 ? "match" : "codes";
    };

    let processed = 0, withCodes = 0, withMatch = 0;
    for (const table of ["campus_lead_suggestions", "outreach_leads"] as const) {
      const { data: rows } = await supabaseAdmin
        .from(table)
        .select("id, rmp_profile_url")
        .eq("campus_id", data.campusId)
        .not("rmp_profile_url", "is", null)
        .limit(cap);
      for (const r of (rows ?? []) as Array<{ id: string; rmp_profile_url: string | null }>) {
        processed += 1;
        const res = await applyToRow(table, r);
        if (res !== "none") withCodes += 1;
        if (res === "match") withMatch += 1;
      }
    }
    return { processed, withCodes, withMatch, targets: Object.keys(targetCodes) };
  });

// ===================== RMP dated review capture (Phase 1) =====================
// ADDITIVE: capture review-level ratings (date + class + reputation) into the new
// rmp_ratings table so a later phase can roll them up into a teaching-currency
// signal. Does NOT touch crossReferenceRmpCourses, teaching_confidence, the
// rmp_course_* aggregates, or the scheduler. Field names confirmed against the
// live RMP GraphQL schema (note: it's `wouldTakeAgain`, not `wouldTakeAgainRating`).

const RATINGS_FULL_QUERY = `
query TeacherRatingsFull($id: ID!, $count: Int!) {
  node(id: $id) {
    ... on Teacher {
      ratings(first: $count) {
        edges { node { id class date comment difficultyRating wouldTakeAgain grade } }
      }
    }
  }
}`;

type RmpRatingNode = {
  id?: string | null;
  class?: string | null;
  date?: string | null;
  comment?: string | null;
  difficultyRating?: number | null;
  wouldTakeAgain?: number | null;
  grade?: string | null;
};

/** Parse RMP's rating date ("2026-04-28 04:28:24 +0000 UTC") to an ISO string,
 *  or null if unparseable. */
function parseRmpDate(s: string | null | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  const cleaned = s.replace(/\s*UTC\s*$/i, "").trim();
  const m = cleaned.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2})(\d{2})$/);
  const iso = m ? `${m[1]}T${m[2]}${m[3]}:${m[4]}` : cleaned;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Fetch full review-level rating nodes for a professor (up to 100). Empty on
 *  any error — never throws into the backfill loop. */
async function fetchTeacherRatingsFull(legacyId: number): Promise<RmpRatingNode[]> {
  try {
    const data = await rmpGraphql<{ node?: { ratings?: { edges?: Array<{ node?: RmpRatingNode }> } } }>(
      RATINGS_FULL_QUERY,
      { id: encodeTeacherGlobalId(legacyId), count: 100 },
    );
    return (data.node?.ratings?.edges ?? []).map((e) => e.node).filter((n): n is RmpRatingNode => !!n);
  } catch {
    return [];
  }
}

/** Upsert a professor's rating nodes into rmp_ratings (idempotent on
 *  lead_id + rmp_rating_id). Returns the number of rows persisted. */
async function upsertRatingsForLead(
  admin: { from: (t: string) => any },
  leadId: string,
  campusId: string | null,
  nodes: RmpRatingNode[],
): Promise<number> {
  // De-dupe within the prof by rating id so a single upsert batch can't violate
  // the (lead_id, rmp_rating_id) unique constraint.
  const byId = new Map<string, RmpRatingNode>();
  for (const n of nodes) {
    const rid = (n.id ?? "").trim();
    if (!rid || byId.has(rid)) continue;
    byId.set(rid, n);
  }
  const rows = Array.from(byId.values()).map((n) => ({
    lead_id: leadId,
    campus_id: campusId,
    rmp_rating_id: n.id ?? null,
    class_label: n.class ?? null,
    rated_at: parseRmpDate(n.date),
    comment: n.comment ?? null,
    difficulty: typeof n.difficultyRating === "number" ? n.difficultyRating : null,
    would_take_again: typeof n.wouldTakeAgain === "number" ? n.wouldTakeAgain : null,
    grade: n.grade ?? null,
    raw_json: n,
  }));
  if (rows.length === 0) return 0;
  const { error } = await admin.from("rmp_ratings").upsert(rows, { onConflict: "lead_id,rmp_rating_id" });
  if (error) throw new Error(error.message);
  return rows.length;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const backfillRatingsSchema = z.object({
  campusId: z.string().uuid().optional(),
  scope: z.enum(["with_codes", "all_checked"]).optional(),
  batchSize: z.number().int().min(1).max(50).optional(),
  afterId: z.string().uuid().optional(),
});

/** Resumable, batched, idempotent backfill of dated RMP reviews into rmp_ratings.
 *  Cursor-based (pass back `nextCursor` as `afterId` until `done`). Scope defaults
 *  to professors that already have RMP class labels (the clearly relevant set);
 *  scope="all_checked" widens to everyone with RMP aggregates. Politeness-paced. */
export const backfillRmpRatings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => backfillRatingsSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const batch = data.batchSize ?? 10;
    const scope = data.scope ?? "with_codes";

    let qy = supabaseAdmin
      .from("campus_lead_suggestions")
      .select("id, campus_id, rmp_profile_url")
      .not("rmp_profile_url", "is", null)
      .order("id", { ascending: true })
      .limit(batch);
    qy = scope === "with_codes"
      ? qy.not("rmp_course_codes", "is", null)
      : qy.not("rmp_num_ratings", "is", null);
    if (data.campusId) qy = qy.eq("campus_id", data.campusId);
    if (data.afterId) qy = qy.gt("id", data.afterId);

    const { data: rows, error } = await qy;
    if (error) throw new Error(error.message);

    let processed = 0, withRatings = 0, ratingsUpserted = 0;
    let nextCursor: string | null = data.afterId ?? null;
    for (const r of (rows ?? []) as Array<{ id: string; campus_id: string | null; rmp_profile_url: string | null }>) {
      processed += 1;
      nextCursor = r.id;
      const legacy = legacyIdFromRmpUrl(r.rmp_profile_url);
      if (legacy == null) continue;
      const nodes = await fetchTeacherRatingsFull(legacy);
      if (nodes.length === 0) continue;
      const n = await upsertRatingsForLead(supabaseAdmin, r.id, r.campus_id, nodes);
      ratingsUpserted += n;
      if (n > 0) withRatings += 1;
      await sleep(250); // politeness between professors
    }

    const done = (rows?.length ?? 0) < batch;
    return { scope, processed, withRatings, ratingsUpserted, nextCursor, done };
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
