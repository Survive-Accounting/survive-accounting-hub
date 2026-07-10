// Reddit listener — data layer for the manual-triage "link dashboard" (v1).
// Read-only listening: NO posting, NO DMs, NO auto-engagement. Anon Supabase
// client (AdminGate'd UI), matching the profintel/outreach pattern. The Reddit
// API fetch path lives in reddit.functions.ts behind a disabled flag (API
// approval pending) — this file powers the manual link-grid + quick-add flow.
import { supabase } from "@/integrations/supabase/client";

export interface RedditCampus {
  id: string;
  name: string;
  subreddit: string | null;
  subreddit_verified: boolean;
  course_family_codes_json: unknown;
}

export interface RedditMention {
  id: string;
  campus_id: string | null;
  subreddit: string | null;
  post_id: string;
  url: string | null;
  title: string | null;
  snippet: string | null;
  author: string | null; // reddit username
  posted_at: string | null;
  matched_terms: string[] | null;
  found_at: string;
  status: string; // open | sent | engaged | ignored
  notes: string | null;
  starred: boolean;
  is_accounting_major: boolean | null;
  taking_course: string | null; // family key: intro_1 | intro_2 | intermediate_1 | intermediate_2
  taking_term: string | null; // e.g. "Fall 2025"
  sent_via: string[] | null; // dm | comment
}

export const REDDIT_STATUSES = ["open", "sent", "engaged", "ignored"] as const;
export type RedditStatus = (typeof REDDIT_STATUSES)[number];

/** One-click status cycle: open → sent → engaged → ignored → open. */
export function nextRedditStatus(s: string): RedditStatus {
  const i = REDDIT_STATUSES.indexOf(s as RedditStatus);
  return REDDIT_STATUSES[(i + 1) % REDDIT_STATUSES.length];
}

export const SENT_CHANNELS = ["dm", "comment"] as const;

/** Course families a student might mention taking. */
export const COURSE_FAMILIES = [
  { key: "intro_1", label: "Intro 1" },
  { key: "intro_2", label: "Intro 2" },
  { key: "intermediate_1", label: "IA1" },
  { key: "intermediate_2", label: "IA2" },
] as const;

export function courseFamilyLabel(key: string | null): string {
  return COURSE_FAMILIES.find((f) => f.key === key)?.label ?? key ?? "";
}

/** Loose forward projection: if a student is taking `family` in `term`, guess the
 *  rest of the sequence one long semester at a time (Fall→Spring→Fall, skipping
 *  summer). Returns the timeline from the current course onward. Empty if the term
 *  can't be parsed. Purely a heuristic for later follow-up timing. */
export function projectSchedule(
  family: string | null,
  term: string | null,
): { label: string; term: string }[] {
  if (!family || !term) return [];
  const m = term.match(/(fall|spring)\s*'?(\d{2,4})/i);
  if (!m) return [];
  let season = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  let year = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
  const startIdx = COURSE_FAMILIES.findIndex((f) => f.key === family);
  if (startIdx < 0) return [];
  const out: { label: string; term: string }[] = [];
  for (let i = startIdx; i < COURSE_FAMILIES.length; i++) {
    out.push({ label: COURSE_FAMILIES[i].label, term: `${season} ${year}` });
    // advance one long semester
    if (season === "Fall") {
      season = "Spring";
      year += 1;
    } else {
      season = "Fall";
    }
  }
  return out;
}

/** course_family_codes_json can be an object or a double-encoded JSON string. */
function parseCodes(v: unknown): Record<string, string> {
  let val = v;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      return {};
    }
  }
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const out: Record<string, string> = {};
    for (const [k, code] of Object.entries(val as Record<string, unknown>)) {
      if (typeof code === "string" && code.trim()) out[k] = code.trim();
    }
    return out;
  }
  return {};
}

/** Alpha prefix of a course code, e.g. "ACCY 201" → "ACCY". */
function codePrefix(code: string): string {
  const m = code.trim().match(/^([A-Za-z&]+)/);
  return m ? m[1].toUpperCase() : "";
}

/** Search terms for a campus: quoted course codes, bare prefix(es), "accounting".
 *  NO professor-name queries (v1). De-duplicated, stable order. */
export function redditSearchTerms(codesJson: unknown): string[] {
  const codes = Object.values(parseCodes(codesJson));
  const quoted = codes.map((c) => `"${c}"`);
  const prefixes = [...new Set(codes.map(codePrefix).filter(Boolean))];
  return [...new Set([...quoted, ...prefixes, "accounting"])];
}

/** Build a restrict-to-subreddit, newest-first, last-month Reddit search URL. */
export function redditSearchUrl(subreddit: string, term: string): string {
  const q = encodeURIComponent(term);
  return `https://www.reddit.com/r/${encodeURIComponent(
    subreddit,
  )}/search/?q=${q}&restrict_sr=1&sort=new&t=month`;
}

/** Pull the Reddit t3 post id from a post URL (…/comments/{id}/… or redd.it/{id}).
 *  Falls back to the trimmed URL so quick-add still dedupes on something stable. */
export function extractRedditPostId(url: string): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  const m = u.match(/\/comments\/([a-z0-9]+)/i) ?? u.match(/redd\.it\/([a-z0-9]+)/i);
  return m ? m[1].toLowerCase() : u.slice(0, 300);
}

const CAMPUS_COLS = "id, name, subreddit, subreddit_verified, course_family_codes_json";

/** SEC roster campuses (the listener scope), alphabetical. */
export async function fetchRedditCampuses(): Promise<RedditCampus[]> {
  const { data, error } = await (supabase.from("campuses" as never) as any)
    .select(CAMPUS_COLS)
    .eq("active_roster", "sec")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RedditCampus[];
}

export async function updateCampusSubreddit(
  id: string,
  subreddit: string,
  verified: boolean,
): Promise<void> {
  const { error } = await (supabase.from("campuses" as never) as any)
    .update({ subreddit: subreddit.trim() || null, subreddit_verified: verified })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listRedditMentions(opts?: {
  campusId?: string;
  status?: string;
}): Promise<RedditMention[]> {
  let q = (supabase.from("reddit_mentions" as never) as any)
    .select("*")
    .order("posted_at", { ascending: false, nullsFirst: false })
    .order("found_at", { ascending: false });
  if (opts?.campusId) q = q.eq("campus_id", opts.campusId);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as RedditMention[];
}

/** Manual quick-add: paste a post URL + title, pick campus. Upserts by post_id so
 *  re-adding the same post never duplicates (merges any new matched terms). */
export async function addRedditMention(input: {
  campus_id: string;
  subreddit: string | null;
  url: string;
  title: string;
  author?: string | null;
  snippet?: string | null;
  notes?: string | null;
  matched_terms?: string[];
  is_accounting_major?: boolean | null;
  taking_course?: string | null;
  taking_term?: string | null;
  posted_at?: string | null;
}): Promise<void> {
  const post_id = extractRedditPostId(input.url);
  if (!post_id) throw new Error("Could not read a post id from that URL.");

  const fields = {
    campus_id: input.campus_id,
    subreddit: input.subreddit,
    url: input.url.trim(),
    title: input.title.trim(),
    author: input.author?.trim() || null,
    snippet: input.snippet ?? null,
    notes: input.notes ?? null,
    is_accounting_major: input.is_accounting_major ?? null,
    taking_course: input.taking_course || null,
    taking_term: input.taking_term?.trim() || null,
    posted_at: input.posted_at ?? null,
  };

  const { data: existing } = await (supabase.from("reddit_mentions" as never) as any)
    .select("id, matched_terms")
    .eq("post_id", post_id)
    .maybeSingle();

  if (existing) {
    const merged = [
      ...new Set([...(existing.matched_terms ?? []), ...(input.matched_terms ?? [])]),
    ];
    const { error } = await (supabase.from("reddit_mentions" as never) as any)
      .update({ ...fields, matched_terms: merged })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await (supabase.from("reddit_mentions" as never) as any).insert({
    ...fields,
    post_id,
    matched_terms: input.matched_terms ?? [],
    status: "open",
  });
  if (error) throw new Error(error.message);
}

export async function updateRedditMention(
  id: string,
  patch: Partial<
    Pick<
      RedditMention,
      | "status"
      | "notes"
      | "starred"
      | "campus_id"
      | "subreddit"
      | "author"
      | "title"
      | "url"
      | "is_accounting_major"
      | "taking_course"
      | "taking_term"
      | "sent_via"
    >
  >,
): Promise<void> {
  const { error } = await (supabase.from("reddit_mentions" as never) as any)
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRedditMention(id: string): Promise<void> {
  const { error } = await (supabase.from("reddit_mentions" as never) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
