// growth-cold-activity.functions.ts — the Cold Outreach Activity log (distinct from the broader
// growth-activity feed). An accountability surface, not analytics: a stats strip (this week /
// total, scopeable to one person) + a chronological feed. Everything is DERIVED from existing
// records — manual contact rows (growth_contact_qc where source_type='manual_entry') and
// sends/replies (outreach_touch) — so there's no separate log to remember to write, and it
// backfills from day one.
//
// LAW: service-role client + admin gate imported dynamically inside handlers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { addDays, parseYmd, toYmd } from "@/lib/growth-schedule-core";

type DB = { from: (t: string) => any };
const adminDb = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export type Actor = "lee" | "king" | "ej" | "other";
const actorOf = (s: string | null | undefined): Actor => {
  const v = (s || "").toLowerCase();
  if (v.includes("king")) return "king";
  if (v.includes("ej@") || v === "ej") return "ej";
  if (v.includes("lee")) return "lee";
  return "other";
};
const ACTOR_LABEL: Record<Actor, string> = { lee: "LEE", king: "KING", ej: "EJ", other: "—" };

export type ActivityType = "contact_added" | "not_found" | "emails_sent" | "dms_sent" | "reply_logged" | "warmup" | "feedback";
const TYPE_GROUP: Record<ActivityType, "contacts" | "outreach" | "replies" | "warmup" | "feedback"> = {
  contact_added: "contacts", not_found: "contacts", emails_sent: "outreach", dms_sent: "outreach", reply_logged: "replies", warmup: "warmup", feedback: "feedback",
};

export interface ActivityEvent {
  id: string; ts: string; actor: Actor; actorLabel: string; type: ActivityType;
  verb: string; campusId: string; campusName: string; org: string | null; detail: string | null; count: number;
}
export interface ActivityDay { date: string; events: ActivityEvent[]; quiet: { actor: Actor; label: string }[] }
export interface ActivityWeek { weekStart: string; rows: { actor: Actor; label: string; contacts: number; emails: number; dms: number }[] }
export interface ActivityStat { key: string; label: string; tip: string; thisWeek: number; total: number }
export interface ColdActivityView {
  stats: ActivityStat[];
  days: ActivityDay[];
  weeks: Record<string, ActivityWeek>;
  campuses: { id: string; name: string }[];
}

const weekStartSun = (ymd: string) => { const d = parseYmd(ymd); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return toYmd(d); };
const todayYmd = () => { try { return new Date().toISOString().slice(0, 10); } catch { return "2026-09-01"; } };
const isPerson = (contactType: string | null, name: string | null) => ["student_officer", "chapter_exec", "staff_advisor"].includes(contactType || "") || !!(name && name.trim());

export const growthColdActivity = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    person: z.enum(["all", "lee", "king", "ej"]).default("all"),
    when: z.enum(["today", "week", "30", "all"]).default("week"),
    type: z.enum(["all", "contacts", "outreach", "replies", "warmup", "feedback"]).default("all"),
    campusId: z.string().uuid().nullable().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data }): Promise<ColdActivityView> => {
    const db = await adminDb();
    const today = todayYmd();
    const weekStart = weekStartSun(today);
    const whenFrom = data.when === "today" ? today : data.when === "week" ? weekStart : data.when === "30" ? addDays(today, -30) : "2026-01-01";

    const [{ data: qc }, { data: touches }, { data: feedback }] = await Promise.all([
      db.from("growth_contact_qc").select("id,qc_by,created_at,outreach_eligible,contact_type,name,email,instagram,campus_id,entity_type,entity_id,council_type,prewarmed_at,ig_followed,ig_liked").eq("source_type", "manual_entry"),
      db.from("outreach_touch").select("id,campus_id,org_key,source_channel,sender,created_by,sent_at,replied_at,outcome"),
      db.from("growth_enrichment_feedback").select("id,campus_id,note,created_by,created_at"),
    ]);

    // resolve org labels (referenced set is small)
    const chapterIds = new Set<string>(), clubIds = new Set<string>();
    for (const r of (qc ?? []) as any[]) { if (r.entity_type === "chapter" && r.entity_id) chapterIds.add(r.entity_id); if (r.entity_type === "club" && r.entity_id) clubIds.add(r.entity_id); }
    for (const t of (touches ?? []) as any[]) { const [k, id] = String(t.org_key || "").split(":"); if (k === "chapter" && id) chapterIds.add(id); if (k === "club" && id) clubIds.add(id); }
    const orgNameOf = new Map<string, string>();
    if (chapterIds.size) {
      const { data: chs } = await db.from("campus_greek_chapters").select("id,greek_org_id").in("id", [...chapterIds]);
      const goIds = [...new Set((chs ?? []).map((c: any) => c.greek_org_id).filter(Boolean))] as string[];
      const goName = new Map<string, string>();
      for (let i = 0; i < goIds.length; i += 150) { const { data } = await db.from("greek_orgs").select("id,name").in("id", goIds.slice(i, i + 150)); for (const g of data ?? []) goName.set(g.id, g.name); }
      for (const c of chs ?? []) orgNameOf.set(`chapter:${c.id}`, goName.get(c.greek_org_id) ?? "Chapter");
    }
    if (clubIds.size) { const { data } = await db.from("growth_business_clubs").select("id,name").in("id", [...clubIds]); for (const c of data ?? []) orgNameOf.set(`club:${c.id}`, c.name); }
    const COUNCIL_LABEL: Record<string, string> = { fsl: "Greek Life Office", ifc: "IFC", panhellenic: "Panhellenic", nphc: "NPHC", mgc: "MGC" };
    const labelFor = (entityType: string, entityId: string | null, councilType: string | null): string | null => {
      if (entityType === "council") return COUNCIL_LABEL[councilType || ""] ?? councilType ?? "Council";
      if (entityType === "chapter" && entityId) return orgNameOf.get(`chapter:${entityId}`) ?? "Chapter";
      if (entityType === "club" && entityId) return orgNameOf.get(`club:${entityId}`) ?? "Club";
      return null;
    };
    const orgFromKey = (orgKey: string): string | null => {
      const [k, id] = String(orgKey || "").split(":");
      return labelFor(k === "council" ? "council" : k === "chapter" ? "chapter" : "club", k === "council" ? null : id, k === "council" ? id : null);
    };

    const campusIds = [...new Set([...(qc ?? []).map((r: any) => r.campus_id), ...(touches ?? []).map((t: any) => t.campus_id), ...(feedback ?? []).map((f: any) => f.campus_id)].filter(Boolean))] as string[];
    const campusName = new Map<string, string>();
    if (campusIds.length) { const { data } = await db.from("campuses").select("id,name,display_name").in("id", campusIds); for (const c of data ?? []) campusName.set(c.id, c.display_name || c.name); }

    type Raw = { id: string; ts: string; actor: Actor; type: ActivityType; campusId: string; org: string | null; personalIg: boolean; detail: string | null };
    const raw: Raw[] = [];
    for (const r of (qc ?? []) as any[]) {
      const actor = actorOf(r.qc_by);
      const org = labelFor(r.entity_type, r.entity_id, r.council_type);
      if (r.outreach_eligible === false) raw.push({ id: r.id, ts: r.created_at, actor, type: "not_found", campusId: r.campus_id, org, personalIg: false, detail: null });
      else raw.push({ id: r.id, ts: r.created_at, actor, type: "contact_added", campusId: r.campus_id, org, personalIg: isPerson(r.contact_type, r.name) && !!(r.instagram && String(r.instagram).trim()), detail: null });
      if (r.prewarmed_at) raw.push({ id: `pw-${r.id}`, ts: r.prewarmed_at, actor, type: "warmup", campusId: r.campus_id, org, personalIg: false, detail: [r.ig_followed ? "followed" : null, r.ig_liked ? "liked" : null].filter(Boolean).join(" + ") || "pre-warmed" });
    }
    for (const t of (touches ?? []) as any[]) {
      const actor = actorOf(t.sender || t.created_by);
      const org = orgFromKey(t.org_key);
      if (t.replied_at) raw.push({ id: `r-${t.id}`, ts: t.replied_at, actor, type: "reply_logged", campusId: t.campus_id, org, personalIg: false, detail: t.outcome ?? null });
      if (t.sent_at) raw.push({ id: `s-${t.id}`, ts: t.sent_at, actor, type: t.source_channel === "email" ? "emails_sent" : "dms_sent", campusId: t.campus_id, org, personalIg: false, detail: null });
    }
    for (const f of (feedback ?? []) as any[]) {
      raw.push({ id: `fb-${f.id}`, ts: f.created_at, actor: actorOf(f.created_by), type: "feedback", campusId: f.campus_id ?? "", org: null, personalIg: false, detail: f.note });
    }

    const scoped = raw.filter((e) => data.person === "all" || e.actor === data.person);
    const inWeek = (ts: string) => ts.slice(0, 10) >= weekStart && ts.slice(0, 10) <= addDays(weekStart, 6);
    const stat = (key: string, label: string, tip: string, pred: (e: Raw) => boolean, distinct?: (e: Raw) => string): ActivityStat => {
      const all = scoped.filter(pred), wk = all.filter((e) => inWeek(e.ts));
      const cnt = (evs: Raw[]) => (distinct ? new Set(evs.map(distinct)).size : evs.length);
      return { key, label, tip, thisWeek: cnt(wk), total: cnt(all) };
    };
    const stats: ActivityStat[] = [
      stat("contacts", "Contacts added", "Contacts entered by hand.", (e) => e.type === "contact_added"),
      stat("campuses_enriched", "Campuses enriched", "Campuses where at least one contact was added.", (e) => e.type === "contact_added", (e) => e.campusId),
      stat("emails", "Emails sent", "Emails marked sent from the schedule.", (e) => e.type === "emails_sent"),
      stat("dms", "DMs sent", "Instagram DMs + story replies marked sent.", (e) => e.type === "dms_sent"),
      stat("replies", "Replies logged", "Replies recorded from outreach.", (e) => e.type === "reply_logged"),
      stat("campuses_reached", "Campuses reached", "Campuses where at least one contact has been emailed or DM'd.", (e) => e.type === "emails_sent" || e.type === "dms_sent", (e) => e.campusId),
      stat("chapters_reached", "Chapters reached", "Chapters/orgs with at least one send.", (e) => (e.type === "emails_sent" || e.type === "dms_sent") && !!e.org, (e) => `${e.campusId}|${e.org}`),
      stat("personal_igs", "Personal IGs", "Personal Instagram handles collected — our highest-value field, the easiest to skip.", (e) => e.type === "contact_added" && e.personalIg),
    ];

    // feed: filter → batch identical (actor,type,campus,org) within ~10 min → group by day
    const filtered = scoped.filter((e) => {
      if (data.type !== "all" && TYPE_GROUP[e.type] !== data.type) return false;
      if (data.campusId && e.campusId !== data.campusId) return false;
      if (e.ts.slice(0, 10) < whenFrom) return false;
      return true;
    }).sort((a, b) => (a.ts < b.ts ? 1 : -1));
    // Feedback notes are each distinct — never merge them; everything else batches within ~10 min.
    const bucketKey = (e: Raw) => e.type === "feedback" ? `fb|${e.id}` : `${e.actor}|${e.type}|${e.campusId}|${e.org}|${Math.floor(new Date(e.ts).getTime() / 600000)}`;
    const merged = new Map<string, ActivityEvent & { _igs: number }>();
    for (const e of filtered) {
      const bk = bucketKey(e);
      const ex = merged.get(bk);
      if (ex) { ex.count++; if (e.personalIg) ex._igs++; continue; }
      merged.set(bk, { id: e.id, ts: e.ts, actor: e.actor, actorLabel: ACTOR_LABEL[e.actor], type: e.type, verb: "", campusId: e.campusId, campusName: campusName.get(e.campusId) ?? e.campusId.slice(0, 8), org: e.org, detail: e.detail, count: 1, _igs: e.personalIg ? 1 : 0 });
    }
    const events: ActivityEvent[] = [...merged.values()].map(({ _igs, ...ev }) => {
      const n = ev.count;
      const V: Record<ActivityType, string> = {
        contact_added: `added ${n} contact${n === 1 ? "" : "s"}`, not_found: `marked not found`,
        emails_sent: `sent ${n} email${n === 1 ? "" : "s"}`, dms_sent: `sent ${n} DM${n === 1 ? "" : "s"}`,
        reply_logged: `logged a reply`, warmup: `warmed up ${n}`, feedback: `left feedback`,
      };
      ev.verb = V[ev.type];
      if (ev.type === "contact_added" && _igs > 0) ev.detail = `${_igs} personal IG${_igs === 1 ? "" : "s"}`;
      return ev;
    });

    const byDay = new Map<string, ActivityEvent[]>();
    for (const ev of events) { const d = ev.ts.slice(0, 10); (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(ev); }
    const days: ActivityDay[] = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, evs]) => {
      const active = new Set(evs.map((e) => e.actor));
      const quiet = (["lee", "king"] as Actor[]).filter((a) => (data.person === "all" || data.person === a) && !active.has(a) && date <= today).map((a) => ({ actor: a, label: ACTOR_LABEL[a] }));
      return { date, events: evs, quiet: evs.length ? quiet : [] };
    });

    const weeks: Record<string, ActivityWeek> = {};
    for (const e of filtered) {
      const ws = weekStartSun(e.ts.slice(0, 10));
      const wk = (weeks[ws] ??= { weekStart: ws, rows: [] });
      let row = wk.rows.find((r) => r.actor === e.actor);
      if (!row) { row = { actor: e.actor, label: ACTOR_LABEL[e.actor], contacts: 0, emails: 0, dms: 0 }; wk.rows.push(row); }
      if (e.type === "contact_added") row.contacts++;
      else if (e.type === "emails_sent") row.emails++;
      else if (e.type === "dms_sent") row.dms++;
    }

    const campuses = [...campusName.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    return { stats, days, weeks, campuses };
  });
