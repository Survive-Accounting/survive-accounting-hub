// Parser for a 990 "Part VII" officers/directors text block, pasted by hand.
// Pure + unit-tested. Extracts (ALL-CAPS name, title) pairs from the stacked or
// same-line formats you get when copying the section out of a 990 / ProPublica.
// Titles are stored AS-IS, truncations included ("CHAPTER ADVI", "VICE-PRESIDE").

export interface ParsedOfficer {
  name: string;
  title: string;
}

// Section/column headers and boilerplate to ignore.
const HEADER_RE =
  /^(part\s|section\s|\([a-f]\)|name and title|average|reportable|estimated|position|officers|directors|trustees|key employee|highest compensated|former|see (schedule|statement|part)|form 990|schedule|individual trustee|institutional trustee|check if|do not|total\b|w-2|1099|hours)/i;

// A person name: 2–4 ALL-CAPS tokens (letters, periods, apostrophes, hyphens).
const NAME_RE = /^[A-Z][A-Z.'-]*(?:\s+[A-Z][A-Z.'-]*){1,3}$/;

// Same-line "JANE SMITH        PRESIDENT   1.00 X" → name, title. Name tokens may
// be single letters (middle initials), matching NAME_RE.
const SAME_LINE_RE =
  /^([A-Z][A-Z.'-]*(?:\s+[A-Z][A-Z.'-]*){1,3})\s{2,}([A-Z][A-Z0-9 .,'&/-]{1,40}?)(?:\s{2,}.*|\s+[\d.X].*)?$/;

function isNumericish(l: string): boolean {
  return /^[\d.,$%()\sX-]+$/i.test(l);
}
function looksName(l: string): boolean {
  return NAME_RE.test(l) && l.length >= 4 && l.length <= 40;
}

/** Extract officer (name, title) pairs. Deduplicated, order preserved. */
export function parseOfficers(text: string): ParsedOfficer[] {
  const lines = (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: ParsedOfficer[] = [];
  let pendingName: string | null = null;

  for (const l of lines) {
    if (HEADER_RE.test(l)) {
      pendingName = null;
      continue;
    }
    const same = l.match(SAME_LINE_RE);
    if (same) {
      out.push({ name: same[1].trim(), title: same[2].trim() });
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
    out.push({ name: pendingName, title: l });
    pendingName = null;
  }

  const seen = new Set<string>();
  return out.filter((o) => {
    const k = `${o.name}|${o.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
