// BANK RECONCILE (D1) — make docs/data/exam1masterchoices.xlsx the SINGLE
// SOURCE OF TRUTH for the Exam 1 bank.
//
//   bun scripts/bank-reconcile.ts            → DRY RUN: writes docs/BANK-DIFF.md, touches nothing
//   bun scripts/bank-reconcile.ts --apply    → applies the sync, then re-verifies
//
// WHAT THE INVESTIGATION PROVED (BUILD-NOTES.md, 08-28): canvas_scenes holds
// TWO generations of the Exam 1 bank.
//   · The AUTHORED sets (deck-ch*/deck-msr*, stem-named, per-set SETFILE rows):
//     Lee's real bank — 255 CEQs, 246 stem-match the master sheet (96%), and
//     their decks already point at the master's 10-topic chapters. They were
//     left status=archived/draft + parked when…
//   · …the E1S "global starter map" import (deck-e1s-*, 6 topics / 274 CEQs)
//     replaced them as the live player bank with differently-authored content
//     ("Which shortcut is most reliable?" style — the invented questions).
//
// THE FIX: reinstate the authored sets as the ONE live bank, reconcile the
// master sheet into them, and soft-archive the superseded E1S sets. The Booth
// and the player then read the same live decks.
//
// LAWS (exam1-seed.core.ts heritage + this prompt):
//   · CEQs match by normalized stem; matched → choices/shorthand/status/
//     needs_exhibit/notes update IN PLACE (ids + film order preserved).
//   · The file WINS on choices; a row with every choice cell empty is "no
//     opinion", not "delete my choices". Leading * marks correct; overflow
//     choices ride notes as "| choice_e: …".
//   · Untraceable CEQs inside master-covered sets → data.bankArchived (soft).
//   · E1S sets covering master topics → deck status "archived" + parked
//     (soft; recoverable). The four Easy-Points-only sets (users, fin-vs-mgr,
//     standards, careers) have NO master coverage → standing law says app
//     sets absent from the file are REPORTED, never deleted → they stay live.
//   · status: live-candidate → student-visible; draft → data.draft (studio
//     surfaces only).
//   · NEVER touch Exams 2/3/Final, campuses, entitlements, publications.
import { writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — source .env first");
const db = createClient(url, key);

/** Matching normalization — identical to exam1-seed.core.ts (kept in lockstep). */
const norm = (s: string): string => (s ?? "").replace(/["“”„'‘’]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const now = new Date().toISOString();

// ─────────────────────────────────────────────────────── 1. the master sheet

interface MasterRow {
  topic: string; setStem: string; ceqNum: number; shorthand: string; stem: string;
  choices: { text: string; correct: boolean }[]; allEmpty: boolean;
  needsExhibit: string; notes: string; status: "live-candidate" | "draft";
}

const wb = XLSX.readFile("docs/data/exam1masterchoices.xlsx");
const sheetRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames.find((n) => n.includes("master")) ?? wb.SheetNames[0]], { defval: "" });
const master: MasterRow[] = sheetRaw.map((r) => {
  const cells = ["choice_a", "choice_b", "choice_c", "choice_d"].map((c) => String(r[c] ?? "").trim());
  // Overflow choices ride the notes column as "| choice_e: *Expense" segments.
  let notes = String(r.notes ?? "").trim();
  const overflow: string[] = [];
  notes = notes.split("|").map((seg) => {
    const m = seg.trim().match(/^choice_[e-h]:\s*(.+)$/i);
    if (m) { overflow.push(m[1].trim()); return ""; }
    return seg.trim();
  }).filter(Boolean).join(" | ");
  const all = [...cells, ...overflow];
  return {
    topic: String(r.topic_name ?? "").trim(),
    setStem: String(r.set_stem ?? "").trim(),
    ceqNum: Number(r.ceq_num) || 0,
    shorthand: String(r.shorthand ?? "").trim(),
    stem: String(r.ceq_stem ?? "").trim(),
    choices: all.filter(Boolean).map((t) => ({ text: t.replace(/^\*/, "").trim(), correct: t.startsWith("*") })),
    allEmpty: all.every((c) => !c),
    needsExhibit: String(r.needs_exhibit ?? "").trim(),
    notes,
    status: String(r.status ?? "").trim() === "live-candidate" ? "live-candidate" : "draft",
  };
});
if (!master.length) throw new Error("master sheet parsed to zero rows");
const badCorrect = master.filter((m) => !m.allEmpty && m.choices.filter((c) => c.correct).length !== 1);
if (badCorrect.length) throw new Error(`rows without exactly one *-marked correct: ${badCorrect.map((b) => b.stem.slice(0, 50)).join(" | ")}`);

const masterTopics: string[] = [];
for (const m of master) if (!masterTopics.includes(m.topic)) masterTopics.push(m.topic);
const masterSets: { topic: string; setStem: string; rows: MasterRow[] }[] = [];
for (const m of master) {
  let s = masterSets.find((x) => x.setStem === m.setStem && x.topic === m.topic);
  if (!s) { s = { topic: m.topic, setStem: m.setStem, rows: [] }; masterSets.push(s); }
  s.rows.push(m);
}
for (const s of masterSets) s.rows.sort((a, b) => a.ceqNum - b.ceqNum);

// ──────────────────────────────────────────────── 2. the app's two banks

interface SceneRow { id: string; name: string; nodes_json: { setFile?: boolean; workspace?: boolean; archived?: boolean; decks?: Deck[]; nodes?: Node[]; [k: string]: unknown } }
interface Deck { id: string; name: string; status?: string; parked?: boolean; topicId?: string | null; sortOrder?: number; payloadType?: string; [k: string]: unknown }
interface Node { id: string; type?: string; data?: Record<string, unknown>; [k: string]: unknown }
interface BankSet { deck: Deck; scene: SceneRow; cards: Node[] }

const { data: sceneRows, error: sErr } = await db.from("canvas_scenes").select("id,name,nodes_json").order("updated_at", { ascending: true });
if (sErr) throw new Error(sErr.message);
const scenes = (sceneRows ?? []) as SceneRow[];

const authored = new Map<string, BankSet>(); // per-set SETFILE rows, any status (the Booth pool)
const e1s = new Map<string, BankSet>();      // the starter-map generation
for (const sc of scenes) {
  const j = sc.nodes_json;
  if (j.workspace || j.archived) continue;
  for (const d of j.decks ?? []) {
    if (d.payloadType !== "cards") continue;
    const cards = (j.nodes ?? []).filter((n) => n.type === "ceq" && (n.data as { deckId?: string } | undefined)?.deckId === d.id);
    const entry = { deck: d, scene: sc, cards };
    if (d.id.startsWith("deck-e1s-")) { if (!e1s.has(d.id)) e1s.set(d.id, entry); }
    else if (j.setFile && cards.length && !authored.has(d.id)) authored.set(d.id, entry);
  }
}

// ─────────────────────────────────────────── 3. match master ↔ authored

const cardsByStem = new Map<string, { set: BankSet; node: Node }[]>();
for (const set of authored.values()) {
  for (const node of set.cards) {
    if (node.data?.noteOnly) continue;
    const k = norm(String(node.data?.prompt ?? ""));
    if (!k) continue;
    if (!cardsByStem.has(k)) cardsByStem.set(k, []);
    cardsByStem.get(k)!.push({ set, node });
  }
}
const setHome = new Map<string, BankSet>();
const matches = new Map<MasterRow, { set: BankSet; node: Node }>();
for (const s of masterSets) {
  const votes = new Map<string, number>();
  for (const row of s.rows) for (const ref of cardsByStem.get(norm(row.stem)) ?? []) votes.set(ref.set.deck.id, (votes.get(ref.set.deck.id) ?? 0) + 1);
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  // fall back to name-match (the authored deck names ARE the set stems)
  const byName = [...authored.values()].find((x) => norm(x.deck.name) === norm(s.setStem));
  if (top) setHome.set(s.setStem, authored.get(top[0])!);
  else if (byName) setHome.set(s.setStem, byName);
}
for (const s of masterSets) {
  const home = setHome.get(s.setStem);
  for (const row of s.rows) {
    const refs = cardsByStem.get(norm(row.stem)) ?? [];
    const pick = (home && refs.find((r) => r.set.deck.id === home.deck.id)) ?? refs[0];
    if (pick) matches.set(row, pick);
  }
}
const matchedNodeIds = new Set([...matches.values()].map((m) => m.node.id));

const fileMissing = master.filter((m) => !matches.has(m));
const strays: { set: BankSet; node: Node }[] = [];
for (const set of authored.values()) {
  if (![...setHome.values()].some((h) => h.deck.id === set.deck.id)) continue;
  for (const node of set.cards) if (!node.data?.noteOnly && !matchedNodeIds.has(node.id)) strays.push({ set, node });
}
const materiallyDiffer: { row: MasterRow; what: string }[] = [];
for (const [row, ref] of matches) {
  if (row.allEmpty) continue;
  const appChoices = Array.isArray(ref.node.data?.choices) ? (ref.node.data!.choices as { text?: string; correct?: boolean }[]) : [];
  const a = appChoices.map((c) => `${c.correct ? "*" : ""}${norm(String(c.text ?? ""))}`).sort().join("¦");
  const b = row.choices.map((c) => `${c.correct ? "*" : ""}${norm(c.text)}`).sort().join("¦");
  if (a !== b) {
    const appCorrect = appChoices.find((c) => c.correct)?.text ?? "(none)";
    const fileCorrect = row.choices.find((c) => c.correct)?.text ?? "(none)";
    materiallyDiffer.push({ row, what: norm(String(appCorrect)) === norm(fileCorrect) ? "choice wording differs" : `CORRECT differs: app "${appCorrect}" vs file "${fileCorrect}"` });
  }
}

// E1S disposition: sets whose topic the master covers → superseded (archive);
// the Easy-Points-only four → reported, kept live.
const e1sKeep = ["deck-e1s-1-2", "deck-e1s-1-3", "deck-e1s-1-5", "deck-e1s-1-6"]; // users · fin-vs-mgr · standards · careers
const e1sArchive = [...e1s.values()].filter((s) => !e1sKeep.includes(s.deck.id));
const e1sKept = [...e1s.values()].filter((s) => e1sKeep.includes(s.deck.id));

// ─────────────────────────────── 4. replacement trigger-word CEQs (D1.4)

const CATEGORY_CHOICES = ["Assets", "Liabilities", "Equity", "Revenues", "Expenses", "Contra accounts"];
const TRIGGER_CEQS = [
  { stem: "Prepaids are always ______.", correct: "Assets", shorthand: "Prepaids are always" },
  { stem: "Receivables are always ______.", correct: "Assets", shorthand: "Receivables are always" },
  { stem: "Payables are always ______.", correct: "Liabilities", shorthand: "Payables are always" },
  { stem: "Dividends, Accumulated Depreciation, and Allowance for Doubtful Accounts are all ______.", correct: "Contra accounts", shorthand: "Dividends, Accum. Dep., ADA are all" },
];
const typeSetStem = masterSets.find((s) => s.setStem.includes("What type of account is"))!.setStem;
const typeHome = setHome.get(typeSetStem);
const triggerExisting = new Set(typeHome?.cards.map((n) => norm(String(n.data?.prompt ?? ""))) ?? []);
const triggersToAdd = TRIGGER_CEQS.filter((t) => !triggerExisting.has(norm(t.stem)));

// ──────────────────────────────────────────────────── 5. chapters plan

const { data: chapterRows, error: cErr } = await db.from("chapters").select("id,chapter_name,chapter_number,course_id");
if (cErr) throw new Error(cErr.message);
const chapters = (chapterRows ?? []) as { id: string; chapter_name: string; chapter_number: number; course_id: string }[];
const courseId = chapters.find((c) => [...authored.values()].some((s) => s.deck.topicId === c.id))?.course_id;
if (!courseId) throw new Error("could not resolve the course id from the authored decks' chapters");
const courseChapters = chapters.filter((c) => c.course_id === courseId);
const chapterByName = new Map(courseChapters.map((c) => [norm(c.chapter_name), c]));
// master "Adjusting Entries" = existing "Adjusting Entries & Trial Balance" (renamed on apply)
const chapterAlias: Record<string, string> = { "adjusting entries": "adjusting entries & trial balance" };
const chapterPlan = masterTopics.map((t, i) => {
  const existing = chapterByName.get(norm(t)) ?? chapterByName.get(chapterAlias[norm(t)] ?? "∅") ?? null;
  return { topic: t, existing, number: i + 1 };
});
const easyPoints = chapterByName.get("easy points") ?? null;

// ───────────────────────────────────────────────────────── 6. THE REPORT

const L: string[] = [];
L.push("# BANK-DIFF — app vs docs/data/exam1masterchoices.xlsx", "");
L.push(`Generated ${now} by scripts/bank-reconcile.ts (${APPLY ? "APPLY" : "DRY RUN"}). Regenerate any time.`, "");
L.push("**The finding that drives everything below:** the app held TWO banks. The authored,");
L.push("stem-named sets (255 CEQs, 246 = 96% stem-matched to this sheet) were parked when the");
L.push('"global starter map" import (deck-e1s-*, 6 topics / 274 differently-authored CEQs —');
L.push('the "Which shortcut…" style) replaced them as the live player bank. The master sheet');
L.push("is the single source of truth, so the authored bank comes BACK and the starter-map", "sets are soft-archived (recoverable).", "");

L.push("## FOR LEE'S ONE-LOOK APPROVAL — replacement trigger-word CEQs (status=draft)", "");
L.push(`Added to **${typeSetStem}**, source-tagged \`lee-shortcut-triggers\`:`, "");
for (const t of TRIGGER_CEQS) L.push(`- **${t.stem}** → ${t.correct}${triggersToAdd.includes(t) ? "" : " *(already present — skipped)*"}`);
L.push("", `Distractors: ${CATEGORY_CHOICES.join(" · ")}.`, "");

L.push("## 1 · Superseded starter-map sets (deck status → archived+parked on apply; recoverable)", "");
for (const s of e1sArchive) L.push(`- **${s.deck.name}** (\`${s.deck.id}\`) — ${s.cards.length} CEQs, all untraceable-or-duplicate vs the master`);
L.push("", "Every invented question lives in these sets — including the known example", '"Which shortcut is most reliable?" (Account classification, `deck-e1s-2-1`).', "");

L.push("## 2 · App-only sets KEPT LIVE (no master coverage — reported, never deleted; Lee's call)", "");
for (const s of e1sKept) L.push(`- **${s.deck.name}** (\`${s.deck.id}\`) — ${s.cards.length} CEQs (Easy Points family)`);
L.push("");

L.push("## 3 · Untraceable CEQs inside the authored sets (data.bankArchived on apply)", "");
for (const st of strays) L.push(`- [${st.node.id}] ${st.set.deck.name} · "${String(st.node.data?.prompt ?? "").trim().slice(0, 90)}"`);
if (!strays.length) L.push("(none)");
L.push("");

L.push("## 4 · Master rows missing from the authored sets (created on apply, with status)", "");
for (const m of fileMissing) L.push(`- [${m.status}] ${m.setStem} · #${m.ceqNum} "${m.stem}"`);
if (!fileMissing.length) L.push("(none)");
L.push("");

L.push("## 5 · Matched rows whose choices differ materially (file wins on apply)", "");
for (const d of materiallyDiffer) L.push(`- "${d.row.stem.slice(0, 70)}" — ${d.what}`);
if (!materiallyDiffer.length) L.push("(none)");
L.push("");

L.push("## 6 · Set → authored deck mapping", "");
for (const s of masterSets) {
  const h = setHome.get(s.setStem);
  L.push(`- ${s.setStem} → ${h ? `**${h.deck.name}** (\`${h.deck.id}\`)` : "**NO MATCH — created as a new draft set**"} · ${s.rows.length} rows`);
}
L.push("", "## 7 · Topic plan (chapters, master order = chapter_number 1–10; Easy Points pinned to 0)", "");
for (const c of chapterPlan) L.push(`- ${c.number} · ${c.topic} → ${c.existing ? `existing \`${c.existing.id.slice(0, 8)}\` ("${c.existing.chapter_name}")` : "**created**"}`);
L.push("");

const liveCandidates = master.filter((m) => m.status === "live-candidate").length;
const keptLive = e1sKept.reduce((n, s) => n + s.cards.length, 0);
const totals = {
  masterRows: master.length, matched: matches.size, fileMissing: fileMissing.length,
  strays: strays.length, e1sArchivedSets: e1sArchive.length, e1sKeptSets: e1sKept.length,
  studentVisibleAfter: liveCandidates + keptLive, draftsAfter: master.length - liveCandidates,
};
L.push("## Totals", "", "```", JSON.stringify(totals, null, 1), "```", "");
L.push(`> **Student-facing count changes on apply:** the player goes from 274 questions (the`);
L.push(`> starter-map bank) to **${totals.studentVisibleAfter}** (${liveCandidates} master live-candidates + ${keptLive} kept Easy-Points`);
L.push(`> questions). The ${totals.draftsAfter} draft rows are studio-only until Lee flips them live.`, "");
writeFileSync("docs/BANK-DIFF.md", L.join("\n"));
console.log(`BANK-DIFF.md written · ${JSON.stringify(totals)}`);

// ─────────────────────────────────────────────────────────── 7. APPLY

if (!APPLY) { console.log("dry run — nothing changed"); process.exit(0); }

const dirty = new Map<string, SceneRow>();
const touch = (sc: SceneRow) => dirty.set(sc.id, sc);
const mintId = (() => { let n = 0; return () => `ceq-e1m-${Date.now().toString(36)}-${n++}`; })();

// 7a. chapters
const chapterIdByTopic = new Map<string, string>();
for (const c of chapterPlan) {
  if (c.existing) {
    chapterIdByTopic.set(c.topic, c.existing.id);
    const patch: Record<string, unknown> = {};
    if (c.existing.chapter_number !== c.number) patch.chapter_number = c.number;
    if (norm(c.existing.chapter_name) !== norm(c.topic)) patch.chapter_name = c.topic;
    if (Object.keys(patch).length) {
      const { error } = await db.from("chapters").update(patch).eq("id", c.existing.id);
      if (error) throw new Error(`chapter update ${c.topic}: ${error.message}`);
    }
  } else {
    const { data: ins, error } = await db.from("chapters").insert({ chapter_name: c.topic, chapter_number: c.number, course_id: courseId }).select("id").single();
    if (error) throw new Error(`chapter create ${c.topic}: ${error.message}`);
    chapterIdByTopic.set(c.topic, (ins as { id: string }).id);
  }
}
if (easyPoints && easyPoints.chapter_number !== 0) {
  const { error } = await db.from("chapters").update({ chapter_number: 0 }).eq("id", easyPoints.id);
  if (error) throw new Error(`Easy Points renumber: ${error.message}`);
}

// 7b. reconcile master content into the authored sets
for (const s of masterSets) {
  let home = setHome.get(s.setStem);
  const chapterId = chapterIdByTopic.get(s.topic)!;
  if (!home) {
    const deckId = `deck-e1m-${norm(s.setStem).replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
    const scene: SceneRow = { id: crypto.randomUUID(), name: s.setStem, nodes_json: { setFile: true, schema_version: 5, decks: [{ id: deckId, name: s.setStem, payloadType: "cards", status: "live", parked: false, topicId: chapterId, sortOrder: 0 }], nodes: [], edges: [] } };
    const { error } = await db.from("canvas_scenes").insert({ id: scene.id, name: s.setStem, nodes_json: scene.nodes_json });
    if (error) throw new Error(`create set scene ${s.setStem}: ${error.message}`);
    home = { deck: scene.nodes_json.decks![0], scene, cards: [] };
    authored.set(deckId, home);
    setHome.set(s.setStem, home);
  }
  // deck: REINSTATED — live, unparked, master name/topic/order
  home.deck.status = "live";
  home.deck.parked = false;
  home.deck.name = s.setStem;
  home.deck.topicId = chapterId;
  home.deck.sortOrder = masterSets.filter((x) => x.topic === s.topic).indexOf(s);
  touch(home.scene);

  let maxOrder = Math.max(-1, ...home.cards.map((n) => Number(n.data?.stageOrder) || 0));
  for (const row of s.rows) {
    const ref = matches.get(row);
    if (ref) {
      const d = ref.node.data!;
      d.prompt = row.stem;
      if (!row.allEmpty) d.choices = row.choices.map((c, j) => ({ id: `c${j}`, text: c.text, correct: c.correct }));
      if (row.shorthand) d.shorthand = row.shorthand;
      if (row.needsExhibit) d.needsExhibit = row.needsExhibit; else delete d.needsExhibit;
      if (row.notes) d.masterNotes = row.notes; else delete d.masterNotes;
      if (row.status === "draft") d.draft = true; else delete d.draft;
      delete d.bankArchived;
      touch(ref.set.scene);
    } else {
      maxOrder += 1;
      const node: Node = {
        id: mintId(), type: "ceq", position: { x: 0, y: 0 }, selected: false,
        data: {
          kind: "ceq", title: s.setStem, prompt: row.stem,
          choices: row.choices.map((c, j) => ({ id: `c${j}`, text: c.text, correct: c.correct })),
          deckId: home.deck.id, deckMember: true, tucked: true, faceDown: false,
          stageOrder: maxOrder, slotIndex: maxOrder, deckCategory: "ceq:studio", deckPos: { x: 0, y: 0 },
          ...(row.shorthand ? { shorthand: row.shorthand } : {}),
          ...(row.needsExhibit ? { needsExhibit: row.needsExhibit } : {}),
          ...(row.notes ? { masterNotes: row.notes } : {}),
          ...(row.status === "draft" ? { draft: true } : {}),
          provenance: "exam1-master-choices-2026-08-28",
        },
      };
      (home.scene.nodes_json.nodes ??= []).push(node);
      home.cards.push(node);
      touch(home.scene);
    }
  }
}

// 7c. soft-archive the untraceable authored CEQs
for (const st of strays) {
  st.node.data!.bankArchived = now;
  st.node.data!.draft = true;
  touch(st.set.scene);
}

// 7d. the four trigger-word replacements (drafts, in the type set)
const th = setHome.get(typeSetStem)!;
let tOrder = Math.max(-1, ...th.cards.map((n) => Number(n.data?.stageOrder) || 0));
for (const t of triggersToAdd) {
  tOrder += 1;
  (th.scene.nodes_json.nodes ??= []).push({
    id: mintId(), type: "ceq", position: { x: 0, y: 0 }, selected: false,
    data: {
      kind: "ceq", title: th.deck.name, prompt: t.stem,
      choices: CATEGORY_CHOICES.map((c, j) => ({ id: `c${j}`, text: c, correct: c === t.correct })),
      deckId: th.deck.id, deckMember: true, tucked: true, faceDown: false,
      stageOrder: tOrder, slotIndex: tOrder, deckCategory: "ceq:studio", deckPos: { x: 0, y: 0 },
      shorthand: t.shorthand, draft: true, sourceTag: "lee-shortcut-triggers",
      provenance: "exam1-master-choices-2026-08-28",
    },
  } as Node);
  touch(th.scene);
}

// 7e. soft-archive the superseded starter-map sets
for (const s of e1sArchive) {
  s.deck.status = "archived";
  s.deck.parked = true;
  (s.deck as Record<string, unknown>).archivedReason = "superseded by exam1-master-choices reconcile 2026-08-28 (see docs/BANK-DIFF.md)";
  touch(s.scene);
}

// 7f. write every dirty scene once
for (const sc of dirty.values()) {
  const { error } = await db.from("canvas_scenes").update({ nodes_json: sc.nodes_json, name: sc.name }).eq("id", sc.id);
  if (error) throw new Error(`scene write ${sc.id}: ${error.message}`);
}
console.log(`APPLIED · scenes written: ${dirty.size}`);

// 7g. verify — recount what a student can now see
let visible = 0, drafts = 0, archivedCards = 0;
for (const set of [...authored.values(), ...e1sKept]) {
  if (set.deck.status !== "live" || set.deck.parked) continue;
  const all = (set.scene.nodes_json.nodes ?? []).filter((n) => n.type === "ceq" && (n.data as { deckId?: string } | undefined)?.deckId === set.deck.id);
  for (const n of all) {
    const d = n.data ?? {};
    if (d.noteOnly) continue;
    if (d.bankArchived) { archivedCards++; continue; }
    if (d.draft) { drafts++; continue; }
    visible++;
  }
}
console.log(`verify — student-visible: ${visible} (expected ${totals.studentVisibleAfter}) · drafts: ${drafts} · soft-archived cards: ${archivedCards}`);
if (visible !== totals.studentVisibleAfter) console.log("⚠ visible count differs from plan — investigate before trusting the player");
