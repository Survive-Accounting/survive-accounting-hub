// EXHIBIT LAB v2 — the law, the probes, the two models, and the seams.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { CYCLE_PROBES, CYCLE_STEPS, checkOrder, matchesStep, ringSteps, selfTestSteps, shuffledIds, stepAfter, stepBefore } from "./cycle-model";
import { appendSteps, attempt, canReveal, checkExpect, currentStep, next, prev, reveal, runSummary, setStepEnabled, skip, startRun, type RunStepDef } from "./probe-run";
import { EXHIBITS, PROBES, PROBE_IDS, parseRefKey, probeById, refKey, type ExhibitProbeRef } from "./probes";
import { ACCT_TYPES, RUBRIC_PROBES, SCENARIOS, checkFourQuestions, classifyTiming, entryBalanced, flipIt, flipSteps, fourQuestionRound, journalLines, signFor, timingSteps, whatIfSteps, whatIfWeDont, type Chip } from "./rubric-model";

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8").split("\r\n").join("\n");
const ROOT = join(import.meta.dir, "..", "..", "..", "..");

// ---------------------------------------------------------------- probes

describe("the probe library — first-class, ten seeded, stable ids", () => {
  test("exactly the ten, in canon order, with stable ids", () => {
    expect(PROBE_IDS).toEqual(["four_questions", "rewind", "fast_forward", "statement_check", "year_end_cross", "accrual_or_deferral", "date_check", "what_if_we_dont", "show_me_the_math", "flip_it"]);
    for (const p of PROBES) { expect(p.name.length).toBeGreaterThan(0); expect(p.ask.length).toBeGreaterThan(0); expect(p.student.length).toBeGreaterThan(0); }
  });
  test("the reference shape is addressable and round-trips as exhibit:probe", () => {
    const r: ExhibitProbeRef = { exhibit: "rubric", probe: "four_questions", stepsOff: ["r1.sign"] };
    expect(refKey(r)).toBe("rubric:four_questions");
    expect(parseRefKey("cycle:rewind")).toEqual({ exhibit: "cycle", probe: "rewind" });
    expect(parseRefKey("taccount:rewind")).toBeNull(); // deferred exhibits are NOT registered
    expect(parseRefKey("rubric:nope")).toBeNull();
    expect(probeById("flip_it")?.name).toBe("Flip It");
  });
  test("only the two in-scope exhibits exist — T-accounts / JE / F/S / Formulas are deferred", () => {
    expect(EXHIBITS.map((e) => e.id)).toEqual(["cycle", "rubric"]);
  });
});

// ------------------------------------------------------------- the law

const defs: RunStepDef[] = [
  { id: "a", prompt: "Q1?", kind: "choice", options: ["x", "y"], explain: "A is x", data: { expect: "x" } },
  { id: "b", prompt: "Q2?", kind: "sign", options: ["Debit", "Credit"], explain: "B is Dr", data: { expect: "Debit" }, optional: true },
  { id: "c", prompt: "Q3?", kind: "text", explain: "C free" },
];
const REF: ExhibitProbeRef = { exhibit: "rubric", probe: "four_questions" };

describe("THE ASK-FIRST LAW — structural, not discipline", () => {
  test("no reveal exists before an attempt or an explicit skip", () => {
    const r = startRun(REF, defs, 0);
    expect(reveal(r)).toBeNull();
    expect(canReveal(currentStep(r))).toBe(false);
  });
  test("next() refuses to advance an unresolved step — there is no third door", () => {
    const r = startRun(REF, defs, 0);
    expect(next(r, 10)).toBe(r); // same object: nothing happened
  });
  test("an attempt opens the reveal and allows next; correctness and ms are recorded", () => {
    let r = startRun(REF, defs, 100);
    r = attempt(r, "y", false, 2600);
    expect(reveal(r)).toEqual({ explain: "A is x", resolution: { kind: "attempt", response: "y", correct: false, ms: 2500 } });
    r = next(r, 2600);
    expect(currentStep(r)?.id).toBe("b");
    expect(reveal(r)).toBeNull(); // the NEXT step is ask-first again
  });
  test("an explicit skip is the other door — reveal opens, recorded as a skip", () => {
    let r = startRun(REF, defs, 0);
    r = skip(r, 900);
    expect(reveal(r)?.resolution).toEqual({ kind: "skip", ms: 900 });
    expect(currentStep(next(r))?.id).toBe("b");
  });
  test("a resolved step can't be re-attempted (the first answer stands)", () => {
    let r = startRun(REF, defs, 0);
    r = attempt(r, "x", true, 1);
    const again = attempt(r, "y", false, 2);
    expect(reveal(again)?.resolution).toEqual({ kind: "attempt", response: "x", correct: true, ms: 1 });
  });
  test("prev() walks back without hiding what was already revealed", () => {
    let r = startRun(REF, defs, 0);
    r = next(attempt(r, "x", true, 1), 1);
    r = prev(r, 2);
    expect(currentStep(r)?.id).toBe("a");
    expect(reveal(r)).not.toBeNull(); // history stays honest
  });
  test("per-run toggles: only OPTIONAL steps ahead of the cursor can be switched off", () => {
    let r = startRun(REF, defs, 0);
    r = setStepEnabled(r, "b", false);
    expect(r.steps[1].enabled).toBe(false);
    expect(setStepEnabled(r, "c", false).steps[2].enabled).toBe(true);   // not optional
    r = next(attempt(r, "x", true, 1), 1);
    expect(currentStep(r)?.id).toBe("c");                                 // b was skipped over
    expect(setStepEnabled(r, "b", true).steps[1].enabled).toBe(false);    // behind the cursor — locked
  });
  test("stepsOff on the ref pre-disables optional steps; run summary counts only live steps", () => {
    let r = startRun({ ...REF, stepsOff: ["b"] }, defs, 0);
    expect(r.steps.map((s) => s.enabled)).toEqual([true, false, true]);
    r = next(attempt(r, "x", true, 1), 1);
    r = next(skip(r, 2), 2);
    expect(r.done).toBe(true);
    expect(runSummary(r)).toEqual({ total: 2, answered: 1, correct: 1, skipped: 1 });
  });
  test("appendSteps revives a finished run (the Rubric's 'anything else?' loop)", () => {
    let r = startRun(REF, defs.slice(0, 1), 0);
    r = next(attempt(r, "x", true, 1), 1);
    expect(r.done).toBe(true);
    r = appendSteps(r, [{ id: "d", prompt: "more?", kind: "choice", options: ["y"], explain: "" }]);
    expect(r.done).toBe(false);
    expect(currentStep(r)?.id).toBe("d");
  });
  test("checkExpect grades option steps; ungraded steps return null", () => {
    expect(checkExpect(defs[0], "x")).toBe(true);
    expect(checkExpect(defs[0], "y")).toBe(false);
    expect(checkExpect(defs[2], "anything")).toBeNull();
  });
});

// --------------------------------------------------------------- rubric

describe("the Rubric model", () => {
  test("signs: +/− left of the equals, −/+ on L + E; revenue with equity, expenses opposite", () => {
    expect(ACCT_TYPES.map((t) => `${t.id}${t.sign}`)).toEqual(["A+/−", "L−/+", "E−/+", "R−/+", "X+/−"]);
    expect(signFor("A", true)).toBe("Dr"); expect(signFor("A", false)).toBe("Cr");
    expect(signFor("L", true)).toBe("Cr"); expect(signFor("R", true)).toBe("Cr"); expect(signFor("X", true)).toBe("Dr");
  });
  test("the chip tray resolves into a journal entry only when it balances", () => {
    const dr: Chip = { account: "Supplies", type: "A", dr: true, amount: 500 };
    const cr: Chip = { account: "Cash", type: "A", dr: false, amount: 500 };
    expect(entryBalanced([dr])).toBe(false);
    expect(entryBalanced([dr, cr])).toBe(true);
    expect(entryBalanced([dr, { ...cr, amount: 400 }])).toBe(false);
    expect(journalLines([cr, dr]).map((l) => `${l.indent ? "  " : ""}${l.account}`)).toEqual(["Supplies", "  Cash"]); // debits first, credits indented
  });
  test("the Four Questions grade against the scenario, one chip per round, type narrows the account list", () => {
    const sc = SCENARIOS[1]; // A/R + Service Revenue
    let placed: Chip[] = [];
    const t = checkFourQuestions(sc, placed, "type", {}, "Asset");
    expect(t.correct).toBe(true); expect(t.chip).toEqual({ type: "A" });
    expect(checkFourQuestions(sc, placed, "type", {}, "Liability").correct).toBe(false);
    const a = checkFourQuestions(sc, placed, "account", { type: "A" }, "Accounts Receivable");
    expect(a.correct).toBe(true);
    const s = checkFourQuestions(sc, placed, "sign", { type: "A", account: "Accounts Receivable" }, "Debit");
    expect(s.correct).toBe(true);
    placed = [{ account: "Accounts Receivable", type: "A", dr: true }];
    expect(checkFourQuestions(sc, placed, "else", {}, "Yes").correct).toBe(true);
    placed.push({ account: "Service Revenue", type: "R", dr: false });
    expect(checkFourQuestions(sc, placed, "else", {}, "No — it balances").correct).toBe(true);
    // step 3 is the optional one (per-run toggle), the other three are not
    expect(fourQuestionRound(1).map((d) => !!d.optional)).toEqual([false, false, true, false]);
  });
  test("What If We Don't traces the omission through A = L + E with over/understated tags", () => {
    expect(whatIfWeDont(SCENARIOS[1].entry)).toEqual([
      { item: "Assets (Accounts Receivable)", effect: "understated" },
      { item: "Revenue (Service Revenue)", effect: "understated" },
      { item: "Net income", effect: "understated" },
      { item: "Equity (via R/E)", effect: "understated" },
    ]);
    // an unrecorded expense: expenses understated → NI and equity OVERSTATED
    expect(whatIfWeDont(SCENARIOS[7].entry).find((f) => f.item === "Net income")?.effect).toBe("overstated");
    expect(whatIfSteps(SCENARIOS[1]).length).toBe(4);
  });
  test("Flip It mirrors every line; Accrual-or-Deferral classifies by cash timing", () => {
    expect(flipIt(SCENARIOS[0].entry).map((c) => c.dr)).toEqual([false, true]);
    expect(flipSteps(SCENARIOS[0])[0].data?.expect).toBe("Credit");
    expect(classifyTiming("before")).toBe("deferral"); expect(classifyTiming("after")).toBe("accrual"); expect(classifyTiming("same")).toBe("neither");
    expect(timingSteps(SCENARIOS[6])[0].data?.expect).toBe("Deferral");
    expect(timingSteps(SCENARIOS[7])[0].data?.expect).toBe("Accrual");
  });
  test("the Rubric runs the four required probes", () => {
    expect([...RUBRIC_PROBES].sort()).toEqual(["accrual_or_deferral", "flip_it", "four_questions", "what_if_we_dont"]);
  });
  test("content is generic — no campus, professor or date inside the exhibit", () => {
    const src = read("rubric-model.ts") + read("cycle-model.ts");
    expect(src).not.toMatch(/University|College|Professor|Prof\.|20\d\d-\d\d-\d\d/);
  });
});

// ---------------------------------------------------------------- cycle

describe("the Cycle model", () => {
  test("nine steps, the ring wraps both ways", () => {
    expect(CYCLE_STEPS.length).toBe(9);
    expect(stepBefore("analyze").id).toBe("post-closing-tb");
    expect(stepAfter("post-closing-tb").id).toBe("analyze");
  });
  test("self-test matching is lenient on wording, strict on the step", () => {
    const tb = CYCLE_STEPS[3];
    expect(matchesStep("unadjusted TB", tb)).toBe(true);
    expect(matchesStep("make the unadjusted trial balance", tb)).toBe(true);
    expect(matchesStep("adjusted trial balance", tb)).toBe(false);
    expect(matchesStep("", tb)).toBe(false);
  });
  test("build mode gives per-slot feedback; the pool is a stable shuffle", () => {
    expect(checkOrder(["analyze", "post", null])).toEqual([true, false, null, null, null, null, null, null, null]);
    expect(shuffledIds(7)).toEqual(shuffledIds(7));
    expect([...shuffledIds(7)].sort()).toEqual([...CYCLE_STEPS.map((s) => s.id)].sort());
  });
  test("rewind / fast-forward walk the ring as probes; self-test is ask-first text", () => {
    const rw = ringSteps("rewind", "journalize")[0];
    expect(rw.data?.expect).toBe("Analyze transactions");
    const ff = ringSteps("fast_forward", "journalize")[0];
    expect(ff.data?.expect).toBe("Post to T accounts");
    expect(ringSteps("rewind").length).toBe(9);
    expect(selfTestSteps().every((s) => s.kind === "text")).toBe(true);
    expect([...CYCLE_PROBES]).toEqual(["rewind", "fast_forward"]);
  });
});

// ---------------------------------------------------------------- seams

describe("seams built, consumers NOT built", () => {
  test("the reveal box renders only from reveal(run); option clicks go through the checker", () => {
    const runner = read("lab-runner.tsx");
    expect(runner).toContain("{rev && (");
    expect(runner).toContain("disabled={!resolved} onClick={handlers.next}");
    expect(runner).toContain("onClick={() => handlers.pickOption(i + 1)}");
    // exhibit surfaces never read a step's explain themselves
    expect(read("RubricExhibit.tsx")).not.toMatch(/step\??\.explain/);
    expect(read("CycleExhibit.tsx")).not.toMatch(/step\??\.explain/);
  });
  test("Space is NOT a Lab key — it belongs to the film controller", () => {
    const runner = read("lab-runner.tsx");
    const handler = runner.slice(runner.indexOf("const onKey = (e: KeyboardEvent) => {"), runner.indexOf("window.addEventListener(\"keydown\", onKey);"));
    expect(handler).not.toContain('e.key === " "');
  });
  test("probe_attempts: migration file exists (handed to Lee, not applied), writer is fail-soft, no read path", () => {
    const sql = readFileSync(join(ROOT, "migration", "supabase-migrations", "20260822_0900_probe_attempts.sql"), "utf8");
    expect(sql).toContain("create table if not exists public.probe_attempts");
    expect(sql).toContain("is_test boolean not null default false");
    expect(sql).toContain("alter table public.probe_attempts enable row level security;");
    const fns = readFileSync(join(ROOT, "src", "lib", "probe.functions.ts"), "utf8");
    expect(fns).toContain('db.from("probe_attempts").insert(rows)');
    expect(fns).not.toContain(".select("); // no consumer
    expect(read("probe-attempts.ts")).toContain("NO READ PATH");
  });
  test("misconception_tag exists on CeqChoice and nothing consumes it", () => {
    const types = readFileSync(join(ROOT, "src", "components", "canvas", "types.ts"), "utf8");
    expect(types).toContain("misconception_tag?: string;");
    const lab = ["probes.ts", "probe-run.ts", "rubric-model.ts", "cycle-model.ts", "lab-runner.tsx", "RubricExhibit.tsx", "CycleExhibit.tsx", "ExhibitLab.tsx"].map(read).join("\n");
    expect(lab).not.toContain("misconception_tag");
  });
  test("the canon exists at the repo root with the seeded sections", () => {
    const canon = readFileSync(join(ROOT, "SURVIVE-METHOD.md"), "utf8");
    for (const h of ["# The Survive Method", "## The Law", "## The Rubric", "## The Probes", "## Cheat Codes", "## Exhibits", "## The Survive Format"]) expect(canon).toContain(h);
    expect(canon).toContain("Ask first. Never explain before an attempt or an explicit skip.");
    expect(canon).toContain("The Cash Cheat Code");
  });
  test("no student route imports the Lab; the deferred exhibits are untouched", () => {
    const routes = join(ROOT, "src", "routes");
    for (const f of ["learn.tsx", "index.tsx"]) if (existsSync(join(routes, f))) expect(readFileSync(join(routes, f), "utf8")).not.toContain("exhibit-lab");
    expect(readFileSync(join(routes, "exhibit-lab.tsx"), "utf8")).toContain('{ name: "robots", content: "noindex" }');
  });
});
