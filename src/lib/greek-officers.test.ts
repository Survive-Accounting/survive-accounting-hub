// Unit tests for the 990 Part VII officers parser. Run with `bun test`.
import { test, expect } from "bun:test";
import { extractBalanceSheet, extractPreparer, parseOfficers } from "./greek-officers";

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

// Whole-page Ctrl+A/Ctrl+C paste of a ProPublica /full render (e-filed 990),
// modeled on a real render: page furniture, the principal-officer address block
// (a classic false-positive trap), the mission statement, Part VII table headers,
// position-checkbox X's, dot leaders, and the continuation-page repeat.
const FULL_PAGE = `Full text of "Full Filing" for fiscal year ending Dec. 2024
Tax returns filed by nonprofit organizations are public records.
Select a schedule
Form 990
Print this page
TY 2024 Form 990
efile Public Visual Render ObjectId: 202523179349309732
Submission: 2025-09-06
TIN:
64-6025476
C Name of organization
ALPHA DELTA PI OMICRON HOUSE ASSOC
Number and street (or P.O. box if mail is not delivered to street address)
PO BOX 1288
D Employer identification number
64-6025476
E Telephone number
(662) 234-5216
F
Name and address of principal officer:
CHERYL GILLIS OGLESBY
101 SORORITY ROW
OXFORD , MS 38655
1
Briefly describe the organization's mission or most significant activities:
TO PROVIDE HOUSING FOR MEMBERS OF ALPHA DELTA PI SORORITY.
Part II
Signature Block
Signature of officer
Date
CHERYL GILLIS OGLESBY PRESIDENT
Type or print name and title
Paid
Preparer
Use Only
Print/Type preparer's name
Preparer's signature
Date
2025-09-04
Check
if
self-employed
PTIN
P01055816
Firm's name
WATKINS WARD AND STAFFORD PLLC
Firm's EIN
64-0394922
Firm's address
PO BOX 1345
STARKVILLE , MS 39760
Phone no.
(662) 323-9071
Part VII
Section A. Officers, Directors, Trustees, Key Employees, and Highest Compensated Employees
1a Complete this table for all persons required to be listed.
List all of the organization's current officers, directors, trustees (whether individuals or organizations), regardless of amount
of compensation. Enter -0- in columns (D), (E), and (F) if no compensation was paid.
(A)
Name and title
(B)
Average hours per week (list any hours for related organizations below dotted line)
(C)
Position (do not check more than one box, unless person is both an officer and a director/trustee)
(D)
Reportable compensation from the organization (W-2/1099-MISC/1099-NEC)
(1)
ANNE MARIE HYNEMAN ......................................................................
HOUSE CORP DI
.................
X
0
0
0
(2)
KAREN LEE BRYANT ......................................................................
DIRECTOR
.................
X
X
0
0
0
(3)
LISA GAYLE HODGE ......................................................................
DIRECTOR
.................
X
0
0
0
(4)
DANA CARR PHILLIPS ......................................................................
DIRECTOR
.................
X
0
0
0
(5)
EMILY ROANE SMITH ......................................................................
DIRECTOR
.................
X
0
0
0
(6)
JULIA GRAY DENTON ......................................................................
HOUSE DIRECTO
.................
X
0
0
0
(7)
CHERYL GILLIS OGLESBY ......................................................................
PRESIDENT
.................
X
X
0
0
0
(8)
LEIGH ANNE TATE ......................................................................
TREASURER
.................
X
X
0
0
0
Form 990 (2024)
Page 8
Form 990 (2024)
Page 8
Part VII
Section A. Officers, Directors, Trustees, Key Employees, and Highest Compensated Employees (continued)
(A)
Name and title
(B)
Average hours per week (list any hours for related organizations below dotted line)
(C)
Position (do not check more than one box, unless person is both an officer and a director/trustee)
(9)
MELANIE LANDRUM WOODALL ......................................................................
SECRETARY
.................
X
X
0
0
0
1b
Sub-total ...............
Total (add lines 1b and 1c) .........
Section B. Independent Contractors
1
Complete this table for your five highest compensated independent contractors that received more than $100,000
(1)
SOME CATERING COMPANY LLC
FOOD SERVICE
150,000`;

test("whole /full-page paste: ≥9 officers, exact pairs, traps excluded", () => {
  const o = parseOfficers(FULL_PAGE);
  expect(o.length).toBeGreaterThanOrEqual(9);
  expect(o).toContainEqual({ name: "CHERYL GILLIS OGLESBY", title: "PRESIDENT" });
  expect(o).toContainEqual({ name: "MELANIE LANDRUM WOODALL", title: "SECRETARY" });
  expect(o).toContainEqual({ name: "ANNE MARIE HYNEMAN", title: "HOUSE CORP DI" });
  const names = o.map((x) => x.name);
  // Page-furniture traps must not leak in: principal-officer address block,
  // preparer firm, Section B contractors.
  expect(names).not.toContain("PO BOX 1288");
  expect(names).not.toContain("WATKINS WARD AND STAFFORD PLLC");
  expect(names).not.toContain("SOME CATERING COMPANY LLC");
  expect(o.filter((x) => x.name === "CHERYL GILLIS OGLESBY")).toHaveLength(1);
});

test("tab-separated table copy still parses", () => {
  const o = parseOfficers(
    "Section A. Officers, Directors\n(1)\tJANE SMITH ..........\tPRESIDENT\t1.00\tX\t0\n(2)\tJOHN A DOE ..........\tTREASURER\t1.00\tX\t0",
  );
  expect(o).toEqual([
    { name: "JANE SMITH", title: "PRESIDENT" },
    { name: "JOHN A DOE", title: "TREASURER" },
  ]);
});

test("extractPreparer pulls firm, phone, address from a page paste", () => {
  const p = extractPreparer(FULL_PAGE);
  expect(p.firm).toBe("WATKINS WARD AND STAFFORD PLLC");
  expect(p.phone).toBe("(662) 323-9071");
  expect(p.address).toBe("PO BOX 1345, STARKVILLE , MS 39760");
});

test("extractPreparer is null-safe on non-matching text", () => {
  expect(extractPreparer("JANE SMITH\nPRESIDENT")).toEqual({
    firm: null,
    phone: null,
    address: null,
  });
});

// Some /full renders glue the labels to the preceding token AND to their own
// value ("…P00639065Firm's name THE KALOS GROUP LLC", "…26-1257309Firm's
// addressPO BOX 3117"), which the old line-anchored parser missed (phone only).
const GLUED_PREPARER = `Paid Preparer Use OnlyPrint/Type preparer's name
Preparer's signature
Date
2024-11-07Check if
self-employedPTIN
P00639065Firm's name THE KALOS GROUP LLC
 Firm's EIN 26-1257309Firm's addressPO BOX 3117

TUSCALOOSA, AL354033117
Phone no. (659) 734-2900May the IRS discuss this return with the preparer shown above?`;

test("extractPreparer handles labels+values glued mid-line", () => {
  const p = extractPreparer(GLUED_PREPARER);
  expect(p.firm).toBe("THE KALOS GROUP LLC");
  expect(p.phone).toBe("(659) 734-2900");
  expect(p.address).toBe("PO BOX 3117, TUSCALOOSA, AL354033117");
});

// Part X line 10 in a real render — the marker is glued to its value, and the
// net-book-value columns are glued to the accum-dep number ("10b959,2487,132,391").
const BALANCE_SHEET = `9Prepaid expenses and deferred charges ......80,090975,376
10aLand, buildings, and equipment: cost or other basis. Complete Part VI of Schedule D10a8,557,507
bLess: accumulated depreciation 10b959,2487,132,39110c7,598,259
11Investments—publicly traded securities . 11 `;

test("extractBalanceSheet pulls cost basis + accumulated depreciation", () => {
  const b = extractBalanceSheet(BALANCE_SHEET);
  expect(b.landBuildingsGross).toBe(8557507);
  expect(b.accumDepreciation).toBe(959248); // NOT merged with the glued 7,132,391
});

test("extractBalanceSheet is null when line 10 is absent", () => {
  expect(extractBalanceSheet("11 Investments 12 Intangibles")).toEqual({
    landBuildingsGross: null,
    accumDepreciation: null,
  });
});
