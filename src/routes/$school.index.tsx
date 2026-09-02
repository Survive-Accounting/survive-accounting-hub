// /<school> — THE CAMPUS PAGE. One indexable page per seeded campus.
//
// This is the SEO surface: a student searching "ACCY 201 help" or "Penn State accounting tutor"
// should find a page that names their course, wears their school's colours, and plays Exam 1 for
// free — not a generic homepage that asks them who they are first.
//
// IT RENDERS THE REAL LANDING PAGE, campus pre-applied, rather than a bespoke marketing page. A
// separate thin page would drift from the product the first time the player changed, and would be
// exactly the "thin page" Google declines to rank. Everything below the fold is the working thing.
//
// SERVER-RENDERED ON PURPOSE. The school name and course code come from the loader, so a crawler
// (and a slow phone) sees "ACCY 201 at Ole Miss" in the initial HTML. Resolving them client-side
// is what made /go/ flash the generic hero — same mistake, same fix.
//
// AN UNKNOWN SLUG REDIRECTS HOME rather than 404ing. This route sits at the top level, so it also
// catches typos and dead links; a school picker is a better answer than an error page.
import { createFileRoute, redirect } from "@tanstack/react-router";

import { getCampusPage } from "@/lib/campus-page.functions";
import { readCampusPrefs } from "@/lib/campus-prefs.functions";
import { campusOgImage, HOME_OG, ogMeta } from "@/lib/og";
import { schoolBySlug } from "@/lib/schools";
import { TEST_CAMPUS_SLUG } from "@/lib/test-mode";
import { LandingPage } from "./landing";

const ORIGIN = "https://surviveaccounting.com";

export const Route = createFileRoute("/$school/")({
  beforeLoad: ({ params }) => {
    // THE TEST FIXTURE IS REACHABLE BY DIRECT URL ONLY. schoolBySlug reads the static picker list,
    // which the fixture is deliberately absent from — it must never appear in a picker, a ticker
    // or the sitemap — but the page itself has to work, because testers walk the real campus page.
    if (params.school === TEST_CAMPUS_SLUG) return;
    if (!schoolBySlug(params.school)) throw redirect({ to: "/", replace: true });
  },
  loader: async ({ params }) => {
    const [page, prefs] = await Promise.all([
      getCampusPage({ data: { slug: params.school } }),
      readCampusPrefs().catch(() => ({ campus: null, profSkip: null })),
    ]);
    return page ? { ...page, profSkip: prefs.profSkip } : page;
  },
  head: ({ loaderData: d }) => {
    if (!d) return {};
    // THE CARD SAYS THE STUDENT'S OWN COURSE. A texted link should show their school before they
    // tap it — the og:title is the page's own hero line, so the preview and the page agree. Missing
    // course code ⇒ HOME copy rather than an empty token; the campus colourway card still applies
    // because the campus itself is known.
    const short = d.name || d.slug;
    const copy = d.courseCode
      ? {
          title: `${d.courseCode} at ${short} is where GPAs quietly slip.`,
          description: "Cram what's on your exam. Exam 1 is free.",
        }
      : HOME_OG;
    return {
      meta: [
        ...ogMeta({ ...copy, path: `/${d.slug}`, image: campusOgImage(d.slug) }),
        // AFTER ogMeta, not before: ogMeta emits its own { title } (the hero line, which is the
        // better hook in a text message) and the LAST entry for a key wins. The tab and the
        // search result want the searchable form — course code, campus, brand — so it goes last.
        ...(d.courseCode ? [{ title: `${d.courseCode} at ${short} — Survive Accounting` }] : []),
      ],
      links: [{ rel: "canonical", href: `${ORIGIN}/${d.slug}` }],
    };
  },
  component: CampusPage,
});

function CampusPage() {
  const d = Route.useLoaderData();
  const { school } = Route.useParams();
  if (!d) return null;   // beforeLoad has already redirected

  // Course JSON-LD. Only emitted when there IS a real course code — describing a named course we
  // cannot name would be structured data that says nothing, and inventing one would be worse.
  const jsonLd = d.courseCode ? {
    "@context": "https://schema.org",
    "@type": "Course",
    name: `${d.courseCode} exam prep`,
    description: `Exam-prep videos and practice for ${d.courseCode} at ${d.formalName}.`,
    url: `${ORIGIN}/${d.slug}`,
    provider: { "@type": "Organization", name: "Survive Accounting", "@id": `${ORIGIN}/#org` },
    about: { "@type": "Thing", name: "Introductory Financial Accounting" },
    audience: { "@type": "EducationalAudience", educationalRole: "student" },
  } : null;

  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      {/* No bespoke hero any more — LandingPage derives the campus variant of the ONE
          MarketingHero from campus context; chapterCount only gates the Greek secondary CTA. */}
      <LandingPage
        campusSlug={school}
        initialCampusId={d.campusId}
        initialCourseCode={d.courseCode}
        chapterCount={d.chapterCount}
        profSkipFor={d.profSkip}
      />
    </>
  );
}
