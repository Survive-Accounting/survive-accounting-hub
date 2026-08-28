// /go/<school>/<chapter> — THE canonical Greek chapter page. Replaces /c/<slug>, which is now a
// 301 into here (see c.$slug.tsx).
//
// Two things changed from /c/:
//
//   1. Every chapter is public from day one. /c/ could only exist once an exec signed up, so 1,107
//      real chapters were unreachable. These pages resolve straight off the GreekIntel roster, so a
//      chapter has a URL before anyone claims it — which is what makes outreach possible at all.
//
//   2. The URL says which school. /c/olemiss-ato was one flat namespace where 'ato' at sixteen
//      different campuses had to fight over one slug; (school, chapter) is unique per campus.
//
// Never gates and never 404s: an unknown school or chapter falls through to the plain landing page
// rather than a dead end, because these URLs go on printed flyers and QR codes that outlive typos.
//
// ── THE OLD-PAGE FLASH, AND WHY IT IS A LOADER NOW ────────────────────────────────────────────
//
// This route used to fetch the chapter with a client-side useQuery. That meant `ch` was null for
// the server render AND the first client paint, so the page fell back to the GENERIC student hero
// ("Cram what's on your exam.") and swapped to the chapter version a moment later. It was not a
// hydration mismatch or a cache artifact — the server was genuinely sending the wrong page. Proof
// from production HTML before this change: "On-demand tutoring videos" appeared twice while
// "Alpha Chi Omega", "ACCY 201" and the chapter headline appeared zero times.
//
// A loader fixes it at the source: the data is fetched during SSR, so the FIRST meaningful paint
// is already this chapter's page. No timeout, and no skeleton needed in the common case.
//
// The same bug had a second half. CampusProvider was handed the school slug from the QUERY RESULT,
// so campus was UNKNOWN during that window and the hero cycled other schools' colourways before
// locking. The slug is in the URL and available synchronously — it is passed from params now, so
// campus context is correct on the very first render even if the chapter lookup were slow.
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { FitWordmark, SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { ALL_SCHOOLS, schoolBySlug } from "@/lib/schools";
import { ChapterFinder } from "@/components/site/ChapterFinder";
import { ChapterGate } from "@/components/site/ChapterGate";
import { useChapterMember } from "@/lib/use-chapter-member";
import { ChapterStickyCta } from "@/components/site/ChapterStickyCta";
import { MARKETING_HERO_ID } from "@/components/site/Marketing";
import { ChapterAccess } from "@/components/site/ChapterAccess";
import { getGoChapter, goPath, listGoSchools, tagChapterMember, logGreekEvent } from "@/lib/greek-go.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { readCampusPrefs } from "@/lib/campus-prefs.functions";
import { chapterShortName, chapterUrl } from "@/components/site/ChapterShare";
import { ChapterDoors, SHARE_ANCHOR } from "@/components/site/chapter/ChapterDoors";
import { scrollToId } from "@/lib/ui-scroll";
import { canonicalSchoolName } from "@/lib/schools";
import { HOME_OG, ogMeta } from "@/lib/og";
import { LandingPage } from "./landing";

/** Where both hero buttons scroll to. Ids live here so the hero and the sections agree. */
export const EXAM_ANCHOR = "exam1";
export const ACCESS_ANCHOR = SHARE_ANCHOR;

export const Route = createFileRoute("/go/$school/$chapter")({
  // The course code is fetched HERE too, not left to a client query. Without it the headline
  // server-renders as "Intro Accounting is where..." and gains "(ACCY 201)" a moment later —
  // a smaller version of the very flash this loader exists to remove.
  loader: async ({ params }) => {
    const [chapter, prefs] = await Promise.all([
      getGoChapter({ data: { schoolSlug: params.school, chapterSlug: params.chapter } }),
      readCampusPrefs().catch(() => ({ campus: null, profSkip: null })),
    ]);
    // A REAL 404, not a 200 that happens to say "not found": notFound() renders
    // notFoundComponent below AND sets the status, so crawlers and link checkers see a typo as
    // a typo. The component still offers the recovery path (finder + portal link).
    if (!chapter) throw notFound();
    const codes = await listCampusIntroCodes({ data: { ids: [chapter.campusId] } }).catch(() => []);
    return { chapter, code: codes[0]?.code ?? null, profSkip: prefs.profSkip };
  },
  // Indexable, unlike /c/ (which was noindex because each link belonged to one private chapter).
  // These are public chapter pages and searching "<chapter> <school> accounting" should find them.
  // The full og/twitter set matters MORE here than anywhere: these links live in GroupMe and
  // iMessage, where the card IS the first impression. Tokens come from the same loader the page
  // body renders from — shorthand via chapterShortName (nickname → letters → derivation), campus
  // via the canonical school table, course code degrading to "Intro Accounting" exactly like the
  // hero headline does. An unresolvable chapter falls back to the HOME card.
  head: ({ loaderData, params }) => {
    const data = loaderData as { chapter: Awaited<ReturnType<typeof getGoChapter>>; code: string | null } | undefined;
    const ch = data?.chapter;
    if (!ch) return { meta: ogMeta({ ...HOME_OG, path: goPath(params.school, params.chapter) }) };
    const short = chapterShortName(ch.chapterName, ch.letters, ch.nickname);
    const campus = canonicalSchoolName(ch.schoolSlug, ch.schoolName);
    const course = data?.code ?? "Intro Accounting";
    return {
      meta: ogMeta({
        title: `${short} at ${campus} — get ${course} help.`,
        description: `Cram videos + practice exams for every ${short} member. Instant access. Exam 1 is free.`,
        path: goPath(ch.schoolSlug, ch.chapterSlug),
        image: `https://surviveaccounting.com/api/og/${ch.schoolSlug}/${ch.chapterSlug}`,
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

/** The share stamp on the current URL, or null. Reads `via` first, then the legacy `s=flyer`
 *  that every already-printed flyer QR carries. */
export const SHARE_VIA = ["link", "groupme", "flyer", "campaign", "slide"] as const;
export type ShareStamp = (typeof SHARE_VIA)[number];
export function readVia(search: string): ShareStamp | null {
  const q = new URLSearchParams(search);
  const v = q.get("via");
  if (SHARE_VIA.includes(v as ShareStamp)) return v as ShareStamp;
  // Legacy: every flyer already printed and pinned up carries ?s=flyer.
  return q.get("s") === "flyer" ? "flyer" : null;
}

function GoChapterPage() {
  const { school, chapter } = Route.useParams();
  const { chapter: ch, code, profSkip } = Route.useLoaderData();
  const { signedIn } = useChapterMember(school, chapter);

  // VISIT TRACKING. An exec should be able to see interest BEFORE anyone signs up — a chapter
  // that shared the link and got 40 visits and 3 accounts is a different conversation from one
  // that got 2 visits. Once per session, not per render: this is a log, not a pageview firehose.
  useEffect(() => {
    if (!ch) return;
    const key = `sa-visit:${school}/${chapter}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* private mode — log it and move on */ }
    // WHERE THIS VISIT CAME FROM. `via` is the current stamp (share kit + new flyers); `s=flyer`
    // is read as a legacy alias so the flyers already printed and pinned up in chapter houses
    // keep attributing. Anything unrecognised is dropped rather than logged as junk.
    void logGreekEvent({ data: { kind: "visit", schoolSlug: school, chapterSlug: chapter, via: readVia(window.location.search) } }).catch(() => {});
  }, [ch, school, chapter]);

  // Fire-and-forget member attribution. Saying "start Exam 1" on this chapter's own URL is the
  // attribution; nothing is awaited, so a failed tag can never stand between a student and the
  // free exam they came for.
  const tagMember = () => {
    void tagChapterMember({ data: { schoolSlug: school, chapterSlug: chapter, source: "link" } }).catch(() => {});
  };

  // THE RIGHT DOOR. On a phone the fastest share is no UI at all: hand the native sheet the
  // chapter link and let them pick GroupMe/Messages themselves. The kit still renders below for
  // everything the sheet can't do (the flyer, the GroupMe wording), and desktop just scrolls to
  // it. A cancelled share is not an error — the section is already on screen either way.
  const openShare = () => {
    const url = chapterUrl(school, chapter, "link");
    const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"
      && typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches;
    if (canShare) {
      void navigator.share({ title: "Survive Accounting", url }).catch(() => {});
      void logGreekEvent({ data: { kind: "copy_link", schoolSlug: school, chapterSlug: chapter, via: "link" } }).catch(() => {});
    }
    scrollToId(SHARE_ANCHOR);
  };

  // AN UNKNOWN CHAPTER IS SAID OUT LOUD (see notFoundComponent). These URLs go out in outreach; a
  // typo used to render the generic homepage with no explanation, which to the exec who received
  // it looked like the product did not know their chapter. The loader throws notFound(), so this
  // branch only guards the type.
  // (Placed after every hook so the hook order never depends on data.)
  if (!ch) return <GoNotFound schoolSlug={school} />;

  return (
    <>
      <LandingPage
        initialCampusId={ch?.campusId ?? undefined}
        // FROM PARAMS, NOT FROM THE FETCHED CHAPTER — see the note at the top of this file.
        campusSlug={school}
        initialCourseCode={code}
        profSkipFor={profSkip}
        goChapter={{ schoolSlug: school, chapterSlug: chapter }}
        // The chapter navbar variant — same-page anchors + the exec CTA. Passed from here (not
        // derived inside landing.tsx) because this route owns both anchor ids.
        greekNav={ch ? { examAnchor: EXAM_ANCHOR, accessAnchor: ACCESS_ANCHOR } : undefined}
        // GREEK MARKETING CONTEXT — data, not a hero element. The shared MarketingHero renders
        // the eyebrow + letters CTAs from this; claim state comes straight from getGoChapter.
        greek={ch ? {
          orgName: ch.chapterName,
          letters: (ch.letters ?? "").trim() || chapterShortName(ch.chapterName, ch.letters, ch.nickname),
          claimed: ch.claimStatus === "claimed",
          accessAnchor: ACCESS_ANCHOR,
        } : undefined}
        onStartExam={tagMember}
        // THE TWO DOORS replace the hero CTA row + big bolt (2026-08-28). Left door = the same
        // action the old "Start Exam 1 Free" had (attribution + scroll to the player).
        greekDoors={({ onStart }) => (
          <ChapterDoors
            code={code}
            letters={(ch.letters ?? "").trim() || chapterShortName(ch.chapterName, ch.letters, ch.nickname)}
            sponsored={ch.sponsored}
            onStartExam={onStart}
            onShare={openShare}
          />
        )}
        chapterAccess={ch ? (
          <ChapterAccess
            id={ACCESS_ANCHOR}
            chapterName={ch.chapterName}
            schoolSlug={ch.schoolSlug}
            chapterSlug={ch.chapterSlug}
            letters={ch.letters}
            nickname={ch.nickname}
            claimStatus={ch.claimStatus}
          />
        ) : undefined}
        // Gate the VIDEO until there is an account. `signedIn === null` means the session is
        // still being read — showing the gate then would flash it at someone already signed in.
        videoGate={ch && signedIn === false ? <ChapterGate chapterName={ch.chapterName} /> : undefined}
        greekOrg={ch ? ch.chapterName : undefined}
      />
      {/* Self-report stays at the foot: it is a STUDENT correction ("I'm in a different house"),
          worth offering but never worth interrupting the reason they came. It is also the ONLY
          chapter-discovery control left on a chapter page — the picker's "Change school" is gone,
          because a visitor on FarmHouse · Oklahoma is already somewhere specific. */}
      {ch && <SelfReport current={ch.chapterName} />}
      {ch && (
        <>
          {/* Spacer so the fixed bar can never sit on top of the page's last content (the
              self-report link) when scrolled to the bottom. Same breakpoint as the bar. */}
          <div aria-hidden className="h-16 md:hidden" />
          <ChapterStickyCta heroId={MARKETING_HERO_ID} examAnchor={EXAM_ANCHOR} accessAnchor={ACCESS_ANCHOR} onStartExam={tagMember} />
        </>
      )}
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

/** SELF-REPORT — "I'm actually in a different chapter."
 *
 *  Chapter links get forwarded. A student who lands here from a friend in another house is
 *  currently credited to whichever chapter's flyer they happened to scan, which quietly makes every
 *  chapter's member count wrong. This lets them say so, and writes the attribution with source
 *  "self_report" so a banked member from a forwarded link is distinguishable from one who came
 *  through the chapter's own URL.
 *
 *  Deliberately at the FOOT of the page and deliberately closed: the student came to study, and a
 *  question about their social life is not worth interrupting that for. */
function SelfReport({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [schools, setSchools] = useState<Array<{ slug: string; name: string }>>([]);

  // Loaded on demand — this is a foot-of-page escape hatch almost nobody opens, and it should not
  // cost every visitor a request.
  const openIt = () => {
    setOpen(true);
    if (!schools.length) void listGoSchools().then(setSchools).catch(() => {});
  };

  const pick = async (schoolSlug: string, chapterSlug: string, chapterName: string) => {
    setBusy(true);
    try {
      await tagChapterMember({ data: { schoolSlug, chapterSlug, source: "self_report" } });
      setDone(chapterName);
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-[640px] px-5 pb-14 text-center" style={{ fontFamily: BRAND_SANS }}>
      {done ? (
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Got it — you&apos;re counted with {done}. ⚡</p>
      ) : open ? (
        <div className="mx-auto max-w-sm rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
          <p className="mb-3 text-[13px] font-bold" style={{ color: "var(--brand-cream)" }}>Which chapter are you actually in?</p>
          <ChapterFinder schools={schools} onPick={(s, c, n) => void pick(s, c, n)} cta="That&apos;s mine" busy={busy} />
        </div>
      ) : (
        <button onClick={openIt} className="text-[12.5px] underline underline-offset-4" style={{ color: "var(--text-muted)", minHeight: 44, paddingBlock: 6 }}>
          Not in {current}? Tell me which chapter you&apos;re in →
        </button>
      )}
    </div>
  );
}
