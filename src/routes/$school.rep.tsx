// /<school>/rep — the per-campus rep advertisement.
//
// Per-campus from the start, even though the copy is identical everywhere today, because the
// program is meant to become campus-specific (different commission at a pilot school, a named rep
// already in place, a school that is full). Retrofitting per-campus URLs after they have been sent
// to students is the expensive version of this.
//
// An unknown slug falls through to the generic /rep rather than 404ing — these links get typed and
// forwarded, and a dead end costs more than a school picker.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { frameThemeVars } from "@/components/frames/frame-theme";

import { BRAND_SANS } from "@/components/canvas/brand";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { RepInterest } from "@/components/site/RepInterest";
import { Footer } from "@/components/site/SiteFooter";
import { CampusProvider } from "@/lib/campus-context";
import { campusOgImageV, HOME_OG, ogMeta } from "@/lib/og";
import { schoolById, schoolBySlug } from "@/lib/schools";

/** ACCEPTS EITHER NAMESPACE. The brief writes /ole-miss/rep — the PICKER id — while /go/ URLs
 *  use the campus slug (university-of-mississippi). Both resolve here, because these links get
 *  typed and forwarded and there is no reason a rep should have to know which one we meant. */
const resolveSchool = (v: string) => schoolById(v) ?? schoolBySlug(v);

export const Route = createFileRoute("/$school/rep")({
  beforeLoad: ({ params }) => {
    if (!resolveSchool(params.school)) throw redirect({ to: "/rep", replace: true });
  },
  head: ({ params }) => {
    const s = resolveSchool(params.school);
    if (!s) return { meta: ogMeta({ ...HOME_OG, path: "/rep" }) }; // beforeLoad redirects anyway
    return {
      meta: ogMeta({
        title: `Be the Survive Accounting rep at ${s.name}.`,
        description: "Share Survive Accounting with fraternities & sororities on your campus. Get a 10% commission for every sale. Easiest side gig imaginable.",
        path: `/${s.slug}/rep`,
        image: campusOgImageV(s.slug),
      }),
    };
  },
  component: CampusRepPage,
});

function CampusRepPage() {
  const { school } = Route.useParams();
  useNavyDocument();
  const s = resolveSchool(school);
  if (!s) return null;   // beforeLoad has already redirected

  return (
    <CampusProvider urlSchoolSlug={s.slug}>
      <div style={{ ...frameThemeVars(), background: "var(--bg-page)", color: "var(--brand-cream)", minHeight: "100vh", fontFamily: BRAND_SANS }}>
        <SiteHeader />
        <RepInterest schoolSlug={s.slug} schoolName={s.name} />
        <Footer />
      </div>
    </CampusProvider>
  );
}
