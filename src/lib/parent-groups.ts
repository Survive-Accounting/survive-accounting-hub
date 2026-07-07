// Parent-group tracker — data layer (sibling to reddit.ts). Manual inventory +
// engagement triage of campus parent Facebook groups. NO Facebook automation:
// links + hand-entered data only. Anon Supabase client (AdminGate'd UI).
import { supabase } from "@/integrations/supabase/client";

export interface ParentGroupCampus {
  id: string;
  name: string;
  mascot: string | null;
  mascot_verified: boolean;
}

export interface ParentGroup {
  id: string;
  campus_id: string | null;
  name: string | null;
  url: string | null;
  platform: string;
  member_count: number | null;
  cohort: string | null;
  privacy: string | null;
  screening_notes: string | null;
  admin_notes: string | null;
  membership_status: string; // found | requested | member | declined | ignored
  last_checked: string | null;
  notes: string | null;
  created_at: string;
}

export const COHORTS = [
  "class_of_2030",
  "class_of_2029",
  "class_of_2028",
  "general",
  "other",
] as const;
export type Cohort = (typeof COHORTS)[number];

export const MEMBERSHIP_STATUSES = ["found", "requested", "member", "declined", "ignored"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** One-click cycle: found → requested → member → declined → ignored → found. */
export function nextMembershipStatus(s: string): MembershipStatus {
  const i = MEMBERSHIP_STATUSES.indexOf(s as MembershipStatus);
  return MEMBERSHIP_STATUSES[(i + 1) % MEMBERSHIP_STATUSES.length];
}

export function cohortLabel(c: string | null): string {
  if (!c) return "—";
  const m = c.match(/^class_of_(\d{4})$/);
  if (m) return `Class of ${m[1]}`;
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Facebook group search URL for a hand-run query (opens in a new tab). */
export function facebookGroupSearchUrl(query: string): string {
  return `https://www.facebook.com/search/groups/?q=${encodeURIComponent(query)}`;
}

/** Suggested Facebook group searches for a campus. Links only — no scraping. */
export function parentGroupSearchQueries(
  schoolName: string,
  mascot: string | null,
): { label: string; query: string; url: string }[] {
  const school = schoolName.trim();
  const queries: string[] = [
    `${school} Class of 2030 parents`,
    `${school} Class of 2029 parents`,
    `${school} Class of 2028 parents`,
    `${school} parents`,
    `${school} family`,
  ];
  if (mascot && mascot.trim()) queries.push(`${mascot.trim()} moms`);
  return queries.map((q) => ({ label: q, query: q, url: facebookGroupSearchUrl(q) }));
}

const CAMPUS_COLS = "id, name, mascot, mascot_verified";

export async function fetchParentGroupCampuses(): Promise<ParentGroupCampus[]> {
  const { data, error } = await (supabase.from("campuses" as never) as any)
    .select(CAMPUS_COLS)
    .eq("active_roster", "sec")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ParentGroupCampus[];
}

export async function updateCampusMascot(
  id: string,
  mascot: string,
  verified: boolean,
): Promise<void> {
  const { error } = await (supabase.from("campuses" as never) as any)
    .update({ mascot: mascot.trim() || null, mascot_verified: verified })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listParentGroups(opts?: {
  campusId?: string;
  status?: string;
}): Promise<ParentGroup[]> {
  let q = (supabase.from("parent_groups" as never) as any)
    .select("*")
    .order("created_at", { ascending: false });
  if (opts?.campusId) q = q.eq("campus_id", opts.campusId);
  if (opts?.status) q = q.eq("membership_status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ParentGroup[];
}

export async function addParentGroup(input: {
  campus_id: string;
  name: string;
  url: string;
  cohort: string;
  member_count?: number | null;
  privacy?: string | null;
  notes?: string | null;
}): Promise<void> {
  const { error } = await (supabase.from("parent_groups" as never) as any).insert({
    campus_id: input.campus_id,
    name: input.name.trim(),
    url: input.url.trim() || null,
    cohort: input.cohort,
    member_count: input.member_count ?? null,
    privacy: input.privacy ?? null,
    notes: input.notes ?? null,
    platform: "facebook",
    membership_status: "found",
  });
  if (error) throw new Error(error.message);
}

export async function updateParentGroup(
  id: string,
  patch: Partial<
    Pick<
      ParentGroup,
      | "membership_status"
      | "notes"
      | "cohort"
      | "member_count"
      | "last_checked"
      | "privacy"
      | "screening_notes"
      | "admin_notes"
    >
  >,
): Promise<void> {
  const { error } = await (supabase.from("parent_groups" as never) as any)
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
