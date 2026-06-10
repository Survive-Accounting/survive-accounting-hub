// Daily scheduler: finds outreach leads due for a follow-up and dispatches
// them via outreach-send-email. Steps 1/2/3 fire at +7/+14/+21 days from
// the previous step. Skips any lead whose sequence has been stopped
// (replied / bounced / complained) or that is past step 3.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAY = 24 * 60 * 60 * 1000;
const PER_RUN_CAP = 200;       // safety cap across all steps per invocation
const CHUNK = 10;              // small chunks → friendlier to Resend
const CHUNK_DELAY_MS = 800;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = !!body?.dry_run;
    const cap: number = Math.min(Number(body?.limit) || PER_RUN_CAP, 500);

    const now = Date.now();
    const cutoff = (days: number) => new Date(now - days * DAY).toISOString();

    // Build candidate sets for each step.
    // Step N requires step N-1 to have been sent ≥7d ago, step N not yet sent,
    // sequence not stopped, and an active template exists for the kind.
    const dispatched: Array<{ lead_id: string; step: 1 | 2 | 3 }> = [];

    const fetchDue = async (step: 1 | 2 | 3): Promise<string[]> => {
      const prevCol =
        step === 1 ? "sent_at"
        : step === 2 ? "follow_up_1_sent_at"
        : "follow_up_2_sent_at";
      const curCol =
        step === 1 ? "follow_up_1_sent_at"
        : step === 2 ? "follow_up_2_sent_at"
        : "follow_up_3_sent_at";

      const { data, error } = await admin
        .from("outreach_leads")
        .select(`id, ${prevCol}, ${curCol}, sequence_stopped_at, status`)
        .is("sequence_stopped_at", null)
        .is(curCol, null)
        .not(prevCol, "is", null)
        .lte(prevCol, cutoff(7))
        .not("status", "in", "(replied,bounced,complained)")
        .limit(cap);
      if (error) {
        console.error("fetchDue error", step, error.message);
        return [];
      }
      return (data ?? []).map((r: any) => r.id);
    };

    // Verify active templates exist for each step we plan to send.
    const { data: tplRows } = await admin
      .from("outreach_email_templates")
      .select("kind, is_active")
      .eq("is_active", true);
    const activeKinds = new Set((tplRows ?? []).map((r: any) => r.kind));

    let budget = cap;
    for (const step of [1, 2, 3] as const) {
      if (budget <= 0) break;
      if (!activeKinds.has(`follow_up_${step}`)) {
        console.warn(`Skipping step ${step}: no active template`);
        continue;
      }
      const ids = (await fetchDue(step)).slice(0, budget);
      for (const id of ids) dispatched.push({ lead_id: id, step });
      budget -= ids.length;
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        dry_run: true,
        would_send: dispatched.length,
        by_step: {
          1: dispatched.filter((d) => d.step === 1).length,
          2: dispatched.filter((d) => d.step === 2).length,
          3: dispatched.filter((d) => d.step === 3).length,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Dispatch one-by-one to outreach-send-email in small chunks with delays.
    const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/outreach-send-email`;
    const auth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const apikey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < dispatched.length; i += CHUNK) {
      const slice = dispatched.slice(i, i + CHUNK);
      await Promise.all(slice.map(async ({ lead_id, step }) => {
        try {
          const r = await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth, apikey },
            body: JSON.stringify({ lead_id, follow_up: step, sender_email: "lee@surviveaccounting.com" }),
          });
          if (r.ok) sent++; else { failed++; console.error("send failed", lead_id, step, r.status, await r.text().catch(() => "")); }
        } catch (e) {
          failed++;
          console.error("send threw", lead_id, step, (e as Error).message);
        }
      }));
      if (i + CHUNK < dispatched.length) await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }

    return new Response(JSON.stringify({
      queued: dispatched.length,
      sent,
      failed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
