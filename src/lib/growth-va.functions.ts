// VA enrichment mode — the server behind the stripped, passcode-free view a VA reaches by their
// private link. The queue is the VA's team's campuses in outreach-priority order, worked one at a
// time with light claiming (one owner per campus) so two VAs don't collide and READY-credit for pay
// is unambiguous. Session + attribution live in admin-session.functions.ts (assertVa / `va:<id>`).
//
// LAW: service-role client + admin/VA gate imported dynamically inside handlers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertVa } from "@/lib/admin-session.functions";
import { ownerCampusIds, buildSchedCampuses } from "@/lib/growth-schedule.functions";

type DB = { from: (t: string) => any };
const adminDb = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};
const todayYmd = () => { try { return new Date().toISOString().slice(0, 10); } catch { return "2026-09-01"; } };

export interface VaCampusCard { campusId: string; name: string; courseCode: string | null; coveredCount: number; neededCount: number }
export interface VaQueueView { vaName: string; team: string; doneToday: number; remaining: number; current: VaCampusCard | null }

// The VA's current campus + how many remain. Resume an open claim first, else the next eligible
// (not READY, not owned by someone else) campus in priority order.
export const growthVaQueue = createServerFn({ method: "GET" }).handler(async (): Promise<VaQueueView> => {
  const { vaId, name, team } = await assertVa();
  const db = await adminDb();
  const ids = await ownerCampusIds(db, team as "king" | "lee");
  if (!ids.length) return { vaName: name, team, doneToday: 0, remaining: 0, current: null };
  const { campuses, meta } = await buildSchedCampuses(db, ids);
  const ordered = [...campuses].sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9));

  const { data: claims } = await db.from("growth_va_campus").select("va_id,campus_id,completed_at,reached_ready");
  const claimRows = (claims ?? []) as any[];
  const claimByCampus = new Map<string, any>(claimRows.map((c) => [c.campus_id, c]));
  const today = todayYmd();
  const doneToday = claimRows.filter((c) => c.va_id === vaId && c.reached_ready && String(c.completed_at ?? "").slice(0, 10) === today).length;

  const isReady = (id: string) => meta.get(id)?.contactReady === true;
  const eligible = (id: string) => { if (isReady(id)) return false; const cl = claimByCampus.get(id); return !cl || cl.va_id === vaId; };
  const myOpen = ordered.find((c) => { const cl = claimByCampus.get(c.campusId); return cl && cl.va_id === vaId && !cl.completed_at && !isReady(c.campusId); });
  const currentCampus = myOpen ?? ordered.find((c) => eligible(c.campusId)) ?? null;
  const remaining = Math.max(0, ordered.filter((c) => eligible(c.campusId)).length - (currentCampus ? 1 : 0));

  let current: VaCampusCard | null = null;
  if (currentCampus) {
    const m = meta.get(currentCampus.campusId);
    let courseCode: string | null = null;
    try { const { data: cr } = await db.from("campuses").select("course_family_codes_json").eq("id", currentCampus.campusId).maybeSingle(); courseCode = (cr?.course_family_codes_json?.intro_1 as string | undefined) ?? null; } catch { /* ignore */ }
    current = { campusId: currentCampus.campusId, name: currentCampus.name, courseCode, coveredCount: m?.coveredCount ?? 0, neededCount: m?.neededCount ?? 0 };
  }
  return { vaName: name, team, doneToday, remaining, current };
});

/** Claim a campus for this VA (idempotent; refuses one another VA is actively on). */
export const growthVaClaim = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { vaId } = await assertVa();
    const db = await adminDb();
    const { data: existing } = await db.from("growth_va_campus").select("id,va_id,completed_at").eq("campus_id", data.campusId).maybeSingle();
    if (existing) {
      if (existing.va_id !== vaId && !existing.completed_at) return { ok: false, error: "Another teammate is on this campus." };
      return { ok: true };
    }
    const { error } = await db.from("growth_va_campus").insert({ va_id: vaId, campus_id: data.campusId });
    return error ? { ok: false, error: error.message } : { ok: true };
  });

/** After saving / finishing a campus: recompute readiness; if READY (or the VA marks it done),
 *  close the claim — that's what credits the VA and lets the next campus surface. */
export const growthVaFinishCampus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid(), done: z.boolean().default(false) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; ready: boolean }> => {
    const { vaId } = await assertVa();
    const db = await adminDb();
    let ready = false;
    try { const { growthCampusContactSlots } = await import("@/lib/growth-tranche.functions"); const s = await growthCampusContactSlots({ data: { campusId: data.campusId } }); ready = !!s?.readiness?.ready; } catch { /* ignore */ }
    if (ready || data.done) {
      await db.from("growth_va_campus").update({ completed_at: new Date().toISOString(), reached_ready: ready }).eq("campus_id", data.campusId).eq("va_id", vaId).is("completed_at", null);
    }
    return { ok: true, ready };
  });

/** Report a problem — stored AND emailed to Lee with the campus, user, page and browser. */
export const growthVaProblem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    note: z.string().trim().min(1).max(4000),
    campusId: z.string().uuid().nullable().optional(),
    page: z.string().max(300).optional(), userAgent: z.string().max(500).optional(),
    screenshotUrls: z.array(z.string().max(1000)).max(6).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { vaId, name } = await assertVa();
    const db = await adminDb();
    let campusName: string | null = null;
    if (data.campusId) { try { const { data: c } = await db.from("campuses").select("name,display_name").eq("id", data.campusId).maybeSingle(); campusName = c?.display_name || c?.name || null; } catch { /* ignore */ } }
    await db.from("growth_va_problem").insert({ va_id: vaId, campus_id: data.campusId ?? null, note: data.note.trim(), page: data.page ?? null, user_agent: data.userAgent ?? null, screenshot_urls: data.screenshotUrls ?? null });
    try {
      const { sendResendEmail } = await import("@/lib/email.server");
      const text = [
        `VA problem report from ${name}`, "",
        data.note.trim(), "",
        `Campus:  ${campusName ?? "—"}`,
        `Page:    ${data.page ?? "—"}`,
        `Browser: ${data.userAgent ?? "—"}`,
        data.screenshotUrls?.length ? `Screenshots:\n${data.screenshotUrls.join("\n")}` : "Screenshots: none",
      ].join("\n");
      await sendResendEmail({ to: "lee@surviveaccounting.com", subject: `VA problem — ${name}${campusName ? ` · ${campusName}` : ""}`, text });
    } catch { /* stored regardless of email */ }
    return { ok: true };
  });
