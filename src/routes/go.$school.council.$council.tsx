// /go/<school>/council/<council> — THE COUNCIL CHAIR'S PAGE (2026-09-11), and with ?k=<token>
// the private council leaderboard it has been since 08-28.
//
// WITHOUT A TOKEN it is the DM destination for an IFC / Panhellenic / NPHC / MGC academics chair
// (Lee: "For IFC / For Panhellenic etc. need to ask for the school/campus and then take them to
// the share links"): ChairPromo — one headline, "See what chapters get" / "Share with chapters",
// the council meeting slide. No sign-up, no leaderboard, nothing private.
//
// WITH A TOKEN it is the unlisted leaderboard page. UNLISTED, NOT SECURE, AND THAT IS THE DESIGN:
// the token stops the page being stumbled upon or indexed; it is not auth, because the one thing
// this page must do is survive being forwarded. A bad token simply renders the public promo.
//
// NO GRADES. EVER. The leaderboard shows signups and nothing else: no GPA, no scores, no
// performance measure, per chapter or aggregated.
import { createFileRoute } from "@tanstack/react-router";
import { frameThemeVars } from "@/components/frames/frame-theme";
import { useNavyDocument } from "@/components/site/SiteHeader";
import { useState } from "react";

import { Bolt, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { CouncilForwardKit } from "@/components/site/CouncilForwardKit";
import { ChairPromo } from "@/components/site/ChairPromo";
import { getCouncilPage, type CouncilPage } from "@/lib/greek-councils.functions";
import { getCouncilPartner } from "@/lib/partners.functions";
import type { CouncilPartner } from "@/lib/partners";
import { boltForSlug, schoolBySlug } from "@/lib/schools";
import { isContactRef } from "@/lib/contact-ref";
import { useRecordRefVisit } from "@/components/site/share/useRecordRefVisit";
import { notifyChairAction } from "@/lib/chair-alerts.functions";
import { currentContactRef } from "@/lib/contact-ref";
import { ogMeta } from "@/lib/og";

export const Route = createFileRoute("/go/$school/council/$council")({
  // `k` is OPTIONAL in the type, not merely undefined-able: the public promo is navigated to with
  // no search at all (the council finder, the footer), and a required key would make every such
  // navigate() a type error.
  validateSearch: (s: Record<string, unknown>): { k?: string; ref?: string } => ({
    ...(typeof s.k === "string" ? { k: s.k } : {}),
    // ?ref=<contact uuid> — the DM console's click attribution; read by useRecordRefVisit below.
    ...(typeof s.ref === "string" && isContactRef(s.ref) ? { ref: s.ref } : {}),
  }),
  loaderDeps: ({ search }) => ({ k: search.k }),
  loader: async ({ params, deps }): Promise<{ page: CouncilPage | null; partner: CouncilPartner | null }> => {
    const page = deps.k
      ? await getCouncilPage({ data: { schoolSlug: params.school, councilSlug: params.council, token: deps.k } })
      : null;
    if (page) return { page, partner: null };
    const partner = await getCouncilPartner({ data: { schoolSlug: params.school, councilSlug: params.council } });
    return { page: null, partner };
  },
  head: ({ loaderData, params }) => {
    const d = loaderData as { partner: CouncilPartner | null } | undefined;
    const p = d?.partner;
    return {
      meta: [
        ...ogMeta({
          title: p ? `Free ${p.courseCode ?? "intro accounting"} exam prep for every ${p.councilName} chapter at ${p.schoolName}.` : "Survive Accounting for your council",
          description: "Cram videos and practice exams for the members taking it. Exam 1 is free for every chapter.",
          path: `/go/${params.school}/council/${params.council}`,
        }),
        // UNLISTED. A DM destination; also excluded from the sitemap, which lists public routes only.
        { name: "robots", content: "noindex, nofollow" },
      ],
    };
  },
  component: CouncilRoute,
});

function CouncilRoute() {
  const { page, partner } = Route.useLoaderData();
  const { school, council } = Route.useParams();
  const s = schoolBySlug(school);
  // A council chair's click on their DM link (?ref=) counts on the DM console, like a chapter's.
  useRecordRefVisit(s?.campusId ?? null);
  if (page) return <CouncilPage page={page} />;
  if (!partner) return <CouncilNotFound />;
  return (
    <ChairPromo
      kind="council"
      schoolSlug={school}
      schoolId={s?.id ?? school}
      schoolName={partner.schoolName}
      slug={council}
      name={partner.councilFull}
      letters={partner.councilName}
      shortName={partner.councilName}
      code={partner.courseCode}
      bolt={boltForSlug(school)}
      // The first share action on this council's page emails Lee; the DM link's ref says who.
      onAction={(action) => void notifyChairAction({ data: { kind: "council", schoolSlug: school, slug: council, name: partner.councilFull, action, ref: currentContactRef() } }).catch(() => {})}
    />
  );
}

function CouncilPage({ page }: { page: CouncilPage }) {
  useNavyDocument();
  const { k } = Route.useSearch();
  const { school } = Route.useParams();

  const bolt = boltForSlug(school);
  return (
    <div
      style={{
        ...frameThemeVars(),

        background: "var(--brand-navy)", color: "var(--brand-cream)", minHeight: "100vh",
        fontFamily: BRAND_SANS,
        ["--sa-bolt-1" as string]: bolt.c1, ["--sa-bolt-2" as string]: bolt.c2,
      }}
    >
      <main className="mx-auto w-full max-w-[760px] px-5 py-12">
        <header className="text-center">
          <div className="flex items-center justify-center gap-2.5">
            <span className="block shrink-0" style={{ width: 26 }} aria-hidden><Bolt c1="var(--sa-bolt-1)" c2="var(--sa-bolt-2)" /></span>
            <span className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
              {page.councilName} at {page.schoolName}
            </span>
          </div>
          <h1 className="mt-4 text-[26px] font-black leading-[1.14] sm:text-[32px]" style={{ fontFamily: BRAND_DISPLAY, letterSpacing: "-0.015em" }}>
            Intro accounting, chapter by chapter.
          </h1>
          <p className="mx-auto mt-3 max-w-[52ch] text-[15px] leading-relaxed" style={{ opacity: 0.86 }}>
            {page.courseCode ? <><span className="font-bold" style={{ color: "var(--accent)" }}>{page.courseCode}</span> is</> : "Intro accounting is"} where
            chapter GPAs quietly slip. Exam 1 is free for every chapter in {page.councilName}.
          </p>
        </header>

        <Leaderboard page={page} token={k} />
        <CouncilForwardKit page={page} token={k} />

        {/* THE CLOSE — one line, no pricing table. Council-wide cover is a conversation, and a
            price grid on a page whose job is forwarding would compete with the forward. */}
        <section className="mt-12 rounded-2xl px-5 py-6 text-center" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
          <p className="text-[14.5px]" style={{ color: "var(--brand-cream)" }}>
            Want your whole council covered for Exams 2, 3 and the Final?
          </p>
          <a href="sms:+16625658818" className="mt-3 inline-flex items-center gap-2 rounded-xl px-5 text-[14.5px] font-black" style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220" }}>
            Text Lee (662) 565-8818
          </a>
        </section>
      </main>
    </div>
  );
}

/** THE LEADERBOARD — participation only.
 *
 *  Zero-signup chapters stay on the board, at the bottom, each with a send-link action. Hiding them
 *  would remove the reason a chair does anything: the gap between the top of this list and the
 *  bottom IS the motivation. */
function Leaderboard({ page, token }: { page: CouncilPage; token?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copyLink = async (slug: string) => {
    const url = `https://surviveaccounting.com/go/${page.schoolSlug}/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(slug);
      window.setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1600);
      const { logCouncilAction } = await import("@/lib/greek-councils.functions");
      void logCouncilAction({ data: { schoolSlug: page.schoolSlug, councilSlug: page.councilSlug, token: token ?? "", action: "copy_chapter_link" } }).catch(() => {});
    } catch { /* clipboard blocked */ }
  };

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>PARTICIPATION</p>
        <p className="text-[13px] font-black" style={{ color: "var(--brand-cream)" }}>
          <span style={{ color: "var(--accent)" }}>{page.totalMembers}</span> member{page.totalMembers === 1 ? "" : "s"} across{" "}
          <span style={{ color: "var(--accent)" }}>{page.totalChapters}</span> chapter{page.totalChapters === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(245,239,230,0.12)" }}>
        <div className="grid items-center gap-2 px-4 py-2.5 text-[11px] font-black uppercase tracking-wide" style={{ gridTemplateColumns: "minmax(0,1fr) 5rem 6rem", background: "rgba(0,0,0,0.22)", color: "var(--text-muted)" }}>
          <span>Chapter</span><span className="text-right">Members</span><span className="text-right">Joined / wk</span>
        </div>
        {page.chapters.map((c) => (
          <div key={c.chapterSlug} className="grid items-center gap-2 border-t px-4 py-2.5" style={{ gridTemplateColumns: "minmax(0,1fr) 5rem 6rem", borderColor: "rgba(245,239,230,0.08)" }}>
            <span className="min-w-0 truncate text-[13.5px] font-bold" style={{ color: "var(--brand-cream)", opacity: c.members ? 1 : 0.72 }}>{c.chapterName}</span>
            {c.members ? (
              <>
                <span className="text-right text-[14px] font-black" style={{ color: "var(--accent)" }}>{c.members}</span>
                <span className="text-right text-[13px]" style={{ color: "var(--text-muted)" }}>{c.joinedThisWeek || "—"}</span>
              </>
            ) : (
              <>
                <span className="text-right text-[14px] font-black" style={{ color: "var(--text-muted)" }}>—</span>
                <span className="text-right">
                  <button type="button" onClick={() => void copyLink(c.chapterSlug)} className="rounded-lg px-2 py-1 text-[11.5px] font-bold" style={{ background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}>
                    {copied === c.chapterSlug ? "Copied ⚡" : "Send them the link"}
                  </button>
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Says exactly what these numbers are, and — as importantly — what they are not. */}
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        Counts update as members sign up. Nothing here shows grades.
      </p>
    </section>
  );
}

/** Unknown school or council, or a council with no chapters at that school. Recoverable: the
 *  finder on /partners/campus-councils lands on the right page. */
function CouncilNotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-5" style={{ ...frameThemeVars(), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_SANS }}>
      <div className="w-full max-w-sm text-center">
        <p className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>We couldn&apos;t find that council.</p>
        <p className="mx-auto mt-3 max-w-[36ch] text-[14px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Pick your school and council and we&apos;ll take you to the right page.
        </p>
        <a href="/partners/campus-councils" className="mt-5 inline-flex items-center rounded-xl px-6 text-[15px] font-black" style={{ minHeight: 50, background: "var(--accent)", color: "#0B1220" }}>
          Find my council
        </a>
      </div>
    </div>
  );
}
