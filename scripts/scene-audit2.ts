// RECON 2 (read-only): why do 154 CEQ nodes probe as deckless? Sample them.
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const rows: any[] = await (
  await fetch(`${url}/rest/v1/canvas_scenes?select=id,name,nodes_json`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
).json();
const nj = rows[0].nodes_json;
const nodes: any[] = nj.nodes;
const ceqs = nodes.filter((n) => n.type === "ceq" || n?.data?.kind === "ceq");
const withDeck = ceqs.filter((n) => n?.data?.deckId);
console.log(`ceq nodes: ${ceqs.length}  with data.deckId: ${withDeck.length}`);

// distinct deckIds among ceq nodes vs the decks[] list
const deckIds = new Set(nj.decks.map((d: any) => d.id));
const refIds = new Set(withDeck.map((n) => n.data.deckId));
console.log(`decks[] ids: ${deckIds.size}, referenced deckIds: ${refIds.size}`);
console.log(`referenced-but-not-in-decks[]:`, [...refIds].filter((i) => !deckIds.has(i as string)));

// sample 3 deckless ceqs — full data keys + a few values
for (const n of ceqs.filter((x) => !x?.data?.deckId).slice(0, 3)) {
  const d = n.data || {};
  console.log(`\nDECKLESS ${n.id} type=${n.type} parent=${n.parentId || n.parentNode || "-"}`);
  console.log(`  keys: ${Object.keys(d).join(",")}`);
  console.log(`  title=${JSON.stringify(d.title).slice(0, 60)} prompt=${JSON.stringify(d.prompt).slice(0, 60)}`);
  console.log(`  deckMember=${d.deckMember} tucked=${d.tucked} deckLessonId=${d.deckLessonId} shorthand=${JSON.stringify(d.shorthand)}`);
}

// member counts per referenced deck
const counts = new Map<string, number>();
for (const n of withDeck) counts.set(n.data.deckId, (counts.get(n.data.deckId) || 0) + 1);
console.log("\nmember counts:", [...counts.entries()].map(([k, v]) => `${k}=${v}`).join(" "));
