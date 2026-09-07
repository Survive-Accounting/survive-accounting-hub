// THE MAP BRIEF — the Teaching Assistant that builds a cluster from brainstorming.
//
// Lee, 2026-09-07: "I want to be able to create these sorts of clusters with just brainstorming.
// I want to set it up where I tell the teaching assistant what I'm thinking, we go back and forth
// and refine if needed, to ensure we're on the same page, then it goes and builds the cluster
// for me. I make revisions if needed, etc. Eventually we want to reduce revisions as much as
// possible." And: "Some of these ideas may be better fit as part of a cluster. Others may be
// better fit as just a slide we add that's a list… I also can see clusters having a slide added
// to them… so like, the CEQ for example, that the cluster is connected to, or the cheat code."
//
// So THREE BRIEFS share ONE VOCABULARY:
//   1. the PLAN IN WORDS — what Lee said → 3–8 short lines (nodes, order, what each shot shows,
//      what he says) plus at most two clarifying questions. The back-and-forth happens here,
//      in prose, before any JSON exists — "ensure we're on the same page".
//   2. the SPEC — the agreed plan → the JSON a cluster frame stores, validated by the same
//      parseClusterSpec the frame schema uses; the caller retries ONCE with the error appended.
//   3. the REVISION — the spec + what he said → a FULL revised spec (simpler than a patch),
//      same validation, "change only what was asked, keep the ids".
//
// The vocabulary is generated from the code that owns the facts, never retyped: the node kinds
// from cluster-spec.ts, the account names from the registry (account-registry.ts — "the
// assistant must use THESE names"), the sides from rubric-model's signFor, the equation effects
// from the same rule equation-derive.ts uses. A list slide is a one-node map; students call the
// whole thing THE MAP.
//
// checkMapSpec is the accountant after the parser: warnings in words for what the schema can't
// see (an entry that doesn't balance, a name that isn't in the registry, arrows that disagree
// with the entry, a shot that reveals nothing, boxes on top of each other). Shown, not fatal.
//
// Pure: messages in, parsed answers out. No React, no network.
import { ACCOUNT_REGISTRY, accountByLabel, type AccountCategory } from "@/components/canvas/account-registry";
import { ACCT_TYPES, signFor, type AcctType } from "@/components/canvas/exhibit-lab/rubric-model";
import {
  CLUSTER_NODE_KINDS, PHONE, overviewCamera, parseClusterSpec, visibleAt,
  type ClusterNode, type ClusterNodeKind, type ClusterSpec, type EqDir,
} from "@/components/blastoff/cluster/cluster-spec";

// ---------------------------------------------------------------- what the assistant sees

/** The set, as the brief needs it — structural, so BoothSetInfo fits without importing it. */
export interface MapSetContext {
  name: string;
  ceqs: readonly { id: string; label: string; stem: string; noteOnly?: boolean; choices: readonly { text: string; correct: boolean }[] }[];
}

/** The card this map sits after, when there is one — the question it explains. */
export interface MapCard { ceqId: string; stem: string; choices: readonly { text: string; correct: boolean }[] }

/** One example map, as the spec brief renders it. */
export interface MapExample { title: string; spec: ClusterSpec }

/** The assistant's plan in words. */
export interface MapPlan { plan: string; questions: string[] }

// ---------------------------------------------------------------- the vocabulary

/** Sizing guidance in FIELD pixels (the phone is 1080 wide) — what a node needs to be legible
 *  at zoom 1, per kind. Entries and lists grow with their lines; the formulas are in the text. */
export const MAP_NODE_SIZE: Record<ClusterNodeKind, string> = {
  equation: "about 900 wide by 400 tall",
  accounts: "about 700 wide by 1200 tall for five groups (roughly 240 per group)",
  je: "about 900 wide by (160 + 110 per line) tall — two lines is 900 by 380",
  taccount: "about 420 by 420",
  tb: "about 800 wide by (120 + 60 per row) tall",
  ceq: "about 900 wide by 700 tall",
  callout: "about 900 wide by 500 tall",
  note: "about 900 wide by 160 tall",
};

const KIND_PARAGRAPH: Record<ClusterNodeKind, string> = {
  equation: `EQUATION — A = L + E with an arrow under each term. Use it when the point is the EFFECT of a transaction. data: {kind:"equation", arrows:{assets, liabilities, equity} each "up"|"down"|"both"|"none", caption?: one line ("Buy supplies on account"), extras?: up to 4 side terms like {label:"Rev", dir:"up", links:"equity"}}. Size ${MAP_NODE_SIZE.equation}.`,
  accounts: `ACCOUNTS — a grouped list (the five types of accounts, or any list). A LIST SLIDE IS A ONE-NODE MAP: when the idea is just a list, make one accounts node and reveal it group by group. data: {kind:"accounts", groups:[{label, accounts:[registry names], note?, normal?: "dr"|"cr"}] (1–8 groups), revealBy:"group"|"account"}. Size ${MAP_NODE_SIZE.accounts}.`,
  je: `JE — a journal entry, revealed a piece at a time (description, then each line's account, then its amount). data: {kind:"je", description, lines:[{account: registry name, dr?: number, cr?: number, type?: "A"|"L"|"E"|"R"|"X"}] (1–8 lines, debits first), badge?: "JE"|"ADJ"|"CL"}. Every line has exactly one of dr or cr; debits must equal credits. Size ${MAP_NODE_SIZE.je}.`,
  taccount: `TACCOUNT — one T-account. data: {kind:"taccount", account: registry name, normal:"dr"|"cr", opening?: number, posts?: [{label, amount, dr: boolean}], fromNodes?: [je node ids]}. Give fromNodes (and a "post" edge from the entry) instead of posts when the entry is on the map — the renderer posts it. Size ${MAP_NODE_SIZE.taccount}.`,
  tb: `TB — a trial balance. data: {kind:"tb", title?, rows?: [{account: registry name, dr?: number, cr?: number}], fromNodes?: [taccount node ids]}. Rows given must total the same on both sides. Size ${MAP_NODE_SIZE.tb}.`,
  ceq: `CEQ — one of the set's own cards, by id, so the map can carry the question it explains. data: {kind:"ceq", ceqId} — the id must be one of THE SET'S CARDS listed below. Size ${MAP_NODE_SIZE.ceq}.`,
  callout: `CALLOUT — a cheat code, a memorize-this phrase or a tip, exactly the Editor's kinds. data: {kind:"callout", calloutKind:"cheat"|"phrase"|"tip", title, text?, bullets?: [up to 8 short lines]}. Size ${MAP_NODE_SIZE.callout}.`,
  note: `NOTE — a short label or aside on the field. data: {kind:"note", text} (one line, under 240 characters). Size ${MAP_NODE_SIZE.note}.`,
};

const SHOT_RULES = [
  `SHOTS are the spacebar. A shot is {id, label?, camera:{x, y, zoom}, reveal:[...], note?}. camera x,y is the CENTRE of the 9:16 phone on the field; zoom 1 shows ${PHONE.w} by ${PHONE.h} field pixels, zoom 0.5 shows twice that. reveal lists what is VISIBLE by this shot — node ids, or "nodeId#k" for the first k pieces of an entry or a list (an entry's pieces: description = 1, then +2 per line; a list's pieces: its groups). Reveals are cumulative.`,
  `ONE IDEA PER SHOT: each shot reveals one new node, or the next piece(s) of one node — an entry's description, then one line at a time. A pair of T-accounts that one entry posts into may open together; that is one idea.`,
  `THE CAMERA FRAMES WHAT IT REVEALS: centre it on the node (x + w/2, y + h/2) and zoom so the node plus about 120 pixels of air fits the phone — zoom = min(1, ${PHONE.w} / (w + 240), ${PHONE.h} / (h + 240)). Never zoom past 1. When a shot reveals a piece of a node the camera stays on that node.`,
  `THE FIRST SHOT IS NEVER THE OVERVIEW. The last shot may be: centre of the field, zoom = min(${PHONE.w} / field.w, ${PHONE.h} / field.h), everything revealed.`,
  `note on a shot = what Lee says there, in his register: cram, not teach. One word to highlight, the cheat code, the answer, move on. No emoji anywhere.`,
];

const CATEGORY_TYPE: Record<AccountCategory, AcctType> = { asset: "A", liability: "L", equity: "E", revenue: "R", expense: "X" };
const CATEGORY_LABEL: Record<AccountCategory, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses" };
const CATEGORIES: readonly AccountCategory[] = ["asset", "liability", "equity", "revenue", "expense"];

/** The registry's names, by category — the only account names the assistant may use. */
export function registryNamesByCategory(): { category: AccountCategory; label: string; type: AcctType; names: string[] }[] {
  return CATEGORIES.map((c) => ({
    category: c, label: CATEGORY_LABEL[c], type: CATEGORY_TYPE[c],
    names: ACCOUNT_REGISTRY.filter((a) => a.category === c).map((a) => a.contra ? `${a.label} (contra)` : a.label),
  }));
}

function accountingRules(): string {
  const names = registryNamesByCategory().map((g) => `${g.label} (type ${g.type}): ${g.names.join(", ")}`).join("\n");
  const sides = ACCT_TYPES.map((t) => `${t.label} (${t.id}): up with a ${signFor(t.id, true)}, down with a ${signFor(t.id, false)}`).join("; ");
  return [
    `ACCOUNT NAMES — use exactly these, spelled exactly so (the registry). Nothing else, no abbreviations:\n${names}`,
    `WHICH SIDE: ${sides}. A contra account carries its category's opposite sign.`,
    `EQUATION EFFECT of a line: an asset debited moves Assets up, credited moves Assets down. A liability credited moves Liabilities up, debited down. Equity, Revenue and Expense all land on the Equity term of A = L + E: a credit to any of them moves Equity up, a debit moves Equity down (so an expense debited is Equity down; revenue credited is Equity up). A term touched both ways in one entry is "both"; untouched is "none". The equation node's arrows must match the entry on the same map.`,
  ].join("\n");
}

/** ONE VOCABULARY, read by all three briefs — every node kind, the shot rules, the accounting. */
export const MAP_VOCABULARY: string = [
  `THE MAP (a "cluster" in the JSON) is an interactive teaching exhibit on a vertical 9:16 phone. A playfield larger than the phone (field {w, h}; the default is 2160 by 3840; a one-node list slide may use ${PHONE.w} by ${PHONE.h}) holds typed NODES; EDGES are arrows between them; SHOTS are camera positions plus what has been revealed by then — the spacebar walks them. Students call it THE MAP.`,
  `A NODE is {id, x, y, w, h, title?, data}. x, y is the top-left on the field, w, h its size, all in field pixels; the phone is ${PHONE.w} wide, so a node meant to fill the screen at zoom 1 is at most about 900 wide. Nodes never overlap and stay inside the field. Lay them out top to bottom in teaching order with about 150 pixels between them.`,
  `NODE KINDS — ${CLUSTER_NODE_KINDS.join(", ")}:`,
  ...CLUSTER_NODE_KINDS.map((k) => KIND_PARAGRAPH[k]),
  `EDGES are {from, to, kind:"arrow"|"post"|"link", label?}: "post" from an entry to the T-account it posts into; "link" for a relation (an entry to its equation, a T-account to a trial balance); "arrow" for anything pointed. Both ends must be node ids.`,
  ...SHOT_RULES,
  accountingRules(),
].join("\n\n");

// ---------------------------------------------------------------- rendering the context

function renderSet(set: MapSetContext, max = 40): string {
  const cards = set.ceqs.slice(0, max).map((c) => `${c.id} — ${c.noteOnly ? "summary" : c.label}: ${c.stem.trim().slice(0, 140)}`);
  return `THE SET: ${set.name}\nTHE SET'S CARDS (ceqId — label: stem):\n${cards.join("\n") || "(none)"}`;
}

function renderCard(card: MapCard): string {
  const lines = [`Q (${card.ceqId}): ${card.stem.trim()}`];
  for (const c of card.choices) lines.push(`${c.correct ? "  [CORRECT] " : "  [ ] "}${c.text.trim()}`);
  return lines.join("\n");
}

/** An example map, compactly: the title, then its JSON with the whitespace squeezed out. */
export function renderExample(e: MapExample, i: number): string {
  return `Example ${i + 1} — "${e.title}":\n${JSON.stringify(e.spec)}`;
}

// ---------------------------------------------------------------- 1. the plan in words

export const MAP_PLAN_SYSTEM = [
  "You are the Teaching Assistant for Survive Accounting. Lee is brainstorming out loud about THE MAP he wants to film — an interactive exhibit walked shot by shot on a vertical phone. Your job in this step is to say back, in words, what you would build — so the two of you are on the same page BEFORE anything is built.",
  "Return ONLY a JSON object: {\"plan\": str, \"questions\": [str]}.",
  "\"plan\" = 3 to 8 short lines, one per line (newline-separated): which nodes, in what order; what each shot shows; what Lee says on each. Plain prose. Name the node kinds (equation, accounts, entry, T-account, trial balance, the card, a cheat code, a note) and the exact account names from the vocabulary. Numbers he gave are kept; numbers he didn't give are chosen sensibly and shown so he can change them.",
  "\"questions\" = at most TWO clarifying questions, only when something is genuinely ambiguous — a number, which account, whether to include the card. If nothing is ambiguous, an empty list. Never ask what you can decide.",
  "HIS REGISTER: cram, not teach. One word to highlight, the cheat code, the answer, move on. Short lines. No emoji. Do not explain accounting to Lee — he teaches it; say what you'll build.",
  "A LIST SLIDE IS A ONE-NODE MAP: when his idea is just a list (the five types, the steps of the cycle), plan one accounts node revealed group by group and say so. When the map explains one of THE SET'S CARDS, the card can be a node on the map — offer it if he hasn't said.",
  "When a PRIOR PLAN and his ANSWERS are given, revise that plan — keep what he didn't change, apply what he did, drop questions he has answered. Don't restart from scratch.",
  "THE VOCABULARY below is the truth about what a map can hold. Plan only what it can hold.",
].join("\n");

export interface MapPlanRequest {
  /** Everything Lee has said so far in this thread — his turns, oldest first. */
  brainstorm: string;
  set: MapSetContext;
  card?: MapCard;
  /** What he said and stamped about the card in Step 1 (rehearsal-context.ts). */
  talkthrough?: string;
  /** The plan he is answering, when this is a second turn. */
  priorPlan?: MapPlan;
}

export function buildMapPlanMessages(req: MapPlanRequest): { system: string; user: string } {
  const user = [
    renderSet(req.set),
    req.card ? `THE CARD THIS MAP SITS AFTER (the correct choice is marked):\n${renderCard(req.card)}` : "",
    req.talkthrough?.trim() ? `TALKTHROUGH NOTES (what Lee said about that card in Step 1):\n${req.talkthrough.trim()}` : "",
    req.priorPlan ? `PRIOR PLAN (yours, last turn):\n${req.priorPlan.plan}${req.priorPlan.questions.length ? `\nYOU ASKED:\n${req.priorPlan.questions.map((q) => `- ${q}`).join("\n")}` : ""}` : "",
    `${req.priorPlan ? "LEE'S BRAINSTORM SO FAR, WITH HIS ANSWERS LAST" : "LEE'S BRAINSTORM"}:\n${req.brainstorm.trim()}`,
    `THE VOCABULARY:\n${MAP_VOCABULARY}`,
  ].filter(Boolean).join("\n\n");
  return { system: MAP_PLAN_SYSTEM, user };
}

const firstJson = (text: string): string | null => text.match(/\{[\s\S]*\}/)?.[0] ?? null;
const clean = (v: unknown, cap: number): string => (typeof v === "string" ? v.trim().slice(0, cap) : "");

/** The plan answer, defended: null when no plan came back. Questions capped at two. */
export function parseMapPlan(text: string): MapPlan | null {
  const m = firstJson(text);
  if (!m) return null;
  let j: { plan?: unknown; questions?: unknown };
  try { j = JSON.parse(m); } catch { return null; }
  const plan = Array.isArray(j.plan) ? j.plan.map((l) => clean(l, 300)).filter(Boolean).join("\n") : clean(j.plan, 2400);
  if (!plan) return null;
  const questions = Array.isArray(j.questions) ? j.questions.map((q) => clean(q, 300)).filter(Boolean).slice(0, 2) : [];
  return { plan, questions };
}

// ---------------------------------------------------------------- 2. the spec

export const MAP_SPEC_SYSTEM = [
  "You are the Teaching Assistant for Survive Accounting. The plan for THE MAP is agreed; now build it. Return ONLY the JSON of the map — one object, no prose, no code fence, compact (no indentation).",
  "THE SHAPE: {\"version\": 1, \"id\": str, \"title\": str, \"field\": {\"w\", \"h\"}, \"nodes\": [...], \"edges\": [...], \"shots\": [...]} exactly as the vocabulary describes it. Node ids are short slugs (\"eq\", \"je\", \"t-cash\"). The map id is the one given.",
  "EVERY NODE HAS REAL COORDINATES on the field — x, y, w, h in field pixels, no overlaps, inside the field, laid out top to bottom in teaching order. Use the sizes the vocabulary gives per kind.",
  "SHOTS reference existing node ids only; every shot reveals something new; the camera frames what it reveals, computed by the formula in the vocabulary; the first shot is never the overview. Put what Lee says on each shot in its note, in his register.",
  "ACCOUNT NAMES are the registry's, spelled exactly. ENTRIES BALANCE (debits equal credits). THE EQUATION'S ARROWS MATCH THE ENTRY on the same map by the effect rule in the vocabulary. A trial balance's rows total the same both sides.",
  "Follow THE PLAN. Where the plan is silent, follow the EXAMPLES — they are real maps that validate; match their shape, not their content. No emoji anywhere.",
].join("\n");

export interface MapSpecRequest {
  plan: string;
  brainstorm: string;
  set: MapSetContext;
  examples: readonly MapExample[];
  card?: MapCard;
  /** The map id the spec must carry (the frame already has one). */
  id?: string;
  /** The error from the last attempt — the caller retries ONCE with it appended. */
  failure?: string;
}

export function buildMapSpecMessages(req: MapSpecRequest): { system: string; user: string } {
  const user = [
    `MAP ID: ${req.id ?? "map-new"}`,
    `THE PLAN (agreed with Lee):\n${req.plan.trim()}`,
    `LEE'S OWN WORDS, for the notes and any detail the plan left out:\n${req.brainstorm.trim()}`,
    req.card ? `THE CARD THIS MAP SITS AFTER (its ceqId is usable as a ceq node):\n${renderCard(req.card)}` : "",
    renderSet(req.set, 20),
    req.examples.length ? `EXAMPLES (real maps that validate):\n${req.examples.map(renderExample).join("\n\n")}` : "",
    `THE VOCABULARY:\n${MAP_VOCABULARY}`,
    req.failure ? `YOUR LAST ANSWER FAILED: ${req.failure}\nReturn the whole map again, fixed.` : "",
  ].filter(Boolean).join("\n\n");
  return { system: MAP_SPEC_SYSTEM, user };
}

/** The spec answer: the first JSON object in the text through parseClusterSpec. The id is
 *  pinned to `id` when given (the frame's map already has one; a model that invents another
 *  shouldn't fork it). */
export function parseMapSpec(text: string, id?: string): { spec: ClusterSpec; error: null } | { spec: null; error: string } {
  const m = firstJson(text);
  if (!m) return { spec: null, error: "no JSON object in the answer" };
  let raw: unknown;
  try { raw = JSON.parse(m); } catch (e) { return { spec: null, error: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
  if (id && raw && typeof raw === "object") (raw as { id?: unknown }).id = id;
  return parseClusterSpec(raw);
}

// ---------------------------------------------------------------- 3. the revision

export const MAP_REVISE_SYSTEM = [
  "You are the Teaching Assistant for Survive Accounting. Lee has looked at THE MAP you built and said what to change. Return ONLY the JSON of the WHOLE revised map — one object, no prose, no code fence, compact.",
  "CHANGE ONLY WHAT HE ASKED. Keep every node id, every shot id, the map id, the field and every coordinate he didn't ask you to move. A node he adds gets a new short id; a node he removes leaves with its edges and its reveals.",
  "Everything in the vocabulary still holds: real coordinates, no overlaps, registry names, balanced entries, arrows that match the entry, shots that each reveal something new and frame what they reveal. No emoji.",
].join("\n");

export interface MapReviseRequest { spec: ClusterSpec; spoken: string; failure?: string }

export function buildMapReviseMessages(req: MapReviseRequest): { system: string; user: string } {
  const user = [
    `THE MAP AS IT STANDS:\n${JSON.stringify(req.spec)}`,
    `WHAT LEE SAID TO CHANGE:\n${req.spoken.trim()}`,
    `THE VOCABULARY:\n${MAP_VOCABULARY}`,
    req.failure ? `YOUR LAST ANSWER FAILED: ${req.failure}\nReturn the whole map again, fixed.` : "",
  ].filter(Boolean).join("\n\n");
  return { system: MAP_REVISE_SYSTEM, user };
}

// ---------------------------------------------------------------- the accountant: checkMapSpec

type Bucket = "assets" | "liabilities" | "equity";
const BUCKET_OF: Record<AccountCategory, Bucket> = { asset: "assets", liability: "liabilities", equity: "equity", revenue: "equity", expense: "equity" };

/** The gross effect of an entry's lines on A = L + E — the same rule equation-derive.ts uses:
 *  the Assets term is debit-normal (debit up), Liabilities and Equity credit-normal (credit up),
 *  revenue and expense fold into Equity; a term hit both ways is "both". Lines whose account
 *  the registry doesn't know are skipped (they get their own warning). Exported for the face's
 *  own display and the tests. */
export function deriveEntryArrows(lines: readonly { account: string; dr?: number; cr?: number }[]): Record<Bucket, EqDir> {
  const seen: Record<Bucket, { up: boolean; down: boolean }> = { assets: { up: false, down: false }, liabilities: { up: false, down: false }, equity: { up: false, down: false } };
  for (const l of lines) {
    const def = accountByLabel(l.account);
    const side = l.dr != null ? "dr" : l.cr != null ? "cr" : null;
    if (!def || !side) continue;
    const bucket = BUCKET_OF[def.category];
    const up = bucket === "assets" ? side === "dr" : side === "cr";
    seen[bucket][up ? "up" : "down"] = true;
  }
  const dir = (b: Bucket): EqDir => (seen[b].up && seen[b].down ? "both" : seen[b].up ? "up" : seen[b].down ? "down" : "none");
  return { assets: dir("assets"), liabilities: dir("liabilities"), equity: dir("equity") };
}

const money = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const overlaps = (a: ClusterNode, b: ClusterNode): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const nameOf = (n: ClusterNode): string => n.title ? `"${n.title}" (${n.id})` : n.id;

/** Human-readable warnings for what the schema can't see. Empty = clean. Shown, never fatal.
 *  `cardIds`, when given, lets a ceq node be checked against the set. */
export function checkMapSpec(spec: ClusterSpec, opts: { cardIds?: ReadonlySet<string> } = {}): string[] {
  const out: string[] = [];
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const unknown = (account: string, where: string) => { if (!accountByLabel(account)) out.push(`${where}: "${account}" is not an account in the registry`); };

  for (const n of spec.nodes) {
    const d = n.data;
    if (n.x < 0 || n.y < 0 || n.x + n.w > spec.field.w || n.y + n.h > spec.field.h) out.push(`${nameOf(n)} sits outside the field`);
    if (d.kind === "je") {
      let dr = 0, cr = 0, drLines = 0, crLines = 0, amounts = 0;
      d.lines.forEach((l, i) => {
        unknown(l.account, `entry ${n.id} line ${i + 1}`);
        if (l.dr != null && l.cr != null) out.push(`entry ${n.id} line ${i + 1} (${l.account}) has both a debit and a credit`);
        if (l.dr == null && l.cr == null) out.push(`entry ${n.id} line ${i + 1} (${l.account}) has no side`);
        if (l.dr != null) { dr += l.dr; drLines++; amounts++; }
        if (l.cr != null) { cr += l.cr; crLines++; amounts++; }
      });
      if (!drLines || !crLines) out.push(`entry ${n.id} needs at least one debit and one credit`);
      else if (amounts && Math.abs(dr - cr) >= 0.005) out.push(`entry ${n.id} doesn't balance: debits ${money(dr)}, credits ${money(cr)}`);
    }
    if (d.kind === "taccount") {
      unknown(d.account, `T-account ${n.id}`);
      const def = accountByLabel(d.account);
      if (def) {
        const wantDr = signFor(CATEGORY_TYPE[def.category], true) === "Dr";
        const normalDr = def.contra ? !wantDr : wantDr;
        if ((d.normal === "dr") !== normalDr) out.push(`T-account ${n.id}: ${d.account} is ${normalDr ? "debit" : "credit"}-normal, not ${d.normal === "dr" ? "debit" : "credit"}`);
      }
      for (const id of d.fromNodes ?? []) if (byId.get(id)?.data.kind !== "je") out.push(`T-account ${n.id} posts from "${id}", which isn't an entry on this map`);
    }
    if (d.kind === "tb") {
      let dr = 0, cr = 0;
      for (const r of d.rows ?? []) { unknown(r.account, `trial balance ${n.id}`); dr += r.dr ?? 0; cr += r.cr ?? 0; }
      if (d.rows?.length && Math.abs(dr - cr) >= 0.005) out.push(`trial balance ${n.id} doesn't balance: debits ${money(dr)}, credits ${money(cr)}`);
      for (const id of d.fromNodes ?? []) if (byId.get(id)?.data.kind !== "taccount") out.push(`trial balance ${n.id} rolls up "${id}", which isn't a T-account on this map`);
    }
    if (d.kind === "accounts") d.groups.forEach((g) => g.accounts.forEach((a) => unknown(a, `list ${n.id}, group "${g.label}"`)));
    if (d.kind === "ceq" && opts.cardIds && !opts.cardIds.has(d.ceqId)) out.push(`card node ${n.id}: "${d.ceqId}" is not one of the set's cards`);
  }

  // The equation against the entry: paired by an edge either way, else the map's only entry.
  const entries = spec.nodes.filter((n) => n.data.kind === "je");
  for (const eq of spec.nodes) {
    if (eq.data.kind !== "equation") continue;
    const linked = spec.edges.filter((e) => e.from === eq.id || e.to === eq.id).map((e) => byId.get(e.from === eq.id ? e.to : e.from)).filter((n): n is ClusterNode => !!n && n.data.kind === "je");
    const pair = linked.length ? linked : entries.length === 1 ? entries : [];
    for (const je of pair) {
      if (je.data.kind !== "je") continue;
      const want = deriveEntryArrows(je.data.lines);
      const have = eq.data.arrows;
      const off = (["assets", "liabilities", "equity"] as const).filter((b) => want[b] !== have[b]);
      if (off.length) out.push(`equation ${eq.id} disagrees with entry ${je.id}: ${off.map((b) => `${b} should be ${want[b]}, not ${have[b]}`).join("; ")}`);
    }
  }

  // Shots: known ids, something new each time (the last may be the overview), not opening wide.
  const overview = overviewCamera(spec.field).zoom;
  let prev = { nodes: new Set<string>(), steps: new Map<string, number>() };
  spec.shots.forEach((s, i) => {
    for (const r of s.reveal) { const id = r.replace(/#\d+$/, ""); if (!byId.has(id)) out.push(`shot ${i + 1} reveals "${id}", which isn't a node`); }
    const now = visibleAt(spec, i);
    const grew = now.nodes.size > prev.nodes.size || [...now.steps].some(([id, k]) => (prev.steps.get(id) ?? 0) < k);
    if (!grew && i !== spec.shots.length - 1) out.push(`shot ${i + 1}${s.label ? ` (${s.label})` : ""} reveals nothing new`);
    // A one-node map (the list slide) IS its overview — the rule is for maps with somewhere to swim.
    if (i === 0 && spec.nodes.length > 1 && s.camera.zoom <= overview + 0.001) out.push("shot 1 opens on the overview — the first shot should frame one node");
    prev = now;
  });

  // Boxes on top of each other.
  for (let i = 0; i < spec.nodes.length; i++) for (let k = i + 1; k < spec.nodes.length; k++) {
    if (overlaps(spec.nodes[i], spec.nodes[k])) out.push(`${nameOf(spec.nodes[i])} and ${nameOf(spec.nodes[k])} overlap`);
  }
  return out;
}
