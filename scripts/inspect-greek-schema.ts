// READ-ONLY schema + row inspection for Build 1.
//
//   bun scripts/inspect-greek-schema.ts
//
// Answers the three questions Build 1 needs before a line of code is written:
//   1. What columns does greek_chapter_members actually have? (the interest flag has to fit in
//      one of them — this pass may not write a migration)
//   2. What does campus_waitlist.kind allow, and is it a CHECK or just zod?
//   3. What do the 15 live member rows look like, and how many are duplicates?
//
// SELECTs only. Nothing here writes.
import { readFileSync } from "node:fs";

const REF = "unvxagsledbsdoremqeb";

const QUERIES: Array<{ label: string; sql: string }> = [
  {
    label: "greek_chapter_members columns",
    sql: `SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
           WHERE table_schema='public' AND table_name='greek_chapter_members'
           ORDER BY ordinal_position;`,
  },
  {
    label: "greek_chapter_members constraints + indexes",
    sql: `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = rel.relnamespace
           WHERE n.nspname='public' AND rel.relname='greek_chapter_members';`,
  },
  {
    label: "campus_waitlist columns",
    sql: `SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
           WHERE table_schema='public' AND table_name='campus_waitlist'
           ORDER BY ordinal_position;`,
  },
  {
    label: "campus_waitlist CHECK constraints (is kind constrained in the DB?)",
    sql: `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = rel.relnamespace
           WHERE n.nspname='public' AND rel.relname='campus_waitlist' AND con.contype='c';`,
  },
  {
    label: "campus_waitlist kinds in use",
    sql: `SELECT kind, count(*) FROM campus_waitlist GROUP BY kind ORDER BY 2 DESC;`,
  },
  {
    label: "THE 15 MEMBER ROWS",
    sql: `SELECT m.id, m.chapter_id, m.user_id, m.name, m.phone, m.source, m.tagged_at
            FROM greek_chapter_members m
           ORDER BY m.chapter_id, m.tagged_at;`,
  },
  {
    label: "DUPLICATE SHAPE — rows per chapter with no user_id and no phone",
    sql: `SELECT chapter_id,
                 count(*) AS rows,
                 count(user_id) AS with_user,
                 count(phone) AS with_phone,
                 count(*) FILTER (WHERE user_id IS NULL AND (phone IS NULL OR phone='')) AS anonymous
            FROM greek_chapter_members
           GROUP BY chapter_id ORDER BY rows DESC;`,
  },
  {
    label: "contact_ref_visit columns",
    sql: `SELECT column_name, data_type FROM information_schema.columns
           WHERE table_schema='public' AND table_name='contact_ref_visit' ORDER BY ordinal_position;`,
  },
  {
    label: "contact_ref_visit row count",
    sql: `SELECT count(*) AS rows FROM contact_ref_visit;`,
  },
];

function token(): string {
  const fromEnv = (process.env.SUPABASETOKEN ?? "").trim();
  if (fromEnv) return fromEnv;
  for (const p of [
    ".env.vercel",
    "../sa-campus-rep/.env.vercel",
    "../sa-growth-contacts/.env.vercel",
    "../sa-greek-academic/.env.vercel",
    "../sa-greek-990/.env.vercel",
    "../sa-course-intel-harvest/.env.vercel",
  ]) {
    try {
      const t = /^SUPABASETOKEN=(.+)$/m.exec(readFileSync(p, "utf8"))?.[1]?.trim().replace(/^"|"$/g, "");
      if (t) return t;
    } catch { /* next */ }
  }
  return "";
}

const TOKEN = token();
if (!TOKEN) { console.error("No SUPABASETOKEN available."); process.exit(1); }

for (const q of QUERIES) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q.sql }),
  });
  const body = await res.text();
  console.log(`\n════ ${q.label} → HTTP ${res.status}`);
  console.log(body.slice(0, 3000));
}
