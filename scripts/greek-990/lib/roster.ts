// Load the canonical chapter roster + campus refs + org identities for matching.
import { dataQuery } from "../_db";
import { campusCoreTokens, type CampusRef } from "./match";
import { orgGreekTokens, tokens, type OrgIdentity } from "./normalize";

export interface ChapterRow {
  id: string;
  campus_id: string;
  greek_org_id: string | null;
  chapter_designation: string | null;
  council: string | null;
  letters: string | null;
  ein: string | null;
  org?: OrgIdentity;
  orgName: string;
  orgGreek: string[];
}

const SOCIAL_COUNCILS = new Set(["IFC", "PANHELLENIC", "NPHC", "MGC"]);

export function isSocialCouncil(council: string | null | undefined): boolean {
  if (!council) return false;
  return SOCIAL_COUNCILS.has(council.trim().toUpperCase());
}

export async function loadCampusRef(campusId: string): Promise<CampusRef | null> {
  const rows = await dataQuery<any>(
    `campuses?id=eq.${campusId}&select=id,name,canonical_name,display_name,city,state,aliases`);
  const c = rows[0];
  if (!c) return null;
  const name = c.canonical_name || c.name || c.display_name || "";
  const aliases: string[] = [];
  if (Array.isArray(c.aliases)) aliases.push(...c.aliases.filter((x: any) => typeof x === "string"));
  for (const alt of [c.name, c.display_name, c.canonical_name]) if (alt && alt !== name) aliases.push(alt);
  return {
    id: c.id, name, city: c.city || "", state: c.state || "",
    aliases, nameTokens: tokens(name), coreTokens: campusCoreTokens(name),
  };
}

/** Map of greek_org_id → identity. */
export async function loadOrgIndex(): Promise<Map<string, OrgIdentity>> {
  const orgs = await dataQuery<any>(`greek_orgs?select=id,name,nickname,letters,council,org_type`);
  const m = new Map<string, OrgIdentity>();
  for (const o of orgs) {
    m.set(o.id, {
      name: o.name || "",
      nameTokens: tokens(o.name || ""),
      nickname: o.nickname || undefined,
      council: o.council || undefined,
      orgType: o.org_type || undefined,
    });
  }
  return m;
}

export function allOrgIdentities(idx: Map<string, OrgIdentity>): OrgIdentity[] {
  return [...idx.values()];
}

/** Social, non-archived chapters for a campus, joined to their org identity. */
export async function loadCampusChapters(campusId: string, orgIdx: Map<string, OrgIdentity>): Promise<ChapterRow[]> {
  const rows = await dataQuery<any>(
    `campus_greek_chapters?campus_id=eq.${campusId}&archived_at=is.null&select=id,campus_id,greek_org_id,chapter_designation,council,letters,ein`);
  const out: ChapterRow[] = [];
  for (const r of rows) {
    if (!isSocialCouncil(r.council)) continue;
    const org = r.greek_org_id ? orgIdx.get(r.greek_org_id) : undefined;
    if (org && org.orgType === "professional") continue; // exclude professional
    const orgName = org?.name || "";
    const orgGreek = org ? orgGreekTokens(org) : [];
    if (orgGreek.length < 1) continue; // no matchable name
    out.push({
      id: r.id, campus_id: r.campus_id, greek_org_id: r.greek_org_id,
      chapter_designation: r.chapter_designation, council: r.council, letters: r.letters,
      ein: r.ein, org, orgName, orgGreek,
    });
  }
  return out;
}
