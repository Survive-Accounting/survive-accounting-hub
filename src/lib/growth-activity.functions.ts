// GROWTH ACTIVITY — one plain-English feed of everything that happens.
//
// There is no new events table. Everything below already exists somewhere (a practice
// attempt, a waitlist signup, an outreach event, a map approval, a chapter claim); this
// module reads those sources, converts each row into one sentence with a timestamp and a
// campus, and merges them into a single stream. Per campus it answers "what happened here
// and when"; globally it answers "where is anything happening at all".
//
// Test rows never appear (growth-testdata.ts) — a lee+test signup is not activity.
//
// LAW: ships to the client bundle — service-role client + admin gate imported dynamically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isTestRow } from "@/lib/growth-testdata";

type DB = { from: (t: string) => any };

const adminDb = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export type ActivityKind =
  | "practice"
  | "waitlist"
  | "outreach"
  | "reply"
  | "map"
  | "claim"
  | "seat"
  | "enrichment"
  | "submission"
  | "signup"
  | "dm"
  | "click";

export interface ActivityItem {
  id: string;
  at: string; // ISO
  kind: ActivityKind;
  campusId: string | null;
  campusName: string | null;
  /** The whole event as one readable sentence — this is what the feed renders. */
  text: string;
  /** Who did it, when we know: an email, "a student", "Lee". */
  who: string | null;
  detail: string | null;
}

const KIND_LABEL: Record<ActivityKind, string> = {
  practice: "Practice",
  waitlist: "Waitlist",
  outreach: "Outreach",
  reply: "Reply",
  map: "Topic map",
  claim: "Chapter",
  seat: "Seats",
  enrichment: "Research",
  submission: "Syllabus",
  signup: "Signup",
  dm: "DM sent",
  click: "Link click",
};
export const activityKindLabel = (k: ActivityKind): string => KIND_LABEL[k] ?? k;

interface GatherOpts {
  campusId?: string | null;
  /** Restrict to one source — used by the "click a metric, see its log" drawers. */
  kinds?: ActivityKind[];
  limit: number;
}

async function gather(db: DB, opts: GatherOpts): Promise<ActivityItem[]> {
  const want = (k: ActivityKind) => !opts.kinds || opts.kinds.includes(k);
  const items: ActivityItem[] = [];

  // Campus names for every id we touch (one round trip at the end).
  const campusIds = new Set<string>();
  const slugToId = new Map<string, string>();
  const nameOf = new Map<string, string>();
  {
    let q = db.from("campuses").select("id,name,display_name,slug");
    if (opts.campusId) q = q.eq("id", opts.campusId);
    const { data } = await q;
    for (const c of (data ?? []) as any[]) {
      nameOf.set(c.id, c.display_name || c.name);
      if (c.slug) slugToId.set(c.slug, c.id);
    }
  }
  const campusName = (id: string | null) => (id ? (nameOf.get(id) ?? null) : null);

  // ── practice attempts (the "questions answered" log) ────────────────────────────────
  if (want("practice")) {
    const q = db
      .from("practice_attempts")
      .select("id,campus,user_id,session_id,event,correct,created_at,set_id")
      .not("is_test", "is", true)
      .order("created_at", { ascending: false })
      .limit(opts.limit);
    const { data } = await q;
    for (const a of (data ?? []) as any[]) {
      const cid = a.campus ? (slugToId.get(String(a.campus)) ?? null) : null;
      if (opts.campusId && cid !== opts.campusId) continue;
      campusIds.add(cid ?? "");
      items.push({
        id: `practice:${a.id}`,
        at: a.created_at,
        kind: "practice",
        campusId: cid,
        campusName: campusName(cid),
        text: `A student answered a practice question${a.correct === true ? " correctly" : a.correct === false ? " incorrectly" : ""}`,
        who: a.user_id ? "signed-in student" : "anonymous visitor",
        detail: null,
      });
    }
  }

  // ── waitlist / notify signups ───────────────────────────────────────────────────────
  if (want("waitlist")) {
    let q = db
      .from("campus_waitlist")
      .select("id,email,name,campus_id,campus_text,kind,source,is_test,created_at")
      .order("created_at", { ascending: false })
      .limit(opts.limit);
    if (opts.campusId) q = q.eq("campus_id", opts.campusId);
    const { data } = await q;
    for (const w of (data ?? []) as any[]) {
      if (isTestRow(w)) continue;
      items.push({
        id: `waitlist:${w.id}`,
        at: w.created_at,
        kind: "waitlist",
        campusId: w.campus_id ?? null,
        campusName: campusName(w.campus_id ?? null) ?? w.campus_text ?? null,
        text:
          w.kind === "notify_exam"
            ? "Someone asked to be notified about an exam"
            : "Someone joined the waitlist",
        who: w.email ?? w.name ?? "unknown",
        detail: w.source ?? null,
      });
    }
  }

  // ── outreach: sends and replies ─────────────────────────────────────────────────────
  if (want("outreach") || want("reply")) {
    let q = db
      .from("growth_outreach_events")
      .select(
        "id,campus_id,channel,direction,status,email,subject,reply_category,message_id,occurred_at,approved_by,notes",
      )
      .order("occurred_at", { ascending: false })
      .limit(opts.limit);
    if (opts.campusId) q = q.eq("campus_id", opts.campusId);
    const { data } = await q;
    for (const e of (data ?? []) as any[]) {
      const isReply = e.direction === "inbound" || e.status === "replied";
      if (isReply && !want("reply")) continue;
      if (!isReply && !want("outreach")) continue;
      const channel =
        e.channel === "ig_dm" ? "Instagram DM" : e.channel === "email" ? "Email" : e.channel;
      items.push({
        id: `outreach:${e.id}`,
        at: e.occurred_at,
        kind: isReply ? "reply" : "outreach",
        campusId: e.campus_id ?? null,
        campusName: campusName(e.campus_id ?? null),
        text: isReply
          ? `${channel} reply received${e.reply_category ? ` — ${String(e.reply_category).replace(/_/g, " ")}` : ""}`
          : `${channel} ${e.status}${e.email ? ` to ${e.email}` : ""}`,
        who: e.approved_by ?? null,
        detail: e.subject ?? e.notes ?? null,
      });
    }
  }

  // ── topic-map approvals ─────────────────────────────────────────────────────────────
  if (want("map")) {
    let q = db
      .from("growth_map_approvals")
      .select("id,campus_id,professor_id,action,approved_by,created_at")
      .order("created_at", { ascending: false })
      .limit(opts.limit);
    if (opts.campusId) q = q.eq("campus_id", opts.campusId);
    const { data } = await q;
    for (const m of (data ?? []) as any[]) {
      const label =
        m.action === "approve_campus_map"
          ? "Campus topic map approved"
          : m.action === "approve_professor_map"
            ? "Professor topic map approved"
            : m.action === "keep_starter"
              ? "Reverted to the Global Starter Map"
              : String(m.action).replace(/_/g, " ");
      items.push({
        id: `map:${m.id}`,
        at: m.created_at,
        kind: "map",
        campusId: m.campus_id,
        campusName: campusName(m.campus_id),
        text: label,
        who: m.approved_by,
        detail: null,
      });
    }
  }

  // ── chapter claims ──────────────────────────────────────────────────────────────────
  if (want("claim")) {
    const { data: claims } = await db
      .from("greek_chapter_claims")
      .select("id,campus_greek_chapter_id,name,email,position,status,created_at")
      .order("created_at", { ascending: false })
      .limit(opts.limit);
    const rows = ((claims ?? []) as any[]).filter((c) => !isTestRow(c));
    if (rows.length) {
      const ids = [...new Set(rows.map((c) => c.campus_greek_chapter_id).filter(Boolean))];
      const chapterCampus = new Map<string, { campusId: string; org: string | null }>();
      if (ids.length) {
        const { data: chs } = await db
          .from("campus_greek_chapters")
          .select("id,campus_id,greek_org_id")
          .in("id", ids);
        const orgIds = [...new Set((chs ?? []).map((c: any) => c.greek_org_id).filter(Boolean))];
        const orgName = new Map<string, string>();
        if (orgIds.length) {
          const { data: orgs } = await db.from("greek_orgs").select("id,name").in("id", orgIds);
          for (const o of (orgs ?? []) as any[]) orgName.set(o.id, o.name);
        }
        for (const c of (chs ?? []) as any[]) {
          chapterCampus.set(c.id, {
            campusId: c.campus_id,
            org: orgName.get(c.greek_org_id) ?? null,
          });
        }
      }
      for (const c of rows) {
        const info = chapterCampus.get(c.campus_greek_chapter_id);
        if (opts.campusId && info?.campusId !== opts.campusId) continue;
        items.push({
          id: `claim:${c.id}`,
          at: c.created_at,
          kind: "claim",
          campusId: info?.campusId ?? null,
          campusName: campusName(info?.campusId ?? null),
          text: `${info?.org ?? "A chapter"} claim submitted (${c.status})`,
          who: c.email ?? c.name ?? null,
          detail: c.position ?? null,
        });
      }
    }
  }

  // ── chapter seat purchases ──────────────────────────────────────────────────────────
  if (want("seat")) {
    const { data: pools } = await db
      .from("chapter_seat_pools")
      .select("id,chapter_id,seats_total,amount_cents,status,created_at,is_test")
      .not("is_test", "is", true)
      .order("created_at", { ascending: false })
      .limit(opts.limit);
    const rows = (pools ?? []) as any[];
    if (rows.length) {
      const ids = [...new Set(rows.map((p) => p.chapter_id).filter(Boolean))];
      const chapterCampus = new Map<string, string>();
      if (ids.length) {
        const { data: chs } = await db
          .from("campus_greek_chapters")
          .select("id,campus_id")
          .in("id", ids);
        for (const c of (chs ?? []) as any[]) chapterCampus.set(c.id, c.campus_id);
      }
      for (const p of rows) {
        const cid = chapterCampus.get(p.chapter_id) ?? null;
        if (opts.campusId && cid !== opts.campusId) continue;
        items.push({
          id: `seat:${p.id}`,
          at: p.created_at,
          kind: "seat",
          campusId: cid,
          campusName: campusName(cid),
          text: `Chapter bought ${p.seats_total ?? 0} seats (${p.status})`,
          who: null,
          detail: p.amount_cents ? `$${(p.amount_cents / 100).toFixed(0)}` : null,
        });
      }
    }
  }

  // ── student syllabus submissions ────────────────────────────────────────────────────
  if (want("submission")) {
    let q = db
      .from("syllabus_submissions")
      .select("id,email,campus_id,campus_name,professor_name,status,created_at")
      .order("created_at", { ascending: false })
      .limit(opts.limit);
    if (opts.campusId) q = q.eq("campus_id", opts.campusId);
    const { data } = await q;
    for (const s of (data ?? []) as any[]) {
      if (isTestRow(s)) continue;
      items.push({
        id: `submission:${s.id}`,
        at: s.created_at,
        kind: "submission",
        campusId: s.campus_id ?? null,
        campusName: campusName(s.campus_id ?? null) ?? s.campus_name ?? null,
        text: `A student submitted a syllabus${s.professor_name ? ` for ${s.professor_name}` : ""}`,
        who: s.email ?? null,
        detail: s.status ?? null,
      });
    }
  }

  // ── chapter signups, DMs marked sent, outreach link clicks (Outreach V2, 2026-09-14) ────────
  // Lee: "I'm seeing a signup from KA and also from ATO at Ole Miss … I don't see anything in activity
  // about those signups?" Signups were never in this feed. They are now — real ones only (a blank row
  // or a "Hook Test" 555 number isn't a signup; outreach-v2.isRealSignup).
  if (want("signup") || want("dm") || want("click")) {
    const { isRealSignup } = await import("@/lib/outreach-v2");
    const { isTestEmail } = await import("@/lib/growth-testdata");
    const orgNameOfRoster = async (rosterIds: string[]) => {
      const out = new Map<string, { campusId: string; name: string }>();
      if (!rosterIds.length) return out;
      const { data: chs } = await db.from("campus_greek_chapters").select("id,campus_id,greek_org_id,nickname").in("id", rosterIds);
      const orgIds = [...new Set(((chs ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean))];
      const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name").in("id", orgIds) : { data: [] };
      const on = new Map(((orgs ?? []) as any[]).map((o) => [o.id, o.name]));
      for (const c of (chs ?? []) as any[]) out.set(c.id, { campusId: c.campus_id, name: on.get(c.greek_org_id) ?? c.nickname ?? "A chapter" });
      return out;
    };
    if (want("signup")) {
      const { data: members } = await db.from("greek_chapter_members").select("id,chapter_id,name,phone,user_id,joined_at,source").order("joined_at", { ascending: false }).limit(opts.limit);
      const real = ((members ?? []) as any[]).filter((m) => isRealSignup(m, isTestEmail));
      if (real.length) {
        const { data: shells } = await db.from("greek_chapters").select("id,campus_greek_chapter_id,campus_id,chapter_name").in("id", [...new Set(real.map((m) => m.chapter_id))]);
        const shellBy = new Map(((shells ?? []) as any[]).map((s) => [s.id, s]));
        const roster = await orgNameOfRoster([...new Set(((shells ?? []) as any[]).map((s) => s.campus_greek_chapter_id).filter(Boolean))]);
        for (const m of real) {
          const sh = shellBy.get(m.chapter_id);
          const r = sh?.campus_greek_chapter_id ? roster.get(sh.campus_greek_chapter_id) : null;
          const campusId = r?.campusId ?? sh?.campus_id ?? null;
          if (opts.campusId && campusId !== opts.campusId) continue;
          const email = String(m.phone ?? "").startsWith("email:") ? String(m.phone).slice(6) : null;
          items.push({ id: `signup:${m.id}`, at: m.joined_at, kind: "signup", campusId, campusName: campusName(campusId), text: `A member joined ${r?.name ?? sh?.chapter_name ?? "a chapter"}'s page`, who: m.name ?? email ?? null, detail: m.source ?? null });
        }
      }
    }
    if (want("dm") || want("click")) {
      const [{ data: dms }, { data: visits }] = await Promise.all([
        want("dm") ? db.from("growth_ig_dm").select("contact_qc_id,campus_id,sent_at,sent_by").not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(opts.limit) : { data: [] },
        want("click") ? db.from("contact_ref_visit").select("id,contact_id,campus_id,created_at,is_bot,path").eq("is_bot", false).not("contact_id", "is", null).order("created_at", { ascending: false }).limit(opts.limit) : { data: [] },
      ]);
      const contactIds = [...new Set([...((dms ?? []) as any[]).map((d) => d.contact_qc_id), ...((visits ?? []) as any[]).map((v) => v.contact_id)])];
      const contactBy = new Map<string, any>();
      for (let i = 0; i < contactIds.length; i += 200) {
        const { data: cs } = await db.from("growth_contact_qc").select("id,name,full_name,role,exec_title,org_name,entity_type,entity_id,council_type,council,instagram,org_ig,personal_ig").in("id", contactIds.slice(i, i + 200));
        for (const c of (cs ?? []) as any[]) contactBy.set(c.id, c);
      }
      const roster = await orgNameOfRoster([...new Set([...contactBy.values()].filter((c) => c.entity_type === "chapter" && c.entity_id).map((c) => c.entity_id))]);
      const COUNCIL: Record<string, string> = { ifc: "IFC", panhellenic: "Panhellenic", nphc: "NPHC", mgc: "MGC" };
      const whoOf = (c: any) => {
        const org = c.entity_type === "chapter" && c.entity_id ? roster.get(c.entity_id)?.name : c.org_name || COUNCIL[String(c.council_type ?? c.council ?? "").toLowerCase()] || null;
        const person = (c.name ?? c.full_name ?? "").trim();
        const handle = c.instagram || c.personal_ig || c.org_ig;
        return { org: org ?? "a contact", label: [person || (handle ? `@${String(handle).replace(/^@/, "")}` : ""), c.role ?? c.exec_title].filter(Boolean).join(", ") };
      };
      for (const d of (dms ?? []) as any[]) {
        const c = contactBy.get(d.contact_qc_id);
        if (!c) continue;
        if (opts.campusId && d.campus_id !== opts.campusId) continue;
        const w = whoOf(c);
        items.push({ id: `dm:${d.contact_qc_id}`, at: d.sent_at, kind: "dm", campusId: d.campus_id ?? null, campusName: campusName(d.campus_id ?? null), text: `DM sent to ${w.org}`, who: d.sent_by ?? null, detail: w.label || null });
      }
      for (const v of (visits ?? []) as any[]) {
        const c = contactBy.get(v.contact_id);
        if (!c) continue;
        if (opts.campusId && v.campus_id !== opts.campusId) continue;
        const w = whoOf(c);
        items.push({ id: `click:${v.id}`, at: v.created_at, kind: "click", campusId: v.campus_id ?? null, campusName: campusName(v.campus_id ?? null), text: `${w.org} opened their outreach link`, who: w.label || null, detail: v.path ?? null });
      }
    }
  }

  items.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return items.slice(0, opts.limit);
}

export const growthActivity = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid().nullable().optional(),
        kinds: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(500).default(150),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<{ items: ActivityItem[] }> => {
    const db = await adminDb();
    const items = await gather(db, {
      campusId: data.campusId ?? null,
      kinds: (data.kinds as ActivityKind[] | undefined) ?? undefined,
      limit: data.limit,
    });
    return { items };
  });

/** CSV of the same feed — the Activity tab's Export. */
export const growthActivityCsv = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid().nullable().optional(),
        kinds: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(5000).default(2000),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<{ csv: string; rows: number }> => {
    const db = await adminDb();
    const items = await gather(db, {
      campusId: data.campusId ?? null,
      kinds: (data.kinds as ActivityKind[] | undefined) ?? undefined,
      limit: data.limit,
    });
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      "when,type,campus,what,who,detail",
      ...items.map((i) =>
        [
          esc(i.at),
          esc(activityKindLabel(i.kind)),
          esc(i.campusName),
          esc(i.text),
          esc(i.who),
          esc(i.detail),
        ].join(","),
      ),
    ].join("\n");
    return { csv, rows: items.length };
  });
