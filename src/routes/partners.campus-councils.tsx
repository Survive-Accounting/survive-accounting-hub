// /partners/campus-councils — the generic council page, linked from the footer.
//
// No dashboard here: a visitor who arrived from the footer has not told us which council they
// chair, so there is nothing real to show them. What it does instead is state the problem, show
// what a council actually gets, and hand them one control — pick your campus — that takes them to
// their OWN council page, which does have real chapters on it.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { PartnerPageShell } from "@/components/site/PartnerPage";
import { PartnerHero, PartnerPrimary, PartnerSecondary, PartnerSection } from "@/components/site/PartnerKit";
import { SearchPicker } from "@/components/site/SearchPicker";
import { COUNCILS } from "@/lib/greek-councils.functions";
import { PARTNER_OFFER, problemHeadline } from "@/lib/partners";
import { ALL_SCHOOLS, boltForSlug } from "@/lib/schools";
import { Bolt } from "@/components/canvas/brand";
import { ogMeta } from "@/lib/og";

const ORIGIN = "https://surviveaccounting.com";
/** The bolt sweeps a few campuses here too — the same "we fit your campus" demonstration the
 *  national page makes, without claiming any particular council uses us. */
const SHOWCASE = ["ole-miss", "alabama", "tennessee", "lsu", "georgia"];

export const Route = createFileRoute("/partners/campus-councils")({
  head: () => ({
    meta: ogMeta({
      title: "For campus councils — free intro accounting exam prep for every chapter.",
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

  return (
    <PartnerPageShell faqs={FAQS}>
      <PartnerHero
        eyebrow="For campus councils"
        headline={problemHeadline()}
        subhead="Help every chapter on your campus get ahead of it."
        body={`${PARTNER_OFFER} for every member of every chapter you govern — matched to the intro accounting course your campus actually teaches. Free for the council, free for Exam 1, nothing to install.`}
        bolt={SHOWCASE.map((slug) => {
          const s = ALL_SCHOOLS.find((x) => x.slug === slug);
          const b = boltForSlug(slug);
          return { id: slug, c1: b.c1, c2: b.c2, name: s?.name ?? slug, code: null };
        })}
        boltLabel="Survive Accounting"
        actions={
          <>
            <PartnerPrimary href="#your-council">Open your council&apos;s page</PartnerPrimary>
            <PartnerSecondary href="sms:+16625658818">Questions? Text Lee →</PartnerSecondary>
          </>
        }
      />

      <PartnerSection id="your-council" title="Open your council's page" note="Real chapters, real links — the page you would actually send to your chapters.">
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
            Open my council page ⚡
          </button>
        </div>
      </PartnerSection>

      <PartnerSection title="What a council page gives you" note="Everything below is live on your own page — nothing to set up.">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { t: "Every chapter, already listed", b: "Your council's chapters with their own live pages — claimed or not. No roster to upload." },
            { t: "Your campus's course", b: "The intro accounting code your school actually teaches, on the page and in the videos." },
            { t: "Share tools that work today", b: "A president email and a group-chat line, both carrying your campus link. Copy and send." },
            { t: "No cost, no contract, no grades", b: "Exam 1 is free for every member. We never collect grades and never rank chapters." },
          ].map((v) => (
            <div key={v.t} className="rounded-2xl px-4 py-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
              <p className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>{v.t}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{v.b}</p>
            </div>
          ))}
        </div>
      </PartnerSection>
    </PartnerPageShell>
  );
}

const FAQS = [
  { q: "What does this cost?", a: "Nothing for the council, and Exam 1 is free for every member of every chapter. Chapters that want the rest of the semester can sponsor seats — a chapter decision, not a council one." },
  { q: "Do we have to upload our chapter roster?", a: "No. Every chapter on your campus already has a page on this site, built from public roster data. Your council page lists them." },
  { q: "Do you report grades or rank chapters?", a: "Never. Grades are not collected at all, and no page ranks chapters by performance — the only status shown is whether a chapter has claimed its page." },
  { q: "Is the course really matched to our campus?", a: "Yes. Each campus has its own intro accounting course code on file and coverage is mapped to it, down to the professor where students tell us who teaches them." },
  { q: "What if my campus isn't listed?", a: "Text Lee and it gets added — most campuses are already on file, including the chapters." },
];
