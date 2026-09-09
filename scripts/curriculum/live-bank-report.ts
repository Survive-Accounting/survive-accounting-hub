import { createClient } from "@supabase/supabase-js";
import { loadDecksDeduped } from "../../src/lib/student.functions";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: ch } = await db.from("chapters").select("id,chapter_name,chapter_number");
const chBy = new Map((ch ?? []).map((c: any) => [c.id, c]));
const owned = await loadDecksDeduped(db as never);
const rows = [...owned.values()].map((o) => { const d = o.deck as any; const c = chBy.get(d.topicId); const q = o.nodes.filter((n: any) => !n.data?.noteOnly && !n.data?.bankArchived && n.data?.provenance !== "blast-off").length; return { topicNum: c?.chapter_number ?? 9999, topic: c?.chapter_name ?? (d.topicId ? "?" + String(d.topicId).slice(0, 8) : "(none)"), sort: d.sortOrder ?? 9999, id: d.id, name: d.name, status: d.status, parked: !!d.parked, q }; });
rows.sort((a, b) => a.topicNum - b.topicNum || a.sort - b.sort || a.id.localeCompare(b.id));
for (const r of rows) console.log(`${String(r.topicNum).padStart(4)} ${r.topic.padEnd(30)} #${String(r.sort).padEnd(4)} ${r.id.padEnd(18)} ${(r.status + (r.parked ? "/parked" : "")).padEnd(16)} ${String(r.q).padStart(3)}q  ${r.name}`);
