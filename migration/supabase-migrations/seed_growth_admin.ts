// Seed a few realistic Growth Admin contacts + roles + outreach events so the
// workspace isn't empty on first open. DRY-RUN BY DEFAULT — prints what it would
// do and writes nothing unless you pass --apply.
//
//   bun run migration/supabase-migrations/seed_growth_admin.ts            # dry run
//   bun run migration/supabase-migrations/seed_growth_admin.ts --apply    # write
//
// Requires 20260823_1200_growth_admin_contacts_outreach.sql to be applied first.
// Idempotent-ish: it skips a contact whose (full_name,email) already exists.
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function log(...a: unknown[]) {
  console.log(APPLY ? "[apply]" : "[dry-run]", ...a);
}

// storage present?
{
  const { error } = await db
    .from("growth_contacts" as never)
    .select("id", { head: true, count: "exact" });
  if (error) {
    console.error(
      "growth_* tables not found. Apply 20260823_1200_growth_admin_contacts_outreach.sql first.",
    );
    process.exit(1);
  }
}

// Pick a real, chapter-rich campus to attach the sample people to.
const { data: campusRows } = await db
  .from("campus_greek_chapters" as never)
  .select("campus_id,id,nickname,chapter_designation,council")
  .is("archived_at", null)
  .not("campus_id", "is", null)
  .limit(1000);
const byCampus = new Map<string, any[]>();
for (const r of (campusRows ?? []) as any[]) {
  if (!byCampus.has(r.campus_id)) byCampus.set(r.campus_id, []);
  byCampus.get(r.campus_id)!.push(r);
}
let bestCampus: string | null = null;
let bestChapters: any[] = [];
for (const [cid, chs] of byCampus)
  if (chs.length > bestChapters.length) {
    bestCampus = cid;
    bestChapters = chs;
  }
if (!bestCampus) {
  console.error("No campuses with chapters found to seed against.");
  process.exit(1);
}
const { data: campus } = await db
  .from("campuses" as never)
  .select("id,name,institution_name")
  .eq("id", bestCampus)
  .maybeSingle();
const campusName = (campus as any)?.institution_name || (campus as any)?.name || "Campus";
const ch1 = bestChapters[0];
const ch2 = bestChapters[1] ?? bestChapters[0];
log(`Seeding against ${campusName} (${bestChapters.length} chapters).`);

type Seed = {
  name: string;
  email: string;
  phone?: string;
  instagram?: string;
  title: string;
  chapter: any;
  role: string;
  current: boolean;
  startTerm: string;
  endTerm?: string;
};
const SEEDS: Seed[] = [
  {
    name: "Sample — Current President",
    email: "sample.current@example.com",
    phone: "555-0100",
    instagram: "@sample_pres",
    title: "Chapter President",
    chapter: ch1,
    role: "President",
    current: true,
    startTerm: "Fall 2025",
  },
  {
    name: "Sample — Former President",
    email: "sample.former@example.com",
    phone: "555-0101",
    title: "Past President (intro contact)",
    chapter: ch1,
    role: "President",
    current: false,
    startTerm: "Fall 2024",
    endTerm: "Spring 2025",
  },
  {
    name: "Sample — Treasurer",
    email: "sample.treasurer@example.com",
    instagram: "@sample_treas",
    title: "Treasurer",
    chapter: ch2,
    role: "Treasurer",
    current: true,
    startTerm: "Fall 2025",
  },
];

for (const s of SEEDS) {
  const { data: existing } = await db
    .from("growth_contacts" as never)
    .select("id")
    .eq("full_name", s.name)
    .eq("email", s.email)
    .maybeSingle();
  let contactId = (existing as any)?.id as string | undefined;
  if (contactId) {
    log(`contact exists: ${s.name}`);
  } else if (APPLY) {
    const { data: ins, error } = await db
      .from("growth_contacts" as never)
      .insert({
        full_name: s.name,
        email: s.email,
        phone: s.phone ?? null,
        instagram: s.instagram ?? null,
        title: s.title,
        source: "seed",
        created_by: "seed",
      })
      .select("id")
      .single();
    if (error) {
      console.error("insert contact failed:", error.message);
      continue;
    }
    contactId = (ins as any).id;
    log(`created contact: ${s.name}`);
  } else {
    log(
      `would create contact: ${s.name} (${s.role} @ ${s.chapter.nickname || s.chapter.chapter_designation})`,
    );
    continue;
  }

  if (APPLY && contactId) {
    await db.from("growth_contact_roles" as never).insert({
      contact_id: contactId,
      entity_type: "chapter",
      entity_id: s.chapter.id,
      campus_id: bestCampus,
      role: s.role,
      start_term: s.startTerm,
      end_term: s.endTerm ?? null,
      is_current: s.current,
      source: "seed",
      created_by: "seed",
    });
    // one outreach event + a follow-up for the current president
    await db.from("growth_outreach_events" as never).insert({
      contact_id: contactId,
      entity_type: "chapter",
      entity_id: s.chapter.id,
      campus_id: bestCampus,
      channel: "ig_dm",
      direction: "outbound",
      status: "sent",
      notes: "Intro DM (seed)",
      created_by: "seed",
      next_follow_up_at: s.current ? new Date(Date.now() + 2 * 86400000).toISOString() : null,
    });
    log(`  + role + event for ${s.name}`);
  }
}

console.log(APPLY ? "\nSeed applied." : "\nDry run complete. Re-run with --apply to write.");
