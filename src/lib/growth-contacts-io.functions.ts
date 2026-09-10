// GROWTH CONTACTS — import and export on the unified 25-column schema.
//
// Import takes either shape. A file already in the schema goes straight to upsert; a raw scrape
// (School,Council,Role,Name,Instagram,Chapter,Email) is run through the cleaner FIRST, so future
// scrapes come in clean without anyone opening PowerShell.
//
// THE THREE RULES THAT KEEP RE-IMPORTS SAFE:
//   1. Upsert on contact_id. No id on the row? Compute it. Still no match? Fall back to the natural
//      key (campus + org + person + email) so a re-cleaned row updates the person it already knows
//      rather than inserting a twin.
//   2. dm_status / dm_channel / dm_sent_at / dm_replied_at / dm_owner / dm_notes are APP-OWNED. A
//      scrape never blanks them; it only fills one that is empty.
//   3. source accumulates ("a.csv @ ...; b.csv @ ..."), so where a contact came from is never lost.
//
// Writes the legacy columns (name, role, instagram, email, entity_type, entity_id, council_type)
// alongside the structured ones, so the DM board, roster grid and schedule keep working.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { cleanContacts, type ScrapeRow } from "@/lib/contacts-clean";
import {
  APP_OWNED_COLUMNS, CONTACT_COLUMNS, contactsToCsv, emptyContact, parseContactsFile,
  withContactId, type ContactRecord,
} from "@/lib/growth-contacts-schema";
import { matchKey } from "@/lib/outreach-csv";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention shared with the other growth modules
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const COUNCIL_TYPE: Record<string, string> = {
  IFC: "ifc", Panhellenic: "panhellenic", NPHC: "nphc", MGC: "mgc",
  "Campus Club": "wib", "FSL Office": "fsl", Other: "fsl",
};
const COUNCIL_LABEL: Record<string, string> = {
  ifc: "IFC", panhellenic: "Panhellenic", nphc: "NPHC", mgc: "MGC", wib: "Campus Club", fsl: "Other",
};

/** Has migration 20260910_1800 been applied? Asking once up front turns "column contact_id does
 *  not exist" into a sentence that says what to run — the schema columns are the whole feature, so
 *  a missing migration must fail loudly and legibly rather than mid-batch. */
async function schemaReady(db: DB): Promise<boolean> {
  const { error } = await db.from("growth_contact_qc").select("contact_id").limit(1);
  return !error;
}
const MIGRATION_HINT = "The growth-contacts columns are not in the database yet. Run migration/supabase-migrations/20260910_1800_growth_contacts_schema.sql in the Supabase SQL editor, then try again.";

const bare = (v: string | null): string => {
  const s = (v ?? "").trim();
  if (!s) return "";
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  return (m ? m[1] : s).replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
};

// ---- export ----------------------------------------------------------------------------------

export interface ContactsExport { csv: string; rows: number; schools: number; needsReview: number; filename: string }

/** Every contact in the 25-column shape, for one campus or all of them. */
export const contactsExport = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    campusId: z.string().uuid().nullable().optional(),
    onlyNeedsReview: z.boolean().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data }): Promise<ContactsExport> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();

    const all: any[] = [];
    for (let page = 0; page < 80; page++) {
      let q = db.from("growth_contact_qc").select("*").order("campus_id", { ascending: true }).range(page * 1000, page * 1000 + 999);
      if (data.campusId) q = q.eq("campus_id", data.campusId);
      if (data.onlyNeedsReview) q = q.eq("needs_review", true);
      const { data: batch, error } = await q;
      if (error) throw new Error(`Could not read contacts: ${error.message}`);
      const rows = (batch ?? []) as any[];
      all.push(...rows);
      if (rows.length < 1000) break;
    }

    const campusIds = Array.from(new Set(all.map((c) => c.campus_id).filter(Boolean)));
    const campuses: any[] = [];
    for (let i = 0; i < campusIds.length; i += 200) {
      const { data: batch } = await db.from("campuses").select("id,name,display_name,slug").in("id", campusIds.slice(i, i + 200));
      campuses.push(...((batch ?? []) as any[]));
    }
    const campusName = new Map<string, string>(campuses.map((c) => [c.id, c.display_name || c.name]));

    // Fall back to the entity's own name for rows written before org_name existed.
    const chapterIds = Array.from(new Set(all.filter((c) => !c.org_name && c.entity_type === "chapter" && c.entity_id).map((c) => c.entity_id)));
    const label = new Map<string, string>();
    for (let i = 0; i < chapterIds.length; i += 200) {
      const { data: chs } = await db.from("campus_greek_chapters").select("id,greek_org_id,nickname,chapter_designation").in("id", chapterIds.slice(i, i + 200));
      const orgIds = Array.from(new Set(((chs ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean)));
      const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name").in("id", orgIds) : { data: [] };
      const on = new Map<string, string>(((orgs ?? []) as any[]).map((o) => [o.id, o.name]));
      for (const c of (chs ?? []) as any[]) label.set(c.id, on.get(c.greek_org_id) ?? c.nickname ?? c.chapter_designation ?? "");
    }

    const out: ContactRecord[] = all.map((c) => ({
      ...emptyContact(),
      contact_id: c.contact_id ?? "",
      school: campusName.get(c.campus_id) ?? "",
      council: c.council ?? COUNCIL_LABEL[c.council_type ?? ""] ?? "Other",
      org_type: c.org_type ?? (c.entity_type === "chapter" ? "chapter" : c.entity_type === "club" ? "club" : c.entity_type === "council" ? "council" : ""),
      org_name: c.org_name ?? (c.entity_id ? label.get(c.entity_id) ?? "" : "") ?? "",
      contact_kind: c.contact_kind ?? (c.name ? "student_officer" : "org_inbox"),
      exec_title: c.exec_title ?? c.role ?? "",
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      full_name: c.full_name ?? c.name ?? "",
      org_ig: c.org_ig ?? "",
      personal_ig: c.personal_ig ?? (c.name ? bare(c.instagram) : ""),
      alt_ig: c.alt_ig ?? "",
      email: c.email ?? "",
      councils_covered: c.councils_covered ?? "",
      needs_review: c.needs_review ? "yes" : "",
      review_reason: c.review_reason ?? "",
      notes: c.notes ?? "",
      source: c.source ?? "",
      dm_status: c.dm_status ?? "",
      dm_channel: c.dm_channel ?? "",
      dm_sent_at: c.dm_sent_at ? String(c.dm_sent_at).slice(0, 10) : "",
      dm_replied_at: c.dm_replied_at ? String(c.dm_replied_at).slice(0, 10) : "",
      dm_owner: c.dm_owner ?? "",
      dm_notes: c.dm_notes ?? "",
    }))
      .filter((r) => r.org_ig || r.personal_ig || r.email || r.full_name)
      .map(withContactId)
      .sort((a, b) => a.school.localeCompare(b.school) || a.council.localeCompare(b.council) || a.org_name.localeCompare(b.org_name) || a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));

    const one = data.campusId ? campuses[0] : null;
    return {
      csv: contactsToCsv(out),
      rows: out.length,
      schools: new Set(out.map((r) => r.school)).size,
      needsReview: out.filter((r) => r.needs_review === "yes").length,
      filename: data.onlyNeedsReview ? "contacts-needs-review.csv" : one ? `${one.slug ?? "campus"}-contacts.csv` : "all-schools-contacts.csv",
    };
  });

// ---- import ----------------------------------------------------------------------------------

export interface ImportPreview {
  legacy: boolean;
  parsed: number;
  cleaned: number;
  needsReview: number;
  unknownSchools: string[];
  stats: Record<string, number>;
  dropped: number;
  sample: ContactRecord[];
}
export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  needsReview: number;
  problems: string[];
  schoolsTouched: number;
  stats: Record<string, number>;
}

const RowInput = z.object(Object.fromEntries(CONTACT_COLUMNS.map((c) => [c, z.string().max(4000).default("")]))) as unknown as z.ZodType<ContactRecord>;

/** Turn a schema row back into the legacy scrape shape, so a file that has already been through
 *  the cleaner once can be re-cleaned idempotently when the caller asks for it. */
const toScrape = (r: ContactRecord): ScrapeRow => ({
  school: r.school, council: r.council, role: r.exec_title, name: r.full_name,
  instagram: r.personal_ig || r.org_ig, chapter: r.org_name, email: r.email,
});

async function resolveSchools(db: DB): Promise<{ byKey: Map<string, string>; label: Map<string, string> }> {
  const { data: rows } = await db.from("campuses").select("id,name,display_name,slug").limit(2000);
  const byKey = new Map<string, string>();
  const label = new Map<string, string>();
  for (const c of (rows ?? []) as any[]) {
    label.set(c.id, c.display_name || c.name);
    for (const alias of [c.name, c.display_name, c.slug]) {
      const k = matchKey(alias);
      if (k && !byKey.has(k)) byKey.set(k, c.id);
    }
  }
  try {
    const { ALL_SCHOOLS } = await import("@/lib/schools");
    for (const s of ALL_SCHOOLS as any[]) {
      const id = s.campusId && label.has(s.campusId) ? s.campusId : byKey.get(matchKey(s.slug));
      if (!id) continue;
      for (const alias of [s.name, s.short, s.id, s.slug]) {
        const k = matchKey(alias);
        if (k && !byKey.has(k)) byKey.set(k, id);
      }
    }
  } catch { /* static table optional */ }
  return { byKey, label };
}

/** Parse + clean, write nothing. Lets the UI show what an import will do before it does it. */
export const contactsImportPreview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ text: z.string().max(40_000_000), source: z.string().max(200).default("") }).parse(d))
  .handler(async ({ data }): Promise<ImportPreview> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const parsed = parseContactsFile(data.text);
    const source = data.source || `import @ ${new Date().toISOString().slice(0, 10)}`;

    let rows = parsed.rows;
    let stats: Record<string, number> = {};
    let droppedCount = 0;
    if (parsed.legacy) {
      const res = cleanContacts(parsed.rows.map(toScrape), source);
      rows = res.rows; stats = res.stats; droppedCount = res.dropped.length;
    } else {
      rows = rows.map(withContactId);
    }

    const { byKey } = await resolveSchools(db);
    const unknown = [...new Set(rows.filter((r) => !byKey.has(matchKey(r.school))).map((r) => r.school))].filter(Boolean);
    return {
      legacy: parsed.legacy,
      parsed: parsed.rows.length,
      cleaned: rows.length,
      needsReview: rows.filter((r) => r.needs_review === "yes").length,
      unknownSchools: unknown.slice(0, 40),
      stats,
      dropped: droppedCount,
      sample: rows.slice(0, 10),
    };
  });

/** Parse + clean and hand back EVERY row, so the page imports exactly what the preview described.
 *  Separate from the preview because the preview only carries a sample for display. */
export const contactsCleanForImport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ text: z.string().max(40_000_000), source: z.string().max(200).default("") }).parse(d))
  .handler(async ({ data }): Promise<{ rows: ContactRecord[]; legacy: boolean }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const parsed = parseContactsFile(data.text);
    const source = data.source || `import @ ${new Date().toISOString().slice(0, 10)}`;
    if (!parsed.legacy) return { rows: parsed.rows.map((r) => withContactId({ ...r, source: r.source || source })), legacy: false };
    return { rows: cleanContacts(parsed.rows.map(toScrape), source).rows, legacy: true };
  });

/** Write. Cleans a legacy file first; upserts on contact_id with a natural-key fallback. */
export const contactsImport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    rows: z.array(RowInput).max(6000),
    legacy: z.boolean().default(false),
    source: z.string().max(200).default(""),
  }).parse(d))
  .handler(async ({ data }): Promise<ImportResult> => {
    const { assertAdmin, adminSessionOk } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const who = (await adminSessionOk())?.email ?? "admin";
    const db = await admin();
    if (!(await schemaReady(db))) throw new Error(MIGRATION_HINT);
    const source = data.source || `import @ ${new Date().toISOString().slice(0, 10)}`;

    let rows: ContactRecord[] = data.rows;
    let stats: Record<string, number> = {};
    if (data.legacy) {
      const res = cleanContacts(rows.map(toScrape), source);
      rows = res.rows; stats = res.stats;
    } else {
      rows = rows.map((r) => withContactId({ ...r, source: r.source || source }));
    }

    const { byKey, label } = await resolveSchools(db);
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, needsReview: 0, problems: [], schoolsTouched: 0, stats };
    const note = (why: string) => { result.skipped++; if (result.problems.length < 60) result.problems.push(why); };

    // Resolve every school up front; refuse rows we cannot place.
    const placed: { r: ContactRecord; campusId: string }[] = [];
    for (const r of rows) {
      const campusId = byKey.get(matchKey(r.school));
      if (!campusId) { note(`${r.school || "(no school)"}: not in the campus table`); continue; }
      placed.push({ r, campusId });
    }
    if (!placed.length) return result;

    // Existing rows: by contact_id first, then by the natural key, so a re-cleaned row that landed
    // on a different id still updates the person we already have.
    const ids = placed.map((p) => p.r.contact_id).filter(Boolean);
    const existingById = new Map<string, any>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data: batch } = await db.from("growth_contact_qc").select("*").in("contact_id", ids.slice(i, i + 300));
      for (const c of (batch ?? []) as any[]) existingById.set(c.contact_id, c);
    }
    const campusesTouched = new Set(placed.map((p) => p.campusId));
    const existingByNatural = new Map<string, any>();
    for (const campusId of campusesTouched) {
      const { data: batch } = await db.from("growth_contact_qc").select("*").eq("campus_id", campusId).limit(20000);
      for (const c of (batch ?? []) as any[]) {
        const k = [campusId, (c.org_name ?? "").toLowerCase(), (c.full_name ?? c.name ?? "").toLowerCase(), (c.email ?? "").toLowerCase()].join("|");
        if (!existingByNatural.has(k)) existingByNatural.set(k, c);
      }
    }

    const nowIso = new Date().toISOString();
    const payloads: Record<string, unknown>[] = [];
    for (const { r, campusId } of placed) {
      const natural = [campusId, r.org_name.toLowerCase(), r.full_name.toLowerCase(), r.email.toLowerCase()].join("|");
      const prior = existingById.get(r.contact_id) ?? existingByNatural.get(natural) ?? null;
      const isOrg = r.contact_kind === "org_inbox" || !r.full_name;
      // The handle we would actually DM: the person's own if we have it, else the org's.
      const dmHandle = r.personal_ig || r.org_ig;

      // source accumulates, never overwrites.
      const priorSource = (prior?.source ?? "") as string;
      const nextSource = !priorSource ? (r.source || source)
        : priorSource.includes(r.source || source) ? priorSource
        : `${priorSource}; ${r.source || source}`;

      const row: Record<string, unknown> = {
        contact_id: r.contact_id,
        campus_id: campusId,
        council: r.council,
        council_type: COUNCIL_TYPE[r.council] ?? "fsl",
        org_type: r.org_type || null,
        org_name: r.org_name || null,
        contact_kind: r.contact_kind || (isOrg ? "org_inbox" : "student_officer"),
        exec_title: r.exec_title || null,
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        full_name: r.full_name || null,
        org_ig: r.org_ig || null,
        personal_ig: r.personal_ig || null,
        alt_ig: r.alt_ig || null,
        email: r.email || null,
        councils_covered: r.councils_covered || null,
        needs_review: r.needs_review === "yes",
        review_reason: r.review_reason || null,
        notes: r.notes || null,
        source: nextSource,
        // legacy columns, so every surface built before this schema keeps working
        name: r.full_name || null,
        role: r.exec_title || null,
        instagram: dmHandle ? `https://instagram.com/${dmHandle}` : null,
        entity_type: r.org_type === "office" ? "council" : r.org_type || "council",
        contact_source: r.org_type === "club" ? "growth_business_clubs" : r.org_type === "council" || r.org_type === "office" ? "campus_council_contacts" : "growth_public_contacts",
        source_id: prior?.source_id ?? crypto.randomUUID(),
        source_type: "csv_import",
        confidence: r.needs_review === "yes" ? "low" : "high",
        freshness_status: "current",
        outreach_eligible: true,
        qc_action: "approve",
        qc_by: who,
        qc_at: nowIso,
        updated_at: nowIso,
        ig_role_account: isOrg && !!r.org_ig && !r.personal_ig,
      };
      // App-owned columns: fill a blank, never blank a value.
      for (const col of APP_OWNED_COLUMNS) {
        const incoming = (r[col] ?? "").trim();
        const held = prior?.[col] ?? null;
        if (incoming) row[col] = col.endsWith("_at") ? new Date(incoming).toISOString() : incoming;
        else if (held != null) row[col] = held;
      }
      if (prior?.id) row.id = prior.id;
      if (prior?.entity_id) row.entity_id = prior.entity_id;

      payloads.push(row);
      if (prior) result.updated++; else result.inserted++;
      if (r.needs_review === "yes") result.needsReview++;
    }

    for (let i = 0; i < payloads.length; i += 250) {
      const chunk = payloads.slice(i, i + 250);
      const { error } = await db.from("growth_contact_qc").upsert(chunk, { onConflict: "contact_id" });
      if (error) {
        // Report the batch rather than pretending it wrote.
        note(`rows ${i + 1}-${i + chunk.length}: ${error.message}`);
        result.updated = Math.max(0, result.updated - chunk.length);
      }
    }
    result.schoolsTouched = campusesTouched.size;
    void label;
    return result;
  });
