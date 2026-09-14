// OUTREACH V2 — server doors for /admin/dm-v2. Pure half: lib/outreach-v2.ts.
//
// Reads the same tables the DM console does (campus_greek_chapters, growth_contact_qc, growth_ig_dm)
// and writes through the same doors (dmConsoleSaveRoster for handles, growthIgMarkSent for the sent
// tick), so V1 and V2 always agree. The campus order is the only new state: site_settings.outreachV2Order.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { mergeOrder, V2_COUNCILS, V2_PRIORITY, v2CouncilOf, type V2CouncilKey, type V2SlotKey } from "./outreach-v2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const ctx = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};
const ORDER_KEY = "outreachV2Order";

function bare(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com\/)?@?([A-Za-z0-9._]{2,40})\/?$/);
  return m ? m[1].toLowerCase() : "";
}
function slotOf(role: string | null, isOrg: boolean): V2SlotKey | null {
  if (isOrg) return "org";
  const r = (role ?? "").toLowerCase();
  if (/scholar|academ|chapter\s*develop/.test(r)) return "chair";
  if (/president/.test(r) && !/vice|\bvp\b/.test(r)) return "pres";
  return null;
}
const isOrgRow = (c: any) => !!c.ig_role_account || c.contact_type === "organization_general" || c.contact_kind === "org_inbox" || !(String(c.name ?? c.full_name ?? "").trim());

export interface V2Slot {
  contactId: string; code: string | null; name: string | null; handle: string; sentAt: string | null;
  /** Clicks on this contact's link AFTER it was marked sent (bots excluded). 0 when unsent. */
  clicksSinceSent: number;
}
export type V2Slots = Record<V2SlotKey, V2Slot | null>;
export interface V2Chapter { id: string; slug: string | null; name: string; letters: string | null; size: number | null; orgType: "fraternity" | "sorority" | null; slots: V2Slots; /** Members who joined the chapter's page. */ signups: number }
export interface V2Council { key: V2CouncilKey; label: string; name: string; slots: V2Slots; chapters: V2Chapter[] }
export interface V2CampusSummary { slug: string; label: string; cluster: string | null; campusId: string | null; slotsFilled: number; slotsSent: number; councilsSent: number }

/** The campuses, in the saved order, each with how far along it is. */
export const v2Overview = createServerFn({ method: "GET" }).handler(async (): Promise<{ campuses: V2CampusSummary[]; totals: { campuses: number; started: number; sent: number; filled: number } }> => {
  const db = await ctx();
  const { data: st } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
  const order = mergeOrder((st?.settings?.[ORDER_KEY] as string[] | undefined) ?? null);
  const { data: camps } = await db.from("campuses").select("id,slug").in("slug", order);
  const idBy = new Map<string, string>(((camps ?? []) as any[]).map((c) => [c.slug, c.id]));
  const ids = [...idBy.values()];
  const [{ data: qc }, { data: dms }] = await Promise.all([
    ids.length ? db.from("growth_contact_qc").select("id,campus_id,entity_type,council_type,council,org_type,name,full_name,role,exec_title,instagram,org_ig,personal_ig,ig_role_account,contact_type,contact_kind").in("campus_id", ids).limit(20000) : { data: [] },
    ids.length ? db.from("growth_ig_dm").select("contact_qc_id,sent_at").in("campus_id", ids).not("sent_at", "is", null).limit(20000) : { data: [] },
  ]);
  const sent = new Set(((dms ?? []) as any[]).map((d) => d.contact_qc_id));
  const stats = new Map<string, { filled: number; sent: number; councils: number }>();
  for (const c of (qc ?? []) as any[]) {
    const handle = bare(c.instagram) || bare(c.org_ig) || bare(c.personal_ig);
    if (!handle) continue;
    if (!slotOf(c.role ?? c.exec_title, isOrgRow(c))) continue;
    const s = stats.get(c.campus_id) ?? { filled: 0, sent: 0, councils: 0 };
    s.filled++;
    if (sent.has(c.id)) { s.sent++; if (c.entity_type === "council" || c.org_type === "council") s.councils++; }
    stats.set(c.campus_id, s);
  }
  const campuses = order.map((slug) => {
    const p = V2_PRIORITY.find((x) => x.slug === slug)!;
    const id = idBy.get(slug) ?? null;
    const s = id ? stats.get(id) : undefined;
    return { slug, label: p.label, cluster: p.cluster ?? null, campusId: id, slotsFilled: s?.filled ?? 0, slotsSent: s?.sent ?? 0, councilsSent: s?.councils ?? 0 };
  });
  return {
    campuses,
    totals: { campuses: campuses.length, started: campuses.filter((c) => c.slotsSent > 0).length, sent: campuses.reduce((a, c) => a + c.slotsSent, 0), filled: campuses.reduce((a, c) => a + c.slotsFilled, 0) },
  };
});

export const v2SaveOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ order: z.array(z.string().min(1).max(120)).max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await ctx();
    const { data: st } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
    const settings = { ...(st?.settings ?? {}), [ORDER_KEY]: mergeOrder(data.order) };
    const { error } = await db.from("site_settings").upsert({ id: 1, settings, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface V2CampusData {
  slug: string; label: string; campusId: string; courseCode: string | null; campusShort: string; campusName: string;
  councils: V2Council[];
}

/** One campus: the three councils, each with its three slots and its chapters (biggest first). */
export const v2Campus = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<V2CampusData | null> => {
    const db = await ctx();
    const { data: campus } = await db.from("campuses").select("id,slug,name,short_name,course_family_codes_json").eq("slug", data.slug).maybeSingle();
    if (!campus?.id) return null;
    const { schoolBySlug } = await import("@/lib/schools");
    const school = schoolBySlug(data.slug);
    const raw = campus.course_family_codes_json;
    const codes = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
    const courseCode = school?.courseCode ?? ((((codes?.intro_1 ?? "") as string).trim()) || null);
    const label = V2_PRIORITY.find((p) => p.slug === data.slug)?.label ?? school?.name ?? (campus.short_name as string) ?? (campus.name as string);

    const [{ data: chapters }, { data: qc }, { data: dms }] = await Promise.all([
      db.from("campus_greek_chapters").select("id,slug,council,greek_org_id,letters,nickname,chapter_size,chapter_designation").eq("campus_id", campus.id).is("archived_at", null).limit(2000),
      db.from("growth_contact_qc").select("id,contact_id,entity_type,entity_id,council_type,council,org_type,org_name,name,full_name,role,exec_title,instagram,org_ig,personal_ig,ig_role_account,contact_type,contact_kind,email,first_name").eq("campus_id", campus.id).limit(8000),
      db.from("growth_ig_dm").select("contact_qc_id,sent_at").eq("campus_id", campus.id).limit(8000),
    ]);
    // CLICKS AND SIGNUPS (Lee, 2026-09-14: "show whether the link was clicked on the row … only count the
    // clicks AFTER it has been marked sent … and a person icon and # of signups").
    const [{ data: visits }, { data: shells }] = await Promise.all([
      db.from("contact_ref_visit").select("contact_id,created_at,is_bot").eq("campus_id", campus.id).limit(20000),
      db.from("greek_chapters").select("id,campus_greek_chapter_id").eq("campus_id", campus.id).limit(2000),
    ]);
    const visitsBy = new Map<string, string[]>();
    for (const v of (visits ?? []) as any[]) { if (v.is_bot || !v.contact_id) continue; const l = visitsBy.get(v.contact_id) ?? []; l.push(v.created_at); visitsBy.set(v.contact_id, l); }
    const rosterOfShell = new Map<string, string>(((shells ?? []) as any[]).filter((s) => s.campus_greek_chapter_id).map((s) => [s.id, s.campus_greek_chapter_id]));
    const signupsBy = new Map<string, number>();
    if (rosterOfShell.size) {
      const { data: members } = await db.from("greek_chapter_members").select("chapter_id").in("chapter_id", [...rosterOfShell.keys()]).limit(20000);
      for (const m of (members ?? []) as any[]) { const r = rosterOfShell.get(m.chapter_id); if (r) signupsBy.set(r, (signupsBy.get(r) ?? 0) + 1); }
    }
    const clicksSince = (contactId: string, sentAt: string | null) => (sentAt ? (visitsBy.get(contactId) ?? []).filter((t) => t >= sentAt).length : 0);
    const orgIds = Array.from(new Set(((chapters ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean)));
    const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name,letters,org_type").in("id", orgIds) : { data: [] };
    const orgById = new Map<string, any>(((orgs ?? []) as any[]).map((o) => [o.id, o]));
    const sentBy = new Map<string, string | null>(((dms ?? []) as any[]).map((d) => [d.contact_qc_id, d.sent_at ?? null]));

    // Mint the short /l/<code> for rows that predate it (same rule as the links page).
    const { contactId: stableContactId } = await import("@/lib/growth-contacts-schema");
    for (const c of ((qc ?? []) as any[]).filter((x) => !x.contact_id)) {
      const code = stableContactId({ school: campus.name as string, council: (c.council as string | null) ?? (c.council_type ?? ""), org_name: (c.org_name as string | null) ?? "", full_name: (c.full_name as string | null) ?? (c.name as string | null) ?? "", personal_ig: bare(c.personal_ig), org_ig: bare(c.org_ig) || bare(c.instagram), email: ((c.email as string | null) ?? "").toLowerCase() });
      const { error } = await db.from("growth_contact_qc").update({ contact_id: code }).eq("id", c.id).is("contact_id", null);
      if (!error) c.contact_id = code;
    }

    const empty = (): V2Slots => ({ org: null, pres: null, chair: null });
    const byChapter = new Map<string, V2Slots>();
    const byCouncil = new Map<V2CouncilKey, V2Slots>();
    for (const c of (qc ?? []) as any[]) {
      const handle = bare(c.instagram) || (isOrgRow(c) ? bare(c.org_ig) : bare(c.personal_ig)) || bare(c.org_ig) || bare(c.personal_ig);
      if (!handle) continue;
      const slot = slotOf(c.role ?? c.exec_title, isOrgRow(c));
      if (!slot) continue;
      const sentAt = sentBy.get(c.id) ?? null;
      const s: V2Slot = { contactId: c.id, code: c.contact_id ?? null, name: (c.name ?? c.full_name ?? null) || null, handle, sentAt, clicksSinceSent: clicksSince(c.id, sentAt) };
      if (c.entity_type === "chapter" && c.entity_id) {
        const b = byChapter.get(c.entity_id) ?? empty();
        if (!b[slot]) b[slot] = s;
        byChapter.set(c.entity_id, b);
      } else if (c.entity_type === "council" || c.org_type === "council") {
        const key = v2CouncilOf(c.council_type ?? c.council);
        if (!key) continue;
        const b = byCouncil.get(key) ?? empty();
        if (!b[slot]) b[slot] = s;
        byCouncil.set(key, b);
      }
    }

    const councils: V2Council[] = V2_COUNCILS.map((k) => ({
      key: k.key, label: k.label, name: k.name, slots: byCouncil.get(k.key) ?? empty(),
      chapters: ((chapters ?? []) as any[])
        .filter((ch) => v2CouncilOf(ch.council) === k.key)
        .map((ch) => {
          const org = ch.greek_org_id ? orgById.get(ch.greek_org_id) : null;
          return {
            id: ch.id as string, slug: (ch.slug as string | null) ?? null,
            name: (org?.name as string) || (ch.nickname as string) || (ch.chapter_designation as string) || "Chapter",
            letters: (ch.letters as string) || (org?.letters as string) || null,
            size: (ch.chapter_size as number | null) ?? null,
            orgType: org?.org_type === "fraternity" || org?.org_type === "sorority" ? (org.org_type as "fraternity" | "sorority") : null,
            slots: byChapter.get(ch.id) ?? empty(),
            signups: signupsBy.get(ch.id) ?? 0,
          };
        })
        .sort((a, b) => (b.size ?? -1) - (a.size ?? -1) || a.name.localeCompare(b.name)),
    }));
    return { slug: data.slug, label, campusId: campus.id as string, courseCode, campusShort: label, campusName: (campus.name as string) ?? label, councils };
  });
