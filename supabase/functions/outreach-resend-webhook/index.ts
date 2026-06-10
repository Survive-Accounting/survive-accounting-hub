// Resend webhook → updates outreach_leads counters and logs events.
// Configure JWT verification off in supabase/config.toml.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, svix-id, svix-signature, svix-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const evt = await req.json();
    const type: string = evt?.type ?? "";
    const data = evt?.data ?? {};
    const messageId: string | undefined = data?.email_id ?? data?.id;
    const tags = Array.isArray(data?.tags) ? data.tags : [];
    const leadId: string | undefined =
      tags.find((t: any) => t?.name === "lead_id")?.value;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    await admin.from("outreach_email_events").insert({
      lead_id: leadId ?? null,
      message_id: messageId ?? null,
      event_type: type,
      payload: evt,
    });

    if (!leadId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_lead_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const patch: Record<string, any> = {};

    if (type === "email.delivered") patch.delivered_at = now;
    else if (type === "email.opened") {
      patch.first_opened_at = now;
      // increment opens_count via RPC-like read-modify-write
      const { data: lead } = await admin
        .from("outreach_leads").select("opens_count, first_opened_at").eq("id", leadId).single();
      patch.opens_count = (lead?.opens_count ?? 0) + 1;
      if (lead?.first_opened_at) delete patch.first_opened_at;
    } else if (type === "email.clicked") {
      patch.first_clicked_at = now;
      const { data: lead } = await admin
        .from("outreach_leads").select("clicks_count, first_clicked_at").eq("id", leadId).single();
      patch.clicks_count = (lead?.clicks_count ?? 0) + 1;
      if (lead?.first_clicked_at) delete patch.first_clicked_at;
    } else if (type === "email.bounced") {
      patch.bounced_at = now;
      patch.status = "bounced";
    } else if (type === "email.complained") {
      patch.complained_at = now;
      patch.status = "complained";
    }

    if (Object.keys(patch).length > 0) {
      await admin.from("outreach_leads").update(patch).eq("id", leadId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
