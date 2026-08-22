// /partners/council/<school>/<council> — the personalised campus-council page.
//
// PUBLIC AND OUTBOUND, unlike /go/<school>/council/<council>?k=… (the private, token-linked
// command centre for a chair we are already working with). This is the page that goes in the cold
// email, so it is server-rendered, indexable-by-choice, and gated on nothing.
//
// IT KNOWS THE CAMPUS, so it uses the campus problem line — "ACCY 201 at Ole Miss is where GPAs
// quietly slip." — and wears that school's bolt colourway, exactly like the student campus page.
// A council officer seeing their own school's colours and their own course code is the entire
// argument that this is built for them and not a template.
import { createFileRoute, notFound } from "@tanstack/react-router";

import { PartnerPageShell } from "@/components/site/PartnerPage";
import {
  PartnerEntityTable, PartnerHero, PartnerMetrics, PartnerPrimary,
  PartnerRowAction, PartnerSecondary, PartnerSection, PartnerStatus, PartnerToolkit,
} from "@/components/site/PartnerKit";
import { getCouncilPartner } from "@/lib/partners.functions";
import { PARTNER_OFFER, problemHeadline } from "@/lib/partners";
import { boltForSlug } from "@/lib/schools";
import { boltCampusFor } from "@/components/site/bolt";
import { ogMeta } from "@/lib/og";

const ORIGIN = "https://surviveaccounting.com";

export const Route = createFileRoute("/partners/council/$school/$council")({
  // Server-loaded so the hero, the metric shells and the chapter table are all in the first byte.
  // Reference data that changes when a chapter is claimed — ten minutes of route cache is plenty.
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
  const bolt = boltForSlug(d.schoolSlug);
  const course = d.courseCode ?? "intro accounting";
  const shareUrl = `${ORIGIN}/chapters?school=${d.schoolSlug}`;

  const emailCopy = [
    `Subject: Free ${course} exam prep for every ${d.councilName} chapter`,
    ``,
    `Hey — quick one for your chapter's academics chair.`,
    ``,
    `Survive Accounting makes ${course} cram videos and practice exams for ${d.schoolName} students. Exam 1 is free for every member, and every chapter here already has its own page:`,
    ``,
    `${ORIGIN}/chapters?school=${d.schoolSlug}`,
    ``,
    `Takes about a minute to send to the house. No cost to the council.`,
  ].join("\n");

  const groupCopy = `Free ${course} exam prep for the whole house ⚡ Exam 1 is free — find our chapter here: ${shareUrl}`;

  return (
    <PartnerPageShell boltVars={bolt} faqs={COUNCIL_FAQS(d.councilName, course)}>
      <PartnerHero
        eyebrow={`${d.councilName} at ${d.schoolName}`}
        headline={problemHeadline(d.courseCode, d.schoolName)}
        subhead="Help every chapter get ahead of it."
        body={`Give your chapters free exam prep built specifically for ${course} at ${d.schoolName}. Exam 1 is free for every member, and every chapter already has its own page.`}
        bolt={[boltCampusFor(d.schoolSlug, { name: d.schoolName, code: d.courseCode })]}
        boltLabel={`${course} at ${d.schoolName}`}
        actions={
          <>
            <PartnerPrimary href="#toolkit">Share with all chapters</PartnerPrimary>
            <PartnerSecondary disabled title="Launch kits are still being built">Download launch kit</PartnerSecondary>
            <a href="sms:+16625658818" className="text-[14px] font-bold underline underline-offset-4" style={{ color: "var(--text-muted)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Questions? Text Lee →</a>
          </>
        }
      />

      <PartnerSection
        title={`${d.councilName} at ${d.schoolName}`}
        note="Live from the chapter roster this site already runs on."
      >
        <PartnerMetrics
          metrics={[
            { label: "Chapters on file", value: d.totalChapters },
            { label: "Claimed by an exec", value: d.claimedChapters },
            // NOT INSTRUMENTED YET. Rendered as an honest dash rather than a zero that reads as
            // "nobody uses this" or a number nobody measured. See partners.functions.ts.
            { label: "Students reached", value: null, empty: "not tracked yet" },
            { label: "Course supported", value: d.courseCode ?? "—", ...(d.courseCode ? {} : { empty: "no verified code yet" }) },
          ]}
        />
      </PartnerSection>

      <PartnerSection title="Your chapters" note="Every chapter already has a live page. Nothing to set up.">
        <PartnerEntityTable
          columns={[{ key: "chapter", label: "Chapter" }, { key: "status", label: "Status" }]}
          rows={d.chapters.map((c) => ({
            id: c.slug,
            cells: { chapter: c.name, status: <PartnerStatus claimed={c.claimed} /> },
            action: <PartnerRowAction href={c.goPath} />,
          }))}
        />
      </PartnerSection>

      <div id="toolkit" className="mt-14">
        <PartnerToolkit
          title="Share Survive with your chapters"
          items={[
            { title: "President email", body: "The note to send your chapter presidents. Ready to paste.", copy: emailCopy, cta: "Copy email →" },
            { title: "GroupMe / text", body: "One line for the group chat, with the campus link already in it.", copy: groupCopy, cta: "Copy message →" },
            { title: "Individual chapter links", body: "Every chapter's own page — the list above links straight to them.", href: `/chapters?school=${d.schoolSlug}`, cta: "View all links →" },
            { title: "Chapter flyers", body: "Printable flyers with each chapter's QR code.", cta: "Download flyers", soon: true },
          ]}
        />
      </div>

      <PartnerSection title="What your chapters get" note={PARTNER_OFFER + ", matched to the course they actually take."}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { t: "Quick cram videos", b: "Made for exams, not lectures." },
            { t: "Practice exams", b: "The problems that actually get tested." },
            { t: `Built for ${course}`, b: `Coverage matched to ${d.schoolName}, not a generic course.` },
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

const COUNCIL_FAQS = (council: string, course: string) => [
  { q: "What does this cost the council?", a: "Nothing. Exam 1 is free for every member of every chapter, whether or not the council does anything. Chapters that want the rest of the semester can sponsor seats, but that is a chapter decision, not a council one." },
  { q: "What do we actually have to do?", a: `Send one message. The toolkit above has the email and the group-chat line, both already carrying your campus link — chapters do the rest from their own pages.` },
  { q: "Do you share grades or performance?", a: "No. We never collect grades, and nothing on any council page ranks chapters by performance. The only thing shown is whether a chapter has claimed its page." },
  { q: "Is this matched to our course?", a: `Yes — ${course} at your campus, not a generic intro course. Coverage is mapped per campus and per professor where students tell us who teaches them.` },
  { q: `Which ${council} chapters are included?`, a: "All of them. Every chapter on the roster has a page already, claimed or not — that is what the list above is." },
];
