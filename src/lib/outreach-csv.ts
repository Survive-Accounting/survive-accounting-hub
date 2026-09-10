// COLD OUTREACH CSV — one file shape in, the same shape out, for one school or for all of them.
//
//   School | Council | Role | Name | Instagram | Chapter | Email
//
// School stays column one even on a single-school export, so a file King pulls for Ole Miss can be
// pasted straight into the all-schools import without editing a thing. On a single-school import
// the column is optional and, when present, must agree with the school being imported into — a
// mismatched row is reported rather than quietly filed under the wrong campus.
//
// Pure: no network, no React. The server layer resolves names to ids; this only reads and writes text.

export const CSV_HEADERS = ["School", "Council", "Role", "Name", "Instagram", "Chapter", "Email"] as const;

export interface ContactCsvRow {
  school: string;
  council: string;    // raw label as written; councilKeyFromLabel maps it
  role: string;
  name: string;
  instagram: string;
  chapter: string;
  email: string;
  /** 1-based line in the source file, for reporting a bad row back to King. */
  line: number;
}

// ---- writing ---------------------------------------------------------------------------------

/** RFC-4180 escaping: quote anything containing a comma, quote or newline; double inner quotes. */
export function csvCell(v: string | null | undefined): string {
  const s = (v ?? "").replace(/\r?\n/g, " ").trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly Omit<ContactCsvRow, "line">[]): string {
  const head = CSV_HEADERS.join(",");
  const body = rows.map((r) => [r.school, r.council, r.role, r.name, r.instagram, r.chapter, r.email].map(csvCell).join(","));
  return [head, ...body].join("\n");
}

// ---- reading ---------------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, keyof ContactCsvRow> = {
  school: "school", campus: "school", university: "school", college: "school",
  council: "council", org: "council", organization: "council", organisation: "council",
  role: "role", position: "role", title: "role",
  name: "name", officer: "name", "full name": "name", contact: "name",
  instagram: "instagram", ig: "instagram", handle: "instagram", "instagram handle": "instagram",
  chapter: "chapter", "chapter affiliation": "chapter", affiliation: "chapter", house: "chapter",
  email: "email", "e-mail": "email", "email address": "email",
};

/** Split one line: tab, pipe (markdown tables) or comma with quoted fields. */
export function splitCsvLine(line: string): string[] {
  const l = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (l.includes("\t")) return l.split("\t").map((c) => c.trim());
  if (l.includes("|")) return l.split("|").map((c) => c.trim());
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const isSeparator = (cells: string[]) => cells.length > 1 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "");
const BLANKS = /^(null|n\/?a|none|-|—|–)$/i;

/** Read a contacts file. Requires a header row — without one we cannot tell a council from a role,
 *  and guessing would file people under the wrong org. Unknown columns are ignored, so a sheet
 *  carrying extra notes still imports. */
export function parseContactsCsv(text: string): { rows: ContactCsvRow[]; skipped: number; headerFound: boolean } {
  const lines = (text ?? "").split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { rows: [], skipped: 0, headerFound: false };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[*_`]/g, "").trim());
  const map = header.map((h) => HEADER_ALIASES[h] ?? null);
  if (!map.some(Boolean)) return { rows: [], skipped: 0, headerFound: false };

  const rows: ContactCsvRow[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (isSeparator(cells)) continue;
    const r: ContactCsvRow = { school: "", council: "", role: "", name: "", instagram: "", chapter: "", email: "", line: i + 1 };
    map.forEach((field, idx) => {
      if (!field || field === "line") return;
      const v = (cells[idx] ?? "").replace(/[*`]/g, "").trim();
      if (!v || BLANKS.test(v)) return;
      r[field] = v;
    });
    // A row with no way to reach anyone is not a contact.
    if (!r.instagram && !r.email) { skipped++; continue; }
    rows.push(r);
  }
  return { rows, skipped, headerFound: true };
}

/** Council label → the key the tables use. Covers everything King's sheet will say, including
 *  Women in Business and the catch-all "other". Unknown returns null so the row is reported. */
export function councilKeyFromLabel(v: string | null | undefined): string | null {
  const s = (v ?? "").toLowerCase().trim();
  if (!s) return null;
  if (/interfrat|\bifc\b|^fraternit/.test(s)) return "ifc";
  if (/panhel|\bnpc\b|\bcpc\b|^sororit/.test(s)) return "panhellenic";
  if (/nphc|divine\s*9|divine nine|pan-hellenic/.test(s)) return "nphc";
  if (/multicultural|\bmgc\b|\bnalfo\b|\bnapa\b/.test(s)) return "mgc";
  if (/women in business|\bwib\b/.test(s)) return "wib";
  if (/greek life|\bfsl\b|fraternity and sorority|^other$|^misc/.test(s)) return "fsl";
  return null;
}

export const COUNCIL_EXPORT_LABEL: Record<string, string> = {
  ifc: "IFC", panhellenic: "Panhellenic", nphc: "NPHC", mgc: "MGC", wib: "Women in Business", fsl: "Other",
};

/** Bare instagram handle from a handle, @handle or URL. Empty string when there is nothing usable.
 *  ANCHORED AT BOTH ENDS on purpose: an unanchored version matches the tail of any string, so a
 *  Name column that slipped into the Instagram column would turn "John Smith" into "smith" and we
 *  would DM a stranger. A value that is not a handle must come back empty and be reported. */
export function csvHandle(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s || BLANKS.test(s)) return "";
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com\/)?@?([A-Za-z0-9._]{2,40})\/?$/);
  return m ? m[1].toLowerCase() : "";
}

/** Lowercased email, or "" when it does not look like one. */
export function csvEmail(v: string | null | undefined): string {
  const s = (v ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s) ? s : "";
}

/** Loose key for matching a school or chapter name across spellings. */
export const matchKey = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
