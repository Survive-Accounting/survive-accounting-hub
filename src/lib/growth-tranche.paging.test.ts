// THE THOUSAND-ROW CAP (2026-09-05). Supabase returns at most 1000 rows to an unpaged read and
// says nothing. The cold-outreach board hydrates a whole pool's contacts and chapters at once —
// King's pool is ~1500 and ~1900 rows — so those reads must page, or every campus past the cap
// reports "add contacts to start" with its contacts sitting in the database.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./growth-tranche.functions.ts", import.meta.url), "utf8").split("\r\n").join("\n");
const body = src.slice(src.indexOf("async function hydrateTranches("), src.indexOf("const nameOf = new Map"));

describe("the board reads every row of a pool", () => {
  test("contacts and chapters are paged, not read once", () => {
    expect(body).toContain('pageAll<any>((f, t) => db.from("growth_contact_qc")');
    expect(body).toContain('pageAll<any>((f, t) => db.from("campus_greek_chapters")');
    expect(body).toMatch(/\.in\("campus_id", allIds\)(\.is\("archived_at", null\))?\.range\(f, t\)/);
  });
  test("pageAll walks in thousands until a short page", () => {
    expect(src).toContain("const PAGE = 1000;");
    expect(src).toContain("if (rows.length < PAGE) return out;");
  });
});
