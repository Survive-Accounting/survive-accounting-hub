// Course Intel — pure, bundleable helpers (TS port of scripts/course-intel/lib.mjs,
// which stays the tested reference). No I/O. Used by the syllabus pipeline + cockpit.

const FORMAT_NOISE: RegExp[] = [
  /\blooseleaf\b/gi, /\bloose-leaf\b/gi, /\bloose leaf\b/gi,
  /\bhardcover\b/gi, /\bpaperback\b/gi, /\bbound(?:\s*book)?\b/gi,
  /\bebook\b/gi, /\be-book\b/gi, /\baccess (?:card|code)\b/gi,
  /\bw\/?\s*connect\b/gi, /\bwith connect\b/gi, /\bconnect access(?: online)?\b/gi,
  /\bconnect\b/gi, /\bvitalsource\b/gi, /\binclusive access\b/gi,
];

export function parseEditionNumber(s?: string | null): number | null {
  if (!s) return null;
  const t = String(s);
  let m =
    t.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*[-\s]?\s*(?:edition|ed\.?)\b/i) ||
    t.match(/\b(\d{1,2})\s*\/?\s*e\b/i) ||
    t.match(/\bed(?:ition)?\.?\s*(\d{1,2})\b/i);
  if (m) return parseInt(m[1], 10);
  const words: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15 };
  m = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth)\s+edition\b/i);
  if (m) return words[m[1].toLowerCase()];
  return null;
}

export function canonicalTitle(raw?: string | null): string {
  if (!raw) return "";
  let t = String(raw).replace(/\([^)]*\)/g, " ");
  for (const re of FORMAT_NOISE) t = t.replace(re, " ");
  t = t.replace(/\b\d{1,2}\s*(?:st|nd|rd|th)?\s*(?:edition|ed\.?)\b/gi, " ");
  t = t.replace(/\b\d{1,2}\s*\/?\s*e\b/gi, " ");
  t = t.replace(/\b\d{4}\s*release\b/gi, " ");
  return t.replace(/[,:;]+/g, " ").replace(/\s+/g, " ").trim();
}

export function primaryAuthorKey(authors?: string | null): string {
  if (!authors) return "";
  const first = String(authors).split(/[,;/&]| and /i)[0].trim();
  const parts = first.split(/\s+/);
  return (parts[parts.length - 1] || "").toLowerCase();
}

export function normalizeTextbook({ title, authors, isbn, publisher }: { title?: string | null; authors?: string | null; isbn?: string | null; publisher?: string | null } = {}) {
  const ct = canonicalTitle(title);
  const edition = parseEditionNumber(title) ?? parseEditionNumber(publisher) ?? null;
  const authorKey = primaryAuthorKey(authors);
  const titleKey = ct.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    canonicalTitle: ct, authorKey, edition,
    isbn13: (isbn || "").replace(/[^0-9Xx]/g, "") || null,
    publisher: publisher || null,
    editionKey: `${titleKey}|${authorKey}|${edition ?? "?"}`,
    editionConfirmed: edition != null,
  };
}

function expandChapterList(spec: string): number[] {
  const out = new Set<number>();
  const cleaned = spec.replace(/\band\b/gi, ",").replace(/through|thru|to/gi, "-").replace(/[–—]/g, "-");
  for (const part of cleaned.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const range = p.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
    if (range) { const a = +range[1], b = +range[2]; if (a <= b && b - a < 30) for (let i = a; i <= b; i++) out.add(i); }
    else { const n = p.match(/\d{1,2}/); if (n) out.add(+n[0]); }
  }
  return [...out].sort((a, b) => a - b);
}

export function parseExamChapterRanges(text?: string | null): Array<{ label: string; chapters: number[] }> {
  if (!text) return [];
  const results: Array<{ label: string; chapters: number[] }> = [];
  const seen = new Set<string>();
  const re = /\b(exam|test|midterm|final)\s*(\d+)?\b[^.\n]{0,60}?\bch(?:apters?|s?\.?)?\s*([\d\s,\-–—andthrougto]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const label = (m[1] + (m[2] ? " " + m[2] : "")).replace(/\s+/g, " ").trim().toLowerCase();
    const chapters = expandChapterList(m[3]);
    if (!chapters.length || seen.has(label)) continue;
    seen.add(label);
    results.push({ label, chapters });
  }
  return results;
}

export function scoreConfidence(signals: {
  explicitExamRange?: boolean; exactEditionIdentified?: boolean; exactTocFound?: boolean;
  multipleRecentAgree?: boolean; weeklyScheduleSupports?: boolean; professorSpecific?: boolean;
  ageYears?: number | null; editionUncertain?: boolean; onlyGenericCatalog?: boolean;
} = {}): { level: "High" | "Medium" | "Low"; points: number } {
  let pts = 0;
  if (signals.explicitExamRange) pts += 3;
  if (signals.exactEditionIdentified) pts += 2;
  if (signals.exactTocFound) pts += 2;
  if (signals.multipleRecentAgree) pts += 2;
  if (signals.weeklyScheduleSupports) pts += 1;
  if (signals.professorSpecific) pts += 1;
  if (signals.ageYears != null) { if (signals.ageYears <= 1) pts += 1; else if (signals.ageYears >= 5) pts -= 1; }
  if (signals.editionUncertain) pts -= 2;
  if (signals.onlyGenericCatalog) pts -= 3;
  return { level: pts >= 6 ? "High" : pts >= 3 ? "Medium" : "Low", points: pts };
}
