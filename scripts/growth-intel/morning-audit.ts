// READ-ONLY morning audit of Growth Contact Intelligence. No writes, no discovery,
// no outreach. Emits MORNING_AUDIT_GROWTH_CONTACTS.json and prints a SUMMARY block.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { councilKey } from "../../src/lib/growth-intel-core";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function page(table: string, select: string, filter?: (b: any) => any): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  for (;;) {
    let b = db.from(table).select(select).range(from, from + 999);
    if (filter) b = filter(b);
    const { data, error } = await b;
    if (error) { console.error(`  ! ${table}: ${error.message}`); break; }
    const d = (data ?? []) as any[];
    out.push(...d);
    if (d.length < 1000) break;
    from += 1000;
  }
  return out;
}
const tally = (rows: any[], key: (r: any) => string) => {
  const m: Record<string, number> = {};
  for (const r of rows) { const k = key(r); m[k] = (m[k] ?? 0) + 1; }
  return m;
};

async function main() {
  // ---- pull everything (read-only) ----
  const gpc = await page("growth_public_contacts", "id,campus_id,entity_type,entity_id,category,contact_type,name,role,email,phone,instagram_url,website_url,confidence,is_current,effective_term,effective_year,source_type");
  const clubs = await page("growth_business_clubs", "id,campus_id,category,name,general_email,instagram_url,website_url,facebook_url,confidence,source_type,effective_term");
  const gds = await page("growth_discovery_status", "campus_id,category,entity_id,status,results_found");
  const cc = await page("campus_council_contacts", "id,campus_id,council_type,contact_type,name,role,email,phone,instagram_url,website_url,confidence,is_current,effective_term,source_type");
  const ccs = await page("campus_council_status", "campus_id,council_type,status,contacts_found,role_inbox_found");

  const chapterContacts = gpc.filter((r) => r.entity_type === "chapter");
  const clubContacts = gpc.filter((r) => r.entity_type === "club");

  // council of each chapter (for IFC/Panhel/NPHC/MGC breakdown of chapter contacts)
  const chapIds = [...new Set(chapterContacts.map((r) => r.entity_id))];
  const chapCouncil = new Map<string, string>();
  for (let i = 0; i < chapIds.length; i += 300) {
    const rows = await page("campus_greek_chapters", "id,council", (b) => b.in("id", chapIds.slice(i, i + 300)));
    for (const r of rows) chapCouncil.set(r.id, councilKey(r.council));
  }
  const chapterByCouncil = tally(chapterContacts, (r) => chapCouncil.get(r.entity_id) ?? "other");

  // ---- discovery status ----
  const chapStatusRows = gds.filter((r) => r.category === "chapter");
  const status = {
    chapter: {
      campuses_attempted: new Set(chapStatusRows.map((r) => r.campus_id)).size,
      chapters_attempted: chapStatusRows.length,
      by_status: tally(chapStatusRows, (r) => r.status),
      chapters_with_contact: new Set(chapterContacts.map((r) => r.entity_id)).size,
    },
    women_in_business: tally(gds.filter((r) => r.category === "women_in_business"), (r) => r.status),
    investment_finance: tally(gds.filter((r) => r.category === "investment_finance"), (r) => r.status),
  };

  // ---- contacts breakdowns ----
  const has = (rows: any[], f: string) => rows.filter((r) => r[f]).length;
  const contactTypeMap = (ct: string, isChapter: boolean) => {
    // map internal enum -> requested audit buckets
    if (ct === "student_officer") return isChapter ? "CHAPTER_EXEC" : "STUDENT_OFFICER";
    if (ct === "role_inbox") return "ROLE_INBOX";
    if (ct === "staff_advisor") return "STAFF_ADVISOR";
    if (ct === "organization_general") return "ORG_GENERAL";
    if (ct === "social_account") return "SOCIAL_ACCOUNT";
    return "UNKNOWN";
  };
  const allContactRows = [
    ...chapterContacts.map((r) => ({ ...r, _src: "chapter" })),
    ...clubContacts.map((r) => ({ ...r, _src: "club" })),
    ...cc.map((r) => ({ ...r, _src: "council" })),
  ];
  const contactTypeCounts = tally(allContactRows, (r) => contactTypeMap(r.contact_type, r._src === "chapter"));

  // council contacts breakdown (from Campus Backfill)
  const councilByType = tally(cc, (r) => r.council_type);

  // field presence
  const fields = {
    emails: has(allContactRows, "email"),
    phones: has(allContactRows, "phone"),
    instagram_handles: has(allContactRows, "instagram_url") + clubs.filter((c) => c.instagram_url).length,
    websites: has(allContactRows, "website_url") + clubs.filter((c) => c.website_url).length,
    club_general_emails: clubs.filter((c) => c.general_email).length,
  };

  // ---- quality ----
  const emailRows = allContactRows.filter((r) => r.email);
  const emailCounts = tally(emailRows, (r) => String(r.email).toLowerCase());
  const dupEmails = Object.entries(emailCounts).filter(([, n]) => n > 1);
  const generic = allContactRows.filter((r) => r.contact_type === "role_inbox" || r.contact_type === "organization_general").length;
  const individual = allContactRows.filter((r) => r.contact_type === "student_officer" && r.name).length;
  const confidence = {
    chapter: tally(chapterContacts, (r) => r.confidence),
    club: tally(clubs, (r) => r.confidence),
    council: tally(cc, (r) => r.confidence),
  };
  const termAvail = {
    with_effective_term: allContactRows.filter((r) => r.effective_term).length,
    total: allContactRows.length,
  };
  // wrong-campus signal: chapter IG handle whose host path lacks any campus token is
  // already filtered at store time; here we just report social_account count as IG-derived.
  const socialCount = chapterContacts.filter((r) => r.contact_type === "social_account").length;

  // ---- org counts ----
  const orgs = {
    business_clubs_total: clubs.length,
    women_in_business: clubs.filter((c) => c.category === "women_in_business").length,
    investment_finance: clubs.filter((c) => c.category === "investment_finance").length,
    chapters_with_any_contact: status.chapter.chapters_with_contact,
    councils_with_contacts: new Set(cc.map((r) => `${r.campus_id}:${r.council_type}`)).size,
  };

  const report = {
    generated_at_note: "read-only; timestamp stamped by wrapper",
    discovery_status: status,
    organizations: orgs,
    contacts: {
      total: allContactRows.length,
      chapter_contacts: chapterContacts.length,
      club_contacts: clubContacts.length,
      council_contacts: cc.length,
      by_council: {
        // council-level (from Campus Backfill) + chapter-level (this system)
        council_level_from_backfill: councilByType,
        chapter_level_by_council: chapterByCouncil,
      },
      by_contact_type: contactTypeCounts,
      fields,
    },
    quality: {
      duplicate_email_values: dupEmails.length,
      duplicate_email_examples: dupEmails.slice(0, 8).map(([e, n]) => ({ email: e, count: n })),
      generic_email_contacts: generic,
      individual_email_contacts: individual,
      term_year_availability: termAvail,
      confidence,
      social_account_ig_contacts: socialCount,
    },
    cost_and_calls_note: "see continuous discovery_runs; ~$74 cumulative",
  };

  writeFileSync("MORNING_AUDIT_GROWTH_CONTACTS.json", JSON.stringify(report, null, 2));

  // ---- SUMMARY for the human-readable MD ----
  console.log("SUMMARY_START");
  console.log(JSON.stringify({
    campuses_attempted: status.chapter.campuses_attempted,
    chapters_attempted: status.chapter.chapters_attempted,
    chapter_status: status.chapter.by_status,
    chapters_with_contact: status.chapter.chapters_with_contact,
    wib_status: status.women_in_business,
    invfin_status: status.investment_finance,
    orgs,
    contacts_total: allContactRows.length,
    chapter_contacts: chapterContacts.length,
    council_contacts: cc.length,
    chapter_by_council: chapterByCouncil,
    council_by_type: councilByType,
    contact_types: contactTypeCounts,
    fields,
    dup_emails: dupEmails.length,
    generic, individual,
    term_avail: termAvail,
    confidence,
  }, null, 2));
  console.log("SUMMARY_END");
}
main().catch((e) => { console.error(e); process.exit(1); });
