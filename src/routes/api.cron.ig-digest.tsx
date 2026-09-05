// THE DAILY IG DIGEST — cron entry. How many Instagram handles were added yesterday, by
// campus and by who added them, texted AND emailed to Lee at 8am Chicago (Lee, 2026-09-05).
//
// Same DST-pair pattern as the other daily crons: two UTC schedules in vercel.json (13:00 and
// 14:00) and the handler only sends when the Chicago hour is 8 — exactly one fires year-round.
// Daily even when the answer is zero: it is a pulse, not an alert.
//
// AUTH — `Authorization: Bearer <CRON_SECRET>`; fails closed when unset. POST bypasses the hour
// gate for manual testing (and accepts ?day=YYYY-MM-DD to re-send any day).
import { createFileRoute } from "@tanstack/react-router";

import { chicagoYesterday, composeIgDigest, zoneMidnightUtc } from "@/lib/ig-digest";

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

  // Every row with a handle created in that Chicago day — paged, never the first thousand.
  const rows: { campus_id: string; qc_by: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("growth_contact_qc").select("campus_id,qc_by")
      .not("instagram", "is", null).gte("created_at", start.toISOString()).lt("created_at", end.toISOString())
      .order("created_at", { ascending: true }).range(from, from + 999);
    const page = (data ?? []) as { campus_id: string; qc_by: string | null }[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const { count: totalOnFile } = await db.from("growth_contact_qc").select("*", { count: "exact", head: true }).not("instagram", "is", null);

  const perCampus = new Map<string, number>(), perWho = new Map<string, number>();
  for (const r of rows) {
    perCampus.set(r.campus_id, (perCampus.get(r.campus_id) ?? 0) + 1);
    const who = (r.qc_by || "unknown").toLowerCase();
    perWho.set(who, (perWho.get(who) ?? 0) + 1);
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
    totalOnFile: totalOnFile ?? 0,
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
