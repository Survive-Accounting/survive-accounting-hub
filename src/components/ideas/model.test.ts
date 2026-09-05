// IDEAS TO SAVE — the pure surfaces. The two that matter most: the pill's
// count (it is the only nag in the tool, so it must count the right things)
// and Prioritize's willingness to say "go film".
import { describe, expect, test } from "bun:test";

import {
  deriveTitle, filterIdeas, knownSubcategories, prioritize, searchIdeas, sortIdeas, unsubmittedCount,
  type Idea,
} from "./model";

const NOW = new Date("2026-08-31T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const mk = (over: Partial<Idea> = {}): Idea => ({
  id: `i-${Math.random()}`, title: "T", body: "b", categories: [], subcategory: "",
  status: "IDEA", sourcePath: "/blast-off", context: {},
  promptMd: null, promptFilename: null,
  createdAt: daysAgo(1), updatedAt: daysAgo(1),
  ...over,
});

describe("the pill's count", () => {
  test("counts only what still needs Lee's hands", () => {
    const ideas = [
      mk({ status: "IDEA" }), mk({ status: "DRAFTED" }),
      mk({ status: "SUBMITTED" }), mk({ status: "APPROVED" }), mk({ status: "PARKED" }),
    ];
    expect(unsubmittedCount(ideas)).toBe(2);
  });
  test("PARKED is the archive — it never nags", () => {
    expect(unsubmittedCount([mk({ status: "PARKED" }), mk({ status: "PARKED" })])).toBe(0);
  });
});

describe("capture conveniences", () => {
  test("a title is derived so Lee never types one", () => {
    expect(deriveTitle("Globe + animated wordmark\nmore detail here")).toBe("Globe + animated wordmark");
    expect(deriveTitle("# Heading style")).toBe("Heading style");
    expect(deriveTitle("")).toBe("");
    expect(deriveTitle("x".repeat(100))).toHaveLength(72);
  });
  test("subcategory autocomplete grows from use, most-used first", () => {
    const ideas = [mk({ subcategory: "learn page" }), mk({ subcategory: "rep system" }), mk({ subcategory: "learn page" }), mk({ subcategory: "" })];
    expect(knownSubcategories(ideas)).toEqual(["learn page", "rep system"]);
  });
});

describe("finding things", () => {
  const ideas = [
    mk({ title: "Globe wordmark", body: "animated", categories: ["SURVIVEACCOUNTING"], status: "IDEA", updatedAt: daysAgo(1) }),
    mk({ title: "Bio video index", body: "publishing thing", categories: ["YOUTUBE"], status: "DRAFTED", updatedAt: daysAgo(3) }),
    mk({ title: "Rep dashboard", body: "distribution", categories: ["CAMPUS_REPS", "SURVIVEACCOUNTING"], subcategory: "rep system", status: "PARKED", updatedAt: daysAgo(2) }),
  ];
  test("search covers titles, bodies and subcategories", () => {
    expect(searchIdeas(ideas, "animated").map((i) => i.title)).toEqual(["Globe wordmark"]);
    expect(searchIdeas(ideas, "rep system").map((i) => i.title)).toEqual(["Rep dashboard"]);
    expect(searchIdeas(ideas, "")).toHaveLength(3);
  });
  test("category filter matches ANY of a multi-select", () => {
    expect(filterIdeas(ideas, { category: "SURVIVEACCOUNTING" }).map((i) => i.title)).toEqual(["Globe wordmark", "Rep dashboard"]);
  });
  test("status filter and sort by recency", () => {
    expect(filterIdeas(ideas, { status: "PARKED" })).toHaveLength(1);
    expect(sortIdeas(ideas, "date").map((i) => i.title)).toEqual(["Globe wordmark", "Rep dashboard", "Bio video index"]);
  });
});

describe("prioritize — a recommendation, not a score", () => {
  test("ranks the work that matches the week, and says why", () => {
    const ideas = [
      mk({ title: "Cheat code frames", categories: ["SURVIVEACCOUNTING"] }),
      mk({ title: "Cold outreach tweak", categories: ["CAMPUS_REPS"] }),
    ];
    const r = prioritize(ideas, "filming", "evening", NOW);
    expect(r.items[0].idea.title).toBe("Cheat code frames");
    expect(r.items[0].why.length).toBeGreaterThan(0);
    expect(r.items.map((x) => x.idea.title)).not.toContain("Cold outreach tweak");
  });

  // THE POINT OF THE FEATURE: it has to be able to tell Lee to stop planning.
  test("says GO FILM when nothing matches the week", () => {
    const r = prioritize([mk({ title: "Domain cleanup", categories: ["SURVIVESTATS"] })], "outreach", "hour", NOW);
    expect(r.items).toEqual([]);
    expect(r.goFilm).toContain("Go film");
  });
  test("says GO FILM when the vault is empty", () => {
    expect(prioritize([], "product", "day", NOW).goFilm).toContain("Go film");
  });

  test("an already-written prompt outranks an unwritten one when time is short", () => {
    const ideas = [
      mk({ title: "Written", categories: ["CAMPUS_REPS"], status: "DRAFTED", promptMd: "# do it" }),
      mk({ title: "Unwritten", categories: ["CAMPUS_REPS"], status: "IDEA" }),
    ];
    const r = prioritize(ideas, "outreach", "hour", NOW);
    expect(r.items[0].idea.title).toBe("Written");
    expect(r.items[0].why).toContain("paste away");
  });

  test("an idea that has sat for weeks is surfaced with do-it-or-park-it", () => {
    const old = mk({ title: "Old one", categories: ["CAMPUS_REPS"], createdAt: daysAgo(40) });
    const r = prioritize([old], "outreach", "day", NOW);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].idea.title).toBe("Old one");
  });

  test("never recommends SUBMITTED, APPROVED or PARKED work", () => {
    const ideas = [
      mk({ title: "Done", categories: ["CAMPUS_REPS"], status: "APPROVED" }),
      mk({ title: "Handed off", categories: ["CAMPUS_REPS"], status: "SUBMITTED" }),
      mk({ title: "Decided against", categories: ["CAMPUS_REPS"], status: "PARKED" }),
    ];
    const r = prioritize(ideas, "outreach", "day", NOW);
    expect(r.items).toEqual([]);
    expect(r.goFilm).toBeTruthy();
  });

  test("returns at most five — a shortlist, not the backlog", () => {
    const many = Array.from({ length: 12 }, (_, n) => mk({ title: `m${n}`, categories: ["CAMPUS_REPS"] }));
    expect(prioritize(many, "outreach", "day", NOW).items.length).toBeLessThanOrEqual(5);
  });
});
