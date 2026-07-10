/**
 * Restore / diff a nightly backup zip against the live Supabase DB.
 *
 * Runs locally (reads .env for R2 + Supabase service-role creds):
 *
 *   bun scripts/restore-from-backup.ts <group> <YYYYMMDD> [options]
 *
 * group     content | intel | commerce
 * <date>    the daily snapshot to restore, e.g. 20260709
 *
 * Options:
 *   --table <name>   Restrict to one table (default: every table in the zip).
 *   --apply          Upsert the backup JSON back into the DB (by primary key).
 *                    Non-destructive: existing rows are updated, new ones inserted.
 *   --wipe           DESTRUCTIVE. Delete all rows in each table first, then insert.
 *                    Requires --apply and an explicit --yes.
 *   --local <dir>    Read from a local backup dir instead of R2 (verify harness).
 *   --yes            Skip the confirmation prompt (needed for --wipe in CI).
 *
 * Default (no --apply): a DRY-RUN diff report — for each table it reports rows
 * only-in-backup, only-in-DB, and changed, without touching anything.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { R2Store, type BackupStore } from "../src/lib/backup-store.server";
import { LocalStore } from "../src/lib/backup-local-store";

// ── args ─────────────────────────────────────────────────────────────────────

const VALUE_OPTS = new Set(["table", "local"]); // options that consume the next token
const BOOL_OPTS = new Set(["apply", "wipe", "yes"]);
const argv = process.argv.slice(2);
const positional: string[] = [];
const flags = new Set<string>();
const opts: Record<string, string> = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const name = a.slice(2);
    if (VALUE_OPTS.has(name)) opts[name] = argv[++i];
    else if (BOOL_OPTS.has(name)) flags.add(name);
    else {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
  } else {
    positional.push(a);
  }
}

const group = positional[0];
const date = positional[1];
const onlyTable = opts.table;
const doApply = flags.has("apply");
const doWipe = flags.has("wipe");
const localDir = opts.local;
const assumeYes = flags.has("yes");

if (!group || !["content", "intel", "commerce"].includes(group) || !date || !/^\d{8}$/.test(date)) {
  console.error("Usage: bun scripts/restore-from-backup.ts <content|intel|commerce> <YYYYMMDD> [--table t] [--apply] [--wipe] [--local dir] [--yes]");
  process.exit(1);
}
if (doWipe && (!doApply || !assumeYes)) {
  console.error("--wipe is destructive: it requires --apply and --yes.");
  process.exit(1);
}

// ── env ──────────────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  try {
    const txt = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const out: Record<string, string> = {};
    for (const line of txt.split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}
const env = { ...loadEnv(), ...process.env } as Record<string, string>;

// ── helpers ──────────────────────────────────────────────────────────────────

function makeStore(): BackupStore {
  if (localDir) return new LocalStore(path.resolve(localDir));
  return new R2Store({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BACKUP_BUCKET || "surviveaccounting-backups",
  });
}

function makeSupabase(): SupabaseClient {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Primary-key columns for a table, via the Supabase Management API. Falls back to ["id"]. */
async function primaryKey(table: string): Promise<string[]> {
  const token = env.SUPABASE_ACCESS_TOKEN;
  const ref = env.SUPABASE_PROJECT_REF || "unvxagsledbsdoremqeb";
  if (!token) return ["id"];
  const sql = `select a.attname as col from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = 'public.${table}'::regclass and i.indisprimary order by a.attnum`;
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) return ["id"];
    const rows = (await res.json()) as { col: string }[];
    return rows.length ? rows.map((r) => r.col) : ["id"];
  } catch {
    return ["id"];
  }
}

function pkOf(row: Record<string, unknown>, pk: string[]): string {
  return pk.map((c) => JSON.stringify(row[c] ?? null)).join("||");
}

function normalize(row: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.keys(row).sort().map((k) => [k, row[k]])));
}

async function fetchAll(supabase: SupabaseClient, table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`fetch ${table}: ${error.message}`);
    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function confirm(msg: string): Promise<boolean> {
  if (assumeYes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = (await rl.question(`${msg} [y/N] `)).trim().toLowerCase();
  rl.close();
  return ans === "y" || ans === "yes";
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const store = makeStore();
  const supabase = makeSupabase();

  const y = date.slice(0, 4);
  const m = date.slice(4, 6);
  const d = date.slice(6, 8);
  const zipKey = `backups/${group}/${y}/${m}/${d}/${group}-${date}.zip`;

  console.log(`Fetching ${store.kind}://${zipKey} …`);
  const buf = await store.get(zipKey);
  const zip = await JSZip.loadAsync(buf);

  const manifestFile = zip.file("manifest.json");
  const manifest = manifestFile ? JSON.parse(await manifestFile.async("string")) : null;
  if (manifest) console.log(`Manifest: ${manifest.tableCount} tables, ${manifest.totalRows} rows, generated ${manifest.generatedAt}`);

  const tables: string[] = onlyTable
    ? [onlyTable]
    : (manifest?.tables?.map((t: { table: string }) => t.table) as string[]) ??
      Object.keys(zip.files).filter((f) => f.endsWith(".json") && f !== "manifest.json").map((f) => f.replace(/\.json$/, ""));

  const mode = doWipe ? "WIPE+INSERT" : doApply ? "UPSERT" : "DRY-RUN DIFF";
  console.log(`\nMode: ${mode} — ${tables.length} table(s)\n`);

  for (const table of tables) {
    const jf = zip.file(`${table}.json`);
    if (!jf) {
      console.log(`• ${table}: not in zip, skipping`);
      continue;
    }
    const backupRows = JSON.parse(await jf.async("string")) as Record<string, unknown>[];
    const pk = await primaryKey(table);

    if (!doApply) {
      // dry-run diff
      const dbRows = await fetchAll(supabase, table);
      const bMap = new Map(backupRows.map((r) => [pkOf(r, pk), r]));
      const dMap = new Map(dbRows.map((r) => [pkOf(r, pk), r]));
      let onlyBackup = 0;
      let onlyDb = 0;
      let changed = 0;
      const sampleChanged: string[] = [];
      for (const [k, r] of bMap) {
        if (!dMap.has(k)) onlyBackup++;
        else if (normalize(r) !== normalize(dMap.get(k)!)) {
          changed++;
          if (sampleChanged.length < 3) sampleChanged.push(k);
        }
      }
      for (const k of dMap.keys()) if (!bMap.has(k)) onlyDb++;
      console.log(
        `• ${table}  (pk: ${pk.join(",")})  backup=${backupRows.length} db=${dbRows.length}  ` +
          `→ only-in-backup=${onlyBackup}  only-in-db=${onlyDb}  changed=${changed}` +
          (sampleChanged.length ? `  e.g. ${sampleChanged.join(" ")}` : ""),
      );
      continue;
    }

    // apply / wipe
    if (doWipe) {
      const ok = await confirm(`WIPE all rows in "${table}" (${backupRows.length} in backup) then insert?`);
      if (!ok) {
        console.log(`• ${table}: skipped (declined)`);
        continue;
      }
      // Delete everything. A guard filter is required by supabase-js; match all.
      const del = await supabase.from(table).delete().not(pk[0], "is", null);
      if (del.error) {
        console.error(`• ${table}: wipe failed — ${del.error.message}`);
        continue;
      }
    }

    let written = 0;
    const BATCH = 500;
    for (let i = 0; i < backupRows.length; i += BATCH) {
      const chunk = backupRows.slice(i, i + BATCH);
      const { error } = doWipe
        ? await supabase.from(table).insert(chunk)
        : await supabase.from(table).upsert(chunk, { onConflict: pk.join(",") });
      if (error) {
        console.error(`• ${table}: ${doWipe ? "insert" : "upsert"} failed at row ${i} — ${error.message}`);
        break;
      }
      written += chunk.length;
    }
    console.log(`• ${table}: ${doWipe ? "wiped + inserted" : "upserted"} ${written}/${backupRows.length} rows`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Restore failed:", (e as Error).message);
  process.exit(1);
});
