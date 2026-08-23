/**
 * Course Intel — pure, reusable utility functions
 * =================================================================
 * These are the deterministic building blocks a future Course Intel pipeline
 * will lean on. They are pure (no I/O), so they are cheap to test and safe to
 * reuse from a server function, an edge function, or a batch runner.
 *
 * Scope tonight: textbook-edition normalization, exam→chapter-range parsing,
 * a simple High/Medium/Low confidence model, document classification, and
 * freshness weighting. NO network, NO copyrighted content — metadata only.
 */

// ---------------------------------------------------------------------------
// 1. TEXTBOOK EDITION NORMALIZATION
// Real bookstore strings are messy: "Financial Accounting (Looseleaf) (w/
// Connect)", "Financial Accounting, 12e", "Financial Accounting 12/e",
// "Fundamental Accounting Principles 25th Edition". We resolve them to a
// stable edition identity so many campuses collapse onto one textbook_edition.
// ---------------------------------------------------------------------------

const FORMAT_NOISE = [
  /\blooseleaf\b/gi, /\bloose-leaf\b/gi, /\bloose leaf\b/gi,
  /\bhardcover\b/gi, /\bpaperback\b/gi, /\bbound(?:\s*book)?\b/gi,
  /\bebook\b/gi, /\be-book\b/gi, /\baccess (?:card|code)\b/gi,
  /\bw\/?\s*connect\b/gi, /\bwith connect\b/gi, /\bconnect access(?: online)?\b/gi,
  /\bconnect\b/gi, /\bvitalsource\b/gi, /\binclusive access\b/gi,
  /\bvolume \d+\b/gi, /\bvol\.?\s*\d+\b/gi, /\bcustom edition\b/gi,
];

/** Parse an edition number from any of: "12th Edition", "12e", "12/e", "Ed. 12". */
export function parseEditionNumber(s) {
  if (!s) return null;
  const t = String(s);
  let m =
    t.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*[-\s]?\s*(?:edition|ed\.?)\b/i) ||
    t.match(/\b(\d{1,2})\s*\/?\s*e\b/i) ||           // 12e, 12/e
    t.match(/\bed(?:ition)?\.?\s*(\d{1,2})\b/i);      // Ed. 12
  if (m) return parseInt(m[1], 10);
  // spelled-out ordinals
  const words = { first:1, second:2, third:3, fourth:4, fifth:5, sixth:6, seventh:7,
    eighth:8, ninth:9, tenth:10, eleventh:11, twelfth:12, thirteenth:13, fourteenth:14, fifteenth:15 };
  m = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth)\s+edition\b/i);
  if (m) return words[m[1].toLowerCase()];
  return null;
}

/** Strip parentheticals, format noise, and edition tokens → canonical title. */
export function canonicalTitle(raw) {
  if (!raw) return "";
  let t = String(raw);
  t = t.replace(/\([^)]*\)/g, " ");                 // drop (Looseleaf), (w/ Connect)...
  for (const re of FORMAT_NOISE) t = t.replace(re, " ");
  t = t.replace(/\b\d{1,2}\s*(?:st|nd|rd|th)?\s*(?:edition|ed\.?)\b/gi, " ");
  t = t.replace(/\b\d{1,2}\s*\/?\s*e\b/gi, " ");
  t = t.replace(/\b\d{4}\s*release\b/gi, " ");       // "2025 Release"
  t = t.replace(/[,:;]+/g, " ").replace(/\s+/g, " ").trim();
  return t;
}

/** First author's last name (for identity/dedupe). */
export function primaryAuthorKey(authors) {
  if (!authors) return "";
  const first = String(authors).split(/[,;/&]| and /i)[0].trim();
  const parts = first.split(/\s+/);
  return (parts[parts.length - 1] || "").toLowerCase();
}

/**
 * Build a stable edition identity. `editionKey` is what you'd unique-index on:
 * title|author|edition. When edition is unknown it is left null and the key
 * ends in "|?" so those rows can be flagged for human edition confirmation.
 */
export function normalizeTextbook({ title, authors, isbn, publisher } = {}) {
  const ct = canonicalTitle(title);
  const edition = parseEditionNumber(title) ?? parseEditionNumber(publisher) ?? null;
  const authorKey = primaryAuthorKey(authors);
  const titleKey = ct.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const editionKey = `${titleKey}|${authorKey}|${edition ?? "?"}`;
  return {
    canonicalTitle: ct,
    authorKey,
    edition,
    isbn13: (isbn || "").replace(/[^0-9Xx]/g, "") || null,
    publisher: publisher || null,
    editionKey,
    editionConfirmed: edition != null,
  };
}

// ---------------------------------------------------------------------------
// 2. EXAM → CHAPTER RANGE PARSING
// Turn syllabus/study-guide prose into {exam, chapters:[...]}.
// Handles "Exam 1 covers Chapters 1-3", "Ch. 1–3, 5", "Chapters 1, 2, and 3",
// "Midterm: Ch 4 through 6". Returns [] on no match (never throws).
// ---------------------------------------------------------------------------

function expandChapterList(spec) {
  // spec like "1-3, 5" or "1–3 and 5" or "4 through 6"
  const out = new Set();
  const cleaned = spec.replace(/\band\b/gi, ",").replace(/through|thru|to/gi, "-").replace(/[–—]/g, "-");
  for (const part of cleaned.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const range = p.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
    if (range) {
      const a = +range[1], b = +range[2];
      if (a <= b && b - a < 30) for (let i = a; i <= b; i++) out.add(i);
    } else {
      const n = p.match(/\d{1,2}/);
      if (n) out.add(+n[0]);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function parseExamChapterRanges(text) {
  if (!text) return [];
  const results = [];
  const seen = new Set();
  // "Exam 1 ... Chapters 1-3"  |  "Midterm ... Ch 4-6"  |  "Test 2: Chapters 5, 6"
  const re = /\b(exam|test|midterm|final)\s*(\d+)?\b[^.\n]{0,60}?\bch(?:apters?|s?\.?)?\s*([\d\s,\-–—andthrougto]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const label = (m[1] + (m[2] ? " " + m[2] : "")).replace(/\s+/g, " ").trim().toLowerCase();
    const chapters = expandChapterList(m[3]);
    if (!chapters.length) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ exam: label, chapters });
  }
  return results;
}

// ---------------------------------------------------------------------------
// 3. CONFIDENCE MODEL (simple High / Medium / Low)
// Deliberately NOT fake-precise decimals. Points accumulate from evidence.
// ---------------------------------------------------------------------------

export function scoreConfidence(signals = {}) {
  const {
    explicitExamRange = false,   // syllabus literally states "Exam 1 = Ch 1-3"
    exactEditionIdentified = false,
    exactTocFound = false,
    multipleRecentAgree = false, // >=2 recent docs concur
    weeklyScheduleSupports = false,
    professorSpecific = false,   // evidence tied to THIS professor (not just course)
    ageYears = null,             // 0 = current term
    editionUncertain = false,
    onlyGenericCatalog = false,
  } = signals;

  let pts = 0;
  if (explicitExamRange) pts += 3;
  if (exactEditionIdentified) pts += 2;
  if (exactTocFound) pts += 2;
  if (multipleRecentAgree) pts += 2;
  if (weeklyScheduleSupports) pts += 1;
  if (professorSpecific) pts += 1;

  // freshness
  if (ageYears != null) {
    if (ageYears <= 1) pts += 1;
    else if (ageYears >= 5) pts -= 1;
  }
  // penalties
  if (editionUncertain) pts -= 2;
  if (onlyGenericCatalog) pts -= 3;

  const level = pts >= 6 ? "High" : pts >= 3 ? "Medium" : "Low";
  return { level, points: pts };
}

// ---------------------------------------------------------------------------
// 4. DOCUMENT CLASSIFICATION (title/url/snippet → type + value tier)
// Tier 1 = direct exam evidence, 2 = course structure, 3 = topic emphasis,
// 4 = identity/validation. Used to decide what is worth a deep AI parse.
// ---------------------------------------------------------------------------

const DOC_RULES = [
  { type: "study_guide", tier: 1, re: /study\s*guide|exam\s*review|review\s*sheet|review\s*packet|practice\s*exam|exam\s*\d?\s*topics/i },
  { type: "syllabus", tier: 2, re: /syllabus|course\s*outline|greensheet/i },
  { type: "schedule", tier: 2, re: /schedule|calendar|course\s*plan|weekly|tentative\s*schedule/i },
  { type: "homework", tier: 2, re: /homework|assignment|problem\s*set|hw\b/i },
  { type: "lecture", tier: 3, re: /lecture|slides|notes|powerpoint|chapter\s*\d+\s*(notes|slides)/i },
  { type: "worksheet", tier: 3, re: /worksheet|recitation|learning\s*objectives?|checklist/i },
  { type: "catalog", tier: 4, re: /catalog|bulletin|course\s*description|course\s*catalog/i },
  { type: "faculty_page", tier: 4, re: /faculty|profile|directory|curriculum\s*vitae|\bcv\b/i },
];

export function classifyDocument({ title = "", url = "", snippet = "" } = {}) {
  const hay = `${title} ${url} ${snippet}`;
  for (const r of DOC_RULES) if (r.re.test(hay)) return { type: r.type, tier: r.tier };
  if (/\.pdf(\?|$)/i.test(url)) return { type: "unknown_pdf", tier: 3 };
  return { type: "unknown", tier: 4 };
}

// ---------------------------------------------------------------------------
// 5. FRESHNESS WEIGHTING (for multi-year evidence)
// ---------------------------------------------------------------------------

export function freshnessWeight(docYear, currentYear) {
  if (!docYear || !currentYear) return { weight: 0.5, label: "unknown" };
  const age = currentYear - docYear;
  if (age <= 0) return { weight: 1.0, label: "current" };
  if (age <= 1) return { weight: 0.9, label: "recent" };
  if (age <= 3) return { weight: 0.7, label: "useful" };
  if (age <= 5) return { weight: 0.4, label: "supporting" };
  return { weight: 0.2, label: "weak" };
}

// ---------------------------------------------------------------------------
// 6. RECOMMENDATION HIERARCHY (professor → course → generic)
// Given available evidence, pick which mapping source to present.
// ---------------------------------------------------------------------------

export function chooseMappingSource({ professorMapping, courseMapping, genericMapping } = {}) {
  if (professorMapping && professorMapping.confidence !== "Low") return { source: "professor", mapping: professorMapping };
  if (courseMapping && courseMapping.confidence !== "Low") return { source: "course", mapping: courseMapping };
  if (genericMapping) return { source: "generic", mapping: genericMapping };
  // fall back to whatever exists, even if low
  return professorMapping ? { source: "professor", mapping: professorMapping }
    : courseMapping ? { source: "course", mapping: courseMapping }
    : { source: "none", mapping: null };
}
