// EXHIBIT LAB v2 — the law, the probes, the two models, and the seams.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { CYCLE_PROBES, CYCLE_STEPS, checkOrder, matchesStep, ringSteps, selfTestSteps, shuffledIds, stepAfter, stepBefore } from "./cycle-model";
import { appendSteps, attempt, canReveal, checkExpect, currentStep, next, prev, reveal, runSummary, setStepEnabled, skip, startRun, type RunStepDef } from "./probe-run";
import { EXHIBITS, PROBES, PROBE_IDS, parseRefKey, probeById, refKey, type ExhibitProbeRef } from "./probes";
import { ALL_COA_NODES, ALL_OFF, BRIDGE_LABEL, BRIDGE_TITLE, CONTRA, DEFS, MODES, MODE_IDS, MOVEMENT_GLYPH, REVEAL_LABELS, REVEAL_LAST, STATEMENT_OF, coaGroups, coaNodes, isContra, matchMode, modeById, nextMovement, nextReveal, prevReveal, signPair, tSides, visibleAt } from "./rubric-view";
import { ACCOUNTS, ACCT_TYPES, RUBRIC_PROBES, SCENARIOS, checkFourQuestions, classifyTiming, entryBalanced, flipIt, flipSteps, fourQuestionRound, journalLines, signFor, timingSteps, whatIfSteps, whatIfWeDont, type Chip } from "./rubric-model";

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
  test("the attempts queue drains its TAIL — an attempt recorded mid-flush is not stranded", () => {
    const q = read("probe-attempts.ts");
    expect(q).toContain("more = loadQ().length > 0;");
    expect(q).toContain("if (more) void flushProbeAttempts();");
    // only after a SUCCESS — a failing server (or an unapplied migration) must never spin
    const drain = q.slice(q.indexOf("let flushing = false;"));
    expect(drain.indexOf("more = loadQ().length > 0;")).toBeGreaterThan(drain.indexOf("if (r.ok)") - 1);
    expect(drain).not.toContain("catch { void flushProbeAttempts");
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

// ================================================================= RUBRIC v2

describe("Rubric v2 — the T-accounts (get the sign sides RIGHT)", () => {
  test("the prompt's table, verbatim: left column is DEBIT, right is CREDIT", () => {
    // An accounting tool with a backwards normal balance is dead on arrival, so
    // this asserts the spec's table literally rather than re-deriving it.
    expect(tSides("A")).toEqual({ left: "+", right: "−", normal: "left" });   // Assets      + left · − right
    expect(tSides("L")).toEqual({ left: "−", right: "+", normal: "right" });  // Liabilities − left · + right
    expect(tSides("E")).toEqual({ left: "−", right: "+", normal: "right" });  // Equity      − left · + right
    expect(tSides("R")).toEqual({ left: "−", right: "+", normal: "right" });  // Revenues    − left · + right
    expect(tSides("X")).toEqual({ left: "+", right: "−", normal: "left" });   // Expenses    + left · − right
  });
  test("the emphasized side is always the + side — the normal balance", () => {
    for (const t of ACCT_TYPES) {
      const s = tSides(t.id);
      expect(s[s.normal]).toBe("+");
      expect(s[s.normal === "left" ? "right" : "left"]).toBe("−");
      // and it agrees with the model the probes grade against
      expect(s.normal).toBe(t.increase === "Dr" ? "left" : "right");
    }
  });
  test("the one-word definitions are the canon five", () => {
    expect([DEFS.A, DEFS.L, DEFS.E, DEFS.R, DEFS.X]).toEqual(["OWN", "OWE", "VALUE", "EARNED", "COSTS"]);
  });
});

describe("Rubric v2 — the progressive reveal (§5)", () => {
  test("step 1 is a blank canvas — nothing is painted", () => {
    expect(visibleAt(1)).toEqual({ bsEq: false, bsDefs: false, bsTs: false, isEq: false, isDefs: false, isTs: false, statements: false });
  });
  test("each step adds exactly its own layer, in the authored order", () => {
    expect(visibleAt(2).bsEq).toBe(true);
    expect(visibleAt(2).bsDefs).toBe(false);
    expect(visibleAt(3).bsDefs).toBe(true);
    expect(visibleAt(3).bsTs).toBe(false);
    expect(visibleAt(4).bsTs).toBe(true);
    expect(visibleAt(4).isEq).toBe(false);      // the divider + Revs & Exps wait
    expect(visibleAt(5).isEq).toBe(true);
    expect(visibleAt(5).isDefs).toBe(false);
    expect(visibleAt(6).isDefs).toBe(true);
    expect(visibleAt(6).isTs).toBe(true);
    expect(visibleAt(6).statements).toBe(false); // only at 7, and only if toggled
    expect(visibleAt(7).statements).toBe(true);
  });
  test("null is FREE MODE — the navigable exhibit, everything on", () => {
    expect(visibleAt(null)).toEqual({ bsEq: true, bsDefs: true, bsTs: true, isEq: true, isDefs: true, isTs: true, statements: true });
  });
  test("stepping clamps at both ends; out-of-range steps are clamped, not crashed", () => {
    expect(prevReveal(1)).toBe(1);
    expect(nextReveal(REVEAL_LAST)).toBe(REVEAL_LAST);
    expect(visibleAt(0)).toEqual(visibleAt(1));
    expect(visibleAt(99)).toEqual(visibleAt(REVEAL_LAST));
    expect(REVEAL_LABELS.length).toBe(REVEAL_LAST);
  });
});

describe("Rubric v2 — COA nodes + the statements layer", () => {
  test("each account chip is a NODE (id · element · label) in COA order", () => {
    const a = coaNodes("A");
    expect(a[0]).toEqual({ id: "coa:A:cash", element: "A", label: "Cash" });
    expect(a[1].id).toBe("coa:A:accounts-receivable");
    expect(a.map((n) => n.label)).toEqual(ACCOUNTS.A);            // COA order preserved
    expect(new Set(ALL_COA_NODES.map((n) => n.id)).size).toBe(ALL_COA_NODES.length); // ids unique
  });
  test("every element's accounts are reachable as nodes", () => {
    for (const t of ACCT_TYPES) expect(coaNodes(t.id).length).toBe(ACCOUNTS[t.id].length);
  });
  test("the statements layer knows which side of the pipe each element is on", () => {
    expect(STATEMENT_OF.A).toBe("BALANCE SHEET");
    expect(STATEMENT_OF.L).toBe("BALANCE SHEET");
    expect(STATEMENT_OF.E).toBe("BALANCE SHEET");
    expect(STATEMENT_OF.R).toBe("INCOME STATEMENT");
    expect(STATEMENT_OF.X).toBe("INCOME STATEMENT");
  });
  test("TEXT DIET: the bridge paints four characters; the full name is tooltip-only", () => {
    expect(BRIDGE_LABEL).toBe("R/E");
    expect(BRIDGE_TITLE).toBe("Statement of Retained Earnings");
  });
});

describe("Rubric v2/v3 — the rubric IS the screen (§1, §6)", () => {
  const board = read("RubricBoard.tsx");
  const exhibit = read("RubricExhibit.tsx");
  const lab = read("ExhibitLab.tsx");
  test("the board is DEPENDENCY-LIGHT: its ENTIRE import list is react + a font + the pure model", () => {
    // asserted as the WHOLE list, not as absent needles: a prose mention of
    // film-lock must not pass or fail this, only a real import can.
    const froms = [...board.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(froms).toEqual(["../theme", "./rubric-model", "./rubric-view", "react"]);
  });
  test("the board is CONTROLLED — every piece of state arrives as a prop", () => {
    expect(board).toContain("export interface RubricBoardProps");
    expect(board).toContain("reveal: number | null;");
    expect(board).toContain("zoom: AcctType | null;");
    expect(board).toContain("toggles: RubricToggles;");
    expect(board).toContain("open: ReadonlySet<AcctType>;");
    expect(board).toContain("movements: Readonly<Partial<Record<AcctType, Movement>>>;");
  });
  test("MOTION: layers stay mounted and animate on opacity/transform only", () => {
    // a remount is the flash bug; a height/left animation is the jank bug
    expect(board).toContain("willChange: \"opacity, transform\"");
    expect(board).toContain("pointerEvents: shown ? \"auto\" : \"none\"");
    expect(board).not.toContain("transition: \"all");
  });
  test("the probes are DEMOTED to a drawer that is CLOSED by default — not deleted", () => {
    expect(exhibit).toContain("const [drawer, setDrawer] = useState(false);");
    // the step panel only mounts with the drawer open, which is also what hands
    // the run keys back to the rubric (StepPanel owns registerKeyTarget)
    expect(exhibit).toContain("{drawer && (");
    expect(exhibit).toContain("<StepPanel");
    // and the library still exists, rendered INTO that drawer by the Lab
    expect(lab).toContain("labControls={probeControls}");
    expect(lab).toContain("function ProbeControls(");
    expect((lab.match(/Probe library · summon onto/g) ?? []).length).toBe(1); // one surface, not two
  });
  test("the rubric's keys yield to the probe keys whenever the drawer is open", () => {
    expect(exhibit).toContain("if (drawerRef.current) return;");
    expect(exhibit).toContain("if (e.key === \"Tab\")");       // Tab is the exhibit's in both states
    expect(exhibit).toContain("setReveal(1); setZoom(null);"); // ` = reset to blank
  });
  test("PRESENT mode hides every Lab affordance for a clean OBS frame", () => {
    expect(lab).toContain(".sa-present [data-lab-chrome]{display:none !important}");
    expect(exhibit).toContain("data-lab-chrome");
    expect(lab).toContain("const [aspect, setAspect] = useState<\"fill\" | \"16:9\" | \"9:16\">(\"fill\");");
    // ONE stage position in the tree: rendering it under two different parents
    // remounts the exhibit and wipes the reveal/zoom/statements Lee just set up.
    expect((lab.match(/{stage}/g) ?? []).length).toBe(1);
  });
  test("PARKED (§6): no drag-to-journal-entry, no scenario chips on the board", () => {
    expect(board).not.toContain("draggable");
    expect(board).not.toContain("onDragStart");
    expect(board).not.toContain("SCENARIOS");
    expect(board).not.toContain("Chip");
  });
});

// ============================================================== RUBRIC v3

describe("Rubric v3 — asset groups + contra accounts", () => {
  test("assets split CURRENT / LONG TERM, and the split covers the flat list exactly", () => {
    const g = coaGroups("A");
    expect(g.map((x) => x.label)).toEqual(["CURRENT", "LONG TERM"]);
    expect(g.flatMap((x) => x.nodes).map((n) => n.label)).toEqual(ACCOUNTS.A); // partition, nothing lost or doubled
    expect(g[0].nodes.map((n) => n.label)).toEqual(["Cash", "Accounts Receivable", "Supplies", "Prepaid Insurance", "Prepaid Rent", "Inventory"]);
    expect(g[1].nodes.map((n) => n.label)).toContain("Accumulated Depreciation");
  });
  test("every other element is ONE ungrouped list", () => {
    for (const t of ["L", "E", "R", "X"] as const) {
      const g = coaGroups(t);
      expect(g.length).toBe(1);
      expect(g[0].label).toBeUndefined();
      expect(g[0].nodes.map((n) => n.label)).toEqual(ACCOUNTS[t]);
    }
  });
  test("contra accounts carry the FLIPPED pair of their own type", () => {
    expect(isContra("coa:A:accumulated-depreciation")).toBe(true);
    expect(isContra("coa:E:dividends")).toBe(true);
    expect(isContra("coa:A:cash")).toBe(false);
    // asset is (+/−) ⇒ its contra is (−/+); equity is (−/+) ⇒ its contra is (+/−)
    expect(signPair("A")).toEqual({ left: "+", right: "−" });
    expect(signPair("A", true)).toEqual({ left: "−", right: "+" });
    expect(signPair("E", true)).toEqual({ left: "+", right: "−" });
    expect(CONTRA["coa:A:accumulated-depreciation"].label).toBe("CONTRA ASSET");
  });
});

describe("Rubric v3 — movements", () => {
  test("clicking cycles none → up → down → both → none", () => {
    expect(nextMovement(null)).toBe("up");
    expect(nextMovement("up")).toBe("down");
    expect(nextMovement("down")).toBe("both");
    expect(nextMovement("both")).toBe(null);
  });
  test("the glyphs are the arrows Lee teaches with", () => {
    expect(MOVEMENT_GLYPH.up).toBe("↑");
    expect(MOVEMENT_GLYPH.down).toBe("↓");
    expect(MOVEMENT_GLYPH.both).toBe("↑↓");
  });
});

describe("Rubric v3 — teaching modes are named switch sets", () => {
  test("each mode turns on exactly what its question needs", () => {
    expect(modeById("types")).toEqual({ ...ALL_OFF, defs: true, accounts: true });
    expect(modeById("normal")).toEqual({ ...ALL_OFF, signs: true, normal: true, accounts: true });
    expect(modeById("drcr")).toEqual({ ...ALL_OFF, signs: true, tAccounts: true, defs: true });
    expect(modeById("statements")).toEqual({ ...ALL_OFF, statements: true, defs: true });
    expect(modeById("moves")).toEqual({ ...ALL_OFF, arrows: true, signs: true });
    expect(Object.values(modeById("all")).every(Boolean)).toBe(true); // the playground
  });
  test("NORMAL BALANCE is opt-in: no mode but `normal` lights the +", () => {
    // the pair is one colour by default — the coloured + is a lesson, not decor
    for (const m of MODES) if (m.id !== "normal" && m.id !== "all") expect(m.toggles.normal).toBe(false);
  });
  test("a mode round-trips, and tweaking one switch makes it custom", () => {
    expect(matchMode(modeById("normal"))).toBe("normal");
    expect(matchMode({ ...modeById("normal"), arrows: true })).toBeNull();
    expect(MODE_IDS.length).toBe(MODES.length);
  });
});

describe("Rubric v3 — the board paints what the switches say", () => {
  const board = read("RubricBoard.tsx");
  const exhibit = read("RubricExhibit.tsx");
  test("the (+/−) pair sits ABOVE the letter — Lee's preferred spot", () => {
    const col = board.slice(board.indexOf("function ElementCol("), board.indexOf("/** An operator glyph"));
    expect(col.indexOf("<SignPair")).toBeLessThan(col.indexOf("onClick={() => onToggleOpen(type)}")); // pair, then the letter
    expect(col.indexOf("<SignPair")).toBeLessThan(col.indexOf("onCycleMovement(type)"));               // pair is topmost
  });
  test("both signs share one colour until `normal` lights the +", () => {
    const sp = board.slice(board.indexOf("function SignPair("), board.indexOf("/** THE MINI T"));
    expect(sp).toContain('color: normal && g === "+" ? GOLD : DIM,');
  });
  test("clicking a letter opens THAT element in place; a switch opens them all", () => {
    expect(board).toContain("const accountsFor = (t: AcctType) => toggles.accounts || open.has(t);");
    expect(board).toContain("const defsFor = (t: AcctType) => toggles.defs || open.has(t);");
    // one column opening widens the whole row, so the equation never re-flows
    // halfway through a reveal
    expect(board).toContain("const wide = ELEMENT_ORDER.some(accountsFor);");
  });
  test("the movement slot holds its height so clicking ↑↓ never nudges the frame", () => {
    expect(board).toContain("height: Math.round(glyphSize * 0.42)");
  });
  test("the gear owns the switches, and the keys mirror it", () => {
    expect(exhibit).toContain('{ code: "Digit6", key: "statements"');
    expect(exhibit).toContain('{ code: "Digit9", key: "accounts"');
    expect(exhibit).toContain('{ code: "KeyN", key: "normal"');
    // digits read by CODE so Shift+1 is still "the first element", not "!"
    expect(exhibit).toContain('const idx = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].indexOf(e.code);');
    expect(exhibit).toContain("if (e.shiftKey) setZoom((z) => (z === t ? null : t));");
    expect(exhibit).toContain("data-lab-chrome"); // the gear never films
  });
});
