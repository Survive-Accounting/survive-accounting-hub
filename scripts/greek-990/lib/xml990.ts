// Form 990 / 990-EZ XML extraction — officers/directors + headline financials.
//
// IRS e-file XML changes tag layout across tax years, but the modern schema (2013+)
// is stable enough that a namespace-stripped, tag-name extraction is robust across
// years without a brittle per-year XPath. We normalize into a stable internal model.

export interface XmlOfficer {
  name: string;
  title: string;
  isOfficer: boolean;
  isDirector: boolean;
  isKeyEmployee: boolean;
  hoursPerWeek: number | null;
  compensation: number | null;
}

export interface XmlFinancials {
  formType: string;        // 990 | 990EZ | 990PF | UNKNOWN
  taxYear: number | null;
  totalRevenue: number | null;
  totalExpenses: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  netAssets: number | null;
  ein: string | null;
  name: string | null;
}

/** Remove XML namespace prefixes so <irs:PersonNm> and <PersonNm> both match. */
export function stripNs(xml: string): string {
  return xml.replace(/<(\/?)[A-Za-z0-9]+:/g, "<$1");
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : null;
}
function num(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function bool(block: string, name: string): boolean {
  const v = tag(block, name);
  return v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "x";
}

function blocks(xml: string, groupTag: string): string[] {
  const re = new RegExp(`<${groupTag}[^>]*>([\\s\\S]*?)</${groupTag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/** Extract officers/directors/trustees/key-employees from a 990 or 990-EZ XML string. */
export function parseOfficers(xmlRaw: string): XmlOfficer[] {
  const xml = stripNs(xmlRaw);
  // Modern 990 Part VII Section A, older 990 variants, and 990-EZ Part IV.
  const groupTags = [
    "Form990PartVIISectionAGrp",
    "Form990EZPartIVGrp",
    "OfficerDirectorTrusteeEmplGrp",
    "Form990PartVIISectionAandBGrp",
  ];
  const out: XmlOfficer[] = [];
  const seen = new Set<string>();
  for (const gt of groupTags) {
    for (const b of blocks(xml, gt)) {
      const name = tag(b, "PersonNm") || tag(b, "NamePerson") || tag(b, "BusinessNameLine1Txt") || tag(b, "PersonNameControlTxt");
      if (!name) continue;
      const title = tag(b, "TitleTxt") || tag(b, "PersonTitleTxt") || "";
      const key = `${name.toUpperCase()}|${title.toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: name.trim(),
        title: title.trim(),
        isOfficer: bool(b, "OfficerInd"),
        isDirector: bool(b, "IndividualTrusteeOrDirectorInd") || bool(b, "InstitutionalTrusteeInd"),
        isKeyEmployee: bool(b, "KeyEmployeeInd"),
        hoursPerWeek: num(tag(b, "AverageHoursPerWeekRt") || tag(b, "AvrgHrsPerWkDevotedToPosRt")),
        compensation: num(tag(b, "ReportableCompFromOrgAmt") || tag(b, "CompensationAmt")),
      });
    }
  }
  return out;
}

/** Extract headline financials + identity from a 990 / 990-EZ XML string. */
export function parseFinancials(xmlRaw: string): XmlFinancials {
  const xml = stripNs(xmlRaw);
  let formType = "UNKNOWN";
  if (/<IRS990EZ[ >]/.test(xml)) formType = "990EZ";
  else if (/<IRS990PF[ >]/.test(xml)) formType = "990PF";
  else if (/<IRS990[ >]/.test(xml)) formType = "990";

  const yr = tag(xml, "TaxYr") || tag(xml, "TaxYear");
  const rev = num(tag(xml, "CYTotalRevenueAmt") || tag(xml, "TotalRevenueAmt") || tag(xml, "TotalRevenueCurrentYear"));
  const exp = num(tag(xml, "CYTotalExpensesAmt") || tag(xml, "TotalExpensesAmt") || tag(xml, "TotalExpensesCurrentYear"));
  const assets = num(tag(xml, "TotalAssetsEOYAmt") || tag(xml, "TotalAssetsEOY"));
  const liab = num(tag(xml, "TotalLiabilitiesEOYAmt") || tag(xml, "TotalLiabilitiesEOY") || tag(xml, "SumOfTotalLiabilitiesEOYAmt"));
  const net = num(tag(xml, "NetAssetsOrFundBalancesEOYAmt") || tag(xml, "NetAssetsOrFundBalancesEOY"));

  return {
    formType,
    taxYear: yr ? Number(yr) : null,
    totalRevenue: rev,
    totalExpenses: exp,
    totalAssets: assets,
    totalLiabilities: liab,
    netAssets: net ?? (assets != null && liab != null ? assets - liab : null),
    ein: tag(xml, "EIN"),
    name: tag(xml, "BusinessNameLine1Txt") || tag(xml, "BusinessNameLine1"),
  };
}

// ── Title normalization (brief §14) — preserve original, add a normalized label. ──
export function normalizeTitle(raw: string): string {
  const t = (raw || "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
  if (/\bHOUSE (CORP|CORPORATION) PRESIDENT\b/.test(t)) return "House Corporation President";
  if (/\bCHAPTER ADVISOR\b/.test(t)) return "Chapter Advisor";
  if (/\bALUMNI ADVISOR\b/.test(t)) return "Alumni Advisor";
  if (/\bHOUSE (DIRECTOR|MOTHER)\b/.test(t)) return "House Director";
  if (/\bPRESIDENT\b/.test(t)) return "President";
  if (/\b(VICE PRESIDENT|VP)\b/.test(t)) return "Vice President";
  if (/\bTREASURER\b/.test(t) || /\bCFO\b/.test(t)) return "Treasurer";
  if (/\bSECRETARY\b/.test(t)) return "Secretary";
  if (/\b(CHAIR|CHAIRMAN|CHAIRPERSON|CHAIRWOMAN)\b/.test(t)) return "Chair";
  if (/\bTRUSTEE\b/.test(t)) return "Trustee";
  if (/\bDIRECTOR\b/.test(t)) return "Director";
  if (/\b(CEO|EXECUTIVE DIRECTOR)\b/.test(t)) return "Executive Director";
  if (/\bADVISOR\b/.test(t)) return "Advisor";
  return raw?.trim() || "Officer";
}

/** Conservative person-name normalization for dedupe within one entity (brief §16). */
export function normalizePersonName(raw: string): string {
  return (raw || "")
    .toUpperCase()
    .replace(/\b(MR|MRS|MS|DR|JR|SR|II|III|IV|ESQ|CPA|PHD|MD)\b/g, " ")
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
