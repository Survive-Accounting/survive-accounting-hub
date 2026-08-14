// EXAM 1 MASTER SEED (core) — reconciles data/exam1-master.csv (the SOURCE OF TRUTH for Exam 1's
// topics/sets/stems/shorthands/choices) into the canvas scenes. Pure logic, NO react-start imports,
// so it can run both as a server fn (exam1-seed.functions.ts) and from a bun script for the
// dry-run/apply ritual.
//
// LAW (Lee's import prompt — do not soften):
//  1. Topics match by EXACT name under Intro 1; any missing topic is FATAL — stop, never create.
//  2. Sets match by (topic, normalized set_stem): matched → update in place; else CREATE draft.
//     App sets absent from the file are REPORTED, never deleted.
//  3. CEQs match by normalized ceq_stem within the set: matched → update shorthand/choices/correct/
//     exhibit/notes IN PLACE (clips + free/paid flags preserved); file-only → create; app-only →
//     report both sides per set so re-stemmed pairs can be mapped by hand. Existing CEQs are NOT
//     reordered (film order is sacred); new ones append in ceq_num order.
//  4. Choices: the file WINS — except a row with ALL FOUR choice cells empty leaves the CEQ's
//     existing choices untouched ("no opinion", not "delete my choices"). Leading * marks correct.
//  5. shorthand → CeqCard.shorthand (new field; feeds player nav labels).
//  6. status: 'draft' rows create drafts; 'live-candidate' rows never touch live/free state.
//  NEVER: delete a set or CEQ; touch Exams 2/3/Final, campuses, maps, entitlements.

export interface Exam1Row {
  line: number; topic: string; setStem: string; ceqNum: number; shorthand: string; ceqStem: string;
  choices: { text: string; correct: boolean }[]; allChoicesEmpty: boolean;
  needsExhibit: string; notes: string; status: string;
}

export interface Exam1SeedReport {
  fatalMissingTopics: string[];
  setsCreated: string[]; setsUpdated: string[]; setsRenamed: string[];
  ceqsCreated: number; ceqsUpdated: number;
  perTopicFile: { topic: string; ceqs: number }[];
  /** per set: stems in the APP but not the file (never deleted) + stems the file ADDED — printed
   *  together so a re-stemmed pair is visually mappable. */
  unmatched: { set: string; appOnly: string[]; fileAdded: string[] }[];
  appSetsNotInFile: string[];
  totalFileCeqs: number;
  applied: boolean;
  /** apply-run verification */
  totalAppCeqsAfter?: number; perTopicAppAfter?: { topic: string; ceqs: number }[]; deletions?: number;
}

type Db = { from: (t: string) => any };

/** Minimal RFC-4180 parser (quotes, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cell = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Matching normalization: kill every quote variant, collapse whitespace, lowercase. */
const norm = (s: string): string => (s ?? "").replace(/["“”„'‘’]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export function parseExam1Csv(text: string): { rows: Exam1Row[]; errors: string[] } {
  const raw = parseCsv(text);
  const errors: string[] = [];
  if (!raw.length) return { rows: [], errors: ["Empty file."] };
  const header = raw[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  for (const col of ["topic_name", "set_stem", "ceq_num", "shorthand", "ceq_stem", "choice_a", "choice_b", "choice_c", "choice_d", "needs_exhibit", "notes", "status"]) {
    if (idx(col) < 0) errors.push(`Missing column: ${col}`);
  }
  if (errors.length) return { rows: [], errors };
  const rows: Exam1Row[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    const cell = (c: string) => (r[idx(c)] ?? "").trim();
    // FIFTH CHOICE ESCAPE HATCH — the sheet has four choice columns, but a handful of authored
    // questions have five choices (A–D + *Expense). Those rows carry "| choice_e: *Expense" inside
    // notes; lift it out as a real 5th choice and keep the rest of the note.
    let notes = cell("notes");
    const rawChoices = ["choice_a", "choice_b", "choice_c", "choice_d"].map(cell);
    const eMatch = notes.match(/\|?\s*choice_e:\s*(.+)\s*$/);
    if (eMatch) { rawChoices.push(eMatch[1].trim()); notes = notes.replace(eMatch[0], "").replace(/\s*\|\s*$/, "").trim(); }
    const nonEmpty = rawChoices.filter((c) => c !== "");
    const choices = nonEmpty.map((c) => ({ text: c.replace(/^\*\s*/, ""), correct: c.startsWith("*") }));
    if (nonEmpty.length > 0 && choices.filter((c) => c.correct).length !== 1) errors.push(`Row ${i + 1}: expected exactly one *-marked correct choice (got ${choices.filter((c) => c.correct).length}).`);
    if (!cell("topic_name") || !cell("set_stem") || !cell("ceq_stem")) { errors.push(`Row ${i + 1}: topic_name / set_stem / ceq_stem must all be present.`); continue; }
    rows.push({
      line: i + 1, topic: cell("topic_name"), setStem: cell("set_stem"), ceqNum: parseInt(cell("ceq_num"), 10) || 0,
      shorthand: cell("shorthand"), ceqStem: cell("ceq_stem"), choices, allChoicesEmpty: nonEmpty.length === 0,
      needsExhibit: cell("needs_exhibit"), notes, status: cell("status"),
    });
  }
  return { rows, errors };
}

let _seq = 0;
const genId = (kind: string) => { _seq += 1; return `${kind}-${Date.now().toString(36)}-sd${_seq}`; };

/** RENAME MAP (Lee, "apply with renames") — the master sheet re-stemmed five set names. Matching
 *  by name alone would CREATE five near-duplicates and strand the old sets; this maps the file's
 *  NEW stem (normalized) → the OLD app name (normalized) so those sets match, get renamed in
 *  place, and their existing CEQs reconcile normally (clips/chains/free flags carried forward). */
const SET_RENAMES = new Map<string, string>([
  [norm(`"Find the error in this trial balance — and which errors DON'T break it?"`), norm(`"Find the error in this trial balance."`)],
  [norm(`"Is [           ] a deferral or an accrual?"`), norm(`"Is [           ] a deferral or accrual?"`)],
  [norm(`"What is the correct order we prepare financial statements?"`), norm(`"What order do we prepare them in?"`)],
  [norm(`"What is the journal entry to close [  ]?"`), norm(`"What is the entry to close [  ]"?`)],
  [norm(`"How do closing entries change with net income vs. a net loss?"`), norm(`"How does closing change with a net loss?"`)],
]);

type Deck = Record<string, unknown> & { id: string; name?: string; payloadType?: string; status?: string; topicId?: string | null; courseId?: string | null; sortOrder?: number };
type Node = { id: string; type?: string; data?: Record<string, unknown> & { deckId?: string; prompt?: string; stageOrder?: number; choices?: unknown[] } };
type Scene = { id: string; name?: string; nodes_json?: { decks?: Deck[]; nodes?: Node[] } & Record<string, unknown> };

export async function runExam1Seed(db: Db, csvText: string, apply: boolean): Promise<Exam1SeedReport | { errors: string[] }> {
  const { rows, errors } = parseExam1Csv(csvText);
  if (errors.length) return { errors };

  // 1. TOPICS — exact-name match under Intro 1; missing = FATAL.
  const { data: cs } = await db.from("courses").select("id,course_family").eq("course_family", "intro_1").limit(1);
  const courseId = (cs?.[0] as { id: string } | undefined)?.id;
  if (!courseId) return { errors: ["Intro 1 course not found."] };
  const { data: chs } = await db.from("chapters").select("id,chapter_name,status").eq("course_id", courseId);
  const topicIdByName = new Map<string, string>();
  for (const c of (chs ?? []) as { id: string; chapter_name: string | null; status?: string }[]) {
    if (c.status === "archived") continue;
    topicIdByName.set((c.chapter_name ?? "").trim(), c.id);
  }
  const fileTopics = [...new Set(rows.map((r) => r.topic))];
  const fatalMissingTopics = fileTopics.filter((t) => !topicIdByName.has(t));
  const report: Exam1SeedReport = {
    fatalMissingTopics, setsCreated: [], setsUpdated: [], setsRenamed: [], ceqsCreated: 0, ceqsUpdated: 0,
    perTopicFile: fileTopics.map((t) => ({ topic: t, ceqs: rows.filter((r) => r.topic === t).length })),
    unmatched: [], appSetsNotInFile: [], totalFileCeqs: rows.length, applied: false,
  };
  if (fatalMissingTopics.length) return report; // STOP — a rename happened the file doesn't know about.

  // 2. SCENES — all decks/nodes; new content lands in the WORKING scene (most card decks).
  const { data: scenes, error: sErr } = await db.from("canvas_scenes").select("id,name,nodes_json");
  if (sErr) return { errors: [sErr.message] };
  // ARCHIVED ROWS ARE INVISIBLE (frames rename): the pre-split archive still carries
  // every deck id, so without this filter a deck could map to the archive and the
  // seed would write cards the app never loads (it did — 11 Trial Balances cards on
  // 08-14; they sit in the archive as harmless baggage, rewritten here correctly).
  const all = ((scenes ?? []) as Scene[]).filter((s) => !(s.nodes_json as { archived?: boolean } | null)?.archived);
  let working: Scene | null = null; let best = -1;
  for (const s of all) {
    const n = (s.nodes_json?.decks ?? []).filter((d) => d.payloadType === "cards").length;
    if (n > best) { best = n; working = s; }
  }
  if (!working) return { errors: ["No canvas scene found."] };
  const dirty = new Set<string>();
  const sceneOfDeck = new Map<string, Scene>();
  const intro1TopicIds = new Set(topicIdByName.values());
  const decksByTopic = new Map<string, Deck[]>();
  for (const s of all) for (const d of s.nodes_json?.decks ?? []) {
    if (d.payloadType !== "cards" || !d.topicId || !intro1TopicIds.has(d.topicId)) continue;
    sceneOfDeck.set(d.id, s);
    const l = decksByTopic.get(d.topicId) ?? []; l.push(d); decksByTopic.set(d.topicId, l);
  }
  const nodesOfDeck = (deckId: string): Node[] => {
    const s = sceneOfDeck.get(deckId); if (!s) return [];
    return (s.nodes_json?.nodes ?? []).filter((n) => n.type === "ceq" && n.data?.deckId === deckId)
      .sort((a, b) => ((a.data?.stageOrder as number) ?? 0) - ((b.data?.stageOrder as number) ?? 0));
  };

  // 3. RECONCILE, file order. Group rows by (topic, setStem).
  const groups: { topic: string; setStem: string; rows: Exam1Row[] }[] = [];
  for (const r of rows) {
    const g = groups.find((x) => x.topic === r.topic && norm(x.setStem) === norm(r.setStem));
    if (g) g.rows.push(r); else groups.push({ topic: r.topic, setStem: r.setStem, rows: [r] });
  }
  const matchedDeckIds = new Set<string>();
  for (const g of groups) {
    const topicId = topicIdByName.get(g.topic) as string;
    let existing = (decksByTopic.get(topicId) ?? []).find((d) => norm(d.name ?? "") === norm(g.setStem));
    let renamedFrom: string | null = null;
    if (!existing) {
      const oldName = SET_RENAMES.get(norm(g.setStem));
      if (oldName) {
        existing = (decksByTopic.get(topicId) ?? []).find((d) => norm(d.name ?? "") === oldName);
        if (existing) renamedFrom = existing.name ?? "";
      }
    }
    g.rows.sort((a, b) => a.ceqNum - b.ceqNum);
    let deck: Deck; let scene: Scene;
    if (existing) {
      deck = existing; scene = sceneOfDeck.get(existing.id) as Scene;
      matchedDeckIds.add(existing.id);
      if (renamedFrom !== null) {
        report.setsRenamed.push(`${g.topic}: "${renamedFrom}" → ${g.setStem}`);
        if (apply) {
          existing.name = g.setStem;
          for (const n of nodesOfDeck(existing.id)) if (n.data) n.data.title = g.setStem; // keep card titles in sync
          dirty.add(scene.id);
        }
      } else {
        report.setsUpdated.push(`${g.topic} → ${g.setStem}`);
      }
    } else {
      const maxSort = Math.max(-1, ...(decksByTopic.get(topicId) ?? []).map((d) => d.sortOrder ?? 0));
      deck = { id: genId("deck"), name: g.setStem, slots: [], access: "free", layout: undefined, status: "draft", topicId, courseId, payloadType: "cards", sortOrder: maxSort + 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      scene = working;
      report.setsCreated.push(`${g.topic} → ${g.setStem}`);
      if (apply) {
        working.nodes_json = working.nodes_json ?? { decks: [], nodes: [] };
        working.nodes_json.decks = [...(working.nodes_json.decks ?? []), deck];
        dirty.add(working.id);
        sceneOfDeck.set(deck.id, working);
        const l = decksByTopic.get(topicId) ?? []; l.push(deck); decksByTopic.set(topicId, l);
      }
    }
    // CEQ reconcile within the set.
    const appNodes = existing ? nodesOfDeck(deck.id) : [];
    const matchedNodeIds = new Set<string>();
    const fileAdded: string[] = [];
    let appendAt = appNodes.length;
    for (const r of g.rows) {
      const hit = appNodes.find((n) => !matchedNodeIds.has(n.id) && norm((n.data?.prompt as string) ?? "") === norm(r.ceqStem));
      if (hit) {
        matchedNodeIds.add(hit.id);
        report.ceqsUpdated++;
        if (apply && hit.data) {
          hit.data.shorthand = r.shorthand || undefined;
          hit.data.exhibit = r.needsExhibit || undefined;
          hit.data.seedNote = r.notes || undefined;
          if (!r.allChoicesEmpty) {
            // The file WINS on choice text/correctness — but an existing choice with the SAME text
            // keeps its identity (id + memo chain + flags). Regenerating ids here would silently
            // orphan every chained memo on the authored sets, which is most of Lee's teaching work.
            const old = (hit.data.choices ?? []) as ({ id: string; text?: string } & Record<string, unknown>)[];
            const used = new Set<string>();
            hit.data.choices = r.choices.map((c) => {
              const prev = old.find((o) => !used.has(o.id) && norm(o.text ?? "") === norm(c.text));
              if (prev) { used.add(prev.id); return { ...prev, text: c.text, correct: c.correct }; }
              return { id: genId("ch"), text: c.text, correct: c.correct };
            });
          }
          dirty.add((sceneOfDeck.get(deck.id) as Scene).id);
        }
      } else {
        report.ceqsCreated++;
        fileAdded.push(r.ceqStem);
        if (apply) {
          const node = { id: genId("ceq"), type: "ceq", position: { x: 520, y: 210 }, data: { kind: "ceq", title: deck.name, prompt: r.ceqStem, choices: r.choices.map((c) => ({ id: genId("ch"), text: c.text, correct: c.correct })), deckId: deck.id, deckMember: true, tucked: true, stageOrder: appendAt, slotIndex: appendAt, deckCategory: "ceq:studio", deckPos: { x: 520, y: 210 }, shorthand: r.shorthand || undefined, exhibit: r.needsExhibit || undefined, seedNote: r.notes || undefined } };
          const s = sceneOfDeck.get(deck.id) as Scene;
          s.nodes_json = s.nodes_json ?? { decks: [], nodes: [] };
          s.nodes_json.nodes = [...(s.nodes_json.nodes ?? []), node as never];
          dirty.add(s.id);
        }
        appendAt++;
      }
    }
    const appOnly = appNodes.filter((n) => !matchedNodeIds.has(n.id)).map((n) => ((n.data?.prompt as string) ?? "").slice(0, 70));
    if (appOnly.length || fileAdded.length) report.unmatched.push({ set: `${g.topic} → ${g.setStem}`, appOnly, fileAdded: fileAdded.map((s) => s.slice(0, 70)) });
  }
  // App sets under Intro-1 topics that the file never mentions — reported, untouched.
  for (const [topicId, ds] of decksByTopic) {
    const tName = [...topicIdByName.entries()].find(([, id]) => id === topicId)?.[0] ?? topicId.slice(0, 8);
    for (const d of ds) if (!matchedDeckIds.has(d.id) && !report.setsCreated.some((s) => s.endsWith(`→ ${d.name}`))) report.appSetsNotInFile.push(`${tName} → ${d.name ?? d.id}`);
  }

  // 4. WRITE (apply only) — scene JSON updates; nothing is ever removed.
  if (apply) {
    for (const sid of dirty) {
      const s = all.find((x) => x.id === sid) as Scene;
      const { error } = await db.from("canvas_scenes").update({ nodes_json: s.nodes_json }).eq("id", sid);
      if (error) return { errors: [`Write failed for scene ${sid}: ${error.message} — earlier scene writes may have applied; re-run dry-run to see state.`] };
    }
    report.applied = true;
    // verification: per-topic app counts after
    let total = 0;
    report.perTopicAppAfter = fileTopics.map((t) => {
      const tid = topicIdByName.get(t) as string;
      const n = (decksByTopic.get(tid) ?? []).reduce((a, d) => a + nodesOfDeck(d.id).length, 0);
      total += n;
      return { topic: t, ceqs: n };
    });
    report.totalAppCeqsAfter = total;
    report.deletions = 0; // by construction — no removal path exists in this module
  }
  return report;
}
