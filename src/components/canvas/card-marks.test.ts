import { describe, expect, test } from "bun:test";

import { isUnlinked, kindOfToken, markLabel, newMark, parseAtTokens } from "./card-marks";

describe("kindOfToken", () => {
  test("matches kind, label, punctuation-insensitive, and aliases", () => {
    expect(kindOfToken("List")).toBe("list");
    expect(kindOfToken("T-account")).toBe("taccount");
    expect(kindOfToken("taccount")).toBe("taccount");
    expect(kindOfToken("Effect")).toBe("formula"); // alias
    expect(kindOfToken("Question")).toBe("ceq"); // alias
    expect(kindOfToken("BG")).toBe("background");
    expect(kindOfToken("Bogus")).toBeNull();
  });
});

describe("parseAtTokens", () => {
  test("token + trailing note (dash trimmed), one per line", () => {
    const marks = parseAtTokens("- hook line\n@List — COA-bound, Assets\n@Memo trap");
    expect(marks).toEqual([
      { kind: "list", note: "COA-bound, Assets" },
      { kind: "memo", note: "trap" },
    ]);
  });

  test("two tokens on one line split the note at the next token", () => {
    expect(parseAtTokens("@JE then @Memo watch signs")).toEqual([
      { kind: "je", note: "then" },
      { kind: "memo", note: "watch signs" },
    ]);
  });

  test("unrecognised tokens are skipped; a bare token has no note", () => {
    expect(parseAtTokens("@Nonsense here\n@Formula")).toEqual([{ kind: "formula" }]);
  });

  test("round-trips a pasted markdown block", () => {
    const md = "Beats:\n- @Legend Pacioli\n- @CEQ: which side?\n- plain talking point";
    expect(parseAtTokens(md)).toEqual([
      { kind: "legend", note: "Pacioli" },
      { kind: "ceq", note: "which side?" },
    ]);
  });
});

describe("newMark + isUnlinked", () => {
  test("newMark carries an id and normalises empty notes to undefined", () => {
    const m = newMark("list", "");
    expect(m.kind).toBe("list");
    expect(m.id).toMatch(/^mark/);
    expect(m.note).toBeUndefined();
  });

  test("isUnlinked: no link, or a dangling link, counts as unlinked", () => {
    const exists = (id: string) => id === "card-1";
    expect(isUnlinked({ id: "a", kind: "list" }, exists)).toBe(true);
    expect(isUnlinked({ id: "a", kind: "list", linkedCardId: "gone" }, exists)).toBe(true);
    expect(isUnlinked({ id: "a", kind: "list", linkedCardId: "card-1" }, exists)).toBe(false);
  });

  test("markLabel is human", () => {
    expect(markLabel("taccount")).toBe("T-account");
    expect(markLabel("ceq")).toBe("CEQ");
  });
});
