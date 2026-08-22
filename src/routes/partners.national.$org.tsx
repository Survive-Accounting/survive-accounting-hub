// /partners/national/<org> — the personalised national-organization page.
//
// A national exec has no single campus and no single course code, so the hero uses the
// course-neutral problem line and the bolt SWEEPS through the campuses this org actually has
// chapters on — each one in that school's colours, with its real course code under it. That
// rotation IS the pitch: "we adapt to every campus you're on" is a claim on a slide and a
// demonstration here.
//
// ?campus=<slug> pins the bolt to one campus instead of rotating — for the version of this link
// sent to a chapter or a campus-specific conversation.
import { createFileRoute, notFound } from "@tanstack/react-router";

import { PartnerPageShell } from "@/components/site/PartnerPage";
import {
  PartnerEntityTable, PartnerHero, PartnerMetrics, PartnerPrimary, PartnerRowAction,
  PartnerSecondary, PartnerSection, PartnerStatus, PartnerToolkit,
} from "@/components/site/PartnerKit";
import { getNationalPartner } from "@/lib/partners.functions";
import { PARTNER_OFFER, problemHeadline } from "@/lib/partners";
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

  // ONE STOP PER CAMPUS, in the org's own campus order, deduped: the bolt sweeps through the
  // schools this org is actually on, wearing each school's colours and naming its real course
  // code. Never an invented code — a campus with none simply shows its name.
  const stops: BoltCampus[] = (() => {
    const seen = new Set<string>();
    const all = d.campuses.filter((c) => (seen.has(c.schoolSlug) ? false : (seen.add(c.schoolSlug), true)));
    const list = pinned ? all.filter((c) => c.schoolSlug === pinned) : all;
    const use = (list.length ? list : all).slice(0, 12);
    return use.map((c) => boltCampusFor(c.schoolSlug, { name: c.schoolName, code: c.courseCode }));
  })();

  const shareUrl = `${ORIGIN}/chapters`;
  const emailCopy = [
    `Subject: Free intro accounting exam prep for ${d.orgShort} chapters`,
    ``,
    `Hi — sharing something your chapters can use this semester.`,
    ``,
    `Survive Accounting makes intro accounting cram videos and practice exams matched to the course each campus actually teaches. Exam 1 is free for every member, and ${d.orgShort} chapters on ${d.totalCampuses} campuses already have their own pages.`,
    ``,
    `Chapters find theirs here: ${shareUrl}`,
    ``,
    `No cost to the organization.`,
  ].join("\n");
  const socialCopy = `Free intro accounting exam prep for every ${d.orgShort} chapter ⚡ matched to your campus's own course — find your chapter: ${shareUrl}`;

  return (
    <PartnerPageShell faqs={NATIONAL_FAQS(d.orgShort)}>
      <PartnerHero
        eyebrow={`${d.orgShort} × Survive Accounting`}
        headline={problemHeadline()}
        subhead={`Help every ${d.orgShort} chapter get ahead of it.`}
        body={`Give students nationwide free intro accounting exam prep matched to the course they actually take on their campus.`}
        bolt={stops}
        boltLabel={`Campuses with ${d.orgShort} chapters`}
        actions={
          <>
            <PartnerPrimary href="#toolkit">Share with chapters</PartnerPrimary>
            <PartnerSecondary disabled title="National launch kits are still being built">Download national launch kit</PartnerSecondary>
            <a href="sms:+16625658818" className="text-[14px] font-bold underline underline-offset-4" style={{ color: "var(--text-muted)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Questions? Text Lee →</a>
          </>
        }
      />

      <PartnerSection title={`${d.orgShort} on Survive`} note="Live from the chapter roster this site already runs on.">
        <PartnerMetrics
          metrics={[
            { label: "Campuses supported", value: d.totalCampuses },
            { label: "Course code mapped", value: `${d.codedCampuses} / ${d.totalCampuses}` },
            { label: "Chapters claimed", value: d.claimedChapters },
            { label: "Students reached", value: null, empty: "not tracked yet" },
          ]}
        />
      </PartnerSection>

      <PartnerSection title="Campuses" note="Each chapter's page is the one that already exists — no second link to manage.">
        <PartnerEntityTable
          columns={[
            { key: "campus", label: "Campus" },
            { key: "course", label: "Course" },
            { key: "status", label: "Chapter status" },
          ]}
          rows={d.campuses.map((c) => ({
            id: `${c.schoolSlug}/${c.chapterSlug}`,
            cells: {
              campus: c.schoolName,
              course: c.courseCode ?? <span style={{ color: "var(--text-tertiary)" }}>—</span>,
              status: <PartnerStatus claimed={c.claimed} />,
            },
            action: <PartnerRowAction href={c.goPath} />,
          }))}
        />
      </PartnerSection>

      <div id="toolkit" className="mt-14">
        <PartnerToolkit
          title="Share Survive with your chapters"
          items={[
            { title: "Email to chapter presidents", body: "The note to send down the chain. Ready to paste.", copy: emailCopy, cta: "Copy email →" },
            { title: "Chapter social copy", body: "One line for a chapter group chat or story.", copy: socialCopy, cta: "Copy message →" },
            { title: "Campus-specific links", body: "Every campus's chapter finder, already scoped to that school.", href: "/chapters", cta: "View all links →" },
            { title: "Chapter flyers", body: "Printable flyers with each chapter's QR code.", cta: "Download flyers", soon: true },
            { title: "Launch instructions", body: "The one-page rollout for a chapter academics chair.", cta: "Open instructions", soon: true },
          ]}
        />
      </div>

      <PartnerSection title="What your chapters get" note={`${PARTNER_OFFER}, matched campus by campus.`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { t: "Quick cram videos", b: "Made for exams, not lectures." },
            { t: "Practice exams", b: "The problems that actually get tested." },
            { t: "Matched per campus", b: "Each chapter sees their own campus's course, not a generic one." },
          ].map((v) => (
            <div key={v.t} className="rounded-2xl px-4 py-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
              <p className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>{v.t}</p>
              <p className="mt-1 text-[13.5px]" style={{ color: "var(--text-muted)" }}>{v.b}</p>
            </div>
          ))}
        </div>
      </PartnerSection>
    </PartnerPageShell>
  );
}

const NATIONAL_FAQS = (org: string) => [
  { q: "What does this cost the organization?", a: "Nothing. Exam 1 is free for every member on every campus. Chapters that want the rest of the semester can sponsor seats themselves — that is a chapter decision." },
  { q: "How is it matched to each campus?", a: "Every campus has its own intro accounting course code on file, and coverage is mapped to it. A chapter at one school sees that school's course; nothing is generic." },
  { q: "Do you share grades or member data?", a: "No. Grades are never collected. A chapter's own exec can see who from their chapter signed up; nothing is reported upward as performance." },
  { q: `Which ${org} chapters are included?`, a: "Every chapter we have on the roster already has a live page, claimed or not. The campus list above is that roster." },
  { q: "What do you need from us?", a: "One message down the chain. The toolkit above has the email and the social copy; chapters take it from there." },
];
