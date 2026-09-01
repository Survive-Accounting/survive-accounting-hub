// /the-campaign — the private page for Lee's personal network (2026-08-30).
//
// UNLISTED, NOT SECRET. Shared by email, linked from nowhere, noindex + nofollow. There is no
// gate: the video and the deck are open to anyone who has the URL, because a page that asks for a
// referral has no business demanding an email first.
//
// THE HOMEPAGE LAYOUT, NOT A NEW ONE. Same shell, same nav, same hero rhythm (eyebrow → headline
// → subhead → chips → doors), the same DoorCard the home, chapter and council pages use, and the
// same footer. Nothing here is a bespoke landing page; a person who has seen surviveaccounting.com
// should recognise this as the same site.
//
// WHAT IS STILL MISSING, AND WHY IT DEGRADES RATHER THAN BREAKS:
//   • CAMPAIGN_VIDEO_URL — the ~2 minute video. Absent, the player renders NOTHING rather than a
//     broken frame, and the hero still reads correctly.
//   • CAMPAIGN_REPORT_PDF — the full written report. Absent, the link under the deck is not
//     rendered rather than shipped dead.
// Both are one-line edits in site-config once Lee has the files.
import { createFileRoute } from "@tanstack/react-router";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { MARKETING_CSS, MARKETING_HERO_ID } from "@/components/site/Marketing";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { FlyerMark } from "@/components/site/chapter/ChapterDoors";
import {
  CHAPTER_BTN, DOOR_BTN_CLASS, DOOR_CARD_CSS, DOOR_CTA_VARS, DoorCard, DoorRow, SOLO_BTN,
} from "@/components/site/home-two-door/DoorCard";
import { CampaignDeck } from "@/components/site/campaign/CampaignDeck";
import { CampaignVideo } from "@/components/site/campaign/CampaignVideo";
import { ReferralForm } from "@/components/site/campaign/ReferralForm";
import { FIGURE_CSS } from "@/components/site/campaign/Figure";
import { getCampaignCounts, CAMPAIGN_CONTACT_PHONE } from "@/lib/campaign.functions";
import { CAMPAIGN_REPORT_PDF, CAMPAIGN_VIDEO_POSTER, CAMPAIGN_VIDEO_URL } from "@/lib/site-config";
import { scrollToId } from "@/lib/ui-scroll";

const REFER_ID = "refer";
const DECK_ID = "campaign";

export const Route = createFileRoute("/the-campaign")({
  // THE COUNTS ARE LOADED ON THE SERVER so the chips are true in the first paint. A number that
  // appears a beat late reads as a number that was computed to impress you.
  loader: async () => {
    const counts = await getCampaignCounts().catch(() => null);
    return { counts };
  },
  staleTime: 300_000,
  head: () => ({
    meta: [
      { title: "The campaign — Survive Accounting" },
      // Unlisted. nofollow as well as noindex, so the links out of it are not a trail back in.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TheCampaignPage,
});

function TheCampaignPage() {
  useNavyDocument();
  const { counts } = Route.useLoaderData();

  return (
    <div
      style={{
        ...frameThemeVars(DEFAULT_FRAME_THEME),
        ...DOOR_CTA_VARS,
        background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY,
        minHeight: "100vh", position: "relative", overflowX: "clip",
      }}
    >
      <style>{MARKETING_CSS}</style>
      <style>{DOOR_CARD_CSS}</style>
      <style>{FIGURE_CSS}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>

      {/* The homepage bar: Reviews + Meet your tutor, no CTA pill. */}
      <SiteHeader homeNav />

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px", width: "100%" }}>
        <section
          id={MARKETING_HERO_ID}
          className="flex flex-col items-center pb-9 pt-10 text-center sm:pt-14"
          style={{ fontFamily: BRAND_SANS }}
        >
          <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>
            A real campaign, in progress
          </p>

          <h1
            className="mx-auto mt-3 max-w-[600px] text-[30px] font-black leading-[1.12] sm:text-[40px] lg:text-[44px]"
            style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}
          >
            I&apos;m about to find out if this works.
          </h1>

          <p
            className="mx-auto mt-4 max-w-[52ch] text-[17px] font-extrabold leading-snug sm:text-[19px]"
            style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", opacity: 0.86 }}
          >
            Six months of learning cold outreach, launching September 1 across 200 campuses.
            Here&apos;s the whole plan — and what I need.
          </p>

          <CampaignVideo src={CAMPAIGN_VIDEO_URL} poster={CAMPAIGN_VIDEO_POSTER} />

          {/* THE CHIPS, live. The same proof-strip treatment the homepage uses, but these are
              READ FROM THE DATABASE on every load — see campaign.functions. If the load failed the
              row is omitted entirely rather than falling back to a number, because a stale
              hardcoded count on this page would be the one lie the whole page cannot afford. */}
          {counts && (
            <div className="sa-proof-row mt-7 flex flex-wrap items-center justify-center gap-2">
              <Chip>{counts.ready.toLocaleString()} campuses ready</Chip>
              <Chip>{counts.total.toLocaleString()} in the system</Chip>
              <Chip>Launching September 1</Chip>
            </div>
          )}
        </section>

        <DoorRow label="Send a name, or read the plan">
          <DoorCard
            icon={<span aria-hidden style={{ display: "block" }}><BoltBoil height={112} /></span>}
            title="Connect me to a chapter"
            button={
              <button type="button" onClick={() => scrollToId(REFER_ID)} className={DOOR_BTN_CLASS} style={SOLO_BTN}>
                Send me a name →
              </button>
            }
            support={
              <span className="text-[13px] leading-snug" style={{ color: "var(--text-muted)", maxWidth: "34ch" }}>
                Anyone with access to a fraternity or sorority — active, alumni, advisor, parent, or
                a student taking accounting.
              </span>
            }
          />

          <DoorCard
            icon={<FlyerMark height={112} />}
            title="See the whole plan"
            button={
              <button type="button" onClick={() => scrollToId(DECK_ID)} className={DOOR_BTN_CLASS} style={CHAPTER_BTN}>
                Read the campaign →
              </button>
            }
            support={
              <span className="text-[13px] leading-snug" style={{ color: "var(--text-muted)", maxWidth: "34ch" }}>
                Every number, every assumption, and what it costs. 15 slides.
              </span>
            }
          />
        </DoorRow>

        <CampaignDeck id={DECK_ID} reportHref={CAMPAIGN_REPORT_PDF} />

        <ReferralForm id={REFER_ID} heading="Send me a name" />

        {/* THE FORM AGAIN, at the bottom, for someone who read the whole deck before deciding.
            No id: the anchor belongs to the first one, and two elements sharing an id is a
            scroll target that lands wherever the browser feels like. */}
        <ReferralForm heading="Or leave me a note" />

        <p className="mx-auto mt-16 max-w-[62ch] text-center text-[14.5px] leading-relaxed" style={{ fontFamily: BRAND_SANS, color: "var(--brand-cream)", opacity: 0.82 }}>
          Text or call me any time —{" "}
          <a href="tel:+16012018759" className="font-black underline underline-offset-4" style={{ color: "var(--accent)" }}>
            {CAMPAIGN_CONTACT_PHONE}
          </a>
          . I&apos;d genuinely like to know what you&apos;re working on too.
        </p>
      </main>

      <div className="mt-12" />
      <Footer />
    </div>
  );
}

/** The homepage's proof chip, verbatim in treatment — these are facts, not buttons, so unlike the
 *  homepage's they do not click anywhere. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold"
      style={{
        minHeight: 38, background: "rgba(0,0,0,0.22)", border: "1px solid var(--border-default)",
        color: "var(--brand-cream)", fontFamily: BRAND_SANS,
      }}
    >
      <span aria-hidden style={{ color: "var(--accent)" }}>✓</span>
      {children}
    </span>
  );
}
