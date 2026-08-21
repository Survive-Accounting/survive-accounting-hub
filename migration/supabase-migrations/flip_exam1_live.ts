// Pre-flight for the CEQ practice release (08-21): flip the Exam 1 sets LIVE, fill missing
// sortOrder, park the untitled 0-question library stubs. Edits DeckDef entries inside
// canvas_scenes.nodes_json — only in each deck's OWNING scene (newest scene wins, the same rule
// the student tree uses), so the stale workspace duplicates are never touched or served.
//
//   bun run migration/supabase-migrations/flip_exam1_live.ts            # dry run: prints the plan
//   bun run migration/supabase-migrations/flip_exam1_live.ts --apply    # writes
//
// NEEDS .env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).
// CLOBBER NOTE: close the Studio tab on these sets before --apply; an autosave from a stale tab
// would overwrite this write (see CLOBBER LAW in memory). Writes are per-scene, full nodes_json.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL0 = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!URL0 || !KEY) { console.error("Missing SUPABASE_URL / service key in .env"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const APPLY = process.argv.includes("--apply");
const EXAM1_CHAPTERS = [1, 2, 3, 6, 7, 8, 9];

type Deck = { id: string; name?: string; payloadType?: string; status?: string; topicId?: string | null; sortOrder?: number; parked?: boolean };
type Scene = { id: string; updated_at: string; nodes_json: { decks?: Deck[]; nodes?: { type?: string; data?: { deckId?: string; noteOnly?: boolean } }[] } };

const get = async (p: string) => { const r = await fetch(`${URL0}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json(); };

const courses = (await get("courses?select=id,course_name")) as { id: string; course_name: string }[];
const intro1 = courses.find((c) => /^intro 1$/i.test(c.course_name.trim()));
if (!intro1) { console.error("No 'Intro 1' course row found:", courses.map((c) => c.course_name)); process.exit(1); }
const chapters = (await get(`chapters?select=id,chapter_name,chapter_number&course_id=eq.${intro1.id}`)) as { id: string; chapter_name: string; chapter_number: number }[];
const exam1 = new Map(chapters.filter((c) => EXAM1_CHAPTERS.includes(c.chapter_number)).map((c) => [c.id, c]));
console.log(`Intro 1 = ${intro1.id}; Exam 1 chapters: ${[...exam1.values()].map((c) => `Ch${c.chapter_number} ${c.chapter_name}`).join(" · ")}`);

// Scenes newest-first; first owner of a deck id wins (same as loadDecksDeduped).
const scenes = (await get("canvas_scenes?select=id,updated_at,nodes_json&order=updated_at.desc&limit=200")) as Scene[];
const owner = new Map<string, Scene>();
const cardDecks = (s: Scene) => (s.nodes_json?.decks ?? []).filter((d) => d.payloadType === "cards").length;
// Per-set scenes (exactly one card deck) own first, then newest — identical to loadDecksDeduped.
for (const s of scenes.slice().sort((a, b) => (cardDecks(a) === 1 ? 0 : 1) - (cardDecks(b) === 1 ? 0 : 1))) for (const d of s.nodes_json?.decks ?? []) if (d.payloadType === "cards" && !owner.has(d.id)) owner.set(d.id, s);

// Plan per owning deck.
const qCount = (s: Scene, deckId: string) => (s.nodes_json.nodes ?? []).filter((n) => n.type === "ceq" && n.data?.deckId === deckId && !n.data?.noteOnly).length;
const byTopic = new Map<string, { deck: Deck; scene: Scene }[]>();
const plan: { scene: Scene; deck: Deck; change: string }[] = [];
for (const [id, s] of owner) {
  const d = s.nodes_json.decks!.find((x) => x.id === id)!;
  const qs = qCount(s, id);
  if (!d.topicId) {
    if (qs === 0 && d.parked !== true) { plan.push({ scene: s, deck: d, change: "PARK (no topic, 0 questions)" }); }
    continue;
  }
  const list = byTopic.get(d.topicId) ?? []; list.push({ deck: d, scene: s }); byTopic.set(d.topicId, list);
}
for (const [topicId, list] of byTopic) {
  // sortOrder: keep existing, fill gaps by name after the last assigned number.
  list.sort((a, b) => (a.deck.sortOrder ?? 1e9) - (b.deck.sortOrder ?? 1e9) || (a.deck.name ?? "").localeCompare(b.deck.name ?? ""));
  let next = Math.max(-1, ...list.map((x) => x.deck.sortOrder ?? -1)) + 1;
  for (const x of list) {
    const changes: string[] = [];
    if (x.deck.sortOrder == null) { changes.push(`sortOrder → ${next}`); (x.deck as Deck & { _newSort?: number })._newSort = next++; }
    if (exam1.has(topicId) && x.deck.status !== "live" && qCount(x.scene, x.deck.id) > 0) changes.push("status → live");
    if (changes.length) plan.push({ scene: x.scene, deck: x.deck, change: changes.join(", ") });
  }
}
const chName = (tid?: string | null) => { const c = chapters.find((x) => x.id === tid); return c ? `Ch${c.chapter_number} ${c.chapter_name}` : "(no topic)"; };
// NEVER write a multi-deck (workspace) scene: a write there could re-order ownership and serve
// stale copies. Stubs without a topic are dropped by the tree anyway (no resolvable course).
for (const p of plan.filter((x) => cardDecks(x.scene) !== 1)) console.log(`  SKIP (workspace scene, not written): ${p.deck.name} → ${p.change}`);
plan.splice(0, plan.length, ...plan.filter((x) => cardDecks(x.scene) === 1));
console.log(`\nPLAN (${plan.length} deck changes across ${new Set(plan.map((p) => p.scene.id)).size} scenes):`);
for (const p of plan) console.log(`  [${p.scene.id.slice(0, 8)}] ${chName(p.deck.topicId)} | ${p.deck.name} → ${p.change}`);

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply.");
} else {
  const touched = new Map<string, Scene>();
  for (const p of plan) {
    const d = p.deck as Deck & { _newSort?: number };
    if (p.change.includes("PARK")) d.parked = true;
    if (d._newSort != null) { d.sortOrder = d._newSort; delete d._newSort; }
    if (p.change.includes("status → live")) d.status = "live";
    touched.set(p.scene.id, p.scene);
  }
  for (const [id, s] of touched) {
    const r = await fetch(`${URL0}/rest/v1/canvas_scenes?id=eq.${id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ nodes_json: s.nodes_json }) });
    console.log(`  wrote scene ${id.slice(0, 8)}: ${r.status}`);
    if (!r.ok) { console.error(await r.text()); process.exit(1); }
  }
}

// Final counts per Exam 1 topic (what the student tree will serve), from the owning scenes.
console.log("\nEXAM 1 — live sets per topic (owning scenes):");
let sets = 0, qs = 0;
for (const c of [...exam1.values()].sort((a, b) => a.chapter_number - b.chapter_number)) {
  const list = (byTopic.get(c.id) ?? []).filter((x) => x.deck.status === "live" || (APPLY && plan.some((p) => p.deck.id === x.deck.id && p.change.includes("live")))).sort((a, b) => (a.deck.sortOrder ?? 0) - (b.deck.sortOrder ?? 0));
  const n = list.reduce((a, x) => a + qCount(x.scene, x.deck.id), 0);
  sets += list.length; qs += n;
  console.log(`  Ch${c.chapter_number} ${c.chapter_name}: ${list.length} sets · ${n} questions — ${list.map((x) => `${x.deck.sortOrder ?? "?"}:${x.deck.name} (${qCount(x.scene, x.deck.id)})`).join(" · ")}`);
}
console.log(`  TOTAL: ${exam1.size} topics · ${sets} sets · ${qs} questions`);
