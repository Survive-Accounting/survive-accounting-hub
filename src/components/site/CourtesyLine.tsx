// "EXAMS 2, 3 AND THE FINAL — COURTESY OF <CHAPTER>."
//
// The visible payoff for the exec who spent the money. Everything else the chapter buys is on a
// dashboard only exec sees; this is the one moment an ordinary member is told their chapter did
// something for them.
//
// IT IS SHOWN ONLY WHEN IT IS TRUE. Three earlier versions of this idea were removed for
// overclaiming — "Free Exam 1, courtesy of X" appeared on pages where Exam 1 was free for
// everyone, which credited the chapter for nothing. So the rule here is narrow: this renders only
// when the signed-in visitor holds an entitlement whose greek_chapter_id is THIS chapter and whose
// source is 'greek_seat'. A member who bought the semester themselves sees nothing — their money,
// not the chapter's.
//
// Signed out, unknown chapter, expired seat, or any error ⇒ renders nothing at all. A line that
// says a chapter paid for you is not worth guessing at.
import { useEffect, useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { getChapterSeatStatus } from "@/lib/greek-seats.functions";
import { supabase } from "@/integrations/supabase/client";

export function CourtesyLine({ schoolSlug, chapterSlug, chapterName }: {
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
}) {
  const [seated, setSeated] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;                       // signed out — nothing to claim
        const r = await getChapterSeatStatus({ data: { accessToken: token, schoolSlug, chapterSlug } });
        if (live && r.seated) setSeated(true);
      } catch { /* stays hidden */ }
    })();
    return () => { live = false; };
  }, [schoolSlug, chapterSlug]);

  if (!seated) return null;

  return (
    <div
      className="mx-auto mt-4 flex w-full max-w-[640px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center"
      style={{ background: "rgba(252,163,17,0.12)", border: "1px solid rgba(252,163,17,0.4)", fontFamily: BRAND_SANS }}
    >
      <span aria-hidden style={{ color: "var(--accent)" }}>⚡</span>
      <span className="text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>
        Exams 2, 3 and the Final — courtesy of {chapterName}.
      </span>
    </div>
  );
}
