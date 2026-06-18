// Detects whether an accounting program offers Bachelors / Masters / PhD
// degrees from scraped page markdown. Pure, deterministic, no I/O.

export type ProgramLevel = "bachelors" | "masters" | "phd";

export interface ProgramLevelEvidence {
  bachelors: string[];
  masters: string[];
  phd: string[];
}

export interface ProgramLevelDetection {
  bachelors: boolean;
  masters: boolean;
  phd: boolean;
  evidence: ProgramLevelEvidence;
}

// Patterns look for degree credentials and explicit "in accounting" phrasing.
// We intentionally require "accounting/accountancy" nearby for the generic
// phrases (undergraduate/graduate program) to avoid matching unrelated
// departments on a shared university page.
const BACHELORS_PATTERNS: RegExp[] = [
  /\bB\.?B\.?A\.?\b[^.\n]{0,80}\baccount(?:ing|ancy)\b/i,
  /\bB\.?S\.?B\.?A\.?\b[^.\n]{0,80}\baccount(?:ing|ancy)\b/i,
  /\bB\.?S\.?\b[^.\n]{0,40}\bin\b[^.\n]{0,40}\baccount(?:ing|ancy)\b/i,
  /\bBachelor(?:'s|s)?\b[^.\n]{0,80}\baccount(?:ing|ancy)\b/i,
  /\bundergraduate\b[^.\n]{0,40}\b(?:major|degree|program|concentration)\b[^.\n]{0,40}\baccount(?:ing|ancy)\b/i,
  /\baccount(?:ing|ancy)\b[^.\n]{0,40}\bundergraduate\b[^.\n]{0,40}\b(?:major|degree|program|concentration)\b/i,
];

const MASTERS_PATTERNS: RegExp[] = [
  /\bM\.?Acc\.?(?:y)?\b/i,
  /\bMAcy\b/i,
  /\bM\.?S\.?A\.?\b[^.\n]{0,80}\baccount(?:ing|ancy)\b/i,
  /\bM\.?S\.?\b[^.\n]{0,40}\bin\b[^.\n]{0,40}\baccount(?:ing|ancy)\b/i,
  /\bMaster(?:'s|s)?\b[^.\n]{0,80}\b(?:of\s+)?accountan(?:cy|t)/i,
  /\bMaster(?:'s|s)?\b[^.\n]{0,80}\baccount(?:ing|ancy)\b/i,
  /\bM\.?P\.?A\.?c?c?\b[^.\n]{0,80}\baccount(?:ing|ancy)\b/i,
  /\bgraduate\b[^.\n]{0,40}\b(?:program|degree|concentration)\b[^.\n]{0,40}\baccount(?:ing|ancy)\b/i,
  /\baccount(?:ing|ancy)\b[^.\n]{0,40}\bgraduate\b[^.\n]{0,40}\b(?:program|degree|concentration)\b/i,
];

const PHD_PATTERNS: RegExp[] = [
  /\bPh\.?\s?D\.?\b[^.\n]{0,80}\baccount(?:ing|ancy)\b/i,
  /\baccount(?:ing|ancy)\b[^.\n]{0,80}\bPh\.?\s?D\.?\b/i,
  /\bDoctorate\b[^.\n]{0,80}\baccount(?:ing|ancy)\b/i,
  /\bD\.?B\.?A\.?\b[^.\n]{0,80}\baccount(?:ing|ancy)\b/i,
  /\bdoctoral\b[^.\n]{0,40}\b(?:program|degree|studies)\b[^.\n]{0,80}\baccount(?:ing|ancy)\b/i,
  /\baccount(?:ing|ancy)\b[^.\n]{0,80}\bdoctoral\b[^.\n]{0,40}\b(?:program|degree|studies)\b/i,
];

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + length + 60);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function collectMatches(text: string, patterns: RegExp[], cap = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const snip = snippetAround(text, m.index, m[0].length);
    const key = snip.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(snip);
    if (out.length >= cap) break;
  }
  return out;
}

export function detectProgramLevels(markdown: string): ProgramLevelDetection {
  const text = markdown || "";
  const bachelors = collectMatches(text, BACHELORS_PATTERNS);
  const masters = collectMatches(text, MASTERS_PATTERNS);
  const phd = collectMatches(text, PHD_PATTERNS);
  return {
    bachelors: bachelors.length > 0,
    masters: masters.length > 0,
    phd: phd.length > 0,
    evidence: { bachelors, masters, phd },
  };
}

export function mergeDetections(
  a: ProgramLevelDetection,
  b: ProgramLevelDetection,
): ProgramLevelDetection {
  return {
    bachelors: a.bachelors || b.bachelors,
    masters: a.masters || b.masters,
    phd: a.phd || b.phd,
    evidence: {
      bachelors: [...a.evidence.bachelors, ...b.evidence.bachelors].slice(0, 5),
      masters: [...a.evidence.masters, ...b.evidence.masters].slice(0, 5),
      phd: [...a.evidence.phd, ...b.evidence.phd].slice(0, 5),
    },
  };
}

export const EMPTY_DETECTION: ProgramLevelDetection = {
  bachelors: false,
  masters: false,
  phd: false,
  evidence: { bachelors: [], masters: [], phd: [] },
};
