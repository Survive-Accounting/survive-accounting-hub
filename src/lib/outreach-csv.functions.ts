// COLD OUTREACH CSV — import and export, one school or all of them.
//
// Export hands back every stored contact in the agreed shape. Import reads that same shape and
// files each row under the right school, council and chapter.
//
// MATCHING IS EXPLICIT, NEVER A GUESS. A school or council we cannot recognise is REPORTED back
// with its line number, not filed under a default — a contact under the wrong campus is worse than
// a contact that failed to import, because nobody ever finds it again. Chapter is the one soft
// field: an unmatched chapter name still imports (the contact lands on the council, keeping its
// chapter written down as text) because a misspelt house is not a reason to lose a scholarship
// chair's handle.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  COUNCIL_EXPORT_LABEL, councilKeyFromLabel, csvEmail, csvHandle, matchKey, toCsv,
  type ContactCsvRow,
} from "@/lib/outreach-csv";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention shared with the other growth modules
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const bareStored = (v: string | null): string => {
  const s = (v ?? "").trim();
  if (!s) return "";
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  return (m ? m[1] : s).replace(/^@+/, "").replace(/\/+$/, "");
};

// ---- export ----------------------------------------------------------------------------------

export interface CsvExport { csv: string; rows: number; schools: number; filename: string }

/** Every contact for one campus, or for all of them when campusId is omitted. */
export const outreachExportCsv = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid().nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<CsvExport> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();

    // CONTACTS FIRST, campuses second. Selecting every campus and filtering contacts by
    // `.in(campus_id, [~1000 uuids])` builds a URL long enough to be rejected, which came back as
    // an empty export rather than an error. Read the contacts, then look up only the campuses they
    // actually reference. PostgREST caps a response at 1000 rows whatever the limit says, so page.
    const contacts: any[] = [];
    for (let page = 0; page < 60; page++) {
      const from = page * 1000;
      let q = db.from("growth_contact_qc")
        .select("campus_id,entity_type,entity_id,council_type,name,role,instagram,email,chapter_affiliation,contact_type,ig_role_account,outreach_eligible")
        .order("campus_id", { ascending: true }).range(from, from + 999);
      if (data.campusId) q = q.eq("campus_id", data.campusId);
      const { data: batch, error } = await q;
      if (error) throw new Error(`Could not read contacts: ${error.message}`);
      const rows = (batch ?? []) as any[];
      contacts.push(...rows);
      if (rows.length < 1000) break;
    }

    const campusIds = Array.from(new Set(contacts.map((c) => c.campus_id).filter(Boolean)));
    const campuses: any[] = [];
    for (let i = 0; i < campusIds.length; i += 200) {
      const { data: batch } = await db.from("campuses").select("id,name,display_name,slug").in("id", campusIds.slice(i, i + 200));
      campuses.push(...((batch ?? []) as any[]));
    }
    if (data.campusId && !campuses.length) {
      const { data: one } = await db.from("campuses").select("id,name,display_name,slug").eq("id", data.campusId).maybeSingle();
      if (one) campuses.push(one);
    }
    const campusName = new Map<string, string>(campuses.map((c) => [c.id, c.display_name || c.name]));

    // Chapter and club names, so the Chapter column carries something a human recognises.
    const chapterIds = Array.from(new Set(contacts.filter((c) => c.entity_type === "chapter" && c.entity_id).map((c) => c.entity_id)));
    const clubIds = Array.from(new Set(contacts.filter((c) => c.entity_type === "club" && c.entity_id).map((c) => c.entity_id)));
    const chapterLabel = new Map<string, string>();
    if (chapterIds.length) {
      for (let i = 0; i < chapterIds.length; i += 200) {
        const slice = chapterIds.slice(i, i + 200);
        const { data: chs } = await db.from("campus_greek_chapters").select("id,greek_org_id,nickname,chapter_designation").in("id", slice);
        const orgIds = Array.from(new Set(((chs ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean)));
        const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name").in("id", orgIds) : { data: [] };
        const orgName = new Map<string, string>(((orgs ?? []) as any[]).map((o) => [o.id, o.name]));
        for (const c of (chs ?? []) as any[]) chapterLabel.set(c.id, orgName.get(c.greek_org_id) ?? c.nickname ?? c.chapter_designation ?? "");
      }
    }
    if (clubIds.length) {
      const { data: clubs } = await db.from("growth_business_clubs").select("id,name").in("id", clubIds);
      for (const c of (clubs ?? []) as any[]) chapterLabel.set(c.id, c.name);
    }

    const out: Omit<ContactCsvRow, "line">[] = contacts
      .filter((c) => c.outreach_eligible !== false || bareStored(c.instagram) || c.email)
      .map((c) => ({
        school: campusName.get(c.campus_id) ?? "",
        council: c.entity_type === "club" ? COUNCIL_EXPORT_LABEL.wib : COUNCIL_EXPORT_LABEL[c.council_type ?? ""] ?? (c.council_type ? String(c.council_type).toUpperCase() : COUNCIL_EXPORT_LABEL.fsl),
        role: c.role ?? "",
        name: c.name ?? "",
        instagram: bareStored(c.instagram),
        chapter: (c.entity_id ? chapterLabel.get(c.entity_id) : "") || c.chapter_affiliation || "",
        email: c.email ?? "",
      }))
      .filter((r) => r.instagram || r.email)
      .sort((a, b) => a.school.localeCompare(b.school) || a.council.localeCompare(b.council) || a.chapter.localeCompare(b.chapter) || a.name.localeCompare(b.name));

    const one = data.campusId ? campuses[0] : null;
    const filename = one ? `${(one.slug ?? "campus")}-contacts.csv` : "all-schools-contacts.csv";
    return { csv: toCsv(out), rows: out.length, schools: new Set(out.map((r) => r.school)).size, filename };
  });

// ---- import ----------------------------------------------------------------------------------

export interface CsvImportResult {
  added: number;
  updated: number;
  skipped: number;
  /** Line-numbered reasons, so a bad file is fixable rather than mysterious. */
  problems: string[];
  schoolsTouched: string[];
}

const ImportRow = z.object({
  school: z.string().trim().max(200).default(""),
  council: z.string().trim().max(80).default(""),
  role: z.string().trim().max(120).default(""),
  name: z.string().trim().max(160).default(""),
  instagram: z.string().trim().max(200).default(""),
  chapter: z.string().trim().max(200).default(""),
  email: z.string().trim().max(200).default(""),
  line: z.number().int().default(0),
});

/** Write parsed rows. `campusId` pins a single-school import: rows naming a different school are
 *  refused rather than redirected. Omit it for an all-schools file and every row is resolved by
 *  its School column. */
export const outreachImportCsv = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    campusId: z.string().uuid().nullable().optional(),
    rows: z.array(ImportRow).max(5000),
  }).parse(d))
  .handler(async ({ data }): Promise<CsvImportResult> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const { growthAddContact, growthUpdateContact } = await import("@/lib/growth-reach.functions");

    const res: CsvImportResult = { added: 0, updated: 0, skipped: 0, problems: [], schoolsTouched: [] };
    const note = (line: number, why: string) => { res.skipped++; if (res.problems.length < 60) res.problems.push(`Line ${line}: ${why}`); };

    // --- resolve schools -----------------------------------------------------------------------
    const { data: campusRows } = await db.from("campuses").select("id,name,display_name,slug").limit(2000);
    const campuses = (campusRows ?? []) as any[];
    const campusByKey = new Map<string, string>();
    const campusLabel = new Map<string, string>();
    for (const c of campuses) {
      campusLabel.set(c.id, c.display_name || c.name);
      for (const alias of [c.name, c.display_name, c.slug]) {
        const k = matchKey(alias);
        if (k && !campusByKey.has(k)) campusByKey.set(k, c.id);
      }
    }
    // The static school table carries the short names people actually type ("Ole Miss", "LSU").
    try {
      const { ALL_SCHOOLS } = await import("@/lib/schools");
      for (const s of ALL_SCHOOLS as any[]) {
        const id = s.campusId && campusLabel.has(s.campusId) ? s.campusId : campusByKey.get(matchKey(s.slug));
        if (!id) continue;
        for (const alias of [s.name, s.short, s.id, s.slug]) {
          const k = matchKey(alias);
          if (k && !campusByKey.has(k)) campusByKey.set(k, id);
        }
      }
    } catch { /* static table optional — DB names still resolve */ }

    const pinned = data.campusId ?? null;
    if (pinned && !campusLabel.has(pinned)) return { ...res, problems: ["That campus is not in the campus table."] };

    // --- group rows by campus so chapter lookups happen once per school ------------------------
    const byCampus = new Map<string, typeof data.rows>();
    for (const r of data.rows) {
      let campusId = pinned;
      if (r.school) {
        const found = campusByKey.get(matchKey(r.school));
        if (!found) { note(r.line, `school "${r.school}" is not in the campus table`); continue; }
        if (pinned && found !== pinned) { note(r.line, `row is for ${r.school}, which is not the school being imported`); continue; }
        campusId = found;
      }
      if (!campusId) { note(r.line, "no School column and no school selected"); continue; }
      const list = byCampus.get(campusId) ?? [];
      list.push(r);
      byCampus.set(campusId, list);
    }

    for (const [campusId, rows] of byCampus) {
      // Chapters for this campus, by every name they might be written under.
      const { data: chapters } = await db.from("campus_greek_chapters")
        .select("id,council,greek_org_id,letters,nickname,chapter_designation,slug").eq("campus_id", campusId).is("archived_at", null).limit(2000);
      const orgIds = Array.from(new Set(((chapters ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean)));
      const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name,nickname,letters").in("id", orgIds) : { data: [] };
      const orgById = new Map<string, any>(((orgs ?? []) as any[]).map((o) => [o.id, o]));
      const chapterByKey = new Map<string, string>();
      for (const ch of (chapters ?? []) as any[]) {
        const org = ch.greek_org_id ? orgById.get(ch.greek_org_id) : null;
        for (const alias of [org?.name, org?.nickname, org?.letters, ch.nickname, ch.letters, ch.chapter_designation, ch.slug]) {
          const k = matchKey(alias);
          if (k && !chapterByKey.has(k)) chapterByKey.set(k, ch.id);
        }
      }
      // Business clubs, for Women in Business rows.
      const { data: clubRows } = await db.from("growth_business_clubs").select("id,name,category").eq("campus_id", campusId).limit(200);
      const clubs = (clubRows ?? []) as any[];

      // Existing contacts, so a re-import updates rather than duplicating.
      const { data: existingRows } = await db.from("growth_contact_qc")
        .select("id,entity_type,entity_id,council_type,name,role,instagram,email").eq("campus_id", campusId).limit(20000);
      const existing = (existingRows ?? []) as any[];
      const byHandle = new Map<string, string>();
      const byEmail = new Map<string, string>();
      for (const c of existing) {
        const h = bareStored(c.instagram).toLowerCase();
        if (h && !byHandle.has(h)) byHandle.set(h, c.id);
        const e = (c.email ?? "").trim().toLowerCase();
        if (e && !byEmail.has(e)) byEmail.set(e, c.id);
      }

      for (const r of rows) {
        const handle = csvHandle(r.instagram);
        const email = csvEmail(r.email);
        if (r.instagram && !handle) { note(r.line, `"${r.instagram}" is not a usable Instagram handle`); continue; }
        if (r.email && !email) { note(r.line, `"${r.email}" is not a usable email`); continue; }
        if (!handle && !email) { note(r.line, "no Instagram handle and no email"); continue; }

        const councilKey = councilKeyFromLabel(r.council);
        if (!councilKey) { note(r.line, r.council ? `council "${r.council}" not recognised` : "no Council value"); continue; }

        // Where does this contact hang: a chapter, a business club, or the council itself.
        let entityType: "chapter" | "council" | "club" = "council";
        let entityId: string | null = null;
        if (councilKey === "wib") {
          entityType = "club";
          entityId = clubs.find((c) => c.category === "women_in_business")?.id ?? null;
          if (!entityId) {
            const { data: made } = await db.from("growth_business_clubs")
              .insert({ campus_id: campusId, name: r.chapter || "Women in Business", category: "women_in_business", normalized_name: matchKey(r.chapter || "women in business"), source_url: "csv_import", source_type: "manual_entry" })
              .select("id").maybeSingle();
            entityId = made?.id ?? null;
            if (entityId) clubs.push({ id: entityId, name: r.chapter || "Women in Business", category: "women_in_business" });
          }
        } else if (r.chapter) {
          const found = chapterByKey.get(matchKey(r.chapter));
          if (found) { entityType = "chapter"; entityId = found; }
          // Unmatched chapter: keep the contact on the council, with the name retained as text.
        }

        const prior = (handle && byHandle.get(handle)) || (email && byEmail.get(email)) || null;
        const isOrg = !r.name.trim();
        if (prior) {
          const u = await growthUpdateContact({
            data: {
              qcId: prior,
              ...(handle ? { instagram: handle } : {}),
              ...(email ? { email } : {}),
              ...(r.name.trim() ? { name: r.name.trim() } : {}),
              ...(r.role.trim() ? { role: r.role.trim() } : {}),
              igRoleAccount: isOrg,
            },
          });
          if (u?.ok === false && u.error) note(r.line, u.error);
          else res.updated++;
          continue;
        }
        const a = await growthAddContact({
          data: {
            campusId,
            entityType,
            entityId,
            councilType: entityType === "council" ? councilKey : null,
            contactType: isOrg ? "organization_general" : "student_officer",
            name: isOrg ? null : r.name.trim(),
            role: r.role.trim() || null,
            email: email || null,
            instagram: handle || null,
            chapter: r.chapter || null,
            igRoleAccount: isOrg,
          },
        });
        if (a.ok) {
          res.added++;
          if (a.qcId) { if (handle) byHandle.set(handle, a.qcId); if (email) byEmail.set(email, a.qcId); }
        } else note(r.line, a.error ?? "could not save");
      }
      res.schoolsTouched.push(campusLabel.get(campusId) ?? campusId);
    }

    return res;
  });
