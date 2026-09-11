// OUTREACH LINKS — the server layer behind /admin/growth/links (2026-09-11).
//
// One campus at a time: every growth_contact_qc row on it (the 25-column contract the CSV
// importer writes, plus the legacy columns older imports filled), each contact's DM state from
// growth_ig_dm (what the DM console's "sent" tick writes) and its link clicks from
// contact_ref_visit — and the site's own chapter list, so the page shows every chapter on the
// site whether or not anyone has found its account yet.
//
// LAW: ships to the client bundle — service-role client + admin gate imported dynamically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { contactId as stableContactId } from "@/lib/growth-contacts-schema";
import type { LinkCampus, LinkContact, SiteChapter } from "@/lib/outreach-links";
import { cleanHandle, groupOf, linkFor, matchChapter, withContactRef } from "@/lib/outreach-links";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const adminCtx = async (): Promise<{ db: DB; who: string }> => {
  const { assertAdmin, adminSessionOk } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const s = await adminSessionOk().catch(() => null);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as unknown as DB, who: s?.email ?? "admin" };
};

const COUNCIL_TYPE_LABEL: Record<string, string> = { ifc: "IFC", panhellenic: "Panhellenic", nphc: "NPHC", mgc: "MGC", fsl: "FSL Office", wib: "Campus Club" };

export interface OutreachCampusData {
  campus: LinkCampus;
  chapters: SiteChapter[];
  contacts: LinkContact[];
}

/** Everything the links page needs for one campus. */
export const outreachLinksCampus = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusSlug: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<OutreachCampusData | null> => {
    const { db } = await adminCtx();
    const { data: campus } = await db.from("campuses").select("id,name,display_name,short_name,slug,course_family_codes_json").eq("slug", data.campusSlug).maybeSingle();
    if (!campus?.id) return null;
    const raw = campus.course_family_codes_json;
    const codes = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
    const { schoolBySlug } = await import("@/lib/schools");
    const school = schoolBySlug(data.campusSlug);
    const courseCode = school?.courseCode ?? (((codes?.intro_1 ?? "") as string).trim() || null);

    const [{ data: chRows }, { data: qc }, { data: dms }, { data: visits }] = await Promise.all([
      db.from("campus_greek_chapters").select("slug,greek_org_id,nickname,letters,council,archived_at").eq("campus_id", campus.id).not("slug", "is", null).limit(600),
      db.from("growth_contact_qc").select("id,contact_id,council,council_type,org_type,org_name,contact_kind,exec_title,first_name,last_name,full_name,org_ig,personal_ig,alt_ig,email,needs_review,review_reason,dm_status,dm_channel,dm_sent_at,name,role,instagram,entity_type,ig_role_account,contact_type,outreach_eligible").eq("campus_id", campus.id).limit(5000),
      db.from("growth_ig_dm").select("contact_qc_id,sent_at").eq("campus_id", campus.id).limit(5000),
      db.from("contact_ref_visit").select("contact_id,is_bot").eq("campus_id", campus.id).limit(20000),
    ]);

    const orgIds = Array.from(new Set(((chRows ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean))) as string[];
    const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name").in("id", orgIds) : { data: [] };
    const orgName = new Map<string, string>(((orgs ?? []) as any[]).map((o) => [o.id, (o.name ?? "").trim()]));
    const chapters: SiteChapter[] = ((chRows ?? []) as any[])
      .filter((c) => !c.archived_at)
      .map((c) => ({ slug: c.slug as string, name: (c.greek_org_id && orgName.get(c.greek_org_id)) || (c.nickname as string) || (c.slug as string), council: (c.council as string | null) ?? null, nickname: (c.nickname as string | null) ?? null, letters: (c.letters as string | null) ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const sentBy = new Map<string, string | null>(((dms ?? []) as any[]).map((d) => [d.contact_qc_id, d.sent_at ?? null]));
    const clicks = new Map<string, number>();
    for (const v of (visits ?? []) as any[]) { if (v.is_bot || !v.contact_id) continue; clicks.set(v.contact_id, (clicks.get(v.contact_id) ?? 0) + 1); }

    // THE SHORT CODE for rows that predate the 25-column import (no contact_id): minted from the
    // same fields the importer hashes, written back once, so /l/<code> works for every contact.
    const missing = ((qc ?? []) as any[]).filter((c) => !c.contact_id);
    for (const c of missing) {
      const code = stableContactId({ school: campus.name as string, council: (c.council as string | null) ?? COUNCIL_TYPE_LABEL[(c.council_type as string | null) ?? ""] ?? "", org_name: (c.org_name as string | null) ?? "", full_name: (c.full_name as string | null) ?? (c.name as string | null) ?? "", personal_ig: cleanHandle(c.personal_ig), org_ig: cleanHandle(c.org_ig) || cleanHandle(c.instagram), email: ((c.email as string | null) ?? "").toLowerCase() });
      const { error } = await db.from("growth_contact_qc").update({ contact_id: code }).eq("id", c.id).is("contact_id", null);
      if (!error) c.contact_id = code;
    }

    const contacts: LinkContact[] = ((qc ?? []) as any[])
      .filter((c) => c.outreach_eligible !== false)
      .map((c) => {
        // Rows from older imports carry only the legacy columns (name/role/instagram/entity_type);
        // read those when the 25-column ones are blank so nothing already in the table goes missing.
        const legacyHandle = cleanHandle(c.instagram);
        const isOrgRow = !!c.ig_role_account || c.contact_type === "organization_general" || c.contact_kind === "org_inbox";
        const orgType = (c.org_type as string | null) || (c.entity_type === "council" ? "council" : c.entity_type === "club" ? "club" : c.entity_type === "chapter" ? "chapter" : "");
        const council = (c.council as string | null) || COUNCIL_TYPE_LABEL[(c.council_type as string | null) ?? ""] || "";
        return {
          id: c.id as string,
          contactId: (c.contact_id as string | null) ?? null,
          orgType: orgType as LinkContact["orgType"],
          council,
          orgName: ((c.org_name as string | null) ?? "").trim(),
          contactKind: ((c.contact_kind as string | null) || (isOrgRow ? "org_inbox" : "student_officer")) as LinkContact["contactKind"],
          execTitle: ((c.exec_title as string | null) ?? (c.role as string | null) ?? "").trim(),
          firstName: ((c.first_name as string | null) ?? "").trim(),
          fullName: ((c.full_name as string | null) ?? (isOrgRow ? "" : (c.name as string | null)) ?? "").trim(),
          orgIg: cleanHandle(c.org_ig) || (isOrgRow ? legacyHandle : ""),
          personalIg: cleanHandle(c.personal_ig) || (!isOrgRow ? legacyHandle : ""),
          altIg: cleanHandle(c.alt_ig),
          email: ((c.email as string | null) ?? "").trim(),
          needsReview: !!c.needs_review,
          reviewReason: ((c.review_reason as string | null) ?? "").trim(),
          dmStatus: ((c.dm_status as string | null) ?? "").trim(),
          dmChannel: ((c.dm_channel as string | null) ?? "").trim(),
          dmSentAt: (c.dm_sent_at as string | null) ?? null,
          igSentAt: sentBy.get(c.id) ?? null,
          clicks: clicks.get(c.id) ?? 0,
        };
      });

    const label = school?.name ?? (campus.short_name as string | null) ?? (campus.display_name as string | null) ?? (campus.name as string);
    return {
      campus: { slug: data.campusSlug, label, courseCode, campusId: campus.id as string, siteChapters: chapters.length },
      chapters,
      contacts,
    };
  });

/** Mark a contact's DM sent (or not). Writes BOTH places the site reads: growth_ig_dm (the DM
 *  console's tick, follow-up timing, the Today list) and the contact row's own dm_status /
 *  dm_channel / dm_sent_at (the CSV contract, exported with the contacts). */
export const outreachMarkSent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    sent: z.boolean(),
    channel: z.enum(["org_ig", "personal_ig", "email"]).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; sentAt: string | null }> => {
    const { db, who } = await adminCtx();
    const now = data.sent ? new Date().toISOString() : null;
    const { data: qc } = await db.from("growth_contact_qc").select("id,campus_id,council_type").eq("id", data.id).maybeSingle();
    if (!qc?.id) return { ok: false, sentAt: null };
    await db.from("growth_ig_dm").upsert(
      { contact_qc_id: data.id, campus_id: qc.campus_id ?? null, council_type: qc.council_type ?? null, updated_at: new Date().toISOString(), sent_at: now, sent_by: data.sent ? who : null },
      { onConflict: "contact_qc_id" },
    );
    const { error } = await db.from("growth_contact_qc")
      .update({ dm_status: data.sent ? "sent" : "", dm_channel: data.sent ? (data.channel ?? "personal_ig") : "", dm_sent_at: now, dm_owner: data.sent ? who : null, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) console.warn("[outreach] dm_status update failed:", error.message);
    return { ok: true, sentAt: now };
  });

const contactInput = z.object({
  campusSlug: z.string().trim().min(1).max(80),
  /** Present → update this row; absent → insert. */
  id: z.string().uuid().optional(),
  orgType: z.enum(["council", "office", "chapter", "club"]),
  council: z.string().trim().max(40),
  orgName: z.string().trim().min(1).max(160),
  contactKind: z.enum(["org_inbox", "student_officer", "staff"]),
  execTitle: z.string().trim().max(120).default(""),
  fullName: z.string().trim().max(160).default(""),
  orgIg: z.string().trim().max(120).default(""),
  personalIg: z.string().trim().max(120).default(""),
  email: z.string().trim().max(200).default(""),
});

/** Add or edit a contact from the links page. Same row shape and same stable id rule as the CSV
 *  importer (growth-contacts-io.functions.ts), so a later import updates this row instead of
 *  duplicating it. */
export const outreachSaveContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => contactInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; error?: string }> => {
    const { db, who } = await adminCtx();
    const { data: campus } = await db.from("campuses").select("id,name").eq("slug", data.campusSlug).maybeSingle();
    if (!campus?.id) return { ok: false, error: "Unknown campus." };
    const orgIg = cleanHandle(data.orgIg), personalIg = cleanHandle(data.personalIg);
    const email = data.email.toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "That email doesn't look right." };
    const fullName = data.contactKind === "org_inbox" ? "" : data.fullName;
    if (data.contactKind !== "org_inbox" && !fullName) return { ok: false, error: "A person needs a name." };
    if (!orgIg && !personalIg && !email) return { ok: false, error: "Add an Instagram handle or an email." };
    const [first, ...rest] = fullName.split(/\s+/).filter(Boolean);
    const councilType: Record<string, string> = { IFC: "ifc", Panhellenic: "panhellenic", NPHC: "nphc", MGC: "mgc", "Campus Club": "wib", "FSL Office": "fsl" };
    const now = new Date().toISOString();
    const dmHandle = personalIg || orgIg;
    const isOrg = data.contactKind === "org_inbox";
    const row: Record<string, unknown> = {
      campus_id: campus.id,
      council: data.council || (data.orgType === "office" ? "FSL Office" : data.orgType === "club" ? "Campus Club" : "Other"),
      council_type: councilType[data.council] ?? (data.orgType === "office" ? "fsl" : data.orgType === "club" ? "wib" : "fsl"),
      org_type: data.orgType,
      org_name: data.orgName,
      contact_kind: data.contactKind,
      exec_title: data.execTitle || null,
      first_name: first ?? null,
      last_name: rest.length ? rest.join(" ") : null,
      full_name: fullName || null,
      org_ig: orgIg || null,
      personal_ig: personalIg || null,
      email: email || null,
      // legacy columns, so every surface built before the 25-column schema keeps working
      name: fullName || null,
      role: data.execTitle || null,
      instagram: dmHandle ? `https://instagram.com/${dmHandle}` : null,
      entity_type: data.orgType === "office" ? "council" : data.orgType,
      contact_type: isOrg ? "organization_general" : data.contactKind === "staff" ? "staff_advisor" : "student_officer",
      ig_role_account: isOrg && !!orgIg && !personalIg,
      outreach_eligible: true,
      freshness_status: "current",
      confidence: "high",
      qc_action: "approve",
      qc_by: who,
      qc_at: now,
      updated_at: now,
    };
    if (data.id) {
      const { error } = await db.from("growth_contact_qc").update(row).eq("id", data.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: data.id };
    }
    const contactSource = data.orgType === "club" ? "growth_business_clubs" : data.orgType === "council" || data.orgType === "office" ? "campus_council_contacts" : "growth_public_contacts";
    const insert = {
      ...row,
      contact_id: stableContactId({ school: campus.name as string, council: String(row.council), org_name: data.orgName, full_name: fullName, personal_ig: personalIg, org_ig: orgIg, email }),
      contact_source: contactSource,
      source_id: crypto.randomUUID(),
      source_type: "manual_entry",
      source: `links page (${who})`,
    };
    const { data: ins, error } = await db.from("growth_contact_qc").insert(insert).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: ins?.id as string | undefined };
  });

/** Remove a contact the page added by mistake. Soft: the row stays but leaves every outreach list. */
export const outreachRetireContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { db } = await adminCtx();
    await db.from("growth_contact_qc").update({ outreach_eligible: false, updated_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

/** /l/<code> → the contact's page with ?ref=. Public (no admin gate): a DM recipient hits this.
 *  Looks the contact up by the 12-hex contact_id (or, as a fallback, the row uuid). */
export const resolveDmLink = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(6).max(40).regex(/^[0-9a-f-]+$/i) }).parse(d))
  .handler(async ({ data }): Promise<{ href: string } | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as DB;
    const code = data.code.toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(code);
    const { data: c } = await db.from("growth_contact_qc")
      .select("id,campus_id,council,council_type,org_type,org_name,entity_type,entity_id")
      .eq(isUuid ? "id" : "contact_id", code).maybeSingle();
    if (!c?.id || !c.campus_id) return null;
    const { data: campus } = await db.from("campuses").select("id,slug").eq("id", c.campus_id).maybeSingle();
    if (!campus?.slug) return null;
    const { data: chRows } = await db.from("campus_greek_chapters").select("id,slug,greek_org_id,nickname,letters").eq("campus_id", campus.id).is("archived_at", null).not("slug", "is", null).limit(600);
    const chapters = (chRows ?? []) as any[];
    const orgIds = Array.from(new Set(chapters.map((x) => x.greek_org_id).filter(Boolean)));
    const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name").in("id", orgIds) : { data: [] };
    const orgName = new Map<string, string>(((orgs ?? []) as any[]).map((o) => [o.id, o.name]));
    const site = chapters.map((x) => ({ slug: x.slug as string, name: (orgName.get(x.greek_org_id) ?? x.nickname ?? x.slug) as string, council: null, nickname: (x.nickname as string | null) ?? null, letters: (x.letters as string | null) ?? null }));
    const orgType = ((c.org_type as string | null) || (c.entity_type === "council" ? "council" : c.entity_type === "club" ? "club" : c.entity_type === "chapter" ? "chapter" : "")) as "council" | "office" | "chapter" | "club" | "";
    const council = (c.council as string | null) || COUNCIL_TYPE_LABEL[(c.council_type as string | null) ?? ""] || "";
    const group = groupOf({ council, orgType });
    let org: { kind: "council" | "office" | "chapter" | "club"; slug: string; onSite: boolean; group: string };
    if (orgType === "chapter") {
      const byId = c.entity_type === "chapter" && c.entity_id ? chapters.find((x) => x.id === c.entity_id) : null;
      const hit = byId ? { slug: byId.slug as string } : matchChapter((c.org_name as string | null) ?? "", site);
      org = { kind: "chapter", slug: hit?.slug ?? "", onSite: !!hit, group };
    } else if (orgType === "office") org = { kind: "office", slug: "", onSite: true, group: "FSL Office" };
    else if (orgType === "club") org = { kind: "club", slug: "", onSite: false, group: "Campus Club" };
    else org = { kind: "council", slug: ({ IFC: "ifc", Panhellenic: "panhellenic", NPHC: "nphc", MGC: "mgc" } as Record<string, string>)[group] ?? "", onSite: true, group };
    const path = withContactRef(linkFor(campus.slug as string, org, site.length > 0).path, c.id as string);
    return { href: path };
  });
