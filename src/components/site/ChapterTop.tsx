// THE TOP OF A CHAPTER PAGE — chapter-specific, and the only thing above the player.
//
// A /go/ page used to open with the generic student hero ("Cram what's on your exam.") and a thin
// banner above it. So the page that a chapter's own flyer points at led with a line written for an
// anonymous visitor, and the fact that it was ABOUT that chapter was a strip of text you could
// miss. This replaces that top: the chapter and its course are the headline, and the first thing
// asked is the only question that changes what the page should show.
//
// Everything here reads its school from CAMPUS CONTEXT — the course code and the bolt colourway
// come from the resolved campus, never from a component's own guess. That is what stops a chapter
// page from showing another school's branding.
import { Bolt } from "@/components/canvas/brand";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { ChapterExecPitch } from "@/components/site/ChapterExecPitch";
import { RoleFork, type ChapterRole } from "@/components/site/RoleFork";
import { useCampus } from "@/lib/campus-context";

export function ChapterTop({ chapterName, role, resolving, onChoose, onExecFromMember, claimForm }: {
  chapterName: string;
  role: ChapterRole | null | undefined;
  resolving: boolean;
  onChoose: (r: ChapterRole) => void;
  /** Member path escape hatch — switches this visitor to the exec view. */
  onExecFromMember: () => void;
  claimForm?: React.ReactNode;
}) {
  const { school, code, courseLabel } = useCampus();

  return (
    <div style={{ fontFamily: BRAND_SANS }}>
      <ChapterHeader chapterName={chapterName} schoolName={school?.name ?? null} code={code} courseLabel={courseLabel} />

      {/* INLINE, in the page flow. The fork previously sat in a slot that floated it above the
          hero, so it read as an interruption laid over a page rather than the page's first step. */}
      {!resolving && !role && (
        <RoleFork chapterName={chapterName} onChoose={onChoose} />
      )}

      {role === "exec" && <ChapterExecPitch chapterName={chapterName} claimForm={claimForm} />}

      {/* MEMBER PATH IS SHORT. They came for videos; the player is directly below. One quiet line
          for the rare member who is actually on exec, and nothing else. */}
      {role === "member" && (
        <div className="mx-auto w-full max-w-[640px] px-5 pt-3 text-center">
          <button type="button" onClick={onExecFromMember} className="text-[12.5px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
            On exec? Claim this chapter →
          </button>
        </div>
      )}
    </div>
  );
}

function ChapterHeader({ chapterName, schoolName, code, courseLabel }: {
  chapterName: string;
  schoolName: string | null;
  code: string | null;
  courseLabel: string;
}) {
  return (
    <header className="mx-auto w-full max-w-[720px] px-5 pt-6 text-center sm:pt-8">
      <div className="flex items-center justify-center gap-3">
        {/* The bolt reads --sa-bolt-1/2, which the page sets from the resolved campus, so it is
            this school's colourway with no per-component decision. */}
        <span className="block shrink-0" style={{ width: 34 }} aria-hidden>
          <Bolt c1="var(--sa-bolt-1)" c2="var(--sa-bolt-2)" />
        </span>
        <span className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
          {[chapterName, schoolName].filter(Boolean).join(" · ")}
        </span>
      </div>

      <h1 className="mt-4 text-[24px] font-black leading-[1.15] sm:text-[30px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
        {chapterName} — free Exam 1 cram videos for your members.
      </h1>

      {/* The course code is the whole point of naming it: an exec skims this line and sees the
          class their members are actually failing. A school with no verified code gets the generic
          phrase rather than a plausible-looking wrong one. */}
      <p className="mx-auto mt-3 max-w-lg text-[14.5px] leading-relaxed sm:text-[15.5px]" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
        Intro accounting{code ? <> (<span className="font-bold" style={{ color: "var(--accent)" }}>{code}</span>)</> : <> — {courseLabel}</>} is where chapter GPA quietly takes its hit. Give every member a tutor at once.
      </p>
    </header>
  );
}
