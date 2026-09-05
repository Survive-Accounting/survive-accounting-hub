// THE DAILY IG DIGEST — cron entry. How many Instagram handles were added yesterday, the
// totals on file, and how much of the outreach universe is covered — texted AND emailed to
// Lee at 8am Chicago (Lee, 2026-09-05).
//
// "Total Org IG's" / "Total Personal IG's" (Lee, 2026-09-05, after asking whether 3,178 was
// real): every handle in growth_contact_qc belongs to an ORGANIZATION (a chapter, council or
// club's own account) — even a row for a named officer or advisor carries that org's account,
// never a personal one. So org handles are counted DISTINCT (normalized: case, @, the
// instagram.com/ prefix, a trailing slash) so one chapter with three contact rows counts
// once, and personal is reported honestly as 0 rather than invented.
//
// "Covered vs remaining" is out of what we have TOUCHED at all (any contact row for that
// campus or org), not out of every campus or org that exists — that would make the
// percentage measure how big Greek life is, not how much of our own work is done.
//
// Same DST-pair pattern as the other daily crons: two UTC schedules in vercel.json (13:00 and
// 14:00) and the handler only sends when the Chicago hour is 8 — exactly one fires year-round.
// Daily even when the answer is zero: it is a pulse, not an alert.
//
// AUTH — `Authorization: Bearer <CRON_SECRET>`; fails closed when unset. POST bypasses the hour
// gate for manual testing (and accepts ?day=YYYY-MM-DD to re-send any day).
import { createFileRoute } from "@tanstack/react-router";

import { chicagoYesterday, composeIgDigest, zoneMidnightUtc } from "@/lib/ig-digest";
import { normalizeHandle } from "@/lib/find-contacts-shared";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function chicagoHour(now: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(now);
  return Number(s) % 24;
}

function authorize(request: Request): { ok: true } | { ok: false; res: Response } {
  const configured = process.env.CRON_SECRET || "";
  if (!configured) return { ok: false, res: json({ error: "CRON_SECRET not configured" }, 503) };
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== configured) return { ok: false, res: json({ error: "Unauthorized" }, 401) };
  return { ok: true };
}

interface Row { campus_id: string | null; entity_id: string | null; instagram: string | null; qc_by: string | null; created_at: string }

async function handle({ request }: { request: Request }): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) return auth.res;
  const manual = request.method === "POST";
  if (!manual && chicagoHour(new Date()) !== 8) return json({ skipped: "not 8am Chicago" });

  const override = new URL(request.url).searchParams.get("day");
  const day = override && /^\d{4}-\d{2}-\d{2}$/.test(override)
    ? { ymd: override, label: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(override + "T12:00:00Z")) }
    : chicagoYesterday(new Date());
  const start = zoneMidnightUtc(day.ymd, "America/Chicago");
  const end = new Date(start.getTime() + 864e5);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from: (t: string) => any };

  // ONE full, paged read of the table — small enough today (a few thousand rows) that pulling
  // every row once is simpler and cheaper than several separate aggregate queries, and it is
  // what makes "yesterday's rows" and "everything on file" self-consistent by construction.
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("growth_contact_qc").select("campus_id,entity_id,instagram,qc_by,created_at").range(from, from + 999);
    if (error) return json({ error: error.message }, 500);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  // YESTERDAY: new IG handles found in the Chicago day, by campus and by who found them.
  const yesterday = rows.filter((r) => r.instagram && r.created_at >= start.toISOString() && r.created_at < end.toISOString());
  const perCampus = new Map<string, number>(), perWho = new Map<string, number>();
  for (const r of yesterday) {
    if (r.campus_id) perCampus.set(r.campus_id, (perCampus.get(r.campus_id) ?? 0) + 1);
    const who = (r.qc_by || "unknown").toLowerCase();
    perWho.set(who, (perWho.get(who) ?? 0) + 1);
  }

  // TOTALS ON FILE: org handles counted once per distinct handle, wherever it appears.
  const orgHandles = new Set<string>();
  for (const r of rows) { const h = normalizeHandle(r.instagram); if (h) orgHandles.add(h); }
  const totalOrgIgs = orgHandles.size;
  // Personal handles: none exist in this table today — every row's instagram is an org's own
  // account (see the file header). Reported as 0, not guessed at, until that changes.
  const totalPersonalIgs = 0;

  // COVERAGE: campuses and orgs TOUCHED at all (any contact row), vs. how many of those have
  // landed at least one IG.
  const campusesTouched = new Set<string>(), campusesWithIg = new Set<string>();
  const orgsTouched = new Set<string>(), orgsWithIg = new Set<string>();
  for (const r of rows) {
    if (r.campus_id) { campusesTouched.add(r.campus_id); if (r.instagram) campusesWithIg.add(r.campus_id); }
    if (r.entity_id) { orgsTouched.add(r.entity_id); if (r.instagram) orgsWithIg.add(r.entity_id); }
  }

  const ids = [...perCampus.keys()];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: cs } = await db.from("campuses").select("id,name,display_name").in("id", ids);
    for (const c of (cs ?? []) as { id: string; name: string; display_name: string | null }[]) names.set(c.id, c.display_name || c.name);
  }
  const digest = composeIgDigest({
    dayLabel: day.label,
    byCampus: [...perCampus.entries()].map(([id, n]) => ({ campus: names.get(id) ?? id.slice(0, 8), n })).sort((a, b) => b.n - a.n || a.campus.localeCompare(b.campus)),
    byWho: [...perWho.entries()].map(([who, n]) => ({ who, n })).sort((a, b) => b.n - a.n),
    totalOrgIgs, totalPersonalIgs,
    campusesCovered: campusesWithIg.size, campusesTotal: campusesTouched.size,
    orgsCovered: orgsWithIg.size, orgsTotal: orgsTouched.size,
    dashboardUrl: "https://surviveaccounting.com/admin/growth/coldoutreach",
  });

  const { FOUNDER_EMAIL, FOUNDER_PHONE } = await import("@/lib/comms/send.server");
  const { sendResendEmail } = await import("@/lib/email.server");
  const email = await sendResendEmail({ to: FOUNDER_EMAIL, subject: digest.subject, text: digest.text });
  let sms: { ok: boolean; error?: string } = { ok: false, error: "no founder phone (FOUNDER_ALERT_PHONE / LEE_PERSONAL_PHONE)" };
  if (FOUNDER_PHONE) {
    const { sendSms } = await import("@/lib/greek-chapters.functions");
    sms = await sendSms(FOUNDER_PHONE, digest.sms);
  }
  const ok = email.ok || sms.ok;
  return json({ ok, day: day.ymd, total: digest.total, email: email.ok ? "sent" : email.error, sms: sms.ok ? "sent" : sms.error, subject: digest.subject }, ok ? 200 : 500);
}

export const Route = createFileRoute("/api/cron/ig-digest")({
  server: { handlers: { GET: handle, POST: handle } },
});
