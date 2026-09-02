// IN-APP CONTACT FINDING — the pure half. Councils, the review-table flags, the Instagram
// state machine, and the one function that decides whether a row may be imported.
//
// WHY SO MUCH LIVES HERE: this feature's value is entirely in what it REFUSES to save. A wrong
// Instagram handle is worse than a blank one, because nobody re-checks a filled field. Those
// rules are therefore pure, exhaustively tested, and impossible to bypass from the UI.

export const COUNCIL_KEYS = ["ifc", "panhellenic", "nphc", "mgc", "fsl", "wib"] as const;
export type CouncilKey = (typeof COUNCIL_KEYS)[number];

export const COUNCIL_LABEL: Record<CouncilKey, string> = {
  ifc: "IFC",
  panhellenic: "Panhellenic",
  nphc: "NPHC",
  mgc: "MGC",
  fsl: "Greek Life / FSL",
  wib: "Women in Business",
};

/** Roles worth having, in priority order — the scholarship chair outranks the president here
 *  because academics is the reason a chapter says yes. */
export const ROLE_PRIORITY = [
  "Scholarship / Academic Chair",
  "President",
  "Vice President",
  "Treasurer",
] as const;

export function rolePriority(role: string | null | undefined): number {
  const r = (role ?? "").toLowerCase();
  if (/scholar|academic/.test(r)) return 0;
  if (/president/.test(r) && !/vice/.test(r)) return 1;
  if (/vice|vp\b/.test(r)) return 2;
  if (/treasur/.test(r)) return 3;
  return 9;
}

// ── the shapes the model returns and the table edits ─────────────────────────────────────────
export type CouncilPage = { council: CouncilKey; url: string; confidence: "high" | "low" };
export type UrlProbe = { url: string; status: number | null; ok: boolean };

export type IgSource = "listed" | "found" | "manual" | null;

export type OfficerRow = {
  id: string;                  // client-side row id, not a DB id
  council: CouncilKey;
  position: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;        // dormant — collected historically, not surfaced or used
  instagram: string | null;
  instagramSource: IgSource;
  instagramConfidence: "high" | "low" | null;
  chapter: string | null;      // the officer's own Greek chapter, when the source lists it
  sourceUrl: string | null;
  /** unchecked rows are excluded from the import */
  include: boolean;
  igVerified: boolean;
  sourceChecked: boolean;
};

// ── flags ────────────────────────────────────────────────────────────────────────────────────
export type FlagLevel = "ok" | "warn" | "block";
export type RowFlag = { level: FlagLevel; code: string; message: string };

/** Role/shared inboxes. These are real contacts but they are not a PERSON, and the last batch
 *  produced 27 unique emails across 126 rows precisely because they were substituted for one. */
const ROLE_LOCALPARTS = /^(info|contact|hello|admin|office|greek|greeklife|fsl|ifc|panhellenic|nphc|mgc|president|treasurer|secretary|recruitment|scholarship|exec|board|council|studentinvolvement|involvement)([.\d_-]|$)/i;
/** Councils and roles also arrive CONCATENATED — "ifcpresident@", "panhellenicvp@". Found in the
 *  first live run against Ole Miss, where the model correctly refused to invent a personal
 *  address and returned the council role inbox instead. */
const COUNCIL_TOKEN = /(ifc|interfraternity|panhel|nphc|mgc|greeklife|greek|fsl|council)/i;
const ROLE_TOKEN = /(president|vp|vicepresident|treasurer|secretary|scholarship|academic|recruitment|exec|chair|advisor|office|info|contact|admin)/i;

export function isRoleAccountEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  const local = e.split("@")[0];
  if (ROLE_LOCALPARTS.test(local)) return true;
  // A single run-together word that names a council AND a role is an inbox, not a person.
  if (/^[a-z]+$/.test(local) && COUNCIL_TOKEN.test(local) && ROLE_TOKEN.test(local)) return true;
  return false;
}

/** Normalize a handle for comparison: strip @, url, case, trailing slash. */
export function normalizeHandle(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const m = s.match(/(?:instagram\.com\/)?@?([A-Za-z0-9._]{2,40})\/?$/);
  return m ? m[1].toLowerCase() : null;
}

export function normalizeEmail(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return s.includes("@") ? s : null;
}

export function hasContactMethod(r: Pick<OfficerRow, "email" | "phone" | "instagram">): boolean {
  return !!(normalizeEmail(r.email) || (r.phone ?? "").replace(/\D/g, "").length >= 10 || normalizeHandle(r.instagram));
}

/** THE FLAGS, computed over the whole batch because two of them are about collisions.
 *  `existing` = handles/emails already on this campus (duplicates are excluded, not merged —
 *  the importer must never overwrite a contact that is already there). */
export function flagRows(
  rows: OfficerRow[],
  existing: { emails: string[]; handles: string[] } = { emails: [], handles: [] },
): Map<string, RowFlag[]> {
  const out = new Map<string, RowFlag[]>();
  const handleCount = new Map<string, number>();
  for (const r of rows) {
    const h = normalizeHandle(r.instagram);
    if (h) handleCount.set(h, (handleCount.get(h) ?? 0) + 1);
  }
  const existingEmails = new Set(existing.emails.map((e) => e.trim().toLowerCase()));
  const existingHandles = new Set(existing.handles.map((h) => normalizeHandle(h)).filter(Boolean) as string[]);

  for (const r of rows) {
    const f: RowFlag[] = [];
    const email = normalizeEmail(r.email);
    const handle = normalizeHandle(r.instagram);

    if (!hasContactMethod(r)) f.push({ level: "block", code: "no_contact", message: "no contact method — will be skipped" });
    if (!r.sourceUrl) f.push({ level: "block", code: "no_source", message: "no source URL — unverifiable" });

    if (email && isRoleAccountEmail(email)) f.push({ level: "warn", code: "role_email", message: "email looks like a role account" });
    if (handle && (handleCount.get(handle) ?? 0) > 1) f.push({ level: "warn", code: "shared_ig", message: "Instagram matches another row — org account, not a person" });
    if (email && existingEmails.has(email)) f.push({ level: "block", code: "dup_email", message: "email already on this campus — excluded" });
    if (handle && existingHandles.has(handle)) f.push({ level: "block", code: "dup_ig", message: "Instagram already on this campus — excluded" });
    if (r.instagramSource === "found" && !r.igVerified) f.push({ level: "warn", code: "ig_unconfirmed", message: "Instagram found by search — confirm before trusting" });

    out.set(r.id, f);
  }
  return out;
}

export const worstLevel = (flags: RowFlag[]): FlagLevel =>
  flags.some((f) => f.level === "block") ? "block" : flags.some((f) => f.level === "warn") ? "warn" : "ok";

/** A row may import when the user kept it AND nothing blocks it. Warnings never block —
 *  they are the reason a person is looking at this table. */
export function canImport(r: OfficerRow, flags: RowFlag[]): boolean {
  return r.include && !flags.some((f) => f.level === "block");
}

export function importSummary(rows: OfficerRow[], flags: Map<string, RowFlag[]>): {
  importing: number; total: number; excluded: Array<{ reason: string; count: number }>;
} {
  let importing = 0;
  const reasons = new Map<string, number>();
  for (const r of rows) {
    const f = flags.get(r.id) ?? [];
    if (canImport(r, f)) { importing++; continue; }
    const why = !r.include ? "unchecked" : (f.find((x) => x.level === "block")?.message ?? "excluded");
    reasons.set(why, (reasons.get(why) ?? 0) + 1);
  }
  return {
    importing, total: rows.length,
    excluded: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

// ── the Instagram state machine ──────────────────────────────────────────────────────────────
// Three states, one fast fallback. The model attempts every handle and has to be honest about
// what it found; the table shows which is which and makes closing the gap one click.
export type IgState = "listed" | "found_unconfirmed" | "confirmed" | "missing";

export function igState(r: Pick<OfficerRow, "instagram" | "instagramSource" | "igVerified">): IgState {
  if (!normalizeHandle(r.instagram)) return "missing";
  if (r.igVerified) return "confirmed";
  if (r.instagramSource === "listed") return "listed";
  return "found_unconfirmed";
}

/** The prefilled search a person runs when the model found nothing — built from what we already
 *  know, so it is one click and a paste rather than a retyped query. */
export function igSearchQuery(i: { name: string | null; campusName: string; council: CouncilKey; position: string | null }): string {
  const parts = [i.name ? `"${i.name}"` : "", `"${i.campusName}"`, COUNCIL_LABEL[i.council], (i.position ?? "").toLowerCase(), "instagram"];
  return parts.filter(Boolean).join(" ").trim();
}

export const igSearchUrl = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
export const igProfileUrl = (handle: string) => `https://instagram.com/${normalizeHandle(handle) ?? ""}`;

/** The scoreboard line in the enrichment header: "IG auto-find: 31% confirmed". Only `found`
 *  handles count — listed ones were never a guess, and manual ones were typed by a person. */
export function igHitRate(o: { confirmed: number; cleared: number }): { pct: number | null; label: string } {
  const n = o.confirmed + o.cleared;
  if (n === 0) return { pct: null, label: "IG auto-find: no data yet" };
  const pct = Math.round((o.confirmed / n) * 100);
  return { pct, label: `IG auto-find: ${pct}% confirmed (${o.confirmed}/${n})` };
}

// ── the prompts — the same words the gateway is given and the fallback copies out (§6) ───────
export function councilPrompt(campusName: string): string {
  return `Find the official web pages for ${campusName}'s IFC, Panhellenic, NPHC, MGC, Greek Life / FSL office, and Women in Business or its equivalent. Return only official university or council pages.`;
}

export function officerPrompt(campusName: string, urls: Array<{ council: CouncilKey; url: string }>): string {
  const list = urls.map((u) => `${COUNCIL_LABEL[u.council]}: ${u.url}`).join("\n");
  return [
    `From these ${campusName} council pages, return two things per council: the council's own Instagram account, and its Scholarship Chair and President.`,
    "",
    list,
    "",
    "Only these two roles per council, in priority order: Scholarship / Academic Chair, then President. Accept common equivalents for the chair (academic chair, VP of scholarship, VP of academic affairs, chapter development). Ignore every other officer — we do not use vice presidents, treasurers, secretaries, recruitment, or advisors.",
    "",
    "Also return one row per council for the council's OWN organization Instagram — position \"Organization\", no personal name, the council account's handle in the instagram field.",
    "",
    "For each row return: council, position, name, email, instagram, chapter, source_url. (Do not return phone numbers — we do not use them.)",
    "",
    "chapter is the officer's OWN Greek chapter when the page states it (e.g. an IFC officer listed as Sigma Chi). Return it only when it's on the page — never search for it, null otherwise.",
    "",
    "Email is opportunistic: if the page lists a personal email return it, otherwise null. Never substitute the council's or Greek Life office's general address as a person's email.",
    "Personal Instagram is the priority. For the chair and president, search their name plus the university plus their role, but only return a handle when there is specific evidence it belongs to that person — their name in the bio, the council tagged, the university in the profile. Never construct a handle from a name. Never return a council or chapter account as a person's Instagram — the council account belongs only on the \"Organization\" row. When unsure, return null.",
    "Include source_url for every officer.",
  ].join("\n");
}

// ── §6 FALLBACK — paste import ───────────────────────────────────────────────────────────────
// When the gateway is down, King's current workflow is the backstop: copy the prompt, run it
// wherever, paste the result back. Accepts tab-separated, CSV, and markdown tables, because that
// is what actually comes off a model or a spreadsheet.

const HEADER_ALIASES: Record<string, keyof PastedRow> = {
  council: "council", org: "council",
  position: "position", role: "position", title: "position",
  name: "name", officer: "name", "full name": "name",
  email: "email", "e-mail": "email",
  phone: "phone", mobile: "phone", tel: "phone",
  instagram: "instagram", ig: "instagram", handle: "instagram",
  chapter: "chapter", "chapter affiliation": "chapter", affiliation: "chapter",
  source: "sourceUrl", source_url: "sourceUrl", "source url": "sourceUrl", url: "sourceUrl",
};

export type PastedRow = {
  council: string | null; position: string | null; name: string | null;
  email: string | null; phone: string | null; instagram: string | null;
  chapter: string | null; sourceUrl: string | null;
};

function splitLine(line: string): string[] {
  const l = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (l.includes("\t")) return l.split("\t").map((c) => c.trim());
  if (l.includes("|")) return l.split("|").map((c) => c.trim());
  // CSV with quoted fields
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

const isSeparatorRow = (cells: string[]) => cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")) || c === "");

/** Parse whatever was pasted into rows. Requires a header line naming at least one known column;
 *  anything it cannot map is dropped rather than guessed into the wrong field. */
export function parsePastedContacts(text: string): PastedRow[] {
  const lines = (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[*_`]/g, "").trim());
  const map = header.map((h) => HEADER_ALIASES[h] ?? null);
  if (!map.some(Boolean)) return [];

  const rows: PastedRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    if (isSeparatorRow(cells)) continue;
    const r: PastedRow = { council: null, position: null, name: null, email: null, phone: null, instagram: null, chapter: null, sourceUrl: null };
    let any = false;
    map.forEach((field, i) => {
      if (!field) return;
      const v = (cells[i] ?? "").replace(/[*`]/g, "").trim();
      if (!v || /^(null|n\/?a|none|-|—)$/i.test(v)) return;
      r[field] = v;
      any = true;
    });
    if (any) rows.push(r);
  }
  return rows;
}

/** Map a pasted council label onto our keys; unknown labels return null so the row is reviewed
 *  rather than silently filed under the wrong council. */
export function councilFromLabel(v: string | null | undefined): CouncilKey | null {
  const s = (v ?? "").toLowerCase();
  if (!s) return null;
  if (/interfrat|\bifc\b/.test(s)) return "ifc";
  if (/panhel/.test(s)) return "panhellenic";
  if (/nphc|pan-hellenic|divine nine/.test(s)) return "nphc";
  if (/multicultural|\bmgc\b/.test(s)) return "mgc";
  if (/women in business|\bwib\b/.test(s)) return "wib";
  if (/greek life|\bfsl\b|fraternity and sorority/.test(s)) return "fsl";
  return null;
}
