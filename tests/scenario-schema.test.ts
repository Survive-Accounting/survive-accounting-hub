import { describe, expect, test } from "bun:test";

import { scenarioDocV2Schema } from "../src/lib/je/scenario-schema";

// Minimal valid entry-scenario variant (>=2 lines, a debit and a credit).
const entryVariant = {
  id: "v1",
  conditions: {},
  entries: [
    {
      id: "e1",
      lines: [
        { id: "d", account: "Cash", side: "debit", amount: 100 },
        { id: "c", account: "Common Stock", side: "credit", amount: 100 },
      ],
    },
  ],
};

// Minimal valid computation-scenario variant (no entries, has computationPaths).
const computationVariant = {
  id: "v1",
  conditions: {},
  computationPaths: [{ id: "p1", narration: "Basic EPS = (NI − preferred divs) ÷ WACSO." }],
};

function docWith(variant: unknown) {
  return { slug: "x", title: "X", event: "E", axes: [], variants: [variant] };
}

describe("scenario schema — computation scenarios (entries optional)", () => {
  test("accepts an entry-scenario variant", () => {
    expect(scenarioDocV2Schema.safeParse(docWith(entryVariant)).success).toBe(true);
  });

  test("accepts a computation-scenario variant (no entries, has computationPaths)", () => {
    expect(scenarioDocV2Schema.safeParse(docWith(computationVariant)).success).toBe(true);
  });

  test("accepts entries: [] as long as computationPaths is present", () => {
    const r = scenarioDocV2Schema.safeParse(docWith({ ...computationVariant, entries: [] }));
    expect(r.success).toBe(true);
  });

  test("REJECTS a variant with neither entries nor computationPaths", () => {
    const r = scenarioDocV2Schema.safeParse(docWith({ id: "v1", conditions: {} }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => /either entries or computationPaths/.test(i.message))).toBe(true);
  });

  test("REJECTS entries: [] with empty computationPaths", () => {
    expect(scenarioDocV2Schema.safeParse(docWith({ id: "v1", conditions: {}, entries: [], computationPaths: [] })).success).toBe(false);
  });

  test("still enforces per-entry rules when entries ARE present (needs a debit and a credit)", () => {
    const bad = {
      id: "v1",
      conditions: {},
      entries: [{ id: "e1", lines: [
        { id: "a", account: "Cash", side: "debit", amount: 1 },
        { id: "b", account: "More Cash", side: "debit", amount: 1 },
      ] }],
    };
    const r = scenarioDocV2Schema.safeParse(docWith(bad));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => /at least one credit/.test(i.message))).toBe(true);
  });
});
