// King's daily digest cron — plain-text email with his numbers + a dashboard link.
// Same DST-pair pattern as the weekly digest: two UTC schedules registered in
// vercel.json (13:00 + 14:00), and the handler only sends when the current Chicago
// hour is 8 — exactly one fires at 8am CT year-round.
//
// QUIET BY DESIGN. It only emails when something changed since the last digest —
// new confirmed sends, replies, seat purchases, conversions, or an earnings change.
// A day where nothing happened produces no email; the digest should feel like news,
// never like noise.
//
// AUTH — `Authorization: Bearer <CRON_SECRET>`; fails closed when unset. POST
// bypasses the hour gate and the activity gate (manual testing); GET enforces both.
import { createFileRoute } from "@tanstack/react-router";
import { composeKingDigest, computeKingComp, KING_EMAIL } from "@/lib/growth-comp.functions";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function chicagoHour(now: Date): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).format(now);
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

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from: (t: string) => any };

  const { data: settingsRow } = await db
    .from("site_settings")
    .select("id,settings")
    .limit(1)
    .maybeSingle();
  const lastSentAt: string | null = settingsRow?.settings?.kingDigest?.lastSentAt ?? null;
  const lastTotal: number | null = settingsRow?.settings?.kingDigest?.lastKingTotalCents ?? null;

  const view = await computeKingComp(db);

  if (!manual) {
    // Anything new since the last digest? Confirmed sends, DMs, replies, or money moved.
    const since = lastSentAt ?? new Date(Date.now() - 7 * 864e5).toISOString();
    const { data: recent } = await db
      .from("growth_outreach_events")
      .select("id,channel,direction,status,message_id,occurred_at")
      .gte("occurred_at", since)
      .limit(50);
    const activity = ((recent ?? []) as any[]).some(
      (e) =>
        (e.channel === "email" && e.direction === "outbound" && e.message_id) ||
        e.channel === "ig_dm" ||
        e.direction === "inbound" ||
        e.status === "replied",
    );
    const moneyMoved = lastTotal == null || view.summary.kingTotalCents !== lastTotal;
    if (!activity && !moneyMoved) return json({ skipped: "nothing new since last digest" });
  }

  const digest = composeKingDigest(view);
  const { sendResendEmail } = await import("@/lib/email.server");
  const res = await sendResendEmail({ to: KING_EMAIL, subject: digest.subject, text: digest.text });
  if (!res.ok) return json({ error: res.error ?? "send failed" }, 500);

  if (settingsRow) {
    await db
      .from("site_settings")
      .update({
        settings: {
          ...settingsRow.settings,
          kingDigest: {
            lastSentAt: new Date().toISOString(),
            lastKingTotalCents: view.summary.kingTotalCents,
          },
        },
      })
      .eq("id", settingsRow.id);
  }
  return json({ ok: true, sent: KING_EMAIL, subject: digest.subject });
}

export const Route = createFileRoute("/api/cron/king-digest")({
  server: { handlers: { GET: handle, POST: handle } },
} as never);
