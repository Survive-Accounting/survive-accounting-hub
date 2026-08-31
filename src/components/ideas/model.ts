// IDEAS TO SAVE — the vocabulary and the pure helpers.
//
// The whole tool exists to make capture cost ten seconds. Everything here is
// therefore optional except the text: categories, subcategory, prompt, status
// all have sane defaults, so Save is always one keystroke away.
//
// Pure — no React, no network. The drawer, the list and the Prioritize panel
// all render what these return.

export const CATEGORIES = [
  "AUTHORING", "FILMING", "PUBLISHING", "MARKETING", "CUSTOMER_SUCCESS", "UI_UX", "INFRASTRUCTURE",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** What each bucket covers — shown next to the chip so the choice is obvious
 *  without a manual. The UI/UX vs CUSTOMER SUCCESS split is the one people get
 *  wrong, so both descriptions name it. */
export const CATEGORY_LABEL: Record<Category, string> = {
  AUTHORING: "Authoring",
  FILMING: "Filming",
  PUBLISHING: "Publishing",
  MARKETING: "Marketing",
  CUSTOMER_SUCCESS: "Customer success",
  UI_UX: "UI / UX",
  INFRASTRUCTURE: "Infrastructure",
};
export const CATEGORY_HINT: Record<Category, string> = {
  AUTHORING: "Talk Box, exhibits, CEQs, content creation",
  FILMING: "capture, frames, Studio",
  PUBLISHING: "production queue, YouTube, the app",
  MARKETING: "outreach, campaigns, campus reps, landing pages",
  CUSTOMER_SUCCESS: "students, support, guarantees, onboarding — what a page DOES",
  UI_UX: "anything primarily about the interface — how a page LOOKS",
  INFRASTRUCTURE: "domains, inboxes, data, architecture",
};

export const STATUSES = ["IDEA", "DRAFTED", "SUBMITTED", "APPROVED", "PARKED"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_HINT: Record<Status, string> = {
  IDEA: "captured, nothing written",
  DRAFTED: "a prompt exists",
  SUBMITTED: "handed to Claude Code",
  APPROVED: "shipped and verified",
  PARKED: "deliberately not doing this",
};

/** PARKED is the archive — there is no delete anywhere in this tool. An idea
 *  you decided against is a decision worth keeping. */
export const STATUS_COLOR: Record<Status, string> = {
  IDEA: "#9AA3B8",
  DRAFTED: "#7DD3FC",
  SUBMITTED: "#FCA311",
  APPROVED: "#3BF5A0",
  PARKED: "#6B7280",
};

/** Everyone shares one vault. The person who notices the problem is usually
 *  not Lee, so the capture path has to be as short for King and McKinsey as
 *  it is for him. This is for FILTERING, never for permissions. */
export const PEOPLE = ["lee", "king", "mckinsey"] as const;
export type Person = (typeof PEOPLE)[number];
export const PERSON_LABEL: Record<Person, string> = { lee: "Lee", king: "King", mckinsey: "McKinsey" };

/** How an idea arrived. A broken inbound path is invisible without this. */
export const SOURCE_KINDS = ["web", "voice", "sms", "email"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const SOURCE_ICON: Record<SourceKind, string> = { web: "⌨", voice: "🎙", sms: "💬", email: "✉" };

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Supabase storage path in the existing canvas-media bucket. */
  path: string;
  url: string;
}

export interface Idea {
  id: string;
  title: string;
  body: string;
  categories: Category[];
  subcategory: string;
  status: Status;
  sourcePath: string;
  context: Record<string, string>;
  promptMd: string | null;
  promptFilename: string | null;
  createdBy: string;
  sourceKind: SourceKind;
  attachments: Attachment[];
  /** The recording is kept even when transcription fails — the audio IS the idea. */
  audioPath: string | null;
  transcriptStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The pill's number: what still needs Lee's hands. SUBMITTED is out of his
 *  court, APPROVED is done, PARKED is decided — so the count is the work. */
export const isUnsubmitted = (i: Idea): boolean => i.status === "IDEA" || i.status === "DRAFTED";
export const unsubmittedCount = (ideas: readonly Idea[]): number => ideas.filter(isUnsubmitted).length;

export const newIdeaId = (): string =>
  `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** A title Lee never has to type: the first line, trimmed to something that
 *  fits a list row. The body keeps everything. */
export function deriveTitle(text: string, max = 72): string {
  const first = text.trim().split("\n").find((l) => l.trim()) ?? "";
  const clean = first.replace(/^[#>\-*\s]+/, "").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "…";
}

/** Subcategory autocomplete grows from what has been used — no fixed list to
 *  maintain, and it surfaces Lee's own vocabulary back to him. */
export function knownSubcategories(ideas: readonly Idea[]): string[] {
  const seen = new Map<string, number>();
  for (const i of ideas) {
    const s = i.subcategory.trim();
    if (s) seen.set(s, (seen.get(s) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}

/** Search across titles and bodies (and the subcategory, which is where the
 *  useful noun usually is). */
export function searchIdeas(ideas: readonly Idea[], q: string): Idea[] {
  const n = q.trim().toLowerCase();
  if (!n) return [...ideas];
  return ideas.filter((i) => `${i.title} ${i.body} ${i.subcategory}`.toLowerCase().includes(n));
}

/** UNSORTED is a derived BUCKET, not a category. An uncategorised idea is
 *  fine — auto-categorising one would be guessing, and the vocabulary should
 *  not grow a slot that means "we did not ask". */
export const isUnsorted = (i: Idea): boolean => i.categories.length === 0;

export type SortKey = "date" | "category" | "status";

export function sortIdeas(ideas: readonly Idea[], key: SortKey): Idea[] {
  const out = [...ideas];
  if (key === "date") return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (key === "status") return out.sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || b.updatedAt.localeCompare(a.updatedAt));
  return out.sort((a, b) => (a.categories[0] ?? "~").localeCompare(b.categories[0] ?? "~") || b.updatedAt.localeCompare(a.updatedAt));
}

export function filterIdeas(ideas: readonly Idea[], f: {
  category?: Category | null; status?: Status | null; q?: string;
  person?: string | null; unsorted?: boolean;
}): Idea[] {
  let out = searchIdeas(ideas, f.q ?? "");
  if (f.unsorted) out = out.filter(isUnsorted);
  else if (f.category) out = out.filter((i) => i.categories.includes(f.category!));
  if (f.status) out = out.filter((i) => i.status === f.status);
  if (f.person) out = out.filter((i) => i.createdBy === f.person);
  return out;
}

// ------------------------------------------------------------- prioritize

export type Focus = "filming" | "outreach" | "product" | "launch" | "unblock";
export type TimeBox = "hour" | "evening" | "day";

export const FOCUS_LABEL: Record<Focus, string> = {
  filming: "Filming", outreach: "Outreach", product: "Product build",
  launch: "Launch prep", unblock: "Whatever unblocks the most",
};
export const TIME_LABEL: Record<TimeBox, string> = {
  hour: "An hour", evening: "An evening", day: "A full day",
};

/** Which categories a focus actually advances. */
const FOCUS_CATEGORIES: Record<Focus, Category[]> = {
  filming: ["FILMING", "AUTHORING"],
  outreach: ["MARKETING"],
  product: ["UI_UX", "PUBLISHING", "INFRASTRUCTURE"],
  launch: ["PUBLISHING", "CUSTOMER_SUCCESS", "MARKETING"],
  unblock: ["INFRASTRUCTURE", "AUTHORING", "PUBLISHING"],
};

export interface Ranked { idea: Idea; why: string }
export interface Recommendation {
  items: Ranked[];
  /** Set when the honest answer is "none of these". */
  goFilm: string | null;
}

/** PRIORITIZE — a recommendation, not a stored score. Priority fields go stale
 *  the moment the week changes; this asks what the week IS and answers for
 *  today only.
 *
 *  It is deliberately willing to say NONE OF THESE — GO FILM. That is often the
 *  right answer, and a tool that cannot say it will keep inventing work. */
export function prioritize(ideas: readonly Idea[], focus: Focus, time: TimeBox, now = new Date()): Recommendation {
  const live = ideas.filter((i) => i.status === "IDEA" || i.status === "DRAFTED");
  const wanted = FOCUS_CATEGORIES[focus];

  const scored = live.map((i) => {
    let score = 0;
    // Reasons collected by KIND, not push order: the one worth showing is the
    // one that explains why this beat its peers. "The prompt is already
    // written" is useful; "it is Marketing" is not, when everything on the
    // list is Marketing.
    let ready = "", stale = "", match = "";

    const hits = i.categories.filter((c) => wanted.includes(c));
    if (hits.length) { score += 40 + hits.length * 5; match = `${hits.map((h) => CATEGORY_LABEL[h]).join(" + ")} — the work you said you're doing`; }

    // A written prompt is the cheapest thing on the list: it is ready to hand
    // to Claude Code right now.
    if (i.status === "DRAFTED" && i.promptMd) { score += 30; ready = "the prompt is already written — this is a paste away"; }
    else if (time === "hour") { score -= 15; ready = "needs the prompt written first"; }

    // An hour suits something already drafted; a full day suits the un-started.
    if (time === "day" && i.status === "IDEA") score += 8;
    if (time === "evening") score += 4;

    // Age breaks ties: an idea that keeps not getting done is either important
    // or should be parked, and surfacing it forces that call.
    const days = Math.max(0, (now.getTime() - new Date(i.createdAt).getTime()) / 86_400_000);
    if (days > 14) { score += 10; stale = `sat for ${Math.round(days)} days — do it or park it`; }
    else score += Math.min(days, 14) * 0.4;

    return { idea: i, score, why: [ready, stale, match].filter(Boolean) };
  }).sort((a, b) => b.score - a.score);

  const top = scored.filter((s) => s.score >= 40).slice(0, 5);

  if (!top.length) {
    return {
      items: [],
      goFilm: live.length
        ? "Nothing here moves what you said you're working on. Go film — these will keep."
        : "The vault is empty. Go film.",
    };
  }
  return {
    items: top.map((s) => ({ idea: s.idea, why: s.why[0] ?? "closest match to this week" })),
    goFilm: top.length < 3 && focus === "filming"
      ? "That's all that's genuinely filming-adjacent — after these, go film."
      : null,
  };
}
