// THE CHAPTER HERO — the one and only place the Greek value proposition is made.
//
// Two audiences land here at once — a member who wants free Exam 1 help and an exec who wants to
// set the chapter up — so the hero is INTENT, not identity: one primary button to the free
// product, one secondary to chapter onboarding. Both scroll; neither hides anything. The same
// person can do both, in either order. (A "which are you?" role gate was tried and removed —
// an exec IS a member, so the question had no correct answer.)
//
// The headline names the course code because that is the class members are actually failing —
// but the copy deliberately does NOT promise campus- or professor-specific mapping. Campuses
// onboard faster than maps do, and a promise the product can't keep everywhere yet costs more
// than the code alone earns. No verified code ⇒ the phrase degrades to plain "Intro Accounting"
// rather than showing a plausible-looking wrong one.
import { Bolt, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { CourtesyLine } from "@/components/site/CourtesyLine";
import { useCampus } from "@/lib/campus-context";
import { scrollToId } from "@/lib/ui-scroll";

/** The hero's own id — the mobile sticky CTA bar watches it to know when the hero (and its
 *  buttons) have scrolled away, so the bar never duplicates CTAs that are already on screen. */
export const CHAPTER_HERO_ID = "chapter-hero";

export function ChapterTop({ chapterName, schoolSlug, chapterSlug, schoolName, examAnchor, accessAnchor, onStartExam }: {
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
  /** Loader-resolved campus display name — the fallback when the campus isn't in the generated
   *  school table (self-created chapters), so the eyebrow never drops its second half. */
  schoolName?: string;
  examAnchor: string;
  accessAnchor: string;
  /** Fired alongside the scroll — the member attribution, not a navigation concern. */
  onStartExam?: () => void;
}) {
  const { school, code } = useCampus();
  const campusName = school?.name ?? schoolName ?? null;

  const startExam = () => { onStartExam?.(); scrollToId(examAnchor); };

  return (
    <header id={CHAPTER_HERO_ID} className="mx-auto w-full max-w-[720px] px-5 pt-8 text-center sm:pt-10" style={{ fontFamily: BRAND_SANS }}>
      {/* WHERE AM I — answered in one line, above everything. */}
      <div className="flex items-center justify-center gap-2.5">
        <span className="block shrink-0" style={{ width: 28 }} aria-hidden>
          <Bolt c1="var(--sa-bolt-1)" c2="var(--sa-bolt-2)" />
        </span>
        <span className="text-[12px] font-black uppercase tracking-[0.13em]" style={{ color: "var(--text-muted)" }}>
          {[chapterName, campusName].filter(Boolean).join(" · ")}
        </span>
      </div>

      {/* WHAT IS THIS / WHY CARE. The course code is the hook: an exec skims this and sees the
          class their members are actually taking. */}
      <h1 className="mt-5 text-[26px] font-black leading-[1.12] sm:text-[34px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
        Help your chapter survive{" "}
        <span style={{ color: "var(--accent)" }}>{code ?? "Intro Accounting"}</span>.
      </h1>

      <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed sm:text-[16.5px]" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
        Members take Intro Accounting every semester. Give the house exam-specific cram videos +
        practice exams built to help them score higher—and protect chapter GPA.
      </p>

      {/* WHAT DO I CLICK. Primary is the free product; an exec can find the offer without being
          asked to identify themselves first. */}
      <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={startExam}
          className="w-full rounded-xl px-7 text-[16px] font-black transition-transform hover:scale-[1.02] focus-visible:ring-2 sm:w-auto"
          style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}
        >
          Start Exam 1 Free
        </button>
        <button
          type="button"
          onClick={() => scrollToId(accessAnchor)}
          className="w-full rounded-xl px-6 text-[15px] font-bold focus-visible:ring-2 sm:w-auto"
          style={{ minHeight: 54, color: "var(--brand-cream)", background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.18)" }}
        >
          Set Up Chapter Access →
        </button>
      </div>

      <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        Exam 1 is free for every member. No card required.
      </p>

      {/* Only renders for a member this chapter actually bought a seat for. */}
      <CourtesyLine schoolSlug={schoolSlug} chapterSlug={chapterSlug} chapterName={chapterName} />
    </header>
  );
}
