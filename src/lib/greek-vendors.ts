// Vendor-list parsing + firm helpers. Pure + unit-tested.
// Feeds the /outreach/greek-orgs/vendor-queue paste box: national-org vendor
// lists (pdftotext -layout output, or copied web-page text) → editable firm rows
// destined for greek_firm_leads (source='national_vendor_list').

export interface ParsedVendorFirm {
  name: string;
  website: string | null;
  phone: string | null;
  city_state: string | null;
  category: string | null; // raw section heading from the list
  industry: string | null; // keyword-guessed enum (INDUSTRIES)
}

/** Single source of truth for firm industries — quick-add dropdown, firm-drawer
 *  editor, and the Firms-tab filter all use this list. Keep the keyword map (and
 *  the 0058 backfill CASE) in sync when adding one. */
export const INDUSTRIES = [
  "insurance_risk",
  "accounting_tax",
  "fundraising_capital_campaigns",
  "house_management",
  "construction_renovation",
  "architecture_design",
  "food_service",
  "billing_dues_software",
  "chapter_software",
  "legal",
  "banking_lending",
  "real_estate",
  "furniture_interiors",
  "security_safety",
  "travel_events",
  "apparel_promo",
  "recruitment_services",
  "education_academics",
  "other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const industryLabel = (i: string | null) =>
  i ? i.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

// Keyword → industry (order matters: first match wins; the generic
// consult/manage terms sit last as a weak fallback so "Culinary Consultants"
// hits food_service, not house_management). Mirrors the 0058 backfill.
const INDUSTRY_KEYWORDS: [RegExp, Industry][] = [
  [/insur|risk/i, "insurance_risk"],
  [/account|tax|cpa|audit/i, "accounting_tax"],
  [/fundrais|capital campaign|financial/i, "fundraising_capital_campaigns"],
  [/propert|house? ?manage/i, "house_management"],
  [/construct|renovat|maintenance/i, "construction_renovation"],
  [/architect/i, "architecture_design"],
  [/food|culinary|dining|cater/i, "food_service"],
  [/billing|dues/i, "billing_dues_software"],
  [/software|technolog/i, "chapter_software"],
  [/legal|law/i, "legal"],
  [/bank|lend|loan|mortgage/i, "banking_lending"],
  [/real ?estate|realty/i, "real_estate"],
  [/furni|interior|decor/i, "furniture_interiors"],
  [/security|safety|protective/i, "security_safety"],
  [/travel|event/i, "travel_events"],
  [/apparel|promo|gift|marketing/i, "apparel_promo"],
  [/recruit|rush/i, "recruitment_services"],
  [/educat|academ|tutor|scholar/i, "education_academics"],
  [/consult|manage/i, "house_management"], // weak fallback
];

/** Best-effort industry guess from arbitrary text (section heading, category…). */
export function guessIndustry(text: string | null | undefined): Industry | null {
  if (!text) return null;
  for (const [re, ind] of INDUSTRY_KEYWORDS) if (re.test(text)) return ind;
  return null;
}

/** "https://www.holmes-murphy.com/about" → "Holmes Murphy". Concatenated domains
 *  ("holmesmurphy.com") can't be word-split without a dictionary — they come back
 *  as one capitalized token; the quick-add name field stays editable for that. */
export function deriveNameFromDomain(urlOrDomain: string): string {
  const host = urlOrDomain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0];
  const sld = host.split(".")[0] ?? "";
  return sld
    .split(/[-_\d]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Normalization for cross-referencing firm names across sources ("WATKINS WARD
 *  AND STAFFORD PLLC" ≡ "Watkins Ward & Stafford"): lowercase, & → and, strip
 *  punctuation and trailing entity suffixes. */
export function normalizeFirmName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  const SUFFIX = new Set(["llc", "pllc", "llp", "inc", "pc", "pa", "co", "company", "corp", "ltd"]);
  while (words.length > 1 && SUFFIX.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

// --- Vendor-list text parsing ---------------------------------------------------
const URL_RE = /(https?:\/\/[^\s]+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s]*)/i;
const PHONE_RE = /\(?\d{3}\)?[\s.-]{1,3}\d{3}[\s.-]{1,3}\d{4}/;
const EMAIL_RE = /\S+@\S+\.\S+/;
const CITY_STATE_RE = /([A-Z][A-Za-z .]{2,}),\s*([A-Z]{2})\b/;

const cleanUrl = (u: string) => {
  let s = u.replace(/[),.;]+$/, "");
  if (/^www\./i.test(s)) s = `https://${s}`;
  return s;
};
const firstCell = (line: string) => line.split(/\s{2,}|\t/)[0].trim();
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Section heading: standalone single-cell line (no column gaps) after a blank
 *  line, short, letters, no TOC dot leaders. Keyword-mappable headings qualify
 *  outright; unmapped ones ("General HC Needs") also need a blank line after.
 *  The blank-line requirements keep wrapped name cells ("Consultants, Inc.") and
 *  description bleed from hijacking the running category. */
function isHeading(
  line: string,
  prevLine: string | undefined,
  nextLine: string | undefined,
): boolean {
  const t = line.trim();
  if (
    !t ||
    /^\s/.test(line) ||
    (prevLine !== undefined && prevLine.trim()) ||
    /\s{2,}|\t/.test(t) ||
    /\.{3,}/.test(t) ||
    wordCount(t) > 6 ||
    !/[a-z]/i.test(t) ||
    URL_RE.test(t) ||
    PHONE_RE.test(t) ||
    EMAIL_RE.test(t)
  )
    return false;
  return guessIndustry(t) != null || nextLine === undefined || !nextLine.trim();
}

/** Parse pasted vendor-list text (pdftotext -layout output or copied page text)
 *  into firm rows. URL-anchored: each website starts a firm; wrapped name cells on
 *  following lines are stitched (first column only). Section headings set the
 *  category + industry guess. Falls back to phone-anchored lines when the paste
 *  has no URLs. Everything lands in an editable preview — recall over precision. */
export function parseVendorFirms(text: string): ParsedVendorFirm[] {
  const lines = (text ?? "").split(/\r?\n/);
  const out: ParsedVendorFirm[] = [];
  let category: string | null = null;
  let industry: Industry | null = null;

  const anyUrl = URL_RE.test(text ?? "");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isHeading(line, lines[i - 1], lines[i + 1])) {
      category = trimmed;
      industry = guessIndustry(trimmed);
      continue;
    }

    const urlMatch = anyUrl ? line.match(URL_RE) : null;
    const phoneOnly = !anyUrl ? line.match(PHONE_RE) : null;
    if (!urlMatch && !phoneOnly) continue;

    // Window for phone/city extraction: this line + the next two.
    const windowText = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""].join("  ");

    let name: string;
    if (urlMatch) {
      name = line.slice(0, urlMatch.index).trim();
      // Stitch wrapped name cells: following column-0 first-cells until the next
      // firm/heading ("CSL" + "Management", "CCL" + "Construction" + "Consultants, Inc.").
      for (let j = i + 1, taken = 0; j < lines.length && taken < 3; j++) {
        const l = lines[j];
        if (
          !l.trim() ||
          /^\s/.test(l) ||
          URL_RE.test(l) ||
          isHeading(l, lines[j - 1], lines[j + 1])
        )
          break;
        const cell = firstCell(l);
        if (!cell || wordCount(cell) > 4 || EMAIL_RE.test(cell) || PHONE_RE.test(cell)) break;
        name = `${name} ${cell}`.trim();
        taken++;
      }
    } else {
      // Phone-anchored fallback (no URLs anywhere in the paste).
      name = line.slice(0, phoneOnly!.index).trim() || (lines[i - 1] ?? "").trim();
    }
    name = name.replace(/[|•·\-–—:]+$/, "").trim();
    const website = urlMatch ? cleanUrl(urlMatch[0]) : null;
    if (!name && website) name = deriveNameFromDomain(website);
    if (!name || EMAIL_RE.test(name)) continue;

    const phone = windowText.match(PHONE_RE)?.[0].replace(/\s+/g, " ").trim() ?? null;
    const city = windowText.match(CITY_STATE_RE);
    out.push({
      name,
      website,
      phone,
      city_state: city ? `${city[1].trim()}, ${city[2]}` : null,
      category,
      // The firm's own name is a stronger signal than the running section
      // ("Krittenbrink Architecture" under a mis-detected section → architecture).
      industry: guessIndustry(name) ?? industry,
    });
  }

  // Dedupe on normalized name, keeping the first (most-anchored) row.
  const seen = new Set<string>();
  return out.filter((f) => {
    const k = normalizeFirmName(f.name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
