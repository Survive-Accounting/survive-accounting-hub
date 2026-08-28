// /partners/national-organizations — the generic national page, linked from the footer.
//
// Rebuilt to the "show the product, make finding your org effortless" brief. The old page led with
// a table of orgs and a three-card explanation of how campus matching works. Now: the problem, a
// SEARCH box that finds your organization (not a table to scan), the actual student product as a
// preview, the standard value props, proof, three FAQs. The rotating campus bolt stays in the hero
// — it demonstrates national scale + per-campus tailoring without a paragraph claiming it.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { PartnerPageShell } from "@/components/site/PartnerPage";
import { PartnerHero, PartnerPrimary, PartnerSecondary, PartnerSection } from "@/components/site/PartnerKit";
import { StudentPreview, previewCampus } from "@/components/site/StudentPreview";
import { FeatureValueStrip } from "@/components/site/Marketing";
import { SearchPicker } from "@/components/site/SearchPicker";
import { NotListedForm } from "@/components/site/NotListedForm";
import { listTopNationalPartners } from "@/lib/partners.functions";
import { LEE_PHONE_DISPLAY, LEE_SMS_HREF, problemHeadline } from "@/lib/partners";
import { ALL_SCHOOLS, schoolBySlug } from "@/lib/schools";
import { boltCampusFor } from "@/components/site/bolt";
import { ogMeta } from "@/lib/og";

const ORIGIN = "https://surviveaccounting.com";
const SHOWCASE = ["ole-miss", "alabama", "texas-am", "kansas", "lsu"];

export const Route = createFileRoute("/partners/national-organizations")({
  loader: () => listTopNationalPartners().catch(() => []),
  staleTime: 600_000,
  head: () => ({
    meta: [
      ...ogMeta({
        title: "For national Greek organizations — free intro accounting exam prep for every chapter.",
        description: "Give your chapters free intro accounting exam prep matched to the course each campus actually teaches. Every chapter already has a page.",
        path: "/partners/national-organizations",
      }),
      // NOINDEX + UNLINKED (2026-08-28) — see the note on /partners/campus-councils. Parked on
      // /leeportal while Lee iterates; the page itself is untouched.
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `${ORIGIN}/partners/national-organizations` }],
  }),
  component: NationalOrganizationsPage,
});

function NationalOrganizationsPage() {
  const orgs = Route.useLoaderData();
  const nav = useNavigate();
  const [addOrg, setAddOrg] = useState(false);

  const previews = SHOWCASE
    .map((id) => schoolBySlug(id) ?? ALL_SCHOOLS.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => previewCampus({ key: s!.slug, name: s!.name, code: s!.courseCode, primary: s!.c1 ?? "#C62828", secondary: s!.c2 ?? "#1565C0", href: `/${s!.slug}` }));

  return (
    <PartnerPageShell faqs={FAQS}>
      <PartnerHero
        eyebrow="For national Greek organizations"
        headline={problemHeadline()}
        subhead="Give your chapters a free way to prepare."
        body="Cram videos + practice exams tailored campus by campus."
        bolt={SHOWCASE.map((slug) => boltCampusFor(slug))}
        boltLabel="Survive Accounting"
        actions={
          <>
            <PartnerPrimary href="#find-org">Find your organization →</PartnerPrimary>
            <PartnerSecondary href={LEE_SMS_HREF}>Text Lee {LEE_PHONE_DISPLAY}</PartnerSecondary>
          </>
        }
      />

      <PartnerSection id="find-org" title="Find your organization">
        <div className="grid max-w-md gap-2">
          <SearchPicker
            items={orgs.map((o) => ({ value: o.orgSlug, label: o.orgName, meta: `${o.campuses} campus${o.campuses === 1 ? "" : "es"}`, aliases: [o.orgShort] }))}
            value={null}
            placeholder="Search fraternities & sororities…"
            searchPlaceholder="Kappa Kappa Gamma, KKG, Kappa…"
            onPick={(v) => void nav({ to: "/partners/national/$org", params: { org: v } })}
          />
          <button type="button" onClick={() => setAddOrg(true)} className="justify-self-start text-[13.5px] font-bold underline underline-offset-4" style={{ color: "var(--accent)", minHeight: 44 }}>
            Don&apos;t see your organization? Add it →
          </button>
        </div>
      </PartnerSection>

      {previews.length > 0 && (
        <PartnerSection title="What your chapters get" note="The same product, tailored to each campus — switch campuses to see.">
          <StudentPreview campuses={previews} label="Example preview" />
        </PartnerSection>
      )}

      <FeatureValueStrip code={null} />

      {addOrg && (
        <div className="fixed inset-0 z-[400] grid place-items-center px-4" style={{ background: "rgba(4,8,18,0.66)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setAddOrg(false); }}>
          <NotListedForm kind="chapter" title="Which organization should I add?" onClose={() => setAddOrg(false)} />
        </div>
      )}
    </PartnerPageShell>
  );
}

const FAQS = [
  { q: "Does this cost the national organization?", a: "No. Exam 1 is free. Individual chapters can choose to sponsor full-semester seats for Exams 2, 3 and the Final." },
  { q: "Is this actually tailored to each campus?", a: "Yes. Each campus uses its own intro accounting course, and students can match their professor for more specific coverage." },
  { q: "What do we send our chapters?", a: "We'll give you ready-to-send email/text copy and a shareable page for each supported chapter." },
];
