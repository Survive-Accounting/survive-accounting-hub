// GROWTH CONTACTS — the 25-column contract (CONTACTS-SCHEMA.md).
//
// One row is one outreach target: an ORG CHANNEL (the chapter/council/club/office account or
// inbox) or a PERSON at that org. The same columns import, export and survive every future
// scrape, so nothing gets re-mapped by hand.
//
// Pure: no network, no React, no node builtins except the hash. Client-safe.

export const CONTACT_COLUMNS = [
  "contact_id", "school", "council", "org_type", "org_name", "contact_kind",
  "exec_title", "first_name", "last_name", "full_name",
  "org_ig", "personal_ig", "alt_ig", "email", "councils_covered",
  "needs_review", "review_reason", "notes", "source",
  "dm_status", "dm_channel", "dm_sent_at", "dm_replied_at", "dm_owner", "dm_notes",
] as const;
export type ContactColumn = (typeof CONTACT_COLUMNS)[number];

export const COUNCILS = ["IFC", "Panhellenic", "NPHC", "MGC", "Campus Club", "FSL Office", "Other"] as const;
export type Council = (typeof COUNCILS)[number];

export const ORG_TYPES = ["council", "chapter", "club", "office"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const CONTACT_KINDS = ["org_inbox", "student_officer", "staff"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

/** App-owned. A scrape import must never blank a non-blank value in these. */
export const DM_STATUSES = ["", "queued", "sent", "replied", "converted", "bounced", "do_not_contact"] as const;
export type DmStatus = (typeof DM_STATUSES)[number];
export const DM_CHANNELS = ["", "org_ig", "personal_ig", "email"] as const;
export type DmChannel = (typeof DM_CHANNELS)[number];

/** Columns 20-25: owned by the app, never overwritten with a blank from a scrape. */
export const APP_OWNED_COLUMNS: readonly ContactColumn[] = ["dm_status", "dm_channel", "dm_sent_at", "dm_replied_at", "dm_owner", "dm_notes"];

export interface ContactRecord {
  contact_id: string;
  school: string;
  council: Council | string;
  org_type: OrgType | "";
  org_name: string;
  contact_kind: ContactKind | "";
  exec_title: string;
  first_name: string;
  last_name: string;
  full_name: string;
  org_ig: string;
  personal_ig: string;
  alt_ig: string;
  email: string;
  councils_covered: string;
  needs_review: string;   // "yes" | ""
  review_reason: string;
  notes: string;
  source: string;
  dm_status: string;
  dm_channel: string;
  dm_sent_at: string;
  dm_replied_at: string;
  dm_owner: string;
  dm_notes: string;
}

export const emptyContact = (): ContactRecord =>
  Object.fromEntries(CONTACT_COLUMNS.map((c) => [c, ""])) as unknown as ContactRecord;

// ---- the stable id ---------------------------------------------------------------------------

/** SHA-1, hex. Small self-contained implementation: the id must be computable in the browser (to
 *  preview an import) and on the server (to upsert), and must match the PowerShell cleaner's
 *  `Sha12` byte for byte, so re-importing a file it produced updates rather than duplicates. */
export function sha1Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const ml = bytes.length * 8;
  // 64-byte blocks, message + 0x80 + zero pad + 8-byte big-endian length
  const withPad = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, ml >>> 0, false);
  dv.setUint32(withPad.length - 8, Math.floor(ml / 4294967296), false);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rol = (n: number, s: number) => ((n << s) | (n >>> (32 - s))) >>> 0;

  for (let i = 0; i < withPad.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
    for (let j = 16; j < 80; j++) w[j] = rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rol(a, 5) + (f >>> 0) + e + k + w[j]) >>> 0;
      e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** The identity of a contact: school, council, org, person, handles, email — lower-cased and
 *  pipe-joined, exactly as the cleaner builds it. Change this and every id changes, so don't. */
export function contactKey(r: Pick<ContactRecord, "school" | "council" | "org_name" | "full_name" | "personal_ig" | "org_ig" | "email">): string {
  return [r.school, r.council, r.org_name, r.full_name, r.personal_ig, r.org_ig, r.email].join("|").toLowerCase();
}

export const contactId = (r: Parameters<typeof contactKey>[0]): string => sha1Hex(contactKey(r)).slice(0, 12);

/** Fill in a missing id. Rows that arrive with one keep it — the operator may have edited a field
 *  the id is built from, and their id is what the existing row is stored under. */
export function withContactId(r: ContactRecord): ContactRecord {
  return r.contact_id ? r : { ...r, contact_id: contactId(r) };
}

// ---- CSV -------------------------------------------------------------------------------------

const cell = (v: string | null | undefined): string => {
  const s = (v ?? "").replace(/\r?\n/g, " ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function contactsToCsv(rows: readonly ContactRecord[]): string {
  return [CONTACT_COLUMNS.join(","), ...rows.map((r) => CONTACT_COLUMNS.map((c) => cell(r[c])).join(","))].join("\n");
}

/** Split one line: comma with quoted fields, or tab. */
export function splitRow(line: string): string[] {
  if (line.includes("\t") && !line.includes('","')) return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Header cell -> column. Accepts the new names and the legacy scrape names, so a raw
 *  `School,Council,Role,Name,Instagram,Chapter,Email` file still parses (it is then cleaned). */
const HEADER_MAP: Record<string, ContactColumn | "legacy_role" | "legacy_name" | "legacy_instagram" | "legacy_chapter"> = {
  contact_id: "contact_id", id: "contact_id",
  school: "school", campus: "school", university: "school", college: "school",
  council: "council",
  org_type: "org_type", orgtype: "org_type",
  org_name: "org_name", orgname: "org_name", organization: "org_name",
  contact_kind: "contact_kind", contactkind: "contact_kind", kind: "contact_kind",
  exec_title: "exec_title", exectitle: "exec_title", title: "exec_title",
  first_name: "first_name", firstname: "first_name", first: "first_name",
  last_name: "last_name", lastname: "last_name", last: "last_name",
  full_name: "full_name", fullname: "full_name",
  org_ig: "org_ig", orgig: "org_ig",
  personal_ig: "personal_ig", personalig: "personal_ig",
  alt_ig: "alt_ig", altig: "alt_ig",
  email: "email", "e-mail": "email",
  councils_covered: "councils_covered", councilscovered: "councils_covered",
  needs_review: "needs_review", needsreview: "needs_review",
  review_reason: "review_reason", reviewreason: "review_reason",
  notes: "notes", source: "source",
  dm_status: "dm_status", dm_channel: "dm_channel", dm_sent_at: "dm_sent_at",
  dm_replied_at: "dm_replied_at", dm_owner: "dm_owner", dm_notes: "dm_notes",
  // legacy scrape shape
  role: "legacy_role", position: "legacy_role",
  name: "legacy_name", officer: "legacy_name",
  instagram: "legacy_instagram", ig: "legacy_instagram", handle: "legacy_instagram",
  chapter: "legacy_chapter", affiliation: "legacy_chapter",
};

const normHeader = (h: string) => h.toLowerCase().replace(/^﻿/, "").replace(/[*_`]/g, (m) => (m === "_" ? "_" : "")).replace(/[^a-z_-]/g, "").trim();

export interface ParsedContacts {
  rows: ContactRecord[];
  /** True when the file carried the legacy scrape columns and needs the cleaner. */
  legacy: boolean;
  headerFound: boolean;
  skipped: number;
}

/** Read a contacts CSV in either shape. Legacy files come back with the scrape values parked in
 *  `exec_title` / `full_name` / `personal_ig` / `org_name` and `legacy: true`, for the cleaner. */
export function parseContactsFile(text: string): ParsedContacts {
  const lines = (text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { rows: [], legacy: false, headerFound: false, skipped: 0 };
  const header = splitRow(lines[0]).map(normHeader);
  const map = header.map((h) => HEADER_MAP[h] ?? null);
  if (!map.some(Boolean)) return { rows: [], legacy: false, headerFound: false, skipped: 0 };
  const legacy = map.some((m) => typeof m === "string" && m.startsWith("legacy_")) && !map.includes("org_name");

  const rows: ContactRecord[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.length > 1 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) continue;
    const r = emptyContact();
    let any = false;
    map.forEach((field, idx) => {
      if (!field) return;
      const v = (cells[idx] ?? "").trim();
      if (!v) return;
      any = true;
      switch (field) {
        case "legacy_role": r.exec_title = v; break;
        case "legacy_name": r.full_name = v; break;
        case "legacy_instagram": r.personal_ig = v; break;
        case "legacy_chapter": r.org_name = v; break;
        default: (r as unknown as Record<string, string>)[field] = v;
      }
    });
    if (!any) { skipped++; continue; }
    rows.push(r);
  }
  return { rows, legacy, headerFound: true, skipped };
}
