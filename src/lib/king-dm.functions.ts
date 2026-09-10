// THE DM CONSOLE — server layer for /admin/growth/dm.
//
// Everything King needs in one page: the three campuses we are on, the chapter roster under each
// one with its three Instagram slots (chapter account, president, scholarship chair), and today's
// DM list. It writes to the SAME tables the Cold Outreach board reads — growth_contact_qc for the
// contact, growth_ig_dm for sent/replied — so a DM logged here shows up there and vice versa, and
// the existing Copy-DM / thread machinery keeps working untouched.
//
// CHAPTER CONTACTS ARE NOT NEW SCHEMA. growth_contact_qc has carried (entity_type='chapter',
// entity_id=campus_greek_chapters.id) since the QC migration; nothing chapter-scoped was ever
// captured through the UI, which is why the DM board only ever showed councils. No migration.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ACTIVE_SLUGS, TARGET_CAMPUSES, contactsFromRow, type RosterRow } from "@/lib/king-dm";
import { planForDay, type PlanItem, type PlannableContact } from "@/lib/king-dm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention shared with the other growth modules
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** Bare handle from a handle or a URL — the storage shape readers expect (see growth-ig-dm). */
function bare(v: string | null): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  return (m ? m[1] : s).replace(/^@+/, "").replace(/\/+$/, "").toLowerCase() || null;
}
/** Loose key for matching a pasted chapter name to a roster row: letters and digits only. */
const nameKey = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const COUNCIL_LABEL: Record<string, string> = {
  ifc: "IFC", panhellenic: "Panhellenic", nphc: "NPHC", mgc: "MGC", fsl: "Greek Life / FSL",
};
const COUNCIL_ORDER = ["ifc", "panhellenic", "nphc", "mgc", "fsl"];

// ---- the board -------------------------------------------------------------------------------

export interface ConsoleCampus {
  slug: string;
  label: string;
  stage: "active" | "upcoming";
  cluster: string | null;
  campusId: string | null;
  name: string;
  colorPrimary: string | null;
  colorSecondary: string | null;
  mascot: string | null;
  metrics: { contacts: number; dmsSent: number; replied: number; clicks: number; chapterOpens: number; chapters: number; chaptersWithIg: number };
}

/** Every target campus, live ones first, each with the numbers the row shows. One pass over the
 *  three tables for all campuses rather than a query per campus. */
export const dmConsoleBoard = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ campuses: ConsoleCampus[] }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const slugs = TARGET_CAMPUSES.map((t) => t.slug);

    const { data: rows } = await db.from("campuses").select("id,name,display_name,slug,color_primary,color_secondary").in("slug", slugs);
    const bySlug = new Map<string, any>(((rows ?? []) as any[]).map((r) => [r.slug, r]));
    const ids = ((rows ?? []) as any[]).map((r) => r.id);

    const [{ data: spirit }, { data: qc }, { data: dms }, { data: visits }, { data: chapters }] = await Promise.all([
      ids.length ? db.from("campus_spirit").select("campus_id,primary_hex,secondary_hex,mascot").in("campus_id", ids) : { data: [] },
      ids.length ? db.from("growth_contact_qc").select("id,campus_id,instagram,entity_type,entity_id").in("campus_id", ids).limit(20000) : { data: [] },
      ids.length ? db.from("growth_ig_dm").select("contact_qc_id,campus_id,sent_at,replied_at").in("campus_id", ids).limit(20000) : { data: [] },
      ids.length ? db.from("contact_ref_visit").select("campus_id,surface,is_bot").in("campus_id", ids).limit(40000) : { data: [] },
      ids.length ? db.from("campus_greek_chapters").select("id,campus_id,council").in("campus_id", ids).is("archived_at", null).limit(20000) : { data: [] },
    ]);

    const spiritBy = new Map<string, any>(((spirit ?? []) as any[]).map((s) => [s.campus_id, s]));
    const contactCount = new Map<string, number>();
    const contactCampus = new Map<string, string>();
    for (const c of (qc ?? []) as any[]) {
      if (!bare(c.instagram)) continue;                       // reachable handles only, same rule as the board
      contactCount.set(c.campus_id, (contactCount.get(c.campus_id) ?? 0) + 1);
      contactCampus.set(c.id, c.campus_id);
    }
    const sent = new Map<string, number>(), replied = new Map<string, number>();
    for (const d of (dms ?? []) as any[]) {
      const cid = d.campus_id ?? contactCampus.get(d.contact_qc_id);
      if (!cid) continue;
      if (d.sent_at) sent.set(cid, (sent.get(cid) ?? 0) + 1);
      if (d.replied_at) replied.set(cid, (replied.get(cid) ?? 0) + 1);
    }
    const clicks = new Map<string, number>(), opens = new Map<string, number>();
    for (const v of (visits ?? []) as any[]) {
      if (v.is_bot || !v.campus_id) continue;
      clicks.set(v.campus_id, (clicks.get(v.campus_id) ?? 0) + 1);
      if (v.surface === "chapter") opens.set(v.campus_id, (opens.get(v.campus_id) ?? 0) + 1);
    }
    const chapterCount = new Map<string, number>();
    for (const ch of (chapters ?? []) as any[]) chapterCount.set(ch.campus_id, (chapterCount.get(ch.campus_id) ?? 0) + 1);
    // How many chapters already have at least one handle on file. Chapter-scoped rows only — a
    // council or club handle says nothing about whether we can reach the chapters underneath it.
    const withIg = new Map<string, Set<string>>();
    for (const c of (qc ?? []) as any[]) {
      if (!bare(c.instagram) || !c.campus_id) continue;
      if (c.entity_type !== "chapter" || !c.entity_id) continue;
      const s = withIg.get(c.campus_id) ?? new Set<string>();
      s.add(c.entity_id);
      withIg.set(c.campus_id, s);
    }

    const campuses: ConsoleCampus[] = TARGET_CAMPUSES.map((t) => {
      const r = bySlug.get(t.slug);
      const sp = r ? spiritBy.get(r.id) : null;
      const id = r?.id ?? null;
      return {
        slug: t.slug, label: t.label, stage: t.stage, cluster: t.cluster,
        campusId: id,
        name: r ? (r.display_name || r.name) : t.label,
        colorPrimary: sp?.primary_hex || r?.color_primary || null,
        colorSecondary: sp?.secondary_hex || r?.color_secondary || null,
        mascot: sp?.mascot || null,
        metrics: {
          contacts: id ? contactCount.get(id) ?? 0 : 0,
          dmsSent: id ? sent.get(id) ?? 0 : 0,
          replied: id ? replied.get(id) ?? 0 : 0,
          clicks: id ? clicks.get(id) ?? 0 : 0,
          chapterOpens: id ? opens.get(id) ?? 0 : 0,
          chapters: id ? chapterCount.get(id) ?? 0 : 0,
          chaptersWithIg: id ? (withIg.get(id)?.size ?? 0) : 0,
        },
      };
    });
    return { campuses };
  },
);

// ---- the chapter roster ----------------------------------------------------------------------

export interface RosterSlot { contactId: string; name: string | null; handle: string; sentAt: string | null; repliedAt: string | null }
export interface RosterChapter {
  chapterId: string;
  name: string;
  letters: string | null;
  size: number | null;
  org: RosterSlot | null;
  president: RosterSlot | null;
  chair: RosterSlot | null;
}
export interface RosterCouncil { key: string; label: string; council: RosterSlot[]; chapters: RosterChapter[] }

/** Which of the three slots a stored contact belongs in. Mirrors slotOf in growth-ig-dm so the two
 *  surfaces agree about what a "scholarship chair" row is. */
function slotOf(role: string | null, isOrg: boolean): "org" | "pres" | "chair" | "other" {
  if (isOrg) return "org";
  const r = (role ?? "").toLowerCase();
  if (/scholar|academ|chapter\s*develop/.test(r)) return "chair";
  if (/president/.test(r) && !/vice|\bvp\b/.test(r)) return "pres";
  return "other";
}

/** The council → chapter tree for one campus, with each chapter's three Instagram slots filled in
 *  from whatever contacts already exist. This is the grid King fills. */
export const dmConsoleRoster = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ councils: RosterCouncil[] }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();

    const [{ data: chapters }, { data: qc }, { data: dms }] = await Promise.all([
      db.from("campus_greek_chapters").select("id,council,greek_org_id,letters,nickname,chapter_size,chapter_designation").eq("campus_id", data.campusId).is("archived_at", null).limit(2000),
      db.from("growth_contact_qc").select("id,entity_type,entity_id,council_type,name,role,instagram,ig_role_account,contact_type").eq("campus_id", data.campusId).limit(8000),
      db.from("growth_ig_dm").select("contact_qc_id,sent_at,replied_at").eq("campus_id", data.campusId).limit(8000),
    ]);

    const orgIds = Array.from(new Set(((chapters ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean)));
    const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name,nickname,letters").in("id", orgIds) : { data: [] };
    const orgById = new Map<string, any>(((orgs ?? []) as any[]).map((o) => [o.id, o]));
    const dmBy = new Map<string, any>(((dms ?? []) as any[]).map((d) => [d.contact_qc_id, d]));

    const toSlot = (c: any): RosterSlot => {
      const dm = dmBy.get(c.id);
      return { contactId: c.id, name: c.name ?? null, handle: bare(c.instagram) ?? "", sentAt: dm?.sent_at ?? null, repliedAt: dm?.replied_at ?? null };
    };

    // Chapter-scoped and council-scoped contacts, bucketed.
    const byChapter = new Map<string, { org?: RosterSlot; pres?: RosterSlot; chair?: RosterSlot }>();
    const byCouncil = new Map<string, RosterSlot[]>();
    for (const c of (qc ?? []) as any[]) {
      if (!bare(c.instagram)) continue;
      const isOrg = !!c.ig_role_account || c.contact_type === "organization_general" || !(c.name && String(c.name).trim());
      const slot = slotOf(c.role, isOrg);
      if (c.entity_type === "chapter" && c.entity_id) {
        const b = byChapter.get(c.entity_id) ?? {};
        if (slot === "org" && !b.org) b.org = toSlot(c);
        else if (slot === "pres" && !b.pres) b.pres = toSlot(c);
        else if (slot === "chair" && !b.chair) b.chair = toSlot(c);
        byChapter.set(c.entity_id, b);
      } else if (c.entity_type === "council" && c.council_type) {
        const list = byCouncil.get(c.council_type) ?? [];
        list.push(toSlot(c));
        byCouncil.set(c.council_type, list);
      }
    }

    const buckets = new Map<string, RosterChapter[]>();
    for (const ch of (chapters ?? []) as any[]) {
      const org = ch.greek_org_id ? orgById.get(ch.greek_org_id) : null;
      const key = (ch.council ?? "").toLowerCase() || "fsl";
      const b = byChapter.get(ch.id) ?? {};
      const list = buckets.get(key) ?? [];
      list.push({
        chapterId: ch.id,
        name: (org?.name as string) || (ch.nickname as string) || (ch.chapter_designation as string) || "Chapter",
        letters: (ch.letters as string) || (org?.letters as string) || null,
        size: (ch.chapter_size as number) ?? null,
        org: b.org ?? null, president: b.pres ?? null, chair: b.chair ?? null,
      });
      buckets.set(key, list);
    }

    const keys = [...new Set([...COUNCIL_ORDER.filter((k) => buckets.has(k) || byCouncil.has(k)), ...buckets.keys()])];
    const councils: RosterCouncil[] = keys.map((key) => ({
      key,
      label: COUNCIL_LABEL[key] ?? key.toUpperCase(),
      council: byCouncil.get(key) ?? [],
      // Biggest chapters first — that is the order King should work them.
      chapters: (buckets.get(key) ?? []).sort((a, b) => (b.size ?? -1) - (a.size ?? -1) || a.name.localeCompare(b.name)),
    }));
    return { councils };
  });

// ---- saving the roster -----------------------------------------------------------------------

const RosterRowInput = z.object({
  council: z.string().trim().min(1).max(40),
  chapter: z.string().trim().max(160).default(""),
  orgIg: z.string().trim().max(120).default(""),
  presidentName: z.string().trim().max(160).default(""),
  presidentIg: z.string().trim().max(120).default(""),
  chairName: z.string().trim().max(160).default(""),
  chairIg: z.string().trim().max(120).default(""),
  line: z.number().int().default(0),
  /** Set when the UI already knows which chapter row this is (the grid); skips name matching. */
  chapterId: z.string().uuid().nullable().optional(),
});

export interface RosterSaveResult { saved: number; updated: number; unmatched: string[]; errors: string[] }

/** Write a batch of roster rows. Idempotent by (chapter or council) × slot: pasting the same sheet
 *  twice updates the handles rather than making a second copy of every contact, because King will
 *  paste the same sheet again as he fills more of it in. */
export const dmConsoleSaveRoster = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid(), rows: z.array(RosterRowInput).max(400) }).parse(d))
  .handler(async ({ data }): Promise<RosterSaveResult> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const { growthAddContact, growthUpdateContact } = await import("@/lib/growth-reach.functions");

    // Resolve chapter names once: org name, nickname, letters and the campus row's own aliases.
    const { data: chapters } = await db.from("campus_greek_chapters")
      .select("id,council,greek_org_id,letters,nickname,chapter_designation,slug").eq("campus_id", data.campusId).is("archived_at", null).limit(2000);
    const orgIds = Array.from(new Set(((chapters ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean)));
    const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name,nickname,letters").in("id", orgIds) : { data: [] };
    const orgById = new Map<string, any>(((orgs ?? []) as any[]).map((o) => [o.id, o]));
    const chapterByKey = new Map<string, string>();
    for (const ch of (chapters ?? []) as any[]) {
      const org = ch.greek_org_id ? orgById.get(ch.greek_org_id) : null;
      for (const alias of [org?.name, org?.nickname, org?.letters, ch.nickname, ch.letters, ch.chapter_designation, ch.slug]) {
        const k = nameKey(alias);
        if (k && !chapterByKey.has(k)) chapterByKey.set(k, ch.id);
      }
    }

    // Existing contacts, so a re-import updates instead of duplicating.
    const { data: existing } = await db.from("growth_contact_qc")
      .select("id,entity_type,entity_id,council_type,name,role,instagram,ig_role_account,contact_type").eq("campus_id", data.campusId).limit(8000);
    const existingBy = new Map<string, string>();   // `${entityKey}|${slot}` → contact id
    for (const c of (existing ?? []) as any[]) {
      const isOrg = !!c.ig_role_account || c.contact_type === "organization_general" || !(c.name && String(c.name).trim());
      const slot = slotOf(c.role, isOrg);
      if (slot === "other") continue;
      const entityKey = c.entity_type === "chapter" && c.entity_id ? `chapter:${c.entity_id}` : c.entity_type === "council" && c.council_type ? `council:${c.council_type}` : null;
      if (!entityKey) continue;
      const k = `${entityKey}|${slot}`;
      if (!existingBy.has(k)) existingBy.set(k, c.id);
    }

    const res: RosterSaveResult = { saved: 0, updated: 0, unmatched: [], errors: [] };
    for (const row of data.rows) {
      let chapterId: string | null = row.chapterId ?? null;
      if (!chapterId && row.chapter) {
        chapterId = chapterByKey.get(nameKey(row.chapter)) ?? null;
        if (!chapterId) { res.unmatched.push(row.chapter); continue; }
      }
      const entityKey = chapterId ? `chapter:${chapterId}` : `council:${row.council}`;

      for (const contact of contactsFromRow(row as RosterRow)) {
        const prior = existingBy.get(`${entityKey}|${contact.slot}`);
        if (prior) {
          const r = await growthUpdateContact({
            data: {
              qcId: prior,
              instagram: contact.handle,
              ...(contact.isOrg ? {} : { name: contact.name || null }),
              role: contact.role,
              igRoleAccount: contact.isOrg,
            },
          });
          if (r?.ok === false && r.error) res.errors.push(`${row.chapter || row.council}: ${r.error}`);
          else res.updated++;
          continue;
        }
        const r = await growthAddContact({
          data: {
            campusId: data.campusId,
            entityType: chapterId ? "chapter" : "council",
            entityId: chapterId,
            councilType: chapterId ? null : row.council,
            contactType: contact.isOrg ? "organization_general" : "student_officer",
            name: contact.isOrg ? null : contact.name || null,
            role: contact.role,
            instagram: contact.handle,
            chapter: row.chapter || null,
            igRoleAccount: contact.isOrg,
          },
        });
        if (r.ok) { res.saved++; if (r.qcId) existingBy.set(`${entityKey}|${contact.slot}`, r.qcId); }
        else if (r.error) res.errors.push(`${row.chapter || row.council}: ${r.error}`);
      }
    }
    return res;
  });

// ---- today's list ----------------------------------------------------------------------------

export interface PlanEntry extends PlanItem {
  campusLabel: string;
  campusId: string;
  name: string | null;
  handle: string;
  role: string | null;
  chapterName: string | null;
  isOrg: boolean;
}
export interface ConsolePlan {
  date: string;
  entries: PlanEntry[];
  /** How much is left overall, so the day's list reads as a slice of something finite. */
  totals: { unsent: number; followUpsDue: number; sentToday: number };
}

/** What King should send today, across the live campuses, newest-stale follow-ups first. Derived
 *  fresh on every load: skip a day and the same work is simply still here tomorrow. */
export const dmConsolePlan = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ dailyTarget: z.number().int().min(1).max(200).default(20) }).parse(d))
  .handler(async ({ data }): Promise<ConsolePlan> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const now = new Date();

    const { data: campusRows } = await db.from("campuses").select("id,name,display_name,slug").in("slug", ACTIVE_SLUGS);
    const campuses = ((campusRows ?? []) as any[]);
    const ids = campuses.map((c) => c.id);
    const slugOf = new Map<string, string>(campuses.map((c) => [c.id, c.slug]));
    const labelOf = new Map<string, string>(TARGET_CAMPUSES.map((t) => [t.slug, t.label]));
    if (!ids.length) return { date: now.toISOString().slice(0, 10), entries: [], totals: { unsent: 0, followUpsDue: 0, sentToday: 0 } };

    const [{ data: qc }, { data: dms }, { data: chapters }] = await Promise.all([
      db.from("growth_contact_qc").select("id,campus_id,entity_type,entity_id,council_type,name,role,instagram,ig_role_account,contact_type").in("campus_id", ids).limit(20000),
      db.from("growth_ig_dm").select("contact_qc_id,sent_at,replied_at,thread").in("campus_id", ids).limit(20000),
      db.from("campus_greek_chapters").select("id,greek_org_id,nickname,chapter_size").in("campus_id", ids).is("archived_at", null).limit(20000),
    ]);
    const orgIds = Array.from(new Set(((chapters ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean)));
    const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name").in("id", orgIds) : { data: [] };
    const orgName = new Map<string, string>(((orgs ?? []) as any[]).map((o) => [o.id, o.name]));
    const chapterById = new Map<string, any>(((chapters ?? []) as any[]).map((c) => [c.id, c]));
    const dmBy = new Map<string, any>(((dms ?? []) as any[]).map((d) => [d.contact_qc_id, d]));

    const meta = new Map<string, any>();
    const plannable: PlannableContact[] = [];
    for (const c of (qc ?? []) as any[]) {
      const handle = bare(c.instagram);
      if (!handle) continue;
      const slug = slugOf.get(c.campus_id);
      if (!slug) continue;
      const dm = dmBy.get(c.id);
      const thread = Array.isArray(dm?.thread) ? dm.thread : [];
      const ch = c.entity_type === "chapter" && c.entity_id ? chapterById.get(c.entity_id) : null;
      plannable.push({
        contactId: c.id, campusSlug: slug,
        size: ch?.chapter_size ?? null,
        sentAt: dm?.sent_at ?? null, repliedAt: dm?.replied_at ?? null,
        outboundCount: Math.max(dm?.sent_at ? 1 : 0, thread.filter((m: any) => m?.who === "us").length),
      });
      const isOrg = !!c.ig_role_account || c.contact_type === "organization_general" || !(c.name && String(c.name).trim());
      meta.set(c.id, {
        campusId: c.campus_id, name: c.name ?? null, handle, role: c.role ?? null, isOrg,
        chapterName: ch ? (orgName.get(ch.greek_org_id) ?? ch.nickname ?? null) : c.council_type ? (COUNCIL_LABEL[c.council_type] ?? null) : null,
      });
    }

    const items = planForDay(plannable, { now, dailyTarget: data.dailyTarget, campusOrder: ACTIVE_SLUGS });
    const entries: PlanEntry[] = items.map((i) => {
      const m = meta.get(i.contactId);
      return { ...i, campusId: m.campusId, campusLabel: labelOf.get(i.campusSlug) ?? i.campusSlug, name: m.name, handle: m.handle, role: m.role, chapterName: m.chapterName, isOrg: m.isOrg };
    });

    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const totals = {
      unsent: plannable.filter((p) => !p.sentAt).length,
      followUpsDue: items.filter((i) => i.reason === "follow_up").length,
      sentToday: ((dms ?? []) as any[]).filter((d) => d.sent_at && new Date(d.sent_at) >= midnight).length,
    };
    return { date: now.toISOString().slice(0, 10), entries, totals };
  });
