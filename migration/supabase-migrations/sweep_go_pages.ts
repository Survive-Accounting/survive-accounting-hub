// SWEEP every /go/<school>/<chapter> page — the post-import acceptance gate.
//
//   set -a && . ./.env && set +a && bun run migration/supabase-migrations/sweep_go_pages.ts [BASE_URL]
//
// BASE_URL defaults to http://localhost:5234 (this session's dev server); pass the preview deploy
// URL to sweep production-built SSR instead.
//
// For every slugged chapter row it fetches the SSR HTML and reports:
//   * non-200 responses (a printed QR that 404s)
//   * WRONG CAMPUS: the page's eyebrow must name this chapter's own campus
//   * MISSING COURSE CODE: campuses with a verified intro_1 code must render it
//   * chapter name absent (page fell through to the generic landing)
//   * DESIGNATION LEAK: chapter_designation is store-only and must never be in student-facing HTML
//
// Read-only; talks to the DB only to enumerate pages and expectations.
import { createClient } from "@supabase/supabase-js";

import { canonicalSchoolName } from "../../src/lib/schools";

const BASE = (process.argv[2] ?? "http://localhost:5234").replace(/\/$/, "");
const CONCURRENCY = 12;

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table as never).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Ch = { id: string; campus_id: string; greek_org_id: string | null; slug: string; chapter_designation: string | null; archived_at?: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** React escapes ' as &#x27; and " as &quot; in SSR HTML; match name loosely. */
const inHtml = (html: string, needle: string) => {
  const variants = [needle, esc(needle), needle.replace(/'/g, "&#x27;"), needle.replace(/'/g, "&#39;")];
  return variants.some((v) => html.includes(v));
};

const main = async () => {
  console.log(`=== /go/ PAGE SWEEP against ${BASE} ===\n`);

  const campuses = await fetchAll<{ id: string; slug: string | null; name: string; short_name: string | null; course_family_codes_json: unknown }>(
    "campuses", "id,slug,name,short_name,course_family_codes_json",
  );
  const campusById = new Map(campuses.map((c) => [c.id, c]));
  const orgs = await fetchAll<{ id: string; name: string | null }>("greek_orgs", "id,name");
  const orgById = new Map(orgs.map((o) => [o.id, (o.name ?? "").trim()]));

  const chapters = await fetchAll<Ch>(
    "campus_greek_chapters", "id,campus_id,greek_org_id,slug,chapter_designation,archived_at",
    (q) => q.not("slug", "is", null).is("archived_at", null),
  );
  console.log(`pages to sweep: ${chapters.length}`);

  type Fail = { url: string; why: string };
  const fails: Fail[] = [];
  let ok = 0, done = 0, skippedNoCampusSlug = 0;

  const work = chapters.slice();
  const runOne = async (ch: Ch) => {
    const campus = campusById.get(ch.campus_id);
    if (!campus?.slug) { skippedNoCampusSlug++; return; }
    const url = `${BASE}/go/${campus.slug}/${ch.slug}`;
    const orgName = ch.greek_org_id ? orgById.get(ch.greek_org_id) ?? "" : "";
    const display = canonicalSchoolName(campus.slug, campus.short_name || campus.name);
    const raw = campus.course_family_codes_json;
    const codes = typeof raw === "string" ? JSON.parse(raw || "{}") : ((raw ?? {}) as Record<string, string>);
    const expectCode = ((codes?.intro_1 ?? "") as string).trim();

    let res: Response;
    try { res = await fetch(url, { redirect: "manual" }); }
    catch (e) { fails.push({ url, why: `fetch failed: ${(e as Error).message}` }); return; }
    if (res.status !== 200) { fails.push({ url, why: `HTTP ${res.status}` }); return; }
    const html = await res.text();

    if (orgName && !inHtml(html, orgName)) {
      // The route deliberately falls back to the generic landing rather than 404 — for a sweep
      // that fallback IS the failure: this chapter's page did not render as this chapter.
      fails.push({ url, why: `chapter name "${orgName}" absent (generic landing fallback?)` });
      return;
    }
    if (!inHtml(html, display)) fails.push({ url, why: `campus name "${display}" absent — wrong-campus render` });
    if (expectCode && !inHtml(html, expectCode)) fails.push({ url, why: `course code "${expectCode}" missing` });
    if (ch.chapter_designation && ch.chapter_designation.trim().length > 2 && inHtml(html, ch.chapter_designation.trim())) {
      fails.push({ url, why: `DESIGNATION LEAK: "${ch.chapter_designation}" appears in student-facing HTML` });
    }
    ok++;
  };

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (work.length) {
      const ch = work.shift();
      if (!ch) break;
      await runOne(ch);
      done++;
      if (done % 200 === 0) console.log(`  …${done}/${chapters.length} (${fails.length} failures so far)`);
    }
  });
  await Promise.all(workers);

  console.log(`\nswept ${done}  ok ${ok}  failures ${fails.length}  skipped(no campus slug) ${skippedNoCampusSlug}`);
  if (fails.length) {
    console.log(`\nFAILURES:`);
    for (const f of fails) console.log(`  ${f.url}\n    ${f.why}`);
    process.exit(1);
  }
  console.log("ALL PAGES PASS");
};

main().catch((e) => { console.error("SWEEP FAILED:", e); process.exit(1); });
