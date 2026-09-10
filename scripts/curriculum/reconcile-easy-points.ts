// EASY POINTS, TO LEE'S OUTLINE — the Account classification splits named, and its offshoots
// hung off the split he wrote them under.
//
// Lee, 2026-09-10, verbatim:
//   5 Types of Accounts (5 cram path, 10 offshoot)
//     Assets      → Current vs. Long Term
//     Liabilities → Current vs. Long Term · Payables vs. Receivables · Unearned Revenue explanation
//     Equity      → Contra accounts offshoot here. A/D, Dividends, ADA
//     Revenues    → Understanding when revenue occurs (recog. principle)
//     Expenses    → when expenses occur (recog. principle) · PP's vs Exps · Depreciation expense
//                   example, SL method · Land isn't depreciated
//
// What this does, and nothing else:
//   1. Names splits 4 and 5 of Account classification "Revenues" and "Expenses" (they were "").
//   2. Renames / re-hangs the seeded offshoots that match his outline; mints the ones that don't
//      exist; parks the one his outline folded into another ("Dividends and A/D are none of
//      these" → Contra accounts); moves "Double-entry bookkeeping" (not in his outline, and
//      equation material) under Accounting equation effects.
//   3. Sets branchOrder 0..9 in his order, so the map's production numbers read top to bottom.
//
// IDEMPOTENT — a second run finds everything already in place and writes nothing.
//
//   bun scripts/curriculum/reconcile-easy-points.ts --dry
//   bun scripts/curriculum/reconcile-easy-points.ts
import { createClient } from "@supabase/supabase-js";

import { loadDecksDeduped } from "../../src/lib/student.functions";
import { planFramesForShort } from "../../src/lib/strategy.functions";

const DRY = process.argv.includes("--dry");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ACCOUNT_CLASS = "deck-e1s-2-1";
const EQUATION = "deck-e1s-2-2";
const SPLIT_NAMES = ["Assets", "Liabilities", "Equity", "Revenues", "Expenses"];

/** Each offshoot in Lee's order. `was` = the seeded name to rename/re-hang (matched
 *  case-insensitively by prefix); absent = mint. */
interface Want { take: string; name: string; blurb: string; was?: string }
const WANT: Want[] = [
  { take: "Assets", was: "Current vs. long-term", name: "Current vs. long-term assets", blurb: "The one-year line, and why it changes where an asset sits." },
  { take: "Liabilities", name: "Current vs. long-term liabilities", blurb: "The one-year line on the other side of the sheet, and when a long-term note turns current." },
  { take: "Liabilities", name: "Payables vs. receivables", blurb: "Payable means you owe. Receivable means you're owed. Which side each one lands on." },
  { take: "Liabilities", name: "Unearned revenue, explained", blurb: "Cash came in before the work. Why that's a liability and not revenue yet." },
  { take: "Equity", was: "Contra accounts", name: "Contra accounts", blurb: "Accumulated depreciation, dividends, allowance for doubtful accounts: the accounts that run the other way." },
  { take: "Revenues", name: "When revenue happens: the recognition principle", blurb: "Earned when the work is done, not when the cash shows up." },
  { take: "Expenses", name: "When expenses happen: the recognition principle", blurb: "Matched to the revenue they helped earn, not to when you paid." },
  { take: "Expenses", was: "Prepaids vs. expenses", name: "Prepaids vs. expenses — seeing the difference", blurb: "When you pay, is it an asset or a cost? The word that decides it." },
  { take: "Expenses", name: "Depreciation expense: a straight-line example", blurb: "Cost minus salvage, over useful life. One asset, one year, one entry." },
  { take: "Expenses", was: "Land isn't depreciated", name: "Land isn't depreciated — and what accumulated depreciation tracks", blurb: "Land doesn't depreciate. Here's what the contra account is actually tracking." },
];
/** Folded into Contra accounts by his outline. Parked, never deleted. */
const PARK_PREFIX = "Dividends and Accumulated Depreciation";
/** Not in his outline; equation material. Re-hung under Accounting equation effects. */
const MOVE_PREFIX = "Double-entry bookkeeping";

type Frame = { id?: string; cutAfter?: unknown; skipped?: unknown; takeName?: unknown };
type Deck = Record<string, unknown> & { id: string; name?: string; branchFrom?: string; branchTakeHead?: string; branchOrder?: number; blurb?: string; parked?: boolean; topicId?: string | null; courseId?: string | null; blastOff?: { frames?: Frame[] } };

/** The head frames of a plan's takes, in order — the way plan.ts planTakes cuts them. */
function heads(deck: Deck): Frame[] {
  const frames = (deck.blastOff?.frames ?? []).filter((f) => f?.skipped !== true);
  const out: Frame[] = [];
  let head: Frame | null = null;
  for (const f of frames) {
    if (!head) { head = f; out.push(f); }
    if (f.cutAfter === true) head = null;
  }
  return out;
}

const owned = await loadDecksDeduped(db as never);
const norm = (s: string) => s.trim().toLowerCase();
const startsWith = (name: string | undefined, prefix: string) => norm(name ?? "").startsWith(norm(prefix));
let writes = 0;

async function patchScene(sceneId: string, mutate: (decks: Deck[]) => boolean, what: string): Promise<void> {
  console.log(`${DRY ? "would " : ""}${what}`);
  if (DRY) { writes += 1; return; }
  const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", sceneId).single();
  if (error) throw new Error(error.message);
  const j = row.nodes_json as { decks?: Deck[] };
  if (!mutate(j.decks ?? [])) throw new Error(`${what}: deck not in scene ${sceneId}`);
  const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", sceneId);
  if (up.error) throw new Error(up.error.message);
  writes += 1;
}

async function patchDeck(id: string, patch: Record<string, unknown>, what: string): Promise<void> {
  const o = owned.get(id);
  if (!o) throw new Error(`${id} not found`);
  const cur = o.deck as Deck;
  const same = Object.entries(patch).every(([k, v]) => JSON.stringify(cur[k]) === JSON.stringify(v));
  if (same) { console.log(`  = ${what}`); return; }
  await patchScene(o.sceneId, (decks) => {
    const d = decks.find((x) => x.id === id);
    if (!d) return false;
    Object.assign(d, patch, { updatedAt: new Date().toISOString() });
    return true;
  }, `${what} ${JSON.stringify(patch)}`);
}

// 1. The five splits, named.
const parentOwned = owned.get(ACCOUNT_CLASS);
if (!parentOwned) throw new Error("Account classification not found");
const parent = parentOwned.deck as Deck;
const hs = heads(parent);
if (hs.length !== SPLIT_NAMES.length) throw new Error(`Account classification has ${hs.length} splits, expected ${SPLIT_NAMES.length} — name them on /v3/post first`);
const toName = hs.map((h, i) => [h, SPLIT_NAMES[i]] as const).filter(([h, n]) => typeof h.takeName !== "string" || !h.takeName.trim() ? true : norm(h.takeName) !== norm(n));
for (const [h, n] of toName) {
  if (typeof h.takeName === "string" && h.takeName.trim()) throw new Error(`split "${h.takeName}" is where "${n}" should be — stopping rather than renaming a split Lee named`);
}
if (toName.length) {
  await patchScene(parentOwned.sceneId, (decks) => {
    const d = decks.find((x) => x.id === ACCOUNT_CLASS);
    if (!d?.blastOff?.frames) return false;
    for (const [h, n] of toName) { const f = d.blastOff.frames.find((x) => x.id === h.id); if (f) f.takeName = n; }
    return true;
  }, `name splits: ${toName.map(([h, n]) => `${h.id} → ${n}`).join(", ")}`);
  for (const [h, n] of toName) h.takeName = n;
} else console.log("  = splits already named");
const headByName = new Map(hs.map((h) => [norm(String(h.takeName)), h.id as string]));

// 2. The offshoots.
const children = [...owned.values()].map((o) => o.deck as Deck).filter((d) => d.branchFrom === ACCOUNT_CLASS && d.parked !== true && (d as { lane?: string }).lane === "offshoot");
const claimed = new Set<string>();
for (let i = 0; i < WANT.length; i += 1) {
  const w = WANT[i];
  const head = headByName.get(norm(w.take));
  if (!head) throw new Error(`no split named ${w.take}`);
  // Exact name first, THEN the seeded prefix — and never a sibling that already carries one of
  // the outline's names, so a deck renamed on the first run is not mistaken for the one still
  // waiting to be renamed on the second.
  const free = children.filter((d) => !claimed.has(d.id));
  const carriesOutlineName = (d: Deck) => WANT.some((o) => norm(o.name) === norm(d.name ?? ""));
  const existing = free.find((d) => norm(d.name ?? "") === norm(w.name))
    ?? (w.was ? free.find((d) => startsWith(d.name, w.was!) && !carriesOutlineName(d)) : undefined);
  if (existing) {
    claimed.add(existing.id);
    await patchDeck(existing.id, { name: w.name, blurb: w.blurb, branchTakeHead: head, branchOrder: i }, `#${i} ${w.take} · ${w.name}`);
    continue;
  }
  console.log(`${DRY ? "would mint" : "mint"} #${i} ${w.take} · ${w.name}`);
  writes += 1;
  if (DRY) continue;
  const now = new Date().toISOString();
  const id = `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const frames = planFramesForShort({ title: w.name, context: {}, body: w.blurb });
  const deck = {
    id, name: w.name, payloadType: "cards", filter: null, runMode: "sequence", lessonId: null, slots: [], showSkeletons: true,
    createdAt: now, updatedAt: now, status: "live", parked: false, access: "free",
    topicId: parent.topicId ?? null, courseId: parent.courseId ?? null,
    lane: "offshoot", branchFrom: ACCOUNT_CLASS, branchTakeHead: head, branchOrder: i, blurb: w.blurb,
    blastOff: { frames, updatedAt: now, layout: "pass2" },
  };
  const { error } = await db.from("canvas_scenes").insert({
    name: `Offshoot · ${w.name} · off ${parent.name ?? ACCOUNT_CLASS}`,
    chapter_id: parent.topicId ?? null,
    nodes_json: { nodes: [], edges: [], zones: [], decks: [deck], branch: true },
    viewport_json: { x: 0, y: 0, zoom: 1 },
  });
  if (error) throw new Error(error.message);
}

// 3. The two his outline doesn't have.
for (const d of children) {
  if (claimed.has(d.id)) continue;
  if (startsWith(d.name, PARK_PREFIX)) { await patchDeck(d.id, { parked: true }, `park (folded into Contra accounts) · ${d.name}`); continue; }
  if (startsWith(d.name, MOVE_PREFIX)) { await patchDeck(d.id, { branchFrom: EQUATION, branchTakeHead: undefined, branchOrder: 2 }, `move under Accounting equation effects · ${d.name}`); continue; }
  console.log(`  ? left alone (not in the outline): ${d.name}`);
}

console.log(`\n${DRY ? "DRY RUN — " : ""}${writes} write${writes === 1 ? "" : "s"}`);
