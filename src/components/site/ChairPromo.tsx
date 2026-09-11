// THE CHAIR PAGE (2026-09-11) — /go/<school>/<chapter> and /go/<school>/council/<council>.
//
// One component, two audiences: a chapter's scholarship chair, or a council's academics chair.
// Lee: "The /go/ page is strictly for promotion to the IFC or chapter scholarship chairs." It is
// the DM destination — what Lee sends a chair — so it does three things and nothing else:
//
//   1. Says what it is for them, in one line: "Boost ΑΤΩ's GPA in ACCT 200."
//   2. LEFT DOOR  — "See what members get" opens the students' /learn page in a new tab, so the
//      chair can look without leaving this page.
//   3. RIGHT DOOR — "Share with members" FLIPS into the share kit: copy the link, copy the
//      GroupMe post, the flyer for the house, the meeting slide (councils: slide only).
//
// IT MIRRORS THE HOME PAGE (Lee, 2026-09-11: "the /go/ chapter chair and council chair pages
// need to mirror the home page a bit more"): the same trust chips under the subhead, the same
// "Exam 1 is free" line under the doors, the same reviews + Meet-your-tutor band, then the three
// value cards in the chair's words. No sign-up form. The exec dashboard claim is one quiet link
// in the top line (chapters only), which opens the claim sheet in place.
import { useEffect, useState } from "react";
import { Check, FileText, Link2, MessageSquare, Presentation, Undo2 } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import {
  CHAPTER_BTN, DOOR_BTN_CLASS, DOOR_CARD, DOOR_CARD_CSS, DOOR_CTA_VARS, DoorCard, DoorRow, SOLO_BTN, TIER_ACTION,
} from "@/components/site/home-two-door/DoorCard";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { GreekLettersIcon, SOLO_ICON_H } from "@/components/site/home-two-door/HomeFold";
import { FlyerMark } from "@/components/site/chapter/ChapterDoors";
import { MARKETING_CSS, SocialProofSection, TrustChips, TutorBioModal, TutorCard } from "@/components/site/Marketing";
import { TestimonialsSlider } from "@/components/site/Testimonials";
import { scrollToId } from "@/lib/ui-scroll";
import { LEE_PHONE_DISPLAY, LEE_SMS_HREF } from "@/lib/partners";
import {
  type ChairKind, chairArtwork, chairForLine, chairGroupMe, chairHeadline, chairLearnPath, chairShareUrl, chairSubhead, chairValueCards,
} from "@/components/site/chair-promo";

export type ChairClaim = "unclaimed" | "pending" | "claimed";

const REVIEWS_ID = "reviews";
const VALUE_ID = "what-they-get";

export function ChairPromo({ kind, schoolSlug, schoolId, schoolName, slug, name, letters, shortName, code, bolt, claim, onClaim, onAction }: {
  kind: ChairKind;
  /** campuses.slug — the /go and /api namespace. */
  schoolSlug: string;
  /** School.id — the /learn namespace ("tennessee"). */
  schoolId: string;
  schoolName: string;
  /** Chapter slug or council slug. */
  slug: string;
  /** "Alpha Tau Omega" / "Interfraternity Council" — the top line. */
  name: string;
  /** What the headline calls them: "ΑΤΩ" for a chapter, the council's short name for a council. */
  letters: string;
  /** What the GroupMe post calls them ("ATO"). */
  shortName: string;
  code: string | null;
  bolt: { c1: string; c2: string };
  /** Chapters only — drives the quiet claim link. */
  claim?: ChairClaim;
  onClaim?: () => void;
  /** Best-effort analytics hook; never awaited. */
  onAction?: (action: "open_learn" | "copy_link" | "copy_groupme" | "flyer" | "slide") => void;
}) {
  useNavyDocument();
  const learnPath = chairLearnPath(kind, schoolId, slug);
  const shareUrl = chairShareUrl(kind, schoolId, slug);
  const groupMe = chairGroupMe(kind, code, shareUrl, shortName);
  const art = chairArtwork(kind, schoolSlug, slug);
  const members = kind === "council" ? "chapters" : "members";
  const [bioOpen, setBioOpen] = useState(false);
  // "Like Reels for exam prep." — the word wears the accent, exactly as on the home page.
  const [subLead, subRest] = chairSubhead(kind).split("Reels");

  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), ...DOOR_CTA_VARS, background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_SANS, minHeight: "100vh", position: "relative", overflowX: "clip" }}>
      <style>{MARKETING_CSS + DOOR_CARD_CSS + FLIP_CSS}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      <SiteHeader />

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px 64px", width: "100%" }}>
        {/* THE TOP LINE — who this is for, and (chapters) the one quiet way to the exec dashboard. */}
        <p className="pt-7 text-center text-[13px] sm:pt-9" style={{ color: "var(--text-muted)" }}>
          <span className="font-bold" style={{ color: "var(--brand-cream)" }}>{chairForLine(name, schoolName)}</span>
          {kind === "chapter" && claim && (
            <>
              <span aria-hidden> — </span>
              {claim === "unclaimed" ? (
                <button type="button" onClick={onClaim} className="underline underline-offset-4" style={{ background: "none", border: 0, padding: 0, color: "var(--text-muted)", cursor: "pointer", font: "inherit" }}>
                  Claim your exec dashboard
                </button>
              ) : claim === "pending" ? "Dashboard request received" : "Exec dashboard claimed"}
            </>
          )}
        </p>

        {/* THE HERO — one line, the course code's only appearance; then the home page's chips. */}
        <header className="mx-auto mt-4 max-w-[760px] text-center">
          <h1 className="sa-door-support text-[30px] font-black leading-[1.1] sm:text-[42px]" style={{ fontFamily: BRAND_DISPLAY, letterSpacing: "-0.015em" }}>
            {chairHeadline(kind, letters, code)}
          </h1>
          <p className="sa-door-support mx-auto mt-3 max-w-[52ch] text-[15.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
            {subLead}<span className="font-bold" style={{ color: "var(--accent)" }}>Reels</span>{subRest}
          </p>
          <div className="sa-chair-chips">
            <TrustChips onBio={() => setBioOpen(true)} onReviews={() => scrollToId(REVIEWS_ID)} onPlayer={() => scrollToId(VALUE_ID)} thirdDesktopOnly />
          </div>
        </header>

        <div className="mt-8">
          <DoorRow label={`See it or share it with your ${members}`}>
            {/* LEFT DOOR — look first. A new tab, so this page (and the share kit) stays put. */}
            <DoorCard
              icon={<BoltBoil height={SOLO_ICON_H} red={bolt.c1} blue={bolt.c2} />}
              title={`What ${members} get`}
              button={
                <a href={learnPath} target="_blank" rel="noreferrer" onClick={() => onAction?.("open_learn")} className={`${DOOR_BTN_CLASS} inline-flex items-center justify-center gap-2`} style={SOLO_BTN}>
                  See what {members} get →
                </a>
              }
              support={
                <span className="text-[13px] leading-snug" style={{ maxWidth: "34ch", color: "var(--text-muted)" }}>
                  The exact page your {members} land on.
                </span>
              }
            />

            {/* RIGHT DOOR — flips into the share kit. */}
            <FlipDoor
              kind={kind}
              letters={letters}
              shareUrl={shareUrl}
              groupMe={groupMe}
              art={art}
              onAction={onAction}
            />
          </DoorRow>
        </div>

        {/* UNDER THE DOORS — the home page's "Exam 1 is free." line, with the one way to reach Lee. */}
        <p className="mt-6 text-center text-[13.5px]" style={{ color: "var(--text-muted)" }}>
          <span className="font-black" style={{ color: "var(--brand-cream)" }}>Exam 1 is free.</span>{" "}
          Questions?{" "}
          <a href={LEE_SMS_HREF} className="font-bold underline underline-offset-4" style={{ color: "var(--brand-cream)" }}>Text Lee {LEE_PHONE_DISPLAY}</a>
        </p>

        {/* PROOF BEFORE THE FEATURE LIST — the same band, in the same place, as the home page. */}
        <div id={REVIEWS_ID} className="sa-anchor" />
        <div className="pt-12 sm:pt-14">
          <SocialProofSection testimonials={<TestimonialsSlider />} tutor={<TutorCard onMore={() => setBioOpen(true)} />} />
        </div>

        {/* THE VALUE CARDS — the home page's three, in the chair's words. */}
        <section id={VALUE_ID} aria-label={`What ${members} get`} className="sa-anchor mx-auto mt-12 grid w-full max-w-[880px] gap-4 sm:grid-cols-3 sm:gap-5">
          {chairValueCards(kind).map((c) => (
            <div key={c.title} className="rounded-2xl px-5 py-6 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
              <h2 className="text-[14px] font-black uppercase" style={{ fontFamily: BRAND_DISPLAY, letterSpacing: "0.06em", color: "var(--brand-cream)" }}>{c.title}</h2>
              <p className="sa-door-support mt-2 text-[13.5px] leading-snug" style={{ color: "var(--text-muted)" }}>{c.copy}</p>
            </div>
          ))}
        </section>
      </main>

      {bioOpen && <TutorBioModal onClose={() => setBioOpen(false)} />}
    </div>
  );
}

// ── the right door ────────────────────────────────────────────────────────────────────────────

/** THE FLIP. Front: the door as it sits next to its sibling (same DoorCard, same grammar). Back:
 *  the share kit, on the same frame. The wrapper keeps the front face in flow so the row's
 *  height comes from the same place as the left door's; the back face sits on top of it. */
function FlipDoor({ kind, letters, shareUrl, groupMe, art, onAction }: {
  kind: ChairKind;
  letters: string;
  shareUrl: string;
  groupMe: string;
  art: ReturnType<typeof chairArtwork>;
  onAction?: (action: "copy_link" | "copy_groupme" | "flyer" | "slide") => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const title = kind === "council" ? "Share with chapters" : "Share with members";
  const slideLabel = kind === "council" ? "Council meeting slide" : "Chapter meeting slide";
  const slideFile = `survive-${kind}-${letters.replace(/[^A-Za-z0-9]+/g, "").toLowerCase() || "meeting"}-slide.pdf`;
  return (
    <div className={`sa-flip${flipped ? " is-flipped" : ""}`}>
      <div className="sa-flip-inner">
        <div className="sa-flip-face sa-flip-front">
          <DoorCard
            icon={kind === "council" ? <FlyerMark height={SOLO_ICON_H} /> : <GreekLettersIcon pinned={letters} cycle={[letters]} />}
            title="Spread the word"
            button={
              <button type="button" onClick={() => setFlipped(true)} className={DOOR_BTN_CLASS} style={CHAPTER_BTN} aria-expanded={flipped}>
                {title} →
              </button>
            }
            support={
              <span className="text-[13px] leading-snug" style={{ maxWidth: "34ch", color: "var(--text-muted)" }}>
                A link, a GroupMe post, and something for the meeting.
              </span>
            }
          />
        </div>
        <div className="sa-flip-face sa-flip-back" aria-hidden={!flipped}>
          <div className="sa-door-card" style={{ ...DOOR_CARD, padding: "22px 22px 18px", justifyContent: "flex-start" }}>
            <h3 className="text-[18px] font-black uppercase leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "0.04em" }}>{title}</h3>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Every link goes to the same free Exam 1.</p>
            <div className="mt-4 flex w-full flex-col gap-2">
              <CopyAction icon={<Link2 className="h-4 w-4" aria-hidden />} label="Copy share link" text={shareUrl} disabled={!flipped} onCopied={() => onAction?.("copy_link")} />
              <CopyAction icon={<MessageSquare className="h-4 w-4" aria-hidden />} label="Copy GroupMe post" text={groupMe} disabled={!flipped} onCopied={() => onAction?.("copy_groupme")} />
              {art.flyer && (
                <a href={art.flyer} target="_blank" rel="noreferrer" tabIndex={flipped ? 0 : -1} onClick={() => onAction?.("flyer")} className="inline-flex items-center justify-center gap-2" style={TIER_ACTION}>
                  <FileText className="h-4 w-4" aria-hidden /> Flyer for the house
                </a>
              )}
              <a href={art.slide} download={slideFile} tabIndex={flipped ? 0 : -1} onClick={() => onAction?.("slide")} className="inline-flex items-center justify-center gap-2" style={TIER_ACTION}>
                <Presentation className="h-4 w-4" aria-hidden /> {slideLabel}
              </a>
            </div>
            <div className="flex-1" />
            <button type="button" onClick={() => setFlipped(false)} tabIndex={flipped ? 0 : -1} className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-bold underline underline-offset-4" style={{ background: "none", border: 0, padding: 0, color: "var(--text-muted)", cursor: "pointer", fontFamily: BRAND_SANS, minHeight: 32 }}>
              <Undo2 className="h-3.5 w-3.5" aria-hidden /> Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Clipboard first; the hidden-textarea path for browsers that refuse it (in-app browsers,
 *  an unfocused document). Never a dialog. */
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** One copy button: the label at rest, "Copied" for a moment after. */
function CopyAction({ icon, label, text, disabled, onCopied }: { icon: React.ReactNode; label: string; text: string; disabled?: boolean; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(false), 1800);
    return () => window.clearTimeout(t);
  }, [done]);
  const copy = async () => {
    if (await copyText(text)) { setDone(true); onCopied?.(); }
  };
  return (
    <button type="button" onClick={() => void copy()} tabIndex={disabled ? -1 : 0} className="inline-flex items-center justify-center gap-2" style={{ ...TIER_ACTION, ...(done ? { background: "rgba(252,163,17,0.16)", borderColor: "rgba(252,163,17,0.5)" } : {}) }}>
      {done ? <><Check className="h-4 w-4" aria-hidden /> Copied</> : <>{icon} {label}</>}
    </button>
  );
}

const FLIP_CSS = `
.sa-chair-chips .sa-proof-row { justify-content: center; }
.sa-flip { perspective: 1400px; }
.sa-flip-inner { position: relative; transform-style: preserve-3d; transition: transform 520ms cubic-bezier(.2,.7,.2,1); }
.sa-flip.is-flipped .sa-flip-inner { transform: rotateY(180deg); }
.sa-flip-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.sa-flip-front { position: relative; }
.sa-flip-back { position: absolute; inset: 0; transform: rotateY(180deg); }
.sa-flip-back > .sa-door-card { height: 100%; }
.sa-flip.is-flipped .sa-flip-front { pointer-events: none; }
.sa-flip:not(.is-flipped) .sa-flip-back { pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .sa-flip-inner { transition: none; }
}
`;
