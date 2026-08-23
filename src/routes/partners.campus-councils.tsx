// /partners/campus-councils — the generic council page, linked from the footer.
//
// A visitor here has not told us which council they chair, so there is nothing personal to show.
// What it does instead: state the problem, hand them one control that finds THEIR council page
// (which has real chapters), and — the important change — SHOW the student product with a preview,
// rather than describing in cards what a council page "gives you". Show, don't tell.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { PartnerPageShell } from "@/components/site/PartnerPage";
import { PartnerHero, PartnerPrimary, PartnerSecondary, PartnerSection } from "@/components/site/PartnerKit";
import { StudentPreview, previewCampus } from "@/components/site/StudentPreview";
import { FeatureValueStrip } from "@/components/site/Marketing";
import { SearchPicker } from "@/components/site/SearchPicker";
import { COUNCILS } from "@/lib/greek-councils.functions";
import { LEE_PHONE_DISPLAY, LEE_SMS_HREF, problemHeadline } from "@/lib/partners";
import { ALL_SCHOOLS, boltForSlug, schoolBySlug } from "@/lib/schools";
import { boltCampusFor } from "@/components/site/bolt";
import { Bolt } from "@/components/canvas/brand";
import { ogMeta } from "@/lib/og";

const ORIGIN = "https://surviveaccounting.com";

/** A few campuses to demonstrate "we fit your campus" in the preview switcher — real schools with
 *  verified course codes, so the preview never shows an invented code. */
const SHOWCASE = ["ole-miss", "alabama", "texas-am", "lsu", "georgia"];

export const Route = createFileRoute("/partners/campus-councils")({
  head: () => ({
    meta: ogMeta({
      title: "For campus Greek councils — free intro accounting exam prep for every chapter.",
      description: "IFC, Panhellenic, NPHC and MGC councils: give every chapter on your campus free intro accounting exam prep, matched to the course your school actually teaches.",
      path: "/partners/campus-councils",
    }),
    links: [{ rel: "canonical", href: `${ORIGIN}/partners/campus-councils` }],
  }),
  component: CampusCouncilsPage,
});

function CampusCouncilsPage() {
  const nav = useNavigate();
  const [school, setSchool] = useState("");
  const [council, setCouncil] = useState("");
  const go = () => { if (school && council) void nav({ to: "/partners/council/$school/$council", params: { school, council } }); };

  // Preview switcher from the showcase schools, resolved off the school table so the code and href
  // are the real ones. Falls back gracefully if a slug is not in the table.
  const previews = SHOWCASE
    .map((id) => schoolBySlug(id) ?? ALL_SCHOOLS.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => previewCampus({ key: s!.slug, name: s!.name, code: s!.courseCode, primary: s!.c1 ?? "#C62828", secondary: s!.c2 ?? "#1565C0", href: `/${s!.slug}` }));

  return (
    <PartnerPageShell faqs={FAQS}>
      <PartnerHero
        eyebrow="For campus Greek councils"
        headline={problemHeadline()}
        subhead="Give every chapter on your campus a free way to prepare."
        body="Cram videos + practice exams built for their actual accounting course."
        bolt={SHOWCASE.map((slug) => boltCampusFor(slug))}
        boltLabel="Survive Accounting"
        actions={
          <>
            <PartnerPrimary href="#find-council">Find my council page →</PartnerPrimary>
            <PartnerSecondary href={LEE_SMS_HREF}>Text Lee {LEE_PHONE_DISPLAY}</PartnerSecondary>
          </>
        }
      />

      <PartnerSection id="find-council" title="Find your council page">
        <div className="grid max-w-md gap-2">
          <SearchPicker
            items={ALL_SCHOOLS.map((s) => ({
              value: s.slug, label: s.name, aliases: s.aliases,
              icon: <span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(s.slug)} /></span>,
            }))}
            value={school || null}
            placeholder="Pick your campus"
            searchPlaceholder={`Search ${ALL_SCHOOLS.length} schools…`}
            onPick={(v) => setSchool(v)}
          />
          <SearchPicker
            items={COUNCILS.map((c) => ({ value: c.slug, label: c.name, meta: c.full }))}
            value={council || null}
            placeholder="Pick your council"
            searchPlaceholder="IFC, Panhellenic, NPHC, MGC"
            onPick={(v) => { setCouncil(v); if (school) void nav({ to: "/partners/council/$school/$council", params: { school, council: v } }); }}
          />
          <button
            type="button" onClick={go} disabled={!school || !council}
            className="w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40"
            style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220" }}
          >
            Open my council page →
          </button>
        </div>
      </PartnerSection>

      {previews.length > 0 && (
        <PartnerSection title="What your chapters get" note="The same product, tailored to each campus — switch campuses to see.">
          <StudentPreview campuses={previews} label="Example preview" />
        </PartnerSection>
      )}

      <FeatureValueStrip code={null} />
    </PartnerPageShell>
  );
}

const FAQS = [
  { q: "Does this cost the council?", a: "No. Exam 1 is free. Chapters can choose to sponsor full-semester seats for Exams 2, 3 and the Final." },
  { q: "Is this actually built for our course?", a: "Yes. Survive is matched to your campus's intro accounting course, and students can match their professor for more specific coverage." },
  { q: "What do I send my chapters?", a: "We'll give you a ready-to-send president email, GroupMe message and a unique page for every chapter." },
];
