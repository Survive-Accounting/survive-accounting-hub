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
import { contactKind, EXAM1_LAUNCH_LABEL } from "@/lib/launch";
import { submitNotify } from "@/lib/syllabus.functions";
import { examRequest, notifyNote } from "@/lib/notify-request";
import { rememberStudentEmail } from "@/lib/student-email";
import { readTestSession } from "@/lib/test-mode";
import { CHAPTER_BTN, DOOR_CARD_CSS, DOOR_CTA_VARS, DOOR_BTN_CLASS, SOLO_BTN } from "./DoorCard";
import { GreekLettersIcon, HOME_FOLD_CSS, HomeDoorCard, HomeDoorRow, SoloBoltIcon } from "./HomeFold";
import { MapPin } from "lucide-react";

import { SchoolPickerSheet } from "./SchoolPickerSheet";
import type { School as PickerSchool } from "@/lib/schools";

import { CAMPUS_LINE_CSS } from "./campus-line";
import { homeCourseCode, soloButtonLabel, soloSupport } from "./two-door-copy";
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
  const [syllabusOpen, setSyllabusOpen] = useState(false);
  // THE PICKER GATE (p1 §2): either door opens the school picker first; the hero swap opens the
  // same sheet. `pickerFor` records which flow to continue into once a school is chosen.
  const [pickerFor, setPickerFor] = useState<null | "switch" | "solo" | "chapter">(null);

  // Shared analytics context — attach what the page knows, never more.
  const ctx = () => ({ campus_id: campus.school?.id, course_code: campus.code ?? undefined });

  // Either door opens the picker first. On /preview/home the solo door still NAVIGATES straight
  // into Player V2 (dev path), so it keeps its link and skips the picker.
  const openSolo = () => {
    track("homepage_study_solo_clicked", { ...ctx(), returning, preview: !!previewSoloHref });
    if (!previewSoloHref) setPickerFor("solo");
  };
  const openChapter = () => { track("homepage_chapter_clicked", ctx()); setPickerFor("chapter"); };
  const openScope = () => { track("homepage_course_scope_opened", ctx()); setScopeOpen(true); };
  const openSwitch = () => { track("homepage_school_switch_opened", ctx()); setPickerFor("switch"); };
  // The SECOND Exam-1 door, at the foot of the feature list — a reader who scrolled the whole
  // list can convert without scrolling back up. Same waitlist the solo door opens.
  const openExam1Free = () => { track("homepage_secondary_cta_clicked", ctx()); setWaitlistOpen(true); };

  // A school was chosen in the picker: remember it (the page repaints for that campus), then
  // continue into whichever flow opened the picker. State updates batch, so the flow's modal
  // reads the just-picked campus on the next render.
  const onPickSchool = (school: PickerSchool) => {
    const mode = pickerFor;
    campus.setSessionSchool(school.id);
    setPickerFor(null);
    if (mode === "solo") setWaitlistOpen(true);
    else if (mode === "chapter") setFinderOpen(true);
  };

  // WORDMARK-FOLLOWS-THE-COURSE (p4 §4) — once a course is resolved and the school badge scrolls
  // out of view, the nav wordmark's second word crossfades from "ACCOUNTING" to the course code.
  // With no campus, it stays "survive ACCOUNTING".
  const courseWordmark = campus.code
    ? { code: nbspCode(campus.code), anchorId: HERO_CAMPUS_LINE_ID }
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

      <SiteHeader homeNav onLanding courseWordmark={courseWordmark} />

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px", width: "100%", overflowX: "clip" }}>
        <TwoDoorHero
          code={campus.code}
          schoolName={campus.school?.name ?? null}
        />

        {/* PROOF DIRECTLY UNDER THE CLAIM (p4 §2): the three checks sit right below the subhead,
            above the doors — proof belongs next to the promise. */}
        <div className="mb-7 sm:mb-8">
          <TrustChips onBio={() => setBioOpen(true)} onReviews={() => scrollToId("reviews")} onPlayer={() => scrollToId(DOORS_ID)} />
        </div>

        {/* Legacy compatibility: every other page's navbar still links "/#exam1". */}
        <div id="exam1" className="sa-anchor" />

        {/* THE SCHOOL BADGE (p4 §3) — the campus control, directly above the cards. */}
        <SchoolBadge
          schoolName={campus.school?.name ?? null}
          schoolId={campus.school?.id ?? null}
          onOpen={openSwitch}
        />

        <TwoDoorCards
          code={campus.code}
          onSolo={openSolo}
          soloHref={previewSoloHref}
          onChapter={openChapter}
        />

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

        {/* PROOF BEFORE THE FEATURE LIST (p2 reorder): someone who just read the headline wants to
            know whether to trust it BEFORE they read what's included. So What-students-are-saying +
            Meet-your-tutor now sits directly under the scope line, and the feature list follows. */}
        <div id="reviews" className="sa-anchor" />
        <div className="pt-12 sm:pt-16">
          <SocialProofSection
            testimonials={<TestimonialsSlider />}
            tutor={<TutorCard onMore={() => setBioOpen(true)} />}
          />
        </div>

        {/* THE VALUE SECTION (p4 §6) — a header that says something a student feels, a short note
            in Lee's voice, the three cards, then the SECONDARY Exam-1 catch (amber outline, never a
            second full-width primary competing with the hero's "Start cramming"). */}
        <section className="pt-16">
          <h2 className="mx-auto max-w-[620px] text-center text-[24px] font-black leading-tight sm:text-[30px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
            The exam looks nothing like the homework.
          </h2>
          <p className="mx-auto mt-4 max-w-[600px] text-center text-[15px] leading-relaxed sm:text-[16px]" style={{ fontFamily: BRAND_SANS, color: "var(--text-secondary)" }}>
            That&apos;s what students tell me every semester — the textbook, the quizzes, the lectures, and then exam day feels like a different course. Survive exists so exam day is the second time you&apos;ve seen the problem, not the first.
          </p>
          <FeatureValueStrip code={campus.code} onSyllabus={() => setSyllabusOpen(true)} />
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={openExam1Free}
              className="sa-cta-secondary inline-flex items-center justify-center rounded-xl focus-visible:ring-2"
              style={{
                minHeight: 44,
                paddingInline: 22,
                fontSize: 14.5,
                fontWeight: 900,
                fontFamily: BRAND_SANS,
                background: "transparent",
                color: "var(--accent)",
                border: "1.5px solid var(--accent)",
              }}
            >
              Start Exam 1 free →
            </button>
          </div>
        </section>

        <SectionDivider />
        {/* FAQ links reuse existing flows — the chapter door's picker→waitlist, the syllabus modal,
            the school picker — rather than wiring new routes (p5). */}
        <Faq
          onSyllabus={() => setSyllabusOpen(true)}
          onFindChapter={openChapter}
          onNotListed={openSwitch}
        />
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
      {pickerFor && (
        <SchoolPickerSheet
          onClose={() => setPickerFor(null)}
          onPick={onPickSchool}
          showClear={pickerFor === "switch"}
          title={pickerFor === "chapter" ? "Which school is your chapter at?" : "Which school are you at?"}
        />
      )}
      {syllabusOpen && <SyllabusModal school={schoolObj} onClose={() => setSyllabusOpen(false)} />}
    </div>
  );
}

// ── HERO — CENTERED, QUIET ────────────────────────────────────────────────────────────────────
/** Headline → subhead. The campus control moved out to the SchoolBadge (directly above the cards),
 *  and the proof chips sit right under the subhead now (p4). */
function TwoDoorHero({ code, schoolName }: {
  code: string | null;
  schoolName: string | null;
}) {
  // Same honesty rule as every hero before it: the campus version needs BOTH a school and a
  // VERIFIED course code; anything less renders the generic page, never an invented code.
  const headline = code && schoolName
    ? <><span style={{ color: "var(--accent)" }}>{nbspCode(code)}</span> at {schoolName} is where GPAs quietly slip.</>
    : <>Intro accounting is where GPAs quietly slip.</>;
  return (
    <section id={MARKETING_HERO_ID} className="sa-two-door-hero flex flex-col items-center pb-5 pt-10 text-center sm:pt-14" style={{ fontFamily: BRAND_SANS }}>
      <h1
        className="mx-auto max-w-[600px] text-[30px] font-black leading-[1.12] sm:text-[40px] lg:text-[44px]"
        style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}
      >
        {headline}
      </h1>
      {/* SUBHEAD — supports the headline, doesn't compete: medium weight, muted (p4 §1). */}
      <p className="mt-3.5 text-[17px] font-medium leading-snug sm:text-[19px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--text-secondary)" }}>
        Cram what&apos;s on your exam. Skip everything else.
      </p>
    </section>
  );
}

/** THE SCHOOL BADGE (p4 §3) — the campus control, made visible, directly above the cards. Selecting
 *  a school rebrands the page in place (code, colours, bolt tint); the mechanism is unchanged, this
 *  is just a legible pill instead of a near-invisible text link. Its id is the scroll anchor the
 *  nav wordmark watches to morph "ACCOUNTING" into the course code (p4 §4). */
function SchoolBadge({ schoolName, schoolId, onOpen }: {
  schoolName: string | null;
  schoolId: string | null;
  onOpen: () => void;
}) {
  const known = !!schoolName;
  const pin = schoolId ? boltFor(schoolId).c1 : "var(--accent)";
  return (
    <div id={HERO_CAMPUS_LINE_ID} className="flex justify-center pb-4">
      <button
        type="button"
        onClick={onOpen}
        className="sa-school-badge inline-flex items-center gap-2 rounded-full focus-visible:ring-2"
        style={{ minHeight: 38, paddingInline: 16, background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS, fontSize: 14 }}
        aria-label={known ? `${schoolName} — change school` : "Pick your school"}
      >
        <MapPin size={15} aria-hidden style={{ color: pin, flex: "none" }} />
        {known ? (
          <>
            <span className="font-black" style={{ color: "var(--brand-cream)" }}>{schoolName}</span>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span style={{ color: "var(--text-muted)" }}>change</span>
          </>
        ) : (
          <span className="font-black" style={{ color: "var(--brand-cream)" }}>Pick your school →</span>
        )}
      </button>
    </div>
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
        {/* LEFT DOOR — solo students. First in DOM so it stacks first on mobile. Its large icon is
            the boiling, campus-tinted Survive bolt; the heading is "survive Solo". Clicking opens
            the school picker first (p1 §2), then the Exam-1 flow. */}
        <HomeDoorCard
          icon={<SoloBoltIcon />}
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

        {/* RIGHT DOOR — Greek chapters. Its large icon is the classical columned building (NOT a
            house — that read as real-estate, not a Greek chapter). Clicking opens the same picker,
            then the chapter waitlist. */}
        <HomeDoorCard
          icon={<GreekLettersIcon />}
          button={
            <button
              type="button"
              onClick={onChapter}
              className={DOOR_BTN_CLASS}
              style={CHAPTER_BTN}
            >
              Study with your chapter →
            </button>
          }
          support={
            <span className="text-[13px] leading-snug" style={{ maxWidth: "34ch", color: "var(--text-muted)" }}>
              {/* Course code is dynamic per campus (same source the hero headline uses); falls back
                  to the flagship code when no campus is resolved. */}
              Get <span className="font-bold" style={{ color: "var(--brand-cream)" }}>{homeCourseCode(code)}</span> exam prep for your sorority or fraternity.{" "}
              <span className="font-bold" style={{ color: "var(--brand-cream)" }}>Exam 1 is free for every member.</span>
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

/* SECONDARY CTA (p2) — amber outline; on hover the fill warms a touch. Never a solid amber, so it
   stays a step below the hero's primary. */
.sa-cta-secondary { transition: background-color 160ms ease, border-color 160ms ease; }
.sa-cta-secondary:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
@media (prefers-reduced-motion: reduce) { .sa-cta-secondary { transition: none; } }

/* SCHOOL BADGE (p4) — a quiet pill; on hover the hairline warms toward amber. */
.sa-school-badge { transition: background-color 140ms ease, border-color 140ms ease; }
.sa-school-badge:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--bg-surface)); }

`;
