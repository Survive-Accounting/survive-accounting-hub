// Greek 990 / Legal-Entity Intelligence — SEC pilot orchestrator.
//
//   bun run scripts/greek-990/run.ts --preflight            # ~15 mixed chapters, match-only report (no writes)
//   bun run scripts/greek-990/run.ts --preflight --write    # preflight + persist
//   bun run scripts/greek-990/run.ts --campus "Alabama"     # one campus (match + persist)
//   bun run scripts/greek-990/run.ts --all                  # every SEC chapter (match + persist)
//   ... add --enrich   to pull ProPublica filings for linked entities
//   ... add --parents  to link national parent entities
//   ... add --officers to extract officers from cached IRS 990 XML zips
//
// Idempotent & resumable: every write is an upsert on a natural key; failures are
// isolated per chapter and per campus.
import { loadStateGreek, type BmfRow, ALL_STATES } from "./lib/bmf";
import { buildOrgPhraseIndex, GREEK_WORDS, phraseAt, tokens } from "./lib/normalize";
import { matchChapter, recommendedAction, type Candidate } from "./lib/match";
import {
  allOrgIdentities, loadCampusChapters, loadCampusRef, loadOrgIndex, type ChapterRow,
} from "./lib/roster";
import { fetchOrg } from "./lib/propublica";
import {
  upsertCandidate, upsertFilings, upsertLegalEntity, upsertLink, upsertOfficers,
  upsertStatus, upsert990N,
} from "./lib/persist";
import { extractOfficersForEins } from "./lib/xml-index";

// Canonical SEC campuses (resolved to the roster ids that actually carry chapters).
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
const WRITE = has("--write") || has("--campus") || has("--all"); // preflight is read-only unless --write
const ENRICH = has("--enrich");
const PARENTS = has("--parents");
const OFFICERS = has("--officers");
const LIMIT = val("--limit") ? Number(val("--limit")) : undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── in-memory Greek BMF pools, lazily loaded per state ───────────────────────
const poolCache = new Map<string, BmfRow[]>();
async function greekPool(state: string): Promise<BmfRow[]> {
  if (!poolCache.has(state)) poolCache.set(state, await loadStateGreek(state));
  return poolCache.get(state)!;
}

interface RunStats {
  chapters: 0; withHigh: number; withMedium: number; withNone: number;
  highLinks: number; mediumCands: number; entities: Set<string>;
}

async function processChapter(
  ch: ChapterRow, campus: { id: string; name: string; state: string }, campusRef: any,
  phraseIndex: string[][], linkedEins: Set<string>, dry: boolean,
): Promise<{ high: number; medium: number; log: string[] }> {
  const cands = matchChapter({
    chapterId: ch.id, orgName: ch.orgName, orgGreekTokens: ch.orgGreek,
    designation: ch.chapter_designation || undefined, council: ch.council || undefined, campus: campusRef,
  }, await greekPool(campus.state), phraseIndex);

  const high = cands.filter((c) => c.confidence === "HIGH_CONFIDENCE");
  const medium = cands.filter((c) => c.confidence === "MEDIUM_CONFIDENCE");
  const low = cands.filter((c) => c.confidence === "LOW_CONFIDENCE");
  const log: string[] = [];

  if (!dry) {
    let entitiesLinked = 0;
    for (const c of high) {
      try {
        const eid = await upsertLegalEntity(c, "IRS_EO_BMF", ch.greek_org_id);
        await upsertLink(ch.id, eid, c, "BMF_NAME_GEO");
        await upsertCandidate(ch.id, c, "AUTO_LINK", "LINKED");
        linkedEins.add(c.ein);
        entitiesLinked++;
      } catch (e: any) { log.push(`  ! link failed ${c.ein}: ${e.message}`); }
    }
    for (const c of medium) {
      try { await upsertCandidate(ch.id, c, "REVIEW", "NEW"); } catch { /* isolated */ }
    }
    // status
    const status = high.length ? "ENTITY_MATCHED" : medium.length ? "NEEDS_REVIEW" : cands.length ? "CANDIDATES_FOUND" : "NO_ENTITY_FOUND";
    await upsertStatus({
      chapter_id: ch.id, campus_id: campus.id, status,
      candidates_found: cands.length, entities_linked: entitiesLinked,
      run_meta: { high: high.length, medium: medium.length, low: low.length, org: ch.orgName },
      success: true,
    });
  }

  const tag = high.length ? "HIGH" : medium.length ? "MED " : cands.length ? "LOW " : "NONE";
  log.unshift(`  [${tag}] ${ch.orgName} (${ch.council})${ch.chapter_designation ? " desig=" + ch.chapter_designation : ""} → ${high.length} link / ${medium.length} review / ${low.length} low`);
  for (const c of high.slice(0, 5)) log.push(`      ✓ ${c.entityType} :: ${c.legalName} [${c.city}] ein=${c.ein} score=${c.score} | ${c.locationEvidence}`);
  for (const c of medium.slice(0, 2)) log.push(`      ? ${c.entityType} :: ${c.legalName} [${c.city}] ein=${c.ein} score=${c.score}`);
  return { high: high.length, medium: medium.length, log };
}

// ── National-parent pass: link each org's central entity to its SEC chapters ──
async function nationalParentPass(orgToChapters: Map<string, ChapterRow[]>, orgIdx: Map<string, any>) {
  console.log(`\n── National-parent pass (${orgToChapters.size} orgs) ──`);
  // Load Greek pools for all states once (small after filtering).
  const allRows: BmfRow[] = [];
  for (const st of ALL_STATES) allRows.push(...(await greekPool(st)));
  let linked = 0;
  for (const [orgId, chapters] of orgToChapters) {
    const org = orgIdx.get(orgId);
    if (!org) continue;
    const orgTok = org.nameTokens.filter((w: string) => GREEK_WORDS.has(w));
    if (!orgTok.length) continue;
    // central org = maximal-run name match + affiliation 6 (central), highest income.
    let best: BmfRow | null = null;
    for (const r of allRows) {
      if (r.status !== "01" || r.affiliation !== "6") continue;
      const hay = tokens(r.name);
      const at = phraseAt(hay, orgTok);
      if (at < 0) continue;
      const s = at - orgTok.length;
      if (s > 0 && GREEK_WORDS.has(hay[s - 1])) continue;
      if (at < hay.length && GREEK_WORDS.has(hay[at])) continue;
      if (!best || r.income_amt > best.income_amt) best = r;
    }
    if (!best) continue;
    const c: Candidate = {
      ein: best.ein, legalName: best.name, city: best.city, state: best.state, zip: best.zip,
      entityType: "NATIONAL_PARENT", entityTypeConfidence: "HIGH", entityTypeEvidence: "BMF affiliation=6 (central org)",
      score: 90, confidence: "HIGH_CONFIDENCE",
      nameEvidence: `national org "${org.name}" central entity`, locationEvidence: `HQ ${best.city}, ${best.state}`,
      genEvidence: best.group && best.group !== "0000" ? `parent of group ${best.group}` : "", designationEvidence: "",
      subsection: best.subsection, affiliation: best.affiliation, gen: best.group, ntee: best.ntee, ruling: best.ruling,
      assetAmt: best.asset_amt, incomeAmt: best.income_amt, revenueAmt: best.revenue_amt, bmf: best,
    };
    try {
      const eid = await upsertLegalEntity(c, "IRS_EO_BMF", orgId);
      for (const ch of chapters) {
        await upsertLink(ch.id, eid, c, "GROUP_EXEMPTION");
        await upsertCandidate(ch.id, c, "AUTO_LINK", "LINKED");
      }
      linked++;
      console.log(`  ✓ ${org.name} → ${best.name} [${best.city}, ${best.state}] GEN=${best.group} (→ ${chapters.length} chapters)`);
    } catch (e: any) { console.log(`  ! ${org.name}: ${e.message}`); }
  }
  console.log(`National parents linked: ${linked}`);
}

// ── ProPublica enrichment: filings for every linked entity ───────────────────
async function enrichPass(eins: Set<string>) {
  console.log(`\n── Enrichment pass (${eins.size} entities via ProPublica) ──`);
  const idByEin = new Map<string, string>();
  const rows = await (await import("./_db")).dataQuery<any>(`greek_legal_entity?select=id,ein`);
  for (const r of rows) idByEin.set(r.ein, r.id);
  let done = 0, filings = 0, withRich = 0;
  for (const ein of eins) {
    const eid = idByEin.get(ein);
    if (!eid) continue;
    try {
      const org = await fetchOrg(ein);
      if (org) {
        const n = await upsertFilings(eid, ein, org.filings);
        filings += n;
        if (org.filings.length) withRich++;
        const nYears = org.filingsWithoutData.filter((f) => f.form_type === "990N").map((f) => f.tax_year);
        if (nYears.length) await upsert990N(eid, ein, nYears);
      }
    } catch (e: any) { console.log(`  ! ${ein}: ${e.message}`); }
    done++;
    if (done % 25 === 0) console.log(`  …${done}/${eins.size} (${filings} filings)`);
    await sleep(150); // be polite to ProPublica
  }
  console.log(`Enriched ${done} entities → ${filings} filings; ${withRich} had rich (990/990-EZ) data.`);
}

// ── Officer extraction from cached IRS 990 XML zips (targeted to linked EINs) ─
async function officerPass(eins: Set<string>) {
  console.log(`\n── Officer pass (IRS 990 XML, ${eins.size} target EINs) ──`);
  const db = await import("./_db");
  const rows = await db.dataQuery<any>(`greek_legal_entity?select=id,ein,entity_type`);
  const meta = new Map<string, { id: string; type: string }>();
  for (const r of rows) meta.set(r.ein, { id: r.id, type: r.entity_type });
  const found = await extractOfficersForEins(eins);
  let people = 0, entities = 0;
  for (const [ein, filings] of found) {
    const m = meta.get(ein);
    if (!m) continue;
    entities++;
    for (const fil of filings) {
      const n = await upsertOfficers(m.id, ein, m.type, fil.taxYear, fil.officers, "IRS_990_XML");
      people += n;
    }
  }
  console.log(`Officers: ${people} person-records across ${entities} entities (from cached zips).`);
}

async function main() {
  const orgIdx = await loadOrgIndex();
  const phraseIndex = buildOrgPhraseIndex(allOrgIdentities(orgIdx));

  let campuses = SEC_CAMPUSES;
  if (val("--campus")) {
    const q = val("--campus")!.toLowerCase();
    campuses = SEC_CAMPUSES.filter((c) => c.name.toLowerCase().includes(q));
  }

  const linkedEins = new Set<string>();
  const orgToChapters = new Map<string, ChapterRow[]>();
  let totChapters = 0, totHigh = 0, totMed = 0, totNone = 0;

  // Preflight: a fixed mixed sample across councils/campuses (brief §25).
  let preflightPicks: { campus: typeof SEC_CAMPUSES[number]; org: string }[] = [];
  if (PREFLIGHT) {
    preflightPicks = [
      { campus: SEC_CAMPUSES[0], org: "Phi Delta Theta" },      // big IFC frat, house corp likely
      { campus: SEC_CAMPUSES[0], org: "Chi Omega" },            // Panhellenic, house corp
      { campus: SEC_CAMPUSES[0], org: "Sigma Nu" },             // messy legal naming
      { campus: SEC_CAMPUSES[10], org: "Kappa Alpha Order" },   // Ole Miss IFC
      { campus: SEC_CAMPUSES[10], org: "Delta Gamma" },         // Ole Miss Panhellenic
      { campus: SEC_CAMPUSES[3], org: "Pi Kappa Alpha" },       // Florida, group-exemption candidate
      { campus: SEC_CAMPUSES[3], org: "Alpha Phi" },            // Florida Panhellenic
      { campus: SEC_CAMPUSES[13], org: "Sigma Chi" },           // Texas IFC
      { campus: SEC_CAMPUSES[13], org: "Kappa Kappa Gamma" },   // Texas Panhellenic
      { campus: SEC_CAMPUSES[15], org: "Beta Theta Pi" },       // Vanderbilt IFC
      { campus: SEC_CAMPUSES[4], org: "Alpha Omicron Pi" },     // Georgia Panhellenic
      { campus: SEC_CAMPUSES[8], org: "Sigma Alpha Epsilon" },  // Missouri IFC
      { campus: SEC_CAMPUSES[6], org: "Phi Mu" },               // LSU Panhellenic
      { campus: SEC_CAMPUSES[1], org: "Kappa Sigma" },          // Arkansas IFC
      { campus: SEC_CAMPUSES[11], org: "Zeta Tau Alpha" },      // South Carolina Panhellenic
    ];
  }

  for (const campus of campuses) {
    const campusRef = await loadCampusRef(campus.id);
    if (!campusRef) { console.log(`! campus ${campus.name} not found`); continue; }
    let chapters = await loadCampusChapters(campus.id, orgIdx);
    if (PREFLIGHT) {
      const orgs = new Set(preflightPicks.filter((p) => p.campus.id === campus.id).map((p) => p.org));
      chapters = chapters.filter((c) => orgs.has(c.orgName));
      if (!chapters.length) continue;
    }
    if (LIMIT) chapters = chapters.slice(0, LIMIT);

    console.log(`\n════ ${campus.name} [${campus.state}] — ${chapters.length} chapters ════`);
    for (const ch of chapters) {
      totChapters++;
      if (ch.greek_org_id) {
        if (!orgToChapters.has(ch.greek_org_id)) orgToChapters.set(ch.greek_org_id, []);
        orgToChapters.get(ch.greek_org_id)!.push(ch);
      }
      try {
        const r = await processChapter(ch, campus, campusRef, phraseIndex, linkedEins, PREFLIGHT && !WRITE);
        for (const l of r.log) console.log(l);
        if (r.high) totHigh++; else if (r.medium) totMed++; else totNone++;
      } catch (e: any) {
        console.log(`  ! ${ch.orgName} FAILED: ${e.message}`);
        if (WRITE) await upsertStatus({ chapter_id: ch.id, campus_id: campus.id, status: "FAILED", error: e.message }).catch(() => {});
      }
    }
  }

  console.log(`\n════ MATCH SUMMARY ════`);
  console.log(`chapters=${totChapters}  withHIGH=${totHigh}  withMEDIUM=${totMed}  none=${totNone}  uniqueLinkedEINs=${linkedEins.size}`);

  if (PARENTS && WRITE) await nationalParentPass(orgToChapters, orgIdx);
  if (ENRICH && WRITE) {
    // enrich all linked entities (re-read from DB so re-runs work standalone too)
    const db = await import("./_db");
    const rows = await db.dataQuery<any>(`greek_legal_entity?select=ein`);
    const eins = new Set<string>(rows.map((r: any) => r.ein));
    await enrichPass(eins);
  }
  if (OFFICERS && WRITE) {
    const db = await import("./_db");
    const rows = await db.dataQuery<any>(`greek_legal_entity?select=ein`);
    await officerPass(new Set<string>(rows.map((r: any) => r.ein)));
  }
  console.log(`\nDone.`);
}

// Only run the orchestrator when invoked directly — importing this module (e.g. for
// SEC_CAMPUSES in export.ts) must NOT kick off a full run.
if (import.meta.main) await main();
