// INSTAGRAM DM BOARD — the server layer behind /admin/growth/coldoutreach.
//
// One campus at a time: its council contacts (with handles), each contact's DM state (sent /
// replied / thread) from growth_ig_dm, and each contact's engagement (link clicks + chapter-share
// opens) from contact_ref_visit — keyed by the same growth_contact_qc id we bake into the DM's
// ?ref= link. Signups-per-contact are deliberately NOT joined yet (Lee is holding that wiring).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};
async function actor(): Promise<string> {
  const { adminSessionOk, vaSessionOk } = await import("@/lib/admin-session.functions");
  try { const a = await adminSessionOk(); if (a?.ok && a.email) return a.email; } catch { /* not admin */ }
  try { const v = await vaSessionOk(); if (v?.ok && v.vaId) return `va:${v.vaId}`; } catch { /* not va */ }
  return "admin";
}

/** Bare instagram handle from a handle or a full URL. */
function bareHandle(v: string | null): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  return (m ? m[1] : s).replace(/^@+/, "").replace(/\/+$/, "") || null;
}

export type ThreadMsg = { who: "us" | "them"; text: string; at: string };
export interface IgContact {
  contactId: string;
  slot: "org" | "chair" | "pres" | "other";
  roleLabel: string;
  name: string | null;
  handle: string; // bare, no @
  isOrg: boolean;
  sentAt: string | null;
  repliedAt: string | null;
  thread: ThreadMsg[];
  clicks: number;
  chapterOpens: number;
}
export interface IgCouncil {
  key: string;
  label: string;
  contacts: IgContact[];
  metrics: { sent: number; replied: number; clicks: number; chapterOpens: number };
}
export interface IgCampus {
  campusId: string;
  name: string;
  slug: string | null;
  courseCode: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  mascot: string | null;
  councils: IgCouncil[];
  metrics: { dmsSent: number; replied: number; clicks: number; chapterOpens: number; contacts: number };
}

const COUNCIL_ORDER = [
  { key: "ifc", label: "IFC" },
  { key: "panhellenic", label: "Panhellenic" },
  { key: "nphc", label: "NPHC" },
  { key: "mgc", label: "MGC" },
  { key: "fsl", label: "Greek Life / FSL" },
];

function slotOf(role: string | null, isOrg: boolean): { slot: IgContact["slot"]; label: string } {
  if (isOrg) return { slot: "org", label: "Organization" };
  const r = (role ?? "").toLowerCase();
  if (/scholar|academ|chapter\s*develop/.test(r)) return { slot: "chair", label: "Scholarship chair" };
  if (/president/.test(r) && !/vice|\bvp\b/.test(r)) return { slot: "pres", label: "President" };
  return { slot: "other", label: role || "Officer" };
}

/** The whole board for one campus. */
export const growthIgCampus = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<IgCampus | null> => {
    const db = await admin();
    const campusId = data.campusId;

    const [{ data: campus }, { data: spirit }, { data: courseRows }, { data: qc }, { data: dms }, { data: visits }, { data: clubs }] = await Promise.all([
      db.from("campuses").select("id,name,display_name,slug,color_primary,color_secondary,course_family_codes_json").eq("id", campusId).maybeSingle(),
      db.from("campus_spirit").select("primary_hex,secondary_hex,mascot").eq("campus_id", campusId).maybeSingle(),
      db.from("course_intel_campus_status").select("course_code").eq("campus_id", campusId).limit(1),
      db.from("growth_contact_qc").select("id,council_type,entity_type,entity_id,contact_type,name,role,instagram,ig_role_account").eq("campus_id", campusId).limit(4000),
      db.from("growth_ig_dm").select("contact_qc_id,sent_at,replied_at,thread").eq("campus_id", campusId).limit(4000),
      db.from("contact_ref_visit").select("contact_id,surface,is_bot").eq("campus_id", campusId).limit(20000),
      db.from("growth_business_clubs").select("id,name").eq("campus_id", campusId).limit(200),
    ]);
    if (!campus?.id) return null;

    const dmBy = new Map<string, { sent_at: string | null; replied_at: string | null; thread: ThreadMsg[] }>();
    for (const d of (dms ?? []) as any[]) dmBy.set(d.contact_qc_id, { sent_at: d.sent_at, replied_at: d.replied_at, thread: Array.isArray(d.thread) ? d.thread : [] });
    const clicks = new Map<string, number>();
    const chapterOpens = new Map<string, number>();
    for (const v of (visits ?? []) as any[]) {
      if (v.is_bot || !v.contact_id) continue;
      clicks.set(v.contact_id, (clicks.get(v.contact_id) ?? 0) + 1);
      if (v.surface === "chapter") chapterOpens.set(v.contact_id, (chapterOpens.get(v.contact_id) ?? 0) + 1);
    }
    const clubName = new Map<string, string>(((clubs ?? []) as any[]).map((c) => [c.id, c.name]));

    // Group DM-able contacts (those with a handle) by council key. Clubs get a per-club key.
    const buckets = new Map<string, { label: string; contacts: IgContact[] }>();
    const bucket = (key: string, label: string) => {
      let b = buckets.get(key);
      if (!b) { b = { label, contacts: [] }; buckets.set(key, b); }
      return b;
    };
    for (const c of (qc ?? []) as any[]) {
      const handle = bareHandle(c.instagram);
      if (!handle) continue; // DM board only lists reachable handles
      const isOrg = !!c.ig_role_account || (c.contact_type === "organization_general") || !(c.name && String(c.name).trim());
      const { slot, label: roleLabel } = slotOf(c.role, isOrg);
      const dm = dmBy.get(c.id);
      const contact: IgContact = {
        contactId: c.id, slot, roleLabel, name: c.name ?? null, handle, isOrg,
        sentAt: dm?.sent_at ?? null, repliedAt: dm?.replied_at ?? null, thread: dm?.thread ?? [],
        clicks: clicks.get(c.id) ?? 0, chapterOpens: chapterOpens.get(c.id) ?? 0,
      };
      if (c.entity_type === "council" && c.council_type) {
        const label = COUNCIL_ORDER.find((x) => x.key === c.council_type)?.label ?? c.council_type.toUpperCase();
        bucket(c.council_type, label).contacts.push(contact);
      } else if (c.entity_type === "club" && c.entity_id) {
        bucket(`club:${c.entity_id}`, clubName.get(c.entity_id) ?? "Business club").contacts.push(contact);
      } else {
        bucket("other", "Other").contacts.push(contact);
      }
    }

    // Order: the fixed councils first, then clubs, then other. Within a council, org → chair → pres.
    const slotRank = { org: 0, chair: 1, pres: 2, other: 3 } as const;
    const orderedKeys = [
      ...COUNCIL_ORDER.map((c) => c.key).filter((k) => buckets.has(k)),
      ...[...buckets.keys()].filter((k) => k.startsWith("club:")),
      ...[...buckets.keys()].filter((k) => k === "other"),
    ];
    const councils: IgCouncil[] = orderedKeys.map((key) => {
      const b = buckets.get(key)!;
      const contacts = b.contacts.sort((a, z) => slotRank[a.slot] - slotRank[z.slot]);
      const metrics = contacts.reduce((m, c) => ({
        sent: m.sent + (c.sentAt ? 1 : 0),
        replied: m.replied + (c.repliedAt ? 1 : 0),
        clicks: m.clicks + c.clicks,
        chapterOpens: m.chapterOpens + c.chapterOpens,
      }), { sent: 0, replied: 0, clicks: 0, chapterOpens: 0 });
      return { key, label: b.label, contacts, metrics };
    });

    const all = councils.flatMap((c) => c.contacts);
    const courseCode = ((courseRows ?? []) as any[])[0]?.course_code
      ?? (campus.course_family_codes_json?.intro_1 ?? null);
    return {
      campusId: campus.id,
      name: campus.display_name || campus.name,
      slug: campus.slug ?? null,
      courseCode,
      colorPrimary: spirit?.primary_hex || campus.color_primary || null,
      colorSecondary: spirit?.secondary_hex || campus.color_secondary || null,
      mascot: spirit?.mascot || null,
      councils,
      metrics: {
        dmsSent: all.filter((c) => c.sentAt).length,
        replied: all.filter((c) => c.repliedAt).length,
        clicks: all.reduce((n, c) => n + c.clicks, 0),
        chapterOpens: all.reduce((n, c) => n + c.chapterOpens, 0),
        contacts: all.length,
      },
    };
  });

async function upsertDm(db: DB, contactId: string, patch: Record<string, unknown>): Promise<void> {
  // Resolve the campus for a first-time row so the campus index stays populated.
  const { data: qc } = await db.from("growth_contact_qc").select("campus_id,council_type").eq("id", contactId).maybeSingle();
  await db.from("growth_ig_dm").upsert(
    { contact_qc_id: contactId, campus_id: qc?.campus_id ?? null, council_type: qc?.council_type ?? null, updated_at: new Date().toISOString(), ...patch },
    { onConflict: "contact_qc_id" },
  );
}

/** Toggle "DM sent" for a contact. */
export const growthIgMarkSent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ contactId: z.string().uuid(), sent: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const by = await actor();
    const db = await admin();
    await upsertDm(db, data.contactId, { sent_at: data.sent ? new Date().toISOString() : null, sent_by: data.sent ? by : null });
    return { ok: true };
  });

/** Append a message to the thread. `them` also stamps replied_at (first reply). */
export const growthIgAddMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ contactId: z.string().uuid(), who: z.enum(["us", "them"]), text: z.string().trim().min(1).max(4000) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await admin();
    const { data: row } = await db.from("growth_ig_dm").select("thread,replied_at").eq("contact_qc_id", data.contactId).maybeSingle();
    const thread: ThreadMsg[] = Array.isArray(row?.thread) ? row!.thread : [];
    thread.push({ who: data.who, text: data.text.trim(), at: new Date().toISOString() });
    const patch: Record<string, unknown> = { thread };
    if (data.who === "them" && !row?.replied_at) patch.replied_at = new Date().toISOString();
    await upsertDm(db, data.contactId, patch);
    return { ok: true };
  });

/** Remove the last message from a thread (undo a mis-paste). */
export const growthIgPopMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ contactId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await admin();
    const { data: row } = await db.from("growth_ig_dm").select("thread").eq("contact_qc_id", data.contactId).maybeSingle();
    const thread: ThreadMsg[] = Array.isArray(row?.thread) ? row!.thread : [];
    thread.pop();
    await upsertDm(db, data.contactId, { thread });
    return { ok: true };
  });
