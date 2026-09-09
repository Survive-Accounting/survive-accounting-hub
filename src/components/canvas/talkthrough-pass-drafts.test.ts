import { describe, expect, test } from "bun:test";

import { parseIdeaDrafts } from "./talkthrough-pass";

// Lee, 2026-09-08, on the batch that landed in one title: "I want an individual cheat code
// slide for each." The spec asks for an array now; this is the reader.
describe("one card per point", () => {
  test("an array of cards is that many cards, in order", () => {
    const out = parseIdeaDrafts(`[{"kind":"cheat_code","title":"Prepaids are assets","body":"Paid ahead? Asset."},{"kind":"cheat_code","title":"Payables are liabilities","body":"Owe it? Liability."}]`, "cheat_code");
    expect(out.map((d) => d.title)).toEqual(["Prepaids are assets", "Payables are liabilities"]);
    expect(out.every((d) => d.kind === "cheat_code")).toBe(true);
  });
  test("the old single-object shape still reads as one card", () => {
    const out = parseIdeaDrafts(`{"kind":"memorize_this","title":"Debits left","body":"Always."}`, "memorize_this");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Debits left");
  });
  test("a wrapped {cards:[…]} reads too", () => {
    expect(parseIdeaDrafts(`{"cards":[{"title":"a","body":"x"},{"title":"b","body":"y"}]}`, "cheat_code")).toHaveLength(2);
  });
  test("prose around the JSON is ignored, garbage is nothing", () => {
    expect(parseIdeaDrafts(`Sure! Here you go:\n[{"kind":"tricky","title":"Dividends","body":"Contra-equity."}]\nHope that helps.`, "tricky")).toHaveLength(1);
    expect(parseIdeaDrafts("no json here", "cheat_code")).toEqual([]);
    expect(parseIdeaDrafts("[1, 2, null]", "cheat_code")).toEqual([]);
  });
  test("a tricky stamp stays tricky", () => {
    expect(parseIdeaDrafts(`[{"kind":"tricky","title":"Dividends","body":"Contra-equity, not contra-asset."}]`, "tricky")[0].kind).toBe("tricky");
    // …and a model that forgets the kind still gets the stamp's.
    expect(parseIdeaDrafts(`[{"title":"Dividends","body":"x"}]`, "tricky")[0].kind).toBe("tricky");
  });
  test("never more than five from one window — past that it is padding, not Lee listing", () => {
    const seven = JSON.stringify(Array.from({ length: 7 }, (_, i) => ({ kind: "cheat_code", title: `c${i}`, body: "x" })));
    expect(parseIdeaDrafts(seven, "cheat_code")).toHaveLength(5);
  });
});
