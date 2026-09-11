// STRATEGY — the brainstorm board's vocabulary. Client-safe: no React, no network.
//
// Source of truth for the words is docs/SURVIVE_STRATEGY_CULTURE_2026-09.md (Lee's
// September 2026 brainstorm capture). This module carries the SHAPE of it — the lanes the
// doc is organised in, and the strategy shorts Lee listed, prioritised — so the board at
// /admin/ideas/strategy and the Ctrl+I capture agree on where a thought lands.
//
// HUMAN FIRST (the doc's own rule): every line here is Lee's idea. This file organises and
// phrases; it does not invent. When the doc changes, this changes with it.
//
// Strategy notes and strategy shorts are ORDINARY IDEAS in the ideas table, told apart by
// context flags (all strings — `context` is Record<string,string>):
//   strategy: "1"          — belongs to the strategy board (category STRATEGY is forced on)
//   lane: <StrategyLane>   — which section of the doc (a note) / which audience (a short)
//   short: "1"             — this is a strategy short to film, not a note
//   shortPriority: "12"    — lower films first
//   hook / slides / riff   — a short's filmable shape (slides and riff are JSON arrays)
//   deckId / deckPath      — set once "Blast off" has minted its /v3 deck
import type { Idea } from "@/components/ideas/model";

// ---------------------------------------------------------------- the doc, by lane

export type StrategyLane = "principles" | "product" | "chain" | "verticals" | "reps" | "chairs" | "later";

export interface StrategyLaneDef {
  key: StrategyLane;
  title: string;
  blurb: string;
  /** The doc's own lines — the prompts to riff on. Short, verbatim where it counts. */
  canon: string[];
}

export const STRATEGY_LANES: readonly StrategyLaneDef[] = [
  {
    key: "principles", title: "Operating principles", blurb: "How Survive works, before what it sells.",
    canon: [
      "Use Your Words — thinking out loud is the strategy engine; brainstorming aloud is the mechanism, not a supplement.",
      "Feed the Machine — no strategy short gets made until accounting shorts have shipped. Dreaming is allowed; it doesn't come first.",
      "Human First — the AI catches Lee's ideas, it does not generate them. Its only license is a better phrasing for short-form.",
    ],
  },
  {
    key: "product", title: "Product strategy", blurb: "Short-form is the format, not a channel.",
    canon: [
      "Two-minute cram videos, not lectures. \"Reels that explain my practice exams.\"",
      "Easy Points is free on every exam — real points, and proof the harder material is behind the wall.",
      "Exam 1: the rest is gated by email + a 3-email sequence timed to the exam date. Exams 2–4: gated by payment ($50).",
      "Chapter members are provisioned, but the email gate still applies — chapter-level email volume is the demand signal for reps.",
      "If a student won't submit an email after real value, they were never going to convert. The hoops filter for customers.",
      "Roadmap: intro accounting through spring 2027 → summer 2027 workshop mode (Intro 2, Intermediate 1 & 2, plus 1–2 new subjects) → ~6 courses.",
    ],
  },
  {
    key: "chain", title: "Vertical integration", blurb: "The full production chain, built solo.",
    canon: [
      "1 AI teaching assistant (talk it through) → 2 AI producer (slides) → 3 teleprompter + script bank → 4 one take, minimal editing → 5 Shorts / Reels / TikTok.",
      "The \"big ideas guy who learned to build with AI\" story — for hires, investors, the ENT course. Not for students.",
    ],
  },
  {
    key: "verticals", title: "Content verticals", blurb: "Three kinds of short, three audiences.",
    canon: [
      "Cram shorts → students. The product. Revenue.",
      "Onboarding shorts → reps, chairs, IFC. Explain the role, put a face to the name. Three to start: what Survive is · what a rep does week to week · how you get paid.",
      "Strategy shorts → ENT students, hires, partners. Bank them before posting; if accounting shorts underperform, they become the traffic strategy.",
    ],
  },
  {
    key: "reps", title: "The rep program", blurb: "Selective on purpose. An education with a commission attached.",
    canon: [
      "Apply → Lee gets a text → approve or deny. The denial is warm, held for future semesters, resume feedback offered — a brand moment.",
      "The bar is deliberately high; easy-to-join comes later as a referral program.",
      "Reps get taught how to sell — entrepreneurship and startup mechanics through real work.",
      "The app tells reps where to act: \"ATO just signed up 18 people — check in with the scholarship chair. Here's what I'd suggest saying.\" Reps close.",
      "Do well at your campus, get plugged into nearby ones. 200+ campuses with Greek systems, all remote.",
      "First test: Slater (Mississippi State), then Smith (Alabama). Goal: Slater's reaction to the onboarding is \"holy shit.\"",
    ],
  },
  {
    key: "chairs", title: "The scholarship chair pitch", blurb: "Partnership, not vendor.",
    canon: [
      "\"I'm building the Reels of exam prep.\"",
      "\"I want you to be incredible at your job.\"",
      "\"Help me understand what a chapter actually needs — which courses, what the experience should be for you and your members.\"",
      "Build a real academic culture in the house with something built for this generation. A two-minute short that gets you points is different from a long video.",
      "Chairs get a short onboarding video too — quick, personal, face to the name.",
    ],
  },
  {
    key: "later", title: "Longer horizon", blurb: "Not now. Revisit with national traction.",
    canon: [
      "Interview former professors — Dr. Davis (Ole Miss) first; Dr. Wilder and Dr. Gentry on their programs and the future of higher ed.",
      "Tutor community — the human version of the AI teaching assistant: tutors mining their own experience together.",
      "FSI testimonial — exists, needs pulling out and using.",
    ],
  },
];

export const laneDef = (key: string | undefined): StrategyLaneDef | undefined => STRATEGY_LANES.find((l) => l.key === key);

// ---------------------------------------------------------------- shorts: audiences

export type ShortLane = "reps" | "chairs" | "students" | "building" | "founder" | "later";

export interface ShortLaneDef {
  key: ShortLane;
  title: string;
  blurb: string;
  /** The bank category a short in this lane also files under (beside STRATEGY). */
  category: string;
  /** Feed the Machine: which lanes are OK to post now vs bank only. */
  post: "now" | "bank" | "later";
}

export const SHORT_LANES: readonly ShortLaneDef[] = [
  { key: "reps", title: "Campus reps", blurb: "The onboarding shorts. Film these first.", category: "CAMPUS_REPS", post: "now" },
  { key: "chairs", title: "Chairs & councils", blurb: "Scholarship chairs, IFC. Quick, personal, face to the name.", category: "SCHOLARSHIP_CHAIRS", post: "now" },
  { key: "students", title: "New students", blurb: "One quick one: what's free, what's behind the wall.", category: "LEARN_DASHBOARD", post: "now" },
  { key: "building", title: "Building Survive", blurb: "Build in public. Bank until the accounting shorts have shipped.", category: "BUILD_IN_PUBLIC", post: "bank" },
  { key: "founder", title: "Founder notes", blurb: "The operating principles, said out loud. Bank.", category: "NONTRADITIONAL", post: "bank" },
  { key: "later", title: "Later", blurb: "Interviews and community — with national traction.", category: "NONTRADITIONAL", post: "later" },
];

export const shortLaneDef = (key: string | undefined): ShortLaneDef | undefined => SHORT_LANES.find((l) => l.key === key);

// ---------------------------------------------------------------- the shorts, prioritised

export interface ShortSlide { title: string; lines: string[] }

export interface StrategyShortSeed {
  slug: string;
  lane: ShortLane;
  priority: number;
  title: string;
  /** The one-line reason to watch. */
  hook: string;
  /** The slides — headings and the points under them. Also the teleprompter lines. */
  slides: ShortSlide[];
  /** What to riff on — Lee's own phrases, not a script. */
  riff: string[];
}

export const STRATEGY_SHORTS: readonly StrategyShortSeed[] = [
  // ---- Campus reps — tonight
  {
    slug: "rep-what-survive-is", lane: "reps", priority: 1,
    title: "What Survive is (for a rep)",
    hook: "Ten years of tutoring, one course that ruins college for people, and the shortest way to fix it.",
    slides: [
      { title: "The problem", lines: ["For a lot of students, the intro accounting exam is the hardest thing they've faced", "College is incredible — this one course is where it stops being fun"] },
      { title: "The asset", lines: ["Ten years, 1,000+ students", "The practice exams are the asset — the shorts are how they get taught"] },
      { title: "The pitch", lines: ["\"Reels that explain my practice exams\"", "Two minutes that get you points, not a lecture"] },
      { title: "Your one job", lines: ["Get the free Exam 1 kit into every chapter house on your campus", "Easy Points is free on every exam — real points first"] },
    ],
    riff: ["Say the Dr. Davis line if it comes: the course you thrived in is the one everyone else dreads", "Face to the name — this one is who you are, not what the product does"],
  },
  {
    slug: "rep-week-to-week", lane: "reps", priority: 2,
    title: "What a rep actually does, week to week",
    hook: "You don't just connect. You close — and the app tells you where.",
    slides: [
      { title: "Find the right person", lines: ["The scholarship chair, an exec, an advisor — in each fraternity and sorority", "Send the free Exam 1 kit. Get the flyer in the house"] },
      { title: "Follow the signal", lines: ["\"ATO at your campus just signed up 18 people — check in with the scholarship chair\"", "\"Here's what I'd suggest saying\""] },
      { title: "Close", lines: ["Reps don't just connect; they close", "All remote. Your campus, your houses"] },
    ],
    riff: ["Emails from one house are the demand signal — 18 from one chapter means a rep should be in that room", "Keep it concrete: one week, one house, one conversation"],
  },
  {
    slug: "rep-how-you-get-paid", lane: "reps", priority: 3,
    title: "How you get paid",
    hook: "Two levels. Level 1 is your campus. Level 2 you graduate into.",
    // ONBOARDING STEP 4 (rep spec §6, 2026-09-06). The pay tables live in rep-copy.ts; say them, don't read them.
    slides: [
      { title: "Level 1 — your campus", lines: ["10% of every sale through your link", "$1 every time a free Exam 1 user goes paid", "$25 when a chapter closes", "$25 when a chapter flyer or QR activates — 5+ sign-ups from it"] },
      { title: "The gate", lines: ["Chapter bonuses unlock only when the chapter pays", "Your 10% runs the first semester on any chapter you bring on, and keeps running as long as you're actively managing it"] },
      { title: "Level 2 — after performance", lines: ["Not offered at signup — you graduate into it", "5% on assisted outreach at other campuses", "$150 flat when a rep you referred onboards a chapter"] },
      { title: "The ceiling, then the ramp", lines: ["A campus that's up and running produces around $20,000 a year — you earn 10% of it. Ole Miss is already there", "Your campus won't be there in October. First semester is about opening it — a few hundred dollars while you build, a real number once it's running"] },
    ],
    riff: ["Say the gate plainly — never fine print", "Both numbers, in this order, or neither: the ceiling alone over-promises, the ramp alone undersells", "Renewals: don't state a rate — 'we'll work out the details when you get there'"],
  },
  {
    slug: "rep-the-mission", lane: "reps", priority: 2,
    title: "The mission",
    hook: "Accounting now. More courses coming. Two hundred campuses.",
    // ONBOARDING STEP 2 — the applicant just acknowledges this one.
    slides: [
      { title: "Now", lines: ["Intro accounting, deepening quality through spring 2027", "Easy Points free on every exam; the rest behind the wall"] },
      { title: "Next", lines: ["Summer 2027 workshop mode — Intro 2, Intermediate 1 and 2", "Then one or two new subjects: organic chemistry, finance"] },
      { title: "The map", lines: ["200+ campuses with Greek systems, large and small", "Intro accounting is the way in, not the ceiling"] },
    ],
    riff: ["This is the one where they decide whether it's a job or a thing they want in on", "Keep it under a minute — it's an acknowledge step"],
  },
  {
    slug: "rep-why-the-bar-is-high", lane: "reps", priority: 4,
    title: "Why the bar is high",
    hook: "Most people who apply won't get it — and the no is the nicest thing we send.",
    slides: [
      { title: "How it works", lines: ["You apply. I get a text. I say yes or no"] },
      { title: "The no", lines: ["Casual, warm, human", "Held for future semesters — and resume feedback if you want it"] },
      { title: "Why selective", lines: ["The role stays small so reps take it seriously", "The right person gets to crush it with everything already built for them", "Easy-to-join comes later as a referral program"] },
    ],
    riff: ["The denial is a brand moment — it raises the perceived bar of the role and leaves a good taste", "Who you're picturing: Slater at Mississippi State. Build the video for her"],
  },
  {
    slug: "rep-education-with-commission", lane: "reps", priority: 5,
    title: "An education with a commission attached",
    hook: "You'll get taught how to sell. That's the point, not the perk.",
    slides: [
      { title: "What you learn", lines: ["How to sell — entrepreneurship and startup mechanics, taught through real work", "Not a course about it. The thing itself"] },
      { title: "Where it goes", lines: ["Do well at your campus, get plugged into nearby campuses", "200+ campuses with Greek systems, large and small. All remote"] },
    ],
    riff: ["This is a genuine passion, not a perk — say why you care about teaching people to sell", "The growth path is the close: your campus is the start"],
  },

  // ---- Chairs, councils, students — quick ones, next
  {
    slug: "chair-incredible-at-your-job", lane: "chairs", priority: 6,
    title: "For the scholarship chair: I want you to be incredible at your job",
    hook: "Partnership, not vendor. Help me understand what your chapter needs.",
    slides: [
      { title: "What this is", lines: ["\"I'm building the Reels of exam prep\"", "\"I want you to be incredible at your job\""] },
      { title: "What I'm asking", lines: ["\"Help me understand what a chapter actually needs\"", "Which courses. What the experience should be for you as manager, and for your members"] },
      { title: "Why it lands", lines: ["Everyone knows how hard it is to pay attention to a long video", "A two-minute short that gets you extra points is different", "A real academic culture in the house, built for this generation"] },
    ],
    riff: ["This is the shorter cut of \"What Survive is\" — face to the name, quick and personal", "Ask a real question at the end; the chair should feel like a partner by the last second"],
  },
  {
    slug: "student-easy-points-is-free", lane: "students", priority: 7,
    title: "For students: Easy Points is free",
    hook: "Real points on your first exam, free. Then you decide.",
    slides: [
      { title: "Free, on every exam", lines: ["The Easy Points topic is free on every exam", "It delivers real points — and shows you what's behind the wall"] },
      { title: "Exam 1", lines: ["The rest of Exam 1 for your email", "Three reminders, timed to your exam date"] },
      { title: "Exams 2–4", lines: ["$50 for the rest of each exam"] },
    ],
    riff: ["Lead with the points, not the price", "Two minutes, one short, extra points — that's the whole promise"],
  },
  {
    slug: "ifc-whole-greek-system", lane: "chairs", priority: 8,
    title: "For IFC and councils: this is for your whole Greek system",
    hook: "Every chapter's members provisioned, one academic culture across the row.",
    slides: [
      { title: "At council scale", lines: ["Chapter members are provisioned with access", "The chair pitch, for every house at once"] },
      { title: "Where this is going", lines: ["200+ campuses with Greek systems, large and small", "Intro accounting is the way in, not the ceiling — ~6 courses by 2027"] },
    ],
    riff: ["The doc is thinnest here — this one is riff room. What does a council actually want to hear?", "Face to the name: the council should know who's behind it"],
  },

  // ---- Building Survive — bank, don't post yet (Feed the Machine)
  {
    slug: "build-solo-national-platform", lane: "building", priority: 9,
    title: "Building a national platform solo, with AI",
    hook: "One person, five steps, every short from talk to TikTok.",
    slides: [
      { title: "The chain", lines: ["1 · talk it through with the AI teaching assistant", "2 · the AI producer turns it into slides", "3 · teleprompter + script bank — randomized intros and outros, ad-libbed body", "4 · one take, minimal editing", "5 · Shorts, Reels, TikTok"] },
      { title: "Who it's for", lines: ["Hires, investors, the ENT course", "Not for students"] },
    ],
    riff: ["\"Big ideas guy who learned to build with AI\" — the most compelling story Survive has", "Show the desk: the dictation machine and the plaque"],
  },
  {
    slug: "build-no-code-claude-code", lane: "building", priority: 10,
    title: "No-code / Claude Code development",
    hook: "How the app gets built by someone who doesn't write code.",
    slides: [
      { title: "The loop", lines: ["Notice something while filming → say it → it lands in the bank", "The build machine drafts the prompt, Claude Code builds it, it deploys"] },
      { title: "The rule", lines: ["Ideas come from ten years of tutoring — the AI catches them, it doesn't generate them"] },
    ],
    riff: ["Pick one real feature and tell its story end to end", "What broke, what surprised you — the honest version"],
  },
  {
    slug: "build-distributed-team", lane: "building", priority: 11,
    title: "Hiring and managing a distributed team",
    hook: "Two hundred campuses, all remote, and an app that tells each rep where to act.",
    slides: [
      { title: "The shape", lines: ["Reps at 200+ campuses, all remote", "Selective on the way in; a referral program later for everyone else"] },
      { title: "The management", lines: ["The app surfaces the signal — 18 sign-ups from one house — and suggests what to say", "Reps get taught to sell; the role is an education with a commission attached"] },
    ],
    riff: ["Slater is the first rep and the MVP — how you'd manage one person is how you'll manage two hundred"],
  },
  {
    slug: "build-good-content-narrow-niche", lane: "building", priority: 12,
    title: "Making genuinely good content in a narrow niche",
    hook: "Intro accounting is the niche. Short-form is the format, not a channel.",
    slides: [
      { title: "The format", lines: ["Two-minute cram videos, not lectures", "Everything is built around short-form attention"] },
      { title: "The asset", lines: ["Ten years of practice exams — the shorts are how they get taught", "Deepen quality through spring 2027 before widening"] },
    ],
    riff: ["What \"good\" means when the viewer is panicking the night before", "Why narrow beats broad for the first two years"],
  },
  {
    slug: "build-why-intro-accounting-matters", lane: "building", priority: 13,
    title: "Why intro accounting matters more than people think",
    hook: "It's the course where college stops being fun — for a lot of people.",
    slides: [
      { title: "The stakes", lines: ["For many students the intro accounting exam is the hardest thing they've faced", "College is otherwise an incredible experience"] },
      { title: "The change", lines: ["Ten years of tutoring, 1,000+ students", "This can change how that goes for people"] },
    ],
    riff: ["Tell one student's story — no names needed", "Accounting is the way in, not the ceiling"],
  },

  // ---- Founder notes — the principles, said out loud (bank)
  {
    slug: "founder-use-your-words", lane: "founder", priority: 14,
    title: "Use Your Words",
    hook: "The best strategy in this business came from talking, not planning.",
    slides: [
      { title: "The principle", lines: ["Thinking out loud is the mechanism for surfacing ideas, not a supplement to it", "With the AI, with partners — brainstorming aloud"] },
      { title: "The artifact", lines: ["A vintage dictation machine on the desk", "A plaque: \"Use Your Words\""] },
    ],
    riff: ["Film it at the desk, with the machine in frame"],
  },
  {
    slug: "founder-human-first", lane: "founder", priority: 15,
    title: "Human First",
    hook: "The AI catches my ideas. It doesn't generate them.",
    slides: [
      { title: "The rule", lines: ["The AI's only license is a better phrasing of my idea for short-form", "The wisdom comes from ten years of tutoring"] },
      { title: "The roles", lines: ["AI as transcriber, editor, producer", "The teacher stays the teacher"] },
    ],
    riff: ["This is the counter-take to \"AI makes the content\" — say why the order matters"],
  },
  {
    slug: "founder-feed-the-machine", lane: "founder", priority: 16,
    title: "Feed the Machine",
    hook: "Strategy content is energizing. Accounting content is the business.",
    slides: [
      { title: "The rule", lines: ["No strategy short gets made until accounting shorts have shipped", "Dreaming is allowed — it doesn't come first"] },
    ],
    riff: ["This could be the first strategy short you actually post — it explains why the others waited"],
  },
  {
    slug: "founder-why-the-email-gate", lane: "founder", priority: 17,
    title: "Why the email gate is correct",
    hook: "The hoops filter for customers.",
    slides: [
      { title: "The logic", lines: ["If a student won't submit an email after real value, they were never going to convert", "Free Easy Points first — then the ask"] },
      { title: "The signal", lines: ["18 emails from one house is a direct signal to activate a rep", "Chapter-level email volume tells reps which chapters to pursue"] },
    ],
    riff: ["Founder audience, not students — this is the reasoning behind the wall"],
  },

  // ---- Later
  {
    slug: "later-professors-and-tutors", lane: "later", priority: 18,
    title: "Interviews and the tutor community",
    hook: "Not now. With national traction.",
    slides: [
      { title: "Interviews", lines: ["Dr. Davis (Ole Miss) first — the intro course Lee thrived in", "Dr. Wilder and Dr. Gentry on their programs and the future of higher ed"] },
      { title: "Community", lines: ["Tutors and teachers vibing about great teaching in the subjects students panic about most", "The human version of the AI teaching assistant"] },
      { title: "Also", lines: ["The FSI testimonial — exists, pull it out and use it"] },
    ],
    riff: ["Bank the idea, not the video"],
  },
];

export const seedShortId = (slug: string): string => `strategy-short-${slug}`;

// ---------------------------------------------------------------- idea helpers

export const isStrategyIdea = (i: Idea): boolean => i.context?.strategy === "1";
export const isShortIdea = (i: Idea): boolean => isStrategyIdea(i) && i.context?.short === "1";
export const isStrategyNote = (i: Idea): boolean => isStrategyIdea(i) && i.context?.short !== "1";

export const shortPriorityOf = (i: Idea): number => {
  const n = Number(i.context?.shortPriority);
  return Number.isFinite(n) && n > 0 ? n : 9999;
};

function parseJsonArray<T>(raw: string | undefined, guard: (x: unknown) => x is T): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter(guard) : [];
  } catch { return []; }
}
const isSlide = (x: unknown): x is ShortSlide =>
  !!x && typeof x === "object" && typeof (x as ShortSlide).title === "string" && Array.isArray((x as ShortSlide).lines);
const isString = (x: unknown): x is string => typeof x === "string";

/** A short's slides, from its idea. Empty when the short was captured loose (Ctrl+I). */
export const shortSlidesOf = (i: Idea): ShortSlide[] => parseJsonArray(i.context?.slides, isSlide);
export const shortRiffOf = (i: Idea): string[] => parseJsonArray(i.context?.riff, isString);

/** The body text for a seeded short — so the bank row and the Obsidian note read
 *  as prose without parsing JSON. */
export function shortBody(s: StrategyShortSeed): string {
  const slides = s.slides.map((sl) => `${sl.title}\n${sl.lines.map((l) => `  - ${l}`).join("\n")}`).join("\n\n");
  const riff = s.riff.length ? `\n\nRiff on:\n${s.riff.map((r) => `  - ${r}`).join("\n")}` : "";
  return `${s.hook}\n\n${slides}${riff}`;
}

/** The idea row a seed becomes. Categories: STRATEGY + the lane's home category. */
export function shortSeedToIdea(s: StrategyShortSeed, createdBy: string): Omit<Idea, "createdAt" | "updatedAt"> {
  const lane = shortLaneDef(s.lane)!;
  return {
    id: seedShortId(s.slug),
    title: s.title,
    body: shortBody(s),
    categories: ["STRATEGY", lane.category],
    subcategory: "Strategy short",
    status: "IDEA",
    sourcePath: "/admin/ideas/strategy",
    context: {
      title: "Strategy board",
      intent: "strategy",
      strategy: "1",
      short: "1",
      lane: s.lane,
      shortPriority: String(s.priority),
      hook: s.hook,
      slides: JSON.stringify(s.slides),
      riff: JSON.stringify(s.riff),
      seed: "2026-09",
      tldr: s.hook,
    },
    promptMd: null,
    promptFilename: null,
    createdBy,
    sourceKind: "web",
    attachments: [],
    audioPath: null,
    transcriptStatus: null,
  };
}
