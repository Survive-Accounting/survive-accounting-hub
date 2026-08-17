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
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { ChapterFinder } from "@/components/site/ChapterFinder";
import { ClaimChapter } from "@/components/site/ClaimChapter";
import { getGoChapter, listGoSchools, tagChapterMember } from "@/lib/greek-go.functions";
import { LandingPage } from "./landing";

export const Route = createFileRoute("/go/$school/$chapter")({
  // Indexable, unlike /c/ (which was noindex because each link belonged to one private chapter).
  // These are public chapter pages and searching "<chapter> <school> accounting" should find them.
  head: () => ({ meta: [{ title: "⚡ Survive Accounting — Free Exam 1" }] }),
  component: GoChapterPage,
});

function GoChapterPage() {
  const { school, chapter } = Route.useParams();
  const q = useQuery({
    queryKey: ["go-chapter", school, chapter],
    queryFn: () => getGoChapter({ data: { schoolSlug: school, chapterSlug: chapter } }),
    networkMode: "always",
    staleTime: 300_000,
  });
  const ch = q.data ?? null;
  return (
    <>
      <LandingPage
        initialCampusId={ch?.campusId ?? undefined}
        chapterBanner={ch ? ch.chapterName : undefined}
        goChapter={ch ? { schoolSlug: ch.schoolSlug, chapterSlug: ch.chapterSlug } : undefined}
      />
      {ch && <SelfReport current={ch.chapterName} />}
      {ch && <ClaimChapter schoolSlug={ch.schoolSlug} chapterSlug={ch.chapterSlug} chapterName={ch.chapterName} claimStatus={ch.claimStatus} />}
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
  const schoolsQ = useQuery({ queryKey: ["go-schools"], queryFn: () => listGoSchools(), enabled: open, networkMode: "always", staleTime: 600_000 });

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
          <ChapterFinder schools={schoolsQ.data ?? []} onPick={(s, c, n) => void pick(s, c, n)} cta="That's mine" busy={busy} />
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="text-[12.5px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
          Not in {current}? Tell me which chapter you&apos;re in →
        </button>
      )}
    </div>
  );
}
