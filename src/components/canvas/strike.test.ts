import { describe, expect, test } from "bun:test";

import { splitStrike } from "./variables";

describe("splitStrike (Alt+Shift+5 strikethrough marker)", () => {
  test("plain text → one non-strike run", () => {
    expect(splitStrike("hello")).toEqual([{ t: "hello", strike: false }]);
  });
  test("a ~~struck~~ run in the middle", () => {
    expect(splitStrike("do ~~not~~ debit")).toEqual([
      { t: "do ", strike: false },
      { t: "not", strike: true },
      { t: " debit", strike: false },
    ]);
  });
  test("multiple struck runs", () => {
    expect(splitStrike("~~a~~ and ~~b~~")).toEqual([
      { t: "a", strike: true },
      { t: " and ", strike: false },
      { t: "b", strike: true },
    ]);
  });
  test("empty string stays one run", () => {
    expect(splitStrike("")).toEqual([{ t: "", strike: false }]);
  });
});
