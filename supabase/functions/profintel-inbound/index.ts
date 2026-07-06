// profintel-inbound — records replies to ProfIntel emails. An inbound-email
// provider (Resend inbound, or a forwarder) POSTs the parsed reply here; we match
// the sender to the most recent 'sent' ProfIntel email to that professor and set
// replied_at. Auth: shared secret in the URL query (?secret=…). Secrets:
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PROFINTEL_INBOUND_SECRET.
//
// NOTE: email replies do NOT flow through Resend's send events — capturing them
// needs an inbound mailbox (MX + provider webhook). Until that's configured,
// reply % stays 0; the "mark replied" control in the UI is the manual fallback.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("PROFINTEL_INBOUND_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function extractEmail(s: unknown): string | null {
  const m = String(s ?? "").match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/);
  return m ? m[0].toLowerCase() : null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!SECRET || url.searchParams.get("secret") !== SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const evt = await req.json().catch(() => null);
  if (!evt) return new Response(JSON.stringify({ error: "bad payload" }), { status: 400 });

  // Inbound payload shapes vary by provider — try the common "from" locations.
  const from =
    extractEmail(evt.from) ??
    extractEmail(evt.data?.from) ??
    extractEmail(evt.envelope?.from) ??
    extractEmail(evt.sender);
  if (!from) return new Response(JSON.stringify({ ignored: "no sender" }), { headers: { "Content-Type": "application/json" } });

  const { data: row } = await admin
    .from("profintel_sends")
    .select("id, replied_at")
    .eq("to_email", from)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (row && !row.replied_at) {
    await admin.from("profintel_sends").update({ replied_at: new Date().toISOString() }).eq("id", row.id);
  }

  return new Response(JSON.stringify({ ok: true, matched: !!row }), { headers: { "Content-Type": "application/json" } });
});
