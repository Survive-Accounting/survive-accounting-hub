// Admin server functions for /outreach/orders. Service-role (bypasses the
// deny-by-default RLS on orders/order_chapters). New tables reached via
// `as never`/`as any` casts (no typegen). Admin-only: reached through the
// AdminGate-wrapped /outreach shell.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const STATUSES = ["new", "in_progress", "delivered", "paid", "cancelled"] as const;
const TIERS = ["free_teaser", "made_to_order", "one_on_one"] as const;

const ORDER_COLS =
  "id,short_ref,created_at,first_name,last_name,email,phone,campus_id,campus_text," +
  "course_family,course_code,course_name,professor_name,professor_lead_id,textbook_name," +
  "tier,chapter_count,chapter_count_only,awaiting_syllabus,interested_in_group,group_size," +
  "exam_date,exam_timeframe,subtotal_cents,rush,rush_fee_cents,total_cents," +
  "delivery_target_date,delivery_estimate_days,status,admin_notes";

export type AdminOrderRow = {
  id: string;
  short_ref: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string;
  campus_id: string | null;
  campus_text: string | null;
  campus_name: string | null;
  course_family: string | null;
  course_code: string | null;
  course_name: string | null;
  professor_name: string | null;
  professor_lead_id: string | null;
  textbook_name: string | null;
  tier: string;
  chapter_count: number | null;
  chapter_count_only: number | null;
  awaiting_syllabus: boolean;
  interested_in_group: boolean;
  group_size: number | null;
  exam_date: string | null;
  exam_timeframe: string | null;
  subtotal_cents: number;
  rush: boolean;
  rush_fee_cents: number;
  total_cents: number;
  delivery_target_date: string | null;
  delivery_estimate_days: number | null;
  status: string;
  admin_notes: string | null;
  chapter_rows: number;
};

export type OrderChapterRow = {
  chapter_label: string;
  chapter_number: number | null;
  struggle_note: string | null;
  position: number;
};

export type AdminOrderDetail = AdminOrderRow & { chapters: OrderChapterRow[] };

export type CampusFacet = { id: string; name: string };
export type ListOrdersResult = {
  rows: AdminOrderRow[];
  total: number;         // count matching the current filter
  newThisWeek: number;   // orders created in the last 7 days (unfiltered)
  campuses: CampusFacet[]; // campuses that have at least one order
  capped: boolean;       // true when the 100-row cap was hit
};

const ListInput = z.object({
  status: z.enum(STATUSES).optional().nullable(),
  campus_id: z.string().uuid().optional().nullable(),
  tier: z.enum(TIERS).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
  limit: z.number().int().min(1).max(100).optional(),
});

const HARD_CAP = 100;

function mapRow(r: Record<string, unknown>, campusName: string | null, chapterRows: number): AdminOrderRow {
  return {
    id: String(r.id),
    short_ref: String(r.short_ref ?? ""),
    created_at: String(r.created_at ?? ""),
    first_name: (r.first_name as string) ?? null,
    last_name: (r.last_name as string) ?? null,
    email: String(r.email ?? ""),
    phone: String(r.phone ?? ""),
    campus_id: (r.campus_id as string) ?? null,
    campus_text: (r.campus_text as string) ?? null,
    campus_name: campusName,
    course_family: (r.course_family as string) ?? null,
    course_code: (r.course_code as string) ?? null,
    course_name: (r.course_name as string) ?? null,
    professor_name: (r.professor_name as string) ?? null,
    professor_lead_id: (r.professor_lead_id as string) ?? null,
    textbook_name: (r.textbook_name as string) ?? null,
    tier: String(r.tier ?? ""),
    chapter_count: (r.chapter_count as number) ?? null,
    chapter_count_only: (r.chapter_count_only as number) ?? null,
    awaiting_syllabus: r.awaiting_syllabus === true,
    interested_in_group: r.interested_in_group === true,
    group_size: (r.group_size as number) ?? null,
    exam_date: (r.exam_date as string) ?? null,
    exam_timeframe: (r.exam_timeframe as string) ?? null,
    subtotal_cents: Number(r.subtotal_cents ?? 0),
    rush: r.rush === true,
    rush_fee_cents: Number(r.rush_fee_cents ?? 0),
    total_cents: Number(r.total_cents ?? 0),
    delivery_target_date: (r.delivery_target_date as string) ?? null,
    delivery_estimate_days: (r.delivery_estimate_days as number) ?? null,
    status: String(r.status ?? "new"),
    admin_notes: (r.admin_notes as string) ?? null,
    chapter_rows: chapterRows,
  };
}

export const listOrders = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data }): Promise<ListOrdersResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ord = () => (supabaseAdmin.from("orders" as never) as any);

    // Applies the active filters to any orders query (data + count).
    const search = (data.search ?? "").trim().replace(/[%,()]/g, "");
    const applyFilters = (q: any) => {
      if (data.status) q = q.eq("status", data.status);
      if (data.tier) q = q.eq("tier", data.tier);
      if (data.campus_id) q = q.eq("campus_id", data.campus_id);
      if (search) q = q.or(`short_ref.ilike.%${search}%,email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
      return q;
    };

    const cap = Math.min(data.limit ?? 50, HARD_CAP);
    const { data: rows, error } = await applyFilters(
      ord().select(ORDER_COLS).order("created_at", { ascending: false }).limit(cap),
    );
    if (error) throw new Error(error.message);
    const orderRows = (rows ?? []) as Array<Record<string, unknown>>;

    // Campus names for the page.
    const campusIds = [...new Set(orderRows.map((r) => r.campus_id).filter(Boolean) as string[])];
    const campusNameById = new Map<string, string>();
    if (campusIds.length) {
      const { data: cs } = await supabaseAdmin.from("campuses").select("id,name").in("id", campusIds);
      for (const c of (cs ?? []) as Array<{ id: string; name: string }>) campusNameById.set(c.id, c.name);
    }

    // Chapter counts per order.
    const orderIds = orderRows.map((r) => String(r.id));
    const chapterCount = new Map<string, number>();
    if (orderIds.length) {
      const { data: chs } = await (supabaseAdmin.from("order_chapters" as never) as any)
        .select("order_id").in("order_id", orderIds);
      for (const ch of (chs ?? []) as Array<{ order_id: string }>) {
        chapterCount.set(ch.order_id, (chapterCount.get(ch.order_id) ?? 0) + 1);
      }
    }

    const mapped = orderRows.map((r) =>
      mapRow(r, r.campus_id ? campusNameById.get(String(r.campus_id)) ?? null : null, chapterCount.get(String(r.id)) ?? 0));

    // Counts.
    const { count: total } = await applyFilters(ord().select("id", { count: "exact", head: true }));
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { count: newThisWeek } = await ord().select("id", { count: "exact", head: true }).gte("created_at", weekAgo);

    // Facets: campuses that have any order.
    const { data: facetRows } = await ord().select("campus_id").not("campus_id", "is", null).limit(1000);
    const facetIds = [...new Set(((facetRows ?? []) as Array<{ campus_id: string }>).map((r) => r.campus_id))];
    const facetCampuses: CampusFacet[] = [];
    if (facetIds.length) {
      const { data: fc } = await supabaseAdmin.from("campuses").select("id,name").in("id", facetIds);
      for (const c of (fc ?? []) as Array<{ id: string; name: string }>) facetCampuses.push({ id: c.id, name: c.name ?? "—" });
      facetCampuses.sort((a, b) => a.name.localeCompare(b.name));
    }

    return {
      rows: mapped,
      total: total ?? mapped.length,
      newThisWeek: newThisWeek ?? 0,
      campuses: facetCampuses,
      capped: mapped.length >= HARD_CAP,
    };
  });

export const getOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ short_ref: z.string().trim().min(1).max(20) }).parse(d))
  .handler(async ({ data }): Promise<AdminOrderDetail | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin.from("orders" as never) as any)
      .select(ORDER_COLS).eq("short_ref", data.short_ref).maybeSingle();
    if (!row) return null;

    let campusName: string | null = null;
    if (row.campus_id) {
      const { data: c } = await supabaseAdmin.from("campuses").select("name").eq("id", row.campus_id).maybeSingle();
      campusName = (c?.name as string) ?? null;
    }
    const { data: chs } = await (supabaseAdmin.from("order_chapters" as never) as any)
      .select("chapter_label,chapter_number,struggle_note,position").eq("order_id", row.id).order("position", { ascending: true });
    const chapters = ((chs ?? []) as Array<Record<string, unknown>>).map((c) => ({
      chapter_label: String(c.chapter_label ?? ""),
      chapter_number: (c.chapter_number as number) ?? null,
      struggle_note: (c.struggle_note as string) ?? null,
      position: Number(c.position ?? 0),
    }));
    return { ...mapRow(row, campusName, chapters.length), chapters };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ short_ref: z.string().trim().min(1).max(20), status: z.enum(STATUSES) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("orders" as never) as any)
      .update({ status: data.status, updated_at: new Date().toISOString() }).eq("short_ref", data.short_ref);
    if (error) throw new Error(error.message);
    return { ok: true as const, status: data.status };
  });

export const updateOrderAdminNotes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ short_ref: z.string().trim().min(1).max(20), admin_notes: z.string().max(4000) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("orders" as never) as any)
      .update({ admin_notes: data.admin_notes, updated_at: new Date().toISOString() }).eq("short_ref", data.short_ref);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setAwaitingSyllabus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ short_ref: z.string().trim().min(1).max(20), value: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("orders" as never) as any)
      .update({ awaiting_syllabus: data.value, updated_at: new Date().toISOString() }).eq("short_ref", data.short_ref);
    if (error) throw new Error(error.message);
    return { ok: true as const, value: data.value };
  });

// ---- Cram Video stage timeline (admin) ----------------------------
export type AdminStageEvent = {
  id: string;
  stage: string;
  note: string | null;
  student_visible_message: string | null;
  preview_url: string | null;
  unlock_price_cents: number | null;
  unlock_url: string | null;
  created_at: string;
};
const STAGE_ENUM = z.enum([
  "request_received", "reviewing", "preview_in_progress", "preview_ready", "unlocked", "delivered", "post_exam_check_in",
]);

export const getOrderTimeline = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ short_ref: z.string().trim().min(1).max(20) }).parse(d))
  .handler(async ({ data }): Promise<AdminStageEvent[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await (supabaseAdmin.from("orders" as never) as any).select("id").eq("short_ref", data.short_ref).maybeSingle();
    if (!order) return [];
    const { data: rows } = await (supabaseAdmin.from("order_stage_events" as never) as any)
      .select("id,stage,note,student_visible_message,preview_url,unlock_price_cents,unlock_url,created_at")
      .eq("order_id", order.id).order("created_at", { ascending: true });
    return (rows ?? []) as AdminStageEvent[];
  });

// Admin-only (matches the existing /outreach admin fn convention — protected by
// the AdminGate UI, no extra server guard). Inserts a stage event, mirrors key
// fields onto the order, and emails the student their update.
export const advanceOrderStage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    short_ref: z.string().trim().min(1).max(20),
    stage: STAGE_ENUM,
    student_visible_message: z.string().trim().max(2000).nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
    preview_url: z.string().trim().max(1000).nullable().optional(),
    unlock_price_cents: z.number().int().min(0).max(5_000_000).nullable().optional(),
    unlock_url: z.string().trim().max(1000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; event: AdminStageEvent; email: { ok: boolean; error?: string; id?: string } }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orders = () => (supabaseAdmin.from("orders" as never) as any);
    const { data: order } = await orders().select("id,email,short_ref").eq("short_ref", data.short_ref).maybeSingle();
    if (!order) throw new Error("Order not found");

    const { data: inserted, error } = await (supabaseAdmin.from("order_stage_events" as never) as any)
      .insert({
        order_id: order.id, stage: data.stage,
        note: data.note ?? null, student_visible_message: data.student_visible_message ?? null,
        preview_url: data.preview_url ?? null, unlock_price_cents: data.unlock_price_cents ?? null, unlock_url: data.unlock_url ?? null,
      })
      .select("id,stage,note,student_visible_message,preview_url,unlock_price_cents,unlock_url,created_at").single();
    if (error) throw new Error(error.message);

    // Mirror onto the order for easy querying.
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.stage === "preview_ready") {
      if (data.preview_url) patch.preview_url = data.preview_url;
      if (data.unlock_price_cents != null) patch.unlock_price_cents = data.unlock_price_cents;
    }
    if (data.stage === "unlocked") {
      patch.unlocked_at = new Date().toISOString();
      if (data.unlock_price_cents != null) patch.unlock_price_cents = data.unlock_price_cents;
    }
    if (Object.keys(patch).length > 1) await orders().update(patch).eq("id", order.id);

    // Email the student (no token in the link). Only if there's a message to show.
    let email: { ok: boolean; error?: string; id?: string } = { ok: false, error: "no message — email skipped" };
    if (order.email && data.student_visible_message) {
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      const host = req?.headers.get("x-forwarded-host") || req?.headers.get("host") || "surviveaccounting.com";
      const proto = req?.headers.get("x-forwarded-proto") || "https";
      const link = `${proto}://${host}/order/${order.short_ref}`;
      let body = `Update on your Cram Video request:\n\n${data.student_visible_message}\n\nTrack it here:\n${link}\n\nQuestions? Text me at (662) 565-8818.`;
      if (data.stage === "preview_ready") { body = `Your preview is ready.\n\n${body}`; if (data.preview_url) body += `\n\nPreview: ${data.preview_url}`; }
      if (data.unlock_price_cents != null) body += `\n\nUnlock price: $${Math.round(data.unlock_price_cents / 100)}`;
      const { sendResendEmail } = await import("@/lib/email.server");
      email = await sendResendEmail({ to: String(order.email), subject: `Update on Cram Video #${order.short_ref}`, text: body });
    }

    return { ok: true, event: inserted as AdminStageEvent, email };
  });
