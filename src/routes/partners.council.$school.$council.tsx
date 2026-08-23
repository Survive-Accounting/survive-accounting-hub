// /partners/council/<school>/<council> — the personalised campus-council page.
//
// PUBLIC AND OUTBOUND, unlike /go/<school>/council/<council>?k=… (the private, token-linked
// command centre for a chair we are already working with). This is the page that goes in the cold
// email, so it is server-rendered, indexable-by-choice, and gated on nothing.
//
// REBUILT to the "show the product, make sharing obvious" brief. It no longer explains how the
// roster works or renders a metrics dashboard; it shows the campus problem, then the actual
// student product (StudentPreview), then the chapters to share with, then the one action —
// Share with all chapters — repeated where the officer finishes reading. Everything a council
// officer needs to decide and act, nothing about our data pipeline.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";

import { PartnerPageShell } from "@/components/site/PartnerPage";
import { PartnerHero, PartnerPrimary, PartnerSecondary, PartnerSection } from "@/components/site/PartnerKit";
import { StudentPreview, previewCampus } from "@/components/site/StudentPreview";
import { ShareChaptersModal } from "@/components/site/ShareChaptersModal";
import { FeatureValueStrip } from "@/components/site/Marketing";
import { getCouncilPartner } from "@/lib/partners.functions";
import { LEE_PHONE_DISPLAY, LEE_SMS_HREF, councilGroupMessage, councilPresidentEmail, problemHeadline } from "@/lib/partners";
import { boltForSlug } from "@/lib/schools";
import { boltCampusFor } from "@/components/site/bolt";
import { ogMeta } from "@/lib/og";

const ORIGIN = "https://surviveaccounting.com";

export const Route = createFileRoute("/partners/council/$school/$council")({
  loader: async ({ params }) => {
    const page = await getCouncilPartner({ data: { schoolSlug: params.school, councilSlug: params.council } });
    if (!page) throw notFound();
    return page;
  },
  staleTime: 600_000,
  head: ({ loaderData: d }) => {
    if (!d) return {};
    const course = d.courseCode ?? "intro accounting";
    return {
      meta: ogMeta({
        title: `${d.councilName} at ${d.schoolName} — free ${course} exam prep for every chapter.`,
        description: `${d.totalChapters} ${d.councilName} chapters at ${d.schoolName}. Give every one of them free ${course} cram videos and practice exams.`,
        path: `/partners/council/${d.schoolSlug}/${d.councilSlug}`,
      }),
      links: [{ rel: "canonical", href: `${ORIGIN}/partners/council/${d.schoolSlug}/${d.councilSlug}` }],
    };
  },
  component: CouncilPartnerPage,
  notFoundComponent: () => (
    <PartnerPageShell faqs={[]}>
      <section className="py-16 text-center">
        <h1 className="text-[26px] font-black">We don&apos;t have that council on file yet.</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px]" style={{ color: "var(--text-muted)" }}>
          Start from the councils overview and I&apos;ll take it from there.
        </p>
        <div className="mt-6 flex justify-center"><PartnerPrimary href="/partners/campus-councils">See how councils use Survive →</PartnerPrimary></div>
      </section>
    </PartnerPageShell>
  ),
});

function CouncilPartnerPage() {
  const d = Route.useLoaderData();
  const [share, setShare] = useState(false);
  const bolt = boltForSlug(d.schoolSlug);
  const course = d.courseCode ?? "intro accounting";

  const bc = boltCampusFor(d.schoolSlug, { name: d.schoolName, code: d.courseCode });
  const preview = previewCampus({ key: d.schoolSlug, name: d.schoolName, code: d.courseCode, primary: bc.primary, secondary: bc.secondary, href: `/${d.schoolSlug}` });
  const shareLinks = d.chapters.map((c) => ({ label: c.name, url: `${ORIGIN}${c.goPath}` }));

  const shareModal = share ? (
    <ShareChaptersModal
      title="Share with all chapters"
      subtitle={`${d.councilName} at ${d.schoolName}`}
      email={councilPresidentEmail({ councilName: d.councilName, schoolName: d.schoolName, courseCode: d.courseCode, schoolSlug: d.schoolSlug })}
      message={councilGroupMessage({ schoolName: d.schoolName, courseCode: d.courseCode, schoolSlug: d.schoolSlug })}
      links={shareLinks}
      onClose={() => setShare(false)}
    />
  ) : null;

  return (
    <PartnerPageShell boltVars={bolt} faqs={COUNCIL_FAQS(course)}>
      <PartnerHero
        eyebrow={`${d.councilName} at ${d.schoolName}`}
        headline={problemHeadline(d.courseCode, d.schoolName)}
        subhead="Help every chapter get ahead of it."
        body={`Free Exam 1 cram videos + practice exams built for ${course}.`}
        bolt={[bc]}
        boltLabel={`${course} · ${d.schoolName}`}
        actions={
          <>
            <PartnerPrimary onClick={() => setShare(true)}>Share with all chapters →</PartnerPrimary>
            <PartnerSecondary href={LEE_SMS_HREF}>Text Lee {LEE_PHONE_DISPLAY}</PartnerSecondary>
          </>
        }
      />

      <PartnerSection title="What your chapters get">
        <StudentPreview campuses={[preview]} />
      </PartnerSection>

      <FeatureValueStrip code={d.courseCode} />

      <PartnerSection title="Your chapters" note={`${d.totalChapters} chapter${d.totalChapters === 1 ? "" : "s"} at ${d.schoolName}`}>
        <div className="grid gap-2 sm:grid-cols-2">
          {d.chapters.map((c) => (
            <ChapterCard key={c.slug} name={c.name} letters={c.letters} goPath={c.goPath} claimed={c.claimed} />
          ))}
        </div>
        <div className="mt-6 flex justify-center sm:justify-start">
          <PartnerPrimary onClick={() => setShare(true)}>Share with all chapters →</PartnerPrimary>
        </div>
      </PartnerSection>

      {shareModal}
    </PartnerPageShell>
  );
}

/** A chapter row built for DISTRIBUTION: copy its link or open its page. Claim status is present
 *  but visually secondary — the officer's job here is to spread the link, not to audit it. */
function ChapterCard({ name, letters, goPath, claimed }: { name: string; letters: string | null; goPath: string; claimed: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = `${ORIGIN}${goPath}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {letters && <span className="shrink-0 text-[13px] font-black" style={{ color: "var(--accent)" }}>{letters}</span>}
          <span className="min-w-0 truncate text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>{name}</span>
        </div>
        {claimed && <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-muted)" }}>Claimed by an exec</span>}
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button type="button" onClick={copy} className="rounded-lg px-2.5 text-[12px] font-black" style={{ minHeight: 38, background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}>{copied ? "Copied ⚡" : "Copy link"}</button>
        <a href={goPath} className="inline-flex items-center rounded-lg px-2.5 text-[12px] font-black" style={{ minHeight: 38, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Open page</a>
      </div>
    </div>
  );
}

const COUNCIL_FAQS = (course: string) => [
  { q: "Does this cost the council?", a: "No. Exam 1 is free. Chapters can choose to sponsor full-semester seats for Exams 2, 3 and the Final." },
  { q: "Is this actually built for our course?", a: `Yes. Survive is matched to your campus's intro accounting course (${course}), and students can match their professor for more specific coverage.` },
  { q: "What do I send my chapters?", a: "We'll give you a ready-to-send president email, GroupMe message and a unique page for every chapter." },
];
