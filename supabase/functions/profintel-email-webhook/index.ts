// profintel-email-webhook — receives Resend event webhooks for ProfIntel sends
// and records opens, clicks, and bounces/complaints. Matches by resend_message_id.
// Auth: a shared secret in the URL query (?secret=…), configured on the Resend
// webhook endpoint. Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// PROFINTEL_WEBHOOK_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("PROFINTEL_WEBHOOK_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!SECRET || url.searchParams.get("secret") !== SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const evt = await req.json().catch(() => null);
  if (!evt) return new Response(JSON.stringify({ error: "bad payload" }), { status: 400 });

  const type: string = evt.type ?? "";
  // Resend puts the email id at data.email_id (opens/clicks/bounces).
  const emailId: string | null = evt.data?.email_id ?? evt.data?.id ?? null;
  if (!emailId) return new Response(JSON.stringify({ ignored: "no email_id" }), { headers: { "Content-Type": "application/json" } });

  if (type === "email.opened") {
    const { data: row } = await admin
      .from("profintel_sends")
      .select("id, opened_at, open_count")
      .eq("resend_message_id", emailId)
      .maybeSingle();
    if (row) {
      await admin
        .from("profintel_sends")
        .update({ opened_at: row.opened_at ?? new Date().toISOString(), open_count: (row.open_count ?? 0) + 1 })
        .eq("id", row.id);
    }
  } else if (type === "email.clicked") {
    // Requires click tracking enabled on the Resend domain. data.click.link holds
    // the clicked URL. Record first-click time, total clicks, and the last URL.
    const link: string | null = evt.data?.click?.link ?? evt.data?.link ?? null;
    const { data: row } = await admin
      .from("profintel_sends")
      .select("id, clicked_at, click_count")
      .eq("resend_message_id", emailId)
      .maybeSingle();
    if (row) {
      await admin
        .from("profintel_sends")
        .update({
          clicked_at: row.clicked_at ?? new Date().toISOString(),
          click_count: (row.click_count ?? 0) + 1,
          last_clicked_url: link,
        })
        .eq("id", row.id);
    }
  } else if (type === "email.bounced" || type === "email.complained") {
    await admin.from("profintel_sends").update({ send_error: type }).eq("resend_message_id", emailId);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
