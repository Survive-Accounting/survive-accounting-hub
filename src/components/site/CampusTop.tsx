// THE CAMPUS-PAGE HERO — what makes /<school> its own page rather than the homepage with a
// different <title>.
//
// WHY THIS EXISTS AT ALL. The campus page renders the real landing page so the product below the
// fold is the working thing. But 66 pages sharing one H1 and one body are near-duplicates, and
// near-duplicates get filtered rather than ranked — the SEO value would have been the title tag
// alone. This block is the unique, indexable content: the school's name, their course code, and
// copy that only makes sense on their campus.
//
// NO CODE ⇒ NO CODE. When a campus has no verified intro_1 the headline degrades to "your
// accounting course" rather than showing a plausible-looking wrong one. A student who reads a
// course code that is not theirs learns this is not actually for them.
import { Bolt, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { useCampus } from "@/lib/campus-context";
import { scrollToId } from "@/lib/ui-scroll";

export function CampusTop({ schoolName, courseCode, chapterCount, examAnchor }: {
  schoolName: string;
  courseCode: string | null;
  /** Greek chapters known at this campus. Drives one honest line, and is hidden at 0. */
  chapterCount: number;
  examAnchor: string;
}) {
  const { code } = useCampus();
  // Campus context wins when present; the loader's value is the server-rendered fallback so the
  // crawler and the first paint both see a code.
  const shown = code ?? courseCode;

  return (
    <header className="mx-auto w-full max-w-[720px] px-5 pt-8 text-center sm:pt-10" style={{ fontFamily: BRAND_SANS }}>
      <div className="flex items-center justify-center gap-2.5">
        <span className="block shrink-0" style={{ width: 28 }} aria-hidden>
          <Bolt c1="var(--sa-bolt-1)" c2="var(--sa-bolt-2)" />
        </span>
        <span className="text-[12px] font-black uppercase tracking-[0.13em]" style={{ color: "var(--text-muted)" }}>
          {schoolName}
        </span>
      </div>

      <h1 className="mt-5 text-[26px] font-black leading-[1.12] sm:text-[34px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
        {shown ? <><span style={{ color: "var(--accent)" }}>{shown}</span> at {schoolName}</> : <>Intro accounting at {schoolName}</>}
        {/* The space belongs BEFORE the break. Without it the extracted text reads "Penn Stateis"
            -- the line break is a visual boundary, not a word boundary, and a crawler sees the
            two words joined. */}
        {" "}<br />is where GPAs quietly slip.
      </h1>

      <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed sm:text-[16.5px]" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
        Cram videos built for {shown ? <span className="font-bold">{shown}</span> : "your accounting course"} — every
        question type walked start to finish by a tutor who teaches nothing else. Exam 1 is free,
        no account needed.
      </p>

      <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => scrollToId(examAnchor)}
          className="w-full rounded-xl px-7 text-[16px] font-black transition-transform hover:scale-[1.02] sm:w-auto"
          style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}
        >
          Cram Exam 1 free ⚡
        </button>
        {/* Shown only where there are chapters to talk to. On a campus with none this would be an
            invitation to a page that lists nothing. */}
        {chapterCount > 0 && (
          <a
            href="/chapters"
            className="flex w-full items-center justify-center rounded-xl px-6 text-[15px] font-bold sm:w-auto"
            style={{ minHeight: 54, color: "var(--brand-cream)", background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.18)" }}
          >
            For fraternities &amp; sororities →
          </a>
        )}
      </div>
    </header>
  );
}
