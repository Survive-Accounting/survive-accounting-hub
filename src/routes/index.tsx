// "/" — THE HOMEPAGE. Promoted 2026-08-13 from /landing: the navy/bolt Exam-1 player (pick your
// school → free Exam 1 → the paid tabs' notify capture) is now what a stranger lands on.
//
// The page itself lives in ./landing, which stays the module home for LandingPage + the shared
// CampusSelector/Footer/SCHOOLS that /chapters, /c/$slug and /expand import. This route only owns
// the HOMEPAGE CONCERNS the old marketing page owned: indexable meta, canonical, OG, and the
// Organization/WebSite JSON-LD (which must exist on exactly one page — it moved off /waitlist).
//
// The previous Fall-2026 waitlist homepage is preserved at /waitlist (noindex, still linking /order).
import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "./landing";

// Organization + EducationalOrganization + WebSite JSON-LD (rendered into the home DOM so it SSRs
// for crawlers). sameAs is intentionally omitted — no confirmed Survive Accounting brand social
// profiles yet (the footer's @grooveginger is Lee's separate music brand). Add real handles here.
const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["Organization", "EducationalOrganization"],
      "@id": "https://surviveaccounting.com/#org",
      name: "Survive Accounting",
      url: "https://surviveaccounting.com/",
      logo: "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png",
      description:
        "Personalized accounting exam-prep videos and interactive journal-entry practice for Intro and Intermediate Accounting students.",
      founder: { "@type": "Person", name: "Lee Ingram" },
      email: "lee@surviveaccounting.com",
    },
    {
      "@type": "WebSite",
      "@id": "https://surviveaccounting.com/#website",
      url: "https://surviveaccounting.com/",
      name: "Survive Accounting",
      publisher: { "@id": "https://surviveaccounting.com/#org" },
    },
  ],
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Survive Accounting — Only what's on your exam" },
      {
        name: "description",
        content:
          "Free cram videos for Intro Financial Accounting, built around the questions your exam actually asks. Pick your school and start Exam 1 free — no signup.",
      },
      { property: "og:title", content: "Only what's on your exam." },
      { property: "og:description", content: "Free cram videos for Intro Financial Accounting. Pick your school, start Exam 1 free — no signup." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://surviveaccounting.com/" },
      { property: "og:image", content: "https://surviveaccounting.com/lee-stadium.webp" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://surviveaccounting.com/" }],
  }),
  component: Home,
});

function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }} />
      <LandingPage />
    </>
  );
}
