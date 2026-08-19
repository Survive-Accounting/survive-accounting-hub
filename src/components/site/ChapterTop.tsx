// THE CHAPTER HERO — the one and only place the Greek value proposition is made.
//
// THE ROLE GATE IS GONE. This page used to open with a card asking "Are you on exec, or a member?"
// before showing anything. Two things were wrong with it: an exec IS a member, so the question has
// no correct answer for the person most likely to act on it; and it made a visitor answer a
// question about themselves before they could see the product at all. Nobody arrives at a cram
// site wanting to file themselves into a category.
//
// It is replaced by INTENT, not identity: one primary button to the free product, one secondary to
// the chapter offer. Both scroll; neither hides anything. The same person can do both, in either
// order, which is what was actually true all along.
//
// This hero also absorbed the argument that used to be repeated further down the page ("Intro
// accounting is quietly wrecking your chapter's GPA", plus its own subhead). Making the same case
// twice on one page does not make it twice as convincing — it just moves the product further from
// the fold.
import { Bolt, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { useCampus } from "@/lib/campus-context";
import { scrollToId } from "@/lib/ui-scroll";

export function ChapterTop({ chapterName, examAnchor, accessAnchor, onStartExam }: {
  chapterName: string;
  examAnchor: string;
  accessAnchor: string;
  /** Fired alongside the scroll — the member attribution, not a navigation concern. */
  onStartExam?: () => void;
}) {
  const { school, code } = useCampus();

  const startExam = () => { onStartExam?.(); scrollToId(examAnchor); };

  return (
    <header className="mx-auto w-full max-w-[720px] px-5 pt-8 text-center sm:pt-10" style={{ fontFamily: BRAND_SANS }}>
      {/* WHERE AM I — answered in one line, above everything. */}
      <div className="flex items-center justify-center gap-2.5">
        <span className="block shrink-0" style={{ width: 28 }} aria-hidden>
          <Bolt c1="var(--sa-bolt-1)" c2="var(--sa-bolt-2)" />
        </span>
        <span className="text-[12px] font-black uppercase tracking-[0.13em]" style={{ color: "var(--text-muted)" }}>
          {[chapterName, school?.name].filter(Boolean).join(" · ")}
        </span>
      </div>

      {/* WHAT IS THIS / WHY CARE. The course code is the hook: an exec skims this and sees the
          class their members are actually failing. No verified code ⇒ the phrase degrades to plain
          "Intro Accounting" rather than showing a plausible-looking wrong one. */}
      <h1 className="mt-5 text-[26px] font-black leading-[1.12] sm:text-[34px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
        Intro Accounting{code ? <> (<span style={{ color: "var(--accent)" }}>{code}</span>)</> : null} is where chapter GPA takes a hit.
      </h1>

      <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed sm:text-[16.5px]" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
        Dozens of your members take it every year. Business, finance, and accounting majors all hit
        the same wall. Give your whole chapter exam-specific cram videos from a tutor who
        specializes in Intro Accounting.
      </p>

      {/* WHAT DO I CLICK. Primary is the free product; an exec can find the offer without being
          asked to identify themselves first. */}
      <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={startExam}
          className="w-full rounded-xl px-7 text-[16px] font-black transition-transform hover:scale-[1.02] sm:w-auto"
          style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}
        >
          Start Exam 1 free
        </button>
        <button
          type="button"
          onClick={() => scrollToId(accessAnchor)}
          className="w-full rounded-xl px-6 text-[15px] font-bold sm:w-auto"
          style={{ minHeight: 54, color: "var(--brand-cream)", background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.18)" }}
        >
          Set up chapter access →
        </button>
      </div>

      <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        Exam 1 is free for every member. No card required.
      </p>
    </header>
  );
}
