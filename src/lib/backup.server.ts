// Core nightly-backup job. SERVER-ONLY (imports jszip, supabase service role,
// aws-sdk via the store). Import with dynamic import() inside server handlers.
//
// One .zip per group per night, each containing every table as BOTH .csv
// (human/Excel) and .json (schema-preserving, re-importable) + a manifest.json.
// Uploaded to R2 under:
//   backups/{group}/YYYY/MM/DD/{group}-YYYYMMDD.zip   (+ .manifest.json sidecar)
// Retention (job-managed, portable — no reliance on bucket lifecycle rules):
//   • daily:   keep last 30, prune older
//   • monthly: on the 1st, promote to backups/{group}/monthly/, keep 12
//   • annual:  on Jan 1, promote to backups/{group}/annual/, keep forever
// Fail-loud: any table dump error aborts THAT group and texts Lee the table name;
// other groups still run.
import JSZip from "jszip";
import {
  BACKUP_GROUPS,
  BACKUP_GROUP_ORDER,
  BACKUP_ROOT,
  RETENTION,
  UNRESOLVED_REQUESTS,
  type BackupGroup,
} from "./backup-tables";
import { getBackupStore, type BackupStore } from "./backup-store.server";

export interface TableDumpMeta {
  table: string;
  rows: number;
  columns: string[];
  csvBytes: number;
  jsonBytes: number;
}

export interface BackupManifest {
  group: BackupGroup;
  date: string; // YYYYMMDD (UTC)
  generatedAt: string; // ISO
  bucket: string;
  storeKind: "r2" | "local";
  tableCount: number;
  totalRows: number;
  zipBytes: number;
  tables: TableDumpMeta[];
  unresolvedRequests: typeof UNRESOLVED_REQUESTS;
}

export interface GroupResult {
  group: BackupGroup;
  ok: boolean;
  tableCount: number;
  totalRows: number;
  zipKey?: string;
  zipBytes?: number;
  promotedMonthly?: string;
  promotedAnnual?: string;
  prunedDaily?: number;
  failedTable?: string;
  error?: string;
}

export interface BackupRunResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  storeKind: "r2" | "local";
  groups: GroupResult[];
}

const PAGE = 1000;

type Logger = (msg: string) => void;

// ── date helpers (UTC) ───────────────────────────────────────────────────────

function ymd(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return { y, m, day, compact: `${y}${m}${day}` };
}

function dailyPrefix(group: BackupGroup) {
  return `${BACKUP_ROOT}/${group}/`;
}
function dailyDir(group: BackupGroup, d: Date) {
  const { y, m, day } = ymd(d);
  return `${BACKUP_ROOT}/${group}/${y}/${m}/${day}`;
}
function monthlyPrefix(group: BackupGroup) {
  return `${BACKUP_ROOT}/${group}/monthly/`;
}
function annualPrefix(group: BackupGroup) {
  return `${BACKUP_ROOT}/${group}/annual/`;
}

// Parse the UTC date encoded in a daily key: backups/{group}/YYYY/MM/DD/...
function dateFromDailyKey(key: string): Date | null {
  const m = key.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

// ── CSV serialization ────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(csvCell).join(",");
  if (!rows.length) return header + "\n";
  const lines = rows.map((r) => columns.map((c) => csvCell(r[c])).join(","));
  return header + "\n" + lines.join("\n") + "\n";
}

// ── table dump ───────────────────────────────────────────────────────────────

interface TableDump {
  meta: TableDumpMeta;
  csv: string;
  json: string;
}

async function dumpTable(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  table: string,
): Promise<TableDump> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  // Page until a short page. A missing table surfaces as an error here → fail loud.
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`table "${table}": ${error.message}`);
    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const csv = rowsToCsv(rows, columns);
  const json = JSON.stringify(rows);
  return {
    meta: {
      table,
      rows: rows.length,
      columns,
      csvBytes: Buffer.byteLength(csv),
      jsonBytes: Buffer.byteLength(json),
    },
    csv,
    json,
  };
}

// ── fail-loud SMS (mirrors onboarding.functions notifyLee) ───────────────────

async function textLee(body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const msid = process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";
  const lee = (process.env.LEE_PERSONAL_PHONE ?? "").replace(/[^+\d]/g, "");
  if (!sid || !token || !msid || !lee) {
    console.warn("[backup] fail-loud SMS skipped: missing Twilio env");
    return;
  }
  try {
    const params = new URLSearchParams({ MessagingServiceSid: msid, To: lee, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    if (!res.ok) console.warn("[backup] Twilio error", res.status, await res.text());
  } catch (e) {
    console.warn("[backup] fail-loud SMS failed", (e as Error).message);
  }
}

// ── retention ────────────────────────────────────────────────────────────────

async function pruneDailies(store: BackupStore, group: BackupGroup, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION.dailyKeep * 24 * 60 * 60 * 1000);
  const objs = await store.list(dailyPrefix(group));
  const toDelete: string[] = [];
  for (const o of objs) {
    // Only touch year-partitioned dailies, never monthly/ or annual/.
    if (o.key.includes(`/${group}/monthly/`) || o.key.includes(`/${group}/annual/`)) continue;
    const d = dateFromDailyKey(o.key);
    if (d && d.getTime() < cutoff.getTime()) toDelete.push(o.key);
  }
  await store.remove(toDelete);
  return toDelete.length;
}

async function pruneMonthlies(store: BackupStore, group: BackupGroup): Promise<void> {
  const objs = (await store.list(monthlyPrefix(group)))
    .filter((o) => o.key.endsWith(".zip"))
    .sort((a, b) => a.key.localeCompare(b.key)); // key encodes YYYYMM → lexical = chronological
  const excess = objs.length - RETENTION.monthlyKeep;
  if (excess <= 0) return;
  const kill: string[] = [];
  for (const o of objs.slice(0, excess)) {
    kill.push(o.key, o.key.replace(/\.zip$/, ".manifest.json"));
  }
  await store.remove(kill);
}

// ── one group ────────────────────────────────────────────────────────────────

async function runGroup(
  store: BackupStore,
  group: BackupGroup,
  now: Date,
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  bucketLabel: string,
  log: Logger,
): Promise<GroupResult> {
  const spec = BACKUP_GROUPS[group];
  const result: GroupResult = { group, ok: false, tableCount: spec.tables.length, totalRows: 0 };
  const zip = new JSZip();
  const metas: TableDumpMeta[] = [];

  try {
    for (const table of spec.tables) {
      log(`[backup] ${group}: dumping ${table}…`);
      const dump = await dumpTable(supabaseAdmin, table); // throws w/ table name on error
      zip.file(`${table}.csv`, dump.csv);
      zip.file(`${table}.json`, dump.json);
      metas.push(dump.meta);
      result.totalRows += dump.meta.rows;
    }

    const { compact } = ymd(now);
    const manifest: BackupManifest = {
      group,
      date: compact,
      generatedAt: now.toISOString(),
      bucket: bucketLabel,
      storeKind: store.kind,
      tableCount: metas.length,
      totalRows: result.totalRows,
      zipBytes: 0, // filled after generate
      tables: metas,
      unresolvedRequests: UNRESOLVED_REQUESTS,
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    let buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    // Rewrite manifest with real zip size, regenerate once (cheap, keeps size honest).
    manifest.zipBytes = buf.length;
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const manifestJson = JSON.stringify(manifest, null, 2);

    // Daily upload + sidecar manifest (cheap listing without unzipping).
    const dailyKey = `${dailyDir(group, now)}/${group}-${compact}.zip`;
    await store.put(dailyKey, buf, "application/zip");
    await store.put(dailyKey.replace(/\.zip$/, ".manifest.json"), manifestJson, "application/json");
    result.zipKey = dailyKey;
    result.zipBytes = buf.length;
    log(`[backup] ${group}: wrote ${dailyKey} (${buf.length} bytes, ${result.totalRows} rows)`);

    // Monthly promotion (1st of month).
    if (now.getUTCDate() === 1) {
      const { y, m } = ymd(now);
      const key = `${monthlyPrefix(group)}${group}-${y}${m}.zip`;
      await store.put(key, buf, "application/zip");
      await store.put(key.replace(/\.zip$/, ".manifest.json"), manifestJson, "application/json");
      await pruneMonthlies(store, group);
      result.promotedMonthly = key;
      log(`[backup] ${group}: promoted monthly ${key}`);
    }

    // Annual promotion (Jan 1).
    if (now.getUTCMonth() === 0 && now.getUTCDate() === 1) {
      const { y } = ymd(now);
      const key = `${annualPrefix(group)}${group}-${y}.zip`;
      await store.put(key, buf, "application/zip");
      await store.put(key.replace(/\.zip$/, ".manifest.json"), manifestJson, "application/json");
      result.promotedAnnual = key;
      log(`[backup] ${group}: promoted annual ${key}`);
    }

    // Prune old dailies.
    result.prunedDaily = await pruneDailies(store, group, now);
    result.ok = true;
  } catch (err) {
    const message = (err as Error).message || String(err);
    result.error = message;
    const tm = message.match(/table "([^"]+)"/);
    if (tm) result.failedTable = tm[1];
    log(`[backup] ${group}: ABORTED — ${message}`);
    await textLee(
      `⚠️ Nightly backup FAILED — group "${group}"` +
        (result.failedTable ? ` on table "${result.failedTable}"` : "") +
        `: ${message.slice(0, 300)}`,
    );
  }
  return result;
}

// ── public entry ─────────────────────────────────────────────────────────────

export interface RunBackupOptions {
  /** Override the store (verify harness passes a LocalStore). Defaults to R2. */
  store?: BackupStore;
  /** Override "now" (UTC) for testing retention/promotion. */
  now?: Date;
  /** Subset of groups to run. Defaults to all three. */
  groups?: BackupGroup[];
  logger?: Logger;
}

export async function runBackup(opts: RunBackupOptions = {}): Promise<BackupRunResult> {
  const log = opts.logger ?? ((m: string) => console.log(m));
  const store = opts.store ?? getBackupStore();
  const now = opts.now ?? new Date();
  const groups = opts.groups ?? BACKUP_GROUP_ORDER;
  const bucketLabel =
    store.kind === "r2" ? process.env.R2_BACKUP_BUCKET || "surviveaccounting-backups" : "local";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const startedAt = new Date().toISOString();
  const results: GroupResult[] = [];
  // Sequential across groups to avoid memory spikes (one group zip in memory at a time).
  for (const group of groups) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await runGroup(store, group, now, supabaseAdmin, bucketLabel, log));
  }

  return {
    ok: results.every((r) => r.ok),
    startedAt,
    finishedAt: new Date().toISOString(),
    storeKind: store.kind,
    groups: results,
  };
}
