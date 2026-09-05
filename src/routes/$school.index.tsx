// /<school> — THE CAMPUS PAGE. One indexable page per seeded campus.
//
// This is the SEO surface: a student searching "ACCY 201 help" or "Penn State accounting tutor"
// should find a page that names their course, wears their school's colours, and plays Exam 1 for
// free — not a generic homepage that asks them who they are first.
//
// IT RENDERS THE HOMEPAGE, campus pre-applied (2026-09-05: the two-door page, the same one "/"
// draws — until now this route still served the older LandingPage, so a shared campus link landed
// on a different site than the homepage). A separate thin page would drift from the product the
// first time the homepage changed, and would be exactly the "thin page" Google declines to rank.
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
import { campusOgImageV, campusShareOg, ogMeta } from "@/lib/og";
import { schoolBySlug } from "@/lib/schools";
import { TEST_CAMPUS_SLUG } from "@/lib/test-mode";
import { TwoDoorHome } from "@/components/site/home-two-door/TwoDoorHome";

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
    // The SHARE copy, not the hero line: a texted link leads with what is free and where, because
    // the title is often the only text that renders beside the image.
    const copy = campusShareOg(d.courseCode, short);
    return {
      meta: [
        ...ogMeta({ ...copy, path: `/${d.slug}`, image: campusOgImageV(d.slug) }),
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
      {/* The two-door homepage with THIS campus pinned by the URL. storedCampusId/initialCode seed
          the server render so a crawler sees "ACCY 201 at Ole Miss" in the first HTML; the URL slug
          wins over a visitor's stored campus once the client resolves. */}
      <TwoDoorHome urlSchoolSlug={school} storedCampusId={d.campusId} initialCode={d.courseCode} />
    </>
  );
}
