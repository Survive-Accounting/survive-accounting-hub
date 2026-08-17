// The chapter half of /go/<school>/<chapter>, as a pure function.
//
// It lives in src/ rather than inside the backfill script because these slugs end up on printed
// flyers and QR codes: the rule that generated a URL in August has to still generate the SAME URL
// when a new campus is added in November, or the reprint points somewhere else. One function, one
// test file, no second copy in the migration folder.
//
// Source is the greek_orgs NAME. Audited before choosing it: greek_orgs.letters is empty across all
// 150 orgs, and nickname is present for roughly half (absent for every NPHC org), so either would
// give a URL scheme whose shape depended on which council a chapter belonged to.

/** "Alpha Phi Alpha Fraternity, Inc." -> "alpha-phi-alpha".
 *
 *  The organisational tail is stripped so a name recorded with its legal suffix and the same name
 *  recorded without it land on ONE slug instead of two near-duplicate URLs for one chapter. */
export function greekChapterSlug(orgName: string): string {
  return orgName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\b(fraternity|sorority|international|national)\b/g, " ")
    .replace(/\binc\.?\b/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/, "");
}
