// GEN (group-exemption) subordinate enumeration — the authoritative discovery path.
//
// Once a national org's central entity + group-exemption number (GEN) are known, every
// subordinate in that IRS group ruling shares the GEN in its BMF `group` field. So instead
// of guessing by name, we enumerate the whole subordinate roster and tie each to a campus by
// city. A subordinate under GEN g IS that national's entity (IRS-authoritative); matching its
// city to a campus that hosts a chapter of that org gives a HIGH, authority-backed link — and
// catches subordinates whose names don't spell out the full org name.
import type { BmfRow } from "./bmf";
import { classifyEntityType, cityMatches, entityOwnDesignation, tokens } from "./normalize";
import type { Candidate } from "./match";

export interface CampusLite {
  id: string;
  city: string;
  state: string;
  designationByOrg?: Map<string, string>; // greek_org_id -> chapter_designation (if known)
}

/** Build state|normalizedCity -> campus list, for O(1) subordinate→campus lookup. */
export function buildCampusCityIndex(campuses: CampusLite[]): Map<string, CampusLite[]> {
  const idx = new Map<string, CampusLite[]>();
  for (const c of campuses) {
    if (!c.city || !c.state) continue;
    const key = `${c.state.toUpperCase()}|${tokens(c.city).join(" ")}`;
    (idx.get(key) || idx.set(key, []).get(key))!.push(c);
  }
  return idx;
}

export interface GenLink {
  chapterId: string;
  candidate: Candidate;
}

/**
 * For one national org (its GEN + parent EIN), enumerate subordinates across all loaded BMF
 * rows and yield authority-backed links to campuses that host a chapter of that org.
 *
 * chapterByCampusOrg: `${campusId}|${orgId}` -> chapterId (social chapters only).
 */
export function enumerateGen(params: {
  orgId: string;
  orgName: string;
  gen: string;
  parentEin: string;
  allGreekRows: BmfRow[];
  cityIndex: Map<string, CampusLite[]>;
  chapterByCampusOrg: Map<string, string>;
  designationByCampusOrg: Map<string, string>;
}): GenLink[] {
  const { orgId, orgName, gen, parentEin, allGreekRows, cityIndex, chapterByCampusOrg, designationByCampusOrg } = params;
  if (!gen || gen === "0000") return [];
  const out: GenLink[] = [];
  for (const row of allGreekRows) {
    if (row.group !== gen) continue;            // same group ruling
    if (row.ein === parentEin) continue;        // skip the central org itself
    if (row.status && row.status !== "01") continue;
    const key = `${row.state.toUpperCase()}|${tokens(row.city).join(" ")}`;
    const campuses = cityIndex.get(key);
    if (!campuses) continue;
    for (const camp of campuses) {
      // exact-ish city guard (index key already normalizes; double-check against abbreviations)
      if (!cityMatches(row.city, camp.city)) continue;
      const chapterId = chapterByCampusOrg.get(`${camp.id}|${orgId}`);
      if (!chapterId) continue;                 // this campus has no chapter of this org

      // Sibling guard: if the campus chapter's designation is known and the subordinate carries a
      // DIFFERENT explicit designation, it belongs to another chapter — skip (don't auto-link).
      const rosterDesig = designationByCampusOrg.get(`${camp.id}|${orgId}`);
      if (rosterDesig) {
        const own = entityOwnDesignation(tokens(row.name), tokens(orgName));
        if (own.length) {
          const dset = new Set(tokens(rosterDesig));
          if (!own.some((t) => dset.has(t))) continue;
        }
      }

      const cls = classifyEntityType(row.name, { subsection: row.subsection, affiliation: row.affiliation, hasDesignation: !!rosterDesig });
      const candidate: Candidate = {
        ein: row.ein, legalName: row.name, city: row.city, state: row.state, zip: row.zip,
        entityType: cls.type === "UNKNOWN" ? "LOCAL_CHAPTER_ENTITY" : cls.type,
        entityTypeConfidence: cls.confidence, entityTypeEvidence: cls.evidence,
        score: 95, confidence: "HIGH_CONFIDENCE",
        nameEvidence: `IRS group ruling: subordinate under ${orgName} GEN ${gen}`,
        locationEvidence: `campus city match (${row.city})`,
        genEvidence: `GEN ${gen} subordinate of national parent (authoritative)`,
        designationEvidence: "",
        subsection: row.subsection, affiliation: row.affiliation, gen: row.group, ntee: row.ntee,
        ruling: row.ruling, assetAmt: row.asset_amt, incomeAmt: row.income_amt, revenueAmt: row.revenue_amt, bmf: row,
      };
      out.push({ chapterId, candidate });
    }
  }
  return out;
}
