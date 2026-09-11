// /go/<school>/<chapter> — THE CHAPTER CHAIR'S PAGE (rebuilt 2026-09-11).
//
// Lee: "The /go/ page is strictly for promotion to the IFC or chapter scholarship chairs." This is
// what a DM to a scholarship chair links to. It is NOT the student page any more — that is
// /learn/<school>/<chapter> — and it has no sign-up form, no gate, no player: one headline, two
// doors (see what members get / share with members), three value cards, and one quiet line to
// claim the exec dashboard. The body is ChairPromo; this file resolves the chapter and keeps the
// plumbing the old page had that still matters (the ref chain, the visit log, the claim sheet).
//
// A FLYER SCAN STILL LANDS A STUDENT ON THEIR PAGE. Every flyer and slide printed before today
// carries /go/…?s=flyer or ?via=slide. Those are members, not chairs, so beforeLoad forwards the
// stamped visit to the chapter's /learn page (after logging it, so exec dashboards keep counting
// flyer visits). New artwork encodes /learn directly (flyer.server.ts).
//
// THE /go NAMESPACE IS campuses.slug (university-of-tennessee-knoxville); /learn's is School.id
// (tennessee). schoolBySlug bridges them — an unknown slug falls back to itself, which /learn's
// schoolByAny also accepts.
import { createFileRoute, notFound, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { FitWordmark, SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { ALL_SCHOOLS, boltForSlug, canonicalSchoolName, schoolBySlug } from "@/lib/schools";
import { ChapterFinder } from "@/components/site/ChapterFinder";
import { useRecordRefVisit } from "@/components/site/share/useRecordRefVisit";
import { ClaimSheetHost, openClaimStep } from "@/components/site/ChapterAccess";
import { ChairPromo, type ChairClaim } from "@/components/site/ChairPromo";
import { getGoChapter, goPath, logGreekEvent } from "@/lib/greek-go.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { chapterShortName } from "@/components/site/ChapterShare";
import { chapterOgImage, chapterShareOg, HOME_OG, ogMeta } from "@/lib/og";

/** The share stamp on the current URL, or null. Reads `via` first, then the legacy `s=flyer`
 *  that every already-printed flyer QR carries. */
export const SHARE_VIA = ["link", "groupme", "text", "flyer", "slide", "campaign"] as const;
export type ShareStamp = (typeof SHARE_VIA)[number];
export function readVia(search: string): ShareStamp | null {
  const q = new URLSearchParams(search);
  const v = q.get("via");
  if (SHARE_VIA.includes(v as ShareStamp)) return v as ShareStamp;
  // Legacy: every flyer already printed and pinned up in a chapter house carries ?s=flyer.
  return q.get("s") === "flyer" ? "flyer" : null;
}

/** The stamps that mean "a member scanned something" — forwarded to the student page. */
const MEMBER_STAMPS: ReadonlySet<ShareStamp> = new Set<ShareStamp>(["flyer", "slide"]);

export const Route = createFileRoute("/go/$school/$chapter")({
  // A SCANNED FLYER OR SLIDE goes to the student page, not the chair's. The search object here
  // is the raw parsed query (this route validates none of it).
  beforeLoad: ({ params, search }) => {
    const q = search as Record<string, unknown>;
    const via: ShareStamp | null = typeof q.via === "string" && SHARE_VIA.includes(q.via as ShareStamp) ? (q.via as ShareStamp)
      : q.s === "flyer" ? "flyer" : null;
    if (!via || !MEMBER_STAMPS.has(via)) return;
    void logGreekEvent({ data: { kind: "visit", schoolSlug: params.school, chapterSlug: params.chapter, via } }).catch(() => {});
    throw redirect({
      to: "/learn/{-$campus}/{-$chapter}",
      params: { campus: schoolBySlug(params.school)?.id ?? params.school, chapter: params.chapter },
      replace: true,
    });
  },
  // The course code is fetched HERE too, not left to a client query, so the headline never
  // server-renders as "intro accounting" and gains "ACCT 200" a moment later.
  loader: async ({ params }) => {
    const chapter = await getGoChapter({ data: { schoolSlug: params.school, chapterSlug: params.chapter } });
    // A REAL 404, not a 200 that happens to say "not found": notFound() renders
    // notFoundComponent below AND sets the status, so crawlers and link checkers see a typo as
    // a typo. The component still offers the recovery path (finder + portal link).
    if (!chapter) throw notFound();
    const codes = await listCampusIntroCodes({ data: { ids: [chapter.campusId] } }).catch(() => []);
    return { chapter, code: codes[0]?.code ?? null };
  },
  // The full og/twitter set matters MORE here than anywhere: these links live in DMs, where the
  // card IS the first impression. Tokens come from the same loader the page body renders from.
  head: ({ loaderData, params }) => {
    const data = loaderData as { chapter: Awaited<ReturnType<typeof getGoChapter>>; code: string | null } | undefined;
    const ch = data?.chapter;
    if (!ch) return { meta: ogMeta({ ...HOME_OG, path: goPath(params.school, params.chapter) }) };
    const short = chapterShortName(ch.chapterName, ch.letters, ch.nickname);
    return {
      meta: ogMeta({
        ...chapterShareOg(data?.code ?? null, short),
        path: goPath(ch.schoolSlug, ch.chapterSlug),
        image: chapterOgImage(ch.schoolSlug, ch.chapterSlug),
      }),
    };
  },
  component: GoChapterPage,
  notFoundComponent: GoNotFoundRoute,
});

function GoNotFoundRoute() {
  const { school } = Route.useParams();
  return <GoNotFound schoolSlug={school} />;
}

function GoChapterPage() {
  const { school, chapter } = Route.useParams();
  const { chapter: ch, code } = Route.useLoaderData();

  // HOP 3 OF THE REF CHAIN: a tagged link travels here; the ref is read and cookied so it
  // survives whatever the visitor does next.
  useRecordRefVisit(ch?.campusId ?? null);

  // VISIT TRACKING. An exec sees interest before anyone signs up. Once per session, not per
  // render: this is a log, not a pageview firehose.
  useEffect(() => {
    if (!ch) return;
    const key = `sa-visit:${school}/${chapter}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* private mode — log it and move on */ }
    void logGreekEvent({ data: { kind: "visit", schoolSlug: school, chapterSlug: chapter, via: readVia(window.location.search) } }).catch(() => {});
  }, [ch, school, chapter]);

  // THE CLAIM STATE lives here so the quiet top line and the sheet agree after a submit.
  const [claim, setClaim] = useState<ChairClaim>(ch?.claimStatus ?? "unclaimed");

  // Every share action the chair takes is logged under the same kinds the old kit used, so the
  // exec dashboard's numbers carry on unchanged.
  const onAction = (action: "open_learn" | "copy_link" | "copy_groupme" | "flyer" | "slide") => {
    const ev = action === "copy_link" ? { kind: "copy_link" as const, via: "link" as const }
      : action === "copy_groupme" ? { kind: "copy_message" as const, via: "groupme" as const }
      : action === "flyer" ? { kind: "flyer_download" as const, via: "flyer" as const }
      : action === "slide" ? { kind: "flyer_download" as const, via: "slide" as const }
      : null;
    if (!ev) return;
    void logGreekEvent({ data: { ...ev, schoolSlug: school, chapterSlug: chapter } }).catch(() => {});
  };

  // The loader throws notFound(), so this branch only guards the type.
  if (!ch) return <GoNotFound schoolSlug={school} />;

  const letters = (ch.letters ?? "").trim() || chapterShortName(ch.chapterName, ch.letters, ch.nickname);
  return (
    <>
      <ChairPromo
        kind="chapter"
        schoolSlug={school}
        schoolId={schoolBySlug(school)?.id ?? school}
        schoolName={canonicalSchoolName(ch.schoolSlug, ch.schoolName)}
        slug={chapter}
        name={ch.chapterName}
        letters={letters}
        shortName={chapterShortName(ch.chapterName, ch.letters, ch.nickname)}
        code={code}
        bolt={boltForSlug(school)}
        claim={claim}
        onClaim={openClaimStep}
        onAction={onAction}
      />
      <ClaimSheetHost
        chapterName={ch.chapterName}
        schoolSlug={ch.schoolSlug}
        chapterSlug={ch.chapterSlug}
        letters={ch.letters}
        nickname={ch.nickname}
        claimStatus={ch.claimStatus}
        onChange={setClaim}
      />
    </>
  );
}

/** THE NOT-FOUND STATE for /go/<school>/<chapter>. Recoverable on the spot: if the school half of
 *  the URL is real, the finder opens on that school's chapter list (the most likely fix is a
 *  mistyped chapter); otherwise it starts from the school. Still a real page with the site
 *  header, never a bare error — and the loader marks the response 404 for crawlers. */
function GoNotFound({ schoolSlug }: { schoolSlug: string }) {
  useNavyDocument();
  const nav = useNavigate();
  const known = schoolBySlug(schoolSlug);
  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.34} animate /></div>
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto", padding: "0 20px", width: "100%" }}>
        <section className="flex flex-col items-center pt-10 pb-16 text-center sm:pt-14">
          <FitWordmark size={84} />
          <h1 className="mt-5 text-[26px] font-black sm:text-[32px]" style={{ letterSpacing: "-0.01em" }}>We couldn&apos;t find that chapter.</h1>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed sm:text-[16px]" style={{ color: "var(--brand-cream)", opacity: 0.88, fontFamily: BRAND_SANS }}>
            {known
              ? `The link named ${known.name} but no chapter matched the rest of it. Pick yours below and it will take you straight there.`
              : "That link doesn’t match a school or chapter we have. Find your chapter below, or start from the Greek portal."}
          </p>
          <div className="mt-6 w-full max-w-sm">
            <ChapterFinder
              schools={ALL_SCHOOLS.map((s) => ({ slug: s.slug, name: s.name }))}
              card
              escapeHatches
              autoPick
              initialSchool={known?.slug}
              onPick={(s, c) => void nav({ to: "/go/$school/$chapter", params: { school: s, chapter: c } })}
            />
          </div>
          <a href="/chapters" className="mt-5 inline-flex items-center text-[14px] font-bold underline underline-offset-4" style={{ color: "var(--text-muted)", minHeight: 44, fontFamily: BRAND_SANS }}>
            Go to the Greek portal →
          </a>
        </section>
      </main>
    </div>
  );
}
