// Growth Contact Intelligence — discovery core (framework-free).
//
// Takes a Supabase client + provider keys and runs staged PUBLIC discovery for the
// two surfaces Campus Backfill does not cover: individual Greek CHAPTER contacts
// and BUSINESS CLUBS (Women-in-Business / Investment-Finance) for rep recruitment.
// Councils are NOT discovered here — they are read from campus_council_contacts.
//
// LAWS (mirrors council-contacts.functions.ts):
//   * NEVER invent a value. Every stored email/handle must appear verbatim in the
//     fetched public page (AI output is intersected with a regex scan of the page).
//   * Discovery ONLY. Nothing here emails / DMs / texts / follows anyone.
//   * Prefer official university sources (site:domain scoping) per §6.
//   * Dedupe by identity; a re-seen value gains EVIDENCE, not a duplicate row.
//
// Callable from both growth-intel.functions.ts (admin server fns) and the CLI
// batch runner (scripts/growth-intel/run.ts) — no TanStack / no auth here.
import {
  classifyBusinessCategory,
  normalizeClubName,
  classifyContactType,
  classifySource,
  combineConfidence,
  scanEmails,
  scanInstagram,
  scanFacebook,
  igUrl,
  hostOf,
  firstDomain,
  normalizeRole,
  contactDedupeKey,
  sourceRank,
  campusAcronym,
  handleHasCampusSignal,
  type ClubCategory,
  type SourceType,
} from "./growth-intel-extract";

// Campus "signal" tokens a genuine campus-chapter IG handle should carry (name
// words + acronym + short_name/slug). Nicknames (bama, vandy, uga) are NOT derivable
// from the official name — for high recall, seed extra tokens per campus from a
// signals source (campuses.short_name / a lookup). This auto-derivation is the
// scalable fallback; see GROWTH_CONTACT_INTEL_AUDIT.md §"Chapter IG precision".
function deriveCampusSignals(campus: any): string[] {
  const stop = new Set(["university", "college", "the", "of", "at", "and", "state", "school", "system"]);
  const clean2 = (s: string) => (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const toks = clean2(campus.name).split(" ").filter((w) => w.length >= 4 && !stop.has(w));
  const ac = campusAcronym(campus.name || "");
  const short = clean2(campus.short_name || "").split(" ").filter((w) => w.length >= 3 && !stop.has(w));
  const slug = String(campus.slug || "").split("-").filter((w) => w.length >= 4 && !stop.has(w));
  // Institutional nicknames (bama, uga, vandy) are NOT derivable from the official
  // name — supply them per campus (campuses.json / a signals column) to keep recall.
  const nick = Array.isArray(campus.signals) ? campus.signals.map((s: string) => clean2(s)).filter(Boolean) : [];
  return [...new Set([...toks, ...(ac.length >= 3 ? [ac] : []), ...short, ...slug, ...nick].filter(Boolean))];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type DB = any;

export type Keys = { serp: string; firecrawl: string; ai: string };
export type Counters = { serp: number; firecrawl: number; ai: number; pages: number };
export const newCounters = (): Counters => ({ serp: 0, firecrawl: 0, ai: 0, pages: 0 });

// Rough unit costs (USD). SerpAPI ~$0.008/search, Firecrawl ~$0.005/scrape,
// Gemini-flash extract ~$0.002/call. Deliberately conservative; reported, not billed.
const UNIT = { serp: 0.008, firecrawl: 0.005, ai: 0.002 };
export const estCost = (c: Counters) => +(c.serp * UNIT.serp + c.firecrawl * UNIT.firecrawl + c.ai * UNIT.ai).toFixed(4);

const SERP_BASE = "https://serpapi.com/search.json";
const AI_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Personal free-mail is almost never a real chapter role contact (alumni/webmaster
// noise); accept it only if the local-part is clearly a role/office address.
const FREEMAIL = /@(gmail|yahoo|hotmail|outlook|aol|icloud|proton(mail)?|me|live|msn)\./i;
const ROLE_LOCAL = /^(info|contact|hello|board|exec|officers?|president|vp|treasurer|secretary|membership|recruitment|admin|team|chapter|greek|fsl|scholarship|academic)/i;

// ── Providers ──────────────────────────────────────────────────────────────
// Tracks SerpAPI credit health so a long unattended run stops when searches run out
// (401/403, or SerpAPI's "ran out of searches" error) rather than spinning uselessly.
export const SERP_STATE = { dead: false, lastError: "", rateLimited: 0 };

export async function serp(key: string, q: string, c: Counters, num = 6): Promise<Array<{ title: string; link: string }>> {
  c.serp++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(`${SERP_BASE}?engine=google&num=${num}&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`, { signal: ctrl.signal });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) { SERP_STATE.dead = true; SERP_STATE.lastError = `HTTP ${r.status}`; }
      else if (r.status === 429) SERP_STATE.rateLimited++;
      return [];
    }
    const j = (await r.json()) as { organic_results?: Array<{ title?: string; link?: string }>; error?: string };
    if (j.error) {
      if (/run out|out of searches|exceeded|no searches|account limit|plan.*limit/i.test(j.error)) {
        SERP_STATE.dead = true;
        SERP_STATE.lastError = j.error;
      }
      return [];
    }
    return (j.organic_results ?? []).filter((x) => x.link).map((x) => ({ title: x.title ?? "", link: x.link as string }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function firecrawl(key: string, url: string, c: Counters): Promise<string | null> {
  c.firecrawl++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 1500 }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { markdown?: string } };
    const md = j.data?.markdown ?? null;
    if (md) c.pages++;
    return md;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function aiJsonArray(key: string, prompt: string, c: Counters): Promise<any[]> {
  c.ai++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch(AI_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, temperature: 0, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const m = (j.choices?.[0]?.message?.content ?? "").match(/\[[\s\S]*\]/);
    return m ? (JSON.parse(m[0]) as any[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Domain resolution ──────────────────────────────────────────────────────
const eduRegistrable = (host: string) => {
  const parts = host.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : host;
};
async function resolveDomain(campus: any, key: string, c: Counters): Promise<string> {
  const stored = firstDomain(campus.domains, campus.email_domain);
  if (stored) return stored;
  const w = hostOf(campus.website_url || "");
  if (w.endsWith(".edu")) return eduRegistrable(w);
  const hits = await serp(key, `${campus.name} official university website`, c, 4);
  for (const h of hits) {
    const host = hostOf(h.link);
    if (host.endsWith(".edu")) return eduRegistrable(host);
  }
  return "";
}

// A .edu that is NOT this campus's own domain is a DIFFERENT university's page —
// the main cross-campus contamination source. Reject it when we know the domain.
const foreignEdu = (url: string, domain: string) => {
  if (!domain) return false;
  const host = hostOf(url);
  return host.endsWith(".edu") && eduRegistrable(host) !== domain;
};
const onOfficial = (url: string, domain: string) => {
  const host = hostOf(url);
  if (foreignEdu(url, domain)) return false;
  return host.endsWith(".edu") || (!!domain && host.endsWith(domain)) || /campuslabs\.com|presence\.io|anthology/.test(host);
};
const snippetAround = (md: string, needle: string) => {
  const i = md.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return null;
  return md.slice(Math.max(0, i - 60), i + needle.length + 60).replace(/\s+/g, " ").trim();
};

// ── Evidence + contact persistence (manual upsert: expression indexes can't be
//    ON CONFLICT arbiters via PostgREST, so we dedupe in memory/read-then-write) ─
async function addEvidence(
  db: DB,
  target: { contact_id?: string; club_id?: string },
  ev: { source_url: string; source_type: SourceType; matched_value?: string | null; matched_kind?: string | null; snippet?: string | null; confidence: string },
) {
  const { error } = await db.from("growth_contact_evidence").insert({ ...target, ...ev, retrieved_at: now() });
  // Duplicate evidence (same source+value) trips the unique index — that's fine.
  if (error && !String(error.code).includes("23505")) return;
}

// ── Business-club discovery ────────────────────────────────────────────────
function clubQueries(name: string, domain: string, cat: ClubCategory): string[] {
  const label = cat === "women_in_business" ? "women in business" : "investment finance club";
  // Two queries/category (down from four): one domain-scoped, one name-based. The
  // club's IG + president now come from the one-hop on the org's own page, so the
  // extra site:instagram / second site: queries were dropped to cut SERP spend.
  const qs: string[] = [];
  if (domain) qs.push(`site:${domain} ${label} student organization`);
  qs.push(`${name} ${label} student organization`);
  return qs;
}

const CLUB_PROMPT = (name: string, cat: ClubCategory, emails: string[], igs: string[]) => `From this PUBLIC university student-organization / business-school page for ${name}, extract UNDERGRADUATE business organizations in ONE target category only.
TARGET CATEGORY: ${cat === "women_in_business" ? "WOMEN IN BUSINESS (Women in Business, Undergraduate Women in Business, Women in Finance — women-focused business orgs)" : "INVESTMENT / FINANCE (Investment Club, Finance Club, Student Managed Investment Fund, Investment Banking Club, Asset Management, Financial Management Association)"}.
EXCLUDE: Beta Alpha Psi, accounting clubs, marketing, real estate, consulting, entrepreneurship, MBA/graduate-only orgs, and anything not clearly in the target category.
Return ONLY a JSON array (empty if none):
[{"name":"","general_email":"","president_name":"","president_email":"","instagram":"","website":"","facebook":""}]
RULES:
- Every email MUST be one of these exact addresses found on the page: ${emails.join(", ") || "(none)"}. Never output an email not in that list.
- instagram MUST be one of these handles if present: ${igs.join(", ") || "(none)"}, or omit it.
- Omit a field you cannot find. Do not guess names or emails.
Page:\n\n`;

// One-hop: extract the president + general email + IG from a SINGLE club's own page.
const CLUB_PAGE_PROMPT = (name: string, emails: string[], igs: string[]) => `This is the PUBLIC page for the student organization "${name}". Extract its contact info.
Return ONLY a JSON array with ONE object (empty array if none):
[{"general_email":"","president_name":"","president_email":"","instagram":""}]
RULES:
- Every email MUST be one of these exact addresses found on the page: ${emails.join(", ") || "(none)"}. Never output an email not in that list.
- instagram MUST be one of these handles if present: ${igs.join(", ") || "(none)"}, or omit it.
- "president_email" = the current president/chair's address if published; "general_email" = a club inbox.
- Omit any field you cannot find. Do not guess.
Page:\n\n`;

async function discoverClubsForCategory(db: DB, campus: any, domain: string, cat: ClubCategory, keys: Keys, c: Counters, runId: string | null) {
  // Gather candidate official pages.
  const pages = new Map<string, string>(); // url -> "official" | "social" | "web"
  for (const q of clubQueries(campus.name, domain, cat)) {
    const hits = await serp(keys.serp, q, c, 6);
    for (const h of hits.slice(0, 4)) {
      if (pages.size >= 6) break;
      if (foreignEdu(h.link, domain)) continue; // different university's page
      const host = hostOf(h.link);
      if (host.includes("instagram.com") || host.includes("facebook.com")) {
        if (!pages.has(h.link)) pages.set(h.link, "social");
      } else if (onOfficial(h.link, domain)) {
        if (!pages.has(h.link)) pages.set(h.link, "official");
      } else if (pages.size < 4 && !pages.has(h.link)) {
        pages.set(h.link, "web");
      }
    }
  }
  // Prefer official pages first; cap fetches.
  const ordered = [...pages].sort((a, b) => (a[1] === "official" ? -1 : 0) - (b[1] === "official" ? -1 : 0)).slice(0, 5);

  type Cand = {
    name: string;
    general_email?: string | null;
    president_name?: string | null;
    president_email?: string | null;
    instagram?: string | null;
    website?: string | null;
    facebook?: string | null;
    source_url: string;
    source_type: SourceType;
  };
  const cands: Cand[] = [];
  for (const [url] of ordered) {
    const md = await firecrawl(keys.firecrawl, url, c);
    if (!md) continue;
    const emails = scanEmails(md);
    const igs = scanInstagram(md);
    const fbs = scanFacebook(md);
    const { source_type } = classifySource(url, domain);
    const rows = await aiJsonArray(keys.ai, CLUB_PROMPT(campus.name, cat, [...emails], igs) + md.slice(0, 22000), c);
    for (const r of rows as any[]) {
      if (!r?.name || classifyBusinessCategory(String(r.name)) !== cat) continue; // category guard
      const ge = (r.general_email || "").toLowerCase().trim();
      const pe = (r.president_email || "").toLowerCase().trim();
      const ig = (r.instagram || "").toLowerCase().replace(/^@/, "").replace(/^.*instagram\.com\//, "").replace(/\/.*$/, "");
      cands.push({
        name: String(r.name).slice(0, 160),
        general_email: ge && emails.has(ge) ? ge : null, // verbatim guard
        president_name: r.president_name ? String(r.president_name).slice(0, 120) : null,
        president_email: pe && emails.has(pe) ? pe : null, // verbatim guard
        instagram: ig && igs.includes(ig) ? ig : null, // verbatim guard
        website: r.website ? String(r.website).slice(0, 300) : null,
        facebook: r.facebook && fbs.length ? fbs[0] : null,
        source_url: url,
        source_type,
      });
    }
  }

  // Dedupe candidates by normalized identity; keep the most authoritative source.
  const byId = new Map<string, Cand[]>();
  for (const cand of cands) {
    const id = normalizeClubName(cand.name, campus.name);
    (byId.get(id) ?? byId.set(id, []).get(id)!).push(cand);
  }

  let saved = 0;
  for (const [normId, group] of byId) {
    group.sort((a, b) => sourceRank(a.source_type) - sourceRank(b.source_type));
    const best = group[0];
    let presidentSrc = best.source_url;
    let presidentSrcType = best.source_type;
    // One-hop (§5): fetch the club's OWN page for president email + IG + inbox.
    // Cheap (one firecrawl + one AI per kept org) and only when detail is missing.
    const clubPage = best.website && /^https?:\/\//.test(best.website) ? best.website : null;
    if (clubPage && (!best.president_email || !best.instagram || !best.general_email)) {
      const md = await firecrawl(keys.firecrawl, clubPage, c);
      if (md) {
        const em = scanEmails(md);
        const igs2 = scanInstagram(md);
        const st2 = classifySource(clubPage, domain).source_type;
        const out = await aiJsonArray(keys.ai, CLUB_PAGE_PROMPT(best.name, [...em], igs2) + md.slice(0, 20000), c);
        const row = (out[0] || {}) as any;
        const pe = (row.president_email || "").toLowerCase().trim().replace(/^mailto:/, "");
        const ge = (row.general_email || "").toLowerCase().trim().replace(/^mailto:/, "");
        const h = (row.instagram || "").toLowerCase().replace(/^@/, "").replace(/^.*instagram\.com\//, "").replace(/\/.*$/, "");
        if (pe && em.has(pe) && !(FREEMAIL.test(pe) && !ROLE_LOCAL.test(pe.split("@")[0]))) {
          best.president_email = pe;
          best.president_name = row.president_name || best.president_name;
          presidentSrc = clubPage;
          presidentSrcType = st2;
        }
        if (ge && em.has(ge) && !best.general_email) best.general_email = ge;
        if (h && igs2.includes(h) && !best.instagram) best.instagram = h;
        group.push({ ...best, source_url: clubPage, source_type: st2 }); // club-page evidence
      }
    }
    const conf = combineConfidence({ best: best.source_type, verbatim: true });
    const clubRow = {
      campus_id: campus.id,
      category: cat,
      name: best.name,
      normalized_name: normId,
      website_url: best.website || null,
      instagram_url: best.instagram ? igUrl(best.instagram) : null,
      facebook_url: best.facebook ? `https://facebook.com/${best.facebook}` : null,
      general_email: best.general_email || null,
      source_url: best.source_url,
      source_type: best.source_type,
      confidence: conf,
      retrieved_at: now(),
      last_seen: now(),
      discovery_run_id: runId,
      updated_at: now(),
    };
    const { data: club, error } = await db
      .from("growth_business_clubs")
      .upsert(clubRow, { onConflict: "campus_id,category,normalized_name" })
      .select("id")
      .single();
    if (error || !club) continue;
    saved++;
    // Evidence: one row per source the org was seen on.
    for (const g of group) {
      await addEvidence(db, { club_id: club.id }, {
        source_url: g.source_url,
        source_type: g.source_type,
        matched_value: g.general_email || g.instagram || g.website || g.name,
        matched_kind: g.general_email ? "email" : g.instagram ? "instagram" : g.website ? "website" : "name",
        confidence: conf,
      });
    }
    // President contact (person) if a verbatim email was found.
    if (best.president_name || best.president_email) {
      const ctype = classifyContactType({ email: best.president_email, name: best.president_name, role: "President" });
      const { data: pc } = await db
        .from("growth_public_contacts")
        .insert({
          campus_id: campus.id,
          entity_type: "club",
          entity_id: club.id,
          category: cat,
          contact_type: ctype,
          name: best.president_name || null,
          role: "President",
          email: best.president_email || null,
          instagram_url: best.instagram ? igUrl(best.instagram) : null,
          is_current: true,
          source_url: presidentSrc,
          source_type: presidentSrcType,
          confidence: conf,
          retrieved_at: now(),
          first_seen: now(),
          last_seen: now(),
          discovery_run_id: runId,
        })
        .select("id")
        .maybeSingle();
      if (pc?.id) await addEvidence(db, { contact_id: pc.id }, { source_url: presidentSrc, source_type: presidentSrcType, matched_value: best.president_email || best.president_name, matched_kind: best.president_email ? "email" : "name", confidence: conf });
    }
  }
  return saved;
}

export async function runBusinessClubDiscovery(db: DB, campus: any, keys: Keys, opts: { runId?: string | null; counters?: Counters; categories?: ClubCategory[] } = {}): Promise<Record<ClubCategory, number>> {
  const c: Counters = opts.counters ?? newCounters();
  const runId = opts.runId ?? null;
  const domain = await resolveDomain(campus, keys.serp, c);
  const result: Record<ClubCategory, number> = { women_in_business: 0, investment_finance: 0 };
  const cats = opts.categories?.length ? opts.categories : (["women_in_business", "investment_finance"] as ClubCategory[]);
  for (const cat of cats) {
    await markStatus(db, campus.id, cat, { status: "running", last_attempted_at: now(), discovery_run_id: runId });
    try {
      const n = await discoverClubsForCategory(db, campus, domain, cat, keys, c, runId);
      result[cat] = n;
      await markStatus(db, campus.id, cat, {
        status: n > 0 ? "complete" : "no_result",
        last_success_at: n > 0 ? now() : null,
        results_found: n,
        error: null,
      });
    } catch (e: any) {
      await markStatus(db, campus.id, cat, { status: "failed", error: String(e?.message || e).slice(0, 300) });
    }
    await sleep(200);
  }
  return result;
}

// ── Chapter-contact discovery ──────────────────────────────────────────────
const CHAPTER_PROMPT = (school: string, chapter: string, emails: string[], igs: string[]) => `From this PUBLIC page about the ${chapter} chapter at ${school}, extract chapter CONTACTS and official accounts. Focus on academic/scholarship exec roles.
Return ONLY a JSON array (empty if none):
[{"contact_type":"role_inbox|student_officer|staff_advisor|organization_general|social_account","name":"","role":"President|VP Academics|Scholarship Chair|Academic Chair|Advisor|...","email":"","instagram":"","website":""}]
RULES:
- Every email MUST be one of these exact addresses found on the page: ${emails.join(", ") || "(none)"}. Never output an email not in that list.
- instagram MUST be one of these handles if present: ${igs.join(", ") || "(none)"}, or omit it.
- Prefer academic/scholarship roles (VP Academics, Scholarship Chair, Academic Chair, President). Omit fields you cannot find. Do not guess.
Page:\n\n`;

function chapterName(ch: any): string {
  const org = ch._org?.name || ch._org?.letters || "";
  const letters = ch.letters || ch._org?.letters || "";
  return (org || ch.nickname || letters || ch.chapter_designation || "chapter").toString();
}

async function discoverOneChapter(db: DB, campus: any, domain: string, ch: any, keys: Keys, c: Counters, runId: string | null, queriesPerChapter = 2): Promise<number> {
  const cname = chapterName(ch);
  const signals = deriveCampusSignals(campus);
  const pages = new Map<string, "official" | "social" | "web">();
  for (const seed of [ch.chapter_url, ch.exec_page_url]) if (seed) pages.set(seed, "official");
  // Query 1 = IG handle; query 2 = contact/roster page (exec emails). At 1/chapter
  // we keep the contact query (exec emails are the goal) and give up most IG handles.
  const igQuery = `${campus.name} ${cname} chapter instagram`;
  const contactQuery = domain ? `site:${domain} ${cname} chapter contact email` : `${campus.name} ${cname} fraternity sorority chapter contact email`;
  const queries = queriesPerChapter <= 1 ? [contactQuery] : [igQuery, contactQuery];
  for (const q of queries) {
    const hits = await serp(keys.serp, q, c, 5);
    for (const h of hits.slice(0, 3)) {
      if (pages.size >= 4) break;
      if (foreignEdu(h.link, domain)) continue; // different university's page
      const host = hostOf(h.link);
      if (host.includes("instagram.com")) pages.set(h.link, "social");
      else if (onOfficial(h.link, domain)) pages.set(h.link, "official");
      else if (pages.size < 3) pages.set(h.link, "web");
    }
  }

  type Row = { contact_type: string; name: string | null; role: string | null; email: string | null; instagram_url: string | null; website_url: string | null; source_url: string; source_type: SourceType };
  const rows: Row[] = [];
  for (const [url, hint] of [...pages].slice(0, 4)) {
    const { source_type } = classifySource(url, domain);
    // Social handle comes straight from the IG result URL — NEVER fetch instagram
    // (it blocks scraping and returns no markdown, which previously dropped the row).
    if (hint === "social") {
      const h = hostOf(url).includes("instagram.com") ? (url.split("instagram.com/")[1] || "").split(/[/?]/)[0].toLowerCase() : "";
      const reserved = ["p", "reel", "reels", "explore", "stories", "tv", "accounts"];
      // Require a campus signal so we keep the CAMPUS chapter account, not the
      // national org account (@phikappatau) or another school's chapter (@aepigsu).
      if (h && !reserved.includes(h) && (signals.length === 0 || handleHasCampusSignal(h, signals))) {
        rows.push({ contact_type: "social_account", name: null, role: null, email: null, instagram_url: igUrl(h), website_url: null, source_url: url, source_type });
      }
      continue;
    }
    const md = await firecrawl(keys.firecrawl, url, c);
    if (!md) continue;
    const emails = scanEmails(md);
    const igs = scanInstagram(md);
    if (emails.size === 0 && igs.length === 0) continue;
    const out = await aiJsonArray(keys.ai, CHAPTER_PROMPT(campus.name, cname, [...emails], igs) + md.slice(0, 20000), c);
    for (const r of out as any[]) {
      const email = (r.email || "").toLowerCase().trim().replace(/^mailto:/, "");
      const ig = (r.instagram || "").toLowerCase().replace(/^@/, "").replace(/^.*instagram\.com\//, "").replace(/\/.*$/, "");
      let emailOk = !!email && emails.has(email); // verbatim guard
      if (emailOk && FREEMAIL.test(email) && !ROLE_LOCAL.test(email.split("@")[0])) emailOk = false; // personal free-mail noise
      const igOk = ig && igs.includes(ig);
      if (!emailOk && !igOk && !r.name) continue;
      const role = normalizeRole(r.role);
      const ctype = classifyContactType({
        email: emailOk ? email : null,
        name: r.name,
        role,
        isSocial: !emailOk && !r.name && igOk,
        isStaff: /advisor|adviser|staff|coordinator|director/i.test(r.contact_type || r.role || ""),
      });
      rows.push({
        contact_type: ctype,
        name: r.name ? String(r.name).slice(0, 120) : null,
        role,
        email: emailOk ? email : null,
        instagram_url: igOk ? igUrl(ig) : null,
        website_url: r.website ? String(r.website).slice(0, 300) : null,
        source_url: url,
        source_type,
      });
    }
  }

  // Load existing contacts for this chapter, dedupe by identity.
  const { data: existing } = await db.from("growth_public_contacts").select("id,email,instagram_url,name,contact_type").eq("entity_type", "chapter").eq("entity_id", ch.id);
  const byKey = new Map<string, { id: string }>();
  for (const e of (existing ?? []) as any[]) byKey.set(contactDedupeKey(e), { id: e.id });

  let saved = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const key = contactDedupeKey(r);
    if (seen.has(key)) {
      // second source this run -> evidence only
    }
    seen.add(key);
    const conf = combineConfidence({ best: r.source_type, verbatim: !!(r.email || r.instagram_url) });
    let id = byKey.get(key)?.id;
    if (id) {
      await db.from("growth_public_contacts").update({ last_seen: now(), last_verified_at: now(), is_current: true, updated_at: now() }).eq("id", id);
    } else {
      const { data: ins, error } = await db
        .from("growth_public_contacts")
        .insert({
          campus_id: campus.id,
          entity_type: "chapter",
          entity_id: ch.id,
          category: "chapter",
          contact_type: r.contact_type,
          name: r.name,
          role: r.role,
          email: r.email,
          instagram_url: r.instagram_url,
          website_url: r.website_url,
          is_current: true,
          source_url: r.source_url,
          source_type: r.source_type,
          confidence: conf,
          retrieved_at: now(),
          first_seen: now(),
          last_seen: now(),
          discovery_run_id: runId,
        })
        .select("id")
        .maybeSingle();
      if (error || !ins?.id) continue;
      id = String(ins.id);
      byKey.set(key, { id });
      saved++;
    }
    if (id)
      await addEvidence(db, { contact_id: id }, {
        source_url: r.source_url,
        source_type: r.source_type,
        matched_value: r.email || r.instagram_url || r.name,
        matched_kind: r.email ? "email" : r.instagram_url ? "instagram" : "name",
        confidence: conf,
      });
  }
  return saved;
}

// Free-text campus council -> canonical key (the council column is dirty; never ===).
export function councilKey(raw: string | null | undefined): "ifc" | "panhellenic" | "nphc" | "mgc" | "other" {
  const s = (raw || "").toLowerCase();
  if (/\bifc\b|interfrat/.test(s)) return "ifc";
  if (/panhel/.test(s)) return "panhellenic";
  if (/nphc|pan-hellenic|divine\s*nine/.test(s)) return "nphc";
  if (/\bmgc\b|multicultural/.test(s)) return "mgc";
  return "other";
}

export async function runChapterDiscovery(
  db: DB,
  campus: any,
  keys: Keys,
  opts: { runId?: string | null; limit?: number; counters?: Counters; councils?: string[]; skipCompleted?: boolean; queriesPerChapter?: number } = {},
): Promise<{ chaptersProcessed: number; contactsSaved: number }> {
  const c = opts.counters ?? newCounters();
  const runId = opts.runId ?? null;
  const qpc = opts.queriesPerChapter ?? 2;
  const domain = await resolveDomain(campus, keys.serp, c);
  const { data: all } = await db
    .from("campus_greek_chapters")
    .select("id,letters,nickname,chapter_designation,council,chapter_url,exec_page_url,greek_org_id")
    .eq("campus_id", campus.id)
    .is("archived_at", null)
    .limit(3000);
  // Council filter (e.g. IFC + Panhellenic only) via normalized free-text council.
  const wanted = opts.councils?.length ? new Set(opts.councils) : null;
  let chapters = ((all ?? []) as any[]).filter((r) => !wanted || wanted.has(councilKey(r.council)));
  // Resumability: skip chapters already discovered (complete / no_result) so a
  // continuous re-scan only spends on genuinely new chapters.
  if (opts.skipCompleted && chapters.length) {
    const { data: done } = await db
      .from("growth_discovery_status")
      .select("entity_id,status")
      .eq("campus_id", campus.id)
      .eq("category", "chapter")
      .in("entity_id", chapters.map((r) => r.id));
    const doneSet = new Set(((done ?? []) as any[]).filter((s) => s.status === "complete" || s.status === "no_result").map((s) => s.entity_id));
    chapters = chapters.filter((r) => !doneSet.has(r.id));
  }
  if (opts.limit) chapters = chapters.slice(0, opts.limit);
  // Resolve org names in one batch (no FK embed available in the schema cache).
  const orgIds = [...new Set(((chapters ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean))];
  const orgMap = new Map<string, any>();
  if (orgIds.length) {
    const { data: orgs } = await db.from("greek_orgs").select("id,name,letters").in("id", orgIds);
    for (const o of (orgs ?? []) as any[]) orgMap.set(o.id, o);
  }
  for (const ch of (chapters ?? []) as any[]) ch._org = orgMap.get(ch.greek_org_id) ?? null;
  let contactsSaved = 0;
  let processed = 0;
  for (const ch of (chapters ?? []) as any[]) {
    await markStatus(db, campus.id, "chapter", { status: "running", last_attempted_at: now(), discovery_run_id: runId }, ch.id);
    try {
      const n = await discoverOneChapter(db, campus, domain, ch, keys, c, runId, qpc);
      contactsSaved += n;
      processed++;
      await markStatus(db, campus.id, "chapter", { status: n > 0 ? "complete" : "no_result", last_success_at: n > 0 ? now() : null, results_found: n, error: null }, ch.id);
    } catch (e: any) {
      await markStatus(db, campus.id, "chapter", { status: "failed", error: String(e?.message || e).slice(0, 300) }, ch.id);
    }
    await sleep(200);
  }
  return { chaptersProcessed: processed, contactsSaved };
}

// ── Status upsert (manual: partial unique indexes are not PostgREST arbiters) ─
async function markStatus(db: DB, campusId: string, category: string, patch: Record<string, unknown>, entityId: string | null = null) {
  const sel = db.from("growth_discovery_status").select("id").eq("campus_id", campusId).eq("category", category);
  const { data: existing } = entityId ? await sel.eq("entity_id", entityId).maybeSingle() : await sel.is("entity_id", null).maybeSingle();
  if (existing?.id) {
    await db.from("growth_discovery_status").update({ ...patch, updated_at: now() }).eq("id", existing.id);
  } else {
    await db.from("growth_discovery_status").insert({ campus_id: campusId, category, entity_id: entityId, ...patch, updated_at: now() });
  }
}

// ── Read layer (unified: clubs + chapter contacts + council contacts) ────────
export async function readCampusIntel(db: DB, campusId: string) {
  const [clubs, chapterContacts, councilContacts, councilStatus, statuses] = await Promise.all([
    db.from("growth_business_clubs").select("*").eq("campus_id", campusId).order("category"),
    db.from("growth_public_contacts").select("*").eq("campus_id", campusId).eq("entity_type", "chapter").order("contact_type"),
    db.from("campus_council_contacts").select("id,council_type,contact_type,name,role,email,instagram_url,source_url,confidence,is_current").eq("campus_id", campusId).order("council_type"),
    db.from("campus_council_status").select("council_type,status,contacts_found,role_inbox_found").eq("campus_id", campusId),
    db.from("growth_discovery_status").select("category,entity_id,status,results_found,last_attempted_at").eq("campus_id", campusId),
  ]);
  return {
    clubs: clubs.data ?? [],
    chapterContacts: chapterContacts.data ?? [],
    councilContacts: councilContacts.data ?? [], // READ-ONLY from Campus Backfill
    councilStatus: councilStatus.data ?? [],
    statuses: statuses.data ?? [],
  };
}
