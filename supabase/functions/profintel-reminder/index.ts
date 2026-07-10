// profintel-reminder — sends a one-off reminder email via Resend. Triggered by
// pg_cron (x-cron-secret) with a JSON body {to, subject, body}. Generic enough
// to reuse for any dated operator reminder. Secrets: RESEND_API_KEY, CRON_SECRET.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const FROM = "Lee Ingram <lee@mail.surviveaccounting.com>";
const REPLY_TO = "lee@surviveaccounting.com";

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), { status: 500 });
  }
  const { to, subject, body } = await req.json().catch(() => ({}) as Record<string, string>);
  if (!to || !subject || !body) {
    return new Response(JSON.stringify({ error: "to/subject/body required" }), { status: 400 });
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, text: body }),
  });
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  if (!res.ok) {
    return new Response(JSON.stringify({ error: `resend ${res.status}`, detail: j }), { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true, id: j.id }), {
    headers: { "Content-Type": "application/json" },
  });
});
