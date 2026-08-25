import { createClient } from "@supabase/supabase-js";
import { normalizeClubName, sourceRank } from "../../src/lib/growth-intel-extract";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const camp: any = JSON.parse(require("fs").readFileSync("scripts/growth-intel/campuses.json", "utf8")).campuses;
const ids = camp.map((c: any) => c.id);
const nameOf = (id: string) => camp.find((c: any) => c.id === id)?.name ?? "";
const { data } = await db.from("growth_business_clubs").select("id,campus_id,category,name,normalized_name,confidence,source_type").in("campus_id", ids);
const rows = (data ?? []) as any[];
const confRank = (c: string) => (c === "high" ? 0 : c === "medium" ? 1 : 2);
const groups = new Map<string, any[]>();
for (const r of rows) { const nn = normalizeClubName(r.name, nameOf(r.campus_id)); r._nn = nn; const k = `${r.campus_id}|${r.category}|${nn}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
let deleted = 0, updated = 0;
for (const [, g] of groups) {
  g.sort((a: any, b: any) => sourceRank(a.source_type) - sourceRank(b.source_type) || confRank(a.confidence) - confRank(b.confidence));
  for (const l of g.slice(1)) { await db.from("growth_business_clubs").delete().eq("id", l.id); deleted++; console.log("  dropped dup:", nameOf(l.campus_id).slice(0, 18), "|", l.name); }
  const keeper = g[0];
  if (keeper._nn !== keeper.normalized_name) { await db.from("growth_business_clubs").update({ normalized_name: keeper._nn }).eq("id", keeper.id); updated++; }
}
console.log(`dedup: ${rows.length} rows -> ${rows.length - deleted} kept (${deleted} dup deleted, ${updated} renormalized)`);
