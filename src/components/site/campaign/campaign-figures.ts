// THE CAMPAIGN'S NUMBERS, AND THE ASSUMPTION BEHIND EACH ONE.
//
// EVERY FIGURE ON A SLIDE HAS AN ENTRY HERE. That is the point of the page: a number with no
// stated assumption is a claim, and this page is shown to people whose judgement Lee wants. The
// `?` marker beside a figure opens the matching `body` in a modal.
//
// ── THIS FILE IS THE ONE PLACE TO EDIT ────────────────────────────────────────────────────────
// Adding a figure is adding an entry here and referencing its key from a slide. No layout to
// touch, no component to change. Keys are stable strings so a slide never points at a number by
// position.
//
// A MODAL, NOT A HOVER BUBBLE, because the audience for this page reads it on a phone in an
// email, and a hover tooltip does not exist on a phone.

export type CampaignFigure = {
  /** What is printed on the slide — "8,100", "$73,995", "11% vs 2.3%". */
  label: string;
  /** The modal's heading. */
  title: string;
  /** The assumption. Plain sentences, in Lee's voice, no marketing. */
  body: string;
};

export const CAMPAIGN_FIGURES: Record<string, CampaignFigure> = {
  emails: {
    label: "8,100",
    title: "8,100 emails",
    body:
      "Three inboxes. 25/day sent by hand through Sept 11, then 100/day once two dedicated " +
      "cold-email inboxes finish warming. Six sending days a week through Dec 12.",
  },
  dms: {
    label: "1,300",
    title: "1,300 DMs",
    body:
      "Cold DMs can't be automated — Meta only allows automated messages to accounts that " +
      "messaged us first. Every one is sent by hand. 20/day is the ceiling before Instagram " +
      "throttles the account.",
  },
  councils: {
    label: "700",
    title: "700 councils",
    body:
      "3–4 per campus: IFC, Panhellenic, NPHC, sometimes MGC. Across 200 launched campuses.",
  },
  chapters: {
    label: "4,000",
    title: "4,000 chapters",
    body:
      "About 20 per campus. Some contacted directly, most reached when a council officer forwards.",
  },
  campuses: {
    label: "203 / 677",
    title: "Campuses ready, and campuses in the system",
    body:
      "A campus is “ready” when it has council contacts, the top five fraternity and " +
      "sorority chapters, at least one business club for rep recruiting, and a confirmed course " +
      "code.",
  },
  revenue: {
    label: "$73,995",
    title: "$73,995",
    body:
      "Net of a 5% growth partner commission, 10% campus rep commission on rep-sourced sales, " +
      "milestone bonuses, and $240 of direct cost.",
  },
  cost: {
    label: "$240",
    title: "$240",
    body:
      "Instantly, two Google Workspace seats, two domains, and a phone number. One semester.",
  },
  signups: {
    label: "68",
    title: "68 chapters",
    body:
      "$100 per seat, 10-seat minimum. Modeled across direct replies, referrals, campus reps, " +
      "and chapter-to-chapter word of mouth.",
  },
  referralRate: {
    label: "11% vs 2.3%",
    title: "11% vs 2.3%",
    body:
      "Industry benchmarks for referred versus cold leads — roughly four times higher.",
  },
  reps: {
    label: "12",
    title: "12 reps",
    body:
      "About one per 17 launched campuses. Held low deliberately: the constraint is Lee’s " +
      "screening call, not applicant supply.",
  },
};

export type CampaignFigureKey = keyof typeof CAMPAIGN_FIGURES;
