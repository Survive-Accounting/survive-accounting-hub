// Server functions + shared pricing/delivery helpers for the made-to-order exam
// prep flow (/order). Inserts go through the SERVICE-ROLE client (supabaseAdmin)
// because orders/order_chapters are deny-by-default RLS — anon writes would
// silently fail. New tables are reached via `as never`/`as any` casts (no typegen).
//
// ── DEPRECATED 2026-08-30: THE MADE-TO-ORDER FLOW IS CLOSED ──────────────────────────────────
// We do not run real-time make-to-order any more. `/order` has redirected to the homepage since
// 2026-08-20, but that redirect only closed the UI — `submitOrder` is a server function, i.e. a
// live HTTP endpoint anything could still POST to, and it kept writing `orders` rows. It now
// REFUSES before touching the database (see the handler).
//
// What stays: the READ surfaces. `orders` holds one real row (2026-07-10) plus the admin console,
// weekly digest, entitlements and growth rollups that read it — closing the intake must not
// orphan history, so nothing here deletes data and no read path changed.
//
// NOT the same thing as `/start` (syllabus-first tutoring request) — separate flow, untouched.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isIntro1Qualified } from "./course-intel-shared";

export type FamilyKey = "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2";
export const FAMILY_KEYS: FamilyKey[] = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"];

// ------------------------------------------------------------------
// Pricing + delivery — tunable constants, shared by the client (live
// display) and the server (source-of-truth snapshot at submit).
// ------------------------------------------------------------------
export const CHAPTER_PRICES_CENTS = { one: 3000, two: 6000, three: 7500, fourPlus: 10000 } as const;
export const STANDARD_DAYS_PER_CHAPTER = 2;
export const RUSH_FEE_CENTS = 4900;
export const THIS_WEEK_DAYS = 5;   // bucket approximation for the rush comparison
export const NEXT_WEEK_DAYS = 12;  // bucket approximation for the rush comparison

export type ExamTimeframe = "this_week" | "next_week" | "not_sure";

/** 1=$30 · 2=$60 · 3=$75 · 4+=$100 flat (cents). */
export function subtotalCentsForChapters(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return CHAPTER_PRICES_CENTS.one;
  if (n === 2) return CHAPTER_PRICES_CENTS.two;
  if (n === 3) return CHAPTER_PRICES_CENTS.three;
  return CHAPTER_PRICES_CENTS.fourPlus;
}

export function standardDays(chapterCount: number): number {
  return STANDARD_DAYS_PER_CHAPTER * Math.max(0, chapterCount);
}

/** Days from today until the exam: exact date, or a bucket approximation.
 *  null = "not sure" / unknown ⇒ no rush pressure. */
export function daysUntilExam(examDate: string | null, timeframe: ExamTimeframe | null): number | null {
  if (examDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ex = new Date(`${examDate}T00:00:00`);
    return Math.round((ex.getTime() - today.getTime()) / 86_400_000);
  }
  if (timeframe === "this_week") return THIS_WEEK_DAYS;
  if (timeframe === "next_week") return NEXT_WEEK_DAYS;
  return null;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base); d.setDate(d.getDate() + days); return d;
}
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type OrderPricing = {
  chapterCount: number;
  subtotalCents: number;
  standardDays: number;
  deliveryTargetDate: string;        // ISO date (yyyy-mm-dd), standard delivery
  rushAvailable: boolean;            // standard delivery lands AFTER the exam
  rush: boolean;
  rushFeeCents: number;
  totalCents: number;
  makesItStandard: boolean | null;   // null when exam timing is unknown (not_sure)
};

/** Single source of truth for the made-to-order math. Rush is only ever charged
 *  when standard delivery would land after the exam (rushAvailable). */
export function computeOrderPricing(opts: {
  chapterCount: number;
  examDate: string | null;
  timeframe: ExamTimeframe | null;
  rush: boolean;
}): OrderPricing {
  const n = Math.max(0, opts.chapterCount);
  const subtotal = subtotalCentsForChapters(n);
  const sDays = standardDays(n);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const stdTarget = addDays(today, sDays);

  const until = daysUntilExam(opts.examDate, opts.timeframe);
  let makesIt: boolean | null = null;
  let rushAvailable = false;
  if (until != null) {
    makesIt = sDays <= until;       // standard arrives on/before the exam
    rushAvailable = !makesIt;       // only then is rush a real upgrade
  }
  const rush = rushAvailable && opts.rush;
  const rushFee = rush ? RUSH_FEE_CENTS : 0;
  return {
    chapterCount: n,
    subtotalCents: subtotal,
    standardDays: sDays,
    deliveryTargetDate: toISODate(stdTarget),
    rushAvailable,
    rush,
    rushFeeCents: rushFee,
    totalCents: subtotal + rushFee,
    makesItStandard: makesIt,
  };
}

// ------------------------------------------------------------------
// Campus context — codes + titles + known textbook per course family.
// (Reuses the getCampusCourseCodes query shape, extended with titles +
// textbooks so the wizard needs a single round-trip.)
// ------------------------------------------------------------------
export type KnownTextbook =
  | { title: string | null; authors: string | null; publisher: string | null; isbn13: string | null }
  | null;
export type OrderCampusContext = {
  codes: Record<FamilyKey, string | null>;
  titles: Record<FamilyKey, string | null>;
  textbooks: Record<FamilyKey, KnownTextbook>;
};

export const getOrderCampusContext = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<OrderCampusContext> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("campuses")
      .select("course_family_codes_json,course_family_titles_json,course_family_textbooks_json")
      .eq("id", data.campusId)
      .maybeSingle();
    const codesJson = (row?.course_family_codes_json ?? {}) as Record<string, string | null>;
    const titlesJson = (row?.course_family_titles_json ?? {}) as Record<string, string | null>;
    const tbJson = (row?.course_family_textbooks_json ?? {}) as Record<string, Record<string, unknown>>;
    const codes = {} as Record<FamilyKey, string | null>;
    const titles = {} as Record<FamilyKey, string | null>;
    const textbooks = {} as Record<FamilyKey, KnownTextbook>;
    for (const f of FAMILY_KEYS) {
      codes[f] = codesJson[f] ?? null;
      titles[f] = titlesJson[f] ?? null;
      const tb = tbJson[f];
      textbooks[f] = tb && typeof tb === "object"
        ? {
            title: (tb.title as string) ?? null,
            authors: (tb.authors as string) ?? null,
            publisher: (tb.publisher as string) ?? null,
            isbn13: (tb.isbn13 as string) ?? null,
          }
        : null;
    }
    return { codes, titles, textbooks };
  });

// ------------------------------------------------------------------
// Professor autocomplete — campus faculty, deduped, sorted by last name A→Z.
// Always optional: the wizard allows free text regardless of matches.
// `name` is natural order ("First Last", stored on the order); `first`/`last`
// let the picker render "Last, First".
// ------------------------------------------------------------------
export type ProfessorLite = { id: string; name: string; first: string; last: string };

export const searchOrderProfessors = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ campusId: z.string().uuid(), q: z.string().trim().max(80).optional() }).parse(d))
  .handler(async ({ data }): Promise<ProfessorLite[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Active-roster AND RateMyProfessors-matched only: show professors we've
    // verified against RMP (rmp_profile_url IS NOT NULL) so the picker stays
    // high-confidence. If a student's professor isn't matched, they use the
    // "My professor isn't listed" free-text path. A campus reaches this step
    // from the picker only if it's on the active roster; free-text schools have
    // no campusId, so the picker is empty. (post-typegen columns → cast.)
    // Show a professor when they're RMP-matched AND either manually rostered
    // (active_roster) OR qualified as an Intro-1 teacher — i.e. they have >=1 RMP
    // rating tagged with the campus's INTRO-1 course code (rmp_target_course_
    // counts_json.intro_1 >= 1). This keeps the picker to professors who actually
    // teach the intro course (not intermediate/other). Filtered in JS because the
    // qualification reads a per-family JSON count.
    const { data: rows } = await (supabaseAdmin.from("campus_lead_suggestions") as any)
      .select("id,first_name,last_name,email,active_roster,rmp_target_course_counts_json")
      .eq("campus_id", data.campusId)
      .not("rmp_profile_url", "is", null)
      .is("archived_at", null)
      .order("last_name", { ascending: true })
      .limit(500);

    const seen = new Set<string>();
    const out: ProfessorLite[] = [];
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      // Intro-1 gate: manually rostered OR RMP-qualified intro-1 teacher.
      if (!r.active_roster && !isIntro1Qualified(r as { rmp_target_course_counts_json?: unknown })) continue;
      const email = ((r.email as string) ?? "").toLowerCase().trim();
      const last = ((r.last_name as string) ?? "").trim();
      const first = ((r.first_name as string) ?? "").trim();
      const key = `${last.toLowerCase()}|${first.toLowerCase()}|${email}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = [first, last].filter(Boolean).join(" ").trim();
      if (!name) continue;
      out.push({ id: r.id as string, name, first, last });
    }
    const q = (data.q ?? "").trim().toLowerCase();
    const filtered = q ? out.filter((p) => p.name.toLowerCase().includes(q)) : out;
    return filtered.slice(0, 60);
  });

// ------------------------------------------------------------------
// Campus search for the STUDENT /order picker — active-roster campuses only.
// (Separate from onboarding.searchCampuses, which the waitlist flow uses and
// filters by ready_for_outreach; do not merge the two.) active_roster is a
// post-typegen column, hence the cast.
// ------------------------------------------------------------------
export type OrderCampusLite = { id: string; name: string };

export const searchOrderCampuses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().max(80) }).parse(d))
  .handler(async ({ data }): Promise<OrderCampusLite[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin.from("campuses") as any)
      .select("id,name")
      .eq("active_roster", "sec")
      .order("name")
      .limit(20);
    if (data.q) query = query.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, name: (r.name as string) ?? "" }));
  });

// ------------------------------------------------------------------
// Supported textbook families — the "pick a book" fallback list.
// ------------------------------------------------------------------
export type SupportedTextbook = { id: string; courseFamily: string; label: string };

export const listSupportedTextbooks = createServerFn({ method: "GET" })
  .handler(async (): Promise<SupportedTextbook[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await (supabaseAdmin.from("supported_textbook_families" as never) as any)
      .select("id,course_family,label,active");
    return ((rows ?? []) as Array<Record<string, unknown>>)
      .filter((r) => !["f", "false", "0", false].includes(r.active as never))
      .map((r) => ({
        id: r.id as string,
        courseFamily: (r.course_family as string) ?? "",
        label: (r.label as string) ?? "",
      }));
  });

// ------------------------------------------------------------------
// Submit — SERVER-SIDE insert (service-role). Pricing/delivery recomputed
// on the server from the same constants the client displayed.
// ------------------------------------------------------------------
const familyEnum = z.enum(["intro_1", "intro_2", "intermediate_1", "intermediate_2"]);
const chapterSchema = z.object({
  chapterLabel: z.string().trim().min(1).max(200),
  chapterNumber: z.number().int().nullable().optional(),
  struggleNote: z.string().trim().max(1000).nullable().optional(),
});
const submitOrderSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(30),
  campusId: z.string().uuid().nullable().optional(),
  campusText: z.string().trim().max(200).nullable().optional(),
  courseFamily: familyEnum.nullable().optional(),
  courseCode: z.string().trim().max(80).nullable().optional(),
  courseName: z.string().trim().max(200).nullable().optional(),
  professorName: z.string().trim().max(160).nullable().optional(),
  professorLeadId: z.string().uuid().nullable().optional(),
  textbookName: z.string().trim().max(300).nullable().optional(),
  textbookFamilyId: z.string().uuid().nullable().optional(),
  textbookNotes: z.string().trim().max(500).nullable().optional(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  examTimeframe: z.enum(["this_week", "next_week", "not_sure"]).nullable().optional(),
  tier: z.enum(["free_teaser", "made_to_order", "one_on_one", "something_else"]),
  // Full multi-select set (tier above is the PRIMARY pick, for pricing/notify).
  // requestedOptions is superseded by `interests` below and no longer written.
  requestedOptions: z.array(z.enum(["free_teaser", "made_to_order", "one_on_one", "something_else"])).max(4).optional(),
  // Demand-testing launch fields.
  interests: z.array(z.enum(["one_on_one", "group", "videos_tools", "something_else"])).max(4).optional(),
  isAccountingMajor: z.enum(["yes", "no", "definitely_not", "not_sure"]).nullable().optional(),
  referralSource: z.enum(["professor", "friend", "greek", "social", "search", "other"]).nullable().optional(),
  referralSourceDetail: z.string().trim().max(500).nullable().optional(),
  rush: z.boolean().optional(),
  // Request fields — the specifics are refined in the post-request tracker.
  chapterCountOnly: z.number().int().min(0).max(50).nullable().optional(),
  requestScope: z.enum(["everything_exam", "one_chapter", "one_or_two_topics", "homework_explained"]).nullable().optional(),
  requestNotes: z.string().trim().max(4000).nullable().optional(),
  interestedInGroup: z.boolean().optional(),
  groupSize: z.number().int().min(0).max(500).nullable().optional(),
  specialInstructions: z.string().trim().max(2000).nullable().optional(),
  // Student-uploaded supporting files (already stored in the student-syllabi
  // bucket by the client); we persist only their metadata on the order.
  attachments: z.array(z.object({
    name: z.string().trim().min(1).max(300),
    path: z.string().trim().min(1).max(500),
    size: z.number().int().min(0).max(50_000_000),
  })).max(20).optional(),
  chapters: z.array(chapterSchema).max(40).optional(),
});

export type SubmitOrderResult = {
  shortRef: string;
  tier: "free_teaser" | "made_to_order" | "one_on_one" | "something_else";
  chapterCount: number;
  subtotalCents: number;
  rush: boolean;
  rushFeeCents: number;
  totalCents: number;
  deliveryTargetDate: string | null;
  deliveryEstimateDays: number | null;
};

export const submitOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => submitOrderSchema.parse(d))
  .handler(async ({ data }): Promise<SubmitOrderResult> => {
    // CLOSED 2026-08-30 — see the deprecation note at the top of this file. The made-to-order
    // flow is not run any more, so this refuses instead of writing an order. The previous
    // implementation (pricing, order + order_chapters insert, notify, and a referral hook that
    // never once fired in production) is preserved in git history if it is ever restored.
    void data;
    throw new Error("The made-to-order request flow is closed. Exam 1 is free at surviveaccounting.com.");
  });
