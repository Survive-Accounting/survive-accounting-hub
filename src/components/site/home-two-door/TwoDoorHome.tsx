// THE TWO-DOOR HOMEPAGE (2026-08-27) — surviveaccounting.com/'s hero redesign, V1.
//
// One job: a stranger understands Survive in ~5 seconds and picks one of two doors —
// STUDY SOLO or STUDY WITH YOUR CHAPTER. The information architecture is borrowed from
// Speechnotes (centered promise → small credibility layer → two perfectly symmetrical doors);
// the visual world is entirely ours (navy, cream, amber, the bolt).
//
// What this page deliberately does NOT do any more:
//   • render the live student player — the new Exam 1 experience is being rebuilt privately, so
//     the public Exam 1 CTA enters the WAITLIST state (FREE · SEPTEMBER 1, one email field)
//     instead of an unfinished player. Campus pages (/$school) keep the existing full
//     LandingPage + player untouched.
//   • carry a giant decorative hero bolt — the cycling bolt now lives INSIDE the left door and
//     is its visual identity.
//   • stack three competing "start" CTAs — the doors are the instruction.
//
// SYMMETRY IS THE DESIGN. Both cards share ONE frame (DOOR_CARD) and one internal grammar:
// icon envelope → title → description → button → support line, each slot the same height on
// both sides. Any change to one card's structure must go through the shared pieces so the two
// can never drift apart.
import { useEffect, useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import {
  FeatureValueStrip, FloatingContact, MARKETING_CSS, MARKETING_HERO_ID, SocialProofSection,
  TrustChips, TutorBioModal, TutorCard,
} from "@/components/site/Marketing";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { TestimonialsSlider } from "@/components/site/Testimonials";
import { GreekWaitlistSheet } from "@/components/site/home-two-door/GreekWaitlistSheet";
import { boltFor, Faq, PHONE, SCHOOLS, SectionDivider, SyllabusModal, TEL, type School } from "@/routes/landing";
import { CampusProvider, useCampus } from "@/lib/campus-context";
import { track } from "@/lib/analytics";
import { pathStarted } from "@/lib/exam-path";
import { scrollToId } from "@/lib/ui-scroll";
import { useDismiss } from "@/lib/use-dismiss";
import { contactKind, EXAM1_LAUNCH_LABEL, HOME_CAMPUS } from "@/lib/launch";
import { submitNotify } from "@/lib/syllabus.functions";
import { examRequest, notifyNote } from "@/lib/notify-request";
import { rememberStudentEmail } from "@/lib/student-email";
import { readTestSession } from "@/lib/test-mode";
import { CHAPTER_BTN, DOOR_CARD_CSS, DOOR_CTA_VARS, DOOR_BTN_CLASS, SOLO_BTN } from "./DoorCard";
import { HOME_FOLD_CSS, HomeDoorCard, HomeDoorRow } from "./HomeFold";
import { ArrowLeftRight } from "lucide-react";

import { SchoolSwitchSheet } from "./SchoolSwitchSheet";

import { CAMPUS_LINE_CSS, CampusEm, CampusFor, CampusLine } from "./campus-line";
import { soloButtonLabel, soloSupport } from "./two-door-copy";
import { nbspCode } from "@/lib/course-code";

/** The doors section's anchor. Also aliased by the legacy #exam1 anchor below it, because every
 *  other page's navbar still links "/#exam1" — those visitors should land at the doors, not at a
 *  player that no longer exists here. */
const DOORS_ID = "doors";

/** The hero campus line's anchor. The SiteHeader context pill watches this element to know when
 *  "for ALABAMA students" has scrolled away (spec §7). Exported so there is ONE id, not two that
 *  can drift apart. */
export const HERO_CAMPUS_LINE_ID = "sa-hero-campus-line";

// ── PAGE ──────────────────────────────────────────────────────────────────────────────────────
export function TwoDoorHome({ storedCampusId, initialCode, previewSoloHref }: {
  /** The returning visitor's campus, read from the request cookie by the route loader — same
   *  contract as LandingPage's storedCampusId (SSR renders the personalized hero, no flicker). */
  storedCampusId?: string | null;
  /** Course code resolved server-side by the loader, so the headline never gains it a beat late. */
  initialCode?: string | null;
  /** PREVIEW ONLY (/preview/home): the left door NAVIGATES here (the private Player V2) instead
   *  of opening the public Exam 1 waitlist. Never set on the live "/" — ordinary visitors must
   *  keep landing on the September 1 waitlist state. */
  previewSoloHref?: string;
}) {
  return (
    <CampusProvider urlSchoolSlug={null} accountCampusId={null} initialCode={initialCode ?? null} initialStoredId={storedCampusId ?? null}>
      <TwoDoorHomeInner previewSoloHref={previewSoloHref} />
    </CampusProvider>
  );
}

function TwoDoorHomeInner({ previewSoloHref }: { previewSoloHref?: string }) {
  useNavyDocument();
  const campus = useCampus();

  // The resolved campus recolors the page theme + the door bolt; unknown stays brand default.
  const theme = useMemo(() => {
    if (!campus.school) return DEFAULT_FRAME_THEME;
    const c = boltFor(campus.school.id);
    return { ...DEFAULT_FRAME_THEME, boltPrimary: c.c1, boltSecondary: c.c2 };
  }, [campus.school]);

  // Landing's School row for the syllabus modal (it wants the picker-shaped object).
  const schoolObj = useMemo<School | null>(
    () => (campus.school ? SCHOOLS.find((s) => s.id === campus.school!.id) ?? null : null),
    [campus.school],
  );

  // RETURNING STUDENT — read AFTER mount (localStorage; SSR must not guess). The guided path's
  // own started flag is the one trustworthy "already started Exam 1" signal.
  const [returning, setReturning] = useState(false);
  useEffect(() => { setReturning(pathStarted()); }, []);

  const [bioOpen, setBioOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [syllabusOpen, setSyllabusOpen] = useState(false);

  // Shared analytics context — attach what the page knows, never more.
  const ctx = () => ({ campus_id: campus.school?.id, course_code: campus.code ?? undefined });

  // On the live "/" the solo door opens the public waitlist; on /preview/home it navigates into
  // the private Player V2 instead (same event, `preview` property tells them apart).
  const openSolo = () => {
    track("homepage_study_solo_clicked", { ...ctx(), returning, preview: !!previewSoloHref });
    if (!previewSoloHref) setWaitlistOpen(true);
  };
  const openChapter = () => { track("homepage_chapter_clicked", ctx()); setFinderOpen(true); };
  const openScope = () => { track("homepage_course_scope_opened", ctx()); setScopeOpen(true); };
  const openSwitch = () => { track("homepage_school_switch_opened", ctx()); setSwitchOpen(true); };
  // The SECOND Exam-1 door, at the foot of the feature list — a reader who scrolled the whole
  // list can convert without scrolling back up. Same waitlist the solo door opens.
  const openExam1Free = () => { track("homepage_secondary_cta_clicked", ctx()); setWaitlistOpen(true); };

  // HEADER CONTEXT PILL (spec §7) — only when a course is actually resolved. On the generic home,
  // where no course is selected, the pill renders nothing (the prop is undefined).
  const contextPill = campus.code && campus.school
    ? { code: nbspCode(campus.code), school: campus.school.name, onClick: openSwitch, anchorId: HERO_CAMPUS_LINE_ID }
    : undefined;

  return (
    <div style={{
      ...frameThemeVars(theme), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "clip",
      ...DOOR_CTA_VARS,
    }}>
      <style>{MARKETING_CSS}</style>
      <style>{DOOR_CARD_CSS}</style>
      <style>{HOME_FOLD_CSS}</style>
      <style>{TWO_DOOR_CSS}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.34} animate /></div>

      <SiteHeader homeNav onLanding contextPill={contextPill} />

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px", width: "100%", overflowX: "clip" }}>
        <TwoDoorHero
          code={campus.code}
          schoolName={campus.school?.name ?? null}
          schoolId={campus.school?.id ?? null}
          onSwitchSchool={openSwitch}
        />

        {/* Legacy compatibility: every other page's navbar still links "/#exam1". */}
        <div id="exam1" className="sa-anchor" />
        <div className="pt-2 sm:pt-4" />
        <TwoDoorCards
          code={campus.code}
          onSolo={openSolo}
          soloHref={previewSoloHref}
          onChapter={openChapter}
        />

        {/* THE PROOF STRIP moves BELOW the doors (spec §5/§6): the doors are the instruction and
            must reach the fold first; the three checks back the claim once a door is chosen. */}
        <div className="mt-6 sm:mt-7">
          <TrustChips onBio={() => setBioOpen(true)} onReviews={() => scrollToId("reviews")} onPlayer={() => scrollToId(DOORS_ID)} />
        </div>

        {/* COURSE SCOPE — one quiet line, because students have genuinely asked whether Survive
            covers Intermediate. A tiny modal answers; the hero stays out of it. */}
        <p className="mt-5 text-center text-[13px]" style={{ fontFamily: BRAND_SANS, color: "var(--text-muted)" }}>
          Intro Financial Accounting only{" "}
          <span aria-hidden style={{ opacity: 0.5 }}>·</span>{" "}
          <button
            type="button"
            onClick={openScope}
            className="underline underline-offset-4 focus-visible:ring-2"
            style={{ background: "none", border: 0, padding: "4px 2px", cursor: "pointer", color: "var(--text-muted)", font: "inherit" }}
          >
            Why?
          </button>
        </p>

        {/* WHAT YOU'LL GET (spec §10) — the three value points, now under a header that frames
            them, and closed by a SECOND Exam-1 door so a reader at the end of the list can convert
            without scrolling back to the top. ~64px of air above it (spec §9). */}
        <section className="pt-16">
          <h2 className="text-center text-[22px] font-black sm:text-[26px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
            What you&apos;ll get
          </h2>
          <FeatureValueStrip code={campus.code} onSyllabus={() => setSyllabusOpen(true)} />
          <div className="mx-auto flex max-w-[360px] justify-center">
            <button
              type="button"
              onClick={openExam1Free}
              className={`w-full ${DOOR_BTN_CLASS}`}
              style={SOLO_BTN}
            >
              Start Exam 1 free →
            </button>
          </div>
        </section>

        <div id="reviews" className="sa-anchor" />
        {/* Air above the proof block: it is a new thought, not a continuation of the strip. */}
        <div className="pt-16">
          <SocialProofSection
            testimonials={<TestimonialsSlider />}
            tutor={<TutorCard onMore={() => setBioOpen(true)} />}
          />
        </div>
        <SectionDivider />
        <Faq />
      </main>

      <Footer onLanding />

      {bioOpen && <TutorBioModal onClose={() => setBioOpen(false)} />}
      {/* The Text-Lee bubble waits until the DOORS (the fold) have scrolled away, so it can never
          overlap the chapter card's support copy (spec §11). */}
      <FloatingContact heroId={DOORS_ID} tel={TEL} phone={PHONE} />
      {waitlistOpen && (
        <Exam1LaunchModal
          campusId={schoolObj?.campusId ?? null}
          campusName={campus.school?.name ?? null}
          courseCode={campus.code}
          onClose={() => setWaitlistOpen(false)}
        />
      )}
      {/* H4: the front door is a WAITLIST while chapters open campus by campus — the finder
          sheet became the 3-step greek capture (school → org → email). */}
      {finderOpen && (
        <GreekWaitlistSheet
          onClose={() => setFinderOpen(false)}
          initialSchoolSlug={campus.school ? SCHOOLS.find((s) => s.id === campus.school!.id)?.slug ?? null : null}
        />
      )}
      {scopeOpen && <CourseScopeModal onClose={() => setScopeOpen(false)} />}
      {switchOpen && <SchoolSwitchSheet onClose={() => setSwitchOpen(false)} />}
      {syllabusOpen && <SyllabusModal school={schoolObj} onClose={() => setSyllabusOpen(false)} />}
    </div>
  );
}

// ── HERO — CENTERED, QUIET ────────────────────────────────────────────────────────────────────
/** Headline → promise → campus line, all on one centered axis. No CTA, no bolt, and (since the
 *  mobile-fold pass) no proof chips: the doors immediately below are the only instruction and must
 *  reach the fold, so the three checks now sit BELOW the doors instead of ahead of them. */
function TwoDoorHero({ code, schoolName, schoolId, onSwitchSchool }: {
  code: string | null;
  schoolName: string | null;
  schoolId: string | null;
  onSwitchSchool: () => void;
}) {
  // Same honesty rule as every hero before it: the campus version needs BOTH a school and a
  // VERIFIED course code; anything less renders the generic page, never an invented code.
  const headline = code && schoolName
    ? <><span style={{ color: "var(--accent)" }}>{nbspCode(code)}</span> at {schoolName} is where GPAs quietly slip.</>
    : <>Intro accounting is where GPAs quietly slip.</>;
  return (
    <section id={MARKETING_HERO_ID} className="sa-two-door-hero flex flex-col items-center pb-9 pt-10 text-center sm:pt-14" style={{ fontFamily: BRAND_SANS }}>
      <h1
        className="mx-auto max-w-[600px] text-[30px] font-black leading-[1.12] sm:text-[40px] lg:text-[44px]"
        style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}
      >
        {headline}
      </h1>
      <p className="mt-4 text-[19px] font-extrabold leading-snug sm:text-[22px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
        Practice what gets tested. Score higher.
      </p>
      {/* THE CAMPUS LINE (FINAL MILE H3) — restored from homepage v1's bolt plate ("for ACCY 201
          · OLE MISS"), updated to current tokens. The campus name wears the school color; both
          change, and a visitor's own resolved campus still wins. An UNRESOLVED campus names no
          school at all — see HomeCampusLine. */}
      <HomeCampusLine schoolName={schoolName} schoolId={schoolId} onSwitch={onSwitchSchool} />
    </section>
  );
}

/** THE HOMEPAGE'S CAMPUS LINE — "for ALABAMA students", the v1 bolt-plate treatment on the
 *  hero's centered axis. Name colored by the school's own primary (config-driven default).
 *
 *  IT NAMES THE CAMPUS, NOT THE COURSE. The headline one line above already says the code, in
 *  the accent colour the solo button repeats; saying it twice in two type sizes made the hero
 *  read as a form field rather than a sentence. The chapter page uses the same component to say
 *  "for ALPHA DELTA CHI · ALABAMA" in this exact slot. */
function HomeCampusLine({ schoolName, schoolId, onSwitch }: {
  schoolName: string | null;
  schoolId: string | null;
  onSwitch: () => void;
}) {
  // AN UNPLACED VISITOR IS NOT TOLD THEY GO TO THE FLAGSHIP. The line used to fall back to
  // HOME_CAMPUS whenever the campus was unresolved, which put "for OLE MISS students" directly
  // under a headline that had just said the honest, generic "Intro accounting is where GPAs
  // quietly slip." — the page contradicting itself in two consecutive lines. When we do not know
  // the school, the line stops claiming one and becomes the invitation to tell us; the swap
  // control beside it is then the answer to a question the page actually asked.
  const known = !!schoolName;
  const color = schoolId ? boltFor(schoolId).c1 : HOME_CAMPUS.colors.primary;
  return (
    // id: the header context pill (spec §7) observes this line — it fades the "AC 210 · Alabama"
    // pill in once this scrolls out of view, and back out when it returns.
    <span id={HERO_CAMPUS_LINE_ID} className="mt-4 inline-flex items-center gap-0.5">
      <CampusLine className="">
        {known ? (
          <>
            <CampusFor>for </CampusFor>
            <CampusEm color={color}>{schoolName.toUpperCase()}</CampusEm>
            <CampusFor> students</CampusFor>
          </>
        ) : (
          <button
            type="button"
            onClick={onSwitch}
            className="sa-campus-pick"
            style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
          >
            <CampusFor>pick your school </CampusFor>
          </button>
        )}
      </CampusLine>
      {/* THE SWAP, RIGHT WHERE THE CLAIM IS. This line asserts which school the visitor goes to,
          and the assertion is a guess (a cookie, or the flagship default). The control that
          corrects it belongs against the word it corrects — not in a menu, and not in a player
          this page does not have. Same icon and same affordance the campus pages use under their
          bolt plate, so it means the same thing in both places. Deliberately NOT an ✕: nothing is
          being closed or removed, one school is being exchanged for another. */}
      <button
        type="button"
        onClick={onSwitch}
        aria-label="Change school"
        title="Change school"
        className="sa-hero-swap inline-flex items-center justify-center rounded-full"
        style={{ color: "var(--text-muted)", width: 34, height: 34 }}
      >
        <ArrowLeftRight size={13} aria-hidden />
      </button>
    </span>
  );
}

// ── THE TWO DOORS ─────────────────────────────────────────────────────────────────────────────
function TwoDoorCards({ code, onSolo, soloHref, onChapter }: {
  code: string | null;
  onSolo: () => void;
  /** Preview only: makes the solo CTA a link into Player V2 (onSolo still fires for tracking). */
  soloHref?: string;
  onChapter: () => void;
}) {
  return (
    <HomeDoorRow id={DOORS_ID} label="Choose how you want to study">
        {/* LEFT DOOR — solo students. First in DOM so it stacks first on mobile. The giant cap
            icon is GONE (spec §1): it ate a third of the fold and pushed the chapter card off
            screen. The card's title is now the bolt lockup, and the rectangle keeps both doors
            above the fold on a 390px phone. */}
        <HomeDoorCard
          tail="SOLO"
          button={
            soloHref ? (
              <a
                href={soloHref}
                onClick={onSolo}
                className={`inline-flex items-center justify-center ${DOOR_BTN_CLASS}`}
                style={SOLO_BTN}
              >
                {soloButtonLabel()}
              </a>
            ) : (
              <button
                type="button"
                onClick={onSolo}
                className={DOOR_BTN_CLASS}
                style={SOLO_BTN}
              >
                {soloButtonLabel()}
              </button>
            )
          }
          support={
            <span className="text-[13px] leading-snug" style={{ maxWidth: "34ch" }}>
              <span style={{ color: "var(--text-muted)" }}>{soloSupport(code).muted}</span>{" "}
              <span className="font-bold" style={{ color: "var(--brand-cream)" }}>{soloSupport(code).strong}</span>
            </span>
          }
        />

        {/* RIGHT DOOR — Greek chapters. Same frame; the small columned-building glyph beside the
            lockup is the one icon left on either card, there to tell the two doors apart. NOT a
            house — that read as real-estate, not a Greek chapter (spec §3b). */}
        <HomeDoorCard
          tail="WITH YOUR CHAPTER"
          chapterGlyph
          button={
            <button
              type="button"
              onClick={onChapter}
              className={DOOR_BTN_CLASS}
              style={CHAPTER_BTN}
            >
              Find your chapter →
            </button>
          }
          support={
            <span className="text-[13px] leading-snug" style={{ maxWidth: "34ch" }}>
              {/* spec §8: only ONE bold phrase per line, so the emphasis lands — "Boost GPAs."
                  keeps the bold; "fraternity or sorority" no longer competes for it. */}
              <span style={{ color: "var(--text-muted)" }}>
                Get Survive through your fraternity or sorority.{" "}
              </span>
              <span className="font-bold" style={{ color: "var(--brand-cream)" }}>Boost GPAs.</span>
            </span>
          }
        />
    </HomeDoorRow>
  );
}


// ── EXAM 1 LAUNCH / WAITLIST MODAL ────────────────────────────────────────────────────────────
/** The PUBLIC Exam 1 state while the new player is rebuilt privately: an intentional launch
 *  card — FREE · SEPTEMBER 1, one email field, the EXISTING notify capture underneath
 *  (submitNotify → campus_waitlist, same as every other "tell me when it's ready" surface).
 *  Campus/course context the page already knows rides along silently. */
function Exam1LaunchModal({ campusId, campusName, courseCode, onClose }: {
  campusId: string | null;
  campusName: string | null;
  courseCode: string | null;
  onClose: () => void;
}) {
  const panelRef = useDismiss<HTMLDivElement>(onClose, { enabled: true });
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const valid = contactKind(contact) !== "unknown";
  const send = async () => {
    if (!valid || state === "sending" || state === "sent") return;
    setState("sending"); setErr(null);
    try {
      const req = examRequest({ examNum: 1, examLabel: "Exam 1", launchWindow: EXAM1_LAUNCH_LABEL, free: true });
      await submitNotify({ data: {
        contact: contact.trim(),
        topic: req.topic,
        campusId,
        campusName,
        professorName: null,
        want: req.want,
        examNum: 1,
        courseCode,
        note: notifyNote(req),
        isTest: !!readTestSession(),
      } });
      if (contactKind(contact) === "email") rememberStudentEmail(contact.trim());
      setState("sent");
    } catch (e) {
      setState("error");
      setErr(e instanceof Error ? e.message : "That didn't send — try again?");
    }
  };
  return (
    <div className="fixed inset-0 z-[240] grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(5,8,16,0.72)" }} role="dialog" aria-modal="true" aria-label="Exam 1 — free, September 1">
      <div ref={panelRef} className="relative w-full max-w-[400px] rounded-3xl p-6 text-center sm:p-7" style={{ background: "var(--bg-page)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS, boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2"
          style={{ width: 40, height: 40, color: "var(--text-muted)" }}
        >
          <span aria-hidden style={{ fontSize: 20 }}>×</span>
        </button>
        <p className="text-[26px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Exam 1</p>
        <p className="mt-1 text-[13px] font-black" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>
          FREE · {EXAM1_LAUNCH_LABEL.toUpperCase()}
        </p>
        {state === "sent" ? (
          <>
            <p className="mt-5 text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>You&apos;re on the list ✓</p>
            <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--text-muted)" }}>I&apos;ll let you know the moment Exam 1 drops.</p>
          </>
        ) : (
          <>
            <p className="mt-4 text-[16px] font-extrabold" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
              New Exam 1 prep is almost ready.
            </p>
            <p className="mx-auto mt-1.5 max-w-[34ch] text-[14px] leading-snug" style={{ color: "var(--text-muted)" }}>
              Cram-style videos &amp; practice built on what actually gets tested.
            </p>
            <input
              type="text" inputMode="email" autoComplete="email" placeholder="you@school.edu"
              className="mt-4 w-full rounded-xl px-3 text-[15px] outline-none"
              style={{ minHeight: 48, background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
              value={contact}
              onChange={(e) => { setContact(e.target.value); if (state === "error") setState("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              aria-label="Email for the Exam 1 launch list"
            />
            {err && <p className="mt-2 text-[12px]" style={{ color: "#F3C6CC" }}>{err}</p>}
            <button
              type="button"
              onClick={() => void send()}
              disabled={!valid || state === "sending"}
              className="mt-3 w-full rounded-xl text-[15px] font-black disabled:opacity-45"
              style={{ minHeight: 50, background: "var(--accent)", color: "#0B1220" }}
            >
              {state === "sending" ? "Sending…" : "Notify me →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── COURSE SCOPE MODAL ────────────────────────────────────────────────────────────────────────
/** The "Why only Intro Financial?" answer — a tiny dialog, never a marketing page. */
function CourseScopeModal({ onClose }: { onClose: () => void }) {
  const panelRef = useDismiss<HTMLDivElement>(onClose, { enabled: true });
  const P = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.9 }}>{children}</p>
  );
  return (
    <div className="fixed inset-0 z-[240] grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(5,8,16,0.72)" }} role="dialog" aria-modal="true" aria-label="Why Intro Financial Accounting only">
      <div ref={panelRef} className="relative w-full max-w-[440px] rounded-3xl p-6 sm:p-7" style={{ background: "var(--bg-page)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS, boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2"
          style={{ width: 40, height: 40, color: "var(--text-muted)" }}
        >
          <span aria-hidden style={{ fontSize: 20 }}>×</span>
        </button>
        <h2 className="pr-8 text-[19px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Intro Financial Accounting only
        </h2>
        <P>I&apos;ve taught and tutored other accounting courses, but Survive is focused on the first financial accounting course right now.</P>
        <P>Master the fundamentals here and every accounting course after it gets easier.</P>
        <P>If you&apos;re in a later accounting course and the fundamentals feel shaky, Exam 1 is a good place to rebuild them.</P>
      </div>
    </div>
  );
}

// ── PAGE CSS ──────────────────────────────────────────────────────────────────────────────────
const TWO_DOOR_CSS = `
/* CENTERED HERO: the proof strip centres at every width here (Marketing's own class left-aligns
   it on desktop, where the old hero had a left column). */
.sa-two-door-hero .sa-proof-row { justify-content: center; }

/* CAMPUS LINE (H3) — the v1 bolt-plate type treatment on the hero axis. */
${CAMPUS_LINE_CSS}

/* DOOR CARDS — one hover response for both: a hair of lift, nothing else moves. */
.sa-door-card { transition: transform 180ms ease, box-shadow 180ms ease; }
.sa-door-card:hover { transform: translateY(-3px); box-shadow: 0 30px 70px -28px rgba(0,0,0,0.8), 0 4px 24px -4px rgba(0,0,0,0.45); }
@media (prefers-reduced-motion: reduce) {
  .sa-door-card, .sa-door-card:hover { transform: none; transition: none; }
}

`;
