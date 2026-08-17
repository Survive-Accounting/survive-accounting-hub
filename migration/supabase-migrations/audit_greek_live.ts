// READ-ONLY audit of the live Greek schema, ahead of the Phase-1 chapter work.
//
// Answers three questions and writes nothing:
//   1. Is 0111 actually applied? (greek_chapters / greek_chapter_members present?)
//   2. What ELSE Greek-shaped is already live, and how much data is in each table?
//   3. Can a member row be tied to a student account today — i.e. is chapter membership
//      already an attribute, or a parallel identity?
//
// Run: bun run migration/supabase-migrations/audit_greek_live.ts
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** Probe a table by selecting zero rows: a missing relation errors, an empty one does not. */
async function probe(table: string): Promise<{ live: boolean; rows: number | null; note: string }> {
  const { error, count } = await db.from(table as never).select("*", { count: "exact", head: true });
  if (error) return { live: false, rows: null, note: error.message.slice(0, 90) };
  return { live: true, rows: count ?? 0, note: "" };
}

/** Column names, discovered by reading one row. Empty tables can't reveal their shape this way,
 *  which is itself worth reporting rather than papering over. */
async function columns(table: string): Promise<string[] | "empty" | "missing"> {
  const { data, error } = await db.from(table as never).select("*").limit(1);
  if (error) return "missing";
  if (!data || data.length === 0) return "empty";
  return Object.keys(data[0] as object).sort();
}

const TABLES = [
  "greek_chapters",
  "greek_chapter_members",
  "greek_orgs",
  "greek_org_people",
  "chapters",
  "campuses",
  "profiles",
  "entitlements",
];

const main = async () => {
  console.log("=== LIVE GREEK SCHEMA AUDIT (read-only) ===\n");

  for (const t of TABLES) {
    const p = await probe(t);
    const cols = p.live ? await columns(t) : "missing";
    const shape = Array.isArray(cols) ? cols.join(", ") : cols;
    console.log(`${p.live ? "LIVE " : "ABSENT"}  ${t.padEnd(24)} rows=${String(p.rows ?? "-").padEnd(6)} ${p.note}`);
    if (p.live) console.log(`         cols: ${shape}\n`);
    else console.log("");
  }

  // THE INVARIANT QUESTION: is there any column on the member table that could reference a
  // student account? If not, membership is a parallel identity today and the Phase-1 work has
  // to introduce the link, not just rename things.
  const memberCols = await columns("greek_chapter_members");
  if (Array.isArray(memberCols)) {
    const accountish = memberCols.filter((c) => /user|account|profile|auth|student|email/i.test(c));
    console.log(`member->account link candidates: ${accountish.length ? accountish.join(", ") : "NONE"}`);
  } else {
    console.log(`member->account link candidates: cannot tell (table ${memberCols})`);
  }

  // Counts that the post-migration invariant will be checked against.
  const ch = await probe("greek_chapters");
  const mem = await probe("greek_chapter_members");
  console.log(`\nBASELINE COUNTS  greek_chapters=${ch.rows ?? "-"}  greek_chapter_members=${mem.rows ?? "-"}`);
};

main().catch((e) => { console.error("AUDIT FAILED:", e); process.exit(1); });
