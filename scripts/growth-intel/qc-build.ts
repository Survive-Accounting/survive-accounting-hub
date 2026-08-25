// Build the V1 Contact Quality + King QC layer over already-discovered contacts.
// No scraping, no sending. Reads Campus Backfill's campus_council_contacts read-only.
//
//   bun run scripts/growth-intel/qc-build.ts          # dry run: prints plan, writes nothing
//   bun run scripts/growth-intel/qc-build.ts --apply  # writes advisors, links, qc rows
import { createClient } from "@supabase/supabase-js";
import { classifyContactType, contactDedupeKey } from "../../src/lib/growth-intel-extract";
const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const now = () => new Date().toISOString();

async function page(table: string, select: string, filter?: (b: any) => any): Promise<any[]> {
  const out: any[] = []; let from = 0;
  for (;;) {
    let b = db.from(table).select(select).range(from, from + 999);
    if (filter) b = filter(b);
    const { data, error } = await b;
    if (error) { console.error(`  ! ${table}: ${error.message}`); break; }
    const d = (data ?? []) as any[]; out.push(...d);
    if (d.length < 1000) break; from += 1000;
  }
  return out;
}
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const freemail = /@(gmail|yahoo|hotmail|outlook|aol|icloud|proton(mail)?|me|live|msn)\./i;
const roleLocal = /^(info|contact|hello|board|exec|officers?|president|vp|treasurer|secretary|membership|recruitment|admin|team|chapter|greek|fsl|scholarship|academic|ifc|phc|panhel|nphc|mgc)/i;

// ── §5/§6 freshness + eligibility + campaign classification ──────────────────
function classifyRow(r: {
  contact_source: string; contact_type: string | null; name: string | null; email: string | null;
  instagram: string | null; confidence: string | null; effective_term: string | null; entityKind: string;
}): { contact_type: string; freshness: string; eligible: boolean; reason: string | null; purpose: string } {
  let ct = (r.contact_type || "unknown").toLowerCase();
  // chapter named officer stored as student_officer -> chapter_exec
  if (ct === "student_officer" && r.entityKind === "chapter") ct = "chapter_exec";

  // campaign purpose
  const purpose =
    ct === "staff_advisor" ? "ADVISORY_ESCALATION"
    : r.entityKind === "club" ? "CAMPUS_REP_RECRUITMENT"
    : ct === "chapter_exec" ? "CHAPTER_SALES"
    : r.entityKind === "chapter" ? "STUDENT_DISTRIBUTION" // chapter IG / general
    : (ct === "role_inbox" || ct === "organization_general") ? "STUDENT_DISTRIBUTION"
    : ct === "student_officer" ? "STUDENT_DISTRIBUTION" // council officer
    : "UNKNOWN";

  // unknown type -> triage, not eligible
  if (ct === "unknown") return { contact_type: ct, freshness: "unknown", eligible: false, reason: "unclassified contact type — King triage", purpose: "UNKNOWN" };

  // §5: named student officer / chapter exec WITHOUT current-term evidence -> VERIFY_BEFORE_USE
  const named = !!(r.name && r.name.trim());
  if ((ct === "chapter_exec" || ct === "student_officer") && named && !r.effective_term) {
    return { contact_type: ct, freshness: "verify_before_use", eligible: false, reason: "named officer, no current-term evidence — verify before use", purpose };
  }
  if (r.confidence === "low") {
    return { contact_type: ct, freshness: "unknown", eligible: false, reason: "low-confidence source — needs review", purpose };
  }
  // stable classes: role inbox, org general, staff advisor, social account
  if (["role_inbox", "organization_general", "staff_advisor", "social_account"].includes(ct)) {
    return { contact_type: ct, freshness: "stable", eligible: true, reason: null, purpose };
  }
  // student officer WITH term (none today) -> current+eligible; else default stable/eligible for high-conf
  return { contact_type: ct, freshness: r.effective_term ? "current" : "stable", eligible: true, reason: null, purpose };
}

async function main() {
  console.log(`QC build — mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

  // ---- load contacts ----
  const gpc = await page("growth_public_contacts", "id,campus_id,entity_type,entity_id,category,contact_type,name,role,email,phone,instagram_url,website_url,confidence,is_current,effective_term,effective_year,source_url,source_type,last_verified_at,retrieved_at");
  const cc = await page("campus_council_contacts", "id,campus_id,council_type,contact_type,name,role,email,phone,instagram_url,website_url,confidence,is_current,effective_term,source_url,source_type,last_verified_at,retrieved_at");
  const clubs = await page("growth_business_clubs", "id,campus_id,category,name,general_email,instagram_url,website_url,confidence,source_url,source_type,last_verified_at,retrieved_at,effective_term");
  console.log(`loaded: growth_public_contacts=${gpc.length} campus_council_contacts=${cc.length} business_clubs=${clubs.length}`);

  // ---- (2) classify the 137 UNKNOWN in growth_public_contacts ----
  const unknowns = gpc.filter((r) => (r.contact_type || "unknown") === "unknown");
  let reclassified = 0;
  const gpcUpdates: Array<{ id: string; contact_type: string }> = [];
  for (const r of unknowns) {
    const isSocial = !!r.instagram_url && !r.email && !r.name;
    const nt = classifyContactType({ email: r.email, name: r.name, role: r.role, isSocial, isStaff: /advisor|adviser|staff|coordinator|director/i.test(r.role || "") });
    if (nt !== "unknown") { gpcUpdates.push({ id: r.id, contact_type: nt }); reclassified++; }
  }
  console.log(`UNKNOWN reclassified: ${reclassified}/${unknowns.length} (remaining unknown: ${unknowns.length - reclassified})`);
  if (APPLY) for (const u of gpcUpdates) await db.from("growth_public_contacts").update({ contact_type: u.contact_type, updated_at: now() }).eq("id", u.id);
  // reflect reclassification locally
  const reMap = new Map(gpcUpdates.map((u) => [u.id, u.contact_type]));
  for (const r of gpc) if (reMap.has(r.id)) r.contact_type = reMap.get(r.id);

  // ---- (1)(3) normalize shared advisors (email = identity; links preserve relationships) ----
  const advisorSources = [
    ...cc.filter((r) => r.contact_type === "staff_advisor" && r.email).map((r) => ({ ...r, _src: "campus_council_contacts", entity_type: "council" })),
    ...gpc.filter((r) => r.contact_type === "staff_advisor" && r.email).map((r) => ({ ...r, _src: "growth_public_contacts", entity_type: "chapter" })),
  ];
  const byEmail = new Map<string, any[]>();
  for (const a of advisorSources) { const k = a.email.toLowerCase(); (byEmail.get(k) ?? byEmail.set(k, []).get(k)!).push(a); }
  const sharedAdvisors = [...byEmail.entries()].filter(([, g]) => g.length > 1);
  console.log(`advisors: ${byEmail.size} distinct emails; ${sharedAdvisors.length} shared across >1 entity (collapses ${advisorSources.length} rows)`);

  const advisorIdByEmail = new Map<string, string>();
  if (APPLY) {
    for (const [email, group] of byEmail) {
      const rep = group.find((g) => g.name) ?? group[0];
      const councils = group.filter((g) => g.entity_type === "council").length;
      const chapters = group.filter((g) => g.entity_type === "chapter").length;
      // select-then-insert (email uniqueness is an expression index, not a PostgREST arbiter)
      let advId: string | undefined;
      const { data: existing } = await db.from("growth_advisors").select("id").ilike("email", email).maybeSingle();
      if (existing?.id) {
        advId = existing.id;
        await db.from("growth_advisors").update({ chapters_linked: chapters, councils_linked: councils, last_seen: now(), updated_at: now() }).eq("id", advId);
      } else {
        const { data: adv, error } = await db.from("growth_advisors").insert({
          name: rep.name || null, email, title: rep.role || null, primary_campus_id: rep.campus_id || null,
          source_url: rep.source_url || null, source_type: rep.source_type || null, confidence: "high",
          chapters_linked: chapters, councils_linked: councils, last_verified_at: rep.last_verified_at || null,
        }).select("id").maybeSingle();
        if (error || !adv) continue;
        advId = adv.id;
      }
      if (!advId) continue;
      advisorIdByEmail.set(email, advId);
      for (const g of group) {
        await db.from("growth_advisor_links").insert({
          advisor_id: advId, entity_type: g.entity_type, entity_id: g.entity_type === "chapter" ? g.entity_id : null,
          campus_id: g.campus_id, council_type: g.entity_type === "council" ? g.council_type : null,
          source_contact_source: g._src, source_contact_id: g.id, source_url: g.source_url || null,
        }).then(() => {}, () => {}); // ignore dup-link unique violations
      }
    }
    console.log(`advisors upserted: ${advisorIdByEmail.size}`);
  }

  // ---- (6) build QC rows for every contact source ----
  type QC = any;
  const qcRows: QC[] = [];
  let qcReclassified = 0;
  const pushQC = (contact_source: string, source_id: string, base: any, entityKind: string) => {
    // Classify UNKNOWN in the QC layer (works for Campus Backfill council rows too,
    // WITHOUT modifying the read-only source table).
    let contactType = base.contact_type;
    if (!contactType || contactType === "unknown") {
      const isSocial = !!base.instagram && !base.email && !base.name;
      const nt = classifyContactType({ email: base.email, name: base.name, role: base.role, isSocial, isStaff: /advisor|adviser|staff|coordinator|director/i.test(base.role || "") });
      if (nt !== "unknown") { contactType = nt; qcReclassified++; }
    }
    const c = classifyRow({ contact_source, contact_type: contactType, name: base.name, email: base.email, instagram: base.instagram, confidence: base.confidence, effective_term: base.effective_term, entityKind });
    qcRows.push({
      contact_source, source_id, campus_id: base.campus_id ?? null,
      entity_type: entityKind, entity_id: base.entity_id ?? null, council_type: base.council_type ?? null,
      campaign_purpose: c.purpose, contact_type: c.contact_type, name: base.name ?? null, role: base.role ?? null,
      email: base.email ?? null, instagram: base.instagram ?? null, source_url: base.source_url ?? null,
      source_type: base.source_type ?? null, confidence: base.confidence ?? null, last_verified_at: base.last_verified_at ?? null,
      effective_term: base.effective_term ?? null, effective_year: base.effective_year ?? null,
      freshness_status: c.freshness, outreach_eligible: c.eligible, review_reason: c.reason,
      qc_action: "pending", updated_at: now(),
    });
  };
  for (const r of gpc) pushQC("growth_public_contacts", r.id, { campus_id: r.campus_id, entity_id: r.entity_id, contact_type: r.contact_type, name: r.name, role: r.role, email: r.email, instagram: r.instagram_url, confidence: r.confidence, source_url: r.source_url, source_type: r.source_type, last_verified_at: r.last_verified_at, effective_term: r.effective_term, effective_year: r.effective_year }, r.entity_type);
  for (const r of cc) pushQC("campus_council_contacts", r.id, { campus_id: r.campus_id, council_type: r.council_type, contact_type: r.contact_type, name: r.name, role: r.role, email: r.email, instagram: r.instagram_url, confidence: r.confidence, source_url: r.source_url, source_type: r.source_type, last_verified_at: r.last_verified_at, effective_term: r.effective_term }, "council");
  for (const r of clubs) pushQC("growth_business_clubs", r.id, { campus_id: r.campus_id, entity_id: r.id, contact_type: "organization_general", name: r.name, email: r.general_email, instagram: r.instagram_url, confidence: r.confidence, source_url: r.source_url, source_type: r.source_type, last_verified_at: r.last_verified_at, effective_term: r.effective_term }, "club");

  console.log(`UNKNOWN classified in QC layer (all sources): ${qcReclassified}`);
  const elig = qcRows.filter((q) => q.outreach_eligible).length;
  const vbu = qcRows.filter((q) => q.freshness_status === "verify_before_use").length;
  const rev = qcRows.length - elig;
  console.log(`QC rows: ${qcRows.length}  eligible=${elig} (${Math.round(elig / qcRows.length * 100)}%)  needs_review=${rev} (${Math.round(rev / qcRows.length * 100)}%)  verify_before_use=${vbu}`);
  const byPurpose: Record<string, number> = {}; for (const q of qcRows) byPurpose[q.campaign_purpose] = (byPurpose[q.campaign_purpose] ?? 0) + 1;
  console.log("by campaign_purpose:", JSON.stringify(byPurpose));

  if (APPLY) {
    let n = 0;
    for (const b of chunk(qcRows, 500)) { const { error } = await db.from("growth_contact_qc").upsert(b, { onConflict: "contact_source,source_id" }); if (error) console.error("  ! qc upsert:", error.message); else n += b.length; }
    console.log(`growth_contact_qc upserted: ${n}`);
  } else {
    console.log("DRY RUN — nothing written. Re-run with --apply.");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
