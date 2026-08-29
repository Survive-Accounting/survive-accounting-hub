// EXAM 1 — INTRO/OUTRO FRAME SEEDER (bun scripts/curriculum/exam1-intro-outro.ts [--apply])
//
// Gives every set the Blast Off bookends Lee films with: an INTRO note (the set's overarching
// stem, alone, at the top) and an OUTRO note (same stem + greyed "Found on your exam" sub-stems,
// at the end). Starters only — Lee refines them in the Studio.
//
// Structure is cloned from set 1.1's real intro/outro nodes so they render identically.
// Deterministic ids (…-intro / …-outro). IDEMPOTENT + NON-CLOBBERING: a frame that already exists
// is left untouched (so re-running never overwrites Studio edits). 1.1 is skipped (already done).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readImportRows } from "../../src/lib/exam1-starter/workbook";
import { buildPlan } from "../../src/lib/exam1-starter/plan";

const HERE = dirname(fileURLToPath(import.meta.url));
const WB = join(HERE, "Survive_Exam1_Master_CEQ_Editorial_Pass_v1.xlsx");
type Db = { from: (t: string) => any };
const log = (...a: unknown[]) => console.log(...a);

// main stem (the big exam question) + starter sub-stems, per subtopic "topic.sub".
const FRAMES: Record<string, { stem: string; subs: string[] }> = {
  "1.2": { stem: "Who uses this information?", subs: ["Internal or external user?", "A manager, or an investor / lender?", "Who needs it to run the business vs. to invest?", "True or false — this is an external user?"] },
  "1.3": { stem: "Financial or managerial accounting?", subs: ["Who is this report for?", "Internal decisions or external reporting?", "GAAP-required, or internal-only?", "Which side handles this?"] },
  "1.4": { stem: "Which principle or assumption applies?", subs: ["Which principle is being violated?", "Revenue recognition, matching, or cost?", "Going concern, economic entity, or time period?", "Name the assumption at work."] },
  "1.5": { stem: "Who sets and enforces the rules?", subs: ["FASB, SEC, or GAAP?", "Who writes the standards vs. who enforces them?", "Which body has authority here?", "True or false — this is set by the government?"] },
  "1.6": { stem: "Who do you work for?", subs: ["Public or private accounting?", "Audit, tax, or advisory?", "Which role fits this task?", "What path needs the CPA?"] },
  "2.1": { stem: "What type of account is this?", subs: ["Asset, liability, or equity?", "Which financial statement does it hit?", "Debit or credit normal balance?", "Permanent or temporary?"] },
  "2.2": { stem: "How does this affect A = L + E?", subs: ["Which accounts change?", "Does equity go up or down?", "Is the equation still balanced?", "Pretend you ARE the company — what happens?"] },
  "3.1": { stem: "Debit or credit — which increases this?", subs: ["Increase or decrease?", "Which side is the normal balance?", "Does a debit raise it or lower it?", "True or false — a credit increases this account?"] },
  "3.2": { stem: "What's the journal entry?", subs: ["What do you debit? What do you credit?", "Find the cash first — then build the Tetris piece.", "Do total debits = total credits?", "Which account leads the entry?"] },
  "3.3": { stem: "What's the normal balance?", subs: ["Debit or credit balance?", "Which side increases it?", "Contra account — does the rule flip?", "True or false — this normally carries a credit?"] },
  "3.4": { stem: "What's the ending balance?", subs: ["Debit or credit ending balance?", "Post the entries — what's left?", "Which side is bigger?", "What's the running balance after posting?"] },
  "4.1": { stem: "Deferral or accrual?", subs: ["Cash first, or recognition first?", "Did cash move before or after?", "Which timing applies here?", "Put a 12/31 button in your brain — when did it happen?"] },
  "4.2": { stem: "What's the adjusting entry for this deferral?", subs: ["What was recorded first — the cash?", "How much has been used up / earned?", "What do you debit? What do you credit?", "Prepaid or unearned — which side adjusts?"] },
  "4.3": { stem: "What's the adjusting entry for this accrual?", subs: ["What's owed but not yet recorded?", "Revenue earned, or expense incurred?", "What do you debit? What do you credit?", "Receivable or payable?"] },
  "4.4": { stem: "What changed on the adjusted trial balance?", subs: ["Which balance moved after adjusting?", "What's the new adjusted amount?", "Did the totals stay equal?", "Which accounts were touched?"] },
  "4.5": { stem: "Find the error — and which errors DON'T break it?", subs: ["Do the columns still balance?", "Which mistake hides in a balanced trial balance?", "Transposition, slide, or omission?", "Balanced ≠ correct — is this one caught?"] },
  "5.1": { stem: "Which statement does this go on?", subs: ["Income statement, balance sheet, or statement of cash flows?", "Which section?", "Permanent or temporary — where does it land?", "Revenue, expense, asset, or liability line?"] },
  "5.2": { stem: "What's the correct format?", subs: ["Which line comes first?", "What's the subtotal here?", "How is this statement structured?", "Which heading belongs where?"] },
  "5.3": { stem: "Which statement do you prepare first?", subs: ["What's the correct order?", "Which statement feeds the next?", "Where does net income flow?", "True or false — the balance sheet comes first?"] },
  "5.4": { stem: "What's ending Retained Earnings?", subs: ["Beginning RE + net income − dividends?", "What's the net income first?", "Did dividends reduce it?", "What's the balance carried forward?"] },
  "6.1": { stem: "Which accounts get closed?", subs: ["Temporary or permanent?", "Does this account reset to zero?", "Revenue, expense, dividends — or none?", "True or false — this one stays open?"] },
  "6.2": { stem: "What's the closing entry?", subs: ["What do you debit? What do you credit?", "Close to Income Summary or Retained Earnings?", "Which accounts zero out?", "What's the order of closing?"] },
  "6.3": { stem: "How do closing entries change with net income vs. a net loss?", subs: ["Debit or credit Income Summary?", "Which way does Retained Earnings move?", "Net income or net loss — does the entry flip?", "What's in Income Summary before it's closed?"] },
  "6.4": { stem: "What's on the post-closing trial balance?", subs: ["Which accounts remain?", "Only permanent accounts?", "Do the columns balance?", "Should any temporary account appear?"] },
};

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

async function main() {
  const apply = process.argv.includes("--apply");
  log(`\n━━━ EXAM 1 INTRO/OUTRO SEEDER ${apply ? "APPLY" : "DRY-RUN"} ━━━`);
  const plan = buildPlan(readImportRows(WB).rows);
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { log("✗ env not set"); process.exit(1); }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key) as unknown as Db;

  const scenes = (await db.from("canvas_scenes").select("id,nodes_json").order("updated_at", { ascending: false })).data ?? [];
  const rowByDeck = new Map<string, any>();
  for (const s of scenes) { const d = (s.nodes_json?.decks ?? [])[0]; if (d?.id?.startsWith?.("deck-e1s-")) rowByDeck.set(d.id, s); }

  // templates: the real intro/outro nodes from set 1.1
  const s11 = rowByDeck.get("deck-e1s-1-1");
  const introTpl = (s11?.nodes_json?.nodes ?? []).find((n: any) => n.id === "ceq-mstdy8d8-1");
  const outroTpl = (s11?.nodes_json?.nodes ?? []).find((n: any) => n.id === "ceq-mst5c8j4-1");
  if (!introTpl || !outroTpl) throw new Error("Could not find the 1.1 intro/outro templates.");

  let added = 0, skipped = 0, sets = 0;
  const writes: { id: string; nodes_json: any }[] = [];
  for (const set of plan.sets) {
    const key = `${set.topicOrder}.${set.subtopicOrder}`;
    if (key === "1.1") continue; // already done
    const cfg = FRAMES[key]; if (!cfg) { log(`  ⚠ no frame content for ${key} ${set.name}`); continue; }
    const deckId = `deck-e1s-${set.topicOrder}-${set.subtopicOrder}`;
    const s = rowByDeck.get(deckId); if (!s) { log(`  ⚠ no set-file for ${deckId}`); continue; }
    const j = s.nodes_json; const nodes: any[] = j.nodes ?? [];
    const introId = `ceq-e1s-${set.topicOrder}-${set.subtopicOrder}-intro`, outroId = `ceq-e1s-${set.topicOrder}-${set.subtopicOrder}-outro`;
    const hasIntro = nodes.some((n) => n.id === introId), hasOutro = nodes.some((n) => n.id === outroId);
    if (hasIntro && hasOutro) { skipped++; continue; }
    sets++;
    // shift existing questions up by 1 to make room for the intro at stageOrder 0
    const qs = nodes.filter((n) => n.type === "ceq" && !n.data?.noteOnly).sort((a, b) => (a.data?.stageOrder ?? 0) - (b.data?.stageOrder ?? 0));
    const otherNotes = nodes.filter((n) => n.type === "ceq" && n.data?.noteOnly && n.id !== introId && n.id !== outroId);
    const nonCeq = nodes.filter((n) => n.type !== "ceq");
    qs.forEach((q, i) => { q.data = { ...q.data, stageOrder: i + 1, slotIndex: i + 1 }; });
    const last = qs.length + 1;
    const intro = clone(introTpl); intro.id = introId; intro.data = { ...intro.data, deckId, title: `"${cfg.stem}"`, prompt: `"${cfg.stem}"`, callout: { bolt: true, showTopic: true, extraStems: [] }, takes: {}, stageOrder: 0, slotIndex: 0, faceDown: false };
    const outro = clone(outroTpl); outro.id = outroId; outro.data = { ...outro.data, deckId, title: `"${cfg.stem}"`, prompt: `"${cfg.stem}"`, callout: { ...(outroTpl.data?.callout ?? {}), extraStems: cfg.subs }, takes: {}, stageOrder: last, slotIndex: last };
    j.nodes = [intro, ...qs, ...otherNotes, outro, ...nonCeq];
    added += 2; writes.push({ id: s.id, nodes_json: j });
    log(`  ${key} ${set.name}: + intro "${cfg.stem}"  + outro (${cfg.subs.length} sub-stems)`);
  }
  log(`\nsets to seed: ${sets} · frames added: ${added} · already-present skipped: ${skipped}`);
  if (!apply) { log(`DRY-RUN — no writes. Re-run with --apply.`); return; }
  for (const w of writes) { const { error } = await db.from("canvas_scenes").update({ nodes_json: w.nodes_json, updated_at: new Date().toISOString() }).eq("id", w.id); if (error) throw new Error(`write ${w.id}: ${error.message}`); }
  log(`✓ seeded intro/outro into ${writes.length} sets. Reload the Studio.`);
}
main().catch((e) => { console.error("✗ FAILED:", e?.message ?? e); process.exit(1); });
