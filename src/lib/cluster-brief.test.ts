import { describe, expect, test } from "bun:test";

import { CLUSTER_NODE_KINDS, DEFAULT_FIELD, fitCamera, type ClusterSpec } from "@/components/blastoff/cluster/cluster-spec";
import { MAP_EXAMPLES } from "@/components/blastoff/cluster/map-examples";
import {
  MAP_PLAN_SYSTEM, MAP_REVISE_SYSTEM, MAP_SPEC_SYSTEM, MAP_VOCABULARY,
  buildMapPlanMessages, buildMapReviseMessages, buildMapSpecMessages, checkMapSpec, deriveEntryArrows, parseMapPlan, parseMapSpec,
} from "./cluster-brief";

const set = { name: "Equation Effects", ceqs: [{ id: "ceq-1", label: "Q1", stem: "Buying supplies on account does what to A = L + E?", choices: [{ text: "A up, L up", correct: true }, { text: "A up, E up", correct: false }] }] };
const supplies = MAP_EXAMPLES[0].spec;

describe("the vocabulary", () => {
  test("names every node kind, the shot rules and the registry's account names", () => {
    for (const k of CLUSTER_NODE_KINDS) expect(MAP_VOCABULARY.toLowerCase()).toContain(`${k}`);
    for (const s of ["EQUATION", "ACCOUNTS", "JE", "TACCOUNT", "TB", "CEQ", "CALLOUT", "NOTE", "SHOTS", "ONE IDEA PER SHOT", "THE FIRST SHOT IS NEVER THE OVERVIEW", "ACCOUNT NAMES", "Accounts Payable", "Unearned Revenue", "Accumulated Depreciation (contra)", "WHICH SIDE", "EQUATION EFFECT"]) {
      expect(MAP_VOCABULARY).toContain(s);
    }
    expect(MAP_VOCABULARY).toMatch(/Asset \(A\): up with a Dr, down with a Cr/);
    expect(MAP_VOCABULARY).toMatch(/Liability \(L\): up with a Cr/);
    expect(MAP_VOCABULARY).toMatch(/1080/);
    expect(MAP_VOCABULARY).toMatch(/LIST SLIDE IS A ONE-NODE MAP/);
  });
});

describe("the plan brief", () => {
  test("the messages carry the set, the card, the talkthrough, the prior plan and the brainstorm", () => {
    const m = buildMapPlanMessages({
      brainstorm: "so buy supplies on account, show the equation then the entry\n\nfive hundred", set,
      card: { ceqId: "ceq-1", stem: set.ceqs[0].stem, choices: set.ceqs[0].choices },
      talkthrough: "Said during Talkthrough: on account means payable",
      priorPlan: { plan: "1. equation\n2. entry", questions: ["How much?"] },
    });
    expect(m.system).toBe(MAP_PLAN_SYSTEM);
    for (const s of ["THE SET: Equation Effects", "ceq-1 — Q1", "THE CARD THIS MAP SITS AFTER", "[CORRECT] A up, L up", "TALKTHROUGH NOTES", "PRIOR PLAN", "YOU ASKED:\n- How much?", "WITH HIS ANSWERS LAST", "five hundred", "THE VOCABULARY"]) expect(m.user).toContain(s);
    expect(m.system).toContain('{"plan": str, "questions": [str]}');
    expect(m.system).toMatch(/at most TWO/);
    expect(m.system).toMatch(/No emoji/);
  });
  test("a first turn has no prior plan section", () => {
    const m = buildMapPlanMessages({ brainstorm: "the five types", set });
    expect(m.user).not.toContain("PRIOR PLAN");
    expect(m.user).not.toContain("THE CARD");
    expect(m.user).toContain("LEE'S BRAINSTORM:\nthe five types");
  });
  test("parseMapPlan takes the object, caps the questions at two, accepts a plan given as lines", () => {
    const p = parseMapPlan('Sure.\n{"plan": "1. The equation, A up L up.\\n2. The entry.", "questions": ["How much?", "Include the card?", "Third?"]}');
    expect(p).not.toBeNull();
    expect(p!.plan).toBe("1. The equation, A up L up.\n2. The entry.");
    expect(p!.questions).toEqual(["How much?", "Include the card?"]);
    expect(parseMapPlan('{"plan": ["one", "two"], "questions": []}')!.plan).toBe("one\ntwo");
    expect(parseMapPlan('{"plan": ""}')).toBeNull();
    expect(parseMapPlan("no json here")).toBeNull();
  });
});

describe("the spec brief", () => {
  test("the messages carry the plan, the words, the examples compactly, the vocabulary, and the failure on a retry", () => {
    const m = buildMapSpecMessages({ plan: "1. equation", brainstorm: "supplies on account", set, examples: MAP_EXAMPLES, id: "map-abc", failure: "nodes.0.x: Required" });
    expect(m.system).toBe(MAP_SPEC_SYSTEM);
    for (const s of ["MAP ID: map-abc", "THE PLAN (agreed with Lee):\n1. equation", "LEE'S OWN WORDS", "EXAMPLES (real maps that validate)", 'Example 1 — "A = L + E effects"', '"kind":"equation"', "THE VOCABULARY", "YOUR LAST ANSWER FAILED: nodes.0.x: Required"]) expect(m.user).toContain(s);
    // Compact JSON — no pretty-printing in the examples.
    expect(m.user).not.toContain('"version": 1');
    expect(buildMapSpecMessages({ plan: "x", brainstorm: "y", set, examples: [] }).user).not.toContain("YOUR LAST ANSWER FAILED");
  });
  test("parseMapSpec validates through parseClusterSpec and pins the id", () => {
    const ok = parseMapSpec(`here you go\n${JSON.stringify(supplies)}`, "map-mine");
    expect(ok.error).toBeNull();
    expect(ok.spec!.id).toBe("map-mine");
    expect(ok.spec!.nodes.length).toBe(5);
    expect(parseMapSpec("nothing").error).toMatch(/no JSON/);
    expect(parseMapSpec("{not json}").error).toMatch(/not valid JSON/);
    expect(parseMapSpec(JSON.stringify({ ...supplies, nodes: [{ id: "x", x: 0, y: 0, w: 1, h: 1, data: { kind: "molecule" } }] })).error).toMatch(/nodes\.0\.data/);
  });
  test("the revise brief carries the map as it stands and the words, and says keep the ids", () => {
    const m = buildMapReviseMessages({ spec: supplies, spoken: "make the entry a thousand" });
    expect(m.system).toBe(MAP_REVISE_SYSTEM);
    expect(m.system).toMatch(/Keep every node id/);
    expect(m.user).toContain('"id":"map-example-supplies"');
    expect(m.user).toContain("WHAT LEE SAID TO CHANGE:\nmake the entry a thousand");
    expect(buildMapReviseMessages({ spec: supplies, spoken: "x", failure: "edge je → ghost" }).user).toContain("YOUR LAST ANSWER FAILED: edge je → ghost");
  });
});

describe("checkMapSpec", () => {
  test("the examples come back clean", () => {
    for (const e of MAP_EXAMPLES) expect(checkMapSpec(e.spec)).toEqual([]);
  });
  test("flags an unbalanced entry and an account that isn't in the registry", () => {
    const bad: ClusterSpec = {
      ...supplies,
      nodes: supplies.nodes.map((n) => (n.id === "je" && n.data.kind === "je"
        ? { ...n, data: { ...n.data, lines: [{ account: "Supplies", dr: 500 }, { account: "Vendor Payable", cr: 400 }] } }
        : n)),
    };
    const w = checkMapSpec(bad);
    expect(w.some((x) => /doesn't balance: debits 500, credits 400/.test(x))).toBe(true);
    expect(w.some((x) => /"Vendor Payable" is not an account in the registry/.test(x))).toBe(true);
  });
  test("flags arrows that disagree with the entry, and derives the entry's effect by the equation rule", () => {
    expect(deriveEntryArrows([{ account: "Supplies", dr: 500 }, { account: "Accounts Payable", cr: 500 }])).toEqual({ assets: "up", liabilities: "up", equity: "none" });
    expect(deriveEntryArrows([{ account: "Rent Expense", dr: 900 }, { account: "Cash", cr: 900 }])).toEqual({ assets: "down", liabilities: "none", equity: "down" });
    expect(deriveEntryArrows([{ account: "Equipment", dr: 900 }, { account: "Cash", cr: 900 }])).toEqual({ assets: "both", liabilities: "none", equity: "none" });
    expect(deriveEntryArrows([{ account: "Depreciation Expense", dr: 100 }, { account: "Accumulated Depreciation", cr: 100 }])).toEqual({ assets: "down", liabilities: "none", equity: "down" });
    const bad: ClusterSpec = { ...supplies, nodes: supplies.nodes.map((n) => (n.id === "eq" && n.data.kind === "equation" ? { ...n, data: { ...n.data, arrows: { assets: "up", liabilities: "none", equity: "up" } } } : n)) };
    const w = checkMapSpec(bad);
    expect(w).toEqual(["equation eq disagrees with entry je: liabilities should be up, not none; equity should be none, not up"]);
  });
  test("flags a shot that reveals nothing new, an unknown reveal, an overview first shot, and a wrong normal side", () => {
    const dup: ClusterSpec = { ...supplies, shots: [supplies.shots[0], { ...supplies.shots[0], id: "again" }, ...supplies.shots.slice(1)] };
    expect(checkMapSpec(dup)).toEqual(["shot 2 (A up, L up) reveals nothing new"]);
    const ghost: ClusterSpec = { ...supplies, shots: [{ ...supplies.shots[0], reveal: ["eq", "ghost#2"] }, ...supplies.shots.slice(1)] };
    expect(checkMapSpec(ghost)).toEqual(['shot 1 reveals "ghost", which isn\'t a node']);
    const wide: ClusterSpec = { ...supplies, shots: [{ ...supplies.shots[0], camera: { x: 1080, y: 1920, zoom: 0.5 } }, ...supplies.shots.slice(1)] };
    expect(checkMapSpec(wide)).toEqual(["shot 1 opens on the overview — the first shot should frame one node"]);
    const flipped: ClusterSpec = { ...supplies, nodes: supplies.nodes.map((n) => (n.id === "t-ap" && n.data.kind === "taccount" ? { ...n, data: { ...n.data, normal: "dr" } } : n)) };
    expect(checkMapSpec(flipped)).toEqual(["T-account t-ap: Accounts Payable is credit-normal, not debit"]);
  });
  test("flags overlapping nodes and one outside the field; a last overview shot is fine", () => {
    const over: ClusterSpec = { ...supplies, nodes: supplies.nodes.map((n) => (n.id === "note" ? { ...n, x: 700, y: 900 } : n)) };
    expect(checkMapSpec(over)).toEqual(['"The entry" (je) and note overlap']);
    const out: ClusterSpec = { ...supplies, nodes: supplies.nodes.map((n) => (n.id === "note" ? { ...n, y: DEFAULT_FIELD.h - 100 } : n)) };
    expect(checkMapSpec(out)).toEqual(["note sits outside the field"]);
    const withOverview: ClusterSpec = { ...supplies, shots: [...supplies.shots, { id: "end", camera: { x: 1080, y: 1920, zoom: 0.5 }, reveal: supplies.nodes.map((n) => n.id) }] };
    expect(checkMapSpec(withOverview)).toEqual([]);
    // Sanity: the examples' cameras are fitCamera's, as the vocabulary promises.
    expect(supplies.shots[0].camera).toEqual(fitCamera(supplies.nodes[0]));
  });
  test("checks a card node against the set when given the ids", () => {
    const withCard: ClusterSpec = { ...supplies, nodes: [...supplies.nodes, { id: "card", x: 630, y: 2200, w: 900, h: 700, data: { kind: "ceq", ceqId: "ceq-nope" } }] };
    expect(checkMapSpec(withCard, { cardIds: new Set(["ceq-1"]) })).toEqual(['card node card: "ceq-nope" is not one of the set\'s cards']);
    expect(checkMapSpec(withCard)).toEqual([]);
  });
});
