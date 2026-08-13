import { describe, expect, it } from "bun:test";

import { isMigrationHint, isMissingSchema, retryUnlessMigrationHint } from "./pg-errors";

// Real shapes observed against the live project (2026-07-13): a SELECT on a
// missing TABLE returns PGRST205, a SELECT of a missing COLUMN returns raw
// 42703, an INSERT/UPDATE naming a missing column returns PGRST204.
describe("isMissingSchema", () => {
  it("catches PGRST205 (missing table via schema cache) — the 0088 regression", () => {
    expect(
      isMissingSchema(
        { code: "PGRST205", message: "Could not find the table 'public.canvas_folders' in the schema cache" },
        /canvas_folders|folder_id/i,
      ),
    ).toBe(true);
  });

  it("catches PGRST204 (missing column via schema cache)", () => {
    expect(
      isMissingSchema(
        { code: "PGRST204", message: "Could not find the 'folder_id' column of 'canvas_scenes' in the schema cache" },
        /canvas_folders|folder_id/i,
      ),
    ).toBe(true);
  });

  it("catches raw PG 42P01 / 42703", () => {
    expect(
      isMissingSchema({ code: "42P01", message: 'relation "public.canvas_folders" does not exist' }, /canvas_folders/i),
    ).toBe(true);
    expect(
      isMissingSchema({ code: "42703", message: "column canvas_scenes.folder_id does not exist" }, /folder_id/i),
    ).toBe(true);
  });

  it("catches by message when the code is absent", () => {
    expect(
      isMissingSchema({ message: "Could not find the table 'public.course_coa' in the schema cache" }, /course_coa/i),
    ).toBe(true);
  });

  it("does NOT fire for unrelated errors even when the ident word appears", () => {
    // check-constraint violation mentions "status" but nothing is missing
    expect(
      isMissingSchema(
        { code: "23514", message: 'new row violates check constraint "je_scenarios_status_check"' },
        /course_coa|status|source|sort_order/i,
      ),
    ).toBe(false);
  });

  it("does NOT fire when the missing identifier belongs to someone else", () => {
    expect(
      isMissingSchema(
        { code: "PGRST205", message: "Could not find the table 'public.other_table' in the schema cache" },
        /canvas_folders|folder_id/i,
      ),
    ).toBe(false);
  });
});

describe("retryUnlessMigrationHint", () => {
  const hint = new Error("scene folders missing — run migration/supabase-migrations/0088_scene_folders.sql in the Supabase SQL editor");

  it("never retries a migration hint (deterministic failure; retry pause would delay the banner)", () => {
    expect(isMigrationHint(hint)).toBe(true);
    expect(retryUnlessMigrationHint(0, hint)).toBe(false);
  });

  it("retries other errors exactly once", () => {
    const flaky = new Error("fetch failed");
    expect(retryUnlessMigrationHint(0, flaky)).toBe(true);
    expect(retryUnlessMigrationHint(1, flaky)).toBe(false);
  });
});
