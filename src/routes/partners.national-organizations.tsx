// /partners/national-organizations — the generic national page, linked from the footer.
//
// Same shape as the council discovery page: problem first, then what a national org actually
// gets, then one control that takes them to their OWN page. The examples are the organizations
// with the widest campus coverage on our roster — real orgs, real campus counts, loaded on the
// server so the list is in the first byte.
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { PartnerPageShell } from "@/components/site/PartnerPage";
import { PartnerEntityTable, PartnerHero, PartnerPrimary, PartnerRowAction, PartnerSecondary, PartnerSection } from "@/components/site/PartnerKit";
import { listTopNationalPartners } from "@/lib/partners.functions";
import { PARTNER_OFFER, problemHeadline } from "@/lib/partners";
import { ALL_SCHOOLS, boltForSlug } from "@/lib/schools";
import { ogMeta } from "@/lib/og";

const ORIGIN = "https://surviveaccounting.com";
const SHOWCASE = ["ole-miss", "alabama", "tennessee", "kansas", "lsu"];

export const Route = createFileRoute("/partners/national-organizations")({
  loader: () => listTopNationalPartners().catch(() => []),
  staleTime: 600_000,
  head: () => ({
    meta: ogMeta({
      title: "For national organizations — free intro accounting exam prep for every chapter.",
      description: "Give your chapters free intro accounting exam prep matched to the course each campus actually teaches. Every chapter already has a page.",
      path: "/partners/national-organizations",
    }),
    links: [{ rel: "canonical", href: `${ORIGIN}/partners/national-organizations` }],
  }),
  component: NationalOrganizationsPage,
});

function NationalOrganizationsPage() {
  const orgs = Route.useLoaderData();
  const nav = useNavigate();

  return (
    <PartnerPageShell faqs={FAQS}>
      <PartnerHero
        eyebrow="For national organizations"
        headline={problemHeadline()}
        subhead="Give your chapters free exam prep matched to their campus."
        body={`${PARTNER_OFFER} for every member, on every campus you're on — matched to the intro accounting course that campus actually teaches. Every chapter already has its own page.`}
        bolt={SHOWCASE.map((slug) => {
          const s = ALL_SCHOOLS.find((x) => x.slug === slug);
          const b = boltForSlug(slug);
          return { id: slug, c1: b.c1, c2: b.c2, name: s?.name ?? slug, code: null };
        })}
        boltLabel="Survive Accounting"
        actions={
          <>
            <PartnerPrimary href="#your-org">Find your organization</PartnerPrimary>
            <PartnerSecondary href="sms:+16625658818">Questions? Text Lee →</PartnerSecondary>
          </>
        }
      />

      <PartnerSection
        id="your-org"
        title="Organizations already on the roster"
        note="Chapter pages exist for these today — open one to see exactly what your chapters would get."
      >
        <PartnerEntityTable
          columns={[{ key: "org", label: "Organization" }, { key: "campuses", label: "Campuses", align: "right" }]}
          rows={orgs.map((o) => ({
            id: o.orgSlug,
            cells: { org: o.orgName, campuses: o.campuses },
            action: (
              <button
                type="button"
                onClick={() => void nav({ to: "/partners/national/$org", params: { org: o.orgSlug } })}
                className="inline-flex items-center rounded-lg px-3 text-[13px] font-black"
                style={{ minHeight: 40, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
              >
                View page →
              </button>
            ),
          }))}
          empty="The roster is loading its organizations — text Lee and he'll open yours directly."
        />
        <p className="mt-3 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
          Not listed? <a href="/chapters" className="font-bold underline underline-offset-4" style={{ color: "var(--brand-cream)" }}>Find a chapter</a> or text Lee — most organizations are already on file.
        </p>
      </PartnerSection>

      <PartnerSection title="How campus matching works" note="This is the part a national office cannot do centrally, and the reason chapters actually use it.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { t: "1 · Campus", b: "Every campus has its own intro accounting course code on file — ACCY 201, AC 210, ACCT 2001." },
            { t: "2 · Chapter", b: "Each chapter has a live page at its own URL, claimed or not. Nothing to create." },
            { t: "3 · Student", b: "A member lands on their chapter's page and gets Exam 1 free, matched to their course." },
          ].map((v) => (
            <div key={v.t} className="rounded-2xl px-4 py-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
              <p className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>{v.t}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{v.b}</p>
            </div>
          ))}
        </div>
      </PartnerSection>

      <PartnerSection title="An example partner page" note="Same page your organization would get, built from the live roster.">
        <div className="flex flex-wrap gap-3">
          {orgs.slice(0, 3).map((o) => (
            <PartnerRowAction key={o.orgSlug} href={`/partners/national/${o.orgSlug}`} />
          ))}
          {!orgs.length && <PartnerPrimary href="/chapters">Find a chapter →</PartnerPrimary>}
        </div>
      </PartnerSection>
    </PartnerPageShell>
  );
}

const FAQS = [
  { q: "What does this cost the organization?", a: "Nothing. Exam 1 is free for every member on every campus. Chapters that want the rest of the semester can sponsor seats themselves." },
  { q: "Do we need to send you a chapter list?", a: "No. Chapters are already on the roster with live pages — the campus list on your page is built from it." },
  { q: "Do you collect grades?", a: "No. Grades are never collected, and nothing is reported to a national office as chapter performance." },
  { q: "How do chapters actually start?", a: "They open their own chapter page and members get Exam 1 free. The toolkit on your page has the email and social copy to send down the chain." },
  { q: "Can we get campus-specific links?", a: "Yes — every campus and every chapter has its own URL, and they are listed on your organization's page." },
];
