// Map a URL path to a QA template id. Used to roll PostHog top-pages up to the
// template level (spec §16) and to label search results in the All-pages view.
// Pure; safe on client and server.
import { GENERATED_SCHOOLS } from "@/lib/schools.generated";

export const CAMPUS_SLUGS: Set<string> = new Set(GENERATED_SCHOOLS.map((s) => s.slug));

const PROFINTEL = new Set([
  "profintel",
  "profintel-schedule",
  "profintel-metrics",
  "leadfinder",
  "leadfinder-batch",
  "leadfinder-leaderboard",
  "research",
]);
const GREEKINTEL = new Set(["greek-orgs", "chapters", "councils", "greek-claims"]);
const MISC_MARKETING = new Set(["waitlist", "thankyou", "welcome", "preview", "beyond", "expand"]);

function segs(path: string): string[] {
  const clean = (path.split("?")[0] || "").split("#")[0] || "";
  return clean.split("/").filter(Boolean);
}

/** Returns the template id for a URL path, or null if it maps to nothing the
 *  cockpit tracks (redirects, unknown campus slugs, assets). */
export function classifyPath(path: string): string | null {
  const s = segs(path);
  if (s.length === 0) return "homepage";
  const [a, b] = s;

  switch (a) {
    case "go":
      if (s.length === 1) return "chapter-finder";
      if (s.length === 2) return "chapter-finder"; // /go/:school
      if (s[2] === "council") return "council-private-page";
      return "greek-chapter-page"; // /go/:school/:chapter
    case "partners":
      if (b === "national") return "national-org-page";
      if (b === "council") return "council-partner-page";
      if (b === "campus-councils" || b === "national-organizations") return "partner-marketing";
      return null;
    case "outreach":
      if (b === "school") return "prof-campus-landing";
      if (b && PROFINTEL.has(b)) return "profintel-admin";
      if (b && GREEKINTEL.has(b)) return "greekintel-admin";
      return "outreach-console";
    case "ceq":
      return "ceq-studio";
    case "chapters":
      if (b === "dashboard") return "chapter-dashboard";
      if (b === "kit") return "chapter-kit";
      return "chapter-finder";
    case "learn":
      return "learn-shell";
    case "study":
      return "study-je";
    case "order":
    case "start":
      return "order-intake";
    case "o":
    case "onboard":
    case "t":
      return "onboarding";
    case "rep":
      return "rep-page";
    case "admin":
      return b === "site-qa" ? "site-qa" : null;
    case "terms":
    case "privacy":
      return "legal";
    case "u":
      return "email-prefs";
  }

  if (MISC_MARKETING.has(a)) return "waitlist-signup";

  // Single-segment campus page, or /:school/rep
  if (CAMPUS_SLUGS.has(a)) {
    if (s.length === 2 && b === "rep") return "rep-page";
    return "campus-page";
  }
  return null;
}
