// TRANCHES — a partner's 5 blocks of ~20 campuses that unlock on results.
//
// The unlock RULE is pure (growth-tranche-core.ts). This file is the data around it:
// what "launched" and "responded" mean per campus (computed in bulk), reading and
// reshuffling tranches, and the continuous evaluate-and-unlock that the dashboard and a
// cron both call. Unlock is idempotent — it only fires when the active tranche clears
// both bars and the next tranche is still locked.
//
// LAW: ships to the client bundle — service-role client + admin gate imported
// dynamically inside handlers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  evaluateTranche,
  type TrancheCampusState,
  type TrancheProgress,
} from "@/lib/growth-tranche-core";

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

export async function logPartnerActivity(
  db: DB,
  a: { partnerId: string | null; campusId?: string | null; kind: string; summary: string; meta?: any },
): Promise<void> {
  await db.from("partner_activity").insert({
    partner_id: a.partnerId,
    campus_id: a.campusId ?? null,
    kind: a.kind,
    summary: a.summary,
    meta: a.meta ?? {},
  });
}

// ── per-campus launch / response state, in bulk ─────────────────────────────────────
//
// launched = launch-checklist items 1-5 complete. Items 1-4 are content readiness
//   (course code, professor evidence, documents, textbook); item 5 (Exam 1 map) is
//   served by the global starter map for any campus with a known course, so it folds
//   into course_code (the map-resolution law).
// responded = a logged inbound reply from a council/chapter, OR a recruited campus rep
//   who has a tracked link (referral_partners.dashboard_token) and is active.
export async function campusLaunchResponse(
  db: DB,
  campusIds: string[],
): Promise<Map<string, { launched: boolean; responded: boolean }>> {
  const out = new Map<string, { launched: boolean; responded: boolean }>();
  if (!campusIds.length) return out;
  const [status, profEv, replies, reps] = await Promise.all([
    db
      .from("course_intel_campus_status")
      .select("campus_id,course_code,documents_found,textbook_docs_found")
      .in("campus_id", campusIds),
    db.from("professor_intro1_evidence").select("campus_id").in("campus_id", campusIds),
    db
      .from("growth_outreach_events")
      .select("campus_id,direction")
      .in("campus_id", campusIds)
      .eq("direction", "inbound"),
    db
      .from("referral_partners")
      .select("campus_id,status,dashboard_token")
      .in("campus_id", campusIds)
      .eq("status", "active"),
  ]);
  const statusOf = new Map<string, any>(
    ((status.data ?? []) as any[]).map((r) => [r.campus_id, r]),
  );
  const hasProf = new Set(((profEv.data ?? []) as any[]).map((r) => r.campus_id));
  const hasReply = new Set(((replies.data ?? []) as any[]).map((r) => r.campus_id));
  const hasRep = new Set(
    ((reps.data ?? []) as any[]).filter((r) => r.dashboard_token).map((r) => r.campus_id),
  );
  for (const id of campusIds) {
    const s = statusOf.get(id);
    const launched =
      !!s?.course_code &&
      (s?.documents_found ?? 0) > 0 &&
      (s?.textbook_docs_found ?? 0) > 0 &&
      hasProf.has(id);
    out.set(id, { launched, responded: hasReply.has(id) || hasRep.has(id) });
  }
  return out;
}

const progressFor = async (db: DB, campusIds: string[]): Promise<TrancheProgress> => {
  const states = await campusLaunchResponse(db, campusIds);
  const list: TrancheCampusState[] = campusIds.map((id) => ({
    campusId: id,
    launched: states.get(id)?.launched ?? false,
    responded: states.get(id)?.responded ?? false,
  }));
  return evaluateTranche(list);
};

export interface TrancheView {
  id: string;
  trancheNumber: number;
  status: "locked" | "active" | "complete";
  tierLabel: string | null;
  campusCount: number;
  unlockedAt: string | null;
  /** Only the ACTIVE tranche exposes live progress; locked tranches show count + tier only. */
  progress: TrancheProgress | null;
}

export interface ActivityItem {
  id: string;
  partnerId: string | null;
  partnerName: string | null;
  campusId: string | null;
  campusName: string | null;
  kind: string;
  summary: string;
  createdAt: string;
}

/** The partner activity feed — one chronological stream across all partners, filterable
 *  by partner. Lee's 30-seconds-a-day skim surface. */
export const growthPartnerActivity = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ partnerId: z.string().uuid().nullable().optional(), limit: z.number().max(200).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<{ items: ActivityItem[] }> => {
    const db = await adminDb();
    let q = db
      .from("partner_activity")
      .select("id,partner_id,campus_id,kind,summary,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.partnerId) q = q.eq("partner_id", data.partnerId);
    const { data: rows } = await q;
    const list = (rows ?? []) as any[];
    const partnerIds = [...new Set(list.map((r) => r.partner_id).filter(Boolean))];
    const campusIds = [...new Set(list.map((r) => r.campus_id).filter(Boolean))];
    const pNames = new Map<string, string>();
    const cNames = new Map<string, string>();
    await Promise.all([
      partnerIds.length
        ? db
            .from("referral_partners")
            .select("id,name")
            .in("id", partnerIds)
            .then(({ data }: any) => {
              for (const p of data ?? []) pNames.set(p.id, p.name);
            })
        : Promise.resolve(),
      campusIds.length
        ? db
            .from("campuses")
            .select("id,display_name,name")
            .in("id", campusIds)
            .then(({ data }: any) => {
              for (const c of data ?? []) cNames.set(c.id, c.display_name || c.name);
            })
        : Promise.resolve(),
    ]);
    return {
      items: list.map((r) => ({
        id: r.id,
        partnerId: r.partner_id ?? null,
        partnerName: r.partner_id ? (pNames.get(r.partner_id) ?? null) : null,
        campusId: r.campus_id ?? null,
        campusName: r.campus_id ? (cNames.get(r.campus_id) ?? null) : null,
        kind: r.kind,
        summary: r.summary,
        createdAt: r.created_at,
      })),
    };
  });

// FOUNDER bucket — Ole Miss + the Florida cluster + LSU. Lee's; excluded from partner tranches.
const FOUNDER_NAMES = [
  "University of Mississippi",
  "University of Florida",
  "Florida International University",
  "Florida Atlantic University",
  "Florida Gulf Coast University",
  "University of Central Florida",
  "University of South Florida",
  "Louisiana State University",
];

async function eligibleForTranches(db: DB): Promise<{
  eligible: import("@/lib/growth-tranche-assign-core").AssignCampus[];
  founder: { campusId: string; name: string; seats: number | null }[];
}> {
  const [{ data: campuses }, { data: market }, { data: codes }, elig] = await Promise.all([
    db
      .from("campuses")
      .select("id,name,display_name,campus_status,greek_status,greek_status_override,course_family_codes_json")
      .in("campus_status", ["ready", "live"])
      .is("merged_into_id", null)
      .limit(5000),
    db.from("campus_market_intelligence").select("campus_id,estimated_intro1_annual").limit(5000),
    db.from("course_intel_campus_status").select("campus_id,course_code").limit(5000),
    (async () => {
      const out: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await db
          .from("growth_outreach_eligibility")
          .select("campus_id,council_type,email,instagram")
          .range(from, from + 999);
        out.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return out;
    })(),
  ]);
  const seatsOf = new Map<string, number>(
    ((market ?? []) as any[]).filter((m) => m.estimated_intro1_annual != null).map((m) => [m.campus_id, m.estimated_intro1_annual]),
  );
  const codeOf = new Map<string, string>(((codes ?? []) as any[]).filter((c) => c.course_code).map((c) => [c.campus_id, c.course_code]));
  const agg = new Map<string, { council: boolean; email: boolean; ig: boolean; n: number }>();
  for (const e of elig as any[]) {
    if (!e.campus_id) continue;
    const a = agg.get(e.campus_id) ?? { council: false, email: false, ig: false, n: 0 };
    a.n++;
    if (e.council_type) a.council = true;
    if (e.email) a.email = true;
    if (e.instagram) a.ig = true;
    agg.set(e.campus_id, a);
  }
  const founderSet = new Set(FOUNDER_NAMES.map((n) => n.toLowerCase()));
  // Founder campuses are the carve-out regardless of status — fetch them independently so
  // Ole Miss (which may be backlog, not ready) still appears and is never draftable.
  const { data: founderRows } = await db
    .from("campuses")
    .select("id,name,display_name")
    .is("merged_into_id", null)
    .limit(5000);
  const founder = ((founderRows ?? []) as any[])
    .filter((c) => founderSet.has(String(c.display_name || c.name).toLowerCase()))
    .map((c) => ({ campusId: c.id, name: c.display_name || c.name, seats: seatsOf.get(c.id) ?? null }));

  const eligible: import("@/lib/growth-tranche-assign-core").AssignCampus[] = [];
  for (const c of (campuses ?? []) as any[]) {
    const name = c.display_name || c.name;
    const seats = seatsOf.get(c.id) ?? null;
    if (founderSet.has(String(name).toLowerCase())) continue; // never draft a founder campus
    const a = agg.get(c.id) ?? { council: false, email: false, ig: false, n: 0 };
    const hasCourse = !!(codeOf.get(c.id) ?? c.course_family_codes_json?.intro_1);
    const readiness = 25 * (Number(hasCourse) + Number(a.council) + Number(a.email) + Number(a.ig));
    eligible.push({
      campusId: c.id,
      name,
      seats,
      greekStatus: (c.greek_status_override ?? c.greek_status ?? "unknown") as any,
      readiness,
      contacts: a.n,
    });
  }
  return { eligible, founder };
}

// ── King's working board: his tranches, campuses, est students, contact progress ─────
export interface BoardCampus {
  campusId: string;
  name: string;
  state: string | null;
  seats: number | null; // estimated students / yr
  campusStatus: string | null;
  councilContacts: number;
  greekContacts: number;
  clubContacts: number;
}
export interface BoardTranche {
  label: string;
  number: number;
  status: string;
  totalSeats: number;
  campuses: BoardCampus[];
}

// Owner-filtered board. King works his numbered pool; Lee owns the Founder carve-out;
// EJ is a placeholder until he's added as a user (no tranches yet).
export type BoardOwner = "lee" | "king" | "ej";

export const growthBoard = createServerFn({ method: "GET" })
  .inputValidator((d: { owner: BoardOwner }) => d)
  .handler(
    async ({ data }): Promise<{ tranches: BoardTranche[]; totalSeats: number; owner: BoardOwner; ready: boolean }> => {
      const owner = data.owner;
      // EJ isn't a user yet — show an empty, explained board.
      if (owner === "ej") return { tranches: [], totalSeats: 0, owner, ready: false };

      const db = await adminDb();
      let query = db
        .from("partner_tranches")
        .select("tranche_number,label,status,campus_ids")
        .order("tranche_number", { ascending: true });
      if (owner === "king") {
        const { KING_EMAIL } = await import("@/lib/growth-comp.functions");
        const { data: king } = await db.from("referral_partners").select("id").ilike("email", KING_EMAIL).maybeSingle();
        query = query.eq("pool", "king").eq("partner_id", king?.id ?? "00000000-0000-0000-0000-000000000000");
      } else {
        // Lee = the Founder pool (Ole Miss + Florida cluster + LSU).
        query = query.eq("pool", "founder");
      }
      const { data: rows } = await query;
      const { tranches, totalSeats } = await hydrateTranches(db, (rows ?? []) as any[]);
      return { tranches, totalSeats, owner, ready: true };
    },
  );

// Turn partner_tranches rows into hydrated board tranches (names, est seats, contact progress).
async function hydrateTranches(db: DB, rows: any[]): Promise<{ tranches: BoardTranche[]; totalSeats: number }> {
    const allIds = [...new Set(((rows ?? []) as any[]).flatMap((t) => t.campus_ids ?? []))];
    const [names, market, elig] = await Promise.all([
      allIds.length ? db.from("campuses").select("id,name,display_name,state,campus_status").in("id", allIds) : Promise.resolve({ data: [] }),
      allIds.length ? db.from("campus_market_intelligence").select("campus_id,estimated_intro1_annual").in("campus_id", allIds) : Promise.resolve({ data: [] }),
      allIds.length ? db.from("growth_contact_qc").select("campus_id,entity_type").in("campus_id", allIds) : Promise.resolve({ data: [] }),
    ]);
    const nameOf = new Map<string, any>(((names as any).data ?? []).map((c: any) => [c.id, c]));
    const seatsOf = new Map<string, number>(((market as any).data ?? []).filter((m: any) => m.estimated_intro1_annual != null).map((m: any) => [m.campus_id, m.estimated_intro1_annual]));
    const cc = new Map<string, { council: number; greek: number; club: number }>();
    for (const e of ((elig as any).data ?? []) as any[]) {
      const a = cc.get(e.campus_id) ?? { council: 0, greek: 0, club: 0 };
      if (e.entity_type === "council") a.council++;
      else if (e.entity_type === "chapter") a.greek++;
      else if (e.entity_type === "club") a.club++;
      cc.set(e.campus_id, a);
    }
    let totalSeats = 0;
    const tranches: BoardTranche[] = ((rows ?? []) as any[]).map((t) => {
      const campuses: BoardCampus[] = (t.campus_ids ?? []).map((id: string) => {
        const c = nameOf.get(id) ?? {};
        const a = cc.get(id) ?? { council: 0, greek: 0, club: 0 };
        return {
          campusId: id,
          name: c.display_name || c.name || id.slice(0, 8),
          state: c.state ?? null,
          seats: seatsOf.get(id) ?? null,
          campusStatus: c.campus_status ?? null,
          councilContacts: a.council,
          greekContacts: a.greek,
          clubContacts: a.club,
        };
      });
      const tSeats = campuses.reduce((n, c) => n + (c.seats ?? 0), 0);
      totalSeats += tSeats;
      return { label: t.label || `T${t.tranche_number}`, number: t.tranche_number, status: t.status, totalSeats: tSeats, campuses };
    });
    return { tranches, totalSeats };
}

// ── Add-contacts modal: what slots exist for a campus, and a bulk save ────────────────
export interface ContactSlots {
  councils: { type: string; label: string; has: number }[];
  chapters: { id: string; name: string; size: number | null; has: number }[];
  clubs: { id: string; name: string; category: string | null }[];
}

export const growthCampusContactSlots = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ContactSlots> => {
    const db = await adminDb();
    const [{ data: chapters }, { data: clubs }, { data: contacts }] = await Promise.all([
      db.from("campus_greek_chapters").select("id,council,greek_org_id,chapter_size").eq("campus_id", data.campusId).is("archived_at", null),
      db.from("growth_business_clubs").select("id,name,category").eq("campus_id", data.campusId),
      db.from("growth_contact_qc").select("entity_type,entity_id,council_type").eq("campus_id", data.campusId),
    ]);
    const orgIds = [...new Set(((chapters ?? []) as any[]).map((c) => c.greek_org_id).filter(Boolean))];
    const orgNames = new Map<string, string>();
    if (orgIds.length) {
      const { data: orgs } = await db.from("greek_orgs").select("id,name").in("id", orgIds);
      for (const o of orgs ?? []) orgNames.set(o.id, o.name);
    }
    const councilHas = new Map<string, number>();
    const chapHas = new Map<string, number>();
    for (const c of ((contacts ?? []) as any[])) {
      if (c.entity_type === "council" && c.council_type) councilHas.set(c.council_type, (councilHas.get(c.council_type) ?? 0) + 1);
      if (c.entity_type === "chapter" && c.entity_id) chapHas.set(c.entity_id, (chapHas.get(c.entity_id) ?? 0) + 1);
    }
    const COUNCILS = [
      { type: "ifc", label: "IFC" },
      { type: "panhellenic", label: "Panhellenic" },
      { type: "nphc", label: "NPHC" },
      { type: "mgc", label: "MGC" },
    ];
    return {
      councils: COUNCILS.map((c) => ({ ...c, has: councilHas.get(c.type) ?? 0 })),
      chapters: ((chapters ?? []) as any[])
        .map((c) => ({ id: c.id, name: orgNames.get(c.greek_org_id) ?? "Chapter", size: c.chapter_size ?? null, has: chapHas.get(c.id) ?? 0 }))
        .sort((a, b) => (b.size ?? -1) - (a.size ?? -1)),
      clubs: ((clubs ?? []) as any[]).map((c) => ({ id: c.id, name: c.name, category: c.category ?? null })),
    };
  });

const ContactInput = z.object({
  kind: z.enum(["council", "chapter", "club"]),
  entityId: z.string().uuid().nullable().optional(),
  councilType: z.string().max(40).nullable().optional(),
  newClubName: z.string().trim().max(160).nullable().optional(),
  newClubCategory: z.string().max(60).nullable().optional(),
  isPerson: z.boolean(),
  name: z.string().trim().max(160).nullable().optional(),
  role: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  instagram: z.string().trim().max(300).nullable().optional(),
});

/** Bulk-save a campus's contacts from the Add-contacts modal. Creates clubs on the fly.
 *  contact_type marks org vs person. Returns how many landed. */
export const growthSaveCampusContacts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ campusId: z.string().uuid(), contacts: z.array(ContactInput).max(200) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ saved: number; errors: string[] }> => {
    const { growthAddContact } = await import("@/lib/growth-reach.functions");
    const db = await adminDb();
    let saved = 0;
    const errors: string[] = [];
    const clubCache = new Map<string, string>();
    for (const c of data.contacts) {
      if (!c.email && !c.instagram) continue; // nothing to save
      let entityId = c.entityId ?? null;
      // create a club on the fly
      if (c.kind === "club" && !entityId && c.newClubName) {
        const key = c.newClubName.toLowerCase();
        entityId = clubCache.get(key) ?? null;
        if (!entityId) {
          const { data: club } = await db
            .from("growth_business_clubs")
            .insert({ campus_id: data.campusId, name: c.newClubName, category: c.newClubCategory || "women_in_business" })
            .select("id")
            .maybeSingle();
          entityId = club?.id ?? null;
          if (entityId) clubCache.set(key, entityId);
        }
      }
      const r = await growthAddContact({
        data: {
          campusId: data.campusId,
          entityType: c.kind,
          entityId,
          councilType: c.kind === "council" ? c.councilType ?? null : null,
          contactType: c.isPerson ? "student_officer" : "organization_general",
          name: c.isPerson ? c.name ?? null : null,
          role: c.isPerson ? c.role ?? null : null,
          email: c.email ?? null,
          instagram: c.instagram ?? null,
        },
      });
      if (r.ok) saved++;
      else if (r.error) errors.push(r.error);
    }
    return { saved, errors };
  });

export interface GreekUnknown {
  campusId: string;
  name: string;
  state: string | null;
  courseCode: string | null;
  seats: number | null;
  campusStatus: string | null;
}

/** Campuses whose Greek presence is still 'unknown', biggest markets first — the one-time
 *  manual classification pass. Top ~30 covers tranches 1-2; the tail rides the 0.7 default. */
export const growthGreekUnknowns = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().max(150).optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ items: GreekUnknown[] }> => {
    const db = await adminDb();
    const { data: rows } = await db
      .from("campuses")
      .select(
        "id,name,display_name,state,campus_status,greek_status,greek_status_override,course_family_codes_json,merged_into_id",
      )
      .is("merged_into_id", null)
      .limit(4000);
    const unknownIds = new Set(
      ((rows ?? []) as any[])
        .filter(
          (c) =>
            (c.greek_status_override ?? c.greek_status ?? "unknown") === "unknown" &&
            c.campus_status !== "excluded",
        )
        .map((c) => c.id),
    );
    // Fetch the small market/course tables whole and map — an .in() with hundreds of UUIDs
    // overflows the request URL and silently returns nothing.
    const [{ data: market }, { data: codes }] = await Promise.all([
      db.from("campus_market_intelligence").select("campus_id,estimated_intro1_annual").limit(5000),
      db.from("course_intel_campus_status").select("campus_id,course_code").limit(5000),
    ]);
    const seatsOf = new Map<string, number>(
      ((market ?? []) as any[]).filter((m) => m.estimated_intro1_annual != null).map((m) => [m.campus_id, m.estimated_intro1_annual]),
    );
    const codeOf = new Map<string, string>(
      ((codes ?? []) as any[]).filter((c) => c.course_code).map((c) => [c.campus_id, c.course_code]),
    );
    const items: GreekUnknown[] = ((rows ?? []) as any[])
      .filter((c) => unknownIds.has(c.id) && seatsOf.has(c.id))
      .map((c) => ({
        campusId: c.id,
        name: c.display_name || c.name,
        state: c.state ?? null,
        courseCode: codeOf.get(c.id) ?? (c.course_family_codes_json?.intro_1 ?? null),
        seats: seatsOf.get(c.id) ?? null,
        campusStatus: c.campus_status ?? null,
      }))
      .sort((a, b) => (b.seats ?? 0) - (a.seats ?? 0))
      .slice(0, data.limit ?? 40);
    return { items };
  });

/** Set a campus's Greek presence (manual classification → greek_status_override). */
export const growthSetGreekStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ campusId: z.string().uuid(), status: z.enum(["strong", "present", "none", "unknown"]) })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await adminDb();
    const { error } = await db
      .from("campuses")
      .update({ greek_status_override: data.status === "unknown" ? null : data.status })
      .eq("id", data.campusId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface PartnerLite {
  id: string;
  name: string;
  email: string | null;
  type: string;
}

/** Growth partners Lee can manage tranches for (non-test). */
export const growthPartners = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ partners: PartnerLite[]; kingPartnerId: string | null }> => {
    const db = await adminDb();
    const { KING_EMAIL } = await import("@/lib/growth-comp.functions");
    const { data } = await db
      .from("referral_partners")
      .select("id,name,email,type,is_test")
      .not("is_test", "is", true)
      .order("name", { ascending: true });
    const partners: PartnerLite[] = ((data ?? []) as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email ?? null,
      type: p.type ?? "partner",
    }));
    const king = partners.find((p) => (p.email ?? "").toLowerCase() === KING_EMAIL.toLowerCase());
    return { partners, kingPartnerId: king?.id ?? null };
  },
);

/** Create the 5 tranche rows for a partner if they don't exist yet (1 active, 2-5 locked). */
export const growthEnsurePartnerTranches = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ created: number }> => {
    const db = await adminDb();
    const { data: existing } = await db
      .from("partner_tranches")
      .select("id,tranche_number")
      .eq("partner_id", data.partnerId);
    const have = new Set(((existing ?? []) as any[]).map((t) => t.tranche_number));
    const rows = [];
    for (let n = 1; n <= 5; n++) {
      if (have.has(n)) continue;
      rows.push({
        partner_id: data.partnerId,
        tranche_number: n,
        status: n === 1 ? "active" : "locked",
        campus_ids: [],
      });
    }
    if (rows.length) {
      const { error } = await db.from("partner_tranches").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { created: rows.length };
  });

/** The partner's 5 tranches + the active tranche's live progress. Locked tranches never
 *  expose their campus names — only a count and tier label. */
export const growthPartnerTranches = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid() }).parse(d))
  .handler(
    async ({
      data,
    }): Promise<{ tranches: TrancheView[]; activeProgress: TrancheProgress | null }> => {
      const db = await adminDb();
      const { data: rows } = await db
        .from("partner_tranches")
        .select("id,tranche_number,status,tier_label,campus_ids,unlocked_at")
        .eq("partner_id", data.partnerId)
        .order("tranche_number", { ascending: true });
      const tranches: TrancheView[] = [];
      let activeProgress: TrancheProgress | null = null;
      for (const t of (rows ?? []) as any[]) {
        const campusIds: string[] = t.campus_ids ?? [];
        let progress: TrancheProgress | null = null;
        if (t.status === "active") {
          progress = await progressFor(db, campusIds);
          activeProgress = progress;
        }
        tranches.push({
          id: t.id,
          trancheNumber: t.tranche_number,
          status: t.status,
          tierLabel: t.tier_label ?? null,
          campusCount: campusIds.length,
          unlockedAt: t.unlocked_at ?? null,
          progress,
        });
      }
      return { tranches, activeProgress };
    },
  );

/** Assign / reshuffle a LOCKED tranche's campuses + tier label. Active/complete tranches
 *  are fixed and rejected. */
export const growthAssignTranche = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        trancheId: z.string().uuid(),
        campusIds: z.array(z.string().uuid()).max(200),
        tierLabel: z.string().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await adminDb();
    const { data: t } = await db
      .from("partner_tranches")
      .select("id,status")
      .eq("id", data.trancheId)
      .maybeSingle();
    if (!t) throw new Error("Tranche not found");
    if (t.status !== "locked")
      throw new Error("This tranche is already unlocked — its campuses are fixed.");
    const patch: any = { campus_ids: data.campusIds, updated_at: new Date().toISOString() };
    if (data.tierLabel !== undefined) patch.tier_label = data.tierLabel;
    const { error } = await db.from("partner_tranches").update(patch).eq("id", data.trancheId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** One-click setup: fill any EMPTY tranches with the top launch-list campuses in priority
 *  order, 20 per tranche. Never clobbers a tranche that already has campuses. */
export const growthAutoAssignTranches = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ assigned: number }> => {
    const db = await adminDb();
    // top 100 ranked campuses, minus parked ones
    const [{ data: pri }, { data: pins }] = await Promise.all([
      db
        .from("growth_campus_priority")
        .select("campus_id,rank")
        .order("rank", { ascending: true })
        .limit(400),
      db.from("growth_campus_pins").select("campus_id,parked"),
    ]);
    const parked = new Set(
      ((pins ?? []) as any[]).filter((p) => p.parked).map((p) => p.campus_id),
    );
    const ranked = ((pri ?? []) as any[])
      .map((r) => r.campus_id)
      .filter((id) => !parked.has(id))
      .slice(0, 100);
    const { data: rows } = await db
      .from("partner_tranches")
      .select("id,tranche_number,campus_ids")
      .eq("partner_id", data.partnerId)
      .order("tranche_number", { ascending: true });
    let assigned = 0;
    for (const t of (rows ?? []) as any[]) {
      if ((t.campus_ids?.length ?? 0) > 0) continue; // never clobber
      const slice = ranked.slice((t.tranche_number - 1) * 20, t.tranche_number * 20);
      if (!slice.length) continue;
      await db
        .from("partner_tranches")
        .update({ campus_ids: slice, updated_at: new Date().toISOString() })
        .eq("id", t.id);
      assigned += slice.length;
    }
    return { assigned };
  });

/** Propose the full semester split (does NOT write). Founder carve-out, King T1–5,
 *  Unassigned A–E, flagship-first, snake-drafted, balanced pairs. A human approves it. */
export const growthPreBuildProposal = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDb();
  const { assignSemester } = await import("@/lib/growth-tranche-assign-core");
  const { eligible, founder } = await eligibleForTranches(db);
  const result = assignSemester(eligible);
  return { ...result, founder, eligibleCount: eligible.length };
});

/** Commit the proposal: (re)write King's 5 + Unassigned A–E + Founder into partner_tranches,
 *  and promote the two flagship tranches (T1 + A) to campus_status='live' so the picker has
 *  content. Deterministic recompute — approving commits the current split. */
export const growthCommitPreBuild = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: boolean; king: number; unassigned: number; founder: number; promoted: number }> => {
    const db = await adminDb();
    const { assignSemester } = await import("@/lib/growth-tranche-assign-core");
    const { eligible, founder } = await eligibleForTranches(db);
    const result = assignSemester(eligible);

    const { KING_EMAIL } = await import("@/lib/growth-comp.functions");
    const { data: king } = await db
      .from("referral_partners")
      .select("id")
      .ilike("email", KING_EMAIL)
      .maybeSingle();
    const kingId = king?.id ?? null;

    // Rebuild the pre-build pools (idempotent).
    await db.from("partner_tranches").delete().in("pool", ["king", "unassigned", "founder"]);
    const now = new Date().toISOString();
    const rows: any[] = [];
    result.king.forEach((t) =>
      rows.push({
        partner_id: kingId,
        pool: "king",
        tranche_number: t.number,
        label: t.label,
        status: t.number === 1 ? "active" : "locked",
        campus_ids: t.campuses.map((c) => c.campusId),
        tier_label: t.number === 1 ? "Flagship" : null,
        unlocked_at: t.number === 1 ? now : null,
      }),
    );
    result.unassigned.forEach((t) =>
      rows.push({
        partner_id: null,
        pool: "unassigned",
        tranche_number: t.number,
        label: t.label,
        status: "locked",
        campus_ids: t.campuses.map((c) => c.campusId),
        tier_label: t.number === 1 ? "Flagship" : null,
      }),
    );
    rows.push({
      partner_id: null,
      pool: "founder",
      tranche_number: 1,
      label: "Founder",
      status: "active",
      campus_ids: founder.map((f) => f.campusId),
      tier_label: "Founder — Lee",
      unlocked_at: now,
    });
    const { error } = await db.from("partner_tranches").insert(rows);
    if (error) throw new Error(error.message);

    // Promote the flagship tranches to live so the student picker has content.
    const flagshipIds = [...result.king[0].campuses, ...result.unassigned[0].campuses].map((c) => c.campusId);
    let promoted = 0;
    if (flagshipIds.length) {
      const { error: pErr } = await db
        .from("campuses")
        .update({ campus_status_override: "live", campus_status: "live" })
        .in("id", flagshipIds);
      if (!pErr) promoted = flagshipIds.length;
    }
    await logPartnerActivity(db, {
      partnerId: kingId,
      kind: "tranche_unlocked",
      summary: `Semester pre-built — King T1 active + 4 locked, Unassigned A–E, Founder (${founder.length}); ${promoted} flagships promoted live`,
      meta: { king: result.king.length, unassigned: result.unassigned.length, founder: founder.length, promoted },
    });
    return { ok: true, king: result.king.length, unassigned: result.unassigned.length, founder: founder.length, promoted };
  },
);

/** Continuous evaluate-and-unlock. Idempotent: unlocks the next tranche only when the
 *  active one clears BOTH bars (15 launched AND 5 responded). Called on dashboard load
 *  and by the tranche cron. */
export const growthEvaluateAndUnlock = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid() }).parse(d))
  .handler(
    async ({
      data,
    }): Promise<{
      unlocked: boolean;
      trancheNumber: number | null;
      progress: TrancheProgress | null;
    }> => {
      const db = await adminDb();
      const who = await whoNow();
      const { data: rows } = await db
        .from("partner_tranches")
        .select("id,tranche_number,status,campus_ids")
        .eq("partner_id", data.partnerId)
        .order("tranche_number", { ascending: true });
      const list = (rows ?? []) as any[];
      const active = list.find((t) => t.status === "active");
      if (!active) return { unlocked: false, trancheNumber: null, progress: null };

      const progress = await progressFor(db, active.campus_ids ?? []);
      if (!progress.unlocked) return { unlocked: false, trancheNumber: null, progress };

      const next = list.find(
        (t) => t.tranche_number === active.tranche_number + 1 && t.status === "locked",
      );
      if (!next) return { unlocked: false, trancheNumber: null, progress }; // already maxed out

      const now = new Date().toISOString();
      await db
        .from("partner_tranches")
        .update({ status: "complete", updated_at: now })
        .eq("id", active.id);
      await db
        .from("partner_tranches")
        .update({ status: "active", unlocked_at: now, updated_at: now })
        .eq("id", next.id);
      await logPartnerActivity(db, {
        partnerId: data.partnerId,
        kind: "tranche_unlocked",
        summary: `Tranche ${next.tranche_number} unlocked — ${next.campus_ids?.length ?? 0} new campuses (cleared ${progress.launched} launched · ${progress.responded} with response)`,
        meta: { trancheNumber: next.tranche_number, by: who, progress },
      });
      return { unlocked: true, trancheNumber: next.tranche_number, progress };
    },
  );
