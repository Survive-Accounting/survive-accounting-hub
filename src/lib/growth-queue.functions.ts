// GROWTH OUTREACH QUEUE — server functions for the campus OUTREACH tab + email queue.
// (growth-outreach.functions.ts is the older manual event/follow-up layer from
// growth-admin-v1; THIS file owns the eligibility read, queue assembly, preview,
// approval, and send flow for the V1 dashboard.)
//
// Read surface: growth_outreach_eligibility (the handoff's single legitimate-contact
// view). Queue + history spine: growth_outreach_events. QC writes go through
// growth_contact_qc. NOTHING sends without: queue assembly (all hold rules) →
// human preview → explicit approve → explicit "Send approved" action. Instagram
// is display + manual DM logging only (no Meta integration — not faked).
//
// LAW: ships to client bundle — service-role client + admin gate imported
// dynamically inside handlers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  assembleQueue,
  classifyContact,
  compareEntities,
  defaultContactFor,
  needsReview,
  renderGrowthTemplate,
  type ContactClass,
  type EligibleContact,
  type MergeVars,
} from "@/lib/growth-outreach-core";

type DB = { from: (t: string) => any };

const adminDb = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const toContact = (r: any): EligibleContact => ({
  qcId: r.qc_id,
  contactSource: r.contact_source,
  campusId: r.campus_id,
  chapterId: r.chapter_id ?? null,
  councilType: r.council_type ?? null,
  orgId: r.org_id ?? null,
  campaignPurpose: r.campaign_purpose ?? null,
  contactType: r.contact_type ?? null,
  name: r.name ?? null,
  role: r.role ?? null,
  email: r.email ?? null,
  instagram: r.instagram ?? null,
  confidence: r.confidence ?? null,
  lastVerified: r.last_verified ?? null,
  sourceUrl: r.source ?? null,
  freshnessStatus: r.freshness_status ?? null,
  outreachEligible: !!r.outreach_eligible,
  reviewReason: r.review_reason ?? null,
  qcAction: r.qc_action ?? null,
});

// ---------------------------------------------------------------------------------
// Contact tree for one campus (grouped by entity)
// ---------------------------------------------------------------------------------

export interface OutreachContactRow extends EligibleContact {
  class: ContactClass;
  isDefault: boolean;
}
export interface OutreachEntity {
  key: string; // council:<type> | chapter:<id> | club:<id>
  kind: "council" | "chapter" | "club";
  label: string;
  sublabel: string | null;
  /** Chapter members — greek_chapter_academic_metrics.latest_member_count, falling back to
   *  campus_greek_chapters.chapter_size. Drives biggest-first and the top-5 priority pick. */
  size: number | null;
  /** V2 Phase 3: the targets to fill first. council + top-5 IFC + top-5 Panhellenic +
   *  Women-in-Business clubs. null = work-it-later. */
  priorityGroup: "council" | "fraternity" | "sorority" | "club" | null;
  contacts: OutreachContactRow[];
}

export const growthOutreachContacts = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ entities: OutreachEntity[] }> => {
    const db = await adminDb();
    const [{ data: rows }, { data: chapters }, { data: clubs }, { data: metrics }] =
      await Promise.all([
        db.from("growth_outreach_eligibility").select("*").eq("campus_id", data.campusId),
        db
          .from("campus_greek_chapters")
          .select("id,council,greek_org_id,chapter_size")
          .eq("campus_id", data.campusId)
          .is("archived_at", null),
        db.from("growth_business_clubs").select("id,name,category").eq("campus_id", data.campusId),
        // Real chapter sizes live here (chapter_size is still empty); prefer latest_member_count.
        db
          .from("greek_chapter_academic_metrics")
          .select("campus_greek_chapter_id,latest_member_count")
          .eq("campus_id", data.campusId),
      ]);
    const memberCountOf = new Map<string, number>();
    for (const m of (metrics ?? []) as any[]) {
      if (m.campus_greek_chapter_id && m.latest_member_count != null)
        memberCountOf.set(m.campus_greek_chapter_id, m.latest_member_count);
    }
    const orgIds = [...new Set((chapters ?? []).map((c: any) => c.greek_org_id).filter(Boolean))];
    const orgNames = new Map<string, string>();
    if (orgIds.length) {
      const { data: orgs } = await db.from("greek_orgs").select("id,name").in("id", orgIds);
      for (const o of orgs ?? []) orgNames.set(o.id, o.name);
    }
    const chapterInfo = new Map<
      string,
      { name: string; council: string | null; size: number | null }
    >();
    for (const c of (chapters ?? []) as any[]) {
      chapterInfo.set(c.id, {
        name: orgNames.get(c.greek_org_id) ?? "Chapter",
        council: c.council ?? null,
        size: memberCountOf.get(c.id) ?? c.chapter_size ?? null,
      });
    }
    const clubCategory = new Map<string, string | null>(
      (clubs ?? []).map((c: any) => [c.id, c.category ?? null]),
    );
    const clubNames = new Map<string, string>((clubs ?? []).map((c: any) => [c.id, c.name]));

    const byEntity = new Map<string, OutreachEntity>();
    const COUNCIL_LABELS: Record<string, string> = {
      ifc: "IFC",
      panhellenic: "Panhellenic",
      nphc: "NPHC",
      mgc: "MGC",
      other: "Council",
    };
    for (const raw of (rows ?? []) as any[]) {
      const c = toContact(raw);
      let key: string,
        kind: OutreachEntity["kind"],
        label: string,
        sublabel: string | null = null;
      if (c.chapterId) {
        key = `chapter:${c.chapterId}`;
        kind = "chapter";
        const info = chapterInfo.get(c.chapterId);
        label = info?.name ?? "Chapter";
        sublabel = (info?.council ?? "").toUpperCase() || null;
      } else if (c.councilType) {
        key = `council:${c.councilType}`;
        kind = "council";
        label = COUNCIL_LABELS[c.councilType] ?? c.councilType;
        sublabel = "Campus council";
      } else if (c.orgId) {
        key = `club:${c.orgId}`;
        kind = "club";
        label = clubNames.get(c.orgId) ?? "Business club";
        sublabel = "Student org";
      } else continue;
      if (!byEntity.has(key)) {
        const size =
          kind === "chapter" && c.chapterId ? (chapterInfo.get(c.chapterId)?.size ?? null) : null;
        byEntity.set(key, { key, kind, label, sublabel, size, priorityGroup: null, contacts: [] });
      }
      byEntity.get(key)!.contacts.push({ ...c, class: classifyContact(c), isDefault: false });
    }

    // Surface chapters/clubs that have NO contact yet as empty entities, so the top-5
    // priority targets still show up for King to go fill (an empty entity renders its
    // Add-email affordance). Without this, a big fraternity with no contact row would be
    // invisible — exactly the ones King most needs to chase.
    for (const c of (chapters ?? []) as any[]) {
      const key = `chapter:${c.id}`;
      if (byEntity.has(key)) continue;
      const info = chapterInfo.get(c.id);
      byEntity.set(key, {
        key,
        kind: "chapter",
        label: info?.name ?? "Chapter",
        sublabel: (info?.council ?? "").toUpperCase() || null,
        size: info?.size ?? null,
        priorityGroup: null,
        contacts: [],
      });
    }
    for (const c of (clubs ?? []) as any[]) {
      const key = `club:${c.id}`;
      if (byEntity.has(key)) continue;
      byEntity.set(key, {
        key,
        kind: "club",
        label: c.name ?? "Business club",
        sublabel: "Student org",
        size: null,
        priorityGroup: null,
        contacts: [],
      });
    }

    const entities = [...byEntity.values()];

    // ── PRIORITY TARGETS (V2 Phase 3) ──────────────────────────────────────────────
    // The rows King fills first: every council, the top-5 fraternities and top-5
    // sororities by member count, and any Women-in-Business club. The rest are still
    // here, just below the fold. Council text is free-form, so match, don't ===.
    const councilKind = (raw: string | null): "fraternity" | "sorority" | null => {
      const s = (raw ?? "").toLowerCase();
      if (/ifc|interfratern/.test(s)) return "fraternity";
      if (/panhel|\bphc\b/.test(s)) return "sorority";
      return null; // NPHC / MGC / multicultural — their councils are still priority, chapters aren't
    };
    const bySizeDesc = (a: OutreachEntity, b: OutreachEntity) =>
      (b.size ?? -1) - (a.size ?? -1) || a.label.localeCompare(b.label);
    const frats: OutreachEntity[] = [];
    const sororities: OutreachEntity[] = [];
    for (const e of entities) {
      if (e.kind === "council") {
        e.priorityGroup = "council";
      } else if (e.kind === "chapter") {
        const info = chapterInfo.get(e.key.split(":")[1]);
        const ck = councilKind(info?.council ?? e.sublabel);
        if (ck === "fraternity") frats.push(e);
        else if (ck === "sorority") sororities.push(e);
      } else if (e.kind === "club") {
        const cat = (clubCategory.get(e.key.split(":")[1]) ?? "").toLowerCase();
        if (/women|wib/.test(cat) || /women in business/.test(e.label.toLowerCase()))
          e.priorityGroup = "club";
      }
    }
    for (const e of frats.sort(bySizeDesc).slice(0, 5)) e.priorityGroup = "fraternity";
    for (const e of sororities.sort(bySizeDesc).slice(0, 5)) e.priorityGroup = "sorority";

    // Priority group first (council → frat → sorority → club), biggest-first inside it;
    // everything else keeps the old council/size ordering underneath.
    const groupRank: Record<string, number> = { council: 0, fraternity: 1, sorority: 2, club: 3 };
    entities.sort((a, b) => {
      const ap = a.priorityGroup ? groupRank[a.priorityGroup] : 9;
      const bp = b.priorityGroup ? groupRank[b.priorityGroup] : 9;
      if (ap !== bp) return ap - bp;
      if (a.priorityGroup && b.priorityGroup) return bySizeDesc(a, b);
      return compareEntities(a, b);
    });

    for (const e of entities) {
      const def = defaultContactFor(e.contacts);
      for (const c of e.contacts) c.isDefault = def != null && c.qcId === def.qcId;
      const classOrder: Record<ContactClass, number> = {
        CURRENT_HIGH: 0,
        USABLE: 1,
        SOCIAL: 2,
        VERIFY: 3,
        ADVISORY: 4,
      };
      e.contacts.sort(
        (a, b) =>
          classOrder[a.class] - classOrder[b.class] ||
          (a.email ?? a.instagram ?? "").localeCompare(b.email ?? b.instagram ?? ""),
      );
    }
    return { entities };
  });

// ---------------------------------------------------------------------------------
// Merge vars for one contact
// ---------------------------------------------------------------------------------

async function varsForContact(db: DB, c: EligibleContact): Promise<MergeVars> {
  const [{ data: campus }, { data: status }] = await Promise.all([
    db.from("campuses").select("name,display_name,slug").eq("id", c.campusId).maybeSingle(),
    db
      .from("course_intel_campus_status")
      .select("course_code")
      .eq("campus_id", c.campusId)
      .maybeSingle(),
  ]);
  let chapterName: string | null = null;
  if (c.chapterId) {
    const { data: ch } = await db
      .from("campus_greek_chapters")
      .select("greek_org_id,council")
      .eq("id", c.chapterId)
      .maybeSingle();
    if (ch?.greek_org_id) {
      const { data: org } = await db
        .from("greek_orgs")
        .select("name")
        .eq("id", ch.greek_org_id)
        .maybeSingle();
      chapterName = org?.name ?? null;
    }
  }
  const firstName = c.name?.trim().split(/\s+/)[0] ?? null;
  const campusName = campus?.display_name || campus?.name || null;
  const origin = "https://www.surviveaccounting.com";
  const tracked = campus?.slug ? `${origin}/${campus.slug}` : origin;
  return {
    first_name: {
      value: firstName,
      source: "contact.name",
      confidence: firstName ? "medium" : "low",
      lastVerified: c.lastVerified,
    },
    role: {
      value: c.role ?? null,
      source: "contact.role",
      confidence: c.role ? "medium" : "low",
      lastVerified: c.lastVerified,
    },
    chapter: {
      value: chapterName,
      source: "greek_orgs.name",
      confidence: chapterName ? "medium" : "low",
      lastVerified: null,
    },
    council: {
      value: c.councilType ? c.councilType.toUpperCase() : null,
      source: "council_type",
      confidence: "medium",
      lastVerified: null,
    },
    campus: { value: campusName, source: "campuses.name", confidence: "high", lastVerified: null },
    course_code: {
      value: status?.course_code ?? null,
      source: "course_intel_campus_status",
      confidence: status?.course_code ? "medium" : "low",
      lastVerified: null,
    },
    tracked_link: {
      value: tracked,
      source: "campus landing page",
      confidence: "high",
      lastVerified: null,
    },
  };
}

const REQUIRED_VARS = ["campus", "tracked_link"];

// ---------------------------------------------------------------------------------
// Queue assembly (writes growth_outreach_events status='queued')
// ---------------------------------------------------------------------------------

export const growthAssembleQueue = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid(),
        qcIds: z.array(z.string().uuid()).min(1).max(500),
        templateKey: z.string().min(1),
        campaignId: z.string().min(1).max(80),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      queued: number;
      held: { email: string | null; name: string | null; reason: string }[];
    }> => {
      const db = await adminDb();
      const [{ data: rows }, { data: template }, { data: supp }] = await Promise.all([
        db
          .from("growth_outreach_eligibility")
          .select("*")
          .eq("campus_id", data.campusId)
          .in("qc_id", data.qcIds),
        db
          .from("growth_outreach_templates")
          .select("*")
          .eq("key", data.templateKey)
          .eq("is_active", true)
          .maybeSingle(),
        db.from("comms_suppressions").select("email"),
      ]);
      if (!template) throw new Error(`Template ${data.templateKey} not found`);
      const contacts = ((rows ?? []) as any[]).map(toContact);
      // keep the caller's selection order (dedupe winner = first selected)
      const order = new Map(data.qcIds.map((id, i) => [id, i]));
      contacts.sort((a, b) => (order.get(a.qcId) ?? 0) - (order.get(b.qcId) ?? 0));

      const emails = contacts.map((c) => c.email?.toLowerCase()).filter(Boolean) as string[];
      const prior = new Set<string>();
      if (emails.length) {
        const { data: pe } = await db
          .from("growth_outreach_events")
          .select("email")
          .in("email", emails)
          .eq("direction", "outbound")
          .eq("channel", "email")
          .in("status", ["queued", "sent", "delivered", "opened", "clicked", "replied"]);
        for (const p of pe ?? []) if (p.email) prior.add(String(p.email).toLowerCase());
      }
      const ctx = {
        suppressedEmails: new Set(
          ((supp ?? []) as any[]).map((s) => String(s.email ?? "").toLowerCase()).filter(Boolean),
        ),
        previouslyContacted: prior,
      };
      const decisions = assembleQueue(contacts, ctx);

      const held: { email: string | null; name: string | null; reason: string }[] = [];
      const inserts: any[] = [];
      for (const d2 of decisions) {
        if (!d2.ok) {
          held.push({ email: d2.contact.email, name: d2.contact.name, reason: d2.reason! });
          continue;
        }
        const c = d2.contact;
        const vars = await varsForContact(db, c);
        const subject = renderGrowthTemplate(template.subject, vars);
        const body = renderGrowthTemplate(template.body, vars);
        const review = needsReview(body, vars, c, REQUIRED_VARS);
        inserts.push({
          contact_id: c.qcId,
          entity_type: c.chapterId ? "chapter" : c.councilType ? "council" : "club",
          entity_id: c.chapterId ?? c.orgId ?? null,
          campus_id: c.campusId,
          council_slug: c.councilType,
          channel: "email",
          direction: "outbound",
          status: "queued",
          campaign_id: data.campaignId,
          template_id: template.key,
          subject: subject.text,
          body: body.text,
          email: c.email!.trim().toLowerCase(),
          occurred_at: new Date().toISOString(),
          notes: review.review ? `NEEDS_REVIEW: ${review.reasons.join("; ")}` : null,
        });
      }
      if (inserts.length) {
        const { error } = await db.from("growth_outreach_events").insert(inserts);
        if (error) throw new Error(`queue write failed: ${error.message}`);
      }
      return { queued: inserts.length, held };
    },
  );

// ---------------------------------------------------------------------------------
// Queue browsing + per-item actions
// ---------------------------------------------------------------------------------

export interface GrowthQueueItem {
  id: string;
  campusId: string | null;
  campusName: string | null;
  entityType: string | null;
  entityLabel: string | null;
  to: string | null;
  subject: string | null;
  body: string | null;
  templateId: string | null;
  campaignId: string | null;
  status: string;
  approvedBy: string | null;
  needsReview: boolean;
  reviewNote: string | null;
}

async function labelEvents(db: DB, events: any[]): Promise<GrowthQueueItem[]> {
  const campusIds = [...new Set(events.map((e) => e.campus_id).filter(Boolean))];
  const campusNames = new Map<string, string>();
  if (campusIds.length) {
    const { data } = await db.from("campuses").select("id,name,display_name").in("id", campusIds);
    for (const c of data ?? []) campusNames.set(c.id, c.display_name || c.name);
  }
  const chapterIds = [
    ...new Set(
      events
        .filter((e) => e.entity_type === "chapter")
        .map((e) => e.entity_id)
        .filter(Boolean),
    ),
  ];
  const chapterNames = new Map<string, string>();
  if (chapterIds.length) {
    const { data: chs } = await db
      .from("campus_greek_chapters")
      .select("id,greek_org_id")
      .in("id", chapterIds);
    const orgIds = [...new Set((chs ?? []).map((c: any) => c.greek_org_id).filter(Boolean))];
    const orgNames = new Map<string, string>();
    if (orgIds.length) {
      const { data: orgs } = await db.from("greek_orgs").select("id,name").in("id", orgIds);
      for (const o of orgs ?? []) orgNames.set(o.id, o.name);
    }
    for (const c of chs ?? []) chapterNames.set(c.id, orgNames.get(c.greek_org_id) ?? "Chapter");
  }
  return events.map((e) => ({
    id: e.id,
    campusId: e.campus_id,
    campusName: campusNames.get(e.campus_id) ?? null,
    entityType: e.entity_type,
    entityLabel:
      e.entity_type === "chapter"
        ? (chapterNames.get(e.entity_id) ?? "Chapter")
        : e.entity_type === "council"
          ? e.council_slug
            ? String(e.council_slug).toUpperCase()
            : "Council"
          : e.entity_type === "club"
            ? "Business club"
            : null,
    to: e.email,
    subject: e.subject,
    body: e.body,
    templateId: e.template_id,
    campaignId: e.campaign_id,
    status: e.status,
    approvedBy: e.approved_by ?? null,
    needsReview: !!(e.notes && String(e.notes).startsWith("NEEDS_REVIEW")),
    reviewNote: e.notes ?? null,
  }));
}

export const growthQueueList = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ campaignId: z.string().optional(), campusId: z.string().uuid().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<{ items: GrowthQueueItem[] }> => {
    const db = await adminDb();
    let q = db
      .from("growth_outreach_events")
      .select("*")
      .eq("status", "queued")
      .eq("channel", "email")
      .order("occurred_at", { ascending: true });
    if (data.campaignId) q = q.eq("campaign_id", data.campaignId);
    if (data.campusId) q = q.eq("campus_id", data.campusId);
    const { data: events, error } = await q;
    if (error) throw new Error(error.message);
    return { items: await labelEvents(db, events ?? []) };
  });

export const growthQueueAction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        action: z.enum(["approve", "unapprove", "skip", "edit", "wrong_data"]),
        subject: z.string().optional(),
        body: z.string().optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { assertAdmin, adminSessionOk } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const who = (await adminSessionOk())?.email ?? "admin";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as DB;
    const { data: ev } = await db
      .from("growth_outreach_events")
      .select("*")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) throw new Error("queue item not found");
    if (ev.status !== "queued") throw new Error(`item is ${ev.status}, not queued`);

    if (data.action === "approve") {
      await db
        .from("growth_outreach_events")
        .update({ approved_by: who, approved_at: new Date().toISOString() })
        .eq("id", data.eventId);
    } else if (data.action === "unapprove") {
      await db
        .from("growth_outreach_events")
        .update({ approved_by: null, approved_at: null })
        .eq("id", data.eventId);
    } else if (data.action === "skip") {
      await db
        .from("growth_outreach_events")
        .update({
          status: "logged",
          notes: `skipped by ${who}${data.note ? `: ${data.note}` : ""}`,
        })
        .eq("id", data.eventId);
    } else if (data.action === "edit") {
      await db
        .from("growth_outreach_events")
        .update({
          subject: data.subject ?? ev.subject,
          body: data.body ?? ev.body,
          notes: (ev.notes ? `${ev.notes} · ` : "") + `edited by ${who}`,
          approved_by: null,
          approved_at: null, // an edit re-requires approval
        })
        .eq("id", data.eventId);
    } else if (data.action === "wrong_data") {
      // hold the email AND write through the QC correction path so the fix sticks
      await db
        .from("growth_outreach_events")
        .update({
          status: "logged",
          notes: `wrong_data by ${who}${data.note ? `: ${data.note}` : ""}`,
        })
        .eq("id", data.eventId);
      if (ev.contact_id) {
        await db
          .from("growth_contact_qc")
          .update({
            qc_action: "pending",
            outreach_eligible: false,
            review_reason: `wrong_data flagged from outreach queue by ${who}${data.note ? `: ${data.note}` : ""}`,
          })
          .eq("id", ev.contact_id);
      }
    }
    return { ok: true };
  });

/** THE send action. Sends ONLY items that are BOTH queued and human-approved. */
export const growthSendApproved = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ sent: number; failed: number; skipped: number }> => {
    const db = await adminDb();
    const { data: events } = await db
      .from("growth_outreach_events")
      .select("*")
      .eq("campaign_id", data.campaignId)
      .eq("status", "queued")
      .eq("channel", "email")
      .not("approved_by", "is", null);
    let sent = 0,
      failed = 0,
      skipped = 0;
    const { sendResendEmail } = await import("@/lib/email.server");
    const { isSuppressed } = await import("@/lib/comms/send.server");
    for (const ev of (events ?? []) as any[]) {
      if (!ev.email) {
        skipped++;
        continue;
      }
      if (await isSuppressed(db, { email: ev.email })) {
        await db
          .from("growth_outreach_events")
          .update({ status: "logged", notes: `${ev.notes ?? ""} · suppressed at send`.trim() })
          .eq("id", ev.id);
        skipped++;
        continue;
      }
      const res = await sendResendEmail({
        to: ev.email,
        subject: ev.subject ?? "",
        text: ev.body ?? "",
      });
      if (res.ok) {
        await db
          .from("growth_outreach_events")
          .update({
            status: "sent",
            message_id: res.id ?? null,
            occurred_at: new Date().toISOString(),
          })
          .eq("id", ev.id);
        sent++;
      } else {
        await db
          .from("growth_outreach_events")
          .update({ notes: `${ev.notes ?? ""} · send failed: ${res.error ?? "unknown"}`.trim() })
          .eq("id", ev.id);
        failed++;
      }
    }
    return { sent, failed, skipped };
  });

// ---------------------------------------------------------------------------------
// Manual IG DM logging, reply category, history, daily targets
// ---------------------------------------------------------------------------------

export const growthLogDm = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid(),
        chapterId: z.string().uuid().nullable().optional(),
        councilType: z.string().nullable().optional(),
        qcId: z.string().uuid().nullable().optional(),
        note: z.string().max(2000).optional(),
        direction: z.enum(["outbound", "inbound"]).default("outbound"),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await adminDb();
    const { error } = await db.from("growth_outreach_events").insert({
      contact_id: data.qcId ?? null,
      entity_type: data.chapterId ? "chapter" : data.councilType ? "council" : "campus",
      entity_id: data.chapterId ?? null,
      campus_id: data.campusId,
      council_slug: data.councilType ?? null,
      channel: "ig_dm",
      direction: data.direction,
      status: "logged",
      occurred_at: new Date().toISOString(),
      notes: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const growthSetReplyCategory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        category: z.enum([
          "interested",
          "question",
          "referred",
          "not_interested",
          "unsubscribe",
          "other",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await adminDb();
    const { data: ev } = await db
      .from("growth_outreach_events")
      .select("id,email")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) throw new Error("event not found");
    await db
      .from("growth_outreach_events")
      .update({ reply_category: data.category, status: "replied" })
      .eq("id", data.eventId);
    if (data.category === "unsubscribe" && ev.email) {
      const { suppress } = await import("@/lib/comms/send.server");
      await suppress(db, { email: ev.email }, "unsubscribe", "growth_outreach");
    }
    return { ok: true };
  });

export interface GrowthOutreachHistory {
  emailsSent: number;
  replies: number;
  positive: number;
  igDms: number;
  followUpsDue: number;
  timeline: {
    at: string;
    channel: string;
    direction: string;
    status: string;
    label: string;
    note: string | null;
  }[];
}

export const growthCampusOutreachHistory = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid().optional(),
        entityId: z.string().uuid().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<GrowthOutreachHistory> => {
    const db = await adminDb();
    let q = db
      .from("growth_outreach_events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    else if (data.campusId) q = q.eq("campus_id", data.campusId);
    const { data: events } = await q;
    const rows = (events ?? []) as any[];
    const now = Date.now();
    return {
      emailsSent: rows.filter(
        (e) =>
          e.channel === "email" &&
          e.direction === "outbound" &&
          ["sent", "delivered", "opened", "clicked", "replied"].includes(e.status),
      ).length,
      replies: rows.filter((e) => e.status === "replied" || e.direction === "inbound").length,
      positive: rows.filter((e) => e.reply_category === "interested").length,
      igDms: rows.filter((e) => e.channel === "ig_dm").length,
      followUpsDue: rows.filter(
        (e) =>
          e.next_follow_up_at &&
          !e.follow_up_done_at &&
          new Date(e.next_follow_up_at).getTime() <= now,
      ).length,
      timeline: rows.slice(0, 40).map((e) => ({
        at: e.occurred_at,
        channel: e.channel,
        direction: e.direction,
        status: e.status,
        label: `${e.channel === "ig_dm" ? "Instagram" : "Email"} ${e.direction === "inbound" ? "reply" : e.status}`,
        note: e.notes ?? null,
      })),
    };
  });

const DEFAULT_TARGETS = { email: 100, instagram: 10 };

export const growthDailyProgress = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    email: { done: number; target: number };
    instagram: { done: number; target: number };
    followUpsDue: number;
  }> => {
    const db = await adminDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [{ data: events }, { data: settingsRow }] = await Promise.all([
      db
        .from("growth_outreach_events")
        .select("channel,direction,status,message_id")
        .gte("occurred_at", today.toISOString()),
      db.from("site_settings").select("settings").limit(1).maybeSingle(),
    ]);
    const targets = {
      ...DEFAULT_TARGETS,
      ...((settingsRow?.settings as any)?.growthDailyTargets ?? {}),
    };
    const rows = (events ?? []) as any[];
    const dueRes = await db
      .from("growth_outreach_events")
      .select("id", { count: "exact", head: true })
      .lte("next_follow_up_at", new Date().toISOString())
      .is("follow_up_done_at", null);
    return {
      email: {
        // A PROVIDER MESSAGE ID IS THE ONLY PROOF A SEND HAPPENED. The legacy manual-log page
        // writes status='sent' rows with no message_id and no address; counting those once
        // showed "4 emails sent today" when nothing had left the building.
        done: rows.filter(
          (e) => e.channel === "email" && e.direction === "outbound" && !!e.message_id,
        ).length,
        target: targets.email,
      },
      instagram: {
        done: rows.filter((e) => e.channel === "ig_dm" && e.direction === "outbound").length,
        target: targets.instagram,
      },
      followUpsDue: (dueRes as any)?.count ?? 0,
    };
  },
);

export const growthTemplates = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    templates: { key: string; name: string; audience: string; subject: string }[];
  }> => {
    const db = await adminDb();
    const { data } = await db
      .from("growth_outreach_templates")
      .select("key,name,audience,subject")
      .eq("is_active", true)
      .order("audience");
    return { templates: (data ?? []) as any[] };
  },
);

/* ── THE TASKS STRIP (pre-launch simplification, 2026-08-27) ──────────────────────────
   The first thing King reads every morning: quota progress, the next three campuses
   with unworked council contacts, and how many contacts still lack an email. One
   query bundle, computed the same honest way as everything else (provider-confirmed
   sends only). */

export interface GrowthTasks {
  quota: {
    emails: number;
    emailTarget: number;
    dms: number;
    dmTarget: number;
  };
  /** Top-priority campuses with an eligible council email and ZERO outbound history. */
  nextUp: { campusId: string; name: string; councilContacts: number; rank: number }[];
  /** Contacts reachable only by Instagram — no email on file. */
  gaps: {
    total: number;
    campuses: number;
    topCampusId: string | null;
    topCampusName: string | null;
  };
}

export const growthTasks = createServerFn({ method: "GET" }).handler(
  async (): Promise<GrowthTasks> => {
    const db = await adminDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // PostgREST pages at 1000 rows, and the eligibility view holds 4,000+ — an unpaged
    // select here silently dropped every council row past the cap and told King "every
    // campus has been contacted" on a board with zero outreach. Page the big reads.
    const pageAll = async (table: string, columns: string, filter?: (q: any) => any) => {
      const out: any[] = [];
      for (let from = 0; ; from += 1000) {
        let qy = db
          .from(table)
          .select(columns)
          .range(from, from + 999);
        if (filter) qy = filter(qy);
        const { data: page, error } = await qy;
        if (error) throw new Error(`${table}: ${error.message}`);
        out.push(...(page ?? []));
        if (!page || page.length < 1000) break;
      }
      return out;
    };
    const [eventsToday, eventsAll, elig, priority, settingsRow] = await Promise.all([
      db
        .from("growth_outreach_events")
        .select("channel,direction,message_id")
        .gte("occurred_at", today.toISOString()),
      pageAll("growth_outreach_events", "campus_id,direction", (qy) =>
        qy.eq("direction", "outbound"),
      ),
      pageAll(
        "growth_outreach_eligibility",
        "campus_id,chapter_id,council_type,email,instagram,outreach_eligible",
      ),
      db.from("growth_campus_priority").select("campus_id,rank").order("rank").limit(700),
      db.from("site_settings").select("settings").limit(1).maybeSingle(),
    ]);

    const targets = {
      ...DEFAULT_TARGETS,
      ...((settingsRow.data?.settings as any)?.growthDailyTargets ?? {}),
    };
    const todayRows = (eventsToday.data ?? []) as any[];
    const emails = todayRows.filter(
      (e) => e.channel === "email" && e.direction === "outbound" && !!e.message_id,
    ).length;
    const dms = todayRows.filter((e) => e.channel === "ig_dm" && e.direction === "outbound").length;

    const contacted = new Set((eventsAll as any[]).map((e) => e.campus_id).filter(Boolean));

    // council emails per campus + gap counts, one pass over the eligibility view
    const councilEmails = new Map<string, number>();
    const gapsByCampus = new Map<string, number>();
    for (const e of elig as any[]) {
      if (!e.campus_id) continue;
      if (e.council_type && !e.chapter_id && e.outreach_eligible && e.email) {
        councilEmails.set(e.campus_id, (councilEmails.get(e.campus_id) ?? 0) + 1);
      }
      if (!e.email && e.instagram) {
        gapsByCampus.set(e.campus_id, (gapsByCampus.get(e.campus_id) ?? 0) + 1);
      }
    }

    const rankOf = new Map(((priority.data ?? []) as any[]).map((p) => [p.campus_id, p.rank]));
    const nextUpIds = [...councilEmails.keys()]
      .filter((id) => !contacted.has(id))
      .sort((a, b) => (rankOf.get(a) ?? 9999) - (rankOf.get(b) ?? 9999))
      .slice(0, 3);
    const topGapId =
      [...gapsByCampus.keys()].sort(
        (a, b) => (rankOf.get(a) ?? 9999) - (rankOf.get(b) ?? 9999),
      )[0] ?? null;

    const nameIds = [...new Set([...nextUpIds, topGapId].filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (nameIds.length) {
      const { data } = await db.from("campuses").select("id,name,display_name").in("id", nameIds);
      for (const c of (data ?? []) as any[]) names.set(c.id, c.display_name || c.name);
    }

    return {
      quota: { emails, emailTarget: targets.email, dms, dmTarget: targets.instagram },
      nextUp: nextUpIds.map((id) => ({
        campusId: id,
        name: names.get(id) ?? "Campus",
        councilContacts: councilEmails.get(id) ?? 0,
        rank: rankOf.get(id) ?? 9999,
      })),
      gaps: {
        total: [...gapsByCampus.values()].reduce((n, v) => n + v, 0),
        campuses: gapsByCampus.size,
        topCampusId: topGapId,
        topCampusName: topGapId ? (names.get(topGapId) ?? null) : null,
      },
    };
  },
);
