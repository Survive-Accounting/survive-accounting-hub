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
import { PartnerPrimary, PartnerSection } from "@/components/site/PartnerKit";
import { StudentPreview, previewCampus } from "@/components/site/StudentPreview";
import { FeatureValueStrip } from "@/components/site/Marketing";
import { getCouncilPartner } from "@/lib/partners.functions";
import { liftHeadline, liftSubhead } from "@/lib/partners";
import { CouncilDoors, SHARE_ANCHOR, KIT_ANCHOR } from "@/components/site/council/CouncilDoors";
import { CouncilHero } from "@/components/site/council/CouncilHero";
import { CouncilShare } from "@/components/site/council/CouncilShare";
import { CampaignBuilder } from "@/components/site/council/CampaignBuilder";
import { DOOR_CARD_CSS, DOOR_CTA_VARS } from "@/components/site/home-two-door/DoorCard";
import { scrollToId } from "@/lib/ui-scroll";
import { boltForSlug } from "@/lib/schools";
import { boltCampusFor } from "@/components/site/bolt";
import { ogMeta } from "@/lib/og";

const ORIGIN = "https://surviveaccounting.com";

/** The doors' anchor — the hero's third trust chip points here, the way the homepage's does. */
const DOORS_ID = "doors";

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
  const [kitBusy, setKitBusy] = useState(false);
  const bolt = boltForSlug(d.schoolSlug);
  const course = d.courseCode ?? "intro accounting";

  // THE MEETING MATERIALS. One ZIP built on the server (a flyer and a meeting slide for every
  // chapter, plus the cover PDFs). The council name rides along so the read-me can name them. A
  // plain anchor download rather than fetch+blob: a 30-chapter download is several MB and the
  // browser's own download UI beats anything we would build. The section scrolls into view either
  // way, so a slow build never looks like a dead button.
  const downloadKit = () => {
    setKitBusy(true);
    const a = document.createElement("a");
    a.href = `/api/partner-kit/${d.schoolSlug}/${d.councilSlug}?council_name=${encodeURIComponent(d.councilName)}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    scrollToId(KIT_ANCHOR);
    // The request belongs to the browser now; we cannot observe completion, so the button releases
    // on a timer rather than pretending to know.
    window.setTimeout(() => setKitBusy(false), 6000);
  };

  const bc = boltCampusFor(d.schoolSlug, { name: d.schoolName, code: d.courseCode });
  const preview = previewCampus({ key: d.schoolSlug, name: d.schoolName, code: d.courseCode, primary: bc.primary, secondary: bc.secondary, href: `/${d.schoolSlug}` });

  return (
    <PartnerPageShell
      boltVars={bolt}
      homeNav
      faqs={COUNCIL_FAQS(course)}
      // Every review on file is from Ole Miss. On an Alabama page a bare "What students are
      // saying" is a claim the cards underneath then contradict; naming the campus is the
      // difference between a mismatch and a disclosure.
      testimonialsHeading="What students at Ole Miss are saying"
    >
      <CouncilHero
        eyebrow={`${d.councilName} at ${d.schoolName}`}
        headline={liftHeadline()}
        subhead={liftSubhead(d.courseCode)}
        courseCode={d.courseCode}
        schoolName={d.schoolName}
        bolt={[bc]}
        boltLabel={`${course} · ${d.schoolName}`}
        onOpenBio={() => scrollToId("lee")}
        doorsId={DOORS_ID}
      />

      {/* THREE CHANNELS, one audience — the same door component the home and chapter pages use,
          so all three surfaces stay one design. */}
      <div id={DOORS_ID} style={DOOR_CTA_VARS}>
        <style>{DOOR_CARD_CSS}</style>
        <CouncilDoors
          onShare={() => scrollToId(SHARE_ANCHOR)}
          onDownloadKit={downloadKit}
          kitBusy={kitBusy}
          previewHref={`/${d.schoolSlug}`}
          bolt={bolt}
        />
      </div>

      {/* THE SHARE SECTION — the page's whole point. Rendered in place rather than hidden behind
          the door: door 1 scrolls to it. Content that only exists after a click is content the
          officer cannot find on a second visit, and it is the one thing this page is for. */}
      <CouncilShare
        id={SHARE_ANCHOR}
        chapters={d.chapters}
        courseCode={d.courseCode}
        emailTab={
          <CampaignBuilder
            id="council-email"
            schoolSlug={d.schoolSlug}
            schoolName={d.schoolName}
            councilSlug={d.councilSlug}
            councilName={d.councilName}
            courseCode={d.courseCode}
            chapters={d.chapters}
          />
        }
      />

      {/* THE PROOF — the course's own topic list with its timings, and one worked practice
          question. Kept exactly as it was; what went away is the section heading around it ("What
          your chapters get") and the mocked player chrome, which was a static picture of a product
          that has since changed. Door 3 sends her to the real one. */}
      <PartnerSection title={d.courseCode ? `What's actually on ${d.courseCode} Exam 1` : "What's actually on Exam 1"}>
        <StudentPreview campuses={[preview]} chrome={false} />
      </PartnerSection>

      <FeatureValueStrip code={d.courseCode} variant="council" />

      {/* MEETING MATERIALS, described where door 2 lands. */}
      <PartnerSection id={KIT_ANCHOR} title="Meeting materials" note="One folder, ready to hand out">
        <p className="max-w-[62ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          A printable flyer and a projector slide for every one of your {d.totalChapters} chapters —
          each with that chapter&apos;s own QR code — plus a one-page read-me, who I am, what is free
          and what a chapter can choose to sponsor, and a sample invoice so nothing is a surprise.
        </p>
        <div className="mt-4">
          <PartnerPrimary onClick={downloadKit}>{kitBusy ? "Building your download…" : "Download meeting materials →"}</PartnerPrimary>
        </div>
      </PartnerSection>
    </PartnerPageShell>
  );
}

const COUNCIL_FAQS = (course: string) => [
  { q: "Does this cost the council?", a: "No. Exam 1 is free. Chapters can choose to sponsor full-semester seats for Exams 2, 3 and the Final." },
  { q: "Is this actually built for our course?", a: `Yes. Survive is matched to your campus's intro accounting course (${course}), and students can match their professor for more specific coverage.` },
  { q: "What do I send my chapters?", a: "A ready-to-paste group-chat message with every chapter's own link, or each link one at a time — whichever fits how you already talk to your chapters." },
];
