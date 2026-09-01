// VA enrichment mode — the server behind the stripped, passcode-free view a VA reaches by their
// private link. The queue is the VA's team's campuses in outreach-priority order, worked one at a
// time with light claiming (one owner per campus) so two VAs don't collide and READY-credit for pay
// is unambiguous. Session + attribution live in admin-session.functions.ts (assertVa / `va:<id>`).
//
// LAW: service-role client + admin/VA gate imported dynamically inside handlers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertVa, assertAdminNotVa } from "@/lib/admin-session.functions";
import { ownerCampusIds, buildSchedCampuses } from "@/lib/growth-schedule.functions";

type DB = { from: (t: string) => any };
const adminDb = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};
const todayYmd = () => { try { return new Date().toISOString().slice(0, 10); } catch { return "2026-09-01"; } };
const curMonth = () => { try { return new Date().toISOString().slice(0, 7); } catch { return "2026-09"; } };

const PERSON_TYPES = new Set(["student_officer", "chapter_exec", "staff_advisor"]);
function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, end: `${next}-01` };
}

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

/** Report a problem — stored AND emailed to Lee with the campus, user, page, browser, and any
 *  screenshots (uploaded server-side to the public va-problems bucket). */
export const growthVaProblem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    note: z.string().trim().min(1).max(4000),
    campusId: z.string().uuid().nullable().optional(),
    page: z.string().max(300).optional(), userAgent: z.string().max(500).optional(),
    screenshots: z.array(z.object({ name: z.string().max(120).optional(), dataUrl: z.string().max(8_000_000) })).max(4).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { vaId, name } = await assertVa();
    const db = await adminDb();
    let campusName: string | null = null;
    if (data.campusId) { try { const { data: c } = await db.from("campuses").select("name,display_name").eq("id", data.campusId).maybeSingle(); campusName = c?.display_name || c?.name || null; } catch { /* ignore */ } }

    // Upload screenshots (data URLs) to the public bucket; collect the resulting URLs.
    const urls: string[] = [];
    const storage = (db as unknown as { storage?: { from: (b: string) => any } }).storage;
    for (const sh of (data.screenshots ?? [])) {
      const m = sh.dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
      if (!m || !storage) continue;
      try {
        const ext = (m[1].split("/")[1] || "png").replace(/[^\w]/g, "");
        const buf = Buffer.from(m[2], "base64");
        const path = `${vaId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await storage.from("va-problems").upload(path, buf, { contentType: m[1], upsert: false });
        if (!upErr) { const pub = storage.from("va-problems").getPublicUrl(path); const u = pub?.data?.publicUrl; if (u) urls.push(u); }
      } catch { /* skip a bad image */ }
    }

    await db.from("growth_va_problem").insert({ va_id: vaId, campus_id: data.campusId ?? null, note: data.note.trim(), page: data.page ?? null, user_agent: data.userAgent ?? null, screenshot_urls: urls.length ? urls : null });
    try {
      const { sendResendEmail } = await import("@/lib/email.server");
      const text = [
        `VA problem report from ${name}`, "",
        data.note.trim(), "",
        `Campus:  ${campusName ?? "—"}`,
        `Page:    ${data.page ?? "—"}`,
        `Browser: ${data.userAgent ?? "—"}`,
        urls.length ? `Screenshots:\n${urls.join("\n")}` : "Screenshots: none",
      ].join("\n");
      await sendResendEmail({ to: "lee@surviveaccounting.com", subject: `VA problem — ${name}${campusName ? ` · ${campusName}` : ""}`, text });
    } catch { /* stored regardless of email */ }
    return { ok: true };
  });

// ── Lee's view (assertAdminNotVa — a VA session is refused) ──────────────────────────────────
// Pay was removed (2026-08-31): VAs work pro bono, so this is a roster + activity view, no money.
export interface VaRosterRow {
  id: string; name: string; team: string; active: boolean; token: string;
  campusesReady: number; personalIgs: number; contacts: number; notFound: number;
}
export interface VaTeamGroup { team: string; label: string; rows: VaRosterRow[] }
export interface VaRosterView { month: string; teams: VaTeamGroup[] }

/** The team view: per-VA activity (READY campuses, personal IGs, contacts) grouped by team, for a
 *  month. No pay. */
export const growthVaRoster = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<VaRosterView> => {
    await assertAdminNotVa();
    const db = await adminDb();
    const month = data.month ?? curMonth();
    const { start, end } = monthBounds(month);
    const [{ data: vas }, { data: claims }, { data: qc }] = await Promise.all([
      db.from("growth_va").select("id,token,name,team,active").order("created_at", { ascending: true }),
      db.from("growth_va_campus").select("va_id,reached_ready,completed_at").eq("reached_ready", true).gte("completed_at", start).lt("completed_at", end),
      db.from("growth_contact_qc").select("qc_by,contact_type,name,instagram,outreach_eligible,created_at").like("qc_by", "va:%").gte("created_at", start).lt("created_at", end),
    ]);
    const ready = new Map<string, number>();
    for (const c of (claims ?? []) as any[]) ready.set(c.va_id, (ready.get(c.va_id) ?? 0) + 1);
    const igs = new Map<string, number>(), contacts = new Map<string, number>(), nf = new Map<string, number>();
    for (const r of (qc ?? []) as any[]) {
      const id = String(r.qc_by).slice(3); // strip "va:"
      if (r.outreach_eligible === false) { nf.set(id, (nf.get(id) ?? 0) + 1); continue; }
      contacts.set(id, (contacts.get(id) ?? 0) + 1);
      const isPerson = PERSON_TYPES.has(r.contact_type) || !!(r.name && String(r.name).trim());
      if (isPerson && r.instagram && String(r.instagram).trim()) igs.set(id, (igs.get(id) ?? 0) + 1);
    }
    const rows: VaRosterRow[] = ((vas ?? []) as any[]).map((v) => ({
      id: v.id, name: v.name, team: v.team, active: v.active, token: v.token,
      campusesReady: ready.get(v.id) ?? 0, personalIgs: igs.get(v.id) ?? 0, contacts: contacts.get(v.id) ?? 0, notFound: nf.get(v.id) ?? 0,
    }));
    const teams: VaTeamGroup[] = [];
    for (const team of ["king", "lee"]) {
      const trows = rows.filter((r) => r.team === team);
      if (trows.length) teams.push({ team, label: team === "king" ? "King's team" : "Lee's team", rows: trows });
    }
    return { month, teams };
  });

/** Preview the VA queue as an admin (assertAdminNotVa) for a chosen team — powers "act as a VA".
 *  No claiming/attribution; just the next not-ready campus in priority order, so Lee sees their view. */
export const growthVaQueuePreview = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ team: z.enum(["king", "lee"]).default("king") }).parse(d ?? {}))
  .handler(async ({ data }): Promise<VaQueueView> => {
    await assertAdminNotVa();
    const db = await adminDb();
    const ids = await ownerCampusIds(db, data.team);
    if (!ids.length) return { vaName: "Preview", team: data.team, doneToday: 0, remaining: 0, current: null };
    const { campuses, meta } = await buildSchedCampuses(db, ids);
    const ordered = [...campuses].sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9));
    const notReady = ordered.filter((c) => meta.get(c.campusId)?.contactReady !== true);
    const readyCount = ordered.length - notReady.length;
    const cur = notReady[0] ?? null;
    let current: VaCampusCard | null = null;
    if (cur) {
      const m = meta.get(cur.campusId);
      let courseCode: string | null = null;
      try { const { data: cr } = await db.from("campuses").select("course_family_codes_json").eq("id", cur.campusId).maybeSingle(); courseCode = (cr?.course_family_codes_json?.intro_1 as string | undefined) ?? null; } catch { /* ignore */ }
      current = { campusId: cur.campusId, name: cur.name, courseCode, coveredCount: m?.coveredCount ?? 0, neededCount: m?.neededCount ?? 0 };
    }
    return { vaName: "Preview", team: data.team, doneToday: readyCount, remaining: Math.max(0, notReady.length - 1), current };
  });

/** Add a VA — generates their private-link token. */
export const growthVaCreate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(80), team: z.enum(["king", "lee"]).default("king"), rateReadyCents: z.number().int().min(0).max(100000).nullable().optional(), rateIgCents: z.number().int().min(0).max(100000).nullable().optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; token?: string; error?: string }> => {
    await assertAdminNotVa();
    const db = await adminDb();
    const token = `vk_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
    const { data: ins, error } = await db.from("growth_va").insert({ name: data.name.trim(), team: data.team, token, rate_ready_cents: data.rateReadyCents ?? null, rate_ig_cents: data.rateIgCents ?? null }).select("id,token").maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: ins?.id, token: ins?.token };
  });

/** Edit a VA — name, team, active, or rate overrides. */
export const growthVaUpdate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80).optional(), active: z.boolean().optional(), team: z.enum(["king", "lee"]).optional(), rateReadyCents: z.number().int().min(0).max(100000).nullable().optional(), rateIgCents: z.number().int().min(0).max(100000).nullable().optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await assertAdminNotVa();
    const db = await adminDb();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.active !== undefined) patch.active = data.active;
    if (data.team !== undefined) patch.team = data.team;
    if (data.rateReadyCents !== undefined) patch.rate_ready_cents = data.rateReadyCents;
    if (data.rateIgCents !== undefined) patch.rate_ig_cents = data.rateIgCents;
    const { error } = await db.from("growth_va").update(patch).eq("id", data.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  });
