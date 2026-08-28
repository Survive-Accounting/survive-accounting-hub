// EXAM 1 GLOBAL STARTER MAP — canonical plan builder (PURE: no DB, no fs, no crypto).
// Turns the workbook's `Claude Import` rows into the deterministic curriculum plan that the
// importer applies: 6 topics → 25 subtopic sets → 280 CEQs. Every id is derived from stable
// keys so a second run produces byte-identical output (idempotent). This file is import-safe
// for both Node scripts and the app bundle — keep it dependency-free.

/** One row of the workbook's `Claude Import` sheet (already string-normalized). */
export interface ImportRow {
  topicOrder: number;
  topic: string;
  subtopicOrder: number;
  subtopic: string;
  questionText: string;
  choices: string[]; // Answer Choice #1..#5, blanks dropped, in order
  correctIndex: number; // 1-based, into the ORIGINAL (pre-drop) choice list
  questionKey: string;
  feedback: string;
  source: string;
  originalCeqId: string; // "" for new rows
  include: boolean;
}

export interface CeqPlan {
  ceqId: string; // reused Original CEQ ID, or `ceq-e1s-<QuestionKey>` for new
  stageOrder: number; // 0-based within the set (workbook order)
  prompt: string;
  shorthand: string | null;
  choices: { id: string; text: string; correct: boolean; feedback: string | null }[];
  reused: boolean;
  questionKey: string;
  source: string;
}

export interface SetPlan {
  deckId: string; // `deck-e1s-<topicOrder>-<subtopicOrder>`
  sceneKey: string; // stable key hashed to a scene uuid by the importer
  name: string; // student-facing set name = subtopic name
  topicOrder: number;
  subtopicOrder: number;
  sortOrder: number; // subtopic order within the topic
  ceqs: CeqPlan[];
}

export interface TopicPlan {
  order: number;
  canonicalName: string;
  legacyName: string;
  anchorChapterId: string; // existing chapters.id we reuse (rename to canonicalName)
  sets: SetPlan[];
}

export interface Plan {
  topics: TopicPlan[];
  sets: SetPlan[];
  ceqCount: number;
  errors: string[];
}

// ---- RECONCILIATION: the 6 canonical topics reuse these existing Intro-1 chapter ids ----------
// (Intro 1 course 11111111-…; anchors verified live 2026-08-25.) The importer resolves each topic
// by anchor id first (survives the rename), then renames the chapter to the canonical name.
export const COURSE_ID = "11111111-1111-1111-1111-111111111111";
export const STARTER_EXAM_NAME = "Exam 1";
export const TOPIC_RECONCILIATION: { order: number; canonicalName: string; legacyName: string; anchorChapterId: string }[] = [
  { order: 1, canonicalName: "Easy Points", legacyName: "The Accounting Cycle", anchorChapterId: "e211854f-3ff4-4d5d-ba50-c7ccba24f0bf" },
  { order: 2, canonicalName: "Analyzing Transactions", legacyName: "Analyzing Transactions", anchorChapterId: "aa3bfc7a-a515-463c-9962-8e36a787bc52" },
  { order: 3, canonicalName: "Recording Journal Entries", legacyName: "Recording Journal Entries", anchorChapterId: "7a2f37f6-e211-4990-8674-a877ec3d602e" },
  { order: 4, canonicalName: "Adjusting Entries & Trial Balance", legacyName: "Adjusting Entries", anchorChapterId: "53738f41-508c-47ee-acf3-a55d4956eaf4" },
  { order: 5, canonicalName: "Financial Statements", legacyName: "Financial Statements", anchorChapterId: "520269db-48ed-4664-8f14-27cbc2a9f518" },
  { order: 6, canonicalName: "Closing Entries", legacyName: "Closing Entries", anchorChapterId: "8c60634f-08d7-4959-b7bb-930979ad351b" },
];
/** Chapter dropped from Exam 1 by this reset — its content folds into topic 4. Kept in the DB
 *  (not deleted) but removed from every Exam-1 grouping and its old set parked. */
export const DROPPED_FROM_EXAM1_CHAPTER_ID = "5b338fc7-b9cc-4fed-9285-24fb335c8a75"; // Trial Balances

// Current master-bank shape (Editorial Pass v1, 2026-08-28). Informational only — the bank is now
// editable, so counts are reported, NOT hard-enforced. Structural checks (choices/correct/dup
// keys/dup prompts/unknown topic) remain blocking; a count that drifts as Lee adds/removes
// questions is expected, not an error.
export const EXPECTED = { topics: 6, subtopics: 25, ceqs: 274 } as const;

export const deckIdFor = (topicOrder: number, subtopicOrder: number) => `deck-e1s-${topicOrder}-${subtopicOrder}`;
export const sceneKeyFor = (topicOrder: number, subtopicOrder: number) => `exam1-starter/set/${topicOrder}.${subtopicOrder}`;
export const ceqIdFor = (row: ImportRow) => (row.originalCeqId ? row.originalCeqId : `ceq-e1s-${row.questionKey}`);
export const choiceIdFor = (ceqId: string, idx0: number) => `${ceqId}-c${idx0 + 1}`;

const canonicalByName = new Map(TOPIC_RECONCILIATION.map((t) => [t.canonicalName.toLowerCase(), t]));

/** Build the deterministic plan from YES rows. Never throws — problems land in `errors`. */
export function buildPlan(rows: ImportRow[]): Plan {
  const errors: string[] = [];
  const yes = rows.filter((r) => r.include);

  // group by (topicOrder, subtopicOrder) preserving workbook row order
  type Grp = { topicOrder: number; topic: string; subtopicOrder: number; subtopic: string; rows: ImportRow[] };
  const groups = new Map<string, Grp>();
  const seenKeys = new Map<string, number>();
  const seenCeqIds = new Map<string, number>();
  for (const r of yes) {
    // topic must be one of the six canonical names
    const canon = canonicalByName.get(r.topic.trim().toLowerCase());
    if (!canon) { errors.push(`Unknown canonical topic "${r.topic}" (key ${r.questionKey}).`); continue; }
    if (canon.order !== r.topicOrder) errors.push(`Topic order ${r.topicOrder} != expected ${canon.order} for "${r.topic}" (key ${r.questionKey}).`);
    const gk = `${r.topicOrder}::${r.subtopicOrder}`;
    let g = groups.get(gk);
    if (!g) { g = { topicOrder: r.topicOrder, topic: r.topic.trim(), subtopicOrder: r.subtopicOrder, subtopic: r.subtopic.trim(), rows: [] }; groups.set(gk, g); }
    if (g.subtopic !== r.subtopic.trim()) errors.push(`Subtopic name mismatch in ${gk}: "${g.subtopic}" vs "${r.subtopic}".`);
    g.rows.push(r);
    seenKeys.set(r.questionKey, (seenKeys.get(r.questionKey) ?? 0) + 1);
  }
  for (const [k, n] of seenKeys) if (n > 1) errors.push(`Duplicate Question Key "${k}" (${n}x).`);

  const topics: TopicPlan[] = TOPIC_RECONCILIATION.map((t) => ({ ...t, sets: [] as SetPlan[] }));
  const topicByOrder = new Map(topics.map((t) => [t.order, t]));
  const allSets: SetPlan[] = [];

  for (const g of [...groups.values()].sort((a, b) => a.topicOrder - b.topicOrder || a.subtopicOrder - b.subtopicOrder)) {
    const set: SetPlan = {
      deckId: deckIdFor(g.topicOrder, g.subtopicOrder),
      sceneKey: sceneKeyFor(g.topicOrder, g.subtopicOrder),
      name: g.subtopic,
      topicOrder: g.topicOrder,
      subtopicOrder: g.subtopicOrder,
      sortOrder: g.subtopicOrder,
      ceqs: [],
    };
    const promptsSeen = new Set<string>();
    g.rows.forEach((r, i) => {
      const ceqId = ceqIdFor(r);
      seenCeqIds.set(ceqId, (seenCeqIds.get(ceqId) ?? 0) + 1);
      if (r.choices.length < 2 || r.choices.length > 5) errors.push(`Row key ${r.questionKey}: needs 2–5 choices, has ${r.choices.length}.`);
      if (!(r.correctIndex >= 1 && r.correctIndex <= r.choices.length)) errors.push(`Row key ${r.questionKey}: correct index ${r.correctIndex} out of range (1–${r.choices.length}).`);
      const pl = r.questionText.trim().toLowerCase();
      if (promptsSeen.has(pl)) errors.push(`Duplicate prompt within ${g.topic} / ${g.subtopic}: "${r.questionText.slice(0, 48)}".`);
      promptsSeen.add(pl);
      const choices = r.choices.map((text, idx) => {
        const correct = idx + 1 === r.correctIndex;
        return { id: choiceIdFor(ceqId, idx), text: text.trim(), correct, feedback: correct && r.feedback ? r.feedback.trim() : null };
      });
      set.ceqs.push({ ceqId, stageOrder: i, prompt: r.questionText.trim(), shorthand: null, choices, reused: !!r.originalCeqId, questionKey: r.questionKey, source: r.source });
    });
    const topic = topicByOrder.get(g.topicOrder);
    if (topic) topic.sets.push(set);
    allSets.push(set);
  }
  for (const [id, n] of seenCeqIds) if (n > 1) errors.push(`Duplicate CEQ id "${id}" (${n}x).`);

  const ceqCount = allSets.reduce((a, s) => a + s.ceqs.length, 0);
  // Counts are informational (the bank is editable) — never a blocking error. A set with zero
  // questions IS worth flagging (a subtopic with no rows would render empty for students).
  for (const s of allSets) if (!s.ceqs.length) errors.push(`Subtopic "${s.name}" (${s.topicOrder}.${s.subtopicOrder}) has no questions.`);

  return { topics, sets: allSets, ceqCount, errors };
}
