// THE 15 SLIDES.
//
// ── LEE: THIS IS THE FILE TO EDIT ─────────────────────────────────────────────────────────────
// Slides are data. Change a headline, reorder, add or cut one — nothing else moves. The deck
// component reads this array and knows nothing about what is in it.
//
// EVERY NUMBER IS ONE OF YOURS. This is a first pass assembled ONLY from the figures and
// assumptions you supplied in the brief (see campaign-figures.ts) plus the launch facts already
// on the site. Nothing here is invented, estimated, or rounded up by me — where a slide needed a
// number you had not given, the slide is written without one rather than with a guess.
//
// A figure on a slide is always <Figure k="…" />, never typed inline, so the number on screen and
// the assumption in the modal can never drift apart.
import { Figure } from "./Figure";

export type CampaignSlide = {
  /** The small line above the headline — where you are in the argument. */
  kicker: string;
  headline: string;
  /** The body. Keep it to what a person can read in the time they look at one slide. */
  body: React.ReactNode;
};

export const CAMPAIGN_SLIDES: CampaignSlide[] = [
  {
    kicker: "The situation",
    headline: "I built the product. Now I have to sell it.",
    body: (
      <>
        Survive Accounting is cram videos and practice exams for the intro accounting course that
        quietly wrecks GPAs. It works — students who used it said so. What I have not proven is
        that I can get it in front of people at scale.
      </>
    ),
  },
  {
    kicker: "What I spent six months on",
    headline: "Learning cold outreach from zero.",
    body: (
      <>
        Not building features. Building the machine that finds a campus, finds the people who run
        Greek life on it, and gets a message to them that they answer.
      </>
    ),
  },
  {
    kicker: "The system",
    headline: "A campus is not a name on a list.",
    body: (
      <>
        Before a campus counts, it needs council contacts, the top five fraternity and sorority
        chapters, at least one business club for recruiting a rep, and a confirmed course code.
        Right now <Figure k="campuses" /> campuses meet that bar.
      </>
    ),
  },
  {
    kicker: "The reach",
    headline: "Every message is sent by a person.",
    body: (
      <>
        <Figure k="emails" /> emails across the semester. Three inboxes, starting at 25 a day by
        hand and stepping up once the dedicated inboxes finish warming.
      </>
    ),
  },
  {
    kicker: "The reach",
    headline: "Instagram is the other half, and it cannot be automated.",
    body: (
      <>
        <Figure k="dms" /> direct messages, every one typed. Meta only permits automated messages
        to accounts that wrote to us first, so there is no shortcut here — only a ceiling.
      </>
    ),
  },
  {
    kicker: "Who I am reaching",
    headline: "Councils first, because councils forward.",
    body: (
      <>
        <Figure k="councils" /> councils — IFC, Panhellenic, NPHC, sometimes MGC — across the
        campuses I launch. One officer forwarding to her chapter presidents reaches more houses in
        an afternoon than I reach in a week.
      </>
    ),
  },
  {
    kicker: "Who I am reaching",
    headline: "And the chapters themselves.",
    body: (
      <>
        <Figure k="chapters" /> chapters, about twenty per campus. Some I contact directly; most
        hear about it because someone above them passed it down.
      </>
    ),
  },
  {
    kicker: "The bet",
    headline: "A referral is worth about four cold emails.",
    body: (
      <>
        <Figure k="referralRate" /> — the industry benchmark for referred versus cold leads. That
        gap is the entire reason this page exists and the entire reason I am asking you for a name.
      </>
    ),
  },
  {
    kicker: "The team",
    headline: "Campus reps, deliberately few.",
    body: (
      <>
        <Figure k="reps" /> reps, roughly one per seventeen launched campuses. The limit is not how
        many people apply — it is how many screening calls I can personally do.
      </>
    ),
  },
  {
    kicker: "What it costs",
    headline: "Two hundred and forty dollars.",
    body: (
      <>
        <Figure k="cost" /> for the semester: Instantly, two Google Workspace seats, two domains,
        and a phone number. The expensive input is my time, and that is already spent.
      </>
    ),
  },
  {
    kicker: "What has to happen",
    headline: "Sixty-eight chapters.",
    body: (
      <>
        <Figure k="signups" /> chapters sponsoring seats at $100 each with a ten-seat minimum,
        modeled across direct replies, referrals, campus reps, and chapters telling each other.
      </>
    ),
  },
  {
    kicker: "If it works",
    headline: "Seventy-four thousand, net.",
    body: (
      <>
        <Figure k="revenue" />, after a 5% growth partner commission, 10% campus rep commission on
        rep-sourced sales, milestone bonuses, and the $240.
      </>
    ),
  },
  {
    kicker: "The honest part",
    headline: "I do not know if this works.",
    body: (
      <>
        The product is proven with students. The outreach is not proven at all. September 1 is when
        I find out, and I would rather show you the plan now than the result later.
      </>
    ),
  },
  {
    kicker: "What I need",
    headline: "One name.",
    body: (
      <>
        Anyone with access to a fraternity or sorority — active, alumni, advisor, parent, or a
        student taking accounting. I will reach out personally and mention you.
      </>
    ),
  },
  {
    kicker: "And",
    headline: "Tell me where I am wrong.",
    body: (
      <>
        If a number on any of these slides looks off, open its <span aria-hidden>?</span> and tell
        me which assumption you would change. That is worth as much to me as a referral.
      </>
    ),
  },
];
