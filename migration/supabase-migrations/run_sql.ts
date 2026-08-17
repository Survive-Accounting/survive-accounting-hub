// Run a .sql file against the live project via the Supabase Management API.
//
//   bun run migration/supabase-migrations/run_sql.ts <file.sql>          # dry run: prints, runs nothing
//   bun run migration/supabase-migrations/run_sql.ts <file.sql> --apply  # executes
//
// NEEDS `SUPABASE_ACCESS_TOKEN` in .env — a Supabase Personal Access Token
// (https://supabase.com/dashboard/account/tokens). Lee sets it himself; it is never pasted into a
// chat and never committed (.env is gitignored).
//
// WHY THIS EXISTS: migrations were being hand-pasted into the SQL editor, and 0115 sat pasted-but-
// never-executed for a whole cycle while a verifier reported it missing. A file that ran is a fact;
// a file that was pasted is not.
//
// SAFETY:
//   * dry run by default — --apply is the only thing that executes;
//   * refuses obviously destructive statements unless --force is ALSO passed (drop table, drop
//     column, truncate, delete without where);
//   * prints the statement count and the first line of each before running;
//   * on failure it reports the failing statement, and stops rather than continuing.
//
// The API runs the whole file as ONE query, so Postgres wraps it in a single implicit transaction:
// a failure part-way rolls the whole file back rather than leaving a half-applied schema.
const [, , fileArg, ...flags] = process.argv;
const APPLY = flags.includes("--apply");
const FORCE = flags.includes("--force");

const PROJECT = process.env.SUPABASE_PROJECT_ID;
// Accept every name this token has been stored under. Lee added it to the Vercel project as
// SUPABASETOKEN; SUPABASE_TOKEN_1 predates that; SUPABASE_ACCESS_TOKEN is what Supabase's own
// docs call it. Reading one name and failing on the others would mean a token that exists but
// "isn't there" — the exact failure mode that cost a cycle on 0115.
const TOKEN = process.env.SUPABASETOKEN
  || process.env.SUPABASE_ACCESS_TOKEN
  || process.env.SUPABASE_TOKEN_1;

if (!fileArg) { console.error("usage: run_sql.ts <file.sql> [--apply] [--force]"); process.exit(1); }
if (!PROJECT) { console.error("SUPABASE_PROJECT_ID missing from env"); process.exit(1); }
if (!TOKEN) {
  console.error("No Supabase access token in the environment.");
  console.error("  Looked for: SUPABASETOKEN, SUPABASE_ACCESS_TOKEN, SUPABASE_TOKEN_1");
  console.error("  If it lives in the Vercel project rather than locally:");
  console.error("    npx vercel env pull .env.vercel --environment=production --yes");
  console.error("    set -a && . ./.env && . ./.env.vercel && set +a");
  console.error("  .env* is gitignored, so pulled secrets stay local - delete .env.vercel when done.");
  process.exit(1);
}

const sql = await Bun.file(fileArg).text();

// Rough statement split, for the report only — the file is still sent whole so the transaction and
// any dollar-quoted do$$ blocks stay intact.
const statements = sql
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

const DESTRUCTIVE = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+column\b/i,
  /\bdrop\s+database\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b(?![\s\S]{0,200}\bwhere\b)/i,
];
const flagged = statements.filter((s) => DESTRUCTIVE.some((re) => re.test(s)));

console.log(`file:       ${fileArg}`);
console.log(`project:    ${PROJECT}`);
console.log(`statements: ${statements.length}`);
console.log(`mode:       ${APPLY ? "APPLY" : "DRY RUN (nothing will run)"}\n`);

for (const [i, s] of statements.entries()) {
  const first = s.split("\n").find((l) => l.trim())?.trim() ?? "";
  console.log(`  ${String(i + 1).padStart(3)}. ${first.slice(0, 110)}`);
}

if (flagged.length) {
  console.log(`\nDESTRUCTIVE STATEMENTS DETECTED (${flagged.length}):`);
  for (const s of flagged) console.log(`  ! ${s.split("\n")[0].slice(0, 110)}`);
  if (!FORCE) {
    console.log("\nRefusing to run. Re-read them, and pass --force as well if they are genuinely intended.");
    process.exit(1);
  }
  console.log("\n--force given; proceeding.");
}

if (!APPLY) { console.log("\nDRY RUN — nothing executed. Re-run with --apply."); process.exit(0); }

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});

const bodyText = await res.text();
if (!res.ok) {
  console.error(`\nFAILED (HTTP ${res.status})`);
  console.error(bodyText.slice(0, 2000));
  // The whole file is one transaction, so a failure here means NOTHING was applied.
  console.error("\nThe file runs as a single transaction — nothing was applied.");
  process.exit(1);
}

console.log(`\nOK (HTTP ${res.status})`);
const trimmed = bodyText.trim();
if (trimmed && trimmed !== "[]") console.log(trimmed.slice(0, 2000));
console.log("\nApplied. Verify with a read against the live schema — do not trust this message alone.");
