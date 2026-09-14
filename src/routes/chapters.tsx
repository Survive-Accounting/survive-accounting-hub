// /chapters — the Greek front door. Phase 1 flips what this page leads with.
//
// It used to be signup-only: an exec typed their school, chapter, name, email and phone, verified
// over SMS, and only THEN got a link. That made sense when a chapter could not exist until someone
// created it. Every one of the GreekIntel chapters now has a live /go/ page, so the page leads
// with FIND YOUR CHAPTER; a chapter we genuinely don't have is handled inside the finder ("My
// chapter isn't listed" → ChapterSelfCreate), not by a second form on this page.
//
// ── THE FORM POP-IN, AND WHY THERE IS NO GATE ANY MORE ─────────────────────────────────────────
//
// The finder used to render an empty 148px box until `listGoSchools()` answered — a server call
// made AFTER hydration that paged every slugged chapter row (3,000+, four sequential PostgREST
// reads) only to decide whether migration 0115 had landed and the finder could be shown at all.
// Its result was not even used for the options (they come from the static school table). So the
// visible sequence was: shell paints → JS loads → hydrate → round-trip → form appears, roughly
// 1–2 s on a normal connection. 0115 was applied on 2026-08-17; the guard guarded nothing.
//
// Now the form shell is part of the server render: school options are static, course codes are
// loaded in the route loader (so they are in the SSR HTML, not a client fetch), and chapters are
// fetched only once a school is picked — inside the chapter control, which shows "Loading
// chapters…" in place while the rest of the form stays put.
//
// Navy/bolt/cream. Krug: one decision per screen, no field we don't need today.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";

import { ALL_SCHOOLS, schoolById, schoolBySlug } from "@/lib/schools";
import { councilBySlug } from "@/lib/greek-councils.functions";
import { isContactRef } from "@/lib/contact-ref";
import { TEST_CAMPUS_SLUG } from "@/lib/test-mode";
import { useRecordRefVisit } from "@/components/site/share/useRecordRefVisit";
import { ChapterFinder } from "@/components/site/ChapterFinder";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { readCampusPrefs } from "@/lib/campus-prefs.functions";
import { councilOgImage, ogMeta } from "@/lib/og";

import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { FitWordmark, SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

const FINDER_SCHOOLS = ALL_SCHOOLS.map((x) => ({ slug: x.slug, name: x.name }));

export const Route = createFileRoute("/chapters")({
  // noindex is deliberate (outreach funnel, not an SEO surface) and does NOT affect link
  // previews — iMessage/GroupMe read og tags regardless of robots.
  head: ({ match }) => {
    // THE CHAIR PORTAL'S CARD (Lee, 2026-09-14): the link a council exec shares with scholarship
    // chairs (school + council) previews as "[campus] [course] — Free Exam 1 Prep".
    const search = (match?.search ?? {}) as { school?: string; c?: string };
    const school = search.c && search.school ? (schoolBySlug(search.school) ?? schoolById(search.school)) : undefined;
    const meta = school
      ? ogMeta({
          title: `${school.name} ${school.courseCode ?? "Accounting"} — Free Exam 1 Prep`,
          description: "Cram videos and practice exams created by a pro tutor. Get ready for your first accounting exam—for free.",
          path: `/chapters?school=${encodeURIComponent(school.slug)}&c=${encodeURIComponent(search.c!)}`,
          image: councilOgImage(school.slug, search.c!),
        })
      : ogMeta({
          title: "Fraternities & sororities: find your chapter.",
          description: "Chapter seats for every member who needs intro accounting help. Find your chapter and claim it in 30 seconds.",
          path: "/chapters",
        });
    return { meta: [...meta, { name: "robots", content: "noindex" }] };
  },
  // ?school=<campus-slug> pre-selects the school in the finder — campus pages link here with
  // their own slug so a visitor never re-finds a school the link already named.
  //
  // ?c=<council> TURNS THIS INTO THE CHAIR PORTAL (2026-09-13). A council's academics chair shares
  // ONE link — /chapters?school=<campus>&c=ifc — with every chapter's scholarship chair (and the
  // council meeting slide's QR encodes the same link). Lee: "if IFC is sharing a link, we assume
  // it's going to a scholarship chair". The school is pre-filled, the chapter list is that
  // council's, and the pick opens the chapter's CHAIR page (/go), where that chair's own share kit
  // and dashboard activation live. Without ?c= the page is unchanged: members find their /learn page.
  // ?ref= is the council contact's DM ref; it is recorded here and rides the cookie onward.
  validateSearch: (s: Record<string, unknown>): { school?: string; c?: string; ref?: string } => ({
    ...(typeof s.school === "string" && s.school ? { school: s.school } : {}),
    ...(typeof s.c === "string" && councilBySlug(s.c) ? { c: s.c } : {}),
    ...(typeof s.ref === "string" && isContactRef(s.ref) ? { ref: s.ref } : {}),
  }),
  // Course codes for the picker rows, resolved on the server so the first paint already carries
  // them. Reference data that changes by hand, so ten minutes of route-level caching makes repeat
  // visits in the same session free. Best-effort: a code fetch failure costs the row its code,
  // never the page its form.
  // The stored campus (cookie) rides along so the school control is ALREADY filled in the server
  // render — not filled in by an effect a beat after the form appears.
  loader: async () => {
    const [codes, prefs] = await Promise.all([
      listCampusIntroCodes({ data: { ids: ALL_SCHOOLS.map((s) => s.campusId) } }).catch(() => []),
      readCampusPrefs().catch(() => ({ campus: null, profSkip: null })),
    ]);
    return { codes, storedSlug: schoolById(prefs.campus)?.slug ?? null };
  },
  staleTime: 600_000,
  component: ChaptersPage,
});

function ChaptersPage() {
  // M1.4 — navy overscroll, matching the meta theme-color.
  useNavyDocument();
  const theme = DEFAULT_FRAME_THEME;
  // THE SUBHEAD NAMES THEIR COURSE once the campus is known (?school= from a campus page, or the
  // remembered campus cookie). "Exam 1" is what we say to someone we cannot place; to a chapter at
  // a campus we HAVE mapped, the course code is the more specific promise. Never a guessed code —
  // a campus with no verified code keeps the generic line.
  const { school: preselect, c } = Route.useSearch();
  const { codes, storedSlug } = Route.useLoaderData();
  const slug = preselect ?? storedSlug ?? null;
  const campusId = slug ? schoolBySlug(slug)?.campusId : undefined;
  const council = c ? councilBySlug(c) : null;
  const schoolName = preselect ? schoolBySlug(preselect)?.name ?? null : null;
  // A council DM's click on its portal link counts on the DM console, like the /go pages do.
  useRecordRefVisit(campusId || null);
  const code = (campusId && codes.find((c) => c.campusId === campusId)?.code) || null;
  return (
    <div style={{ ...frameThemeVars(theme), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.34} animate /></div>
      {/* M1.5 — this page had NO route back to the landing page. Anyone arriving on a shared
          Greek-chapter link was simply stranded here. */}
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto", padding: "0 20px", width: "100%" }}>
        {/* THE PORTAL IS A HALLWAY. Its only job is getting someone to their chapter page, so it
            carries no argument of its own: no GPA headline, no benefit pills, no pricing, no
            dashboard proof, no setup form. All of that was written for an EXEC deciding whether to
            act, and an exec only reaches that decision on their own chapter's page — which is
            where it now lives. A visitor here has not yet told us who they are or which chapter
            they belong to, so anything persuasive is aimed at nobody in particular. */}
        <section className="flex flex-col items-center pt-10 pb-16 text-center sm:pt-14">
          {/* M1.2 — was a fixed 84px nowrap lockup, wider than a phone. */}
          <FitWordmark size={84} />
          {council && (
            <p className="mt-5 text-[12px] font-black uppercase" style={{ letterSpacing: "0.12em", color: "var(--accent)", fontFamily: BRAND_SANS }}>
              For scholarship chairs · {council.name}{schoolName ? ` · ${schoolName}` : ""}
            </p>
          )}
          <h1 className={`${council ? "mt-2" : "mt-5"} text-[26px] font-black sm:text-[32px]`} style={{ letterSpacing: "-0.01em" }}>Find your chapter.</h1>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed sm:text-[16px]" style={{ color: "var(--brand-cream)", opacity: 0.88, fontFamily: BRAND_SANS }}>
            {council
              ? "Pick your chapter to get your members' link, a GroupMe post and a flyer for the house."
              : code
              ? `${code} cram videos + practice exams for your whole chapter.`
              : "Exam 1 cram videos for your whole chapter."}
          </p>
          <div className="mt-6 w-full max-w-sm">
            <FindMyChapter />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

/** FIND MY CHAPTER — school + chapter -> the chapter's live /go/ page.
 *
 *  Rendered on the server, with the controls in the initial HTML. Nothing here waits on a query:
 *  the chapter list is the only dynamic data and it is fetched inside ChapterFinder once a school
 *  exists. */
function FindMyChapter() {
  const nav = useNavigate();
  const { school: preselect, c } = Route.useSearch();
  const { codes, storedSlug } = Route.useLoaderData();
  // THE TEST CAMPUS is never in a picker (schools.ts) — except here, when a test run's council link
  // names it, so King can walk council → chapter chair on the fixture.
  const schools = preselect === TEST_CAMPUS_SLUG ? [{ slug: TEST_CAMPUS_SLUG, name: schoolBySlug(TEST_CAMPUS_SLUG)?.name ?? "Test University" }, ...FINDER_SCHOOLS] : FINDER_SCHOOLS;

  // A SCHOOL THE SITE ALREADY KNOWS IS NOT ASKED AGAIN. The URL's ?school= wins (a campus page
  // sent them here naming itself); failing that, the campus the visitor implied or picked on an
  // earlier visit, read from the cookie by the loader so server and client agree.
  const stored = storedSlug ?? undefined;
  // THE LOADING STATE (Lee, 2026-09-14: "Need a loading animation once a scholarship chair chooses
  // their chapter"): the pick swaps the finder for the boiling bolt and "Opening <chapter>'s page…",
  // with a direct link if the page hasn't come up in 8 seconds.
  const [opening, setOpening] = useState<{ name: string; href: string } | null>(null);
  const [slow, setSlow] = useState(false);
  useEffect(() => { if (!opening) return; const t = window.setTimeout(() => setSlow(true), 8000); return () => window.clearTimeout(t); }, [opening]);
  if (opening) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 rounded-2xl px-5 py-7" style={{ background: "var(--bg-surface, rgba(22,34,61,0.9))", border: "1px solid var(--border-default, rgba(245,239,230,0.14))", fontFamily: BRAND_SANS }}>
        <BoltBoil height={62} />
        <div className="text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Opening {opening.name}&apos;s page…</div>
        <div className="h-1 w-full max-w-[220px] overflow-hidden rounded-full" style={{ background: "rgba(245,239,230,0.14)" }}>
          <div className="sa-open-bar h-full rounded-full" style={{ background: "var(--accent)" }} />
        </div>
        <style>{`@keyframes sa-open { from { transform: translateX(-100%); } to { transform: translateX(260%); } } .sa-open-bar { width: 40%; animation: sa-open 1.1s ease-in-out infinite; } @media (prefers-reduced-motion: reduce) { .sa-open-bar { animation: none; width: 100%; } }`}</style>
        {slow && <a href={opening.href} className="text-[12.5px] font-bold underline underline-offset-4" style={{ color: "var(--brand-cream)" }}>Taking a while? Tap to open it</a>}
      </div>
    );
  }

  return (
    <ChapterFinder
      key={preselect ?? stored ?? ""}
      // EVERY seeded school, not only those that already have chapters. A member at a campus
      // with no chapters yet is exactly who lazy creation exists for -- restricting the list to
      // schools we already scraped would lock out the people most worth hearing from.
      schools={schools}
      council={c}
      codes={codes}
      card
      escapeHatches
      // NO "GO" BUTTON: choosing the chapter IS the decision, so the pick navigates. The button
      // was a third click that confirmed the second one.
      autoPick
      initialSchool={preselect ?? stored}
      onPick={(school, chapter, chapterName) => {
        // The chair portal opens the chapter's CHAIR page; the member hallway opens /learn.
        if (c) {
          const href = `/go/${encodeURIComponent(school)}/${encodeURIComponent(chapter)}?from=${encodeURIComponent(c)}`;
          setOpening({ name: chapterName, href });
          void nav({ href });
          return;
        }
        const campus = schoolBySlug(school)?.id ?? school;
        setOpening({ name: chapterName, href: `/learn/${encodeURIComponent(campus)}/${encodeURIComponent(chapter)}` });
        void nav({ to: "/learn/{-$campus}/{-$chapter}", params: { campus, chapter } });
      }}
    />
  );
}
