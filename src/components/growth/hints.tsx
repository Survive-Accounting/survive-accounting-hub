// HINTS — the dashboard explains itself.
//
// King did not sit through the research sessions, and neither will the next person. Every
// number, badge and column on this dashboard carries a definition from this file, so nobody
// has to guess what "VERIFY" or "Course ready 79%" means or go asking.
//
// Rules for writing one: say what the thing IS, where it CAME FROM, and what to DO about it.
// Plain words. No jargon that isn't defined right there.
import type { ReactNode } from "react";

export const HINTS = {
  /* ── ranking ─────────────────────────────────────────────────────────────────────────── */
  rank: "Where this campus sits in the Fall 2026 priority order. Computed from market size, how well we can reach it, whether people already pay for help there, and how ready our course content is. Same inputs every time — no AI guessing.",
  pin: "Pin this campus to the top of the list. The computed rank stays underneath; pinning only changes what you see first.",
  why: {
    "Large market":
      "This school graduates a lot of business majors, so the intro accounting class is big.",
    "Sizeable market":
      "A solid number of business graduates — not the biggest, still worth working.",
    "Proven paid market":
      "Someone already sells paid help for this exact course here. That means students at this school are used to paying for it.",
    "Strong Greek reach":
      "We have lots of usable ways into this campus — council emails, chapter contacts, Instagram handles.",
    "Course-ready": "We know the course code, have professor evidence, and know what's on Exam 1.",
    "Fast-growing": "The business school here has been growing over the last five years.",
    "Live demand":
      "Real students from this campus have already used Survive. This outranks everything modelled.",
    "White space": "Nobody is selling course-specific help here yet — first-mover lane.",
  } as Record<string, string>,

  /* ── readiness ───────────────────────────────────────────────────────────────────────── */
  courseReadiness:
    "How much we know about teaching this course here: the course code (25%), confirmed Intro-1 professors (25%), what's on Exam 1 (20%), the textbook (15%), syllabi found (10%), and an approved campus map (5%). It's about our RESEARCH, not whether the campus is worth working.",
  checklist:
    "Every item is worked out from real data — nothing here is a manual checkbox. If something is unticked, the underlying fact is genuinely missing.",
  examStatus: (topics: number, covered: number, level: string): string =>
    topics === 0
      ? `No topics are mapped to this exam yet, so we can't say it's sellable. (Currently using the ${level} map.)`
      : `${covered} of ${topics} topics on this exam have content built. READY means every mapped topic has videos or questions. (Using the ${level} map.)`,
  estimatedWindow:
    "We have not confirmed this term's exam date. Most dates we scraped are from past semesters, so showing a countdown would be a guess. Roughly, Exam 1 lands around week 5–6.",

  /* ── first-party numbers ─────────────────────────────────────────────────────────────── */
  questionsAnswered:
    "Practice questions answered by students at this campus. Click to see when each one happened. Test data is excluded.",
  identified:
    "Students we can actually name — they signed in or claimed a seat. Anonymous practice doesn't count here.",
  waitlist: "People who asked to be notified. Click to see who and when.",
  paid: "Students with a paid entitlement — an exam purchase or a chapter seat.",

  /* ── market ──────────────────────────────────────────────────────────────────────────── */
  market:
    "Where this campus sits as a business opportunity. Everything here comes from federal IPEDS data plus our competitor research — it's context, not a to-do.",
  businessGrads:
    "Business bachelor's degrees awarded per year (IPEDS 2024). This is our best measure of how big the intro accounting class is.",
  estIntro1:
    "An ESTIMATE of intro-accounting seats per year: business graduates × 2.4. It's a rule of thumb, not a measured enrollment number.",
  growthLabel: (label: string): string => {
    const l = label.toUpperCase();
    if (l.includes("RAPID"))
      return "Business degrees here grew fast over the last 5 years — the class is getting bigger.";
    if (l.includes("GROWING"))
      return "Business degrees here have been rising over the last 5 years.";
    if (l.includes("STABLE"))
      return "Business degrees here have held roughly steady over the last 5 years — no real growth or decline.";
    if (l.includes("DECLIN"))
      return "Business degrees here have been falling over the last 5 years. Still worth working if the market is big.";
    return "Not enough years of data to call a trend.";
  },
  paidMarket:
    "Whether students here already pay somebody for study help. STRONG is good news — it proves willingness to pay. We never rank a campus DOWN for having competitors.",
  courseSpecific:
    "Competitors built specifically for this course code (like ac210ua.com at Alabama). The strongest possible proof this exact product sells here.",
  marketStatus:
    "CROWDED means competitors are already here — proven demand. WHITE SPACE means nobody is, which is a first-mover lane. Neither is bad.",

  /* ── professors ──────────────────────────────────────────────────────────────────────── */
  professors:
    "Only professors we found real Intro-1 evidence for — not everyone scraped from the faculty directory. The raw directory count is unreliable (it picks up the whole business school), so we don't use it.",
  evidenceState: (state: string | null): string => {
    if (state === "CONFIRMED_INTRO1")
      return "A document we found names this person teaching Intro-1. The strongest evidence we have.";
    if (state === "LIKELY_INTRO1")
      return "Good signals they teach Intro-1, but no single document nails it down.";
    if (state === "POSSIBLE_INTRO1") return "Weak signals only. Treat as a lead, not a fact.";
    return "In the accounting department, but we have no evidence they teach Intro-1.";
  },

  /* ── chapters ────────────────────────────────────────────────────────────────────────── */
  organizations:
    "Social fraternities and sororities at this campus. Professional and honor societies are filtered out — they're a different audience.",
  members:
    "Chapter size from the university's own public Greek report. Bigger chapter = more students in the class.",
  has990:
    "This chapter has a linked nonprofit (house corporation or foundation) that files a 990. Background context only — never a first contact.",
  gpa: "The chapter's GPA from the university's public Greek report. We show it as context for a conversation. We deliberately never rank or target chapters by GPA.",

  /* ── outreach ────────────────────────────────────────────────────────────────────────── */
  contactClass: {
    CURRENT_HIGH:
      "A durable, high-confidence address — a role inbox or an official page. Safe to email.",
    USABLE: "A real address we're reasonably confident in. Worth using, glance at it first.",
    VERIFY:
      "A named person with no proof they still hold the role. Officers turn over every year, so check before writing to them as if they're current. Editing it marks it verified.",
    SOCIAL: "Instagram only — no email. Reach out by DM and log it here.",
    ADVISORY:
      "A staff/faculty advisor. Held back on purpose: these are for escalation once students are already interested, never a first touch.",
  } as Record<string, string>,
  noAutoPick:
    "None of this organization's contacts can be auto-selected — they're either Instagram-only, an advisor, or a named officer we haven't verified. Pick one by hand, or add a better contact.",
  buildQueue:
    "Writes a draft email for each selected contact and holds it for review. Nothing sends at this point.",
  sendApproved:
    "Sends only the emails you explicitly approved. This is the one action that actually mails anyone.",
  emailsSentToday:
    "Emails the mail provider accepted today. Manually logged notes don't count — only a real send with a provider receipt.",
  addContact:
    "Found a contact the scraper missed? Add it here and it's immediately usable for outreach, tagged with your name and where you found it.",
  extractUrl:
    "Paste the page where you found a contact (an org directory, a chapter page) and we'll read that ONE page and pull out any emails and Instagram handles. Nothing is saved until you pick.",
  sourceLink: "Open the page this contact was found on, so you can check it's still right.",

  /* ── enrichment ──────────────────────────────────────────────────────────────────────── */
  enrichment:
    "What research we have for this campus and what's missing. Run buttons fetch only the missing piece, only for this campus.",
  enrichCost:
    "An estimate based on published list prices for SerpAPI, Firecrawl and Gemini — not a metered bill. Actual cost varies with how much the page fetch needs.",
  enrichState: {
    COMPLETE: "We have this.",
    PARTIAL: "We have some of it, but not the strong version.",
    MISSING: "We have nothing. This is what Run will go find.",
    NEEDS_REVIEW: "We have data but something looks wrong with it — check before trusting it.",
  } as Record<string, string>,

  /* ── topic map ───────────────────────────────────────────────────────────────────────── */
  topicMap:
    "Which Survive topics a student at this campus sees for each exam. A professor's own map wins; then the campus map; then the Global Starter Map everyone gets by default.",
  starterMap:
    "The default map every campus gets until we approve one specific to this school. It's a solid default, not a failure state.",
  suggestedMap:
    "Built from the syllabus and schedule documents we found here. It's a PROPOSAL — no student sees it until you approve it.",
  topicSets:
    "The actual sets a student would get for this topic — click to see the videos and question counts behind the name.",
  approveMap:
    "Makes this the live map for every student at this campus. Runs as one transaction and records who approved it.",
} as const;

/** Small helper so a hint can be dropped in as a node. */
export const hint = (text: ReactNode): ReactNode => text;
