import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function cnt(t: string, col?: string, val?: string) {
  let b = db.from(t).select("*", { count: "exact", head: true });
  if (col) b = b.eq(col, val);
  const { count } = await b;
  return count ?? 0;
}
const ch = await cnt("growth_discovery_status", "category", "chapter");
const wib = await cnt("growth_discovery_status", "category", "women_in_business");
const cc = await cnt("growth_public_contacts", "entity_type", "chapter");
const cl = await cnt("growth_business_clubs");
const { data: run } = await db.from("growth_discovery_runs").select("est_cost_usd,serp_calls,firecrawl_calls,ai_calls,status,campuses_done").eq("created_by", "continuous").order("started_at", { ascending: false }).limit(1).maybeSingle();
console.log(`STATUS chapter_status=${ch} wib=${wib}/162 chapter_contacts=${cc} clubs=${cl} campuses_done=${run?.campuses_done ?? 0} cost=$${run?.est_cost_usd ?? 0} serp=${run?.serp_calls ?? 0} fc=${run?.firecrawl_calls ?? 0} ai=${run?.ai_calls ?? 0}`);
