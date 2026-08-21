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
import { campusOgImage, HOME_OG, ogMeta } from "@/lib/og";
import { schoolBySlug } from "@/lib/schools";
import { LandingPage } from "./landing";

const ORIGIN = "https://surviveaccounting.com";

export const Route = createFileRoute("/$school/")({
  beforeLoad: ({ params }) => {
    if (!schoolBySlug(params.school)) throw redirect({ to: "/", replace: true });
  },
  loader: ({ params }) => getCampusPage({ data: { slug: params.school } }),
  head: ({ loaderData: d }) => {
    if (!d) return {};
    // Missing course code ⇒ HOME copy rather than an empty token; the campus-colorway card still
    // applies because the campus itself is known.
    const copy = d.courseCode
      ? {
          title: `Survive your ${d.courseCode} exams.`,
          description: `Cram videos + practice exams built for ${d.courseCode}. Get help from a tutor who's helped 1,000+ students. Start for free, no account needed.`,
        }
      : HOME_OG;
    return {
      meta: ogMeta({ ...copy, path: `/${d.slug}`, image: campusOgImage(d.slug) }),
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
      />
    </>
  );
}
