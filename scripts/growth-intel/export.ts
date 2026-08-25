// Export §19 deliverables from the live tables for the test campuses:
//   COUNCIL_CONTACT_SAMPLE.csv       (read-only from Campus Backfill)
//   GREEK_CHAPTER_CONTACT_SAMPLE.csv (growth_public_contacts, entity_type=chapter)
//   BUSINESS_CLUB_SAMPLE.csv         (growth_business_clubs)
// and prints a metrics summary (coverage / counts / IG handles / academic-chair
// contacts) used to write GROWTH_CONTACT_INTEL_AUDIT.md.
//
//   bun run scripts/growth-intel/export.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const campuses: Array<{ id: string; name: string; kind?: string }> = JSON.parse(readFileSync("scripts/growth-intel/campuses.json", "utf8")).campuses;
const ids = campuses.map((c) => c.id);
const nameOf = (id: string) => campuses.find((c) => c.id === id)?.name ?? id;

const csv = (rows: any[], cols: string[]) => {
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
};

async function all(table: string, sel: string, order?: string) {
  let q = db.from(table).select(sel).in("campus_id", ids);
  if (order) q = q.order(order);
  const { data, error } = await q;
  if (error) {
    console.error(`  ! ${table}: ${error.message}`);
    return [] as any[];
  }
  return (data ?? []) as any[];
}

async function main() {
  const council = await all("campus_council_contacts", "campus_id,council_type,contact_type,name,role,email,phone,instagram_url,website_url,source_url,source_type,confidence,is_current,retrieved_at", "council_type");
  const chapter = await all("growth_public_contacts", "campus_id,entity_type,entity_id,category,contact_type,name,role,email,phone,instagram_url,website_url,confidence,is_current,source_url,source_type,retrieved_at");
  const clubs = await all("growth_business_clubs", "campus_id,category,name,website_url,instagram_url,facebook_url,general_email,confidence,source_url,source_type,retrieved_at", "category");
  const status = await all("growth_discovery_status", "campus_id,category,entity_id,status,results_found,last_attempted_at");

  const chapterOnly = chapter.filter((r) => r.entity_type === "chapter");
  const clubContacts = chapter.filter((r) => r.entity_type === "club");

  writeFileSync("COUNCIL_CONTACT_SAMPLE.csv", csv(council.map((r) => ({ ...r, campus: nameOf(r.campus_id) })), ["campus", "council_type", "contact_type", "name", "role", "email", "phone", "instagram_url", "source_url", "source_type", "confidence"]));
  writeFileSync("GREEK_CHAPTER_CONTACT_SAMPLE.csv", csv(chapterOnly.map((r) => ({ ...r, campus: nameOf(r.campus_id) })), ["campus", "contact_type", "name", "role", "email", "instagram_url", "confidence", "source_url", "source_type"]));
  writeFileSync("BUSINESS_CLUB_SAMPLE.csv", csv([...clubs.map((r) => ({ ...r, campus: nameOf(r.campus_id), president_name: "", president_email: "" })), ...clubContacts.map((r) => ({ campus: nameOf(r.campus_id), category: r.category, name: r.name, general_email: r.email, instagram_url: r.instagram_url, confidence: r.confidence, source_url: r.source_url, source_type: r.source_type, president_name: r.name, president_email: r.email }))], ["campus", "category", "name", "general_email", "instagram_url", "facebook_url", "website_url", "president_name", "president_email", "confidence", "source_url", "source_type"]));

  // Metrics
  const withIg = (rows: any[]) => rows.filter((r) => r.instagram_url).length;
  const withEmail = (rows: any[]) => rows.filter((r) => r.email || r.general_email).length;
  const academicRoles = chapterOnly.filter((r) => /Academic|Scholarship|VP Academics/i.test(r.role || "")).length;
  const wib = clubs.filter((r) => r.category === "women_in_business");
  const invfin = clubs.filter((r) => r.category === "investment_finance");

  console.log("\n=== GROWTH CONTACT INTELLIGENCE — TEST METRICS ===");
  console.log(`campuses: ${ids.length}`);
  console.log(`\nCOUNCIL (read-only from Campus Backfill): ${council.length} contacts, ${withIg(council)} with IG, ${withEmail(council)} with email`);
  console.log(`CHAPTER contacts: ${chapterOnly.length} total, ${withIg(chapterOnly)} IG handles, ${withEmail(chapterOnly)} emails, ${academicRoles} academic/scholarship-chair roles`);
  console.log(`BUSINESS CLUBS: ${clubs.length} orgs (WIB ${wib.length}, Investment/Finance ${invfin.length}), ${withIg(clubs)} IG, ${withEmail(clubs)} email; club contacts ${clubContacts.length}`);

  console.log(`\nPer-campus:`);
  for (const c of campuses) {
    const cc = council.filter((r) => r.campus_id === c.id).length;
    const ch = chapterOnly.filter((r) => r.campus_id === c.id).length;
    const w = wib.filter((r) => r.campus_id === c.id).length;
    const i = invfin.filter((r) => r.campus_id === c.id).length;
    console.log(`  ${c.name.padEnd(34)} council=${cc} chapter=${ch} WIB=${w} InvFin=${i}   [${c.kind ?? ""}]`);
  }

  console.log(`\nStatus rows: ${status.length}`);
  const byStatus: Record<string, number> = {};
  for (const s of status) byStatus[`${s.category}:${s.status}`] = (byStatus[`${s.category}:${s.status}`] ?? 0) + 1;
  console.log(JSON.stringify(byStatus, null, 2));
  console.log("\nWrote COUNCIL_CONTACT_SAMPLE.csv, GREEK_CHAPTER_CONTACT_SAMPLE.csv, BUSINESS_CLUB_SAMPLE.csv");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
