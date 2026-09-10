// THE CONTACT CLEANER — a TypeScript port of clean-contacts.ps1, run on every scrape import
// before upsert, so a raw scrape lands clean without anyone opening PowerShell.
//
// What it fixes, in order (each step is a numbered section below):
//   1. whitespace, council spelling, emails; drop test rows and exact duplicates
//   2. move a row to the school its email domain proves; flag unknown domains
//   3. pull a chapter name hiding in Role or Name
//   4. re-match every chapter handle to the chapter it actually spells
//   5. split names, normalise titles, classify the contact, decide personal vs org handle
//   6. merge duplicates: per-council copies, multi-council advisors, the scraper's cartesian product
//   7. fill org_ig onto every row of the org; drop rows with no channel left
//
// Pure and deterministic: same input, same output, no network. That is what makes it testable and
// what lets the importer show a preview before writing anything.
import {
  AMBIGUOUS_DOMAINS, CLUB_ORGS, COUNCIL_TOKENS, DOMAIN_SCHOOL, DOMAIN_TYPOS, FSL_OFFICE_ALIASES,
  FSL_OFFICE_NAME, GREEK_ABBR, GREEK_WORD_RX, MGC_CHAPTERS, NICKNAMES, NON_CHAPTER_TOKENS,
  NPHC_CHAPTERS, OFFICE_TITLE_RX, ORG_WORD_RX, PANHELLENIC_CHAPTERS, SCHOOL_ALIASES, SCHOOL_NICK,
  STAFF_TITLE_RX, STUDENT_TITLE_RX, UNKNOWN_DOMAINS,
} from "@/lib/contacts-clean-tables";
import { contactId, emptyContact, type ContactRecord } from "@/lib/growth-contacts-schema";

// ---- small helpers ---------------------------------------------------------------------------

export const norm = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** SHOUTED NAMES back to Title Case; anything already mixed is left alone. */
export function titleCaseFix(s: string): string {
  if (!s || s !== s.toUpperCase() || s.length <= 4) return s;
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function normalizeEmail(e: string | null | undefined): string {
  const v = norm(e).toLowerCase().replace(/%20/g, "");
  if (!v) return "";
  const parts = v.split("@");
  if (parts.length !== 2) return v;
  const dom = DOMAIN_TYPOS[parts[1]] ?? parts[1];
  return `${parts[0]}@${dom}`;
}

export function rootDomain(email: string): string {
  if (!email || !email.includes("@")) return "";
  const p = email.split("@")[1].split(".");
  return p.length < 2 ? p[0] : `${p[p.length - 2]}.${p[p.length - 1]}`;
}

export function normalizeCouncil(c: string | null | undefined): string {
  const v = norm(c).toLowerCase();
  if (/^ifc$/.test(v)) return "IFC";
  if (/^panhel/.test(v)) return "Panhellenic";
  if (/^nphc$/.test(v)) return "NPHC";
  if (/^mgc$/.test(v)) return "MGC";
  if (/^women in business$/.test(v)) return "Campus Club";
  if (/^other$/.test(v)) return "Other";
  return norm(c);
}

export function normalizeTitle(r: string | null | undefined): string {
  let t = norm(r);
  if (!t) return "";
  t = titleCaseFix(t);
  t = t
    .replace(/\bVP\b/g, "Vice President").replace(/\bVice-President\b/g, "Vice President")
    .replace(/\s*&\s*/g, " and ").replace(/\bAsst\./g, "Assistant")
    .replace(/\bAdminstrative\b/g, "Administrative").replace(/\bOragnization\b/g, "Organization")
    .replace(/\bIntrafraternity\b/g, "Interfraternity").replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
  t = t.replace(/^(IFC|NPHC|MGC|CPC|IGC|Panhellenic|Panhellenic Council|Multicultural Greek Council|KU National Pan-Hellenic Council) (President|Advisor|Liaison)$/, "$2");
  return t.replace(/^[\s,-]+|[\s,-]+$/g, "");
}

export function isOrgName(n: string | null | undefined): boolean {
  if (!n) return false;
  if (GREEK_WORD_RX.test(n) && !/^(Sigma|Delta|Theta|Chi|Phi|Beta|Gamma|Kappa|Alpha)\s+[A-Z][a-z]+$/.test(n)) return true;
  return ORG_WORD_RX.test(n) || /^(IFC|Org|UTACPH|UTA IFC)$/.test(n);
}

export function splitName(full: string): { first: string; last: string } {
  let n = norm(full)
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*["“”].*?["“”]\s*/g, " ")
    .replace(/^(Dr|Mr|Mrs|Ms|Prof|Rev)\.?\s+/i, "")
    .replace(/,.*$/, "")
    .replace(/\s+(Jr|Sr|II|III|IV|PhD|Ph\.D|M\.Ed|Ed\.D)\.?$/i, "");
  n = norm(n);
  const tok = n.split(" ").filter(Boolean);
  if (tok.length === 0) return { first: "", last: "" };
  if (tok.length === 1) return { first: tok[0], last: "" };
  return { first: tok[0], last: tok[tok.length - 1] };
}

export function contactKindOf(title: string, name: string, isOrg: boolean): "org_inbox" | "student_officer" | "staff" {
  if (isOrg || !name) return "org_inbox";
  if (STUDENT_TITLE_RX.test(title) || /Chair$|President/.test(title)) return "student_officer";
  if (STAFF_TITLE_RX.test(title)) return "staff";
  return "student_officer";
}

export function stripHandle(h: string | null | undefined): string {
  return norm(h).toLowerCase()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/\/.*$/, "");
}

// ---- school token stripping ------------------------------------------------------------------

const FILLER = ["university", "univ", "college", "state", "tech", "official", "chapter", "uni"];
const STOP = new Set(["university", "of", "the", "college", "at", "and", "in", "institute", "technology", "community", "polytechnic", "state", "&", "-", "–"]);
const SMALL = new Set(["of", "the", "at", "and", "in", "&", "-", "–"]);

const tokenCache = new Map<string, string[]>();
/** Every string that means "this school" inside a handle: words, initialisms, nicknames, filler. */
export function schoolTokens(school: string): string[] {
  const hit = tokenCache.get(school);
  if (hit) return hit;
  const words = school.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  const t: string[] = [];
  for (const w of words) if (!STOP.has(w) && w.length >= 4) t.push(w);
  const sig = words.filter((w) => !SMALL.has(w));
  if (sig.length >= 2) t.push(sig.map((w) => w[0]).join(""));
  const sig2 = words.filter((w) => !SMALL.has(w) && !["university", "college", "institute", "technology"].includes(w));
  if (sig2.length >= 1) { const i = sig2.map((w) => w[0]).join(""); t.push(`${i}u`); t.push(`u${i}`); }
  for (const n of SCHOOL_NICK[school] ?? []) t.push(n);
  for (const f of FILLER) t.push(f);
  const arr = [...new Set(t.filter((x) => x.length >= 3))].sort((a, b) => b.length - a.length);
  tokenCache.set(school, arr);
  return arr;
}

/** What is left of a handle once every way of writing the school is stripped off either end.
 *  "auburnkd" -> "kd", "kappasigma_ksu" -> "kappasigma", "sfasu" -> "" (the school's own account). */
export function residual(handle: string, school: string): string {
  let h = handle.replace(/[^a-z0-9]/g, "").replace(/[0-9]+$/, "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of schoolTokens(school)) {
      for (const pre of [t + "of", t]) {
        if (h.length >= pre.length && h.startsWith(pre)) { h = h.slice(pre.length); changed = true; break; }
      }
      if (changed) break;
      for (const suf of ["atthe" + t, "at" + t, "of" + t, t]) {
        if (h.length >= suf.length && h.endsWith(suf)) { h = h.slice(0, h.length - suf.length); changed = true; break; }
      }
      if (changed) break;
    }
  }
  if (/^(of|at|u|edu)$/.test(h)) h = "";
  return h;
}

// ---- the chapter matcher ---------------------------------------------------------------------

const patternCache = new Map<string, string[]>();
/** Every string a chapter's handle might contain: letter-abbreviation combinations plus nicknames. */
export function chapterPatterns(chapter: string): string[] {
  const hit = patternCache.get(chapter);
  if (hit) return hit;
  const set = new Set<string>();
  if (CLUB_ORGS[chapter]) {
    for (const n of CLUB_ORGS[chapter]) set.add(n);
    const arr = [...set].sort((a, b) => b.length - a.length);
    patternCache.set(chapter, arr);
    return arr;
  }
  const words = chapter.replace(/\(.*?\)/g, "").replace(/[^A-Za-z ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase().split(" ").filter(Boolean);
  const greekWords = words.filter((w) => GREEK_ABBR[w]);
  if (greekWords.length === words.length && words.length > 0) {
    let combos = [""];
    for (const w of words) {
      const next: string[] = [];
      for (const c of combos) for (const a of GREEK_ABBR[w]) next.push(c + a);
      combos = next;
    }
    for (const c of combos) set.add(c);
  } else {
    set.add(words.join(""));
    if (words.length > 1) set.add(words.map((w) => w[0]).join(""));
  }
  for (const n of NICKNAMES[chapter] ?? []) set.add(n);
  const arr = [...set].filter((x) => x.length >= 2).sort((a, b) => b.length - a.length);
  patternCache.set(chapter, arr);
  return arr;
}

/** Score = matched pattern length, +6 when the residual STARTS with it, +3 when it ENDS with it.
 *  Two-letter patterns must equal or bound a short residual, or "kd" would match everything. */
export function scoreHandle(res: string, chapter: string): number {
  let best = 0;
  for (const p of chapterPatterns(chapter)) {
    let s = 0;
    if (p.length <= 2) {
      if (res === p) s = 8;
      else if (res.length <= 5 && res.startsWith(p)) s = 8;
      else if (res.length <= 5 && res.endsWith(p)) s = 5;
    } else if (res.includes(p)) {
      s = p.length;
      if (res.startsWith(p)) s += 6;
      else if (res.endsWith(p)) s += 3;
    }
    if (s > best) best = s;
  }
  return best;
}

export interface ChapterMatch { chapter: string; score: number; tie: boolean }

export function resolveChapter(res: string, candidates: readonly string[], claimed: string): ChapterMatch {
  if (!res) return { chapter: "", score: 0, tie: false };
  const uniq = [...new Set(candidates.filter(Boolean))];
  const scored = uniq.map((c) => ({ chapter: c, score: scoreHandle(res, c) }))
    .sort((a, b) => b.score - a.score || a.chapter.localeCompare(b.chapter));
  if (!scored.length || scored[0].score === 0) return { chapter: "", score: 0, tie: false };
  const tied = scored.filter((s) => s.score === scored[0].score);
  if (tied.length > 1) {
    if (claimed && tied.some((t) => t.chapter === claimed)) return { chapter: claimed, score: scored[0].score, tie: false };
    return { chapter: scored[0].chapter, score: scored[0].score, tie: true };
  }
  return { chapter: scored[0].chapter, score: scored[0].score, tie: false };
}

export function inferCouncil(chapter: string): string {
  if (CLUB_ORGS[chapter]) return "Campus Club";
  if (NPHC_CHAPTERS.includes(chapter)) return "NPHC";
  if (MGC_CHAPTERS.includes(chapter)) return "MGC";
  if (PANHELLENIC_CHAPTERS.includes(chapter)) return "Panhellenic";
  if (/Sorority/.test(chapter)) return "MGC";
  return "IFC";
}

export function councilOrgName(council: string): string {
  switch (council) {
    case "IFC": return "Interfraternity Council";
    case "Panhellenic": return "Panhellenic Council";
    case "NPHC": return "National Pan-Hellenic Council";
    case "MGC": return "Multicultural Greek Council";
    default: return FSL_OFFICE_NAME;
  }
}

// ---- the pipeline ----------------------------------------------------------------------------

/** The legacy scrape shape the cleaner takes in. */
export interface ScrapeRow { school: string; council: string; role: string; name: string; instagram: string; chapter: string; email: string }

export interface DroppedRow extends ScrapeRow { drop_reason: string }
export interface CleanResult {
  rows: ContactRecord[];
  dropped: DroppedRow[];
  stats: Record<string, number>;
}

interface Work {
  school: string; council: string; role: string; name: string; ig: string; chapter: string; email: string;
  notes: string[]; review: string[];
}

interface Rec {
  school: string; council: string; org_type: string; org_name: string; contact_kind: string;
  exec_title: string; first_name: string; last_name: string; full_name: string;
  org_ig: string; personal_ig: string; alt_ig: string; email: string; councils_covered: string;
  ig_raw: string; notes: string[]; review: string[];
}

/** Clean a batch of scraped rows into schema records. `source` is stamped on every output row. */
export function cleanContacts(inputUnsorted: readonly ScrapeRow[], source: string): CleanResult {
  const stats: Record<string, number> = { input_rows: inputUnsorted.length };
  const dropped: DroppedRow[] = [];
  const drop = (r: ScrapeRow, reason: string) => dropped.push({ ...r, drop_reason: reason });

  // DETERMINISM. Several steps keep "the first row of a group" — which duplicate survives a merge,
  // which handle becomes org_ig and which fall to alt_ig. Left to the order rows happen to arrive
  // in, the same contacts produce different output (and therefore different contact_ids) on every
  // scrape, and an upsert keyed on contact_id would insert a second copy of everyone. Sorting the
  // input first makes the whole pipeline a pure function of the SET of rows, not their order.
  const input = [...inputUnsorted].sort((a, b) =>
    a.school.localeCompare(b.school) || a.council.localeCompare(b.council) || a.chapter.localeCompare(b.chapter)
    || a.name.localeCompare(b.name) || a.role.localeCompare(b.role)
    || a.email.localeCompare(b.email) || a.instagram.localeCompare(b.instagram));

  // -- 1/2. normalise, drop test + exact dupes, move rows to the school their domain proves ------
  const rows: Work[] = [];
  const seen = new Set<string>();
  let cTest = 0, cExact = 0, cAlias = 0, cEmailFix = 0, cReassigned = 0, cDomainFlag = 0;
  for (const r of input) {
    let school = norm(r.school);
    if (SCHOOL_ALIASES[school]) { school = SCHOOL_ALIASES[school]; cAlias++; }
    const email = normalizeEmail(r.email);
    if (email !== norm(r.email).toLowerCase()) cEmailFix++;
    if (/example\.(edu|com)$|-test\./.test(email)) { drop(r, "test data"); cTest++; continue; }
    const o: Work = {
      school, council: normalizeCouncil(r.council), role: norm(r.role), name: norm(r.name),
      ig: stripHandle(r.instagram), chapter: norm(r.chapter), email, notes: [], review: [],
    };
    const root = rootDomain(email);
    if (root && DOMAIN_SCHOOL[root] && DOMAIN_SCHOOL[root] !== school) {
      o.notes.push(`moved from '${school}' (email domain ${root})`);
      o.school = DOMAIN_SCHOOL[root];
      cReassigned++;
    } else if (root && UNKNOWN_DOMAINS.includes(root)) {
      o.review.push(`email domain ${root} is not a known school domain - verify school`);
    }
    const key = [o.school, o.council, o.role, o.name, o.ig, o.chapter, o.email].join("|").toLowerCase();
    if (seen.has(key)) { drop(r, "exact duplicate"); cExact++; continue; }
    seen.add(key);
    rows.push(o);
  }
  stats.dropped_test_rows = cTest;
  stats.dropped_exact_duplicates = cExact;
  stats.school_alias_merged = cAlias;
  stats.emails_repaired = cEmailFix;
  stats.rows_moved_to_real_school_by_email_domain = cReassigned;

  // Majority .edu domain per school — flag the outliers as possible contamination.
  const bySchoolDomains = new Map<string, Map<string, number>>();
  for (const o of rows) {
    if (!/\.edu$/.test(o.email)) continue;
    const rd = rootDomain(o.email);
    if (AMBIGUOUS_DOMAINS.includes(rd) || UNKNOWN_DOMAINS.includes(rd)) continue;
    const m = bySchoolDomains.get(o.school) ?? new Map<string, number>();
    m.set(rd, (m.get(rd) ?? 0) + 1);
    bySchoolDomains.set(o.school, m);
  }
  const majDom = new Map<string, string>();
  for (const [school, counts] of bySchoolDomains) {
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) majDom.set(school, top[0]);
  }
  for (const o of rows) {
    if (!/\.edu$/.test(o.email) || !majDom.has(o.school)) continue;
    const rd = rootDomain(o.email);
    if (rd !== majDom.get(o.school) && !AMBIGUOUS_DOMAINS.includes(rd) && !UNKNOWN_DOMAINS.includes(rd) && DOMAIN_SCHOOL[rd] !== o.school) {
      o.review.push(`email domain ${rd} differs from school's usual domain ${majDom.get(o.school)}`);
      cDomainFlag++;
    }
  }
  stats.flagged_email_domain_mismatch = cDomainFlag;

  // -- 3. pull chapter names hiding in Role / Name ----------------------------------------------
  let cRoleChapter = 0;
  const greekStart = "(Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Pi|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega|Acacia|FarmHouse|Triangle)";
  const roleChapterRx = new RegExp(`^(${greekStart}[A-Za-z ]*?)\\s+(President|Chapter President|Chapter Advisor)$`);
  for (const o of rows) {
    if (!o.chapter) {
      let m: RegExpMatchArray | null;
      if ((m = o.role.match(/^President,\s*(.+)$/))) {
        o.chapter = m[1].replace(/\s*\(.*\)$/, ""); o.role = "President"; cRoleChapter++;
      } else if ((m = o.role.match(roleChapterRx))) {
        o.chapter = m[1].trim(); o.role = m[3]; cRoleChapter++;
      } else if (GREEK_WORD_RX.test(o.role) && !/Advisor|Chapter Contact|Organization Contact|Chapter$/.test(o.role)) {
        o.chapter = o.role; o.role = ""; cRoleChapter++;
      } else if (o.name && isOrgName(o.name) && GREEK_WORD_RX.test(o.name)) {
        o.chapter = o.name; cRoleChapter++;
      }
    }
    const paren = o.chapter.match(/^(.*?)\s*\((National|FIJI|WIB|WBC|VIC|SMIF)\)$/);
    if (paren) o.chapter = paren[1];
    o.chapter = o.chapter
      .replace(/\s*(International|National|Latin)?\s*(Fraternity|Sorority)\s*,?\s*Inc\.?.*$/, "")
      .replace(/,\s*Inc\.?$/, "").replace(/\s+Inc\.?$/, "")
      .replace(/^Phi Alpha chapter of\s*/, "").trim();
  }
  stats.chapter_extracted_from_role_or_name = cRoleChapter;

  // -- 4. re-match every chapter handle to the chapter it actually spells ------------------------
  const schoolChapters = new Map<string, string[]>();
  for (const o of rows) {
    if (!o.chapter) continue;
    const list = schoolChapters.get(o.school) ?? [];
    if (!list.includes(o.chapter)) list.push(o.chapter);
    schoolChapters.set(o.school, list);
  }
  const globalChapters = [...new Set([...rows.map((r) => r.chapter).filter(Boolean), ...Object.keys(NICKNAMES), ...Object.keys(CLUB_ORGS)])];
  const councilIg = new Map<string, string[]>();
  let cSame = 0, cReassign = 0, cCouncil = 0, cNoise = 0, cTie = 0, cNewOrg = 0, cClub = 0;

  for (const o of rows) {
    if (!o.ig || !o.chapter) continue;
    if (COUNCIL_TOKENS.test(o.ig) && !/frat|soror/.test(o.ig)) {
      const which = /panhel|cpc|npc/.test(o.ig) ? "Panhellenic" : /nphc/.test(o.ig) ? "NPHC" : /mgc/.test(o.ig) ? "MGC" : /ifc/.test(o.ig) ? "IFC" : "FSL Office";
      const k = `${o.school}|${which}`;
      councilIg.set(k, [...(councilIg.get(k) ?? []), o.ig]);
      o.notes.push(`handle '${o.ig}' is a ${which} account, moved to that council`);
      o.ig = ""; cCouncil++; continue;
    }
    const res0 = residual(o.ig, o.school);
    if (NON_CHAPTER_TOKENS.test(o.ig) || !res0 || res0.length <= 2) {
      o.notes.push(`handle '${o.ig}' is the school's or a generic account, not a chapter`);
      o.ig = ""; cNoise++; continue;
    }
    if (!GREEK_WORD_RX.test(o.chapter) && !/^(Triangle|Acacia|FarmHouse)$/.test(o.chapter)) continue;
    const club = resolveChapter(res0, Object.keys(CLUB_ORGS), "");
    if (club.score >= 5 && !club.tie) {
      o.notes.push(`handle '${o.ig}' is a ${club.chapter} account (campus club), moved from '${o.chapter}'`);
      o.chapter = club.chapter; o.council = "Campus Club"; cClub++; continue;
    }
    const res = resolveChapter(res0, schoolChapters.get(o.school) ?? [], o.chapter);
    const g = resolveChapter(res0, globalChapters, o.chapter);
    if ((res.score === 0 || res.tie || g.score >= res.score + 3) && g.score >= 6 && !g.tie && g.chapter !== res.chapter) {
      if (g.chapter === o.chapter) cSame++;
      else {
        o.notes.push(`chapter corrected from '${o.chapter}' to '${g.chapter}' based on handle (chapter was missing from this school's list)`);
        o.chapter = g.chapter; cNewOrg++;
      }
      continue;
    }
    if (res.score === 0 || res.tie) {
      if (o.name) continue;                       // officer row: handle may be personal, decided in step 5
      if (res.tie || g.tie) { o.review.push(`handle '${o.ig}' matches more than one chapter equally`); cTie++; }
      else { o.review.push(`handle '${o.ig}' does not match any chapter (claimed: ${o.chapter})`); cNoise++; }
      continue;
    }
    if (res.chapter === o.chapter) {
      cSame++;
      if (/dsp/.test(o.ig)) o.notes.push(`handle '${o.ig}' could be Delta Sigma Phi or Delta Sigma Pi; kept ${o.chapter}`);
    } else {
      o.notes.push(`chapter corrected from '${o.chapter}' to '${res.chapter}' based on handle`);
      o.chapter = res.chapter; cReassign++;
    }
  }
  stats.chapter_ig_confirmed = cSame;
  stats.chapter_ig_reassigned_to_correct_chapter = cReassign;
  stats.chapter_ig_assigned_to_chapter_missing_from_school_list = cNewOrg;
  stats.chapter_ig_moved_to_council = cCouncil;
  stats.chapter_ig_moved_to_campus_club = cClub;
  stats.chapter_ig_noise_or_unmatched = cNoise;
  stats.chapter_ig_ambiguous = cTie;

  // -- 5. build records --------------------------------------------------------------------------
  const recs: Rec[] = [];
  for (const o of rows) {
    const isOrg = !o.name || isOrgName(o.name);
    let title = normalizeTitle(o.role);
    let first = "", last = "";
    if (!isOrg) ({ first, last } = splitName(o.name));

    if (/^(Interfraternity Council|Panhellenic( Council)?|National Pan-Hellenic Council|Multicultural Greek Council)$/.test(o.chapter)) {
      o.council = /Interfraternity/.test(o.chapter) ? "IFC" : /Pan-Hellenic/.test(o.chapter) ? "NPHC" : /Panhellenic/.test(o.chapter) ? "Panhellenic" : "MGC";
      o.chapter = "";
    }
    let name = o.name;
    if (isOrg && /^(Greek Life|FSL|Fraternity and Sorority Life) (Advisor|Assistant|Coordinator|Director|Contact)$/.test(name)) {
      if (!title) title = name;
      name = FSL_OFFICE_NAME;
    }

    let council = o.council, orgType = "", orgName = "";
    if (o.chapter && (CLUB_ORGS[o.chapter] || (!GREEK_WORD_RX.test(o.chapter) && !/^(Triangle|Acacia|FarmHouse)$/.test(o.chapter)))) {
      council = "Campus Club"; orgType = "club"; orgName = o.chapter;
    } else if (o.chapter) {
      orgType = "chapter"; orgName = o.chapter;
      if (["Other", "Campus Club", ""].includes(council)) council = inferCouncil(o.chapter);
    } else if (council === "Campus Club") {
      orgType = "club"; orgName = isOrg && name ? name : "Women in Business";
    } else if (["IFC", "Panhellenic", "NPHC", "MGC"].includes(council)) {
      const kind = contactKindOf(title, name, isOrg);
      if (kind === "staff"
        || (isOrg && /Office|Life|Staff|Engagement|Involvement|Activities|Center|Department/.test(name))
        || (isOrg && OFFICE_TITLE_RX.test(title) && !/Council|Board|Chapter|Instagram|Organization|Org$/.test(title))) {
        orgType = "office";
        orgName = isOrg && name ? name
          : (isOrg && /Office|Life|Center|Affairs|Department|Student|Greek/.test(title) && !/Inbox|Email|Contact|Inquir|Staff/.test(title)) ? title
          : FSL_OFFICE_NAME;
      } else { orgType = "council"; orgName = councilOrgName(council); }
    } else {
      orgType = "office"; council = "FSL Office";
      orgName = isOrg && name ? name : FSL_OFFICE_NAME;
    }

    let kind = contactKindOf(title, name, isOrg);
    if (isOrg && OFFICE_TITLE_RX.test(title)) title = "";
    if (orgType === "chapter" && isOrg && !title) kind = "org_inbox";
    if (FSL_OFFICE_ALIASES.has(orgName)) orgName = FSL_OFFICE_NAME;

    recs.push({
      school: o.school, council, org_type: orgType, org_name: orgName, contact_kind: kind,
      exec_title: title, first_name: first, last_name: last, full_name: isOrg ? "" : name,
      org_ig: "", personal_ig: "", alt_ig: "", email: o.email, councils_covered: council,
      ig_raw: o.ig, notes: o.notes, review: o.review,
    });
  }

  // -- 6. classify each handle as org vs personal -------------------------------------------------
  let cPersonal = 0, cOrgIg = 0, cUnclassified = 0, cOtherOrg = 0;
  const strayOrgIg = new Map<string, string[]>();
  for (const r of recs) {
    if (!r.ig_raw) continue;
    const h = r.ig_raw;
    if (r.contact_kind === "org_inbox") { r.org_ig = h; cOrgIg++; continue; }
    const res0 = residual(h, r.school);
    const hh = h.replace(/[^a-z]/g, "");
    const fn = r.first_name.toLowerCase().replace(/[^a-z]/g, "");
    const ln = r.last_name.toLowerCase().replace(/[^a-z]/g, "");
    const looksPersonal = (fn.length >= 3 && hh.includes(fn.slice(0, Math.min(4, fn.length))))
      || (ln.length >= 3 && hh.includes(ln.slice(0, Math.min(4, ln.length))));
    const isCouncilHandle = COUNCIL_TOKENS.test(h) || NON_CHAPTER_TOKENS.test(h) || !res0 || res0.length <= 2;
    const ownScore = ["chapter", "club"].includes(r.org_type) ? scoreHandle(res0, r.org_name) : 0;
    const other = res0 ? resolveChapter(res0, globalChapters, r.org_name) : { chapter: "", score: 0, tie: true };

    if (looksPersonal && !isCouncilHandle && ownScore < 5) { r.personal_ig = h; cPersonal++; continue; }
    if (ownScore >= 3) { r.org_ig = h; cOrgIg++; continue; }
    if (other.score >= 6 && !other.tie && other.chapter !== r.org_name) {
      const k = `${r.school}|${other.chapter}`;
      strayOrgIg.set(k, [...(strayOrgIg.get(k) ?? []), h]);
      r.notes.push(`handle '${h}' is the ${other.chapter} chapter account, not a personal handle`);
      cOtherOrg++; continue;
    }
    if (isCouncilHandle) { r.org_ig = h; cOrgIg++; continue; }
    if (looksPersonal) { r.personal_ig = h; cPersonal++; continue; }
    r.personal_ig = h;
    r.review.push(`handle '${h}' could not be classified as personal vs org - verify`);
    cUnclassified++;
  }
  stats.personal_ig_identified = cPersonal;
  stats.org_ig_identified_on_person_rows = cOrgIg;
  stats.chapter_ig_found_on_unrelated_person_row = cOtherOrg;
  stats.ig_unclassified_flagged = cUnclassified;

  // -- 7. pool org handles, then fill onto every row of that org ----------------------------------
  const orgIg = new Map<string, string[]>();
  // Sorted, so which handle becomes org_ig and which fall to alt_ig never depends on row order.
  const addOrgIg = (k: string, h: string) => {
    if (!h) return;
    const list = orgIg.get(k) ?? [];
    if (!list.includes(h)) { list.push(h); list.sort(); }
    orgIg.set(k, list);
  };
  for (const r of recs) if (r.org_ig) addOrgIg(`${r.school}|${r.org_name}`, r.org_ig);
  for (const [k, handles] of councilIg) {
    const [s, c] = k.split("|");
    for (const h of [...new Set(handles)].sort()) addOrgIg(`${s}|${councilOrgName(c)}`, h);
  }
  for (const [k, handles] of strayOrgIg) for (const h of [...new Set(handles)].sort()) addOrgIg(k, h);

  let cFilled = 0;
  for (const r of recs) {
    let k = `${r.school}|${r.org_name}`;
    if (!orgIg.has(k) && ["council", "office"].includes(r.org_type)) {
      const alt = r.org_type === "council" ? `${r.school}|${FSL_OFFICE_NAME}` : "";
      if (alt && orgIg.has(alt)) k = alt;
    }
    const list = orgIg.get(k);
    if (list) {
      if (!r.org_ig) cFilled++;
      r.org_ig = list[0];
      if (list.length > 1) r.alt_ig = list.slice(1).join(";");
    }
  }
  stats.org_ig_propagated_to_rows = cFilled;

  // -- 8. merge duplicates ------------------------------------------------------------------------
  const byKey = new Map<string, Rec[]>();
  for (const r of recs) {
    const pk = r.full_name
      ? `${r.school}|${r.full_name.toLowerCase()}|${r.email}`
      : `${r.school}|${r.org_name.toLowerCase()}|${r.email}|${r.council}`;
    byKey.set(pk, [...(byKey.get(pk) ?? []), r]);
  }
  const mergeInto = (keep: Rec, grp: Rec[]) => {
    for (const x of grp.slice(1)) {
      for (const n of x.notes) if (!keep.notes.includes(n)) keep.notes.push(n);
      for (const n of x.review) if (!keep.review.includes(n)) keep.review.push(n);
      if (!keep.exec_title && x.exec_title) keep.exec_title = x.exec_title;
      if (!keep.personal_ig && x.personal_ig) keep.personal_ig = x.personal_ig;
      if (!keep.email && x.email) keep.email = x.email;
    }
  };
  const final: Rec[] = [];
  let cOrgCollapsed = 0, cPersonCollapsed = 0, cCartesian = 0;
  for (const grp of byKey.values()) {
    if (grp.length === 1) { final.push(grp[0]); continue; }
    const keep = grp[0];
    const isPerson = !!keep.full_name;
    const orgs = [...new Set(grp.map((g) => g.org_name))].sort();
    const councils = [...new Set(grp.map((g) => g.council))].sort();
    if (!isPerson) {
      mergeInto(keep, grp);
      keep.notes.push(`merged ${grp.length} duplicate org rows`);
      cOrgCollapsed++; final.push(keep); continue;
    }
    if (orgs.length === 1) {
      mergeInto(keep, grp);
      keep.notes.push(`merged ${grp.length} duplicate rows`);
      cPersonCollapsed++; final.push(keep); continue;
    }
    const chapterRows = grp.filter((g) => g.org_type === "chapter");
    if (chapterRows.length > 1 && keep.contact_kind === "student_officer") {
      // The scraper's cartesian product: one student listed under every chapter. Their own handle
      // is the only evidence of which one is really theirs.
      let resolved = "", viaHandle = "";
      for (const x of grp) {
        if (!x.ig_raw) continue;
        const m = resolveChapter(residual(x.ig_raw, x.school), globalChapters, "");
        if (m.score >= 6 && !m.tie) { resolved = m.chapter; viaHandle = x.ig_raw; break; }
      }
      mergeInto(keep, grp);
      if (resolved) {
        keep.org_name = resolved;
        keep.council = inferCouncil(resolved);
        keep.org_type = CLUB_ORGS[resolved] ? "club" : "chapter";
        keep.org_ig = viaHandle; keep.personal_ig = ""; keep.alt_ig = "";
        addOrgIg(`${keep.school}|${resolved}`, viaHandle);
        keep.notes.push(`was listed under ${orgs.length} chapters; resolved to ${resolved} via handle '${viaHandle}'`);
      } else {
        keep.org_name = ""; keep.council = "Other"; keep.org_ig = ""; keep.alt_ig = "";
        keep.review.push(`listed under several chapters (${orgs.join("; ")}) - pick the right one`);
      }
      cCartesian++; final.push(keep); continue;
    }
    mergeInto(keep, grp);
    if (chapterRows.length >= 1 && keep.contact_kind === "staff") {
      keep.org_name = chapterRows[0].org_name; keep.org_type = "chapter";
      keep.council = inferCouncil(keep.org_name); keep.councils_covered = councils.join(";");
      keep.org_ig = chapterRows[0].org_ig; keep.alt_ig = chapterRows[0].alt_ig;
    } else if (keep.contact_kind === "staff" || grp.some((g) => g.org_type === "office")) {
      keep.org_type = "office"; keep.councils_covered = councils.join(";");
      keep.council = councils.length >= 2 ? "FSL Office" : councils[0];
      if (/Council$|^(Interfraternity|Panhellenic|National Pan-Hellenic|Multicultural)/.test(keep.org_name)) keep.org_name = FSL_OFFICE_NAME;
      keep.org_ig = ""; keep.alt_ig = "";
      let kk = `${keep.school}|${keep.org_name}`;
      if (!orgIg.has(kk)) kk = `${keep.school}|${FSL_OFFICE_NAME}`;
      const list = orgIg.get(kk);
      if (list) { keep.org_ig = list[0]; if (list.length > 1) keep.alt_ig = list.slice(1).join(";"); }
    } else {
      keep.councils_covered = councils.join(";");
      keep.notes.push(`also listed under: ${orgs.filter((o) => o !== keep.org_name).join("; ")}`);
    }
    keep.notes.push(`merged ${grp.length} rows across councils`);
    cPersonCollapsed++; final.push(keep);
  }
  stats.duplicate_org_rows_collapsed = cOrgCollapsed;
  stats.duplicate_person_rows_collapsed = cPersonCollapsed;
  stats.cartesian_product_people_resolved = cCartesian;

  // -- 9. drop rows with nothing left, flag shared org handles, emit ------------------------------
  const kept: Rec[] = [];
  let cEmpty = 0;
  for (const r of final) {
    if (!r.full_name && !r.org_ig && !r.email && !r.personal_ig) {
      cEmpty++;
      dropped.push({
        school: r.school, council: r.council, role: r.exec_title, name: "", instagram: r.ig_raw,
        chapter: r.org_name, email: "",
        drop_reason: `no usable contact channel left after cleaning (${[...r.review, ...r.notes].join("; ")})`,
      });
      continue;
    }
    kept.push(r);
  }
  stats.dropped_rows_with_no_contact_channel = cEmpty;

  // The same handle claimed by two different chapters at one school: flag every claimant.
  const byHandle = new Map<string, Rec[]>();
  for (const r of kept) {
    if (!["chapter", "club"].includes(r.org_type) || !r.org_ig) continue;
    const k = `${r.school}|${r.org_ig}`;
    byHandle.set(k, [...(byHandle.get(k) ?? []), r]);
  }
  for (const grp of byHandle.values()) {
    const names = [...new Set(grp.map((g) => g.org_name))];
    if (names.length <= 1) continue;
    for (const r of grp) r.review.push(`org handle '${r.org_ig}' is also assigned to: ${names.filter((n) => n !== r.org_name).sort().join("; ")}`);
  }

  const out: ContactRecord[] = [];
  const seenOut = new Set<string>();
  const sorted = [...kept].sort((a, b) =>
    a.school.localeCompare(b.school) || a.council.localeCompare(b.council)
    || a.org_name.localeCompare(b.org_name) || a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  for (const r of sorted) {
    const rec: ContactRecord = {
      ...emptyContact(),
      school: r.school, council: r.council,
      org_type: r.org_type as ContactRecord["org_type"], org_name: r.org_name,
      contact_kind: r.contact_kind as ContactRecord["contact_kind"], exec_title: r.exec_title, first_name: r.first_name,
      last_name: r.last_name, full_name: r.full_name, org_ig: r.org_ig, personal_ig: r.personal_ig,
      alt_ig: r.alt_ig, email: r.email, councils_covered: r.councils_covered,
      needs_review: r.review.length ? "yes" : "", review_reason: r.review.join(" | "),
      notes: r.notes.join(" | "), source,
    };
    rec.contact_id = contactId(rec);
    const idKey = [rec.school, rec.council, rec.org_name, rec.full_name, rec.personal_ig, rec.org_ig, rec.email].join("|").toLowerCase();
    if (seenOut.has(idKey)) continue;
    seenOut.add(idKey);
    out.push(rec);
  }

  stats.output_rows = out.length;
  stats.output_rows_needing_review = out.filter((r) => r.needs_review).length;
  stats.output_rows_with_personal_ig = out.filter((r) => r.personal_ig).length;
  stats.output_rows_with_org_ig = out.filter((r) => r.org_ig).length;
  stats.output_rows_with_email = out.filter((r) => r.email).length;
  stats.distinct_schools = new Set(out.map((r) => r.school)).size;
  stats.distinct_orgs = new Set(out.map((r) => `${r.school}|${r.org_name}`)).size;

  return { rows: out, dropped, stats };
}
