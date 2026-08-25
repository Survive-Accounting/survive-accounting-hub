import { createClient } from "@supabase/supabase-js";
import { handleHasCampusSignal, campusAcronym } from "../../src/lib/growth-intel-extract";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const camp: any = JSON.parse(require("fs").readFileSync("scripts/growth-intel/campuses.json", "utf8")).campuses;
const ids = camp.map((c: any) => c.id);
// nickname/mascot supplements not derivable from official names
const NICK: Record<string, string[]> = {
  "b3af67c6-99a5-4677-83d5-aa7d11a89c17": ["bama", "alabama", "crimson", "rolltide"],
  "3f570e37-5394-4058-baab-508948befedb": ["uga", "georgia", "dawg", "dawgs"],
  "e330e87c-5467-4c05-9d3d-6cd2398de036": ["auburn", "aubie", "wareagle"],
  "972451c3-bc5e-48d7-9f88-868a55378efa": ["vandy", "vanderbilt", "dores", "commodore"],
  "1e6b6504-3a9c-44e2-81a9-ee961f66563a": ["osu", "ohiostate", "buckeye", "buckeyes"],
  "faad6039-be72-4f5c-8ad5-ca7b95e2889f": ["texas", "utexas", "longhorn", "hookem", "utaustin"],
  "0b7532ee-e905-4012-b835-ab99faf022d6": ["howard", "bison"],
  "405335e8-8bb7-4d03-96d2-6d9fb0415684": ["mtsu", "raiders", "blueraider", "blueraiders"],
  "42c3eddd-939e-48ae-ba21-2d04bdadb84e": ["fau", "owls", "atlantic"],
};
const { data: campuses } = await db.from("campuses").select("id,name,short_name,slug").in("id", ids);
const stop = new Set(["university", "college", "the", "of", "at", "and", "state", "school"]);
const clean2 = (s: string) => (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const sigFor = (id: string) => {
  const c: any = (campuses ?? []).find((x: any) => x.id === id) ?? {};
  const toks = clean2(c.name).split(" ").filter((w) => w.length >= 4 && !stop.has(w));
  const ac = campusAcronym(c.name || "");
  const slug = String(c.slug || "").split("-").filter((w) => w.length >= 4 && !stop.has(w));
  return [...new Set([...toks, ...(ac.length >= 3 ? [ac] : []), ...slug, ...(NICK[id] || [])])];
};
const { data } = await db.from("growth_public_contacts").select("id,campus_id,instagram_url").eq("entity_type", "chapter").eq("contact_type", "social_account").in("campus_id", ids);
const rows = (data ?? []) as any[];
let dropped = 0;
for (const r of rows) {
  const handle = String(r.instagram_url).replace(/^https?:\/\/instagram\.com\//, "");
  if (!handleHasCampusSignal(handle, sigFor(r.campus_id))) {
    await db.from("growth_public_contacts").delete().eq("id", r.id);
    dropped++;
  }
}
console.log(`chapter IG rows: ${rows.length} -> ${rows.length - dropped} kept (${dropped} national/foreign/garbage dropped)`);
