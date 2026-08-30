// THE COUNCIL HERO — the homepage hero, wearing council words.
//
// STRUCTURALLY IDENTICAL TO "/" ON PURPOSE. The old council hero was a two-column grid: copy
// left-aligned on the left, bolt floated right, a "Text Lee" button under the copy. That made it a
// different page from every other campus-facing surface, which is exactly what a personalised
// cold-email landing page cannot afford — the officer arrives suspicious, and a layout she has
// never seen reads as a template someone generated for her.
//
// So the order is the homepage's order, and the type sizes are the homepage's type sizes:
//
//     eyebrow → headline → subhead → campus line → trust chips → bolt → doors
//
// TWO DELIBERATE DIFFERENCES FROM THE HOMEPAGE:
//   1. THE EYEBROW. "PANHELLENIC AT ALABAMA" is the whole personalisation promise, and it has to
//      be the first thing read.
//   2. NO BUTTON. The homepage hero has none — the doors are the action — and this one had a
//      "Text Lee" button that competed with them. Texting lives in the footer.
//
// The subhead sits BELOW the headline in weight, not level with it. It was rendering at
// font-black in the display face, the same treatment as the h1, so the two lines argued about
// which was the headline; it is now the homepage's supporting-line weight.
import { AnimatedCampusBolt, type BoltCampus } from "@/components/site/bolt";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { CampusDot, CampusEm, CampusFor, CampusLine } from "@/components/site/home-two-door/campus-line";
import { MARKETING_HERO_ID, TrustChips } from "@/components/site/Marketing";
import { nbspCode } from "@/lib/course-code";
import { scrollToId } from "@/lib/ui-scroll";

export function CouncilHero({ eyebrow, headline, subhead, courseCode, schoolName, bolt, boltLabel, onOpenBio, doorsId }: {
  eyebrow: string;
  headline: string;
  subhead: string;
  courseCode: string | null;
  schoolName: string;
  bolt: BoltCampus[];
  boltLabel: string;
  onOpenBio: () => void;
  /** The chips' third item points at the doors, the way the homepage's points at its doors. */
  doorsId: string;
}) {
  return (
    <section
      id={MARKETING_HERO_ID}
      className="flex flex-col items-center pb-9 pt-10 text-center sm:pt-14"
      style={{ fontFamily: BRAND_SANS }}
    >
      <p
        className="text-[12px] font-black uppercase"
        style={{ color: "var(--accent)", letterSpacing: "0.16em" }}
      >
        {eyebrow}
      </p>

      <h1
        className="mx-auto mt-3 max-w-[600px] text-[30px] font-black leading-[1.12] sm:text-[40px] lg:text-[44px]"
        style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}
      >
        {headline}
      </h1>

      {/* The homepage's supporting-line treatment: extrabold, one step down, and narrower than the
          headline so the eye returns to the left edge sooner. */}
      <p
        className="mx-auto mt-4 max-w-[46ch] text-[17px] font-extrabold leading-snug sm:text-[19px]"
        style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", opacity: 0.86 }}
      >
        {subhead}
      </p>

      {/* THE CAMPUS LINE, in the homepage's slot and the homepage's style. It names the COURSE
          here as well as the campus, because this page's headline carries no course code — the
          officer is not taking the class, so the code has to appear somewhere she can see it. */}
      <CampusLine>
        <CampusFor>for </CampusFor>
        {courseCode && (
          <>
            <CampusEm>{nbspCode(courseCode)}</CampusEm>
            <CampusDot />
          </>
        )}
        <CampusEm>{schoolName.toUpperCase()}</CampusEm>
      </CampusLine>

      <TrustChips
        onBio={onOpenBio}
        onReviews={() => scrollToId("reviews")}
        onPlayer={() => scrollToId(doorsId)}
      />

      {/* THE BOLT, CENTRED — the campus colourway, under the copy rather than floated beside it.
          Its size matches the homepage door bolt's optical weight rather than the old hero's
          340px column, which at this width would have been the loudest thing on the page.

          showLabel={false} BECAUSE THE PLATE IS ALREADY ON THE PAGE. The bolt renders its own
          "for AC 210 · ALABAMA" plate by default — the very treatment the homepage campus line
          was lifted from — so leaving it on printed the same line twice, four lines apart. The
          campus line keeps the homepage's position (above the chips) and the bolt keeps only the
          bolt. */}
      <div className="mx-auto mt-8 w-[min(190px,52vw)]">
        <AnimatedCampusBolt campuses={bolt} ariaLabel={boltLabel} showLabel={false} />
      </div>
    </section>
  );
}
