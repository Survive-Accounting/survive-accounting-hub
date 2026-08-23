// /partners/national/<org> — the personalised national-organization page.
//
// Rebuilt to the "show the product, make sharing obvious" brief. Gone: the metrics dashboard (a
// national office does not care how many course codes we mapped), the "how campus matching works"
// explainer (the preview demonstrates it), and the wall of "coming" toolkit cards. In their place:
// the org's problem, the actual student product with a campus switcher, the three standard value
// props, a searchable/paginated campus directory, and one action — Share with chapters — repeated
// where the officer finishes reading.
//
// The hero bolt still SWEEPS through the campuses this org is on, each in its school's colours with
// its real course code — the rotation is the "tailored per campus" claim, demonstrated.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";

import { PartnerPageShell } from "@/components/site/PartnerPage";
import { PartnerHero, PartnerPrimary, PartnerSecondary, PartnerSection } from "@/components/site/PartnerKit";
import { StudentPreview, previewCampus } from "@/components/site/StudentPreview";
import { PartnerDirectory } from "@/components/site/PartnerDirectory";
import { ShareChaptersModal } from "@/components/site/ShareChaptersModal";
import { FeatureValueStrip } from "@/components/site/Marketing";
import { getNationalPartner } from "@/lib/partners.functions";
import { LEE_PHONE_DISPLAY, LEE_SMS_HREF, nationalLeaderEmail, nationalMessage, problemHeadline } from "@/lib/partners";
import { ogMeta } from "@/lib/og";
import { boltCampusFor, type BoltCampus } from "@/components/site/bolt";

const ORIGIN = "https://surviveaccounting.com";

export const Route = createFileRoute("/partners/national/$org")({
  validateSearch: (s: Record<string, unknown>): { campus?: string } =>
    typeof s.campus === "string" && s.campus ? { campus: s.campus } : {},
  loader: async ({ params }) => {
    const page = await getNationalPartner({ data: { orgSlug: params.org } });
    if (!page) throw notFound();
    return page;
  },
  staleTime: 600_000,
  head: ({ loaderData: d }) => {
    if (!d) return {};
    return {
      meta: ogMeta({
        title: `${d.orgShort} × Survive Accounting — free intro accounting exam prep.`,
        description: `${d.totalCampuses} campuses with ${d.orgShort} chapters, each matched to the intro accounting course that campus actually teaches.`,
        path: `/partners/national/${d.orgSlug}`,
      }),
      links: [{ rel: "canonical", href: `${ORIGIN}/partners/national/${d.orgSlug}` }],
    };
  },
  component: NationalPartnerPage,
  notFoundComponent: () => (
    <PartnerPageShell faqs={[]}>
      <section className="py-16 text-center">
        <h1 className="text-[26px] font-black">We don&apos;t have that organization on file yet.</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px]" style={{ color: "var(--text-muted)" }}>Start from the overview and I&apos;ll add it.</p>
        <div className="mt-6 flex justify-center"><PartnerPrimary href="/partners/national-organizations">See how nationals use Survive →</PartnerPrimary></div>
      </section>
    </PartnerPageShell>
  ),
});

function NationalPartnerPage() {
  const d = Route.useLoaderData();
  const { campus: pinned } = Route.useSearch();
  const [share, setShare] = useState(false);

  // Bolt stops: one per campus, in the org's order, deduped — each in its school's colours with its
  // real course code. Pinned campus shows just that one.
  const stops: BoltCampus[] = (() => {
    const seen = new Set<string>();
    const all = d.campuses.filter((c) => (seen.has(c.schoolSlug) ? false : (seen.add(c.schoolSlug), true)));
    const list = pinned ? all.filter((c) => c.schoolSlug === pinned) : all;
    return (list.length ? list : all).slice(0, 12).map((c) => boltCampusFor(c.schoolSlug, { name: c.schoolName, code: c.courseCode }));
  })();

  // Preview switcher: campuses that have a verified course code (so the preview never shows a
  // generic-headed outline for this org), deduped by school, capped so the dropdown stays scannable.
  const previews = (() => {
    const seen = new Set<string>();
    return d.campuses
      .filter((c) => c.courseCode && !seen.has(c.schoolSlug) && (seen.add(c.schoolSlug), true))
      .slice(0, 12)
      .map((c) => {
        const bc = boltCampusFor(c.schoolSlug, { name: c.schoolName, code: c.courseCode });
        return previewCampus({ key: c.schoolSlug, name: c.schoolName, code: c.courseCode, primary: bc.primary, secondary: bc.secondary, href: `/${c.schoolSlug}` });
      });
  })();

  const directoryRows = d.campuses.map((c) => ({
    key: `${c.schoolSlug}/${c.chapterSlug}`,
    name: c.schoolName,
    active: c.claimed,
    href: c.goPath,
  }));

  const shareLinks = d.campuses.map((c) => ({ label: c.schoolName, url: `${ORIGIN}${c.goPath}` }));

  return (
    <PartnerPageShell faqs={NATIONAL_FAQS()}>
      <PartnerHero
        eyebrow={`${d.orgShort} × Survive Accounting`}
        headline={problemHeadline()}
        subhead={`Help every ${d.orgShort} chapter get ahead of it.`}
        body="Free Exam 1 cram videos + practice exams tailored to each campus."
        bolt={stops}
        boltLabel={`Campuses with ${d.orgShort} chapters`}
        actions={
          <>
            <PartnerPrimary onClick={() => setShare(true)}>Share with chapters →</PartnerPrimary>
            <PartnerSecondary href={LEE_SMS_HREF}>Text Lee {LEE_PHONE_DISPLAY}</PartnerSecondary>
          </>
        }
      />

      {previews.length > 0 && (
        <PartnerSection title="What your chapters get" note="The same product, tailored to each campus — switch campuses to see.">
          <StudentPreview campuses={previews} />
        </PartnerSection>
      )}

      <FeatureValueStrip code={null} />

      <PartnerSection title="Your chapters on Survive" note={`${d.totalCampuses} campus${d.totalCampuses === 1 ? "" : "es"} ready to share`}>
        <PartnerDirectory rows={directoryRows} />
        <div className="mt-6 flex justify-center sm:justify-start">
          <PartnerPrimary onClick={() => setShare(true)}>Share with chapters →</PartnerPrimary>
        </div>
      </PartnerSection>

      {share && (
        <ShareChaptersModal
          title="Share with chapters"
          subtitle={`${d.orgShort} — ${d.totalCampuses} campus${d.totalCampuses === 1 ? "" : "es"}`}
          email={nationalLeaderEmail({ orgShort: d.orgShort, totalCampuses: d.totalCampuses })}
          message={nationalMessage({ orgShort: d.orgShort })}
          links={shareLinks}
          linksLabel="Campus links"
          onClose={() => setShare(false)}
        />
      )}
    </PartnerPageShell>
  );
}

const NATIONAL_FAQS = () => [
  { q: "Does this cost the national organization?", a: "No. Exam 1 is free. Individual chapters can choose to sponsor full-semester seats for Exams 2, 3 and the Final." },
  { q: "Is this actually tailored to each campus?", a: "Yes. Each campus uses its own intro accounting course, and students can match their professor for more specific coverage." },
  { q: "What do we send our chapters?", a: "We'll give you ready-to-send email/text copy and a shareable page for each supported chapter." },
];
