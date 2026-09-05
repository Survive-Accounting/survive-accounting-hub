// IDEAS TO SAVE — the vocabulary and the pure helpers.
//
// The whole tool exists to make capture cost ten seconds. Everything here is
// therefore optional except the text: categories, subcategory, prompt, status
// all have sane defaults, so Save is always one keystroke away.
//
// Pure — no React, no network. The drawer, the list and the Prioritize panel
// all render what these return.

// THE CATEGORIES (Lee, 2026-09-05: "Drop the older categories for now. We'll
// start fresh."). Two sides — the business first, personal at the bottom — in
// the order that matters most for the business, working on down. Each is a
// node in a small tree (Writing Ideas → Characters), and Lee can add his own
// from the page (kept in site_settings, merged in by listIdeas). Custom keys
// are plain UPPER_SNAKE strings, so `Category` is a string, not an enum.
export type CategorySide = "work" | "personal";
export interface CategoryDef {
  key: string;
  label: string;
  /** What lands here — shown beside the chip and fed to the AI filer. */
  hint: string;
  side: CategorySide;
  /** Nesting: the parent's key. Absent = top level. */
  parent?: string;
  /** True for the ones Lee added from the page. Built-ins cannot be hidden. */
  custom?: boolean;
  /** Hidden custom categories stay in the settings row so old ideas still resolve a label. */
  hidden?: boolean;
}

export const BUILT_IN_CATEGORIES: readonly CategoryDef[] = [
  // ---- the business, most important first
  { key: "SURVIVEACCOUNTING", label: "SurviveAccounting.com", side: "work", hint: "the app itself — pages, slides, filming tools, the Idea Bank, infrastructure, anything students touch" },
  { key: "LEARN_DASHBOARD", label: "Learn dashboard", side: "work", hint: "/learn — the feed, the Shorts player, the share links, what a chapter sees" },
  { key: "CAMPUS_REPS", label: "Campus reps", side: "work", hint: "the rep program — recruiting, the rep kit, rep pages, payouts" },
  { key: "SCHOLARSHIP_CHAIRS", label: "Scholarship chairs", side: "work", hint: "Greek chapter scholarship chairs — outreach, the chair experience, chapter pages" },
  { key: "YOUTUBE", label: "YouTube", side: "work", hint: "the channel — videos, titles, thumbnails, publishing cadence" },
  { key: "INSTAGRAM", label: "Instagram", side: "work", hint: "IG — reels, DMs, the growth handles, the daily digest" },
  { key: "TIKTOK", label: "TikTok", side: "work", hint: "TikTok — clips, hooks, what to repost" },
  { key: "BUILD_IN_PUBLIC", label: "Build in public", side: "work", hint: "side clips about building Survive — the tools, the studio, the vision, the journey" },
  { key: "NONTRADITIONAL", label: "Nontraditional", side: "work", hint: "vlog / podcast on nontraditional career paths — not about Survive's product" },
  { key: "GREEKINTEL", label: "GreekIntel.com", side: "work", hint: "the Greek intelligence product — chapter data, councils, the intel dashboard" },
  { key: "SURVIVESTUDIOS", label: "SurviveStudios.com", side: "work", hint: "the studio business — productizing the tutor, the capture system as a product" },
  { key: "SURVIVEOCHEM", label: "Surviveochem.com", side: "work", hint: "the organic chemistry line" },
  { key: "SURVIVEFINANCE", label: "survivefinance.com", side: "work", hint: "the finance line" },
  { key: "SURVIVESTATS", label: "survivestats.com", side: "work", hint: "the statistics line" },
  // ---- personal, at the bottom
  { key: "PERSONAL_TODOS", label: "To Do's", side: "personal", hint: "things to do — errands, calls, the list" },
  { key: "PERSONAL_CALENDAR", label: "Calendar Events", side: "personal", hint: "dates — events, trips, deadlines to put on the calendar" },
  { key: "PERSONAL_WRITING", label: "Writing Ideas", side: "personal", hint: "the writing — stories, scenes, lines" },
  { key: "PERSONAL_CHARACTERS", label: "Characters", side: "personal", parent: "PERSONAL_WRITING", hint: "characters for the writing — one per idea, or a note on one" },
];

/** The built-in keys, in order. Custom keys are validated by shape, not this list. */
export const CATEGORIES = BUILT_IN_CATEGORIES.map((c) => c.key);
export type Category = string;
export const CATEGORY_KEY_RE = /^[A-Z0-9][A-Z0-9_]{1,59}$/;

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(BUILT_IN_CATEGORIES.map((c) => [c.key, c.label]));
export const CATEGORY_HINT: Record<string, string> = Object.fromEntries(BUILT_IN_CATEGORIES.map((c) => [c.key, c.hint]));

/** The old buckets (2026-08-31 → 09-05) all described the app, so an idea filed
 *  under one lands in SurviveAccounting.com — nothing goes unsorted. */
export const LEGACY_CATEGORY: Record<string, string> = {
  AUTHORING: "SURVIVEACCOUNTING", FILMING: "SURVIVEACCOUNTING", PUBLISHING: "SURVIVEACCOUNTING", MARKETING: "SURVIVEACCOUNTING",
  CUSTOMER_SUCCESS: "SURVIVEACCOUNTING", UI_UX: "SURVIVEACCOUNTING", INFRASTRUCTURE: "SURVIVEACCOUNTING",
};

/** Legacy keys mapped, unknown shapes dropped, duplicates collapsed. Pure. */
export function normalizeCategories(raw: readonly unknown[] | null | undefined): string[] {
  const out: string[] = [];
  for (const c of raw ?? []) {
    if (typeof c !== "string") continue;
    const k = LEGACY_CATEGORY[c] ?? c;
    if (CATEGORY_KEY_RE.test(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/** Built-ins + Lee's custom ones (hidden ones kept so labels still resolve). */
export function mergeCategories(custom: readonly CategoryDef[] = []): CategoryDef[] {
  const seen = new Set(BUILT_IN_CATEGORIES.map((c) => c.key));
  const extra = custom.filter((c) => c && CATEGORY_KEY_RE.test(c.key) && !seen.has(c.key)).map((c) => ({ ...c, custom: true }));
  return [...BUILT_IN_CATEGORIES, ...extra];
}
export const visibleCategories = (defs: readonly CategoryDef[]): CategoryDef[] => defs.filter((c) => !c.hidden);
export const categoryLabel = (key: string, defs: readonly CategoryDef[] = BUILT_IN_CATEGORIES): string =>
  defs.find((c) => c.key === key)?.label ?? CATEGORY_LABEL[key] ?? key.toLowerCase().replace(/_/g, " ");
export const categoryChildren = (key: string, defs: readonly CategoryDef[]): CategoryDef[] => defs.filter((c) => c.parent === key && !c.hidden);
export const topCategories = (defs: readonly CategoryDef[], side?: CategorySide): CategoryDef[] =>
  defs.filter((c) => !c.parent && !c.hidden && (!side || c.side === side));
/** The key and every descendant's — an idea filed under Characters counts under Writing Ideas. */
export function categoryFamily(key: string, defs: readonly CategoryDef[]): string[] {
  const out = [key];
  for (let i = 0; i < out.length; i++) for (const c of defs) if (c.parent === out[i] && !out.includes(c.key)) out.push(c.key);
  return out;
}
/** A new key from a label: "Bucerias trip" → BUCERIAS_TRIP, made unique against what exists. */
export function categoryKeyFor(label: string, defs: readonly CategoryDef[]): string {
  const base = label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "CATEGORY";
  let k = base.length < 2 ? base + "_X" : base; let n = 2;
  while (defs.some((c) => c.key === k)) k = `${base}_${n++}`;
  return k;
}
/** The vocabulary line the AI filer reads — every visible category with its hint, work first. */
export function categoryVocabulary(defs: readonly CategoryDef[] = BUILT_IN_CATEGORIES): string {
  return visibleCategories(defs).map((c) => `${c.key} = ${c.label}${c.parent ? ` (under ${categoryLabel(c.parent, defs)})` : ""}: ${c.hint}`).join(" · ");
}

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

// ---- the additive flags that live in `context` (no schema change) ----------
/** Pinned to the top of every list; turning it on texts Lee. */
export const isUrgent = (i: Idea): boolean => i.context?.urgent === "1";
/** Saved to come back to — the words are not finished. */
export const isDraft = (i: Idea): boolean => i.context?.draft === "1";
/** PRODUCTION QUEUE (content to film — slides, exhibits, new CEQs), routed
 *  here from a review board with "→ production". Separate from the build
 *  queue, which is code. */
export const isProduction = (i: Idea): boolean => i.context?.production === "1";
/** A to-do (work/personal) — Terry's, not the build queue. */
export const isTodoIdea = (i: Idea): boolean => !!i.context?.todo;
/** THE BUILD QUEUE (2026-09-03). Armed = Lee added it to the queue from the
 *  bank; the runner on the build machine picks armed ideas up by priority.
 *  Built = the branch is pushed and the testing checklist is written back. */
export const QUEUE_PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type QueuePriority = (typeof QUEUE_PRIORITIES)[number];
export const isArmed = (i: Idea): boolean => i.context?.armed === "1";
export const isBuilt = (i: Idea): boolean => i.context?.built === "1";
export const isBuilding = (i: Idea): boolean => isArmed(i) && !isBuilt(i) && !!i.context?.runStartedAt && !i.context?.runFailed;
export const buildFailed = (i: Idea): boolean => i.context?.runFailed === "1";
/** THE HANDS-ON GATE (2026-09-03): the runner judged it too big or too
 *  taste-dependent for an unattended build, took it out of the queue, and
 *  emailed Lee the brief. `handsOn` holds the one-sentence why; the
 *  suggested plan is in `handsOnPlan` (JSON list of slice titles). "Queue
 *  anyway" re-arms it and the runner skips the gate. */
export const isHandsOn = (i: Idea): boolean => !!i.context?.handsOn && !isArmed(i) && !isBuilt(i);
export const handsOnPlanOf = (i: Idea): string[] => {
  try { const v = JSON.parse(i.context?.handsOnPlan ?? "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
};
export const queuePriorityOf = (i: Idea): QueuePriority =>
  (QUEUE_PRIORITIES as readonly string[]).includes(i.context?.queuePriority ?? "") ? (i.context!.queuePriority as QueuePriority) : "medium";
export const testChecklistOf = (i: Idea): string[] => {
  try { const v = JSON.parse(i.context?.testChecklist ?? "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
};
const Q_RANK: Record<QueuePriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
/** Queue order: priority, then armed first. */
export function rankQueue(ideas: readonly Idea[]): Idea[] {
  return [...ideas].sort((a, b) => Q_RANK[queuePriorityOf(b)] - Q_RANK[queuePriorityOf(a)]
    || (a.context?.armedAt ?? a.updatedAt).localeCompare(b.context?.armedAt ?? b.updatedAt));
}

/** Set by Prioritize's drag-and-drop; higher first. 0 = never ranked. */
export const priorityOf = (i: Idea): number => Number(i.context?.priority ?? 0) || 0;
export const tldrOf = (i: Idea): string => i.context?.tldr ?? "";
export const summaryOf = (i: Idea): string => i.context?.summary ?? "";

/** THE VAULT ORDER: urgent pinned, then Prioritize's order, then newest. */
export function rankIdeas(ideas: readonly Idea[]): Idea[] {
  return [...ideas].sort((a, b) =>
    Number(isUrgent(b)) - Number(isUrgent(a))
    || priorityOf(b) - priorityOf(a)
    || b.updatedAt.localeCompare(a.updatedAt));
}

/** Count per category for the filter pills — an idea in two buckets counts in both. */
export function countByCategory(ideas: readonly Idea[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of ideas) for (const c of i.categories) out[c] = (out[c] ?? 0) + 1;
  return out;
}

export type SortKey = "priority" | "date" | "category" | "status";

export function sortIdeas(ideas: readonly Idea[], key: SortKey): Idea[] {
  if (key === "priority") return rankIdeas(ideas);
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
  filming: ["SURVIVEACCOUNTING", "YOUTUBE", "INSTAGRAM", "TIKTOK", "BUILD_IN_PUBLIC", "NONTRADITIONAL"],
  outreach: ["CAMPUS_REPS", "SCHOLARSHIP_CHAIRS", "INSTAGRAM"],
  product: ["SURVIVEACCOUNTING", "LEARN_DASHBOARD", "GREEKINTEL"],
  launch: ["SURVIVEACCOUNTING", "LEARN_DASHBOARD", "CAMPUS_REPS", "SCHOLARSHIP_CHAIRS"],
  unblock: ["SURVIVEACCOUNTING", "LEARN_DASHBOARD", "CAMPUS_REPS"],
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
    if (hits.length) { score += 40 + hits.length * 5; match = `${hits.map((h) => categoryLabel(h)).join(" + ")} — the work you said you're doing`; }

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
