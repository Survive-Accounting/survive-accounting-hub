// THE ACCOUNTING CYCLE — model (Exhibit Lab v2, §5). Pure; tested.
//
// The nine steps around the oval, each with a DEFINITION (shown on click in
// the centre — after an attempt or a skip, per the law), plus the three modes
// the Lab runs: SELF-TEST (type the step), BUILD (place the steps in order,
// immediate feedback), and the two probes that walk the ring: REWIND ("what
// comes before this?") and FAST-FORWARD ("what comes next?").
//
// Generic to any campus — the canonical cycle, no course-specific wording.
import type { RunStepDef } from "./probe-run";
import type { ProbeId } from "./probes";

export interface CycleStepDef {
  id: string;
  text: string;
  definition: string;
  /** Words a typed answer must contain (any one row) to count — lenient on
   *  purpose: "unadjusted TB" and "make the unadjusted trial balance" both pass. */
  keys: string[][];
}

export const CYCLE_STEPS: readonly CycleStepDef[] = [
  { id: "analyze", text: "Analyze transactions", definition: "Read each source document and decide which accounts it touches and by how much — the Four Questions, before anything is written.", keys: [["analyz"], ["identify", "transact"]] },
  { id: "journalize", text: "Record journal entries", definition: "Write each transaction as a journal entry: debits first, credits indented, debits = credits.", keys: [["journal"], ["record", "entr"]] },
  { id: "post", text: "Post to T accounts", definition: "Copy every journal line into its ledger (T) account so each account shows its own running balance.", keys: [["post"], ["ledger"], ["t account"], ["t-account"]] },
  { id: "unadjusted-tb", text: "Make unadjusted trial balance", definition: "List every account balance; total debits must equal total credits BEFORE adjustments.", keys: [["unadjusted"], ["first", "trial"]] },
  { id: "adjust", text: "Record adjusting entries", definition: "Year-end accruals and deferrals: recognize revenue earned and expenses incurred that cash hasn't caught up with.", keys: [["adjust"]] },
  { id: "adjusted-tb", text: "Make adjusted trial balance", definition: "The trial balance again, now with the adjustments in — the numbers the statements are built from.", keys: [["adjusted", "trial"], ["adjusted tb"]] },
  { id: "statements", text: "Prep financial statements", definition: "Income statement → statement of retained earnings → balance sheet, in that order, because each feeds the next.", keys: [["statement"], ["financial"]] },
  { id: "close", text: "Record closing entries", definition: "Zero out the temporary accounts (revenues, expenses, dividends) into Retained Earnings so next year starts clean.", keys: [["clos"]] },
  { id: "post-closing-tb", text: "Make post-closing trial balance", definition: "One last trial balance with only permanent accounts — proof the books are ready for the new period.", keys: [["post-closing"], ["post closing"], ["postclosing"]] },
] as const;

export const cycleStep = (id: string): CycleStepDef | undefined => CYCLE_STEPS.find((s) => s.id === id);
export const cycleIndex = (id: string): number => CYCLE_STEPS.findIndex((s) => s.id === id);

/** The ring wraps: before step 1 is step 9, after step 9 is step 1. */
export const stepBefore = (id: string): CycleStepDef => CYCLE_STEPS[(cycleIndex(id) - 1 + CYCLE_STEPS.length) % CYCLE_STEPS.length];
export const stepAfter = (id: string): CycleStepDef => CYCLE_STEPS[(cycleIndex(id) + 1) % CYCLE_STEPS.length];

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9\- ]+/g, " ").replace(/\s+/g, " ").trim();

/** SELF-TEST matching: a typed answer counts when any key-row's words all
 *  appear in it. Lenient by design — the self-test checks recall of the STEP,
 *  not the spelling of the label. */
export function matchesStep(typed: string, step: CycleStepDef): boolean {
  const t = norm(typed);
  if (!t) return false;
  return step.keys.some((row) => row.every((k) => t.includes(norm(k))));
}

/** BUILD MODE feedback: for each slot, is the placed step id the right one? */
export function checkOrder(placed: (string | null)[]): (boolean | null)[] {
  return CYCLE_STEPS.map((s, i) => (placed[i] == null ? null : placed[i] === s.id));
}

/** A deterministic shuffle for the build pool (seeded so screenshots/tests are
 *  stable; the Lab reseeds per run). */
export function shuffledIds(seed = 7): string[] {
  const ids = CYCLE_STEPS.map((s) => s.id);
  let x = seed;
  for (let i = ids.length - 1; i > 0; i--) { x = (x * 9301 + 49297) % 233280; const j = Math.floor((x / 233280) * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids;
}

// -------------------------------------------------- probes → cycle steps

const OPTIONS = CYCLE_STEPS.map((s) => s.text);

/** REWIND / FAST-FORWARD across the ring: for the seeded step (default: walk
 *  every step), which comes before / after? */
export function ringSteps(probe: "rewind" | "fast_forward", fromId?: string): RunStepDef[] {
  const targets = fromId && cycleStep(fromId) ? [cycleStep(fromId)!] : [...CYCLE_STEPS];
  return targets.map((s) => {
    const ans = probe === "rewind" ? stepBefore(s.id) : stepAfter(s.id);
    return {
      id: `${probe}.${s.id}`,
      prompt: probe === "rewind" ? `What comes right BEFORE "${s.text}"?` : `What comes right AFTER "${s.text}"?`,
      kind: "choice",
      options: OPTIONS,
      explain: `${ans.text} — ${ans.definition}`,
      data: { expect: ans.text, stepId: s.id, answerId: ans.id },
    };
  });
}

/** SELF-TEST as a probe run: type each step in order, Skip allowed (the law). */
export function selfTestSteps(): RunStepDef[] {
  return CYCLE_STEPS.map((s, i) => ({
    id: `st.${s.id}`,
    prompt: `Step ${i + 1} of ${CYCLE_STEPS.length} — type it.`,
    kind: "text",
    explain: `${s.text} — ${s.definition}`,
    data: { stepId: s.id },
  }));
}

export { checkExpect } from "./probe-run";

/** Which probes this exhibit can run (§5). */
export const CYCLE_PROBES: readonly ProbeId[] = ["rewind", "fast_forward"] as const;
