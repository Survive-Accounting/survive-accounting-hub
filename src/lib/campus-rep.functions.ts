// CAMPUS REP — interest capture only.
//
// SCOPE IS DELIBERATELY NARROW. No rep links, no codes, no attribution, no dashboards, no
// commission tracking, no W-9 handling, no onboarding email. This is an advertisement and a form;
// everything downstream of "Lee decides to say yes" is a later pass and is not stubbed here, because
// a half-built payout path is worse than none.
//
// ── WHERE APPLICATIONS LIVE, AND WHY IT IS NOT THEIR OWN TABLE ────────────────────────────────
//
// They want a table: name, contact, school, year, their answer, a mutable status and a note. DDL
// cannot be run from this machine (no Supabase Management PAT — migration 0118, one line, is still
// waiting on a human), so a feature that needs a new table would ship as a feature that does not
// work.
//
// Two existing tables could hold this:
//
//   * student_intake_submissions has almost every field — and it DRIVES LEE'S ONBOARDING
//     (routing_result, booking_link_shown, onboarding_* timestamps). Putting rep applications in
//     there risks a rep being routed into a student booking flow. Rejected.
//   * referrals is a thin free-text table (raw_text, referrer_email, ok_to_name), currently used
//     only by the "not listed" capture behind its own prefix, and has 0 rows. Nothing processes it
//     automatically.
//
// So an application is one `referrals` row whose raw_text is a JSON envelope behind a prefix.
// Status and notes live inside that envelope; the admin does read-modify-write on a single row,
// which is fine at the volume a one-person tutoring business generates.
//
// 0119 (written, NOT applied) creates the real table. When it lands, migrating is one INSERT…SELECT
// over rows whose raw_text starts with the prefix.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sendSms } from "@/lib/greek-chapters.functions";

type DB = { from: (t: string) => any };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const PREFIX = "[CAMPUS REP]";
const ADMIN_EMAILS = ["lee@surviveaccounting.com", "king@surviveaccounting.com"];

export const REP_STATUSES = ["new", "contacted", "approved", "declined"] as const;
export type RepStatus = (typeof REP_STATUSES)[number];

export type RepApplication = {
  id: string;
  name: string; email: string; phone: string;
  schoolSlug: string; schoolName: string;
  year: string; greek: string; pitch: string;
  status: RepStatus; note: string;
  submittedAt: string;
};

type Envelope = Omit<RepApplication, "id">;

export const submitRepInterest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    phone: z.string().trim().min(7).max(24),
    schoolSlug: z.string().trim().min(1).max(80),
    schoolName: z.string().trim().min(1).max(120),
    year: z.string().trim().min(1).max(40),
    greek: z.string().trim().max(120).optional(),
    pitch: z.string().trim().max(600).optional(),
    // WORK AUTHORISATION IS ENFORCED SERVER-SIDE TOO. The client refuses to submit without it, but
    // a required checkbox that only exists in the browser is not a control — and this one exists to
    // keep us from soliciting work an F-1 student cannot legally do off-campus.
    authorized: z.literal(true),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const db = await admin();
      const env: Envelope = {
        name: data.name, email: data.email, phone: data.phone,
        schoolSlug: data.schoolSlug, schoolName: data.schoolName,
        year: data.year, greek: data.greek ?? "", pitch: data.pitch ?? "",
        status: "new", note: "",
        submittedAt: new Date().toISOString(),
      };
      const { error } = await db.from("referrals").insert({
        raw_text: `${PREFIX} ${JSON.stringify(env)}`,
        referrer_email: data.email,
        ok_to_name: true,
      });
      // The row is the durable record — a failure here IS the failure, unlike the alert below.
      if (error) return { ok: false, error: error.message };

      const to = process.env.FOUNDER_ALERT_PHONE ?? "";
      if (to) {
        // Best-effort: losing an application because a text failed would be strictly worse than
        // Lee reading it in the admin list.
        void sendSms(to, `⚡ CAMPUS REP\n${data.name} · ${data.schoolName}\nsurviveaccounting.com/outreach/reps`).catch(() => {});
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

async function isAdmin(db: DB, accessToken: string): Promise<boolean> {
  try {
    const { data } = await (db as unknown as { auth: { getUser: (t: string) => Promise<{ data: { user: { email?: string | null } | null } }> } }).auth.getUser(accessToken);
    const e = (data?.user?.email ?? "").toLowerCase();
    return !!e && ADMIN_EMAILS.includes(e);
  } catch { return false; }
}

const parse = (row: { id: string; raw_text: string | null }): RepApplication | null => {
  const t = row.raw_text ?? "";
  if (!t.startsWith(PREFIX)) return null;
  try {
    const env = JSON.parse(t.slice(PREFIX.length).trim()) as Envelope;
    return { id: row.id, ...env, status: (REP_STATUSES as readonly string[]).includes(env.status) ? env.status : "new" };
  } catch { return null; }
};

/** Null (not []) for a non-admin — the caller shows "sign in", which is a different thing from
 *  "no applications yet". */
export const listRepApplications = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<RepApplication[] | null> => {
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) return null;
    const { data: rows } = await db.from("referrals")
      .select("id,raw_text").like("raw_text", `${PREFIX}%`).order("created_at", { ascending: false }).limit(500);
    return ((rows ?? []) as Array<{ id: string; raw_text: string | null }>)
      .map(parse).filter(Boolean) as RepApplication[];
  });

/** Update status and/or note. Read-modify-write on the one row's envelope. */
export const setRepStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    id: z.string().uuid(),
    status: z.enum(REP_STATUSES).optional(),
    note: z.string().trim().max(600).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) return { ok: false };
    const { data: row } = await db.from("referrals").select("id,raw_text").eq("id", data.id).maybeSingle();
    const cur = row ? parse(row as { id: string; raw_text: string | null }) : null;
    if (!cur) return { ok: false };
    const { id: _id, ...env } = { ...cur, status: data.status ?? cur.status, note: data.note ?? cur.note };
    const { error } = await db.from("referrals")
      .update({ raw_text: `${PREFIX} ${JSON.stringify(env)}` }).eq("id", data.id);
    return { ok: !error };
  });
