// ROLE FORK — "are you on exec, or a member?", asked once per chapter.
//
// A /go/ page serves two people with almost nothing in common. A MEMBER wants to start studying;
// an EXEC wants to run the chapter. Before this, the page guessed by putting both in front of
// everyone, which meant the member scrolled past a claim form they can't use and the exec hunted
// for a control aimed at the other 999 visitors.
//
// THE MEMBER PATH IS NEVER GATED. Exam 1 is free for everyone, so a member on an unclaimed page
// gets it immediately — no claim, no exec dependency, no waiting for someone else to act. That is
// the whole point: the chapter's status is an exec concern and must never become a student's
// problem.
//
// ASKED ONCE. The answer is stored PER CHAPTER, not globally: the same person can be an exec of
// their own house and a plain member of a friend's, and a global flag would mislabel them on the
// second page. Logged-in users skip the question entirely — an account that already knows the
// answer should not ask it.
import { useCallback, useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

export type ChapterRole = "exec" | "member";

const key = (schoolSlug: string, chapterSlug: string) => `sa-role:${schoolSlug}/${chapterSlug}`;

/** Read/write the remembered role for ONE chapter. */
export function useChapterRole(schoolSlug: string, chapterSlug: string, accountRole?: ChapterRole | null) {
  // `undefined` = still reading storage. Distinct from null (= asked, no answer yet), so the fork
  // does not flash on screen for a returning visitor before storage is consulted.
  const [stored, setStored] = useState<ChapterRole | null | undefined>(undefined);

  // Storage is read in an EFFECT: this route is server-rendered, and a server that cannot see
  // localStorage would otherwise disagree with the client on the first paint.
  useEffect(() => {
    try {
      const v = localStorage.getItem(key(schoolSlug, chapterSlug));
      setStored(v === "exec" || v === "member" ? v : null);
    } catch { setStored(null); }
  }, [schoolSlug, chapterSlug]);

  const choose = useCallback((r: ChapterRole) => {
    setStored(r);
    try { localStorage.setItem(key(schoolSlug, chapterSlug), r); } catch { /* private mode */ }
  }, [schoolSlug, chapterSlug]);

  // An account's own role outranks anything remembered on this device.
  const role = accountRole ?? stored;
  return { role, choose, resolving: accountRole == null && stored === undefined };
}

export function RoleFork({ chapterName, onChoose }: { chapterName: string; onChoose: (r: ChapterRole) => void }) {
  return (
    <div className="mx-auto mt-4 w-full max-w-[640px] px-5" style={{ fontFamily: BRAND_SANS }}>
      <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
        <p className="text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Are you on exec, or a member?
        </p>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {chapterName} — this just decides what I show you.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {/* MEMBER FIRST, and styled as the primary action. Members are the overwhelming majority
              of this page's traffic; putting the exec button first would be optimising the layout
              for the rarer visitor. */}
          <button
            type="button" onClick={() => onChoose("member")}
            className="flex-1 rounded-xl text-[15px] font-black transition-transform hover:scale-[1.02]"
            style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220" }}
          >
            I&apos;m a member
          </button>
          <button
            type="button" onClick={() => onChoose("exec")}
            className="flex-1 rounded-xl text-[14px] font-bold"
            style={{ minHeight: 48, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.18)", color: "var(--brand-cream)" }}
          >
            I&apos;m on exec / an advisor
          </button>
        </div>
      </div>
    </div>
  );
}
