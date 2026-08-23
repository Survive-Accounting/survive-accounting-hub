// Guards the ONE council matcher.
//
// `campus_greek_chapters.council` is free text with no constraint, and the live table holds every
// casing at once: "IFC" 899 times against "ifc" 140, "Panhellenic" 554 against "panhellenic" 73,
// "MGC" 231 against "mgc" 8. Three call sites each grew their own comparison; two normalised and
// one did not, and the one that did not was the function that MINTS council access tokens — so a
// council it wrongly believed was empty never got a page at all.
//
// The rule these tests exist to hold: comparing this column with `===` or `.eq()` is always a bug.
import { describe, expect, test } from "bun:test";

import { COUNCILS, councilBySlug, councilMatches } from "./greek-councils.functions";

const ifc = councilBySlug("ifc")!;
const panhel = councilBySlug("panhellenic")!;
const nphc = councilBySlug("nphc")!;
const mgc = councilBySlug("mgc")!;

describe("councilMatches", () => {
  test("matches every casing the live column actually contains", () => {
    for (const v of ["IFC", "ifc", "Ifc", " IFC "]) expect(councilMatches(ifc, v)).toBe(true);
    for (const v of ["Panhellenic", "panhellenic", "PANHELLENIC"])
      expect(councilMatches(panhel, v)).toBe(true);
    for (const v of ["NPHC", "nphc"]) expect(councilMatches(nphc, v)).toBe(true);
    for (const v of ["MGC", "mgc"]) expect(councilMatches(mgc, v)).toBe(true);
  });

  test("matches the full council name, not just the abbreviation", () => {
    expect(councilMatches(ifc, "Interfraternity Council")).toBe(true);
    expect(councilMatches(ifc, "interfraternity council")).toBe(true);
    expect(councilMatches(nphc, "National Pan-Hellenic Council")).toBe(true);
    expect(councilMatches(mgc, "Multicultural Greek Council")).toBe(true);
  });

  test("punctuation and spacing are ignored — 'Pan-Hellenic' and 'Pan Hellenic' are one council", () => {
    expect(councilMatches(nphc, "National Pan Hellenic Council")).toBe(true);
    expect(councilMatches(nphc, "N.P.H.C.")).toBe(true);
  });

  test("does NOT cross councils — the whole point of separate pages", () => {
    expect(councilMatches(ifc, "Panhellenic")).toBe(false);
    expect(councilMatches(panhel, "IFC")).toBe(false);
    expect(councilMatches(nphc, "MGC")).toBe(false);
    // "Panhellenic" and "National Pan-Hellenic Council" are different bodies and must never merge.
    expect(councilMatches(panhel, "National Pan-Hellenic Council")).toBe(false);
    expect(councilMatches(nphc, "Panhellenic")).toBe(false);
  });

  test("empty and unknown values match nothing", () => {
    for (const c of COUNCILS) {
      expect(councilMatches(c, null)).toBe(false);
      expect(councilMatches(c, "")).toBe(false);
      expect(councilMatches(c, "   ")).toBe(false);
      expect(councilMatches(c, "Other")).toBe(false);
    }
  });

  test("every council in the registry matches its own three spellings", () => {
    for (const c of COUNCILS) {
      expect(councilMatches(c, c.slug)).toBe(true);
      expect(councilMatches(c, c.name)).toBe(true);
      expect(councilMatches(c, c.full)).toBe(true);
      expect(councilMatches(c, c.name.toUpperCase())).toBe(true);
      expect(councilMatches(c, c.name.toLowerCase())).toBe(true);
    }
  });
});
