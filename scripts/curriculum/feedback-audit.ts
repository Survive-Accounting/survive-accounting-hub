// feedback-audit.ts — READ-ONLY: where does the bank's choice feedback repeat itself?
//
// Lee (2026-09-09): "duplicated cards have identical feedback. Audit/fix." The live bank shows
// he had already fixed the three by hand — Bonds Payable ← Notes Payable, Prepaid Advertising ←
// Prepaid Rent, Notes Receivable ← Interest Receivable, each one's editHistory proving it
// shipped with the source's sentence verbatim. The CAUSE was duplicateCeqCard deep-copying the
// card and stripping only editHistory/shorthand/stageOrder; it now marks the copy
// `feedbackStale` (talkthrough.functions.ts). This script is the audit half. It never writes
// and always exits 0. Per live, unparked deck it prints
//
//   (a) exact-duplicate feedback strings — which cards, which choice
//   (b) near-duplicates — token Jaccard ≥ 0.7 after lowercasing and stripping punctuation
//   (c) cloned cards (`clonedFrom`) whose feedback still equals the source's, choice by choice
//   (d) counts — questions, correct choices with feedback, wrong choices with feedback
//   (e) cards still flagged feedbackStale
//
// and then the bank-wide totals. The 2026-09-09 baseline was 277/277 correct choices with
// feedback and 0/833 wrong choices with any — so a student who gets a card wrong never sees an
// authored sentence (PracticeStage.tsx falls back to "Not quite. Try again"). Those two numbers
// are what a rerun should reproduce until someone writes wrong-answer feedback.
//
//   bun scripts/curriculum/feedback-audit.ts                 # every live, unparked deck
//   bun scripts/curriculum/feedback-audit.ts --deck <id>     # one deck (repeat --deck for more)
//
// Same shape as live-bank-report.ts: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env (bun
// loads it), loadDecksDeduped for the same ownership the student side reads. The helpers at the
// top are plain exported functions with no I/O so feedback-audit.test.ts can pin them; the DB
// client is only built under `import.meta.main`, so importing this module touches nothing.
import { type RawNode, liveDecks, loadDecksDeduped } from "../../src/lib/student.functions";

// ------------------------------------------------------------------ pure helpers

/** One card as the audit sees it — the bank's own filter and order (loadBoothBank), with the
 *  clone bookkeeping duplicateCeqCard leaves on `data`. Feedback is always a string here;
 *  "" means the choice has none. */
export interface AuditCard {
  id: string;
  /** shorthand, or Q{n} by bank position — the label the Editor shows. */
  label: string;
  stem: string;
  clonedFrom: string | null;
  feedbackStale: boolean;
  noteOnly: boolean;
  draft: boolean;
  choices: { text: string; correct: boolean; feedback: string }[];
}

/** One non-empty feedback sentence, with where it lives. */
export interface FeedbackEntry {
  ceqId: string;
  label: string;
  stem: string;
  /** index into the card's choices */
  choice: number;
  correct: boolean;
  feedback: string;
}

/** Lowercase, punctuation out, whitespace collapsed — the shape two sentences are compared in
 *  for (b). Letters and digits in any script survive; everything else becomes a space. */
export function normalizeFeedback(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}

/** The distinct words of a sentence after normalizeFeedback. */
export function tokens(s: string): Set<string> {
  const n = normalizeFeedback(s);
  return new Set(n ? n.split(" ") : []);
}

/** Token Jaccard: |A ∩ B| / |A ∪ B|. Two empty sentences score 0, not 1 — nothing to share. */
export function jaccard(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 0;
  let both = 0;
  for (const t of ta) if (tb.has(t)) both++;
  return both / (ta.size + tb.size - both);
}

/** The threshold Lee's spec named: "token-Jaccard ≥ 0.7". */
export const NEAR_DUPLICATE_THRESHOLD = 0.7;

/** Every choice with a non-empty feedback, flattened with its address. */
export function feedbackEntries(cards: AuditCard[]): FeedbackEntry[] {
  const out: FeedbackEntry[] = [];
  for (const c of cards) {
    c.choices.forEach((ch, i) => {
      if (ch.feedback.trim()) out.push({ ceqId: c.id, label: c.label, stem: c.stem, choice: i, correct: ch.correct, feedback: ch.feedback.trim() });
    });
  }
  return out;
}

/** (a) Groups of two or more entries whose feedback is the same string (trimmed, case kept —
 *  "exact" means exact). Singletons never appear. Group order follows first appearance. */
export function exactDuplicates(entries: FeedbackEntry[]): FeedbackEntry[][] {
  const by = new Map<string, FeedbackEntry[]>();
  for (const e of entries) {
    const g = by.get(e.feedback);
    if (g) g.push(e); else by.set(e.feedback, [e]);
  }
  return [...by.values()].filter((g) => g.length >= 2);
}

/** (b) Pairs that are not the same string but share ≥ threshold of their words. Exact matches
 *  are (a)'s business, so they are left out here. Highest score first. */
export function nearDuplicates(entries: FeedbackEntry[], threshold: number = NEAR_DUPLICATE_THRESHOLD): { a: FeedbackEntry; b: FeedbackEntry; score: number }[] {
  const out: { a: FeedbackEntry; b: FeedbackEntry; score: number }[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a.feedback === b.feedback) continue;
      const score = jaccard(a.feedback, b.feedback);
      if (score >= threshold) out.push({ a, b, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/** (c) Every card that was cloned from another card in the same deck, with the choice indexes
 *  whose feedback is still, word for word, the source's. Empty `identical` = Lee has rewritten
 *  it (or neither side ever had a sentence there). A source that is no longer in the deck comes
 *  back null so the report can say so instead of skipping the card. */
export function inheritedFeedback(cards: AuditCard[]): { clone: AuditCard; source: AuditCard | null; identical: number[] }[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: { clone: AuditCard; source: AuditCard | null; identical: number[] }[] = [];
  for (const clone of cards) {
    if (!clone.clonedFrom) continue;
    const source = byId.get(clone.clonedFrom) ?? null;
    const identical: number[] = [];
    if (source) {
      clone.choices.forEach((ch, i) => {
        const mine = ch.feedback.trim();
        const theirs = (source.choices[i]?.feedback ?? "").trim();
        if (mine && mine === theirs) identical.push(i);
      });
    }
    out.push({ clone, source, identical });
  }
  return out;
}

/** (d) What the bank actually holds. `questions` are the cards a student can be asked (not
 *  note-only); the choice tallies are over those cards only. */
export function feedbackCounts(cards: AuditCard[]): { questions: number; correct: number; correctWith: number; wrong: number; wrongWith: number } {
  const t = { questions: 0, correct: 0, correctWith: 0, wrong: 0, wrongWith: 0 };
  for (const c of cards) {
    if (c.noteOnly) continue;
    t.questions++;
    for (const ch of c.choices) {
      const has = ch.feedback.trim() !== "";
      if (ch.correct) { t.correct++; if (has) t.correctWith++; } else { t.wrong++; if (has) t.wrongWith++; }
    }
  }
  return t;
}

/** (e) Cards whose feedback is still flagged as borrowed. */
export function staleCards(cards: AuditCard[]): AuditCard[] {
  return cards.filter((c) => c.feedbackStale);
}

/** A deck's raw scene nodes → audit cards, with EXACTLY the bank's filter and order
 *  (talkthrough.functions loadBoothBank): soft-archived cards are out, film frames written back
 *  as note nodes with provenance "blast-off" are out, the rest sort by stageOrder, and a card
 *  with no shorthand is Q{position}. Same labels as the Editor, so the report reads like it. */
export function auditCards(nodes: RawNode[]): AuditCard[] {
  type D = { stageOrder?: number; prompt?: string; shorthand?: string; noteOnly?: boolean; draft?: boolean; bankArchived?: string; provenance?: string; clonedFrom?: string; feedbackStale?: boolean; choices?: { text?: string; correct?: boolean; feedback?: string }[] };
  const cards = nodes
    .map((n) => ({ id: String(n.id ?? ""), d: (n.data ?? {}) as D }))
    .filter((c) => !c.d.bankArchived && c.d.provenance !== "blast-off")
    .sort((a, b) => (a.d.stageOrder ?? 0) - (b.d.stageOrder ?? 0));
  return cards.map((c, i) => ({
    id: c.id,
    label: String(c.d.shorthand || `Q${i + 1}`),
    stem: String(c.d.prompt ?? ""),
    clonedFrom: c.d.clonedFrom ? String(c.d.clonedFrom) : null,
    feedbackStale: c.d.feedbackStale === true,
    noteOnly: !!c.d.noteOnly,
    draft: !!c.d.draft,
    choices: (Array.isArray(c.d.choices) ? c.d.choices : []).map((ch) => ({ text: String(ch.text ?? ""), correct: !!ch.correct, feedback: typeof ch.feedback === "string" ? ch.feedback : "" })),
  }));
}

/** The ids after each `--deck` on the command line. */
export function deckArgs(argv: string[]): string[] {
  return argv.reduce<string[]>((acc, a, i) => (a === "--deck" && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
}

// ------------------------------------------------------------------ printing

/** One line of a sentence, so a 400-character explanation does not wrap the report. */
function short(s: string, n = 72): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

function where(e: FeedbackEntry): string {
  return `${e.label} choice ${e.choice} (${e.correct ? "correct" : "wrong"}) ${e.ceqId} — ${short(e.stem, 56)}`;
}

function ratio(with_: number, of: number): string {
  return `${with_}/${of}`;
}

function printDeck(title: string, cards: AuditCard[]): void {
  const entries = feedbackEntries(cards);
  console.log(`\n${title}`);

  const exact = exactDuplicates(entries);
  console.log(`  (a) exact duplicates: ${exact.length ? exact.length + " group(s)" : "none"}`);
  for (const g of exact) {
    console.log(`      "${short(g[0].feedback)}"`);
    for (const e of g) console.log(`        · ${where(e)}`);
  }

  const near = nearDuplicates(entries);
  console.log(`  (b) near duplicates (Jaccard ≥ ${NEAR_DUPLICATE_THRESHOLD}): ${near.length ? near.length + " pair(s)" : "none"}`);
  for (const p of near) {
    console.log(`      ${p.score.toFixed(2)}  ${where(p.a)}`);
    console.log(`            ↔ ${where(p.b)}`);
    console.log(`            "${short(p.a.feedback)}"`);
    console.log(`            "${short(p.b.feedback)}"`);
  }

  const clones = inheritedFeedback(cards);
  console.log(`  (c) cloned cards: ${clones.length || "none"}`);
  for (const c of clones) {
    const verdict = !c.source ? "source no longer in this deck" : c.identical.length ? `STILL IDENTICAL to source at choice ${c.identical.join(", ")}` : "no longer identical";
    console.log(`      ${c.clone.label} ${c.clone.id} ← ${c.source ? c.source.label + " " : ""}${c.clone.clonedFrom}: ${verdict}`);
    console.log(`        — ${short(c.clone.stem, 56)}${c.source ? `  (source: ${short(c.source.stem, 40)})` : ""}`);
  }

  const t = feedbackCounts(cards);
  console.log(`  (d) ${t.questions} questions · correct choices with feedback ${ratio(t.correctWith, t.correct)} · wrong choices with feedback ${ratio(t.wrongWith, t.wrong)}`);

  const stale = staleCards(cards);
  console.log(`  (e) feedbackStale: ${stale.length ? stale.map((c) => `${c.label} ${c.id}`).join(", ") : "none"}`);
}

// ------------------------------------------------------------------ main

async function main(): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (bun loads .env)"); return; }
  const db = createClient(url, key);

  const { data: ch, error } = await db.from("chapters").select("id,chapter_name,chapter_number");
  if (error) { console.error(`chapters: ${error.message}`); return; }
  type Chapter = { id: string; chapter_name: string; chapter_number: number };
  const chBy = new Map<string, Chapter>(((ch ?? []) as Chapter[]).map((c) => [c.id, c]));

  const owned = await loadDecksDeduped(db as never);
  const only = deckArgs(process.argv);
  for (const id of only) {
    const o = owned.get(id);
    if (!o) console.log(`--deck ${id}: no card deck with that id in any scene`);
    else if (o.deck.status !== "live" || o.deck.parked === true) console.log(`--deck ${id}: not live+unparked (status ${o.deck.status}${o.deck.parked ? ", parked" : ""}) — skipped, this audit reads what students can see`);
  }
  const decks = liveDecks(owned)
    .filter((o) => !only.length || only.includes(o.deck.id))
    .map((o) => ({ o, ch: o.deck.topicId ? chBy.get(o.deck.topicId) : undefined }))
    .sort((a, b) => (a.ch?.chapter_number ?? 9999) - (b.ch?.chapter_number ?? 9999) || (a.o.deck.sortOrder ?? 9999) - (b.o.deck.sortOrder ?? 9999) || a.o.deck.id.localeCompare(b.o.deck.id));

  const total = { decks: 0, questions: 0, correct: 0, correctWith: 0, wrong: 0, wrongWith: 0, exact: 0, near: 0, clones: 0, stillIdentical: 0, stale: 0 };
  const all: FeedbackEntry[] = [];
  for (const { o, ch: c } of decks) {
    const cards = auditCards(o.nodes);
    printDeck(`${o.deck.id}  ${c ? `Ch ${c.chapter_number} · ${c.chapter_name}` : "(no topic)"}  ${o.deck.name ?? ""}`, cards);
    const t = feedbackCounts(cards);
    total.decks++;
    total.questions += t.questions; total.correct += t.correct; total.correctWith += t.correctWith; total.wrong += t.wrong; total.wrongWith += t.wrongWith;
    const entries = feedbackEntries(cards);
    total.exact += exactDuplicates(entries).length;
    total.near += nearDuplicates(entries).length;
    const clones = inheritedFeedback(cards);
    total.clones += clones.length;
    total.stillIdentical += clones.filter((x) => x.identical.length > 0).length;
    total.stale += staleCards(cards).length;
    all.push(...entries.map((e) => ({ ...e, label: `${o.deck.id} ${e.label}` })));
  }

  // Sentences that repeat ACROSS decks — a per-deck grouping cannot see a card that was cloned
  // into a sibling set, and that is exactly where a copied sentence goes unnoticed.
  const cross = exactDuplicates(all).filter((g) => new Set(g.map((e) => e.label.split(" ")[0])).size > 1);
  console.log(`\nexact duplicates across decks: ${cross.length ? cross.length + " group(s)" : "none"}`);
  for (const g of cross) {
    console.log(`  "${short(g[0].feedback)}"`);
    for (const e of g) console.log(`    · ${where(e)}`);
  }

  console.log(`\nTOTAL  ${total.decks} live, unparked deck(s) · ${total.questions} questions · correct choices with feedback ${ratio(total.correctWith, total.correct)} · wrong choices with feedback ${ratio(total.wrongWith, total.wrong)}`);
  console.log(`       exact-duplicate groups ${total.exact} · near-duplicate pairs ${total.near} · cloned cards ${total.clones} (${total.stillIdentical} still identical to source) · feedbackStale ${total.stale}`);
}

// Never a non-zero exit: this is a report, and a report that is wrong should say so in words.
if (import.meta.main) {
  try { await main(); } catch (e) { console.error(`feedback-audit failed: ${e instanceof Error ? e.message : String(e)}`); }
}
