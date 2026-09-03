// SITE QA — the page-template manifest. THE maintained source of truth for
// /admin/site-qa. Every user-facing and admin page template Lee cares about is
// listed here, mapped to the source files that make it up (for change detection)
// and to how its representative example URLs + live page counts are derived.
//
// IMPORTANT — keep this module dependency-free (no imports, no `@/` alias, no
// React). It is loaded THREE ways: (1) by the browser UI, (2) by server
// functions, and (3) at build time by the Vite change-detection plugin, which
// resolves it with esbuild before path aliases exist. A stray import breaks the
// build. Pure data only.
//
// New-template detection (spec §27): every file in src/routes is asserted by
// src/lib/site-qa/manifest.coverage.test.ts to be owned by exactly one template
// (`routes`) or listed in IGNORED_ROUTES. Add a page → the test fails until you
// register it here, so a new template can never silently exist untested.

export type TemplateCategory = "public" | "student" | "greek" | "partner" | "admin" | "legal";

/** How a template's live public-page count is derived. `static` = the fixed
 *  routes themselves; the rest are counted from the database at request time. */
export type CountKey =
  | "static"
  | "campus"
  | "greekChapter"
  | "council"
  | "nationalOrg"
  | "foundationsScenario";

export interface TemplateDef {
  id: string;
  label: string;
  category: TemplateCategory;
  /** One line, plain language. No dev jargon. */
  description: string;
  /** Human-readable URL pattern shown in the UI (not used for routing). */
  routePattern: string;
  /** Route FILE basenames (under src/routes/) this template OWNS. Used for the
   *  coverage test and folded into `files` for hashing. Unique across templates.
   *  May be empty for component-only templates (e.g. the shared player). */
  routes: string[];
  /** Extra source files/dirs (repo-relative) that materially define this
   *  template — shared components, server functions. Folded into the change
   *  hash. Directories are hashed recursively. Overlap between templates is OK. */
  extraFiles?: string[];
  /** How to count live public pages for this template. */
  countKey: CountKey;
  /** URL path prefixes this template serves, for PostHog traffic roll-ups and
   *  the All-pages classifier. First entry is treated as the canonical prefix. */
  trafficPaths: string[];
  /** True when this template participates in guided Test Mode. */
  testMode?: boolean;
  /** True for internal/admin templates (deprioritised, never public-indexed). */
  internal?: boolean;
}

export const TEMPLATES: TemplateDef[] = [
  // ── Public marketing / student-facing (highest traffic) ──────────────────
  {
    id: "homepage",
    label: "Homepage",
    category: "public",
    description: "The main landing page — centered hero and the two doors (solo / chapter).",
    routePattern: "/",
    routes: ["index.tsx", "landing.tsx"],
    extraFiles: [
      "src/components/landing",
      "src/components/site/Marketing.tsx",
      "src/components/site/SiteHeader.tsx",
      "src/components/site/SiteFooter.tsx",
      // Two-door homepage (08-27) — the composition "/" renders now, plus the org list that
      // drives its Greek ticker.
      "src/components/site/home-two-door",
      "src/components/site/portal-home",
    ],
    countKey: "static",
    trafficPaths: ["/"],
    testMode: true,
  },
  {
    id: "campus-page",
    label: "Campus Page",
    category: "public",
    description: "One SEO landing page per school, in that campus's colors and course code.",
    routePattern: "/:school",
    routes: ["$school.index.tsx"],
    extraFiles: [
      "src/lib/campus-page.functions.ts",
      "src/lib/schools.ts",
      "src/lib/schools.generated.ts",
    ],
    countKey: "campus",
    trafficPaths: ["/:school"],
    testMode: true,
  },
  {
    id: "student-player",
    label: "Student Player",
    category: "student",
    description:
      "The interactive exam-prep player students study in (embedded on home, campus and chapter pages).",
    routePattern: "player (embedded)",
    routes: [],
    extraFiles: [
      "src/routes/landing.tsx",
      "src/components/site/PracticeStage.tsx",
      "src/components/site/StagePills.tsx",
      "src/lib/set-flow.ts",
      "src/lib/practice.functions.ts",
    ],
    countKey: "campus",
    trafficPaths: [],
    testMode: true,
  },
  {
    id: "learn-shell",
    label: "Learn Shell",
    category: "student",
    description: "The signed-in student home — course, topic and video outline.",
    routePattern: "/learn",
    routes: ["learn.tsx"],
    countKey: "static",
    trafficPaths: ["/learn"],
    testMode: true,
  },
  {
    id: "study-je",
    label: "Journal Entry Practice",
    category: "student",
    description: "Free interactive journal-entry practice, plus one page per public scenario.",
    routePattern: "/study",
    routes: ["study.tsx", "study_.foundations.tsx", "study_.scenarios.$slug.tsx"],
    extraFiles: ["src/lib/je.functions.ts"],
    countKey: "foundationsScenario",
    trafficPaths: ["/study"],
  },
  {
    id: "rep-page",
    label: "Campus Rep Page",
    category: "public",
    description: '"Be the rep at your school" recruitment page (generic and per-campus).',
    routePattern: "/rep · /:school/rep",
    routes: ["rep.tsx", "$school.rep.tsx"],
    extraFiles: ["src/components/site/RepInterest.tsx", "src/lib/campus-rep.functions.ts"],
    countKey: "campus",
    trafficPaths: ["/rep", "/:school/rep"],
  },
  {
    id: "rep-portal",
    label: "Rep Portal",
    category: "public",
    description: "Campus-rep self-serve: sign up for a tracked link, and the token dashboard with earnings + payouts.",
    routePattern: "/rep/join · /rep/dashboard",
    routes: ["rep_.join.tsx", "rep_.dashboard.tsx"],
    extraFiles: ["src/lib/rep-portal.ts", "src/lib/rep-portal.functions.ts"],
    countKey: "static",
    trafficPaths: ["/rep/join", "/rep/dashboard"],
  },
  {
    id: "prof-campus-landing",
    label: "Professor Share Page",
    category: "public",
    description: "The campus landing professors share, personalized by a per-prof token.",
    routePattern: "/outreach/school/:slug",
    routes: ["outreach_.school.$slug.tsx"],
    countKey: "campus",
    trafficPaths: ["/outreach/school/"],
  },
  {
    id: "order-intake",
    label: "Request a Video (closed)",
    category: "public",
    // Made-to-order is CLOSED (2026-08-30): /order redirects home and submitOrder refuses, so no
    // new orders can be created. /start (syllabus-first tutoring request) is separate and still
    // live. The status tracker stays reachable for the one historical order.
    description: "Closed — made-to-order requests are no longer accepted. /start (tutoring request) is still live; the order tracker remains for existing orders.",
    routePattern: "/order (closed) · /start",
    routes: ["order.tsx", "start.tsx", "order.$shortRef.tsx"],
    extraFiles: ["src/lib/orders.functions.ts", "src/lib/order-tracker.functions.ts"],
    countKey: "static",
    trafficPaths: ["/order", "/start"],
    testMode: true,
  },
  {
    id: "onboarding",
    label: "Onboarding Wizard",
    category: "public",
    description: "The shared web + SMS onboarding / tutoring-request flow.",
    routePattern: "/onboard · /o/:shortRef",
    routes: ["onboard.tsx", "o.$shortRef.tsx", "t.$slug.tsx"],
    extraFiles: ["src/lib/onboarding.functions.ts"],
    countKey: "static",
    trafficPaths: ["/o/", "/onboard"],
  },
  {
    id: "waitlist-signup",
    label: "Waitlist & Signup",
    category: "public",
    description: "Waitlist, welcome, preview and referral pages.",
    routePattern: "/waitlist · /welcome · /expand …",
    routes: [
      "waitlist.tsx",
      "thankyou.tsx",
      "welcome.tsx",
      "preview.tsx",
      "beyond.tsx",
      "expand.tsx",
    ],
    countKey: "static",
    trafficPaths: ["/waitlist", "/thankyou", "/welcome", "/preview", "/beyond", "/expand"],
  },

  // ── Greek ─────────────────────────────────────────────────────────────────
  {
    id: "greek-chapter-page",
    label: "Greek Chapter Page",
    category: "greek",
    description: "The public page for one fraternity/sorority chapter at one campus.",
    routePattern: "/go/:school/:chapter",
    routes: ["go.$school.$chapter.tsx"],
    extraFiles: [
      "src/lib/greek-go.functions.ts",
      "src/lib/greek-slug.ts",
      "src/components/site/ChapterGate.tsx",
      "src/components/site/ChapterStickyCta.tsx",
    ],
    countKey: "greekChapter",
    trafficPaths: ["/go/:school/:chapter"],
    testMode: true,
  },
  {
    id: "chapter-claim",
    label: "Chapter Claim",
    category: "greek",
    description: "The flow an exec uses to claim their chapter and unlock the dashboard.",
    routePattern: "claim (embedded on chapter pages)",
    routes: [],
    extraFiles: [
      "src/components/site/ChapterAccess.tsx",
      "src/components/site/ChapterAccessForm.tsx",
      "src/components/site/ChapterSelfCreate.tsx",
      "src/lib/greek-claims.functions.ts",
    ],
    countKey: "greekChapter",
    trafficPaths: [],
    testMode: true,
  },
  {
    id: "chapter-finder",
    label: "Chapter Finder",
    category: "greek",
    description: 'The "find your chapter" portal and per-school chapter index.',
    routePattern: "/chapters · /go/:school",
    routes: ["chapters.tsx", "go.$school.index.tsx"],
    extraFiles: ["src/components/site/ChapterFinder.tsx"],
    countKey: "campus",
    trafficPaths: ["/chapters", "/go/:school"],
  },
  {
    id: "chapter-dashboard",
    label: "Chapter Dashboard",
    category: "greek",
    description: "The private exec dashboard for a claimed chapter.",
    routePattern: "/chapters/dashboard",
    routes: ["chapters_.dashboard.tsx"],
    countKey: "static",
    trafficPaths: ["/chapters/dashboard"],
  },
  {
    id: "chapter-kit",
    label: "Chapter Share Kit",
    category: "greek",
    description: "Copy / QR / flyer assets an exec shares with their chapter.",
    routePattern: "/chapters/kit/:school/:chapter",
    routes: ["chapters_.kit.$school.$chapter.tsx"],
    extraFiles: ["src/components/site/ChapterShare.tsx"],
    countKey: "greekChapter",
    trafficPaths: ["/chapters/kit/"],
  },
  {
    id: "council-private-page",
    label: "Council Page (private)",
    category: "greek",
    description: "The private, forwardable council page a chair opens via a token.",
    routePattern: "/go/:school/council/:council",
    routes: ["go.$school.council.$council.tsx"],
    extraFiles: [
      "src/lib/greek-councils.functions.ts",
      "src/components/site/CouncilForwardKit.tsx",
    ],
    countKey: "council",
    trafficPaths: ["/go/:school/council/"],
  },

  // ── Partner (councils & national orgs) ──────────────────────────────────────
  {
    id: "council-partner-page",
    label: "Council Partner Page",
    category: "partner",
    description: "The forward-kit page for a campus council partnership.",
    routePattern: "/partners/council/:school/:council",
    routes: ["partners.council.$school.$council.tsx"],
    extraFiles: [
      "src/components/site/PartnerPage.tsx",
      "src/components/site/PartnerKit.tsx",
      "src/lib/partners.functions.ts",
      "src/lib/partners.ts",
    ],
    countKey: "council",
    trafficPaths: ["/partners/council/"],
  },
  {
    id: "national-org-page",
    label: "National Organization Page",
    category: "partner",
    description: "The partner page for a national fraternity/sorority across its campuses.",
    routePattern: "/partners/national/:org",
    routes: ["partners.national.$org.tsx"],
    extraFiles: ["src/lib/partners.functions.ts", "src/lib/partners.ts"],
    countKey: "nationalOrg",
    trafficPaths: ["/partners/national/"],
  },
  {
    id: "partner-marketing",
    label: "Partner Marketing",
    category: "partner",
    description: 'The "for councils" and "for national organizations" pitch pages.',
    routePattern: "/partners/campus-councils …",
    routes: ["partners.campus-councils.tsx", "partners.national-organizations.tsx"],
    countKey: "static",
    trafficPaths: ["/partners/campus-councils", "/partners/national-organizations"],
  },

  // ── Internal / admin ────────────────────────────────────────────────────────
  {
    id: "site-qa",
    label: "Site QA Cockpit",
    category: "admin",
    description: "This page — the internal QA cockpit.",
    routePattern: "/admin/site-qa",
    routes: ["admin.site-qa.tsx"],
    extraFiles: ["src/lib/site-qa"],
    countKey: "static",
    trafficPaths: ["/admin/site-qa"],
    internal: true,
  },
  {
    id: "outreach-console",
    label: "Outreach Console",
    category: "admin",
    description: "The internal outreach dashboard — campuses, reps, students, orders, comms.",
    routePattern: "/outreach",
    routes: [
      "outreach.tsx",
      "outreach.index.tsx",
      "outreach.campuses.tsx",
      "outreach.reps.tsx",
      "outreach.students.tsx",
      "outreach.orders.tsx",
      "outreach.demand.tsx",
      "outreach.comms.tsx",
      "outreach.reddit.tsx",
      "outreach.parent-groups.tsx",
      "outreach.practice.tsx",
      "outreach.landing.tsx",
      "outreach.backups.tsx",
      "outreach.video-archive.tsx",
      "outreach.campaign-metrics.tsx",
      "outreach.campaign-targets.tsx",
      "outreach.active-roster.tsx",
      "outreach.course-intel.tsx",
    ],
    countKey: "static",
    trafficPaths: ["/outreach"],
    internal: true,
  },
  {
    id: "greekintel-admin",
    label: "GreekIntel Admin",
    category: "admin",
    description: "The internal Greek data console — orgs, chapters, councils, claims.",
    routePattern: "/outreach/greek-orgs …",
    routes: [
      "outreach.greek-orgs.tsx",
      "outreach.greek-orgs_.queue.tsx",
      "outreach.greek-orgs_.people-queue.tsx",
      "outreach.greek-orgs_.vendor-queue.tsx",
      "outreach.chapters.tsx",
      "outreach.councils.tsx",
      "outreach.greek-claims.tsx",
    ],
    countKey: "static",
    trafficPaths: [
      "/outreach/greek-orgs",
      "/outreach/chapters",
      "/outreach/councils",
      "/outreach/greek-claims",
    ],
    internal: true,
  },
  {
    id: "profintel-admin",
    label: "ProfIntel Admin",
    category: "admin",
    description: "The internal professor-targeting console — lead finder, research, scheduling.",
    routePattern: "/outreach/profintel …",
    routes: [
      "outreach.profintel.tsx",
      "outreach.profintel-schedule.tsx",
      "outreach.profintel-metrics.tsx",
      "outreach.leadfinder.index.tsx",
      "outreach.leadfinder.$campusId.tsx",
      "outreach.leadfinder-batch.tsx",
      "outreach.leadfinder-leaderboard.tsx",
      "outreach.research.tsx",
    ],
    countKey: "static",
    trafficPaths: ["/outreach/profintel", "/outreach/leadfinder", "/outreach/research"],
    internal: true,
  },
  {
    id: "ceq-studio",
    label: "CEQ Studio",
    category: "admin",
    description: "The internal content-authoring studio for exam questions and lessons.",
    routePattern: "/ceq",
    routes: [
      "ceq.tsx",
      "ceq.create.tsx",
      "ceq.$id.edit.tsx",
      "ceq.$id.tutor.tsx",
      "ceq.$courseSlug.$chapterSlug.tsx",
    ],
    countKey: "static",
    trafficPaths: ["/ceq"],
    internal: true,
  },
  {
    id: "growth-admin",
    label: "Growth Admin",
    category: "admin",
    description: "The internal growth workspace — campuses, chapters, councils, orgs, contacts, outreach.",
    routePattern: "/admin/growth …",
    routes: [
      "admin.growth.tsx",
      "admin.growth.index.tsx",
      "admin.growth.campuses.tsx",
      "admin.growth.chapters.tsx",
      "admin.growth.councils.tsx",
      "admin.growth.orgs.tsx",
      "admin.growth.contacts.tsx",
      "admin.growth.results.tsx",
      "admin.growth.activity.tsx",
      "admin.growth.king.tsx",
      "admin.growth.coldoutreach.tsx",
      "admin.growth.coldoutreach.index.tsx",
      "admin.growth.coldoutreach.schedule.tsx",
      "admin.growth.coldoutreach.activity.tsx",
      "admin.growth.coldoutreach.feedback.tsx",
      "admin.growth.coldoutreach.team.tsx",
      "admin.growth.coldoutreach.engaged.tsx",
      "va.$token.tsx",
      "admin.growth.campaigns.tsx",
      "admin.growth.greek.tsx",
      "admin.growth.prebuild.tsx",
      "admin.growth.intelligence.tsx",
    ],
    countKey: "static",
    trafficPaths: ["/admin/growth"],
    internal: true,
  },
  {
    id: "referral-admin",
    label: "Referral Admin",
    category: "admin",
    description: "The internal referral / attribution console — partners, links, conversions, commissions.",
    routePattern: "/admin/reps …",
    routes: [
      "admin.reps.tsx",
      "admin.reps.index.tsx",
      "admin.reps.partners.tsx",
      "admin.reps.links.tsx",
      "admin.reps.conversions.tsx",
      "admin.reps.roster.tsx",
      "admin.reps.view.$partnerId.tsx",
    ],
    countKey: "static",
    trafficPaths: ["/admin/reps"],
    internal: true,
  },

  // ── Legal / account ─────────────────────────────────────────────────────────
  {
    id: "email-prefs",
    label: "Email Preferences",
    category: "legal",
    description: "Unsubscribe and email-preference pages (token-driven).",
    routePattern: "/u/:token",
    routes: ["u.$token.tsx", "u.index.tsx"],
    countKey: "static",
    trafficPaths: ["/u/"],
  },
  {
    id: "legal",
    label: "Legal",
    category: "legal",
    description: "Terms of Service and Privacy Policy.",
    routePattern: "/terms · /privacy",
    routes: ["terms.tsx", "privacy.tsx"],
    countKey: "static",
    trafficPaths: ["/terms", "/privacy"],
  },
];

/** Route files that are intentionally NOT QA templates, each with a reason. The
 *  coverage test consults this so a genuinely-excluded route doesn't fail the
 *  build, while a NEW page (absent from both TEMPLATES and here) does. */
export const IGNORED_ROUTES: Record<string, string> = {
  "README.md": "docs",
  "__root.tsx": "root layout, not a page",
  // Pure redirects / short links (render nothing of their own)
  "r.$code.tsx": "referral short link → 302 to the destination, no page of its own",
  "greek.tsx": "redirect → /chapters",
  "je.tsx": "redirect → /study",
  "je.$.tsx": "redirect → /study",
  "c.$slug.tsx": "legacy redirect → /go/…",
  // Internal dev labs (noindex, not user-facing)
  "callout-demo.tsx": "dev lab (noindex)",
  "admin.ideas.tsx": "internal (noindex) — Ideas to Save prompt vault",
  "api.ideas.sms.tsx": "webhook — Twilio inbound SMS to the idea vault (allowlisted senders only)",
  "api.ideas.email.tsx": "webhook — inbound email to the idea vault (allowlisted senders only)",
  "blast-off.tsx": "filming room (noindex) — vertical Blast Off edit + capture",
  "blastoff-demo.tsx": "dev lab (noindex) — vertical Blast Off frame previews",
  "exhibit-demo.tsx": "dev lab (noindex)",
  "exhibit-lab.tsx": "dev lab (noindex)",
  "practice-demo.tsx": "dev lab (noindex) — shared PracticeStage QA mount",
  "api.practice-pack.tsx": "server endpoint (PDF lead magnet), no page",
  "talkthrough.tsx": "studio tool — Talkthrough Booth (AdminGate, noindex)",
  "intro-outro.tsx": "dev lab (noindex)",
  "logo-lab.tsx": "dev lab (noindex)",
  "lab.bolt.tsx": "dev lab (noindex)",
  "lab.brand.tsx": "dev lab (noindex) — brand animation tuning desk",
  "leeportal.tsx": "Lee's private nav portal (AdminGate, noindex, unlinked)",
  "study_.canvas.tsx": "internal authoring lab (noindex)",
  "study_.dashboard.tsx": "prototype (noindex)",
  // Two-portal home experiment (08-26). Register go.demo as a real template if it graduates
  // from sales asset to permanent surface.
  "preview_.home.tsx": "preview homepage — the live two-door page with its solo door routed into Player V2 (noindex)",
  "preview_.exam1.tsx": "private Player V2 'Tonight's Plan' beta (noindex, unlinked from public nav)",
  "preview_.studentplayerv1.tsx": "the V1 student player on its own, kept reachable for comparison against future players (noindex; the real archive is the git tag player-v1-2026-08-29)",
  "the-campaign.tsx": "Lee's private campaign page for his personal network — video, 15-slide deck, referral form (noindex+nofollow, shared by email, linked from nowhere)",
  "s.$campus.index.tsx": "DM destination — one screen, pick your chapter (noindex)",
  "s.$campus.$chapter.tsx": "chapter share screen — link + ready-to-paste GroupMe message (noindex)",
  "s.$campus.council.tsx": "council share screen — one message with every chapter link (noindex)",
  "admin.growth.coldoutreach.engaged.tsx": "Engaged contacts — who actually moved: replies, ref clicks, forwards (admin, noindex)",
  "admin.growth.coldoutreach.feedback.tsx": "Enrichment feedback — the running list of 'what would make this faster next time?' notes (admin, noindex)",
  "va.$token.tsx": "VA enrichment mode — stripped, passcode-free per-VA link: one campus at a time, add contacts, help bolt (noindex)",
  "admin.growth.coldoutreach.team.tsx": "VA team — Lee's Payments table (READY campuses + personal IGs → pay) and the roster: add a VA, copy their link, set rates (admin, noindex)",
  "preview_.templates.tsx": "the template test harness — every reusable template with a known-good sample and its checklist (noindex)",
  "offer.mckenzie.tsx": "Lee's private job offer to Mckenzie — password-gated, noindex+nofollow, linked from nowhere",
  "go.demo.tsx": "demo chapter page — outreach sales asset (noindex)",
  "go.demo.demo.tsx": "redirect → /go/demo",
  // API / cron / webhook endpoints — not pages
  "api.backfill.tsx": "token-gated backfill orchestrator endpoint",
  "api.cron.backup.tsx": "cron endpoint",
  "api.cron.king-digest.tsx": "cron endpoint",
  "api.cron.growth-campaigns.tsx": "cron endpoint",
  "api.cron.comms-sequences.tsx": "cron endpoint",
  "api.cron.weekly-digest.tsx": "cron endpoint",
  "api.flyer.$school.$chapter.tsx": "generated image endpoint",
  "api.partner-kit.$school.$council.tsx": "generated ZIP endpoint (council partner kit)",
  "api.cron.chapter-reports.tsx": "cron endpoint (chapter signup reports)",
  "api.og.$school.$chapter.tsx": "generated image endpoint",
  "api.stripe.webhook.tsx": "webhook endpoint",
  "x.$ref.tsx": "Lee's action card for one #ref (AdminGate + admin session, noindex; linked only from founder alerts)",
  "api.voice.inbound.tsx": "webhook — Twilio Voice URL for the main line (signature-verified)",
  "api.voice.recorded.tsx": "webhook — Twilio <Record> action (signature-verified)",
  "api.voice.transcript.tsx": "webhook — Twilio transcription callback (signature-verified)",
  "api.voice.dial-through.tsx": "webhook — Twilio <Gather> action for Lee's dial-through (signature-verified)",
  "api.voice.bridge.tsx": "webhook — TwiML for the bridge call Lee starts from /x/ (signature-verified)",
  "api.voice.softphone.tsx": "webhook — TwiML App Voice URL for the browser softphone (signature-verified)",
  "api.voice.recording.$sid.tsx": "admin-gated audio proxy for voicemail playback",
};

export const TEMPLATES_BY_ID: Record<string, TemplateDef> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);

/** All source files (repo-relative) that define a template — its owned route
 *  files plus any extraFiles. Used by the change-detection hasher. */
export function templateSourceFiles(t: TemplateDef): string[] {
  const files = t.routes.map((r) => `src/routes/${r}`);
  for (const f of t.extraFiles ?? []) files.push(f);
  return files;
}
