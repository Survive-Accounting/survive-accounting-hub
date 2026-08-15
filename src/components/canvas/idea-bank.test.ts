// IDEA BANK (P7) — store rules + the export digest contract.
import { describe, expect, test } from "bun:test";

import { addIdea, editIdea, exportDigest, groupIdeas, IDEA_CATEGORIES, type IdeaNote } from "./idea-bank";

const at = (iso: string) => new Date(iso);

describe("capture + board", () => {
  test("six fixed categories, Ideas is the default story", () => {
    expect(IDEA_CATEGORIES).toEqual(["Filming", "Publishing", "Authoring", "Marketing", "UI/UX", "Ideas"]);
  });
  test("add prepends, trims, refuses empties", () => {
    let l: IdeaNote[] = [];
    l = addIdea(l, "  boss chaching variant  ", "Filming", at("2026-08-14T23:00:00Z"));
    l = addIdea(l, "   ", "Ideas");
    expect(l).toHaveLength(1);
    expect(l[0].text).toBe("boss chaching variant");
  });
  test("groups follow chip order, newest first inside, archived hidden by default", () => {
    let l: IdeaNote[] = [];
    l = addIdea(l, "older", "Filming", at("2026-08-14T20:00:00Z"));
    l = addIdea(l, "newer", "Filming", at("2026-08-14T23:00:00Z"));
    l = addIdea(l, "ui thing", "UI/UX", at("2026-08-14T22:00:00Z"));
    l = editIdea(l, l.find((n) => n.text === "older")!.id, { archived: true });
    const g = groupIdeas(l, false);
    expect(g.map((x) => x.category)).toEqual(["Filming", "UI/UX"]);
    expect(g[0].items.map((n) => n.text)).toEqual(["newer"]);
    expect(groupIdeas(l, true)[0].items.map((n) => n.text)).toEqual(["newer", "older"]);
  });
  test("archive is reversible and nothing is ever hard-deleted", () => {
    let l = addIdea([], "keep me", "Ideas", at("2026-08-14T23:00:00Z"));
    const id = l[0].id;
    l = editIdea(l, id, { archived: true });
    expect(l).toHaveLength(1);
    l = editIdea(l, id, { archived: false });
    expect(l[0].archived).toBe(false);
  });
});

describe("Export for Claude", () => {
  test("digest groups by category, dates each line, excludes archived", () => {
    let l: IdeaNote[] = [];
    l = addIdea(l, "hook variant with the vinyl", "Filming", at("2026-08-14T23:00:00Z"));
    l = addIdea(l, "old idea", "Filming", at("2026-08-13T10:00:00Z"));
    l = addIdea(l, "price anchor test", "Marketing", at("2026-08-14T22:00:00Z"));
    l = editIdea(l, l.find((n) => n.text === "old idea")!.id, { archived: true });
    const md = exportDigest(l, at("2026-08-15T04:00:00Z"));
    expect(md).toContain("# Idea bank digest — 2026-08-15");
    expect(md.indexOf("## Filming")).toBeLessThan(md.indexOf("## Marketing"));
    expect(md).toContain("- hook variant with the vinyl  *(2026-08-14)*");
    expect(md).not.toContain("old idea");
  });
  test("empty bank still exports a valid digest", () => {
    expect(exportDigest([], at("2026-08-15T04:00:00Z"))).toContain("(no active ideas)");
  });
});
