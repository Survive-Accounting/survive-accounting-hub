// READ-ONLY check that the Growth Admin storage migration landed. Writes nothing.
//
//   bun run migration/supabase-migrations/verify_growth_admin.ts
//
// Confirms growth_contacts / growth_contact_roles / growth_outreach_events exist
// and are reachable, and prints their row counts. Exits non-zero if any is missing
// so it can gate the "storage ready" flag the UI shows.
//
// NOTE: a HEAD+count request can mask a missing-table 404 in some client paths, so
// this does a real row read and inspects the PostgREST error code explicitly.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const TABLES = ["growth_contacts", "growth_contact_roles", "growth_outreach_events"];

function isMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    (typeof err.message === "string" &&
      /does not exist|could not find the table/i.test(err.message))
  );
}

let failures = 0;
for (const t of TABLES) {
  // Real read (not head) so a 404 surfaces as an error we can classify.
  const { error } = await db
    .from(t as never)
    .select("id")
    .limit(1);
  if (error && isMissing(error)) {
    console.log(`FAIL  ${t} — table not found`);
    failures++;
    continue;
  }
  if (error) {
    console.log(`FAIL  ${t} — ${error.message}`);
    failures++;
    continue;
  }
  // Present — now get an exact count for a friendly readout.
  const { count } = await db.from(t as never).select("*", { count: "exact", head: true });
  console.log(`PASS  ${t} — ${count ?? 0} rows`);
}

console.log(
  failures === 0
    ? "\nAll growth_* tables present. Storage is ready."
    : `\n${failures} table(s) missing — apply 20260823_1200_growth_admin_contacts_outreach.sql in the Supabase SQL editor.`,
);
process.exit(failures === 0 ? 0 : 1);
