// Unit tests for the 990 Part VII officers parser. Run with `bun test`.
import { test, expect } from "bun:test";
import { parseOfficers } from "./greek-officers";

// Stacked format (typical when copied out of a 990 PDF / ProPublica text view).
const STACKED = `Part VII
Section A. Officers, Directors, Trustees, Key Employees, and Highest Compensated Employees
(A) Name and Title   (B) Average hours per week   (C) Position
JANE SMITH
PRESIDENT
1.00
X
JOHN A DOE
TREASURER
1.00
X
MARY JOHNSON
CHAPTER ADVI
2.00
ROBERT E LEE
VICE-PRESIDE
1.00`;

test("stacked Part VII", () => {
  const o = parseOfficers(STACKED);
  expect(o).toEqual([
    { name: "JANE SMITH", title: "PRESIDENT" },
    { name: "JOHN A DOE", title: "TREASURER" },
    { name: "MARY JOHNSON", title: "CHAPTER ADVI" },
    { name: "ROBERT E LEE", title: "VICE-PRESIDE" },
  ]);
});

// Same-line format (name and title on one line, columns after).
const SAMELINE = `Name and Title
SUSAN B ANTHONY        HOUSE CORP PRES        2.00   X
GEORGE WASHINGTON      DIRECTOR               1.00   X`;

test("same-line Part VII", () => {
  const o = parseOfficers(SAMELINE);
  expect(o).toEqual([
    { name: "SUSAN B ANTHONY", title: "HOUSE CORP PRES" },
    { name: "GEORGE WASHINGTON", title: "DIRECTOR" },
  ]);
});

test("empty is safe", () => {
  expect(parseOfficers("")).toEqual([]);
});

test("dedupes repeated pairs", () => {
  const o = parseOfficers("JANE SMITH\nPRESIDENT\nJANE SMITH\nPRESIDENT");
  expect(o).toEqual([{ name: "JANE SMITH", title: "PRESIDENT" }]);
});

// 990 efile dot-leader format: "(N) NAME ...." with the TITLE on the next line,
// hours after the dots. This is the format that previously slipped through.
const DOT_LEADER = `Part VII Section A
(1) SARAH JANE MILLER .......................... 2.00
PRESIDENT
(2) ASHLEY NICOLE DAVIS .........................
VICE-PRESIDE
(9) MELANIE LANDRUM WOODALL .................... 1.00
SECRETARY`;

test("dot-leader (N) NAME .... / TITLE format", () => {
  const o = parseOfficers(DOT_LEADER);
  expect(o).toEqual([
    { name: "SARAH JANE MILLER", title: "PRESIDENT" },
    { name: "ASHLEY NICOLE DAVIS", title: "VICE-PRESIDE" },
    { name: "MELANIE LANDRUM WOODALL", title: "SECRETARY" },
  ]);
});
