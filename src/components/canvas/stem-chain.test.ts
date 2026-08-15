// STEM CHAIN (P2) regression pins — memos chained to the QUESTION walk out
// before any choice, always, and the plumbing reuses the choice-chain contract.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8");
const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8");
const types = readFileSync(join(import.meta.dir, "types.ts"), "utf8");

describe("stem chain — the question is a chain target", () => {
  test("the card carries stemChain (additive scene JSON)", () => {
    expect(types).toContain("stemChain?: CeqChainItem[];");
  });
  test("walk order: stem items are built FIRST, as pseudo-choice -1", () => {
    const stemIdx = previewer.indexOf('choiceId: "__stem__"');
    const choiceIdx = previewer.indexOf("(cd?.choices ?? []).forEach((ch, ci) => (ch.chain ?? []).forEach(");
    expect(stemIdx).toBeGreaterThan(-1);
    expect(choiceIdx).toBeGreaterThan(stemIdx); // stem push precedes choice pushes
  });
  test("reveal gate treats the stem as always-resolved", () => {
    expect(previewer).toContain("(w.choiceIdx === -1 || resolved.has(w.choiceIdx))");
  });
  test("Enter drains the stem chain before any choice logic", () => {
    const adv = previewer.slice(previewer.indexOf("const advance = () =>"), previewer.indexOf("const retreat = () =>"));
    expect(adv.indexOf("stemShown")).toBeLessThan(adv.indexOf("resolved.has(e)"));
  });
  test("Shift+Enter un-reveals stem items while no choice is engaged", () => {
    expect(previewer).toContain("if (emph == null) { const ss = shown.get(-1) ?? 0;");
  });
  test("stem memos draw no choice arrow (no anchor to pin to)", () => {
    expect(previewer).toContain('w.choiceId === "__stem__" || !revealSet.has(w.memoNodeId)');
  });
  test("the stem drop target is film-gated and reuses attachMemo", () => {
    expect(previewer).toContain('attachMemo("__stem__", mid)');
  });
  test("the Studio writes stemChain through the __stem__ sentinel — choice chains untouched", () => {
    expect(studio).toContain('"attach memo to question"');
    expect(studio).toContain('if (choiceId === "__stem__") {');
  });
});
