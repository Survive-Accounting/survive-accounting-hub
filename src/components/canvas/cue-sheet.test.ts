import { describe, expect, test } from "bun:test";

import { deriveFrameCues, frameCardOrder, hideableLabels, revealPatchForCount } from "./cue-sheet";
import type { CardData } from "./types";

const je = (lines: { account: string }[]): CardData => ({ kind: "je", caption: "Owner invests cash", lines: lines.map((l, i) => ({ id: `l${i}`, account: l.account, dr: null, cr: null, side: "dr", label: "" })) } as unknown as CardData);
const legend = (nSlips: number, flavor: string): CardData => ({ kind: "legend", name: "Pacioli", slips: Array.from({ length: nSlips }, (_, i) => ({ id: `s${i}`, text: `slip ${i}` })), flavor } as unknown as CardData);
const list = (rows: string[], description: string): CardData => ({ kind: "list", description, rows: rows.map((t, i) => ({ id: `r${i}`, text: t })) } as unknown as CardData);

describe("hideableLabels — reveal-step order per kind", () => {
  test("JE → one per line (account name)", () => {
    expect(hideableLabels(je([{ account: "Cash" }, { account: "Owner's Capital" }]))).toEqual(["Cash", "Owner's Capital"]);
  });
  test("Legend → slips then flavor LAST (only if present)", () => {
    expect(hideableLabels(legend(2, "“…”"))).toEqual(["slip 1", "slip 2", "flavor line"]);
    expect(hideableLabels(legend(2, ""))).toEqual(["slip 1", "slip 2"]);
  });
  test("List → definition first (if any) then rows", () => {
    expect(hideableLabels(list(["A", "B"], "the five types"))).toEqual(["definition", "A", "B"]);
    expect(hideableLabels(list(["A", "B"], ""))).toEqual(["A", "B"]);
  });
});

describe("revealPatchForCount — first n visible, rest hidden (inverse of the walk)", () => {
  test("JE: n=1 shows line 0, hides the rest", () => {
    const p = revealPatchForCount(je([{ account: "Cash" }, { account: "Cap" }]), 1) as { lines: { hidden: boolean }[] };
    expect(p.lines.map((l) => l.hidden)).toEqual([false, true]);
  });
  test("JE: n=0 hides all, n≥count reveals all", () => {
    const lines = [{ account: "Cash" }, { account: "Cap" }];
    expect((revealPatchForCount(je(lines), 0) as { lines: { hidden: boolean }[] }).lines.every((l) => l.hidden)).toBe(true);
    expect((revealPatchForCount(je(lines), 9) as { lines: { hidden: boolean }[] }).lines.every((l) => !l.hidden)).toBe(true);
  });
  test("Legend: flavor is the LAST reveal (flavorHidden until n passes all slips)", () => {
    const d = legend(2, "“…”");
    expect((revealPatchForCount(d, 2) as { flavorHidden: boolean }).flavorHidden).toBe(true); // slips shown, flavor still hidden
    expect((revealPatchForCount(d, 3) as { flavorHidden: boolean }).flavorHidden).toBe(false); // flavor revealed last
  });
  test("List: definition gates on n≥1 then rows follow", () => {
    const p = revealPatchForCount(list(["A", "B"], "def"), 2) as { descHidden: boolean; rows: { hidden: boolean }[] };
    expect(p.descHidden).toBe(false); // definition revealed (n≥1)
    expect(p.rows.map((r) => r.hidden)).toEqual([false, true]); // row A shown, B hidden
  });
});

describe("frameCardOrder + deriveFrameCues", () => {
  const card = (id: string, data: Record<string, unknown>, y = 0, x = 0) => ({ id, position: { x, y }, data: data as never });

  test("order: loose (reading order) before deck members (stageOrder)", () => {
    const cards = [
      card("d2", { kind: "note", deckMember: true, stageOrder: 5 }),
      card("loose", { kind: "note" }, 10),
      card("d1", { kind: "note", deckMember: true, stageOrder: 1 }),
    ];
    expect(frameCardOrder(cards).map((c) => c.id)).toEqual(["loose", "d1", "d2"]);
  });

  test("cues: deal (deck only) → reveals per card → memo → advance", () => {
    const cards = [
      card("j", { ...je([{ account: "Cash" }, { account: "Cap" }]), deckMember: true, stageOrder: 0 }),
    ];
    const memos = [{ id: "m1", data: { title: "debere/credere" } }];
    const edges = [{ id: "e", source: "m1", target: "j" }];
    const cues = deriveFrameCues(cards as never, memos, edges, true);
    expect(cues.map((c) => `${c.kind}:${c.target}`)).toEqual([
      "deal:Owner invests cash",
      "reveal:Cash",
      "reveal:Cap",
      "memo:debere/credere",
      "advance:next frame",
    ]);
    // reveal cues carry the running visible count
    expect(cues.filter((c) => c.kind === "reveal").map((c) => c.revealCount)).toEqual([1, 2]);
  });

  test("no next frame → no advance cue; loose card gets no deal cue", () => {
    const cards = [card("loose", { ...je([{ account: "Cash" }]) })];
    const cues = deriveFrameCues(cards as never, [], [], false);
    expect(cues.map((c) => c.kind)).toEqual(["reveal"]);
  });
});

import { cueIsDone, nextCueIndex, orderedCues, type Cue, type CueState } from "./cue-sheet";

describe("orderedCues (Phase 2 — explicit order + derived fallback)", () => {
  const derived: Cue[] = [
    { id: "deal:a", kind: "deal", cardId: "a", label: "Deal", target: "A" },
    { id: "rev:a:0", kind: "reveal", cardId: "a", label: "Reveal", target: "a1", revealCount: 1 },
    { id: "memo:m", kind: "memo", memoId: "m", cardId: "a", label: "Memo", target: "trap" },
    { id: "rev:a:1", kind: "reveal", cardId: "a", label: "Reveal", target: "a2", revealCount: 2 },
  ];
  test("no order → derived unchanged", () => {
    expect(orderedCues(derived, undefined).map((c) => c.id)).toEqual(["deal:a", "rev:a:0", "memo:m", "rev:a:1"]);
    expect(orderedCues(derived, []).map((c) => c.id)).toEqual(["deal:a", "rev:a:0", "memo:m", "rev:a:1"]);
  });
  test("interleave a memo BETWEEN two reveals; explicit ids lead, rest append", () => {
    // Lee drags the memo to sit between rev0 and rev1, and only lists a partial order
    const order = ["deal:a", "rev:a:0", "memo:m"];
    expect(orderedCues(derived, order).map((c) => c.id)).toEqual(["deal:a", "rev:a:0", "memo:m", "rev:a:1"]);
  });
  test("reorder reveals across cards; stale ids drop, new cues append", () => {
    const order = ["rev:a:1", "GONE", "deal:a"]; // rev:a:1 first, unknown id ignored
    expect(orderedCues(derived, order).map((c) => c.id)).toEqual(["rev:a:1", "deal:a", "rev:a:0", "memo:m"]);
  });
});

describe("cueIsDone / nextCueIndex", () => {
  const cues: Cue[] = [
    { id: "deal:a", kind: "deal", cardId: "a", label: "Deal", target: "A" },
    { id: "rev:a:0", kind: "reveal", cardId: "a", label: "Reveal", target: "a1", revealCount: 1 },
    { id: "memo:m", kind: "memo", memoId: "m", cardId: "a", label: "Memo", target: "trap" },
    { id: "advance", kind: "advance", label: "Advance", target: "next frame" },
  ];
  const state = (dealt: boolean, rc: number, memoVis: boolean): CueState => ({ isDealt: () => dealt, revealCount: () => rc, memoVisible: () => memoVis });
  test("done tracks canvas state; advance never auto-done", () => {
    expect(cues.map((c) => cueIsDone(c, state(true, 1, true)))).toEqual([true, true, true, false]);
    expect(cues.map((c) => cueIsDone(c, state(false, 0, false)))).toEqual([false, false, false, false]);
  });
  test("nextCueIndex = first not-done", () => {
    expect(nextCueIndex(cues, state(true, 0, false))).toBe(1); // dealt, nothing revealed → reveal is next
    expect(nextCueIndex(cues, state(true, 1, false))).toBe(2); // reveal done → memo next
    expect(nextCueIndex(cues, state(true, 1, true))).toBe(3);  // all content done → advance next
  });
});
