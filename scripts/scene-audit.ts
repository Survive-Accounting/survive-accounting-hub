// OVERNIGHT RECON (read-only): map every canvas_scene → its decks (sets), so the
// scene→set split plan can be written from real data, not guesses.
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const rows: any[] = await (
  await fetch(`${url}/rest/v1/canvas_scenes?select=id,name,folder_id,updated_at,nodes_json`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
).json();

if (!Array.isArray(rows)) { console.log("ERROR:", JSON.stringify(rows).slice(0, 300)); process.exit(1); }

for (const r of rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""))) {
  const nj = r.nodes_json || {};
  const decks: any[] = Array.isArray(nj.decks) ? nj.decks : [];
  const nodes: any[] = Array.isArray(nj.nodes) ? nj.nodes : [];
  const byKind: Record<string, number> = {};
  for (const n of nodes) {
    const k = n?.data?.kind || n?.type || "?";
    byKind[k] = (byKind[k] || 0) + 1;
  }
  const deckless = nodes.filter((n) => !n?.data?.deckId && n?.data?.kind === "ceq").length;
  console.log(`SCENE ${r.id}  "${r.name}"  updated=${(r.updated_at || "").slice(0, 10)}  nodes=${nodes.length}`);
  console.log(`  kinds: ${Object.entries(byKind).map(([k, v]) => `${k}:${v}`).join(" ")}`);
  console.log(`  decks (${decks.length}):`);
  for (const d of decks) {
    const members = nodes.filter((n) => n?.data?.deckId === d.id).length;
    console.log(`    - ${d.id}  "${d.name}"  status=${d.status || "?"} topic=${d.topicId || "-"} clips=${Array.isArray(d.takes) ? d.takes.length : (d.hookTake ? "hook" : 0)} members=${members}`);
  }
  if (deckless) console.log(`  !! ${deckless} CEQ nodes with NO deckId`);
  console.log("");
}
console.log(`TOTAL scenes: ${rows.length}`);
