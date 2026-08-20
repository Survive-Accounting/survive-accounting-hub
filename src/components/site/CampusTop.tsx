// THE CAMPUS-PAGE HERO — what makes /<school> its own page rather than the homepage with a
// different <title>.
//
// WHY THIS EXISTS AT ALL. The campus page renders the real landing page so the product below the
// fold is the working thing. But 66 pages sharing one H1 and one body are near-duplicates, and
// near-duplicates get filtered rather than ranked — the SEO value would have been the title tag
// alone. This block is the unique, indexable content: the school's name, their course code, and
// copy that only makes sense on their campus.
//
// LAYOUT = THE HOMEPAGE HERO'S. Same two-column grid, same graphic footprint — but the animated
// bolt is PINNED to this campus from the first frame (their colours, their course code on the
// plate, no rotation). The old mini-bolt "OLE MISS" eyebrow is gone on every viewport: the bolt
// wears the school's colours and the plate names the campus, so the eyebrow said the same thing
// a third time.
//
// NO CODE ⇒ NO CODE. When a campus has no verified intro_1 the headline degrades to "Intro
// accounting at X" rather than showing a plausible-looking wrong one, and the plate shows only
// the campus name.
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { AnimatedBoltHero } from "@/components/site/AnimatedBolt";
import { useCampus } from "@/lib/campus-context";
import { scrollToId } from "@/lib/ui-scroll";

export function CampusTop({ schoolName, courseCode, chapterCount, examAnchor }: {
  schoolName: string;
  courseCode: string | null;
  /** Greek chapters known at this campus. Drives one honest line, and is hidden at 0. */
  chapterCount: number;
  examAnchor: string;
}) {
  const { school, code } = useCampus();
  // Campus context wins when present; the loader's value is the server-rendered fallback so the
  // crawler and the first paint both see a code.
  const shown = code ?? courseCode;
  // COLOURS COME FROM THE PAGE ROOT, not a second lookup. LandingPage already publishes this
  // campus's colourway as --sa-bolt-1/2 (via its readability-ordered boltFor), and the schools.ts
  // table disagrees for at least Ole Miss (colours reversed in the DB). Two sources means the
  // hero bolt and the rest of the page could wear different colours; inheriting the vars makes
  // that impossible.
  const colors = { c1: "var(--sa-bolt-1)", c2: "var(--sa-bolt-2)" };

  return (
    <section className="sa-hero3 grid items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-14" style={{ fontFamily: BRAND_SANS }}>
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <h1 className="text-[28px] font-black leading-[1.1] sm:text-[38px] lg:text-[44px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
          {shown ? <><span style={{ color: "var(--accent)" }}>{shown}</span> at {schoolName}</> : <>Intro accounting at {schoolName}</>}
          {/* The space belongs BEFORE the break. Without it the extracted text reads "Penn Stateis"
              -- the line break is a visual boundary, not a word boundary, and a crawler sees the
              two words joined. */}
          {" "}is where GPAs quietly slip.
        </h1>

        <p className="mt-4 max-w-[24ch] text-[16px] leading-snug sm:max-w-[42ch] sm:text-[18px]" style={{ color: "var(--brand-cream)", opacity: 0.66 }}>
          Cram videos + practice exams built for {shown ? <span className="font-bold" style={{ opacity: 1 }}>{shown}</span> : "your first accounting course"}. Pick up easy points. Score higher.
        </p>

        <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row lg:justify-start">
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
              // The campus rides along, so the finder opens with this school already selected —
              // the visitor picks their CHAPTER, not the school the page already named.
              href={school ? `/chapters?school=${encodeURIComponent(school.slug)}` : "/chapters"}
              className="flex w-full items-center justify-center rounded-xl px-6 text-[15px] font-bold sm:w-auto"
              style={{ minHeight: 54, color: "var(--brand-cream)", background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.18)" }}
            >
              For fraternities &amp; sororities →
            </a>
          )}
        </div>
      </div>

      {/* THE GRAPHIC — the animated bolt PINNED to this campus: one stop, no rotation, their
          colours from frame one. Same footprint + mobile order as the homepage hero, so the two
          pages read as one design. The plate under the bolt names the course and campus. */}
      <div className="order-first flex flex-col items-center lg:order-none lg:items-end">
        <AnimatedBoltHero
          stops={[{ id: school?.id ?? schoolName, c1: colors.c1, c2: colors.c2, name: schoolName, code: shown }]}
          onActivate={() => scrollToId(examAnchor)}
          className="sa-hero3-paper"
          ariaLabel="Cram Exam 1 free"
        />
      </div>
    </section>
  );
}
