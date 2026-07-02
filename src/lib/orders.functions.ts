// Server functions + shared pricing/delivery helpers for the made-to-order exam
// prep flow (/order). Inserts go through the SERVICE-ROLE client (supabaseAdmin)
// because orders/order_chapters are deny-by-default RLS — anon writes would
// silently fail. New tables are reached via `as never`/`as any` casts (no typegen).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
// Professor autocomplete — campus faculty, deduped, A→Z. Always optional:
// the wizard allows free text regardless of matches.
// ------------------------------------------------------------------
export type ProfessorLite = { id: string; name: string; title: string | null };

export const searchOrderProfessors = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ campusId: z.string().uuid(), q: z.string().trim().max(80).optional() }).parse(d))
  .handler(async ({ data }): Promise<ProfessorLite[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Contacted-only: show ONLY professors Lee has actually reached out to
    // (outreach_leads.sent_at IS NOT NULL) at this campus. No fallback to the full
    // faculty directory — if nobody's been emailed here yet, the picker is empty
    // and the student uses the "My professor isn't listed" free-text path.
    const { data: emailedRows } = await supabaseAdmin
      .from("outreach_leads")
      .select("email")
      .eq("campus_id", data.campusId)
      .not("sent_at", "is", null);
    const emailedSet = new Set(
      ((emailedRows ?? []) as Array<{ email: string | null }>)
        .map((r) => (r.email ?? "").toLowerCase().trim())
        .filter(Boolean),
    );

    const { data: rows } = await supabaseAdmin
      .from("campus_lead_suggestions")
      .select("id,first_name,last_name,email,title")
      .eq("campus_id", data.campusId)
      .is("archived_at", null)
      .order("last_name", { ascending: true })
      .limit(500);

    const seen = new Set<string>();
    const out: ProfessorLite[] = [];
    for (const r of (rows ?? []) as Array<Record<string, string | null>>) {
      const email = (r.email ?? "").toLowerCase().trim();
      // Contacted-only: skip anyone Lee hasn't emailed (no fallback).
      if (!emailedSet.has(email)) continue;
      const last = (r.last_name ?? "").trim();
      const first = (r.first_name ?? "").trim();
      const key = `${last.toLowerCase()}|${first.toLowerCase()}|${email}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = [first, last].filter(Boolean).join(" ").trim();
      if (!name) continue;
      out.push({ id: r.id as string, name, title: r.title ?? null });
    }
    const q = (data.q ?? "").trim().toLowerCase();
    const filtered = q ? out.filter((p) => p.name.toLowerCase().includes(q)) : out;
    return filtered.slice(0, 50);
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
  tier: z.enum(["free_teaser", "made_to_order", "one_on_one"]),
  rush: z.boolean().optional(),
  // Request fields — the specifics are refined in the post-request tracker.
  chapterCountOnly: z.number().int().min(0).max(50).nullable().optional(),
  requestScope: z.enum(["everything_exam", "one_chapter", "one_or_two_topics", "homework_explained"]).nullable().optional(),
  requestNotes: z.string().trim().max(4000).nullable().optional(),
  interestedInGroup: z.boolean().optional(),
  groupSize: z.number().int().min(0).max(500).nullable().optional(),
  chapters: z.array(chapterSchema).max(40).optional(),
});

export type SubmitOrderResult = {
  shortRef: string;
  tier: "free_teaser" | "made_to_order" | "one_on_one";
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const chapters = data.chapters ?? [];
    const isMTO = data.tier === "made_to_order";
    // A Custom Study Pack REQUEST has no finalized price: pricing is only computed
    // when a concrete chapterCountOnly is provided (kept for back-compat). The
    // request flow passes chapterCountOnly = null, so subtotal/total stay $0 and
    // delivery is null until Lee builds a preview and sets an unlock price.
    const hasFinalCount = typeof data.chapterCountOnly === "number" && data.chapterCountOnly > 0;
    const chapterCount = hasFinalCount ? (data.chapterCountOnly as number) : 0;
    const priced = isMTO && hasFinalCount;

    const pricing = computeOrderPricing({
      chapterCount,
      examDate: data.examDate ?? null,
      timeframe: data.examTimeframe ?? null,
      rush: !!data.rush,
    });

    const orderRow: Record<string, unknown> = {
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email.toLowerCase(),
      phone: data.phone,
      campus_id: data.campusId ?? null,
      campus_text: data.campusText ?? null,
      course_family: data.courseFamily ?? null,
      course_code: data.courseCode ?? null,
      course_name: data.courseName ?? null,
      professor_name: data.professorName ?? null,
      professor_lead_id: data.professorLeadId ?? null,
      textbook_name: data.textbookName ?? null,
      textbook_family_id: data.textbookFamilyId ?? null,
      textbook_notes: data.textbookNotes ?? null,
      exam_date: data.examDate ?? null,
      exam_timeframe: data.examTimeframe ?? null,
      tier: data.tier,
      chapter_count: chapterCount,
      chapter_count_only: data.chapterCountOnly ?? null,
      request_scope: data.requestScope ?? null,
      request_notes: data.requestNotes ?? null,
      interested_in_group: data.interestedInGroup ?? false,
      group_size: data.groupSize ?? null,
      awaiting_syllabus: true,
      subtotal_cents: priced ? pricing.subtotalCents : 0,
      rush: priced ? pricing.rush : false,
      rush_fee_cents: priced ? pricing.rushFeeCents : 0,
      total_cents: priced ? pricing.totalCents : 0,
      delivery_estimate_days: priced ? pricing.standardDays : null,
      delivery_target_date: priced ? pricing.deliveryTargetDate : null,
      source: "order_flow",
      status: "new",
    };

    const { data: inserted, error } = await (supabaseAdmin.from("orders" as never) as any)
      .insert(orderRow).select("id,short_ref").single();
    if (error) throw new Error(error.message);
    const orderId = inserted.id as string;
    const shortRef = inserted.short_ref as string;

    if (chapters.length) {
      const rows = chapters.map((c, i) => ({
        order_id: orderId,
        chapter_label: c.chapterLabel,
        chapter_number: c.chapterNumber ?? null,
        struggle_note: c.struggleNote ?? null,
        position: i,
      }));
      const { error: chErr } = await (supabaseAdmin.from("order_chapters" as never) as any).insert(rows);
      if (chErr) throw new Error(chErr.message);
    }

    return {
      shortRef,
      tier: data.tier,
      chapterCount,
      subtotalCents: orderRow.subtotal_cents as number,
      rush: orderRow.rush as boolean,
      rushFeeCents: orderRow.rush_fee_cents as number,
      totalCents: orderRow.total_cents as number,
      deliveryTargetDate: orderRow.delivery_target_date as string | null,
      deliveryEstimateDays: orderRow.delivery_estimate_days as number | null,
    };
  });
