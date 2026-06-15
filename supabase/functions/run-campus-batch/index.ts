// run-campus-batch — background worker. Called every minute by pg_cron
// (or manually from the UI). Picks up to N pending campus_research_job_items,
// runs the full pipeline (profile → leads → prefix probe → sections) for
// each in parallel, updates the row, returns counts.
//
// Designed to be idempotent: claims items with a status update before work,
// so the next tick won't double-process. Updates the parent job_row counts
// after every item finishes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function invokeFn(name: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: String((e as Error)?.message ?? e) } };
  }
}

async function processItem(db: any, item: any) {
  const campus_id = item.campus_id;
  const patch: Record<string, unknown> = { status: "running", started_at: new Date().toISOString() };
  await db.from("campus_research_job_items").update(patch).eq("id", item.id);

  let profile_done = item.profile_done ?? false;
  let leads_count = item.leads_count ?? 0;
  let sections_count = item.sections_count ?? 0;
  let families_with_zero: string[] = [];
  let failed_step: string | null = null;
  let error: string | null = null;

  const step = async (name: string, work: () => Promise<{ ok: boolean; status: number; data: any }>) => {
    await db.from("campus_research_job_items").update({ current_step: name }).eq("id", item.id);
    const r = await work();
    if (!r.ok) {
      failed_step = name;
      error = `${name}: HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 400)}`;
    }
    return r;
  };

  // 1. Campus profile — research-campus expects school_name/state, not campus_id
  if (!profile_done) {
    const { data: campus } = await db
      .from("campuses")
      .select("school_name, state, course_codes")
      .eq("id", campus_id)
      .maybeSingle();
    if (!campus?.school_name) {
      failed_step = "profile";
      error = `profile: campus ${campus_id} not found or missing school_name`;
    } else {
      const r = await step("profile", () => invokeFn("research-campus", {
        school_name: campus.school_name,
        state: campus.state ?? "",
        course_codes: campus.course_codes ?? [],
      }));
      if (r.ok) profile_done = true;
    }
  }

  // 2. Suggested leads (continue even if profile failed)
  if (!error) {
    const r = await step("leads", () => invokeFn("research-campus-leads", { campus_id }));
    if (r.ok) {
      const n = r.data?.created ?? r.data?.suggestions_created ?? r.data?.inserted ?? 0;
      leads_count = typeof n === "number" ? n : leads_count;
    }
  }

  // 3. Prefix probe (cheap, makes sections better)
  if (!error) {
    await step("prefixes", () => invokeFn("discover-campus-prefixes", { campus_id }));
    // Non-blocking — even if it fails, sections still falls back to generic hints.
    error = null; failed_step = null;
  }

  // 4. Sections (the expensive one)
  if (!error) {
    const r = await step("sections", () => invokeFn("research-campus-sections", { campus_id }));
    if (r.ok) {
      sections_count = r.data?.sections_inserted ?? 0;
      const counts = r.data?.debug?.per_family_counts ?? {};
      const allFams = ["intro_1","intro_2","intermediate_1","intermediate_2","finance","business_stats","business_analytics","microeconomics","macroeconomics"];
      families_with_zero = allFams.filter((f) => !counts[f]);
    }
  }

  const finalStatus = error ? "failed" : "done";
  await db.from("campus_research_job_items").update({
    status: finalStatus,
    current_step: null,
    profile_done,
    leads_count,
    sections_count,
    families_with_zero,
    error,
    failed_step,
    finished_at: new Date().toISOString(),
  }).eq("id", item.id);

  return finalStatus;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Supabase env not configured" }, 500);

  let body: { batch_size?: number; job_id?: string } = {};
  try { body = await req.json(); } catch { /* allow empty body */ }
  const batchSize = Math.max(1, Math.min(5, body.batch_size ?? 3));

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Find an active job, optionally filtered by job_id
  let jobQuery = db.from("campus_research_jobs").select("*").eq("status", "running").order("created_at", { ascending: true }).limit(1);
  if (body.job_id) jobQuery = db.from("campus_research_jobs").select("*").eq("id", body.job_id).limit(1);
  const { data: jobs } = await jobQuery;
  const job = jobs?.[0];
  if (!job) return json({ success: true, message: "no active job", picked: 0 });
  if (job.status !== "running") return json({ success: true, message: `job status=${job.status}`, picked: 0 });

  // Pick pending items
  const { data: pending } = await db
    .from("campus_research_job_items")
    .select("*")
    .eq("job_id", job.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  const items = pending ?? [];
  if (!items.length) {
    // Check if job is done (all items terminal)
    const { count: remaining } = await db
      .from("campus_research_job_items")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .in("status", ["pending", "running"]);
    if (!remaining) {
      await db.from("campus_research_jobs")
        .update({ status: "done", finished_at: new Date().toISOString() })
        .eq("id", job.id);
      return json({ success: true, message: "job complete", picked: 0 });
    }
    return json({ success: true, message: "no pending items (still running)", picked: 0 });
  }

  // Claim items (set running) before doing work
  const ids = items.map((i) => i.id);
  await db.from("campus_research_job_items")
    .update({ status: "running", started_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending");

  // Process in parallel
  const results = await Promise.allSettled(items.map((i) => processItem(db, i)));

  // Update parent job counts
  const { count: doneCount } = await db
    .from("campus_research_job_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id)
    .eq("status", "done");
  const { count: failedCount } = await db
    .from("campus_research_job_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id)
    .eq("status", "failed");

  await db.from("campus_research_jobs").update({
    done_count: doneCount ?? 0,
    failed_count: failedCount ?? 0,
  }).eq("id", job.id);

  return json({
    success: true,
    job_id: job.id,
    picked: items.length,
    results: results.map((r) => r.status === "fulfilled" ? r.value : "error"),
  });
});
