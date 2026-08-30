// growth-schedule.functions.ts — server layer for the outreach schedule. Assembles the sender's
// campuses + contacts + touch log, runs the pure engine (growth-schedule-core), renders the
// per-channel messages, and persists the actions (sent / replied / pre-warm). Instantly is the
// email sending layer; before it's wired we hand back a per-day CSV + a copy-send list.
//
// LAW: service-role client + admin gate imported dynamically inside handlers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normOrgType } from "@/lib/growth-tranche.functions";
import {
  planRange, addDays, senderFor, capsFor, seasonWeeks, weekStartOf, sendingDays,
  type SchedCampus, type SchedOrg, type SchedContact, type PriorTouch, type SeqItem, type DayPlan,
} from "@/lib/growth-schedule-core";

type DB = { from: (t: string) => any };
const adminDb = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};
const whoNow = async (): Promise<string> => {
  const { adminSessionOk } = await import("@/lib/admin-session.functions");
  return (await adminSessionOk())?.email ?? "admin";
};

export type Owner = "lee" | "king" | "ej";
const POOL: Record<Exclude<Owner, "ej">, string> = { lee: "founder", king: "king" };

async function ownerCampusIds(db: DB, owner: Owner): Promise<string[]> {
  if (owner === "ej") return [];
  let q = db.from("partner_tranches").select("campus_ids,partner_id,pool").eq("pool", POOL[owner]);
  if (owner === "king") {
    const { KING_EMAIL } = await import("@/lib/growth-comp.functions");
    const { data: king } = await db.from("referral_partners").select("id").ilike("email", KING_EMAIL).maybeSingle();
    q = q.eq("partner_id", king?.id ?? "00000000-0000-0000-0000-000000000000");
  }
  const { data } = await q;
  return [...new Set(((data ?? []) as any[]).flatMap((t) => t.campus_ids ?? []))] as string[];
}

const PERSON_TYPES = new Set(["student_officer", "chapter_exec", "staff_advisor"]);
const isReal = (c: any) => !!((c.email && String(c.email).trim()) || (c.instagram && String(c.instagram).trim()));
const toContact = (c: any): SchedContact => ({
  id: c.id, isPerson: PERSON_TYPES.has(c.contact_type) || !!(c.name && String(c.name).trim()), isRoleAccount: !!c.is_role_account,
  name: c.name ?? null, role: c.role ?? null, email: c.email ?? null, instagram: c.instagram ?? null,
  prewarmedAt: c.prewarmed_at ?? null, igFollowed: !!c.ig_followed, igLiked: !!c.ig_liked,
});

const COUNCILS: { type: string; label: string }[] = [
  { type: "fsl", label: "Greek Life / FSL Office" }, { type: "ifc", label: "IFC" },
  { type: "panhellenic", label: "Panhellenic" }, { type: "nphc", label: "NPHC" }, { type: "mgc", label: "MGC" },
];

async function fetchOrgMeta(db: DB, orgIds: string[]): Promise<Map<string, { name: string; orgType: string }>> {
  const out = new Map<string, { name: string; orgType: string }>();
  for (let i = 0; i < orgIds.length; i += 150) {
    const { data } = await db.from("greek_orgs").select("id,name,org_type").in("id", orgIds.slice(i, i + 150));
    for (const o of (data ?? []) as any[]) out.set(o.id, { name: o.name, orgType: o.org_type });
  }
  return out;
}

async function buildSchedCampuses(db: DB, campusIds: string[]): Promise<{ campuses: SchedCampus[]; slugOf: Map<string, string | null> }> {
  if (!campusIds.length) return { campuses: [], slugOf: new Map() };
  const [camps, chaps, clubs, contacts] = await Promise.all([
    db.from("campuses").select("id,name,display_name,slug").in("id", campusIds),
    db.from("campus_greek_chapters").select("id,campus_id,greek_org_id,chapter_size").in("campus_id", campusIds).is("archived_at", null),
    db.from("growth_business_clubs").select("id,campus_id,name").in("campus_id", campusIds),
    db.from("growth_contact_qc").select("id,campus_id,entity_type,entity_id,council_type,contact_type,name,role,email,instagram,is_role_account,prewarmed_at,ig_followed,ig_liked").in("campus_id", campusIds),
  ]);
  const orgMeta = await fetchOrgMeta(db, [...new Set(((chaps as any).data ?? []).map((c: any) => c.greek_org_id).filter(Boolean) as string[])]);
  const slugOf = new Map<string, string | null>(((camps as any).data ?? []).map((c: any) => [c.id, c.slug ?? null]));
  const nameOf = new Map<string, string>(((camps as any).data ?? []).map((c: any) => [c.id, c.display_name || c.name]));

  // group real contacts by campus + target
  const byCampus = new Map<string, any[]>();
  for (const c of ((contacts as any).data ?? []) as any[]) { if (!isReal(c)) continue; const a = byCampus.get(c.campus_id) ?? []; a.push(c); byCampus.set(c.campus_id, a); }
  const chapsByCampus = new Map<string, any[]>();
  for (const c of ((chaps as any).data ?? []) as any[]) { const a = chapsByCampus.get(c.campus_id) ?? []; a.push(c); chapsByCampus.set(c.campus_id, a); }
  const clubsByCampus = new Map<string, any[]>();
  for (const c of ((clubs as any).data ?? []) as any[]) { const a = clubsByCampus.get(c.campus_id) ?? []; a.push(c); clubsByCampus.set(c.campus_id, a); }

  const campuses: SchedCampus[] = campusIds.map((id) => {
    const cs = byCampus.get(id) ?? [];
    const orgs: SchedOrg[] = [];
    // councils
    for (const c of COUNCILS) {
      const contacts = cs.filter((x) => x.entity_type === "council" && x.council_type === c.type).map(toContact);
      orgs.push({ orgKey: `council:${c.type}`, kind: "council", label: c.label, councilType: c.type, orgType: null, rank: null, needed: true, contacts });
    }
    // chapters, ranked within type
    const rankCounter = new Map<string, number>();
    const chapSorted = (chapsByCampus.get(id) ?? [])
      .map((ch) => ({ ch, meta: orgMeta.get(ch.greek_org_id), size: ch.chapter_size as number | null }))
      .map((x) => ({ ...x, kind: normOrgType(x.meta?.orgType), nm: x.meta?.name ?? "Chapter" }))
      .sort((a, b) => (b.size ?? -1) - (a.size ?? -1) || a.nm.localeCompare(b.nm));
    for (const x of chapSorted) {
      const rank = (rankCounter.get(x.kind) ?? 0) + 1; rankCounter.set(x.kind, rank);
      const contacts = cs.filter((c) => c.entity_type === "chapter" && c.entity_id === x.ch.id).map(toContact);
      orgs.push({ orgKey: `chapter:${x.ch.id}`, kind: "chapter", label: x.nm, councilType: null, orgType: x.kind, rank, needed: (x.kind === "fraternity" || x.kind === "sorority") && rank <= 5, contacts });
    }
    // clubs
    for (const cl of clubsByCampus.get(id) ?? []) {
      const contacts = cs.filter((c) => c.entity_type === "club" && c.entity_id === cl.id).map(toContact);
      orgs.push({ orgKey: `club:${cl.id}`, kind: "club", label: cl.name, councilType: null, orgType: null, rank: null, needed: true, contacts });
    }
    return { campusId: id, name: nameOf.get(id) ?? id.slice(0, 8), orgs };
  });
  return { campuses, slugOf };
}

async function fetchTouches(db: DB, campusIds: string[]): Promise<PriorTouch[]> {
  if (!campusIds.length) return [];
  const { data } = await db.from("outreach_touch").select("campus_id,org_key,contact_qc_id,source_channel,kind,scheduled_date,sent_at,replied_at,outcome").in("campus_id", campusIds);
  return ((data ?? []) as any[]).map((t) => ({
    campusId: t.campus_id, orgKey: t.org_key, contactId: t.contact_qc_id, channel: t.source_channel, kind: t.kind,
    scheduledDate: t.scheduled_date, sentAt: t.sent_at, repliedAt: t.replied_at, outcome: t.outcome,
  }));
}

// ── message templates (S7 link rules; complementary cross-channel copy) ─────────────────
const LINK_BASE = "https://surviveaccounting.com";
const campusLink = (slug: string | null) => (slug ? `${LINK_BASE}/${slug}` : LINK_BASE);
function renderMessages(item: SeqItem, slug: string | null): { dm?: string; email?: string; story?: string } {
  const hasDm = item.channels.some((c) => c.track === "dm");
  const hasEmail = item.channels.some((c) => c.track === "email");
  const link = campusLink(slug);
  const followup = item.kind === "follow_up";
  const out: { dm?: string; email?: string; story?: string } = {};
  const chapterAsk = "Who's your scholarship chair this semester? I'd like to make sure they have this before exams.";
  if (item.orgKind === "council") {
    // councils carry exactly one link — the page built for their chapters
    if (hasEmail) out.email = `Hi ${item.orgLabel} at ${item.campusName} — I make free Exam 1 study prep your chapters are using this fall. Here's the page to pass along: ${link}${hasDm ? "\n\nSent your Instagram a note too — following up here." : ""}`;
    if (hasDm) out.dm = `Hi! I run free ACC exam prep and built a page for ${item.campusName} chapters${followup ? `: ${link}` : ""}. Who's the best person to get it to?${hasEmail ? " Also emailed in case that's easier." : ""}`;
  } else {
    // chapters/clubs — no link on a cold first touch; the ask is a name
    if (hasDm) out.dm = `Hey ${item.orgLabel}! ${chapterAsk}${followup ? ` Here's the free set: ${link}` : ""}${hasEmail ? "\n\nAlso sent this to your chapter email in case that's easier." : ""}`;
    if (hasEmail) out.email = `Hi ${item.orgLabel} — ${chapterAsk}${followup ? ` (${link})` : ""}${hasDm ? "\n\nSent your Instagram a message too — following up here." : ""}`;
  }
  out.story = `Love the recent post! Quick q — who's your scholarship chair this semester? I make free ACC 210 exam prep and want to get it to the right person.`;
  return out;
}

// ── views ────────────────────────────────────────────────────────────────────────────────
export interface ScheduleItemView extends SeqItem { messages: { dm?: string; email?: string; story?: string }; slug: string | null }
export interface ScheduleDayView {
  date: string; sender: string; dmCap: number; emailCap: number;
  items: ScheduleItemView[]; gaps: SeqItem[];
  dmUsed: number; emailUsed: number;
}
export interface ScheduleWeekView {
  ready: boolean; owner: Owner; weekStart: string;
  weeks: { start: string; end: string; index: number }[];
  days: ScheduleDayView[];
  stats: { slots: number; gaps: number; sent: number; replies: number };
}

export const growthScheduleWeek = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ owner: z.enum(["lee", "king", "ej"]), weekStart: z.string() }).parse(d))
  .handler(async ({ data }): Promise<ScheduleWeekView> => {
    const weeks = seasonWeeks();
    if (data.owner === "ej") return { ready: false, owner: "ej", weekStart: data.weekStart, weeks, days: [], stats: { slots: 0, gaps: 0, sent: 0, replies: 0 } };
    const db = await adminDb();
    const campusIds = await ownerCampusIds(db, data.owner);
    const { campuses, slugOf } = await buildSchedCampuses(db, campusIds);
    const touches = await fetchTouches(db, campusIds);
    const from = weekStartOf(data.weekStart);
    const plan = planRange({ from, to: addDays(from, 6), campuses, touches });

    // sent/replied lookup for this week's dates
    const sentKeys = new Map<string, PriorTouch>();
    for (const t of touches) sentKeys.set(`${t.scheduledDate}|${t.campusId}|${t.orgKey}`, t);

    const days: ScheduleDayView[] = plan.map((d: DayPlan) => {
      const items: ScheduleItemView[] = d.items.map((it) => ({ ...it, messages: renderMessages(it, slugOf.get(it.campusId) ?? null), slug: slugOf.get(it.campusId) ?? null }));
      return {
        date: d.date, sender: d.sender, dmCap: d.dmCap, emailCap: d.emailCap, items, gaps: d.gaps,
        dmUsed: d.items.filter((i) => i.channels.some((c) => c.track === "dm")).length,
        emailUsed: d.items.filter((i) => i.channels.some((c) => c.track === "email")).length,
      };
    });
    const allItems = plan.flatMap((d) => d.items);
    const allGaps = plan.flatMap((d) => d.gaps);
    const sent = touches.filter((t) => t.sentAt && t.scheduledDate >= from && t.scheduledDate <= addDays(from, 6)).length;
    const replies = touches.filter((t) => t.repliedAt && t.scheduledDate >= from && t.scheduledDate <= addDays(from, 6)).length;
    return { ready: true, owner: data.owner, weekStart: from, weeks, days, stats: { slots: allItems.length, gaps: allGaps.length, sent, replies } };
  });

// Pre-warm view for the upcoming week — its Instagram targets (S8).
export interface PrewarmTarget { contactId: string | null; handle: string; label: string; campusName: string; prewarmedAt: string | null; igFollowed: boolean; igLiked: boolean }
export const growthPrewarmWeek = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ owner: z.enum(["lee", "king", "ej"]), weekStart: z.string() }).parse(d))
  .handler(async ({ data }): Promise<{ weekStart: string; targets: PrewarmTarget[] }> => {
    if (data.owner === "ej") return { weekStart: data.weekStart, targets: [] };
    const db = await adminDb();
    const campusIds = await ownerCampusIds(db, data.owner);
    const { campuses } = await buildSchedCampuses(db, campusIds);
    const touches = await fetchTouches(db, campusIds);
    const from = weekStartOf(data.weekStart);
    const plan = planRange({ from, to: addDays(from, 6), campuses, touches });
    const targets: PrewarmTarget[] = [];
    const seen = new Set<string>();
    for (const d of plan) for (const it of d.items) {
      const dm = it.channels.find((c) => c.track === "dm");
      if (!dm || !it.contactId || seen.has(it.contactId)) continue;
      seen.add(it.contactId);
      targets.push({ contactId: it.contactId, handle: dm.handle, label: `${it.contactName || it.orgLabel}`, campusName: it.campusName, prewarmedAt: it.prewarmedAt, igFollowed: it.igFollowed, igLiked: it.igLiked });
    }
    return { weekStart: from, targets };
  });

// ── mutations ────────────────────────────────────────────────────────────────────────────
export const growthMarkTouch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    campusId: z.string().uuid(), orgKey: z.string().max(80), contactId: z.string().uuid().nullable().optional(),
    channel: z.enum(["dm", "story_reply", "email"]), kind: z.enum(["new", "follow_up"]).default("new"),
    scheduledDate: z.string(), sender: z.enum(["lee", "king"]).default("king"), messageVariant: z.string().max(60).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; error?: string }> => {
    const db = await adminDb(); const who = await whoNow();
    const { data: ins, error } = await db.from("outreach_touch").insert({
      campus_id: data.campusId, org_key: data.orgKey, contact_qc_id: data.contactId ?? null,
      source_channel: data.channel, sender: data.sender, kind: data.kind, scheduled_date: data.scheduledDate,
      sent_at: new Date().toISOString(), message_variant: data.messageVariant ?? null, created_by: who,
    }).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: ins?.id };
  });

export const growthMarkReply = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    touchId: z.string().uuid().nullable().optional(),
    campusId: z.string().uuid(), orgKey: z.string().max(80), contactId: z.string().uuid().nullable().optional(),
    channel: z.enum(["dm", "story_reply", "email"]).default("dm"), scheduledDate: z.string(),
    outcome: z.enum(["interested", "referred", "not_now", "wrong_person", "no", "hostile"]),
    replyText: z.string().trim().min(1).max(4000), referredName: z.string().trim().max(160).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await adminDb(); const who = await whoNow();
    const now = new Date().toISOString();
    // Attach the reply to an existing sent touch, or create a touch row to carry it.
    if (data.touchId) {
      const { error } = await db.from("outreach_touch").update({ replied_at: now, outcome: data.outcome, reply_text: data.replyText, updated_at: now }).eq("id", data.touchId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await db.from("outreach_touch").insert({
        campus_id: data.campusId, org_key: data.orgKey, contact_qc_id: data.contactId ?? null, source_channel: data.channel,
        kind: "new", scheduled_date: data.scheduledDate, sent_at: now, replied_at: now, outcome: data.outcome, reply_text: data.replyText, created_by: who,
      });
      if (error) return { ok: false, error: error.message };
    }
    // Referred → a warm contact, queued outside the cold sequence.
    if (data.outcome === "referred" && data.referredName) {
      await db.from("growth_contact_qc").insert({
        contact_source: "growth_public_contacts", source_id: crypto.randomUUID(), campus_id: data.campusId,
        entity_type: data.orgKey.startsWith("council") ? "council" : data.orgKey.startsWith("club") ? "club" : "chapter",
        entity_id: data.orgKey.includes(":") && !data.orgKey.startsWith("council") ? data.orgKey.split(":")[1] : null,
        council_type: data.orgKey.startsWith("council") ? data.orgKey.split(":")[1] : null,
        contact_type: "student_officer", name: data.referredName, source_type: "manual_entry", confidence: "high",
        outreach_eligible: true, qc_action: "approve", qc_by: who, qc_at: now,
        qc_notes: `Warm — referred by outreach reply${who ? ` (logged by ${who})` : ""}`,
      });
    }
    return { ok: true };
  });

export const growthPrewarm = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ contactId: z.string().uuid(), followed: z.boolean().optional(), liked: z.boolean().optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await adminDb();
    const patch: Record<string, unknown> = { prewarmed_at: new Date().toISOString() };
    if (data.followed !== undefined) patch.ig_followed = data.followed;
    if (data.liked !== undefined) patch.ig_liked = data.liked;
    const { error } = await db.from("growth_contact_qc").update(patch).eq("id", data.contactId);
    return error ? { ok: false, error: error.message } : { ok: true };
  });

// Per-day CSV for Instantly's importer (fallback when the API isn't wired).
export const growthScheduleCsv = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ owner: z.enum(["lee", "king", "ej"]), date: z.string() }).parse(d))
  .handler(async ({ data }): Promise<{ csv: string; rows: number }> => {
    if (data.owner === "ej") return { csv: "", rows: 0 };
    const db = await adminDb();
    const campusIds = await ownerCampusIds(db, data.owner);
    const { campuses, slugOf } = await buildSchedCampuses(db, campusIds);
    const touches = await fetchTouches(db, campusIds);
    const from = weekStartOf(data.date);
    const plan = planRange({ from, to: addDays(from, 6), campuses, touches });
    const day = plan.find((d) => d.date === data.date);
    const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const header = ["email", "campus", "org", "role", "first_name", "message"].map(esc).join(",");
    const lines = [header];
    let rows = 0;
    for (const it of day?.items ?? []) {
      const email = it.channels.find((c) => c.track === "email")?.handle;
      if (!email) continue;
      const msg = renderMessages(it, slugOf.get(it.campusId) ?? null).email ?? "";
      lines.push([email, it.campusName, it.orgLabel, it.roleTarget, it.contactName ?? "", msg].map(esc).join(","));
      rows++;
    }
    return { csv: lines.join("\n"), rows };
  });

// Push a day's email contacts into an Instantly campaign. Scaffolded — no-ops with a clear message
// until INSTANTLY_API_KEY + INSTANTLY_CAMPAIGN_ID are set in the environment.
export const growthInstantlyPush = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ owner: z.enum(["lee", "king", "ej"]), date: z.string() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; pushed: number; message: string }> => {
    const key = process.env.INSTANTLY_API_KEY;
    const campaign = process.env.INSTANTLY_CAMPAIGN_ID;
    const { csv, rows } = await growthScheduleCsv({ data });
    if (!key || !campaign) {
      return { ok: false, pushed: 0, message: `Instantly API key not set — use the CSV export instead (${rows} email rows ready).` };
    }
    // Parse the rows back out of the CSV we just built (single source of truth for the day's list).
    const [, ...body] = csv.split("\n");
    const leads = body.map((line) => {
      const m = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","((?:[^"]|"")*)"$/);
      if (!m) return null;
      return { email: m[1], first_name: m[5], personalization: m[6].replace(/""/g, '"'), custom_variables: { campus: m[2], org: m[3] } };
    }).filter(Boolean);
    try {
      const res = await fetch("https://api.instantly.ai/api/v1/lead/add", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key, campaign_id: campaign, leads, skip_if_in_campaign: true }),
      });
      if (!res.ok) return { ok: false, pushed: 0, message: `Instantly rejected the push (HTTP ${res.status}).` };
      return { ok: true, pushed: leads.length, message: `Pushed ${leads.length} leads to Instantly for ${data.date}.` };
    } catch (e) {
      return { ok: false, pushed: 0, message: e instanceof Error ? e.message : "Instantly push failed." };
    }
  });

// Campuses with a rep + Exam 1 window, for the two-weeks-out rep push reminder (S10).
export interface RepExamRow { campusId: string; campusName: string; repName: string | null; examStart: string | null }
export const growthRepExamWindows = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ owner: z.enum(["lee", "king", "ej"]) }).parse(d))
  .handler(async ({ data }): Promise<{ rows: RepExamRow[] }> => {
    // Best-effort: rep + exam data lives across a few tables and isn't guaranteed populated.
    // Return an empty list rather than guessing a schema that may not exist yet.
    return { rows: [] };
  });
