// Student-facing Help Video request tracker server functions. Access is gated by
// an email magic-link → httpOnly session cookie, so a shared URL alone can't leak
// student data. New tables reached via `as never`/`as any` casts; service-role
// client bypasses the deny-by-default RLS.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const WORK_PHONE = "(662) 565-8818";
const COOKIE = (shortRef: string) => `order_session_${shortRef}`;
const GENERIC_MESSAGE = "If that email matches this request, I sent a secure link.";

// Only these order fields are ever returned to a student.
const STUDENT_ORDER_COLS =
  "id,short_ref,created_at,campus_id,campus_text,course_family,course_code,course_name," +
  "professor_name,request_scope,request_notes,tier,chapter_count_only,exam_date,exam_timeframe," +
  "delivery_target_date,awaiting_syllabus,syllabus_url,special_requests,chapter_priority_json," +
  "interested_in_group,group_size,preview_url,unlock_price_cents,unlocked_at";

export type StageEvent = {
  stage: string;
  student_visible_message: string | null;
  preview_url: string | null;
  unlock_price_cents: number | null;
  unlock_url: string | null;
  created_at: string;
};
export type StudentOrder = {
  short_ref: string;
  created_at: string;
  campus_name: string | null;
  campus_text: string | null;
  course_code: string | null;
  course_name: string | null;
  professor_name: string | null;
  request_scope: string | null;
  request_notes: string | null;
  chapter_count_only: number | null;
  chapters: string[];
  exam_date: string | null;
  exam_timeframe: string | null;
  delivery_target_date: string | null;
  awaiting_syllabus: boolean;
  syllabus_url: string | null;
  has_syllabus: boolean;
  special_requests: string | null;
  chapter_priority: string[] | null;
  interested_in_group: boolean;
  group_size: number | null;
  preview_url: string | null;
  unlock_price_cents: number | null;
  unlocked_at: string | null;
};
export type GetOrderForStudentResult =
  | { ok: false; needs_auth: true }
  | { ok: true; order: StudentOrder; stage_events: StageEvent[]; latest_preview_url: string | null; latest_unlock_price_cents: number | null };

// Verify the request's session cookie against a live token; returns the order id
// (and admin client) when valid, else null. Bumps used_at.
async function verifiedOrder(shortRef: string): Promise<{ supabaseAdmin: any; orderId: string } | null> {
  const { getCookie } = await import("@tanstack/react-start/server");
  const token = getCookie(COOKIE(shortRef));
  if (!token) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await (supabaseAdmin.from("orders" as never) as any).select("id").eq("short_ref", shortRef).maybeSingle();
  if (!order) return null;
  const { data: tok } = await (supabaseAdmin.from("order_access_tokens" as never) as any)
    .select("id,expires_at").eq("order_id", order.id).eq("token", token).maybeSingle();
  if (!tok || new Date(tok.expires_at).getTime() < Date.now()) return null;
  await (supabaseAdmin.from("order_access_tokens" as never) as any).update({ used_at: new Date().toISOString() }).eq("id", tok.id);
  return { supabaseAdmin, orderId: order.id };
}

// A. requestOrderAccess — email a secure magic link. Always returns the same
// generic message (never leaks whether the order/email exists or was rate-limited).
export const requestOrderAccess = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    short_ref: z.string().trim().min(1).max(20),
    email: z.string().trim().email().max(255),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; message: string }> => {
    const generic = { ok: true as const, message: GENERIC_MESSAGE };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const orders = () => (supabaseAdmin.from("orders" as never) as any);
      const tokens = () => (supabaseAdmin.from("order_access_tokens" as never) as any);

      const email = data.email.toLowerCase().trim();
      const { data: order } = await orders().select("id,email").eq("short_ref", data.short_ref).maybeSingle();
      if (!order) return generic;
      if (String(order.email ?? "").toLowerCase().trim() !== email) return generic;

      // Rate limit: max 3 tokens per order + email in the last hour.
      const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const { count } = await tokens().select("id", { count: "exact", head: true })
        .eq("order_id", order.id).ilike("email", email).gte("created_at", hourAgo);
      if ((count ?? 0) >= 3) return generic;

      const { randomBytes } = await import("node:crypto");
      const token = randomBytes(32).toString("base64url");
      const { error } = await tokens().insert({ order_id: order.id, email, token });
      if (error) return generic;

      // Magic link from the current request host.
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      const host = req?.headers.get("x-forwarded-host") || req?.headers.get("host") || "surviveaccounting.com";
      const proto = req?.headers.get("x-forwarded-proto") || "https";
      const link = `${proto}://${host}/order/${data.short_ref}?t=${token}`;

      const { sendResendEmail } = await import("@/lib/email.server");
      await sendResendEmail({
        to: String(order.email),
        subject: "Your Help Video request link",
        text: `Hey — here's your secure link to track your Help Video request:\n\n${link}\n\nThis link works for 30 days.\n\nQuestions? Text me at ${WORK_PHONE}.`,
      });
      return generic;
    } catch {
      return generic;
    }
  });

// B. redeemOrderAccess — turn a ?t= token into a 30-day httpOnly session cookie.
export const redeemOrderAccess = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    short_ref: z.string().trim().min(1).max(20),
    token: z.string().trim().min(1).max(200),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; reason: "expired_or_invalid" }> => {
    const bad = { ok: false as const, reason: "expired_or_invalid" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await (supabaseAdmin.from("orders" as never) as any).select("id").eq("short_ref", data.short_ref).maybeSingle();
    if (!order) return bad;
    const { data: tok } = await (supabaseAdmin.from("order_access_tokens" as never) as any)
      .select("id,expires_at").eq("order_id", order.id).eq("token", data.token).maybeSingle();
    if (!tok || new Date(tok.expires_at).getTime() < Date.now()) return bad;

    const now = new Date().toISOString();
    await (supabaseAdmin.from("order_access_tokens" as never) as any).update({ consumed_at: now, used_at: now }).eq("id", tok.id);

    const { setCookie } = await import("@tanstack/react-start/server");
    setCookie(COOKIE(data.short_ref), data.token, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true };
  });

// C. getOrderForStudent — safe student-facing data (requires the session cookie).
export const getOrderForStudent = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ short_ref: z.string().trim().min(1).max(20) }).parse(d))
  .handler(async ({ data }): Promise<GetOrderForStudentResult> => {
    const v = await verifiedOrder(data.short_ref);
    if (!v) return { ok: false, needs_auth: true };
    const { supabaseAdmin, orderId } = v;

    const { data: o } = await (supabaseAdmin.from("orders" as never) as any).select(STUDENT_ORDER_COLS).eq("id", orderId).maybeSingle();
    if (!o) return { ok: false, needs_auth: true };

    let campusName: string | null = null;
    if (o.campus_id) {
      const { data: c } = await supabaseAdmin.from("campuses").select("name").eq("id", o.campus_id).maybeSingle();
      campusName = (c?.name as string) ?? null;
    }
    const { data: chs } = await (supabaseAdmin.from("order_chapters" as never) as any)
      .select("chapter_label,position").eq("order_id", orderId).order("position", { ascending: true });
    const chapters = ((chs ?? []) as Array<{ chapter_label: string }>).map((c) => c.chapter_label);

    const { data: evRows } = await (supabaseAdmin.from("order_stage_events" as never) as any)
      .select("stage,student_visible_message,preview_url,unlock_price_cents,unlock_url,created_at")
      .eq("order_id", orderId).order("created_at", { ascending: true });
    const stage_events = ((evRows ?? []) as StageEvent[]);

    const previewReady = [...stage_events].reverse().find((e) => e.stage === "preview_ready");
    const unlockEv = [...stage_events].reverse().find((e) => e.stage === "unlocked" || e.stage === "preview_ready");
    const latest_preview_url = previewReady?.preview_url ?? (o.preview_url as string) ?? null;
    const latest_unlock_price_cents = unlockEv?.unlock_price_cents ?? (o.unlock_price_cents as number) ?? null;

    const priority = Array.isArray(o.chapter_priority_json) ? (o.chapter_priority_json as string[]) : null;

    const order: StudentOrder = {
      short_ref: String(o.short_ref),
      created_at: String(o.created_at),
      campus_name: campusName,
      campus_text: (o.campus_text as string) ?? null,
      course_code: (o.course_code as string) ?? null,
      course_name: (o.course_name as string) ?? null,
      professor_name: (o.professor_name as string) ?? null,
      request_scope: (o.request_scope as string) ?? null,
      request_notes: (o.request_notes as string) ?? null,
      chapter_count_only: (o.chapter_count_only as number) ?? null,
      chapters,
      exam_date: (o.exam_date as string) ?? null,
      exam_timeframe: (o.exam_timeframe as string) ?? null,
      delivery_target_date: (o.delivery_target_date as string) ?? null,
      awaiting_syllabus: o.awaiting_syllabus === true,
      syllabus_url: (o.syllabus_url as string) ?? null,
      has_syllabus: !!o.syllabus_url,
      special_requests: (o.special_requests as string) ?? null,
      chapter_priority: priority,
      interested_in_group: o.interested_in_group === true,
      group_size: (o.group_size as number) ?? null,
      preview_url: latest_preview_url,
      unlock_price_cents: latest_unlock_price_cents,
      unlocked_at: (o.unlocked_at as string) ?? null,
    };
    return { ok: true, order, stage_events, latest_preview_url, latest_unlock_price_cents };
  });

// D. updateStudentOrderDetails — student adds/edits only safe fields.
export const updateStudentOrderDetails = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    short_ref: z.string().trim().min(1).max(20),
    special_requests: z.string().max(4000).nullable().optional(),
    chapter_priority_json: z.array(z.string().max(200)).max(40).nullable().optional(),
    syllabus_url: z.string().max(1000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: false; needs_auth: true } | { ok: true }> => {
    const v = await verifiedOrder(data.short_ref);
    if (!v) return { ok: false, needs_auth: true };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.special_requests !== undefined) patch.special_requests = data.special_requests;
    if (data.chapter_priority_json !== undefined) patch.chapter_priority_json = data.chapter_priority_json;
    if (data.syllabus_url !== undefined) patch.syllabus_url = data.syllabus_url;
    const { error } = await (v.supabaseAdmin.from("orders" as never) as any).update(patch).eq("id", v.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Student syllabus/review-sheet upload → private student-syllabi bucket. Stores
// the storage PATH in orders.syllabus_url (admin signs it to view).
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg"]);
export const uploadStudentSyllabus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    short_ref: z.string().trim().min(1).max(20),
    fileName: z.string().trim().min(1).max(200),
    contentType: z.string().trim().min(1).max(120),
    base64: z.string().min(1).max(15_000_000), // ~11MB decoded
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: false; needs_auth: true } | { ok: true; path: string }> => {
    const v = await verifiedOrder(data.short_ref);
    if (!v) return { ok: false, needs_auth: true };
    if (!ALLOWED.has(data.contentType.toLowerCase())) throw new Error("Only PDF, PNG, or JPG files are accepted.");
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.length > 10 * 1024 * 1024) throw new Error("Max file size is 10MB.");
    const safe = data.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
    const path = `orders/${v.orderId}/syllabus-${Date.now()}-${safe}`;
    const { error: upErr } = await v.supabaseAdmin.storage.from("student-syllabi")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);
    await (v.supabaseAdmin.from("orders" as never) as any)
      .update({ syllabus_url: path, awaiting_syllabus: false, updated_at: new Date().toISOString() }).eq("id", v.orderId);
    return { ok: true, path };
  });
