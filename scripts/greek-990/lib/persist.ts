// Persistence for the Greek 990 legal-entity graph. All upserts on natural keys
// so the whole pipeline is idempotent / resumable.
import { dataQuery, dataWrite, nowIso } from "../_db";
import type { Candidate } from "./match";
import type { PpFiling } from "./propublica";
import { normalizePersonName, normalizeTitle, type XmlOfficer } from "./xml990";

/** Upsert a legal entity by EIN, returning its id. */
export async function upsertLegalEntity(c: Candidate, source: string, nationalOrgId?: string | null): Promise<string> {
  const row = {
    ein: c.ein,
    legal_name: c.legalName,
    sort_name: c.bmf.sort_name || null,
    city: c.city || null,
    state: c.state || null,
    zip: c.zip || null,
    entity_type: c.entityType,
    entity_type_confidence: c.entityTypeConfidence,
    entity_type_evidence: c.entityTypeEvidence,
    irs_subsection: c.subsection || null,
    ntee_code: c.ntee || null,
    classification: c.bmf.classification || null,
    affiliation_code: c.affiliation || null,
    group_exemption_number: c.gen && c.gen !== "0000" ? c.gen : null,
    ruling_date: c.ruling || null,
    deductibility_code: c.bmf.deductibility || null,
    asset_amt: c.assetAmt || null,
    income_amt: c.incomeAmt || null,
    revenue_amt: c.revenueAmt || null,
    national_greek_org_id: nationalOrgId ?? null,
    source,
    source_reference: `IRS EO BMF ${c.state}`,
    bmf_raw: c.bmf,
    last_checked_at: nowIso(),
    updated_at: nowIso(),
  };
  const ret = await dataWrite<any>("greek_legal_entity", [row], { onConflict: "ein", returning: true });
  if (ret[0]?.id) return ret[0].id;
  const found = await dataQuery<any>(`greek_legal_entity?ein=eq.${c.ein}&select=id`);
  return found[0].id;
}

export async function upsertLink(
  chapterId: string,
  legalEntityId: string,
  c: Candidate,
  method: string,
): Promise<void> {
  const verified = c.confidence === "HIGH_CONFIDENCE" ? "UNVERIFIED" : "NEEDS_REVIEW";
  await dataWrite("greek_chapter_legal_entity", [{
    chapter_id: chapterId,
    legal_entity_id: legalEntityId,
    relationship_type: c.entityType,
    match_confidence: c.confidence,
    match_score: c.score,
    match_method: method,
    match_evidence: {
      name: c.nameEvidence,
      location: c.locationEvidence,
      group_exemption: c.genEvidence,
      designation: c.designationEvidence,
    },
    verified_status: verified,
    source_reference: `IRS EO BMF ${c.state}`,
    first_seen_at: nowIso(),
  }], { onConflict: "chapter_id,legal_entity_id" });
}

export async function upsertCandidate(chapterId: string, c: Candidate, action: string, status = "NEW"): Promise<void> {
  await dataWrite("greek_990_entity_candidate", [{
    chapter_id: chapterId,
    candidate_ein: c.ein,
    candidate_legal_name: c.legalName,
    candidate_city: c.city || null,
    candidate_state: c.state || null,
    candidate_entity_type: c.entityType,
    match_score: c.score,
    match_confidence: c.confidence,
    name_evidence: c.nameEvidence,
    location_evidence: c.locationEvidence,
    group_exemption_evidence: c.genEvidence,
    designation_evidence: c.designationEvidence,
    recommended_action: action,
    status,
    source: "IRS_EO_BMF",
    updated_at: nowIso(),
  }], { onConflict: "chapter_id,candidate_ein" });
}

export async function upsertFilings(legalEntityId: string, ein: string, filings: PpFiling[]): Promise<number> {
  if (!filings.length) return 0;
  const rows = filings.map((f) => ({
    legal_entity_id: legalEntityId,
    ein,
    tax_year: f.tax_year,
    form_type: f.form_type,
    rich_filing_available: f.rich_filing_available,
    pdf_url: f.pdf_url,
    gross_receipts: f.gross_receipts,
    total_revenue: f.total_revenue,
    total_expenses: f.total_expenses,
    total_assets: f.total_assets,
    total_liabilities: f.total_liabilities,
    net_assets: f.net_assets,
    contributions: f.contributions,
    program_service_revenue: f.program_service_revenue,
    investment_income: f.investment_income,
    source: "PROPUBLICA_API",
    retrieved_at: nowIso(),
  }));
  await dataWrite("greek_990_filing", rows, { onConflict: "legal_entity_id,tax_year,form_type" });
  return rows.length;
}

/** Insert a 990N marker filing (e-postcard: no rich data). */
export async function upsert990N(legalEntityId: string, ein: string, taxYears: number[]): Promise<number> {
  if (!taxYears.length) return 0;
  const rows = taxYears.map((y) => ({
    legal_entity_id: legalEntityId, ein, tax_year: y, form_type: "990N",
    rich_filing_available: false, source: "PROPUBLICA_API", retrieved_at: nowIso(),
  }));
  await dataWrite("greek_990_filing", rows, { onConflict: "legal_entity_id,tax_year,form_type" });
  return rows.length;
}

const STAKEHOLDER_BY_ENTITY: Record<string, string> = {
  HOUSE_CORPORATION: "HOUSE_CORPORATION_LEADERSHIP",
  ALUMNI_CORPORATION: "ALUMNI_BOARD",
  EDUCATIONAL_FOUNDATION: "FOUNDATION_LEADERSHIP",
  SCHOLARSHIP_FOUNDATION: "FOUNDATION_LEADERSHIP",
  PROPERTY_HOLDING_ENTITY: "HOUSE_CORPORATION_LEADERSHIP",
  NATIONAL_PARENT: "NATIONAL_ORG_LEADERSHIP",
  LOCAL_CHAPTER_ENTITY: "UNDERGRAD_CHAPTER_LEADERSHIP",
};

/**
 * Upsert officers for one entity/year, merging the tax year into the historical
 * years[] array of any existing (person, title) record (brief §15 — never overwrite).
 */
export async function upsertOfficers(
  legalEntityId: string,
  ein: string,
  entityType: string,
  taxYear: number,
  officers: XmlOfficer[],
  source: string,
): Promise<number> {
  if (!officers.length) return 0;
  const stakeholder = STAKEHOLDER_BY_ENTITY[entityType] || "UNKNOWN";
  // Fetch existing officers for this entity to merge years.
  const existing = await dataQuery<any>(
    `greek_990_officer?legal_entity_id=eq.${legalEntityId}&select=person_name_normalized,normalized_title,years,first_seen_year,last_seen_year,latest_filing_year`);
  const key = (n: string, t: string) => `${n}|${t}`;
  const exMap = new Map<string, any>();
  for (const e of existing) exMap.set(key(e.person_name_normalized, e.normalized_title || ""), e);

  const rows = officers.map((o) => {
    const nname = normalizePersonName(o.name);
    const ntitle = normalizeTitle(o.title);
    const prev = exMap.get(key(nname, ntitle));
    const years = new Set<number>([...(prev?.years || []), taxYear]);
    const yearsArr = [...years].sort((a, b) => a - b);
    // infer role flags from title when the form omitted the Ind fields (990-EZ)
    const isOfficer = o.isOfficer || /President|Vice President|Treasurer|Secretary|Executive Director/.test(ntitle);
    const isDirector = o.isDirector || /Director|Trustee|Chair/.test(ntitle);
    return {
      legal_entity_id: legalEntityId,
      ein,
      person_name: o.name,
      person_name_normalized: nname,
      title_as_reported: o.title || null,
      normalized_title: ntitle,
      is_officer: isOfficer,
      is_director: isDirector,
      is_key_employee: o.isKeyEmployee,
      is_principal_officer: /President|Executive Director/.test(ntitle),
      stakeholder_class: stakeholder,
      hours_per_week: o.hoursPerWeek,
      compensation: o.compensation,
      years: yearsArr,
      first_seen_year: Math.min(prev?.first_seen_year ?? taxYear, taxYear),
      last_seen_year: Math.max(prev?.last_seen_year ?? taxYear, taxYear),
      latest_filing_year: Math.max(prev?.latest_filing_year ?? taxYear, taxYear),
      source,
      updated_at: nowIso(),
    };
  });
  await dataWrite("greek_990_officer", rows, { onConflict: "legal_entity_id,person_name_normalized,normalized_title" });
  return rows.length;
}

export async function upsertStatus(row: {
  chapter_id: string; campus_id: string; status: string;
  candidates_found?: number; entities_linked?: number; filings_found?: number; officers_found?: number;
  error?: string | null; run_meta?: any; success?: boolean;
}): Promise<void> {
  await dataWrite("greek_chapter_990_status", [{
    chapter_id: row.chapter_id,
    campus_id: row.campus_id,
    status: row.status,
    candidates_found: row.candidates_found ?? 0,
    entities_linked: row.entities_linked ?? 0,
    filings_found: row.filings_found ?? 0,
    officers_found: row.officers_found ?? 0,
    last_run_at: nowIso(),
    last_success_at: row.success ? nowIso() : undefined,
    error: row.error ?? null,
    run_meta: row.run_meta ?? null,
    updated_at: nowIso(),
  }], { onConflict: "chapter_id" });
}
