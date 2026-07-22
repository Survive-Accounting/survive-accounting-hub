// CHOREO materializer — the one source of truth Space / Shift+Space / scrubber all
// apply. Locks: arbitrary-order in-place part reveal, deal/tuck, scenery via
// cueHidden, memos, the legacy cumulative revealCount path, spot tracking, and that
// unreferenced nodes are left untouched.
import { describe, expect, it } from "bun:test";

import { framePartIds, materializeFrame, REST_TARGET, revealPartsPatch, WHOLE_TARGET, type FrameNodeLike } from "./choreo";
import type { CardData, RecCue } from "./types";

const je = (id: string, lineIds: string[]): FrameNodeLike => ({
  id,
  type: "je",
  data: { kind: "je", deckMember: true, tucked: true, lines: lineIds.map((lid) => ({ id: lid, account: lid, debit: 0, credit: 0 })) } as unknown as FrameNodeLike["data"],
});
const heading = (id: string): FrameNodeLike => ({ id, type: "heading", data: { kind: "heading", text: "T", level: 1 } as unknown as FrameNodeLike["data"] });
const memo = (id: string): FrameNodeLike => ({ id, type: "memo", data: { kind: "memo", memoKind: "note", body: "" } as unknown as FrameNodeLike["data"] });

const cue = (c: Partial<RecCue> & { kind: RecCue["kind"] }): RecCue => ({ id: `c-${Math.round(c.revealCount ?? 0)}-${c.kind}-${c.cardId ?? c.memoId ?? ""}-${c.targetId ?? ""}`, label: c.kind, target: "", ...c });

describe("framePartIds", () => {
  it("je → line ids in order", () => {
    expect(framePartIds({ kind: "je", lines: [{ id: "l1" }, { id: "l2" }] } as unknown as CardData)).toEqual(["l1", "l2"]);
  });
  it("scenery / ceq / note → no parts (whole only)", () => {
    expect(framePartIds({ kind: "heading", text: "x", level: 1 } as unknown as CardData)).toEqual([]);
    expect(framePartIds({ kind: "ceq", prompt: "", choices: [] } as unknown as CardData)).toEqual([]);
  });
  it("list → description pseudo-part then row ids", () => {
    expect(framePartIds({ kind: "list", description: "d", rows: [{ id: "r1" }, { id: "r2" }] } as unknown as CardData)).toEqual(["desc", "r1", "r2"]);
  });
});

describe("revealPartsPatch — set-based, order-independent", () => {
  it("reveals exactly the named parts, hides the rest", () => {
    const d = { kind: "je", lines: [{ id: "l1" }, { id: "l2" }, { id: "l3" }] } as unknown as CardData;
    const patch = revealPartsPatch(d, new Set(["l3"]), false) as { lines: { id: string; hidden?: boolean }[] };
    expect(patch.lines.map((l) => l.hidden)).toEqual([true, true, false]); // only l3 visible
  });
  it("whole = every part visible", () => {
    const d = { kind: "je", lines: [{ id: "l1" }, { id: "l2" }] } as unknown as CardData;
    const patch = revealPartsPatch(d, new Set(), true) as { lines: { hidden?: boolean }[] };
    expect(patch.lines.every((l) => l.hidden === false)).toBe(true);
  });
});

describe("materializeFrame", () => {
  const cards = [je("j1", ["l1", "l2", "l3"]), heading("h1")];
  const memos = [memo("m1")];
  // queue: deal j1 · reveal l3 · reveal l1 (OUT OF ORDER) · reveal heading whole · memo
  const cues: RecCue[] = [
    cue({ kind: "deal", cardId: "j1" }),
    cue({ kind: "reveal", cardId: "j1", targetId: "l3" }),
    cue({ kind: "reveal", cardId: "j1", targetId: "l1" }),
    cue({ kind: "reveal", cardId: "h1", targetId: WHOLE_TARGET }),
    cue({ kind: "memo", memoId: "m1" }),
  ];

  it("n=0 → blank: deck member tucked, scenery + memo cueHidden", () => {
    const { patches } = materializeFrame(cards, memos, cues, 0);
    expect(patches.get("j1")?.tucked).toBe(true);
    expect(patches.get("h1")?.cueHidden).toBe(true);
    expect(patches.get("m1")?.cueHidden).toBe(true);
  });

  it("n=1 → j1 dealt, but its reveal-governed lines all still hidden", () => {
    const { patches } = materializeFrame(cards, memos, cues, 1);
    expect(patches.get("j1")?.tucked).toBe(false);
    const lines = (patches.get("j1") as { lines: { hidden?: boolean }[] }).lines;
    expect(lines.every((l) => l.hidden === true)).toBe(true);
  });

  it("n=2 → only l3 revealed (arbitrary order, in place)", () => {
    const lines = (materializeFrame(cards, memos, cues, 2).patches.get("j1") as { lines: { id: string; hidden?: boolean }[] }).lines;
    expect(lines.find((l) => l.id === "l3")?.hidden).toBe(false);
    expect(lines.find((l) => l.id === "l1")?.hidden).toBe(true);
    expect(lines.find((l) => l.id === "l2")?.hidden).toBe(true);
  });

  it("n=3 → l1 + l3 revealed, l2 still hidden (out-of-order reveal holds)", () => {
    const lines = (materializeFrame(cards, memos, cues, 3).patches.get("j1") as { lines: { id: string; hidden?: boolean }[] }).lines;
    expect(lines.find((l) => l.id === "l1")?.hidden).toBe(false);
    expect(lines.find((l) => l.id === "l3")?.hidden).toBe(false);
    expect(lines.find((l) => l.id === "l2")?.hidden).toBe(true);
  });

  it("n=4 → heading revealed (cueHidden false)", () => {
    expect(materializeFrame(cards, memos, cues, 4).patches.get("h1")?.cueHidden).toBe(false);
  });

  it("n=5 (all) → memo revealed", () => {
    expect(materializeFrame(cards, memos, cues, 5).patches.get("m1")?.cueHidden).toBe(false);
  });

  it("reverse parity: materialize(k) then materialize(k-1) un-reveals the last step", () => {
    const at3 = (materializeFrame(cards, memos, cues, 3).patches.get("j1") as { lines: { id: string; hidden?: boolean }[] }).lines;
    const at2 = (materializeFrame(cards, memos, cues, 2).patches.get("j1") as { lines: { id: string; hidden?: boolean }[] }).lines;
    expect(at3.find((l) => l.id === "l1")?.hidden).toBe(false); // revealed at step 3
    expect(at2.find((l) => l.id === "l1")?.hidden).toBe(true); // hidden again at step 2 (exact reverse)
  });

  it("unreferenced nodes are left untouched (no patch)", () => {
    const withLoose = [...cards, { id: "loose", type: "text", data: { kind: "text", body: "x" } as unknown as FrameNodeLike["data"] }];
    expect(materializeFrame(withLoose, memos, cues, 5).patches.has("loose")).toBe(false);
  });

  it("REST_TARGET reveals the whole card", () => {
    const restCues: RecCue[] = [cue({ kind: "reveal", cardId: "j1", targetId: "l2" }), cue({ kind: "reveal", cardId: "j1", targetId: REST_TARGET })];
    const lines = (materializeFrame([je("j1", ["l1", "l2", "l3"])], [], restCues, 2).patches.get("j1") as { lines: { hidden?: boolean }[] }).lines;
    expect(lines.every((l) => l.hidden === false)).toBe(true);
  });

  it("legacy revealCount (no targetId) keeps cumulative first-N meaning", () => {
    const legacy: RecCue[] = [cue({ kind: "reveal", cardId: "j1", revealCount: 2 })];
    const lines = (materializeFrame([je("j1", ["l1", "l2", "l3"])], [], legacy, 1).patches.get("j1") as { lines: { hidden?: boolean }[] }).lines;
    expect(lines.map((l) => l.hidden)).toEqual([false, false, true]); // first 2 visible
  });

  it("spots: fold spot/super toggles into the accumulated set (multi-pill + one flame)", () => {
    const sc: RecCue[] = [cue({ kind: "spot", cardId: "j1", targetId: "l1" }), cue({ kind: "super", cardId: "j1", targetId: "l2" })];
    const at1 = materializeFrame(cards, memos, sc, 1).spots;
    expect([...at1.regular]).toEqual(["j1::l1"]);
    expect(at1.superKey).toBeNull();
    const at2 = materializeFrame(cards, memos, sc, 2).spots;
    expect([...at2.regular]).toEqual(["j1::l1"]);
    expect(at2.superKey).toBe("j1::l2");
    const at0 = materializeFrame(cards, memos, sc, 0).spots;
    expect(at0.regular.size).toBe(0);
    expect(at0.superKey).toBeNull();
  });

  it("spots: a spot toggled twice cancels — reverse-safe", () => {
    const sc: RecCue[] = [cue({ kind: "spot", cardId: "j1", targetId: "l1" }), cue({ kind: "spot", cardId: "j1", targetId: "l1" })];
    expect(materializeFrame(cards, memos, sc, 1).spots.regular.size).toBe(1);
    expect(materializeFrame(cards, memos, sc, 2).spots.regular.size).toBe(0);
  });
});
