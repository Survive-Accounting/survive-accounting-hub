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
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { ChapterFinder } from "@/components/site/ChapterFinder";
import { ChapterGate } from "@/components/site/ChapterGate";
import { useChapterMember } from "@/lib/use-chapter-member";
import { ChapterStickyCta } from "@/components/site/ChapterStickyCta";
import { ChapterTop, CHAPTER_HERO_ID } from "@/components/site/ChapterTop";
import { ChapterAccess } from "@/components/site/ChapterAccess";
import { getGoChapter, listGoSchools, tagChapterMember, logGreekEvent } from "@/lib/greek-go.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { LandingPage } from "./landing";

/** Where both hero buttons scroll to. Ids live here so the hero and the sections agree. */
export const EXAM_ANCHOR = "exam1";
export const ACCESS_ANCHOR = "chapter-access";

export const Route = createFileRoute("/go/$school/$chapter")({
  // The course code is fetched HERE too, not left to a client query. Without it the headline
  // server-renders as "Intro Accounting is where..." and gains "(ACCY 201)" a moment later —
  // a smaller version of the very flash this loader exists to remove.
  loader: async ({ params }) => {
    const chapter = await getGoChapter({ data: { schoolSlug: params.school, chapterSlug: params.chapter } });
    if (!chapter) return { chapter: null, code: null };
    const codes = await listCampusIntroCodes({ data: { ids: [chapter.campusId] } }).catch(() => []);
    return { chapter, code: codes[0]?.code ?? null };
  },
  // Indexable, unlike /c/ (which was noindex because each link belonged to one private chapter).
  // These are public chapter pages and searching "<chapter> <school> accounting" should find them.
  // Now that the chapter is loaded server-side, the title can name it — which is also what shows
  // in a GroupMe or iMessage link preview, where most of these links are opened.
  head: ({ loaderData }) => {
    const ch = (loaderData as { chapter: Awaited<ReturnType<typeof getGoChapter>> } | undefined)?.chapter;
    return { meta: [{ title: ch ? `⚡ ${ch.chapterName} — free Exam 1 cram videos` : "⚡ Survive Accounting — Free Exam 1" }] };
  },
  component: GoChapterPage,
});

function GoChapterPage() {
  const { school, chapter } = Route.useParams();
  const { chapter: ch, code } = Route.useLoaderData();
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
    void logGreekEvent({ data: { kind: "visit", schoolSlug: school, chapterSlug: chapter } }).catch(() => {});
  }, [ch, school, chapter]);

  // Fire-and-forget member attribution. Saying "start Exam 1" on this chapter's own URL is the
  // attribution; nothing is awaited, so a failed tag can never stand between a student and the
  // free exam they came for.
  const tagMember = () => {
    void tagChapterMember({ data: { schoolSlug: school, chapterSlug: chapter, source: "link" } }).catch(() => {});
  };

  return (
    <>
      <LandingPage
        initialCampusId={ch?.campusId ?? undefined}
        // FROM PARAMS, NOT FROM THE FETCHED CHAPTER — see the note at the top of this file.
        campusSlug={school}
        initialCourseCode={code}
        goChapter={{ schoolSlug: school, chapterSlug: chapter }}
        // The chapter navbar variant — same-page anchors + the exec CTA. Passed from here (not
        // derived inside landing.tsx) because this route owns both anchor ids.
        greekNav={ch ? { examAnchor: EXAM_ANCHOR, accessAnchor: ACCESS_ANCHOR } : undefined}
        chapterTop={ch ? (
          <ChapterTop
            schoolSlug={school}
            chapterSlug={chapter}
            chapterName={ch.chapterName}
            schoolName={ch.schoolName}
            examAnchor={EXAM_ANCHOR}
            accessAnchor={ACCESS_ANCHOR}
            onStartExam={tagMember}
          />
        ) : undefined}
        chapterAccess={ch ? (
          <ChapterAccess
            id={ACCESS_ANCHOR}
            chapterName={ch.chapterName}
            schoolSlug={ch.schoolSlug}
            chapterSlug={ch.chapterSlug}
            letters={ch.letters}
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
          <ChapterStickyCta heroId={CHAPTER_HERO_ID} examAnchor={EXAM_ANCHOR} accessAnchor={ACCESS_ANCHOR} onStartExam={tagMember} />
        </>
      )}
    </>
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
        <div className="mx-auto max-w-sm rounded-xl p-4" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
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
