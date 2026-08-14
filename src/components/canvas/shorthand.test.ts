import { describe, expect, test } from "bun:test";

import { generateShorthand } from "./shorthand";

describe("generateShorthand", () => {
  test("strips leading question words, keeps ~5 meaningful words", () => {
    expect(generateShorthand("What type of account is Accounts Payable?")).toBe("type of account is Accounts");
    expect(generateShorthand("How does a debit affect equity?")).toBe("debit affect equity");
  });
  test("drops bracket placeholders and quotes", () => {
    expect(generateShorthand('What is the adjusting entry for [          ]?')).toBe("adjusting entry for");
    expect(generateShorthand('"Net Assets" means what?')).toBe("Net Assets means what");
  });
  test("caps at 38 chars without cutting mid-word", () => {
    const s = generateShorthand("Which extraordinarily complicated consolidated financial statement disclosure applies?");
    expect(s.length).toBeLessThanOrEqual(38);
    expect(s.endsWith(" ")).toBe(false);
    expect(s).toBe("extraordinarily complicated");
  });
  test("empty and stop-word-only stems return empty", () => {
    expect(generateShorthand("")).toBe("");
    expect(generateShorthand("What is the")).toBe("");
  });
});
