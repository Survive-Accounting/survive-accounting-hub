// BANK AUDIT (D1 investigation, 2026-08-28) — read-only. Maps every question
// store in the DB so BANK-DIFF.md names files/tables from evidence, not guesses.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key);

const { data: rows, error } = await db
  .from("canvas_scenes")
  .select("id,name,updated_at,nodes_json")
  .order("updated_at", { ascending: true });
if (error) throw new Error(error.message);

interface Node { id: string; type?: string; data?: Record<string, unknown> }
let totalScenes = 0;
const summaries: string[] = [];
for (const r of rows ?? []) {
  const j = r.nodes_json as { setFile?: boolean; workspace?: boolean; archived?: boolean; decks?: { id: string; name: string }[]; nodes?: Node[] } | null;
  if (!j) continue;
  totalScenes++;
  const decks = (j.decks ?? []) as { id: string; name: string; status?: string; parked?: boolean; topicId?: string; payloadType?: string }[];
  const nodes = j.nodes ?? [];
  const kind = j.workspace ? "WORKSPACE" : j.setFile ? "SETFILE" : "SCENE";
  const arch = j.archived ? " ARCHIVED" : "";
  for (const d of decks) {
    const cards = nodes.filter((n) => n.type === "ceq" && (n.data as { deckId?: string } | undefined)?.deckId === d.id);
    const live = cards.filter((n) => !(n.data as { draft?: boolean } | undefined)?.draft);
    summaries.push(`${kind}${arch} row=${r.id.slice(0,8)} deck=${d.id.slice(0,26)} status=${d.status??"-"} parked=${d.parked?1:0} topic=${(d.topicId??"-").slice(0,10)} payload=${d.payloadType??"-"} ceqs=${cards.length} name="${d.name}"`);
  }
  if (!decks.length) summaries.push(`${kind}${arch} row=${r.id.slice(0, 8)} "${r.name}" (no decks) nodes=${nodes.length}`);
}
console.log(`scenes: ${totalScenes}`);
for (const s of summaries) console.log(s);

// Any OTHER question-shaped tables?
for (const t of ["student_sets", "ceqs", "questions", "exam1_questions", "topics"]) {
  const probe = await db.from(t).select("*", { count: "exact", head: true });
  console.log(`table ${t}: ${probe.error ? "absent (" + probe.error.code + ")" : "EXISTS count=" + probe.count}`);
}
