// Greek 990 / Legal-Entity Intelligence — orchestrator (SEC + nationwide).
//
//   bun run scripts/greek-990/run.ts --preflight                       # read-only sample
//   bun run scripts/greek-990/run.ts --all --write --parents --gen --enrich   # SEC (16 campuses)
//   bun run scripts/greek-990/run.ts --nationwide --write --parents --gen --resume
//                                                                       # all campuses, resumable
//   flags: --enrich (ProPublica filings) --officers (IRS XML) --resume (skip done) --limit N
//
// Batched, idempotent, resumable: writes are chunked bulk upserts; a chapter with a prior
// success is skipped under --resume; failures are isolated per chapter and per campus.
import { loadStateGreek, type BmfRow, ALL_STATES, US_STATES } from "./lib/bmf";
import { buildOrgPhraseIndex, GREEK_WORDS, phraseAt, tokens } from "./lib/normalize";
import { matchChapter, recommendedAction, type Candidate } from "./lib/match";
import {
  allOrgIdentities, loadCampusChapters, loadCampusRef, loadOrgIndex, type ChapterRow,
} from "./lib/roster";
import { fetchOrg } from "./lib/propublica";
import {
  bulkUpsert, bulkUpsertEntities, candidateRow, entityRow, linkRow, upsertFilings,
  upsertOfficers, upsert990N,
} from "./lib/persist";
import { dataQuery, nowIso } from "./_db";
import { buildCampusCityIndex, enumerateGen, type CampusLite } from "./lib/gen";
import { extractOfficersForEins } from "./lib/xml-index";

export const SEC_CAMPUSES: { id: string; name: string; state: string }[] = [
  { id: "b3af67c6-99a5-4677-83d5-aa7d11a89c17", name: "University of Alabama", state: "AL" },
  { id: "e631c8de-37a3-4aae-a948-a64bd20ea4c5", name: "University of Arkansas", state: "AR" },
  { id: "e330e87c-5467-4c05-9d3d-6cd2398de036", name: "Auburn University", state: "AL" },
  { id: "4c5126b1-3fe0-48fe-a1db-1e41d06e4642", name: "University of Florida", state: "FL" },
  { id: "3f570e37-5394-4058-baab-508948befedb", name: "University of Georgia", state: "GA" },
  { id: "ae339230-577e-4569-a7d1-d1e45d1cfe91", name: "University of Kentucky", state: "KY" },
  { id: "698dd98f-dd92-46c1-8f28-e930568cb15d", name: "Louisiana State University", state: "LA" },
  { id: "95246fc8-1ce6-409e-b454-d03c82766719", name: "Mississippi State University", state: "MS" },
  { id: "f16686c2-edc6-43f8-9638-6890f52c829a", name: "University of Missouri", state: "MO" },
  { id: "91e62f9c-43b0-41f3-a84d-002824754da6", name: "University of Oklahoma", state: "OK" },
  { id: "7b92a320-b196-43f2-a241-77a0805816fe", name: "University of Mississippi", state: "MS" },
  { id: "5f5bd18d-b92f-4d56-aced-23bce4c983d5", name: "University of South Carolina", state: "SC" },
  { id: "9c4775be-7d82-4a3e-840c-349c5e15d8e8", name: "University of Tennessee, Knoxville", state: "TN" },
  { id: "faad6039-be72-4f5c-8ad5-ca7b95e2889f", name: "University of Texas at Austin", state: "TX" },
  { id: "92e4a5d9-eeb3-4065-ac8a-5a4390fbc584", name: "Texas A&M University", state: "TX" },
  { id: "972451c3-bc5e-48d7-9f88-868a55378efa", name: "Vanderbilt University", state: "TN" },
];

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const PREFLIGHT = has("--preflight");
const NATIONWIDE = has("--nationwide");
const WRITE = has("--write") || has("--campus") || has("--all") || NATIONWIDE;
const ENRICH = has("--enrich");
const PARENTS = has("--parents");
const GEN = has("--gen");
const OFFICERS = has("--officers");
const RESUME = has("--resume");
const LIMIT = val("--limit") ? Number(val("--limit")) : undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const poolCache = new Map<string, BmfRow[]>();
async function greekPool(state: string): Promise<BmfRow[]> {
  const st = (state || "").trim().toUpperCase();
  if (!poolCache.has(st)) {
    // Non-US / empty state (international campuses) has no EO BMF file — treat as empty pool.
    try { poolCache.set(st, st ? await loadStateGreek(st) : []); }
    catch { poolCache.set(st, []); }
  }
  return poolCache.get(st)!;
}
function allLoadedRows(): BmfRow[] {
  const out: BmfRow[] = [];
  for (const rows of poolCache.values()) out.push(...rows);
  return out;
}

// Shared indexes built during the main loop (for the GEN pass).
const campusLites: CampusLite[] = [];
const chapterByCampusOrg = new Map<string, string>();
const designationByCampusOrg = new Map<string, string>();
const orgToChapters = new Map<string, ChapterRow[]>();
const linkedEins = new Set<string>();

// ── National-parent + GEN enumeration (batched) ──────────────────────────────
async function parentAndGenPass(orgIdx: Map<string, any>) {
  console.log(`\n── National-parent pass (${orgToChapters.size} orgs) ──`);
  for (const st of (NATIONWIDE ? US_STATES : ALL_STATES)) await greekPool(st);
  const all = allLoadedRows();
  const parentByOrg = new Map<string, { row: BmfRow }>();
  const parentEntityRows: any[] = [];
  const parentLinks: { chapterId: string; ein: string; c: Candidate; method: string }[] = [];
  const parentCandidates: any[] = [];

  for (const [orgId, chapters] of orgToChapters) {
    const org = orgIdx.get(orgId);
    if (!org) continue;
    const orgTok = org.nameTokens.filter((w: string) => GREEK_WORDS.has(w));
    if (!orgTok.length) continue;
    let best: BmfRow | null = null;
    for (const r of all) {
      if (r.status !== "01" || r.affiliation !== "6") continue;
      const hay = tokens(r.name); const at = phraseAt(hay, orgTok);
      if (at < 0) continue;
      const s = at - orgTok.length;
      if (s > 0 && GREEK_WORDS.has(hay[s - 1])) continue;
      if (at < hay.length && GREEK_WORDS.has(hay[at])) continue;
      if (!best || r.income_amt > best.income_amt) best = r;
    }
    if (!best) continue;
    parentByOrg.set(orgId, { row: best });
    const c = parentCandidate(org.name, best);
    parentEntityRows.push(entityRow(c, "IRS_EO_BMF", orgId));
    for (const ch of chapters) { parentLinks.push({ chapterId: ch.id, ein: best.ein, c, method: "GROUP_EXEMPTION" }); parentCandidates.push(candidateRow(ch.id, c, "AUTO_LINK", "LINKED")); }
  }
  const einToId = await bulkUpsertEntities(parentEntityRows);
  await bulkUpsert("greek_chapter_legal_entity", parentLinks.filter((l) => einToId.get(l.ein)).map((l) => linkRow(l.chapterId, einToId.get(l.ein)!, l.c, l.method)), "chapter_id,legal_entity_id");
  await bulkUpsert("greek_990_entity_candidate", parentCandidates, "chapter_id,candidate_ein");
  console.log(`National parents linked: ${parentByOrg.size}`);

  if (!GEN) return;
  console.log(`\n── GEN subordinate enumeration ──`);
  const cityIndex = buildCampusCityIndex(campusLites);
  const genEntityRows: any[] = [];
  const genLinks: { chapterId: string; ein: string; c: Candidate; method: string }[] = [];
  const genCandidates: any[] = [];
  let genLinkCount = 0, orgsWithGen = 0;
  for (const [orgId, { row: parent }] of parentByOrg) {
    if (!parent.group || parent.group === "0000") continue;
    orgsWithGen++;
    const org = orgIdx.get(orgId);
    const links = enumerateGen({
      orgId, orgName: org.name, gen: parent.group, parentEin: parent.ein,
      allGreekRows: all, cityIndex, chapterByCampusOrg, designationByCampusOrg,
    });
    for (const l of links) {
      genEntityRows.push(entityRow(l.candidate, "IRS_EO_BMF", orgId));
      genLinks.push({ chapterId: l.chapterId, ein: l.candidate.ein, c: l.candidate, method: "GROUP_EXEMPTION" });
      genCandidates.push(candidateRow(l.chapterId, l.candidate, "AUTO_LINK", "LINKED"));
      linkedEins.add(l.candidate.ein);
      genLinkCount++;
    }
  }
  const genEinToId = await bulkUpsertEntities(genEntityRows);
  await bulkUpsert("greek_chapter_legal_entity", genLinks.filter((l) => genEinToId.get(l.ein)).map((l) => linkRow(l.chapterId, genEinToId.get(l.ein)!, l.c, l.method)), "chapter_id,legal_entity_id");
  await bulkUpsert("greek_990_entity_candidate", genCandidates, "chapter_id,candidate_ein");
  console.log(`GEN enumeration: ${orgsWithGen} orgs with GEN → ${genLinkCount} authority-backed subordinate links.`);
}

function parentCandidate(orgName: string, best: BmfRow): Candidate {
  return {
    ein: best.ein, legalName: best.name, city: best.city, state: best.state, zip: best.zip,
    entityType: "NATIONAL_PARENT", entityTypeConfidence: "HIGH", entityTypeEvidence: "BMF affiliation=6 (central org)",
    score: 90, confidence: "HIGH_CONFIDENCE",
    nameEvidence: `national org "${orgName}" central entity`, locationEvidence: `HQ ${best.city}, ${best.state}`,
    genEvidence: best.group && best.group !== "0000" ? `parent of group ${best.group}` : "", designationEvidence: "",
    subsection: best.subsection, affiliation: best.affiliation, gen: best.group, ntee: best.ntee, ruling: best.ruling,
    assetAmt: best.asset_amt, incomeAmt: best.income_amt, revenueAmt: best.revenue_amt, bmf: best,
  };
}

async function enrichPass() {
  const rows = await dataQuery<any>(`greek_legal_entity?select=id,ein`);
  console.log(`\n── Enrichment pass (${rows.length} entities via ProPublica) ──`);
  let done = 0, filings = 0;
  for (const { id, ein } of rows) {
    try {
      const org = await fetchOrg(ein);
      if (org) {
        filings += await upsertFilings(id, ein, org.filings);
        const nYears = org.filingsWithoutData.filter((f) => f.form_type === "990N").map((f) => f.tax_year);
        if (nYears.length) await upsert990N(id, ein, nYears);
      }
    } catch (e: any) { /* isolated */ }
    if (++done % 100 === 0) console.log(`  …${done}/${rows.length} (${filings} filings)`);
    await sleep(120);
  }
  console.log(`Enriched ${done} entities → ${filings} filings.`);
}

async function officerPass() {
  const rows = await dataQuery<any>(`greek_legal_entity?select=id,ein,entity_type`);
  const meta = new Map(rows.map((r: any) => [r.ein, { id: r.id, type: r.entity_type }]));
  const eins = new Set<string>(rows.map((r: any) => r.ein));
  console.log(`\n── Officer pass (IRS 990 XML, ${eins.size} EINs) ──`);
  const found = await extractOfficersForEins(eins);
  let people = 0;
  for (const [ein, filings] of found) {
    const m = meta.get(ein); if (!m) continue;
    for (const fil of filings) people += await upsertOfficers(m.id, ein, m.type, fil.taxYear, fil.officers, "IRS_990_XML");
  }
  console.log(`Officers: ${people} records.`);
}

async function selectCampuses(): Promise<{ id: string; name: string; state: string }[]> {
  if (val("--campus")) { const q = val("--campus")!.toLowerCase(); return SEC_CAMPUSES.filter((c) => c.name.toLowerCase().includes(q)); }
  if (NATIONWIDE) {
    // every campus that hosts ≥1 social chapter
    const rows = await dataQuery<any>(`campus_greek_chapters?archived_at=is.null&select=campus_id,council`);
    const social = new Set<string>();
    for (const r of rows) if (["IFC", "PANHELLENIC", "NPHC", "MGC"].includes((r.council || "").toUpperCase())) social.add(r.campus_id);
    const campuses = await dataQuery<any>(`campuses?id=in.(${[...social].join(",")})&select=id,name,canonical_name,display_name,state`);
    return campuses.map((c: any) => ({ id: c.id, name: c.canonical_name || c.name || c.display_name || "", state: c.state || "" }));
  }
  return SEC_CAMPUSES;
}

async function main() {
  const orgIdx = await loadOrgIndex();
  const phraseIndex = buildOrgPhraseIndex(allOrgIdentities(orgIdx));
  let campuses = await selectCampuses();

  // resume: skip campuses whose chapters were all already processed
  let doneChapters = new Set<string>();
  if (RESUME) {
    const st = await dataQuery<any>(`greek_chapter_990_status?last_success_at=not.is.null&select=chapter_id`);
    doneChapters = new Set(st.map((r: any) => r.chapter_id));
    console.log(`Resume: ${doneChapters.size} chapters already processed.`);
  }

  const preflightPicks = PREFLIGHT ? [
    { id: SEC_CAMPUSES[0].id, org: "Phi Delta Theta" }, { id: SEC_CAMPUSES[0].id, org: "Chi Omega" },
    { id: SEC_CAMPUSES[10].id, org: "Kappa Alpha Order" }, { id: SEC_CAMPUSES[3].id, org: "Pi Kappa Alpha" },
    { id: SEC_CAMPUSES[3].id, org: "Alpha Phi" }, { id: SEC_CAMPUSES[13].id, org: "Sigma Chi" },
    { id: SEC_CAMPUSES[13].id, org: "Kappa Kappa Gamma" }, { id: SEC_CAMPUSES[0].id, org: "Kappa Kappa Gamma" },
  ] : [];

  let tChapters = 0, tHigh = 0, tMed = 0, tNone = 0;
  let ci = 0;
  for (const campus of campuses) {
    ci++;
    const campusRef = await loadCampusRef(campus.id);
    if (!campusRef) continue;
    campusLites.push({ id: campus.id, city: campusRef.city, state: campusRef.state });
    let chapters = await loadCampusChapters(campus.id, orgIdx);
    if (PREFLIGHT) { const orgs = new Set(preflightPicks.filter((p) => p.id === campus.id).map((p) => p.org)); chapters = chapters.filter((c) => orgs.has(c.orgName)); if (!chapters.length) continue; }
    if (RESUME) chapters = chapters.filter((c) => !doneChapters.has(c.id));
    if (LIMIT) chapters = chapters.slice(0, LIMIT);
    if (!chapters.length) continue;

    const merged = { ...campus, city: campusRef.city, aliases: campusRef.aliases, nameTokens: campusRef.nameTokens, coreTokens: campusRef.coreTokens };
    // stash the resolved ref for matchOne via campusLites lookup is not needed; pass through merged
    const r = await processCampusWrap(merged, chapters, phraseIndex, PREFLIGHT && !WRITE);
    tChapters += r.chapters; tHigh += r.high; tMed += r.med; tNone += r.none;
    if (NATIONWIDE && ci % 25 === 0) console.log(`  …${ci}/${campuses.length} campuses (${tChapters} chapters, ${tHigh} HIGH)`);
    else if (!NATIONWIDE) console.log(`════ ${campus.name} [${campus.state}] — ${chapters.length} chapters → ${r.high} HIGH / ${r.med} review / ${r.none} none ════`);
  }

  console.log(`\n════ MATCH SUMMARY ════\nchapters=${tChapters} withHIGH=${tHigh} withMEDIUM=${tMed} none=${tNone} uniqueLinkedEINs=${linkedEins.size}`);
  if (PARENTS && WRITE) await parentAndGenPass(orgIdx);
  if (ENRICH && WRITE) await enrichPass();
  if (OFFICERS && WRITE) await officerPass();
  console.log(`\nDone.`);
}

// wrapper so campusRef (with city/tokens) reaches matchOne
async function processCampusWrap(campusMerged: any, chapters: ChapterRow[], phraseIndex: string[][], dry: boolean) {
  const pool = await greekPool(campusMerged.state);
  const entityRows: any[] = [];
  const pendingLinks: { chapterId: string; ein: string; c: Candidate; method: string }[] = [];
  const candidateRows: any[] = [];
  const statusRows: any[] = [];
  let high = 0, med = 0, none = 0;
  for (const ch of chapters) {
    if (ch.greek_org_id) {
      (orgToChapters.get(ch.greek_org_id) || orgToChapters.set(ch.greek_org_id, []).get(ch.greek_org_id))!.push(ch);
      chapterByCampusOrg.set(`${campusMerged.id}|${ch.greek_org_id}`, ch.id);
      if (ch.chapter_designation) designationByCampusOrg.set(`${campusMerged.id}|${ch.greek_org_id}`, ch.chapter_designation);
    }
    let cands: Candidate[] = [];
    try {
      cands = matchChapter({ chapterId: ch.id, orgName: ch.orgName, orgGreekTokens: ch.orgGreek, designation: ch.chapter_designation || undefined, council: ch.council || undefined, campus: campusMerged }, pool, phraseIndex);
    } catch { cands = []; }
    const h = cands.filter((c) => c.confidence === "HIGH_CONFIDENCE");
    const m = cands.filter((c) => c.confidence === "MEDIUM_CONFIDENCE");
    const lo = cands.filter((c) => c.confidence === "LOW_CONFIDENCE");
    if (h.length) high++; else if (m.length) med++; else none++;
    if (!dry) {
      for (const c of h) { entityRows.push(entityRow(c, "IRS_EO_BMF", ch.greek_org_id)); pendingLinks.push({ chapterId: ch.id, ein: c.ein, c, method: "BMF_NAME_GEO" }); candidateRows.push(candidateRow(ch.id, c, "AUTO_LINK", "LINKED")); linkedEins.add(c.ein); }
      for (const c of m) candidateRows.push(candidateRow(ch.id, c, "REVIEW", "NEW"));
      const status = h.length ? "ENTITY_MATCHED" : m.length ? "NEEDS_REVIEW" : lo.length ? "CANDIDATES_FOUND" : "NO_ENTITY_FOUND";
      statusRows.push({ chapter_id: ch.id, campus_id: campusMerged.id, status, candidates_found: h.length + m.length, entities_linked: h.length, run_meta: { high: h.length, medium: m.length, low: lo.length, org: ch.orgName }, last_run_at: nowIso(), last_success_at: nowIso(), updated_at: nowIso() });
    } else {
      const tag = h.length ? "HIGH" : m.length ? "MED " : cands.length ? "LOW " : "NONE";
      console.log(`  [${tag}] ${ch.orgName} (${ch.council}) → ${h.length} link / ${m.length} review`);
      for (const c of h.slice(0, 4)) console.log(`      ✓ ${c.entityType} :: ${c.legalName} [${c.city}] score=${c.score}`);
    }
  }
  if (!dry) {
    const einToId = await bulkUpsertEntities(entityRows);
    await bulkUpsert("greek_chapter_legal_entity", pendingLinks.filter((l) => einToId.get(l.ein)).map((l) => linkRow(l.chapterId, einToId.get(l.ein)!, l.c, l.method)), "chapter_id,legal_entity_id");
    await bulkUpsert("greek_990_entity_candidate", candidateRows, "chapter_id,candidate_ein");
    await bulkUpsert("greek_chapter_990_status", statusRows, "chapter_id");
  }
  return { high, med, none, chapters: chapters.length };
}

if (import.meta.main) await main();
