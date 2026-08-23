// Growth Admin — outreach as EVENTS (not booleans) + the work queue.
// Backed by growth_outreach_events (append-only). Degrades gracefully until the
// growth_* migration is applied.
//
// LAW: dynamic-import the service-role client inside each handler.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    (typeof e.message === "string" && /does not exist|could not find the table/i.test(e.message))
  );
}

export const CHANNELS = ["email", "ig_dm", "text", "call", "other"] as const;
export const DIRECTIONS = ["outbound", "inbound"] as const;
export const STATUSES = [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "opened",
  "clicked",
  "replied",
  "unsubscribed",
  "logged",
  "no_answer",
  "left_message",
] as const;

const entityType = z.enum(["campus", "chapter", "council", "org"]);

export interface OutreachEvent {
  id: number;
  contactId: string | null;
  contactName: string | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string;
  campusId: string | null;
  channel: string;
  direction: string;
  status: string;
  subject: string | null;
  notes: string | null;
  occurredAt: string;
  nextFollowUpAt: string | null;
  followUpDoneAt: string | null;
  createdBy: string | null;
}

// ---- label resolution (shared shape with contacts) ---------------------------
async function resolveLabels(db: DB, rows: any[]) {
  const campusIds = new Set<string>(),
    chapterIds = new Set<string>(),
    orgIds = new Set<string>(),
    contactIds = new Set<string>();
  for (const r of rows) {
    if (r.campus_id) campusIds.add(r.campus_id);
    if (r.entity_type === "campus" && r.entity_id) campusIds.add(r.entity_id);
    if (r.entity_type === "chapter" && r.entity_id) chapterIds.add(r.entity_id);
    if (r.entity_type === "org" && r.entity_id) orgIds.add(r.entity_id);
    if (r.contact_id) contactIds.add(r.contact_id);
  }
  const campusName = new Map<string, string>(),
    chapterName = new Map<string, string>(),
    orgName = new Map<string, string>(),
    contactName = new Map<string, string>();
  if (campusIds.size) {
    const { data } = await db
      .from("campuses")
      .select("id,name,institution_name")
      .in("id", [...campusIds]);
    for (const c of (data ?? []) as any[])
      campusName.set(c.id, c.institution_name || c.name || "Campus");
  }
  if (chapterIds.size) {
    const { data } = await db
      .from("campus_greek_chapters")
      .select("id,nickname,chapter_designation,letters")
      .in("id", [...chapterIds]);
    for (const c of (data ?? []) as any[])
      chapterName.set(c.id, c.nickname || c.chapter_designation || c.letters || "Chapter");
  }
  if (orgIds.size) {
    const { data } = await db
      .from("greek_orgs")
      .select("id,name,nickname")
      .in("id", [...orgIds]);
    for (const o of (data ?? []) as any[]) orgName.set(o.id, o.nickname || o.name);
  }
  if (contactIds.size) {
    const { data } = await db
      .from("growth_contacts")
      .select("id,full_name")
      .in("id", [...contactIds]);
    for (const c of (data ?? []) as any[]) contactName.set(c.id, c.full_name);
  }
  return { campusName, chapterName, orgName, contactName };
}

function labelOf(r: any, res: Awaited<ReturnType<typeof resolveLabels>>): string {
  if (r.entity_type === "campus") return res.campusName.get(r.entity_id) ?? "Campus";
  if (r.entity_type === "chapter") return res.chapterName.get(r.entity_id) ?? "Chapter";
  if (r.entity_type === "org") return res.orgName.get(r.entity_id) ?? "National org";
  if (r.entity_type === "council")
    return `${(r.council_slug ?? "council").toUpperCase()} · ${res.campusName.get(r.campus_id) ?? "Campus"}`;
  return res.campusName.get(r.campus_id) ?? "—";
}

function toEvent(r: any, res: Awaited<ReturnType<typeof resolveLabels>>): OutreachEvent {
  return {
    id: r.id,
    contactId: r.contact_id,
    contactName: r.contact_id ? (res.contactName.get(r.contact_id) ?? null) : null,
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityLabel: labelOf(r, res),
    campusId: r.campus_id,
    channel: r.channel,
    direction: r.direction,
    status: r.status,
    subject: r.subject,
    notes: r.notes,
    occurredAt: r.occurred_at,
    nextFollowUpAt: r.next_follow_up_at,
    followUpDoneAt: r.follow_up_done_at,
    createdBy: r.created_by,
  };
}

// ---- log an event ------------------------------------------------------------
export const logOutreachEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        contactId: z.string().uuid().optional().nullable(),
        entityType: entityType.optional().nullable(),
        entityId: z.string().uuid().optional().nullable(),
        campusId: z.string().uuid().optional().nullable(),
        councilSlug: z.string().trim().max(40).optional().nullable(),
        channel: z.enum(CHANNELS),
        direction: z.enum(DIRECTIONS).default("outbound"),
        status: z.enum(STATUSES).default("logged"),
        subject: z.string().trim().max(300).optional().nullable(),
        body: z.string().trim().max(8000).optional().nullable(),
        notes: z.string().trim().max(4000).optional().nullable(),
        occurredAt: z.string().datetime().optional(),
        nextFollowUpAt: z.string().datetime().optional().nullable(),
        campaignId: z.string().uuid().optional().nullable(),
        who: z.string().trim().max(40).optional(),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; id: number } | { ok: false; error: string; storageReady?: boolean }
    > => {
      const db = await admin();
      const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
      const row: Record<string, unknown> = {
        contact_id: data.contactId ?? null,
        entity_type: data.entityType ?? null,
        entity_id: data.entityType === "council" ? null : (data.entityId ?? null),
        campus_id: data.campusId ?? null,
        council_slug: data.entityType === "council" ? clean(data.councilSlug) : null,
        channel: data.channel,
        direction: data.direction,
        status: data.status,
        subject: clean(data.subject),
        body: clean(data.body),
        notes: clean(data.notes),
        occurred_at: data.occurredAt ?? new Date().toISOString(),
        next_follow_up_at: data.nextFollowUpAt ?? null,
        campaign_id: data.campaignId ?? null,
        created_by: data.who ?? null,
      };

      // When a new touch lands, close out any open follow-ups on the same target.
      await closeFollowUps(db, data);

      const { data: ins, error } = await db
        .from("growth_outreach_events")
        .insert(row)
        .select("id")
        .single();
      if (error && isMissingTable(error))
        return { ok: false, error: "storage not provisioned", storageReady: false };
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: ins.id as number };
    },
  );

async function closeFollowUps(
  db: DB,
  data: {
    contactId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    campusId?: string | null;
  },
) {
  try {
    let q = db
      .from("growth_outreach_events")
      .update({ follow_up_done_at: new Date().toISOString() })
      .is("follow_up_done_at", null)
      .not("next_follow_up_at", "is", null);
    if (data.contactId) q = q.eq("contact_id", data.contactId);
    else if (data.entityType && data.entityId)
      q = q.eq("entity_type", data.entityType).eq("entity_id", data.entityId);
    else if (data.campusId) q = q.eq("campus_id", data.campusId);
    else return;
    await q;
  } catch {
    /* best-effort; ignore if table missing */
  }
}

// ---- set a follow-up without a full event (thin action) ----------------------
export const setFollowUp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        contactId: z.string().uuid().optional().nullable(),
        entityType: entityType.optional().nullable(),
        entityId: z.string().uuid().optional().nullable(),
        campusId: z.string().uuid().optional().nullable(),
        councilSlug: z.string().trim().max(40).optional().nullable(),
        nextFollowUpAt: z.string().datetime(),
        note: z.string().trim().max(2000).optional().nullable(),
        who: z.string().trim().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; storageReady?: boolean }> => {
    const db = await admin();
    const row: Record<string, unknown> = {
      contact_id: data.contactId ?? null,
      entity_type: data.entityType ?? null,
      entity_id: data.entityType === "council" ? null : (data.entityId ?? null),
      campus_id: data.campusId ?? null,
      council_slug: data.entityType === "council" ? (data.councilSlug ?? null) : null,
      channel: "other",
      direction: "outbound",
      status: "logged",
      notes: data.note ?? "Follow-up scheduled",
      occurred_at: new Date().toISOString(),
      next_follow_up_at: data.nextFollowUpAt,
      created_by: data.who ?? null,
    };
    const { error } = await db.from("growth_outreach_events").insert(row);
    if (error && isMissingTable(error))
      return { ok: false, error: "storage not provisioned", storageReady: false };
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

// ---- list events for a target (timeline) -------------------------------------
export const listOutreachEvents = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        contactId: z.string().uuid().optional(),
        entityType: entityType.optional(),
        entityId: z.string().uuid().optional(),
        campusId: z.string().uuid().optional(),
        channel: z.enum(CHANNELS).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<{ storageReady: boolean; rows: OutreachEvent[] }> => {
    const db = await admin();
    let q = db
      .from("growth_outreach_events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.contactId) q = q.eq("contact_id", data.contactId);
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.campusId) q = q.eq("campus_id", data.campusId);
    if (data.channel) q = q.eq("channel", data.channel);
    const { data: rows, error } = await q;
    if (error && isMissingTable(error)) return { storageReady: false, rows: [] };
    if (error) throw error;
    const res = await resolveLabels(db, (rows ?? []) as any[]);
    return { storageReady: true, rows: ((rows ?? []) as any[]).map((r) => toEvent(r, res)) };
  });

// ---- the work queue ----------------------------------------------------------
export type QueueView = "today" | "overdue" | "never" | "replied";

export interface QueueItem {
  key: string;
  kind: "event" | "campus";
  event?: OutreachEvent;
  campusId?: string;
  label: string;
  sublabel: string | null;
  dueAt: string | null;
  campusName: string | null;
}

export const getOutreachQueue = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        view: z.enum(["today", "overdue", "never", "replied"]).default("today"),
        campusId: z.string().uuid().optional(),
        channel: z.enum(CHANNELS).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d ?? {}),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      storageReady: boolean;
      items: QueueItem[];
      counts: Record<QueueView, number>;
    }> => {
      const db = await admin();
      const nowIso = new Date().toISOString();
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const endToday = endOfToday.toISOString();

      // pull all events (small table) for bucketing
      const { data: evData, error } = await db.from("growth_outreach_events").select("*");
      if (error && isMissingTable(error))
        return {
          storageReady: false,
          items: [],
          counts: { today: 0, overdue: 0, never: 0, replied: 0 },
        };
      if (error) throw error;
      let events = (evData ?? []) as any[];
      if (data.campusId) events = events.filter((e) => e.campus_id === data.campusId);
      if (data.channel) events = events.filter((e) => e.channel === data.channel);

      const res = await resolveLabels(db, events);

      const openFollowUps = events.filter((e) => e.next_follow_up_at && !e.follow_up_done_at);
      const overdue = openFollowUps.filter((e) => e.next_follow_up_at < nowIso);
      const today = openFollowUps.filter(
        (e) => e.next_follow_up_at >= nowIso && e.next_follow_up_at <= endToday,
      );
      const repliedRecent = (() => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 14);
        const c = cutoff.toISOString();
        return events
          .filter((e) => e.status === "replied" && e.occurred_at >= c)
          .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
      })();

      // never-contacted campuses (greek-ready but zero events)
      const neverCampuses = await neverContactedCampuses(db, events);

      const counts: Record<QueueView, number> = {
        today: today.length,
        overdue: overdue.length,
        never: neverCampuses.length,
        replied: repliedRecent.length,
      };

      const toItem = (e: any): QueueItem => ({
        key: `e${e.id}`,
        kind: "event",
        event: toEvent(e, res),
        label: e.contact_id
          ? (res.contactName.get(e.contact_id) ?? labelOf(e, res))
          : labelOf(e, res),
        sublabel: e.notes ?? e.subject ?? null,
        dueAt: e.next_follow_up_at ?? e.occurred_at,
        campusName: e.campus_id ? (res.campusName.get(e.campus_id) ?? null) : null,
      });

      let items: QueueItem[] = [];
      if (data.view === "today")
        items = today
          .sort((a, b) => (a.next_follow_up_at < b.next_follow_up_at ? -1 : 1))
          .map(toItem);
      else if (data.view === "overdue")
        items = overdue
          .sort((a, b) => (a.next_follow_up_at < b.next_follow_up_at ? -1 : 1))
          .map(toItem);
      else if (data.view === "replied") items = repliedRecent.map(toItem);
      else
        items = neverCampuses.map((c) => ({
          key: `c${c.id}`,
          kind: "campus",
          campusId: c.id,
          label: c.name,
          sublabel: `${c.chapters} chapters · no outreach yet`,
          dueAt: null,
          campusName: c.name,
        }));

      return { storageReady: true, items: items.slice(0, data.limit), counts };
    },
  );

async function neverContactedCampuses(
  db: DB,
  events: any[],
): Promise<{ id: string; name: string; chapters: number }[]> {
  const contactedCampus = new Set(events.map((e) => e.campus_id).filter(Boolean));
  // campuses that have chapters (greek-ready) but never appear in events
  const chaptersByCampus = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("campus_greek_chapters")
      .select("campus_id,archived_at")
      .is("archived_at", null)
      .range(from, from + PAGE - 1);
    if (error) break;
    const batch = (data ?? []) as any[];
    for (const r of batch)
      if (r.campus_id)
        chaptersByCampus.set(r.campus_id, (chaptersByCampus.get(r.campus_id) ?? 0) + 1);
    if (batch.length < PAGE) break;
  }
  const candidateIds = [...chaptersByCampus.keys()].filter((id) => !contactedCampus.has(id));
  if (!candidateIds.length) return [];
  const names = new Map<string, string>();
  for (let i = 0; i < candidateIds.length; i += 500) {
    const slice = candidateIds.slice(i, i + 500);
    const { data } = await db
      .from("campuses")
      .select("id,name,institution_name,archived_at")
      .in("id", slice);
    for (const c of (data ?? []) as any[])
      if (!c.archived_at) names.set(c.id, c.institution_name || c.name || "Campus");
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name, chapters: chaptersByCampus.get(id) ?? 0 }))
    .sort((a, b) => b.chapters - a.chapters);
}
