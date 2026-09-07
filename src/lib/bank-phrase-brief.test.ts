import { describe, expect, test } from "bun:test";

import { BANK_PHRASE_SYSTEM, buildBankPhraseMessages, parseBankPhrase } from "./bank-phrase-brief";

describe("the bank picker by voice", () => {
  test("the messages carry the kind's rule, the set and what he said", () => {
    const m = buildBankPhraseMessages({ kind: "cheat", setName: "Internal Users", spoken: "um so internal means inside the building, that's the whole trick, use it whenever they ask who the report is for" });
    expect(m.system).toBe(BANK_PHRASE_SYSTEM);
    expect(m.user).toContain("CHEAT CODE");
    expect(m.user).toContain("THE SET: Internal Users");
    expect(m.user).toContain("inside the building");
    expect(buildBankPhraseMessages({ kind: "phrase", setName: "", spoken: "x" }).user).toContain("MEMORIZE THIS");
    expect(buildBankPhraseMessages({ kind: "tip", setName: "", spoken: "x" }).user).toContain("DEEP QUESTION");
  });

  test("the answer parses to a clean title and body", () => {
    const p = parseBankPhrase('{"title":"“Internal means inside the building” 🏢","body":"Whenever the question asks who the report is for.\\n"}');
    expect(p).toEqual({ title: "Internal means inside the building", body: "Whenever the question asks who the report is for." });
  });

  test("no title is no entry; a missing body is empty", () => {
    expect(parseBankPhrase('{"title":"","body":"why"}')).toBeNull();
    expect(parseBankPhrase("nothing")).toBeNull();
    expect(parseBankPhrase('{"title":"The rule"}')).toEqual({ title: "The rule", body: "" });
  });
});
