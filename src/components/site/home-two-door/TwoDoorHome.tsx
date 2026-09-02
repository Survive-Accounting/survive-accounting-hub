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
import { useEffect, useMemo, useRef, useState } from "react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { readableCampusInk } from "@/lib/campus-color";

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
import { ArrowLeftRight } from "lucide-react";

import { SchoolPickerSheet } from "./SchoolPickerSheet";
import type { School as PickerSchool } from "@/lib/schools";

import { CAMPUS_LINE_CSS } from "./campus-line";
import { soloButtonLabel } from "./two-door-copy";
import { nbspCode } from "@/lib/course-code";

/** The doors section's anchor. Also aliased by the legacy #exam1 anchor below it, because every
 *  other page's navbar still links "/#exam1" — those visitors should land at the doors, not at a
 *  player that no longer exists here. */
const DOORS_ID = "doors";

/** The hero campus line's anchor. Exported so there is ONE id, not two that can drift apart. */
export const HERO_CAMPUS_LINE_ID = "sa-hero-campus-line";

/** The solo door's bolt slot — the switch flourish measures this to know where to throw the new
 *  campus bolt, and the bolt that lands there is the same one. */
const SOLO_BOLT_ID = "sa-solo-bolt";

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
  // THE REBRAND FLOURISH (p6 §12) — a sub-400ms campus-colour flash on a pure school switch. Keyed
  // by an incrementing id so a second switch remounts it (cancels the first, no backlog).
  const [switchFx, setSwitchFx] = useState<null | { id: number; code: string; school: string; c1: string; c2: string }>(null);
  const fxId = useRef(0);

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
    if (mode === "solo") { setPickerFor(null); setWaitlistOpen(true); }
    else if (mode === "chapter") { setPickerFor(null); setFinderOpen(true); }
    else if (mode === "switch") {
      // The rebrand flourish — switch mode only (the "flip through schools for fun" case; the door
      // flows open a modal instead). Skipped under reduced motion, where the page just swaps.
      const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduced) { setPickerFor(null); return; }
      const c = boltFor(school.id);
      fxId.current += 1;
      // The PICKER STAYS MOUNTED behind the flourish and closes when it finishes: the flash plays
      // OVER the open sheet, so the picker is simply the backdrop the new campus arrives on rather
      // than a panel that blinks out and leaves a hole before the page rebrands.
      setSwitchFx({ id: fxId.current, code: school.courseCode ? nbspCode(school.courseCode) : "", school: school.name, c1: c.c1, c2: c.c2 });
    }
  };

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

      {/* The nav bolt appears only once the DOORS (and their big bolt) have scrolled away. */}
      <SiteHeader homeNav onLanding boltAnchorId={DOORS_ID} />

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px", width: "100%", overflowX: "clip" }}>
        <TwoDoorHero
          code={campus.code}
          schoolName={campus.school?.name ?? null}
        />

        {/* PROOF DIRECTLY UNDER THE CLAIM (p4 §2): the three checks sit right below the subhead,
            above the doors. Centered under the centered hero (p6 §3) — TrustChips left-aligns at
            lg by default, which read as off-axis here. */}
        <div className="sa-home-chips mb-7 sm:mb-8">
          <TrustChips onBio={() => setBioOpen(true)} onReviews={() => scrollToId("reviews")} onPlayer={() => scrollToId(DOORS_ID)} />
        </div>

        {/* Legacy compatibility: every other page's navbar still links "/#exam1". */}
        <div id="exam1" className="sa-anchor" />

        {/* THE CAMPUS LINE (p6 §2 — reverted from the pill badge): "for ARKANSAS students ⇄", the
            name in the campus colour with the switcher after it. Its id is the scroll anchor the
            nav wordmark watches to morph "ACCOUNTING" into the course code. */}
        <HomeCampusLine
          schoolName={campus.school?.name ?? null}
          schoolId={campus.school?.id ?? null}
          onSwitch={openSwitch}
        />

        <TwoDoorCards
          code={campus.code}
          campusId={campus.school?.id ?? null}
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
          {/* p6 §7 — the headline reads stronger as something a student said: a quotation with
              attribution, then the supporting paragraph with its now-redundant opening clause cut. */}
          {/* marginInline auto, NOT `margin: 0` — the shorthand was overriding Tailwind's mx-auto,
              which is why the quote sat left of the paragraph under it instead of on its axis. */}
          <blockquote className="max-w-[620px] text-center" style={{ marginBlock: 0, marginInline: "auto" }}>
            <p className="text-[24px] font-black leading-tight sm:text-[30px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
              &ldquo;The exam looks nothing like the homework.&rdquo;
            </p>
            <footer className="mt-2 text-[13.5px]" style={{ fontFamily: BRAND_SANS, color: "var(--text-muted)" }}>— what students tell me every semester</footer>
          </blockquote>
          <p className="mx-auto mt-5 max-w-[600px] text-center text-[15px] leading-relaxed sm:text-[16px]" style={{ fontFamily: BRAND_SANS, color: "var(--text-secondary)" }}>
            The textbook, the quizzes, the lectures — and then exam day feels like a different course. Survive exists so exam day is the second time you&apos;ve seen the problem, not the first.
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
              Try Exam 1 free →
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
      {/* The Text-Lee bubble now waits for the BIO to scroll past, not the doors — so it appears
          only once you've met Lee, and it can't sit on top of the value cards' "Send your syllabus"
          on the way down. Framed photo above it: the same face you just read about, offering help. */}
      <FloatingContact heroId="lee" tel={TEL} phone={PHONE} bottomOffset={16} photo="/lee-sunrise.jpg" />
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
      {/* The rebrand flourish (p6 §12). Keyed by id so a rapid re-switch cancels the previous one. */}
      {switchFx && (
        <SwitchFlourish
          key={switchFx.id}
          code={switchFx.code}
          school={switchFx.school}
          c1={switchFx.c1}
          c2={switchFx.c2}
          onDone={() => { setSwitchFx(null); setPickerFor(null); }}
        />
      )}
    </div>
  );
}

/** THE SCHOOL-SWITCH FLOURISH — the new campus arrives, then BLASTS INTO THE DOOR.
 *
 *  Two beats, ~380ms total. First the campus-coloured bolt boils up in the centre of the viewport
 *  over the still-open picker (which is now just the backdrop) with the DESTINATION beneath it —
 *  "ACCT 2013 · Arkansas", never "Loading", because nothing loads: this is a client-side rebrand and
 *  announcing work that isn't happening is a small dishonesty people register without naming. Then
 *  the bolt flies to the solo door's bolt slot and vanishes into it, and the door's own bolt pops in
 *  wearing the new colours — so the page doesn't just change, the change visibly lands somewhere.
 *
 *  It never blocks: pointer-events none throughout, and a second switch remounts it by key, which
 *  cancels the first outright rather than queueing a backlog of animations. */
function SwitchFlourish({ code, school, c1, c2, onDone }: {
  code: string;
  school: string;
  c1: string;
  c2: string;
  onDone: () => void;
}) {
  // The destination text has to stay legible on navy even when the school's colours are dark.
  const ink = readableCampusInk(c1, c2);
  const [fly, setFly] = useState<{ dx: number; dy: number; scale: number } | null>(null);
  // onDone is a fresh closure on every parent render, and the parent re-renders mid-flourish (the
  // campus just changed). Held in a ref so the timers below are armed exactly once — depending on
  // the prop directly would tear down and restart the sequence on each repaint.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    // Measure the door's bolt slot and fly there. If the doors are off-screen (a switch made from
    // far down the page) there is nothing to fly into, so the bolt just fades in place.
    const target = document.getElementById(SOLO_BOLT_ID)?.getBoundingClientRect();
    const t1 = window.setTimeout(() => {
      if (target && target.width > 0) {
        const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        setFly({
          dx: Math.round(target.left + target.width / 2 - cx),
          dy: Math.round(target.top + target.height / 2 - cy),
          scale: Math.max(0.25, Math.min(1, target.height / 96)),
        });
      } else {
        setFly({ dx: 0, dy: 0, scale: 0.8 });
      }
    }, 130);
    const t2 = window.setTimeout(() => doneRef.current(), 380);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 260, pointerEvents: "none", display: "grid", placeItems: "center" }}>
      <div className="sa-switchfx-wash" style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 50% at 50% 44%, ${ink} 0%, transparent 72%)` }} />
      {/* Two elements on purpose: the OUTER one flies (inline transform), the INNER one pops in
          (keyframes). Putting both on one element would have the animation and the inline transform
          fighting for the same property. */}
      <div
        style={{
          position: "relative",
          transform: fly ? `translate(${fly.dx}px, ${fly.dy}px) scale(${fly.scale})` : "translate(0,0) scale(1)",
          opacity: fly ? 0 : 1,
          transition: "transform 250ms cubic-bezier(.5,0,.75,0), opacity 250ms ease-in",
        }}
      >
        <div className="sa-switchfx-core" style={{ display: "grid", justifyItems: "center", gap: 12 }}>
          <BoltBoil height={96} red={c1} blue={c2} />
          <span style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 16, letterSpacing: "0.02em", color: "var(--brand-cream)", whiteSpace: "nowrap" }}>
            {code ? `${code} · ${school}` : school}
          </span>
        </div>
      </div>
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

/** THE CAMPUS LINE (p6 §2) — "for ARKANSAS students ⇄". The name wears the school's own colour; the
 *  switcher sits right after it. Reverted from the pill badge, which added chrome without clarity.
 *  Its id is the scroll anchor the nav wordmark watches (p4 §4). */
function HomeCampusLine({ schoolName, schoolId, onSwitch }: {
  schoolName: string | null;
  schoolId: string | null;
  onSwitch: () => void;
}) {
  const known = !!schoolName;
  // READABLE, not merely correct: Ole Miss's primary is a navy on a navy page and vanished. This
  // falls back to the school's SECONDARY before it ever lightens — see lib/campus-color.
  const c = schoolId ? boltFor(schoolId) : null;
  const color = c ? readableCampusInk(c.c1, c.c2) : undefined;
  return (
    <div id={HERO_CAMPUS_LINE_ID} className="flex justify-center pb-4">
      <span className="inline-flex items-center gap-1">
        <p className="sa-campus-line" style={{ fontFamily: BRAND_DISPLAY }}>
          {known ? (
            <>
              <span className="sa-campus-line-for">for </span>
              <span className="sa-campus-line-em" style={color ? { color } : undefined}>{schoolName!.toUpperCase()}</span>
              <span className="sa-campus-line-for"> students</span>
            </>
          ) : (
            <button
              type="button"
              onClick={onSwitch}
              className="sa-campus-pick"
              style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
            >
              <span className="sa-campus-line-for">pick your school </span>
            </button>
          )}
        </p>
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
    </div>
  );
}


// ── THE TWO DOORS ─────────────────────────────────────────────────────────────────────────────
function TwoDoorCards({ code, campusId, onSolo, soloHref, onChapter }: {
  code: string | null;
  /** Keys the bolt's arrival pop and decides whether it sits dim (no campus yet) or full-strength
   *  in the school's colours. */
  campusId: string | null;
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
          icon={
            // Keyed by campus so a switch remounts it and replays the arrival pop — the bolt the
            // flourish threw at this slot is the bolt that appears in it.
            <span
              id={SOLO_BOLT_ID}
              key={campusId ?? "none"}
              className={`sa-door-bolt${campusId ? " sa-door-bolt--arrive" : " sa-door-bolt--dim"}`}
              style={{ display: "inline-block" }}
            >
              <SoloBoltIcon />
            </span>
          }
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
              {/* Names who it's for; the course code is dropped (the headline carries it). Kept close
                  in length to the chapter line so the two cards stay the same height (p6 §5). */}
              <span style={{ color: "var(--text-muted)" }}>Cram-style videos and practice exams, built for the night before.</span>{" "}
              <span className="font-bold" style={{ color: "var(--brand-cream)" }}>Exam 1 is free.</span>
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
              {/* "also" depends on the solo card being read first — true on mobile (solo stacks
                  first) and on desktop left-to-right (p6 §5). If the order ever changes, so must this. */}
              Exam prep for your sorority or fraternity.{" "}
              <span className="font-bold" style={{ color: "var(--brand-cream)" }}>Exam 1, also free.</span>
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

/* CHIPS CENTERED (p6 §3) — TrustChips left-aligns at lg by default; under the centered hero it
   should stay on the same axis. Higher specificity than its own lg:justify-start. */
.sa-home-chips .sa-proof-row { justify-content: center; }

/* SCHOOL-SWITCH FLOURISH — under 400ms total. The wash blooms and clears; the bolt + label pop in
   (here), then the whole group flies into the door slot (inline transform on the parent). */
@keyframes sa-switchfx-wash { 0% { opacity: 0; } 32% { opacity: 0.42; } 100% { opacity: 0; } }
@keyframes sa-switchfx-core { 0% { opacity: 0; transform: scale(0.7); } 100% { opacity: 1; transform: scale(1); } }
.sa-switchfx-wash { animation: sa-switchfx-wash 380ms ease forwards; }
.sa-switchfx-core { animation: sa-switchfx-core 150ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .sa-switchfx-wash, .sa-switchfx-core { animation: none; opacity: 0; } }

/* THE DOOR BOLT. With no campus it sits back into the navy — present, but not asserting a school
   we don't know yet. When a campus arrives it pops to full strength in that school's colours,
   catching the bolt the flourish just threw at it. */
.sa-door-bolt { transition: opacity 260ms ease; }
.sa-door-bolt--dim { opacity: 0.5; }
@keyframes sa-bolt-arrive { 0% { opacity: 0.15; transform: scale(0.72); } 62% { transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
.sa-door-bolt--arrive { animation: sa-bolt-arrive 320ms cubic-bezier(.2,.9,.3,1.2) both; }
@media (prefers-reduced-motion: reduce) { .sa-door-bolt--arrive { animation: none; } }

`;
