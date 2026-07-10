// Parser for a 990 "Part VII" officers/directors text block. Pure + unit-tested.
// Accepts anything from a hand-typed block to a whole-page Ctrl+A/Ctrl+C paste of
// ProPublica's /full filing render (page furniture, table headers, position-X
// checkboxes, dot leaders). Titles are stored AS-IS, truncations included
// ("CHAPTER ADVI", "VICE-PRESIDE").

export interface ParsedOfficer {
  name: string;
  title: string;
}

// Section/column headers and boilerplate to ignore.
const HEADER_RE =
  /^(part\s|section\s|\([a-f]\)|name and title|average|reportable|estimated|position|officers|directors|trustees|key employee|highest compensated|former|see (schedule|statement|part)|form 990|schedule|individual trustee|institutional trustee|check if|do not|total\b|w-2|1099|hours|list (all|the)|who received|of reportable|organization,|page \d)/i;

// A person name: 2–4 ALL-CAPS tokens (letters, periods, apostrophes, hyphens).
const NAME_RE = /^[A-Z][A-Z.'-]*(?:\s+[A-Z][A-Z.'-]*){1,3}$/;

// Same-line "JANE SMITH        PRESIDENT   1.00 X" → name, title. Name tokens may
// be single letters (middle initials), matching NAME_RE.
const SAME_LINE_RE =
  /^([A-Z][A-Z.'-]*(?:\s+[A-Z][A-Z.'-]*){1,3})\s{2,}([A-Z][A-Z0-9 .,'&/-]{1,40}?)(?:\s{2,}.*|\s+[\d.X].*)?$/;

// Enumerated 990 entry marker "(N)" — possibly with the name on the same line.
const MARKER_RE = /^\((\d+)\)\s*(.*)$/;

function isNumericish(l: string): boolean {
  return /^[\d.,$%()\sX-]+$/i.test(l); // hours / comp / checkbox X / dot-leader runs
}
function looksName(l: string): boolean {
  return NAME_RE.test(l) && l.length >= 4 && l.length <= 40;
}

// Strip dot leaders and trailing hours/comp from a title, keeping truncations.
function cleanTitle(t: string): string {
  return t
    .replace(/\s*\.{2,}.*$/, "")
    .replace(/\s+[\d.,]+\s*$/, "")
    .trim();
}

/** Lines pre-split on newlines AND tabs (browser table copies separate cells with
 *  tabs), trimmed, empties dropped. */
function toLines(text: string): string[] {
  return (text ?? "")
    .split(/[\t]|\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** When a whole /full page is pasted, cut down to the Part VII Section A table
 *  (through Section B) so addresses/mission text/other schedules can't produce
 *  bogus (name, title) pairs. No anchor → return everything. */
function sliceOfficerSection(lines: string[]): string[] {
  const start = lines.findIndex((l) => /Section A\.?,?\s+Officers/i.test(l));
  if (start < 0) return lines;
  const rest = lines.slice(start);
  const end = rest.findIndex((l) => /Section B\.?,?\s+Independent Contractors/i.test(l));
  return end > 0 ? rest.slice(0, end) : rest;
}

/** Enumerated "(N) NAME" walk — the format of e-filed renders. Only text belonging
 *  to numbered entries is considered; everything between entries (checkbox X's,
 *  hours, comp columns, headers) is skipped. */
function parseEnumerated(lines: string[]): ParsedOfficer[] {
  const out: ParsedOfficer[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(MARKER_RE);
    i++;
    if (!m) continue;
    let rest = m[2].trim();
    // Name may sit on the line after the bare "(N)" marker (table-cell copies).
    if (!rest && i < lines.length && !MARKER_RE.test(lines[i])) {
      rest = lines[i];
      i++;
    }
    let name = rest;
    let title = "";
    const slash = rest.match(/^(.+?)\s*\/\s*(.+)$/); // "(N) NAME / TITLE"
    if (slash && !/\.{2,}/.test(rest)) {
      name = slash[1];
      title = slash[2];
    } else {
      const dotSplit = rest.match(/^(.*?)\s*\.{2,}\s*(.*)$/); // "NAME .... [hours]"
      if (dotSplit) {
        name = dotSplit[1];
        title = dotSplit[2];
      }
    }
    name = name.replace(/[.\s]+$/, "").trim();
    title = cleanTitle(title);
    if (title && isNumericish(title)) title = ""; // trailing hours, not a title
    // No title on the marker line → first plausible line before the next entry.
    while (!title && i < lines.length && !MARKER_RE.test(lines[i])) {
      const l = lines[i];
      i++;
      if (isNumericish(l) || HEADER_RE.test(l)) continue;
      title = cleanTitle(l);
      break;
    }
    if (name.length >= 3 && /[A-Z]/.test(name) && title && !isNumericish(title)) {
      out.push({ name, title });
    }
  }
  return out;
}

/** Loose stacked / same-line walk for hand-typed blocks without "(N)" markers. */
function parseLoose(lines: string[]): ParsedOfficer[] {
  const out: ParsedOfficer[] = [];
  let pendingName: string | null = null;
  for (const l of lines) {
    if (HEADER_RE.test(l)) {
      pendingName = null;
      continue;
    }
    const same = l.match(SAME_LINE_RE);
    if (same) {
      out.push({ name: same[1].trim(), title: cleanTitle(same[2]) });
      pendingName = null;
      continue;
    }
    if (isNumericish(l)) continue; // hours / comp columns between entries
    if (pendingName === null) {
      if (looksName(l)) pendingName = l; // start of an entry
      continue;
    }
    // We already have a name; the next content line is its title (as-is, even if
    // it happens to look like a name, e.g. "CHAPTER ADVI").
    out.push({ name: pendingName, title: cleanTitle(l) });
    pendingName = null;
  }
  return out;
}

/** Extract officer (name, title) pairs. Deduplicated, order preserved. */
export function parseOfficers(text: string): ParsedOfficer[] {
  const lines = sliceOfficerSection(toLines(text));
  const enumerated = lines.some((l) => MARKER_RE.test(l));
  const out = enumerated ? parseEnumerated(lines) : parseLoose(lines);
  const seen = new Set<string>();
  return out.filter((o) => {
    const k = `${o.name}|${o.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// --- Paid preparer (best-effort, from the same whole-page paste) ---------------
export interface ParsedPreparer {
  firm: string | null;
  phone: string | null;
  address: string | null;
}

/** Pull the paid-preparer firm/phone/address out of a pasted 990 render. Renders
 *  vary wildly: a label can sit on its own line with the value on the next line
 *  ("Firm's name\nWATKINS WARD…"), OR be glued to the token before it AND to its
 *  own value ("…P00639065Firm's name THE KALOS GROUP LLC",
 *  "Firm's EIN 26-1257309Firm's addressPO BOX 3117"). So we scan the WHOLE text
 *  for each label (not line-anchored) and take what follows up to the next label.
 *  Firm name is a single line; the address may run across lines up to "Phone no." */
export function extractPreparer(text: string): ParsedPreparer {
  const t = (text ?? "").replace(/\r/g, "");
  const collapse = (s: string) => s.replace(/[ \t]+/g, " ").trim();

  // Firm name: value up to the next label or the end of its line.
  const firmM = t.match(
    /firm'?s name[\s:]*([\s\S]*?)(?=\s*(?:firm'?s (?:ein|address)|phone no|ptin\b|preparer'?s)|\n|$)/i,
  );
  let firm = firmM ? collapse(firmM[1]) : "";
  if (/^(?:ein|address|phone|ptin)\b/i.test(firm)) firm = "";

  // Firm address: value (possibly glued + multi-line) up to "Phone no." / next label.
  const addrM = t.match(
    /firm'?s address[\s:]*([\s\S]*?)(?=\s*(?:phone no|may the irs|firm'?s (?:name|ein))|\n\s*\n\s*(?:part |form 990)|$)/i,
  );
  const addrParts = addrM
    ? addrM[1]
        .split(/\n/)
        .map((s) => collapse(s))
        .filter(Boolean)
    : [];
  const address = addrParts.length ? addrParts.join(", ") : null;

  // Phone: the first phone number after the "Phone no." label.
  const phoneM = t.match(/phone no\.?[\s:]*(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i);
  const phone = phoneM ? phoneM[1].trim() : null;

  return { firm: firm || null, phone, address };
}

// --- Balance-sheet property (Part X line 10, from the same whole-page paste) ----
export interface ParsedBalanceSheet {
  landBuildingsGross: number | null; // 10a: land, buildings & equipment cost basis
  accumDepreciation: number | null; // 10b: less accumulated depreciation
}

/** Pull the property cost basis + accumulated depreciation from Form 990 Part X
 *  (Balance Sheet) line 10 — present in the CORE 990 iframe of a /full render, so
 *  it comes along with the officers/preparer paste. Renders glue the line marker
 *  to its value ("…Schedule D10a8,557,507", "…depreciation 10b959,2487,132,391"),
 *  so we anchor on the label then read ONE comma-grouped number after the marker
 *  (the `\d{1,3}(?:,\d{3})*` stops at the next number's boundary, not merging the
 *  glued net-book-value that follows). The buildings-vs-land-vs-equipment SPLIT is
 *  on Schedule D Part VI (a separate iframe) and stays manual. */
export function extractBalanceSheet(text: string): ParsedBalanceSheet {
  const t = (text ?? "").replace(/\r/g, "");
  const numAfter = (re: RegExp): number | null => {
    const m = t.match(re);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  return {
    landBuildingsGross: numAfter(
      /land,?\s*buildings,?\s*and\s*equipment[^\n]*?10a\s*(\d{1,3}(?:,\d{3})*)/i,
    ),
    accumDepreciation: numAfter(/accumulated\s+depreciation[^\n]*?10b\s*(\d{1,3}(?:,\d{3})*)/i),
  };
}
