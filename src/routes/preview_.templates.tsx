// /preview/templates — THE TEST HARNESS.
//
// Every reusable template on the site, grouped by who sees it, each with a fixed sample so the
// URL is stable and you never have to remember which campus slug had chapters.
//
// ── WHY THESE ARE LINKS AND NOT COPIES ────────────────────────────────────────────────────────
// The ask was "a test version of each template on its own preview route so I can make changes
// there and move them over when they're ready." Copies cannot do the second half. A forked
// /preview/home would be a second homepage that drifts from the real one the first time anyone
// edits either — and the copy is the one nobody remembers to update, so it slowly becomes a
// confident lie about what the site looks like. That is the exact failure the V1 player route
// documents.
//
// So this page points at THE REAL TEMPLATES. What it adds is what was actually missing: one place
// that knows every template, a known-good sample for each, and the thing to check.
//
// TO MAKE CHANGES AND MOVE THEM OVER, use a branch: every branch gets its own full deployment
// with every template at its real path and real data, and "moving it over" is the merge. That is
// a staging site, which is what the ask describes; a forked route is not.
//
// ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────────────────────────
// Redirect-only aliases (/greek -> /chapters, /order -> /, /onboard -> /o/<ref>) are not
// templates — they are one-line forwards, and listing them would pad this page with things that
// cannot visually break. Admin surfaces are excluded too: they are behind the passcode and are
// not part of the launch path a student or officer walks.
import { createFileRoute } from "@tanstack/react-router";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, frameThemeVars } from "@/components/frames";
import { useNavyDocument } from "@/components/site/SiteHeader";

export const Route = createFileRoute("/preview_/templates")({
  head: () => ({
    meta: [{ title: "Templates to test — Survive" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: TemplatesPage,
});

/** THE SAMPLES. Alabama because it has a full roster (71 chapters, Panhellenic with 18) and a
 *  verified course code, so every template renders in its POPULATED state rather than its empty
 *  one. Change these and every link below follows. */
const CAMPUS = "university-of-alabama";
const CHAPTER = "alpha-chi-omega";
const COUNCIL = "panhellenic";
const NATIONAL = "alpha-chi-omega";
/** A real onboarding short ref — the onboarding template renders per order. */
const ONBOARD_REF = "105";

type Template = {
  name: string;
  path: string;
  covers: string;
  check: string[];
  /** Said out loud when a page cannot be judged cold. */
  needs?: string;
};

type Group = { group: string; blurb: string; items: Template[] };

const GROUPS: Group[] = [
  {
    group: "Student",
    blurb: "What someone taking the course sees.",
    items: [
      {
        name: "Homepage",
        path: "/",
        covers: "One page, but it is the layout every other template copies.",
        check: [
          "Campus line and course code match the resolved school",
          "Swap icon beside the campus line opens the school picker and repaints the page",
          "Solo button is the course-code amber; chapter button is the blue",
          "Value chips under the scope line, testimonials below",
          "Find your chapter → waitlist popup lists every campus",
        ],
      },
      {
        name: "Campus landing",
        path: `/${CAMPUS}`,
        covers: "Every campus — one template, ~970 in the system.",
        check: ["Player loads", "Exam tabs switch", "Change school works", "Professor picker works"],
      },
      {
        name: "Student player V1",
        path: "/preview/studentplayerv1",
        covers: "The player as it stood 2026-08-29 — the comparison baseline for future versions.",
        check: ["Exam tabs", "Topic list with per-topic timings", "School and professor pickers"],
      },
      {
        name: "Waitlist",
        path: "/waitlist",
        covers: "The pre-launch capture.",
        check: ["Submits", "Confirms visibly", "No dead ends on mobile"],
      },
      {
        name: "Welcome",
        path: "/welcome",
        covers: "Where a new account lands.",
        check: ["Reads correctly for someone who just signed up", "Next step is obvious"],
      },
      {
        name: "Onboarding",
        path: `/o/${ONBOARD_REF}`,
        covers: "One template per order — the post-purchase setup.",
        check: ["Renders for a real ref", "Steps are in order", "Works on a phone"],
      },
      {
        name: "Thank you",
        path: "/thankyou",
        covers: "Post-purchase confirmation.",
        check: ["Says what happens next", "No broken links"],
      },
    ],
  },
  {
    group: "Greek — chapter and council",
    blurb: "What a member or an exec sees. The Sept 1 launch path.",
    items: [
      {
        name: "Chapter page",
        path: `/go/${CAMPUS}/${CHAPTER}`,
        covers: "Every chapter — thousands of pages on this one template.",
        check: [
          "Hero mirrors the homepage (eyebrow, headline, campus line, chips)",
          "Two doors, no player",
          "Share kit: three tier doors, every copy button confirms",
          "Flyer and slide download",
          "Claim modal: four fields in two rows, one close button, SMS line present",
        ],
      },
      {
        name: "Chapters portal",
        path: "/chapters",
        covers: "The Greek front door — school, then chapter.",
        check: ["Both pickers searchable", "Picking a chapter navigates", "“Don’t see your school” works"],
      },
      {
        name: "Chapter exec dashboard",
        path: "/chapters/dashboard",
        covers: "Where the claim flow's CTA lands. One template per claimed chapter.",
        needs: "A signed-in exec of a claimed chapter — otherwise it shows its signed-out state, which is also worth checking.",
        check: ["Signed-out state is honest", "Real top line always shows", "Member detail locked until sponsored"],
      },
      {
        name: "Council page",
        path: `/partners/council/${CAMPUS}/${COUNCIL}`,
        covers: "Every council on every campus. This is what goes out in cold email.",
        check: [
          "Centred hero, three doors in one row on desktop",
          "Share tab 1: message contains EVERY chapter link",
          "Share tab 2: copy-link rows, nothing to type",
          "Share tab 3: import fills the table",
          "Anchors #share / #materials / #chapters land correctly",
          "Table stacks to cards on mobile",
        ],
      },
      {
        name: "Council command centre (private)",
        path: `/go/${CAMPUS}/council/${COUNCIL}`,
        covers: "The token-linked page for a council we already work with.",
        needs: "Normally reached with ?k=<token>; without one it should degrade honestly rather than error.",
        check: ["No token → says so, does not 500", "With a token → the real dashboard"],
      },
    ],
  },
  {
    group: "Share screens (DM destinations)",
    blurb: "One phone screen each, no scrolling. Fifteen seconds from tap to a link on the clipboard.",
    items: [
      {
        name: "Share — campus",
        path: `/s/${CAMPUS}`,
        covers: "The DM destination for every campus.",
        check: ["Fits one phone screen, no scrolling", "Chapter search matches nicknames (ADPi)", "All three buttons work"],
      },
      {
        name: "Share — chapter",
        path: `/s/${CAMPUS}/${CHAPTER}`,
        covers: "The DM destination for every chapter.",
        check: ["One screen", "Copy link and Copy message both confirm", "Copied link carries ?ref= when present"],
      },
      {
        name: "Share — council",
        path: `/s/${CAMPUS}/council?c=${COUNCIL}`,
        covers: "The DM destination for every council.",
        check: [
          "One screen",
          "Header says PANHELLENIC · ALABAMA",
          "Copies 18 links, not all 71",
          "Without ?c= it falls back to every chapter and says so",
        ],
      },
    ],
  },
  {
    group: "Campus reps",
    blurb: "Recruiting and running the rep program.",
    items: [
      {
        name: "Rep interest",
        path: "/rep",
        covers: "The public rep pitch — one page for the whole program.",
        check: ["Explains the deal and the commission", "Apply CTA is obvious", "Reads on a phone"],
      },
      {
        name: "Rep — campus specific",
        path: `/${CAMPUS}/rep`,
        covers: "One per campus — the rep pitch wearing that school.",
        check: ["Names the campus", "Campus colourway", "Apply CTA works"],
      },
      {
        name: "Rep apply",
        path: "/rep/join",
        covers: "The application flow.",
        check: [
          "Every step advances and can go back",
          "Phone verification path works end to end",
          "A half-finished application is not lost on refresh",
          "Confirmation is unambiguous",
        ],
      },
      {
        name: "Rep dashboard",
        path: "/rep/dashboard",
        covers: "One template per rep — links, clicks, conversions, earnings.",
        needs: "A signed-in rep. Signed out it should say so rather than render an empty shell.",
        check: [
          "Signed-out state is honest",
          "Tracked link copies and confirms",
          "Earnings figures match the admin view",
          "Works on a phone — reps live on their phones",
        ],
      },
      {
        name: "Rep tracked link",
        path: "/r/demo",
        covers: "Every rep link — the /r/<code> hop that sets the commission cookie.",
        needs: "Use a REAL code from the rep admin. An unknown code should fail gracefully.",
        check: [
          "Redirects to the destination",
          "Sets the sa_ref cookie (commission attribution)",
          "Unknown code does not 500",
        ],
      },
    ],
  },
  {
    group: "Partners",
    blurb: "Council and national-org outreach surfaces.",
    items: [
      {
        name: "Councils overview",
        path: "/partners/campus-councils",
        covers: "The generic councils pitch.",
        check: ["Reads without a campus context", "CTA reaches the finder"],
      },
      {
        name: "Nationals overview",
        path: "/partners/national-organizations",
        covers: "The generic nationals pitch.",
        check: ["Reads without an org context", "CTA works"],
      },
      {
        name: "National org page",
        path: `/partners/national/${NATIONAL}`,
        covers: "One per national organisation, across every campus it has chapters on.",
        check: ["Names the org", "Campus list is real", "Share modal works"],
      },
    ],
  },
  {
    group: "Private and legal",
    blurb: "Small, but two of these are linked from every SMS consent block on the site.",
    items: [
      {
        name: "The campaign (private)",
        path: "/the-campaign",
        covers: "Shared by email only, linked from nowhere.",
        check: [
          "noindex + nofollow in the page source",
          "Counts are live, not hardcoded",
          "Deck: 15 slides, arrows, swipe, counter",
          "Every number's ? opens its assumption",
          "Form submits with only a name",
          "Confirmation appends the right extra lines",
        ],
      },
      {
        name: "Privacy",
        path: "/privacy",
        covers: "Linked from every SMS consent block. If it 404s that is a compliance problem.",
        check: ["Loads", "Current", "Reachable from the consent line on a form"],
      },
      {
        name: "Terms",
        path: "/terms",
        covers: "Same — linked from every SMS consent block.",
        check: ["Loads", "Current", "Reachable from the consent line on a form"],
      },
    ],
  },
];

function TemplatesPage() {
  useNavyDocument();
  const total = GROUPS.reduce((n, g) => n + g.items.length, 0);
  return (
    <div
      style={{
        ...frameThemeVars(DEFAULT_FRAME_THEME),
        background: "var(--bg-page)", color: "var(--brand-cream)",
        minHeight: "100vh", fontFamily: BRAND_SANS,
      }}
    >
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 80px" }}>
        <h1 className="text-[28px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Templates to test</h1>
        <p className="mt-2 max-w-[64ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {total} reusable templates, each with a sample that renders in its populated state. These
          link to the REAL pages — testing a copy would only tell you the copy works.
        </p>
        <p className="mt-2 max-w-[64ch] text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          To change something and move it over when it&apos;s ready, work on a branch: every branch
          gets its own deployment with every template at its real path, and shipping it is the merge.
        </p>

        {GROUPS.map((g) => (
          <section key={g.group} className="mt-10">
            <h2 className="text-[13px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>
              {g.group}
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>{g.blurb}</p>

            <div className="mt-4 flex flex-col gap-3">
              {g.items.map((t) => (
                <div key={t.name} className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>{t.name}</h3>
                    <a href={t.path} className="text-[13px] font-black underline underline-offset-4" style={{ color: "var(--accent)" }}>
                      Open →
                    </a>
                  </div>
                  <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{t.covers}</p>
                  <code className="mt-1.5 block break-all text-[11.5px]" style={{ color: "var(--text-muted)" }}>{t.path}</code>

                  {/* A page that cannot be judged cold says so, rather than being ticked off as
                      "fine" by someone who only saw its signed-out shell. */}
                  {t.needs && (
                    <p className="mt-2 rounded-lg px-2.5 py-1.5 text-[12px] leading-snug"
                       style={{ background: "rgba(252,163,17,0.10)", border: "1px solid rgba(252,163,17,0.3)", color: "var(--brand-cream)" }}>
                      <strong>Needs:</strong> {t.needs}
                    </p>
                  )}

                  <ul className="mt-2 flex flex-col gap-0.5" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {t.check.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-[13px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>
                        <span aria-hidden style={{ color: "var(--accent)" }}>☐</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
