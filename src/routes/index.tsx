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

import { HOME_OG, ogMeta } from "@/lib/og";
import { readCampusPrefs } from "@/lib/campus-prefs.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { schoolById } from "@/lib/schools";
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
  // THE RETURNING VISITOR'S CAMPUS COMES FROM THE COOKIE, ON THE SERVER. Before this the homepage
  // always server-rendered the generic page and swapped to "ACCY 201 at Ole Miss" after hydration
  // — a visible flicker, and a <title> that stayed generic. The loader reads the campus
  // preference cookie (see lib/campus-prefs.ts) and, when it names a school, its course code, so
  // the first byte already carries the campus version. Best-effort: any failure is the generic
  // page, never an error.
  loader: async () => {
    const prefs = await readCampusPrefs().catch(() => ({ campus: null, profSkip: null }));
    const school = schoolById(prefs.campus);
    const code = school
      ? await listCampusIntroCodes({ data: { ids: [school.campusId] } }).then((r) => r[0]?.code ?? null).catch(() => null)
      : null;
    return { campus: prefs.campus, profSkip: prefs.profSkip, code };
  },
  // Per-visitor, so never cached across requests; within one session ten minutes is plenty.
  staleTime: 600_000,
  head: ({ loaderData }) => ({
    // The OG card/description stay the HOME ones (the page a stranger would share), but the tab
    // title names the course a returning student actually came back for.
    meta: ogMeta({ ...HOME_OG, ...(loaderData?.code ? { title: `Survive your ${loaderData.code} exams.` } : {}), path: "/" }),
    links: [{ rel: "canonical", href: "https://surviveaccounting.com/" }],
  }),
  component: Home,
});

function Home() {
  const d = Route.useLoaderData();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }} />
      <LandingPage storedCampusId={d?.campus ?? null} profSkipFor={d?.profSkip ?? null} />
    </>
  );
}
