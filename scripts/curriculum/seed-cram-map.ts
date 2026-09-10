// SEED THE CRAM MAP — the v3 wireframe, written into the bank as real decks.
//
// Lee, 2026-09-10: "Do another cram map v4... but put it in the UI we're building so I can then go
// in and mess with it." So every offshoot and pitch the wireframe proposed becomes a zero-card
// deck on its lane, hanging off its parent (and its split where the parent's plan names one),
// with a one-line blurb and a production order — exactly what mintBranch on /v3/map writes, so
// the map can rename, re-attach, reorder or park any of them from here on.
//
// Also, on Lee's word: Principles & Vocab reorders to financial vs. managerial → internal vs.
// external → principles → regs, and Accounting careers moves to the offshoot lane.
//
// IDEMPOTENT: a branch already present by (parent, name) is skipped, so this can run again after
// he has arranged things without undoing his arrangement. Zero-card decks never reach /learn.
//
//   bun scripts/curriculum/seed-cram-map.ts --dry      # print the plan, write nothing
//   bun scripts/curriculum/seed-cram-map.ts            # write
import { createClient } from "@supabase/supabase-js";

import { loadDecksDeduped } from "../../src/lib/student.functions";
import { planFramesForShort } from "../../src/lib/strategy.functions";

const DRY = process.argv.includes("--dry");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** A branch to mint: name, parent deck id, the parent's split BY NAME (resolved to its head frame
 *  id from the plan at run time — never a bare index), a blurb, and its order among siblings. */
interface Seed { lane: "offshoot" | "pitch"; parent: string; take?: string; name: string; blurb: string }

const P = {
  accountClass: "deck-e1s-2-1", equation: "deck-e1s-2-2", debitCredit: "deck-e1s-3-1", normal: "deck-e1s-3-3", cycle: "deck-e1s-1-1",
  jeFormat: "deck-e1s-3-2", posting: "deck-e1s-3-4",
  defVsAcc: "deck-e1s-4-1", deferrals: "deck-e1s-4-2", accruals: "deck-e1s-4-3", adjTB: "deck-e1s-4-4", tbErrors: "deck-e1s-4-5",
  stmtClass: "deck-e1s-5-1", fsFormats: "deck-e1s-5-2", fsOrder: "deck-e1s-5-3", endingRE: "deck-e1s-5-4",
  toClose: "deck-e1s-6-1", closing: "deck-e1s-6-2", closeNI: "deck-e1s-6-3", postClose: "deck-e1s-6-4",
  intExt: "deck-e1s-1-2", finMgr: "deck-e1s-1-3", principles: "deck-e1s-1-4", standards: "deck-e1s-1-5", careers: "deck-e1s-1-6",
};

const SEEDS: Seed[] = [
  // ── Easy Points
  { lane: "offshoot", parent: P.accountClass, take: "Assets", name: "Land isn't depreciated — and what accumulated depreciation tracks", blurb: "Land doesn't depreciate. Here's what the contra account is actually tracking." },
  { lane: "offshoot", parent: P.accountClass, take: "Assets", name: "Contra accounts", blurb: "Accumulated depreciation and dividends: the accounts that run the other way." },
  { lane: "offshoot", parent: P.accountClass, take: "Assets", name: "Current vs. long-term", blurb: "The one-year line, and why it changes where an account sits." },
  { lane: "offshoot", parent: P.accountClass, take: "Assets", name: "Prepaids vs. expenses — seeing the difference", blurb: "When you pay, is it an asset or a cost? The word that decides it." },
  { lane: "offshoot", parent: P.accountClass, take: "Equity", name: "Dividends and Accumulated Depreciation are \"none of these\"", blurb: "The two trap answers on the account-type question." },
  { lane: "offshoot", parent: P.accountClass, name: "Double-entry bookkeeping", blurb: "Every transaction has equal and opposite effects in at least two accounts." },
  { lane: "offshoot", parent: P.equation, name: "Why A = L + E — and Luca Pacioli", blurb: "Where the equation came from, and why it can't not balance." },
  { lane: "offshoot", parent: P.equation, name: "Why revenue flows into equity", blurb: "The Rev arrow disappears into E — what that animation is saying." },
  { lane: "offshoot", parent: P.debitCredit, name: "Debits & credits: what they are NOT", blurb: "Not a debit card. Not always an increase. Not receiving. Start with what they aren't." },
  { lane: "offshoot", parent: P.normal, name: "Ending balance of a T-account", blurb: "Foot it, net it, side it — the ending balance from a T-account." },
  // ── Recording Journal Entries
  { lane: "offshoot", parent: P.jeFormat, name: "Getting the formatting right", blurb: "Debits left, credits indented, dated, at least one of each — where marks get lost." },
  { lane: "offshoot", parent: P.jeFormat, name: "Reading a transaction like a sentence", blurb: "The skill under every journal entry question." },
  { lane: "offshoot", parent: P.posting, name: "Cash or assets? Investing non-cash into a business", blurb: "$12,000 cash and a $3,000 computer for common stock." },
  { lane: "offshoot", parent: P.posting, name: "Partial payments and \"on account\"", blurb: "$600 on the equipment, $50 on the services — what changes and what doesn't." },
  { lane: "offshoot", parent: P.posting, name: "Building an unadjusted trial balance from your T-accounts", blurb: "From eight transactions to $16,000 cash — the whole walk." },
  // ── Adjusting Entries
  { lane: "offshoot", parent: P.defVsAcc, name: "Cash vs. accrual accounting", blurb: "The idea the whole topic rests on." },
  { lane: "offshoot", parent: P.defVsAcc, name: "Why adjusting entries exist at all", blurb: "Seven questions against one trial balance: do we really have $9,000 in supplies?" },
  { lane: "offshoot", parent: P.deferrals, name: "\"Remains\" vs. \"used\" — the word that flips the answer", blurb: "And unexpired vs. expired. The WHAT IF INSTEAD twins." },
  { lane: "offshoot", parent: P.deferrals, name: "When unearned revenue needs no adjustment", blurb: "The event tickets: sold Dec 15, event Jan 5 — nothing to adjust." },
  { lane: "offshoot", parent: P.accruals, name: "Year-end falls on a Wednesday", blurb: "Five employees, seven hours, $20 an hour — and the unpaid-holiday twist." },
  { lane: "offshoot", parent: P.tbErrors, name: "The errors a trial balance can't catch", blurb: "It balances and it's still wrong. Which mistakes hide." },
  // ── Financial Statements
  { lane: "offshoot", parent: P.stmtClass, name: "Temporary = closed. Permanent = not closed.", blurb: "Same answer set, two questions — the equivalence the exam tests both ways." },
  { lane: "offshoot", parent: P.stmtClass, name: "How the four statements connect", blurb: "Net loss flows to retained earnings flows to the balance sheet." },
  { lane: "offshoot", parent: P.fsFormats, name: "\"Snapshot\" vs. \"for the period\" — the header tells you which", blurb: "Three exam questions, one 45-second answer." },
  { lane: "offshoot", parent: P.endingRE, name: "Retained earnings vs. cash — nothing alike", blurb: "The misconception behind half the errors." },
  // ── Closing Entries
  { lane: "offshoot", parent: P.toClose, name: "Why we close at all", blurb: "Temporary vs. permanent, properly." },
  { lane: "offshoot", parent: P.toClose, name: "Income Summary is \"none of these\"", blurb: "Only used for closing — and its balance tells you profit or loss." },
  // ── Principles & Vocab
  { lane: "offshoot", parent: P.standards, name: "Enron, WorldCom, and why SOX exists", blurb: "Response to major accounting fraud — the story behind the acronym." },
  { lane: "offshoot", parent: P.standards, name: "What a CPA is, and what an audit is", blurb: "Two definitions, career-adjacent." },
  { lane: "offshoot", parent: P.principles, name: "Materiality — a $200,000 building vs. printer paper", blurb: "Your own example, verbatim." },
  // ── Pitches
  { lane: "pitch", parent: P.accountClass, name: "Easy Points is free", blurb: "Fifteen seconds. It's free. Here's where." },
  { lane: "pitch", parent: P.cycle, name: "Your chapter can have this", blurb: "We partner with fraternities and sororities. Here's how it starts." },
  { lane: "pitch", parent: P.posting, name: "We're hiring campus reps", blurb: "Fifteen seconds on what a rep does and how you get paid." },
  { lane: "pitch", parent: P.standards, name: "My background — and what else I build", blurb: "Startups, no-code, fundraising — drop your email if you want that too." },
];

/** Principles & Vocab, in the order Lee wants the last topic to run. */
const PV_ORDER: [string, number][] = [[P.finMgr, 1], [P.intExt, 2], [P.principles, 3], [P.standards, 4], [P.careers, 5]];

/** The head frame id of a named split in a parent's saved plan — computed the way plan.ts
 *  planTakes does, over the frames that would film. */
function headOf(deck: { blastOff?: { frames?: { id?: string; cutAfter?: unknown; skipped?: unknown; takeName?: unknown }[] } }, takeName: string): string | null {
  const frames = (deck.blastOff?.frames ?? []).filter((f) => f?.skipped !== true);
  let head: typeof frames[number] | null = null;
  for (const f of frames) {
    if (!head) head = f;
    if (head && typeof head.takeName === "string" && head.takeName.trim().toLowerCase() === takeName.toLowerCase()) return head.id ?? null;
    if (f.cutAfter === true) head = null;
  }
  return null;
}

const owned = await loadDecksDeduped(db as never);
const norm = (s: string) => s.trim().toLowerCase();
let minted = 0, skipped = 0, updated = 0;

// 1. Principles & Vocab order, and Careers onto the offshoot lane.
for (const [id, sortOrder] of PV_ORDER) {
  const o = owned.get(id);
  if (!o) { console.log(`  !! ${id} not found — skipping order`); continue; }
  const patch: Record<string, unknown> = { sortOrder };
  if (id === P.careers) { patch.lane = "offshoot"; patch.branchFrom = P.principles; }
  console.log(`${DRY ? "would set" : "set"} ${id} ${JSON.stringify(patch)}`);
  if (DRY) continue;
  const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
  if (error) throw new Error(error.message);
  const j = row.nodes_json as { decks?: Record<string, unknown>[] };
  const deck = (j.decks ?? []).find((d) => d.id === id);
  if (!deck) throw new Error(`${id} not in its scene`);
  Object.assign(deck, patch, { updatedAt: new Date().toISOString() });
  const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
  if (up.error) throw new Error(up.error.message);
  updated += 1;
}

// 2. The branches.
const orderByParentSide = new Map<string, number>();
for (const s of SEEDS) {
  const key = `${s.parent}:${s.lane}`;
  const branchOrder = orderByParentSide.get(key) ?? 0;
  orderByParentSide.set(key, branchOrder + 1);

  const parent = owned.get(s.parent);
  if (!parent) { console.log(`  !! parent ${s.parent} not found — skipping "${s.name}"`); continue; }
  const pd = parent.deck as { name?: string; topicId?: string | null; courseId?: string | null; blastOff?: { frames?: { id?: string; cutAfter?: unknown; skipped?: unknown; takeName?: unknown }[] } };

  const exists = [...owned.values()].some((o) => { const d = o.deck as { name?: string; branchFrom?: string; parked?: boolean }; return d.branchFrom === s.parent && norm(d.name ?? "") === norm(s.name) && d.parked !== true; });
  if (exists) { skipped += 1; console.log(`  = exists  ${s.name}`); continue; }

  let branchTakeHead: string | undefined;
  if (s.take) {
    const h = headOf(pd, s.take);
    if (h) branchTakeHead = h; else console.log(`  ?  "${s.take}" is not a named split of ${pd.name} yet — hanging off the whole set`);
  }

  console.log(`${DRY ? "would mint" : "mint"} [${s.lane}] #${branchOrder} ${s.name}  ← ${pd.name}${branchTakeHead ? ` / ${s.take}` : ""}`);
  if (DRY) { minted += 1; continue; }

  const now = new Date().toISOString();
  const id = `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const frames = planFramesForShort({ title: s.name, context: {}, body: s.blurb });
  const deck = {
    id, name: s.name, payloadType: "cards", filter: null, runMode: "sequence", lessonId: null, slots: [], showSkeletons: true,
    createdAt: now, updatedAt: now, status: "live", parked: false, access: "free",
    topicId: pd.topicId ?? null, courseId: pd.courseId ?? null,
    lane: s.lane, branchFrom: s.parent, branchOrder, blurb: s.blurb,
    ...(branchTakeHead ? { branchTakeHead } : {}),
    blastOff: { frames, updatedAt: now, layout: "pass2" },
  };
  const { error } = await db.from("canvas_scenes").insert({
    name: `${s.lane === "pitch" ? "Pitch" : "Offshoot"} · ${s.name} · off ${pd.name ?? s.parent}`,
    chapter_id: pd.topicId ?? null,
    nodes_json: { nodes: [], edges: [], zones: [], decks: [deck], branch: true },
    viewport_json: { x: 0, y: 0, zoom: 1 },
  });
  if (error) throw new Error(error.message);
  minted += 1;
}

console.log(`\n${DRY ? "DRY RUN — " : ""}minted ${minted} · already there ${skipped} · decks updated ${updated}`);
