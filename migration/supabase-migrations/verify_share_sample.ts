// SHARE-TOOL SAMPLE VERIFICATION — the import spec's §5, automated.
//
//   set -a && . ./.env && set +a && bun run migration/supabase-migrations/verify_share_sample.ts [BASE_URL]
//
// Samples ≥3 chapters per campus — always including one NPHC and one MGC chapter where the campus
// has them — and for each verifies:
//   * the canonical link is /go/<school>/<chapter> (what "Copy chapter link" copies)
//   * the QR target is that URL + ?s=flyer (flyerTarget is the one QR-URL builder)
//   * the flyer SVG renders (200) and says "Shared by <nickname>" — nickname, never the
//     formal org name when a nickname exists, and never chapter_designation
//   * the GroupMe copy (both claimed + unclaimed variants) uses the nickname and never the
//     designation
// Pure-function checks import the REAL builders; nothing is re-implemented.
import { createClient } from "@supabase/supabase-js";

import { chapterShortName, chapterUrl, groupMeMessage } from "../../src/components/site/ChapterShare";
import { flyerTarget } from "../../src/lib/flyer.server";

const BASE = (process.argv[2] ?? "http://localhost:5235").replace(/\/$/, "");

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

type Ch = { campus_id: string; slug: string; greek_org_id: string | null; council: string | null; nickname: string | null; letters: string | null; chapter_designation: string | null; as_of: string | null };

const main = async () => {
  console.log(`=== SHARE-TOOL SAMPLE VERIFICATION against ${BASE} ===\n`);

  const campuses = await fetchAll<{ id: string; slug: string | null; short_name: string | null; name: string }>(
    "campuses", "id,slug,short_name,name",
  );
  const campusById = new Map(campuses.map((c) => [c.id, c]));
  const orgs = await fetchAll<{ id: string; name: string | null }>("greek_orgs", "id,name");
  const orgById = new Map(orgs.map((o) => [o.id, (o.name ?? "").trim()]));

  // Imported rows only (as_of stamped) — the sample the spec scopes to.
  const chapters = await fetchAll<Ch>(
    "campus_greek_chapters", "campus_id,slug,greek_org_id,council,nickname,letters,chapter_designation,as_of",
    (q) => q.not("slug", "is", null).not("as_of", "is", null).is("archived_at", null),
  );

  // ≥3 per campus: first NPHC, first MGC, then fill from the rest.
  const byCampus = new Map<string, Ch[]>();
  for (const ch of chapters) byCampus.set(ch.campus_id, [...(byCampus.get(ch.campus_id) ?? []), ch]);
  const sample: Ch[] = [];
  for (const [, list] of byCampus) {
    const pick = new Set<Ch>();
    const nphc = list.find((c) => c.council === "NPHC");
    const mgc = list.find((c) => c.council === "MGC");
    if (nphc) pick.add(nphc);
    if (mgc) pick.add(mgc);
    for (const c of list) { if (pick.size >= 3) break; pick.add(c); }
    sample.push(...pick);
  }
  console.log(`campuses ${byCampus.size}, sampled chapters ${sample.length} (incl. every NPHC/MGC where present)\n`);

  const fails: string[] = [];
  let checked = 0;
  const CONC = 10;
  const work = sample.slice();

  const runOne = async (ch: Ch) => {
    const campus = campusById.get(ch.campus_id);
    if (!campus?.slug) { fails.push(`${ch.slug}: campus has no slug`); return; }
    const orgName = ch.greek_org_id ? orgById.get(ch.greek_org_id) ?? "" : "";
    const nick = chapterShortName(orgName, ch.letters, ch.nickname);
    const url = chapterUrl(campus.slug, ch.slug);
    const label = `${campus.short_name ?? campus.name}/${ch.slug}`;

    // Canonical link + QR target (pure builders — what the buttons and the printed QR use).
    if (url !== `https://surviveaccounting.com/go/${campus.slug}/${ch.slug}`) fails.push(`${label}: chapterUrl wrong: ${url}`);
    const qr = flyerTarget({ schoolSlug: campus.slug, chapterSlug: ch.slug, schoolName: "", courseCode: null });
    if (qr !== `${url}?s=flyer`) fails.push(`${label}: QR target "${qr}" != "${url}?s=flyer"`);

    // GroupMe copy — nickname present in the claimed variant, designation in neither.
    const claimed = groupMeMessage({ claimed: true, shortName: nick, courseLabel: "ACC 000", url });
    const unclaimed = groupMeMessage({ claimed: false, shortName: nick, courseLabel: "ACC 000", url });
    if (ch.nickname && !claimed.includes(ch.nickname)) fails.push(`${label}: claimed GroupMe copy missing nickname "${ch.nickname}"`);
    const desig = (ch.chapter_designation ?? "").trim();
    const legit = `${orgName} ${nick}`.toLowerCase();
    if (desig.length > 2 && !legit.includes(desig.toLowerCase())) {
      if (claimed.includes(desig) || unclaimed.includes(desig)) fails.push(`${label}: designation "${desig}" in GroupMe copy`);
    }

    // Flyer SVG — renders, says "Shared by <nickname>", no designation.
    let svg = "";
    try {
      const res = await fetch(`${BASE}/api/flyer/${campus.slug}/${ch.slug}?f=svg`);
      if (res.status !== 200) { fails.push(`${label}: flyer SVG HTTP ${res.status}`); return; }
      svg = await res.text();
    } catch (e) { fails.push(`${label}: flyer fetch failed ${(e as Error).message}`); return; }
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const expectShared = `Shared by ${ch.nickname?.trim() || orgName}`;
    if (!svg.includes(esc(expectShared)) && !svg.includes(expectShared)) fails.push(`${label}: flyer missing "${expectShared}"`);
    if (desig.length > 2 && !legit.includes(desig.toLowerCase()) && (svg.includes(desig) || svg.includes(esc(desig)))) {
      fails.push(`${label}: designation "${desig}" on flyer`);
    }
    checked++;
  };

  await Promise.all(Array.from({ length: CONC }, async () => {
    while (work.length) { const ch = work.shift(); if (!ch) break; await runOne(ch); }
  }));

  console.log(`checked ${checked}/${sample.length}, failures ${fails.length}`);
  if (fails.length) {
    console.log(`\nFAILURES:`);
    for (const f of fails) console.log(`  ${f}`);
    process.exit(1);
  }
  console.log("SHARE SAMPLE PASSES — links canonical, QR targets correct, flyers say Shared by <nickname>, no designation anywhere.");
};

main().catch((e) => { console.error("VERIFY FAILED:", e); process.exit(1); });
