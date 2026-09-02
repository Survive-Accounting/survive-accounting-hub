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
import { useQuery } from "@tanstack/react-query";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { readableCampusInk } from "@/lib/campus-color";
import { CAMPUS_CYCLE, type CampusStop } from "@/lib/campus-cycle";
import { readStoredChapter, rememberChapter, type StoredChapter } from "@/lib/chapter-prefs";
import { buildGreekCycle, OLE_MISS_GREEK_CYCLE } from "@/lib/greek-cycle";
import { listGoChapters } from "@/lib/greek-go.functions";

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
import { GreekLettersIcon, HOME_FOLD_CSS, HomeDoorCard, HomeDoorRow, SoloBoltIcon, SOLO_ICON_H } from "./HomeFold";
import { ArrowLeftRight } from "lucide-react";

import { SchoolPickerSheet } from "./SchoolPickerSheet";
import { ChapterPickerSheet } from "./ChapterPickerSheet";
import type { School as PickerSchool } from "@/lib/schools";

import { CAMPUS_LINE_CSS } from "./campus-line";
import { soloButtonLabel } from "./two-door-copy";
import { nbspCode } from "@/lib/course-code";

/** The doors section's anchor. Also aliased by the legacy #exam1 anchor below it, because every
 *  other page's navbar still links "/#exam1" — those visitors should land at the doors, not at a
 *  player that no longer exists here. */
const DOORS_ID = "doors";


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
  // THE REMEMBERED CHAPTER (p11 §2). Read AFTER mount and only for the CURRENT school — a house at
  // a campus the visitor has since left is stale. It drives the chapter card's line and pins its
  // letters; nothing about it is server-rendered.
  const [chapter, setChapter] = useState<StoredChapter | null>(null);
  const schoolSlug = campus.school?.slug ?? null;
  useEffect(() => { setChapter(readStoredChapter(schoolSlug)); }, [schoolSlug]);
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);

  // THE CHAPTER-LETTER RUN. Real houses, from THIS campus where we have its roster: a student
  // should see their own letters go by, not a campus they don't attend. Falls back to the Ole Miss
  // default before the roster arrives, when no school is chosen, and for any campus whose roster
  // can't support an alternating run — see lib/greek-cycle.
  const chaptersQ = useQuery({
    queryKey: ["go-chapters", schoolSlug],
    queryFn: () => listGoChapters({ data: { schoolSlug: schoolSlug! } }),
    enabled: !!schoolSlug,
    staleTime: 300_000,
    networkMode: "always",
  });
  const greekCycle = useMemo(() => {
    const built = buildGreekCycle(chaptersQ.data ?? []);
    return built.length ? built : OLE_MISS_GREEK_CYCLE;
  }, [chaptersQ.data]);

  // AFTER A SWITCH, POINT AT THE DOOR (p11 §4). Changing school or chapter rebrands the page in
  // place and nothing else moves, so the next step can be easy to miss; the card whose context just
  // changed pulses its button for about a second. Temporary, and skipped under reduced motion.
  const [pulse, setPulse] = useState<null | "solo" | "chapter">(null);
  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setPulse(null), 1100);
    return () => window.clearTimeout(t);
  }, [pulse]);

  // THE REBRAND FLOURISH (p6 §12) — a sub-400ms campus-colour flash on a pure school switch. Keyed
  // by an incrementing id so a second switch remounts it (cancels the first, no backlog).
  const [switchFx, setSwitchFx] = useState<null | { id: number; code: string; school: string; c1: string; c2: string }>(null);
  const fxId = useRef(0);

  // Shared analytics context — attach what the page knows, never more.
  const ctx = () => ({ campus_id: campus.school?.id, course_code: campus.code ?? undefined });

  // Either door opens the picker first. On /preview/home the solo door still NAVIGATES straight
  // into Player V2 (dev path), so it keeps its link and skips the picker.
  // NEVER ASK FOR WHAT IS ALREADY KNOWN (p11 §3). A student whose school the page has been naming
  // in the headline all the way down should not be made to find it in a list again — the switcher
  // lines in the cards are how you change it. Only an unknown school gets the picker first.
  const openSolo = () => {
    track("homepage_study_solo_clicked", { ...ctx(), returning, preview: !!previewSoloHref });
    if (previewSoloHref) return;
    if (campus.known) setWaitlistOpen(true);
    else setPickerFor("solo");
  };
  // The Greek sheet collects school → chapter → email itself, seeded with the campus we already
  // resolved, so gating it behind a second school picker asked the same question twice.
  const openChapter = () => { track("homepage_chapter_clicked", ctx()); setFinderOpen(true); };
  const openScope = () => { track("homepage_course_scope_opened", ctx()); setScopeOpen(true); };
  const openSwitch = () => { track("homepage_school_switch_opened", ctx()); setPickerFor("switch"); };
  // The chapter switcher REBRANDS IN PLACE — it never navigates. The door button is still the only
  // thing that goes anywhere (p11 §1/§2).
  const openChapterPicker = () => { track("homepage_chapter_switch_opened", ctx()); setChapterPickerOpen(true); };
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
      setPulse("solo");
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

      <SiteHeader homeNav onLanding />

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px", width: "100%", overflowX: "clip" }}>
        <TwoDoorHero
          code={campus.code}
          schoolName={campus.school?.name ?? null}
        />

        {/* PROOF DIRECTLY UNDER THE CLAIM (p4 §2): the three checks sit right below the subhead,
            above the doors. Centered under the centered hero (p6 §3) — TrustChips left-aligns at
            lg by default, which read as off-axis here. */}
        <div className="sa-home-chips mb-7 sm:mb-8">
          <TrustChips onBio={() => setBioOpen(true)} onReviews={() => scrollToId("reviews")} />
        </div>

        {/* Legacy compatibility: every other page's navbar still links "/#exam1". */}
        <div id="exam1" className="sa-anchor" />

        {/* THE SWITCHERS MOVED INSIDE THE CARDS (p11 §2). A standalone line above the pair had to
            speak for both doors at once; each card now carries its own context and its own picker,
            and both are given the SAME level of context so they stay symmetrical at every state. */}
        <TwoDoorCards
          code={campus.code}
          campusId={campus.school?.id ?? null}
          schoolName={campus.school?.name ?? null}
          chapter={chapter}
          greekCycle={greekCycle}
          onSolo={openSolo}
          soloHref={previewSoloHref}
          onChapter={openChapter}
          onSwitchSchool={openSwitch}
          onSwitchChapter={openChapterPicker}
          pulse={pulse}
        />

        {/* EXAM 1 IS FREE — said ONCE, under both doors (p9 §3). It used to close each card, where
            it said the same thing twice and competed with the bold in the buttons above it. */}
        <p className="mt-6 text-center text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Exam 1 is free.
        </p>

        {/* COURSE SCOPE — one quiet line, because students have genuinely asked whether Survive
            covers Intermediate. A tiny modal answers; the hero stays out of it. */}
        {/* Second line of the same block — the muted qualifier under the promise, not its own beat. */}
        <p className="mt-1.5 text-center text-[13px]" style={{ fontFamily: BRAND_SANS, color: "var(--text-muted)" }}>
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
      {chapterPickerOpen && campus.school && (
        <ChapterPickerSheet
          schoolSlug={campus.school.slug}
          schoolName={campus.school.name}
          hasChapter={!!chapter}
          onClose={() => setChapterPickerOpen(false)}
          onPick={(c) => {
            const picked = { schoolSlug: campus.school!.slug, slug: c.slug, name: c.name, letters: c.letters, nickname: c.nickname };
            rememberChapter(picked);
            setChapter(picked);
            setChapterPickerOpen(false);
            setPulse("chapter");
            track("homepage_chapter_selected", { ...ctx(), chapter_slug: c.slug });
          }}
          onClear={() => { rememberChapter(null); setChapter(null); }}
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
      {/* SUBHEAD — supports the headline, doesn't compete: medium weight, muted (p4 §1).
          TWO LINES BY DECREE, not by wrap: the break belongs after "exam", where the sentence
          turns. Letting it fall wherever the viewport runs out put it somewhere different on
          every screen. */}
      <p className="mt-3.5 text-[17px] font-medium leading-snug sm:text-[19px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--text-secondary)" }}>
        <span className="block">Cram what&apos;s on your exam.</span>
        <span className="block">Skip everything else.</span>
      </p>
    </section>
  );
}



// ── THE TWO DOORS ─────────────────────────────────────────────────────────────────────────────
function TwoDoorCards({ code, campusId, schoolName, chapter, greekCycle, onSolo, soloHref, onChapter, onSwitchSchool, onSwitchChapter, pulse }: {
  code: string | null;
  /** Keys the bolt's arrival pop and decides whether the bolt wears the school's colours. */
  campusId: string | null;
  schoolName: string | null;
  /** The remembered chapter, when the visitor has told us one. */
  chapter: StoredChapter | null;
  /** Real chapter letters to rotate through until we know the visitor's own house. */
  greekCycle: string[];
  onSolo: () => void;
  /** Preview only: makes the solo CTA a link into Player V2 (onSolo still fires for tracking). */
  soloHref?: string;
  onChapter: () => void;
  onSwitchSchool: () => void;
  onSwitchChapter: () => void;
  /** Which door just had its context changed — that button pulses once (p11 §4). */
  pulse: null | "solo" | "chapter";
}) {
  // Read after mount so the first server paint never assumes motion is welcome.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const read = () => setReduced(mq.matches); read();
    mq.addEventListener?.("change", read);
    return () => mq.removeEventListener?.("change", read);
  }, []);
  const carousel = useCampusCarousel(!schoolName && !reduced);

  // PROGRESSIVE DISCLOSURE, plus an INVITATION when there is nothing to disclose. With a school
  // known both cards carry its line. With none, the solo door does not go quiet — its bolt and line
  // cycle real campuses together, which previews what picking gets you instead of instructing you
  // to pick. The chapter card holds still meanwhile: see "one invitation at a time" below.
  const known = !!schoolName;
  const cycling = !known && !reduced && CAMPUS_CYCLE.length > 1;
  const stop = CAMPUS_CYCLE[carousel.labelIdx % CAMPUS_CYCLE.length];
  // The course code is worth repeating in the support lines — it has scrolled out of the headline
  // by the time anyone reads them. With no campus we say the honest generic thing, never a guess.
  const courseWord = code ? nbspCode(code) : "intro accounting";
  const btnCls = (which: "solo" | "chapter") => `${DOOR_BTN_CLASS}${pulse === which ? " sa-door-btn--pulse" : ""}`;

  return (
    <HomeDoorRow id={DOORS_ID} label="Choose how you want to study">
        {/* LEFT DOOR — solo students. First in DOM so it stacks first on mobile. */}
        <HomeDoorCard
          icon={
            // THE BOLT IS A DOOR HANDLE, not a picture: it opens the picker, same as the line under
            // it. Wrapped in a real button so keyboard and screen-reader users get the same target.
            <button
              type="button"
              onClick={onSwitchSchool}
              className="sa-bolt-target"
              aria-label={known ? "Change school" : "Pick your school"}
              title={known ? "Change school" : "Pick your school"}
            >
              {cycling ? (
                <CampusBolt a={CAMPUS_CYCLE[carousel.a]} b={CAMPUS_CYCLE[carousel.b]} aFront={carousel.aFront} />
              ) : (
                // Keyed by campus so a switch remounts it and replays the arrival pop — the bolt the
                // flourish threw at this slot is the bolt that appears in it.
                <span
                  id={SOLO_BOLT_ID}
                  key={campusId ?? "none"}
                  className={`sa-door-bolt${campusId ? " sa-door-bolt--arrive" : ""}`}
                  style={{ display: "inline-block" }}
                >
                  <SoloBoltIcon />
                </span>
              )}
            </button>
          }
          switcher={
            known
              ? <CardSwitcher label="for" name={schoolName!.toUpperCase()} tail="students" campusId={campusId} onClick={onSwitchSchool} aria="Change school" />
              : cycling
                // The line names whichever campus the bolt is currently wearing, and dips through
                // the swap so the two read as one change rather than two.
                ? <CardSwitcher label="for" name={stop.name.toUpperCase()} tail="students" color={readableCampusInk(stop.c1, stop.c2)} dim={!carousel.labelVis} onClick={onSwitchSchool} aria="Pick your school" />
                // Reduced motion (or a one-campus run): the invitation is words, not movement.
                : <CardSwitcher label="" name="pick your school" tail="" onClick={onSwitchSchool} aria="Pick your school" />
          }
          button={
            soloHref ? (
              <a href={soloHref} onClick={onSolo} className={`inline-flex items-center justify-center ${btnCls("solo")}`} style={SOLO_BTN}>
                {soloButtonLabel()}
              </a>
            ) : (
              <button type="button" onClick={onSolo} className={btnCls("solo")} style={SOLO_BTN}>
                {soloButtonLabel()}
              </button>
            )
          }
          support={
            <span className="text-[13px] leading-snug" style={{ maxWidth: "34ch", color: "var(--text-muted)" }}>
              {/* The course code is NOT bolded. Two cards each shouting one word in cream pulled the
                  eye away from the buttons above them, which are the things to press. */}
              Cram videos and practice exams for {courseWord}.
            </span>
          }
        />

        {/* RIGHT DOOR — Greek chapters. ONE INVITATION AT A TIME: while the solo bolt is cycling
            campuses these letters hold still, and they only start rotating once the bolt has
            settled on a school. Two doors moving at once is not twice as inviting, it is noise. */}
        <HomeDoorCard
          icon={<GreekLettersIcon pinned={chapter?.letters ?? null} cycle={greekCycle} frozen={cycling} />}
          switcher={
            known
              ? (chapter
                  ? <CardSwitcher label="for" name={chapterDisplay(chapter)} tail={`at ${schoolName!.toUpperCase()}`} campusId={campusId} onClick={onSwitchChapter} aria="Change chapter" />
                  // "chapters", not "students": the two lines sat side by side saying the identical
                  // sentence, which made the pair look like a rendering mistake rather than two
                  // doors. Each names what its own door is for.
                  : <CardSwitcher label="for" name={schoolName!.toUpperCase()} tail="chapters" campusId={campusId} onClick={onSwitchChapter} aria="Pick your chapter" />)
              : undefined
          }
          button={
            <button type="button" onClick={onChapter} className={btnCls("chapter")} style={CHAPTER_BTN}>
              Study with your chapter →
            </button>
          }
          support={
            <span className="text-[13px] leading-snug" style={{ maxWidth: "34ch", color: "var(--text-muted)" }}>
              Get {courseWord} exam prep for your sorority or fraternity.
            </span>
          }
        />
    </HomeDoorRow>
  );
}

/** THE CAROUSEL CLOCK. One timer drives both halves so the bolt and the line can never disagree
 *  about which campus is showing: on each beat the bolt starts its colour crossfade and the label
 *  dips out, and the label comes back with the new name partway through the fade. Paused entirely
 *  when it isn't running, so a settled card costs nothing. */
function useCampusCarousel(enabled: boolean) {
  const [cf, setCf] = useState({ a: 0, b: 1, aFront: true });
  const [labelIdx, setLabelIdx] = useState(0);
  const [labelVis, setLabelVis] = useState(true);
  useEffect(() => {
    if (!enabled || CAMPUS_CYCLE.length < 2) return;
    let swap = 0;
    const tick = window.setInterval(() => {
      setLabelVis(false);
      setCf((s) => {
        const front = s.aFront ? s.a : s.b;
        const next = (front + 1) % CAMPUS_CYCLE.length;
        return s.aFront ? { a: s.a, b: next, aFront: false } : { a: next, b: s.b, aFront: true };
      });
      swap = window.setTimeout(() => {
        setLabelIdx((i) => (i + 1) % CAMPUS_CYCLE.length);
        setLabelVis(true);
      }, 240);
    }, 1500);
    return () => { window.clearInterval(tick); window.clearTimeout(swap); };
  }, [enabled]);
  return { a: cf.a, b: cf.b, aFront: cf.aFront, labelIdx, labelVis };
}

/** THE CYCLING BOLT — two identical bolts in the same box, crossfading between two campuses'
 *  colours. Two layers rather than one recoloured layer because a `fill` cannot be transitioned
 *  from a CSS variable, and a hard colour cut is exactly the thing this is meant to avoid. Both
 *  layers run the same wall-clock boil animation with the same per-frame delays, so they are always
 *  on the SAME boil frame — the crossfade reads as one bolt changing colour, not two bolts. */
function CampusBolt({ a, b, aFront }: { a: CampusStop; b: CampusStop; aFront: boolean }) {
  const fade: React.CSSProperties = { transition: "opacity 460ms ease" };
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {/* Layer A sits in flow and sizes the box; B overlays it. */}
      <span style={{ display: "block", opacity: aFront ? 1 : 0, ...fade }}>
        <BoltBoil height={SOLO_ICON_H} red={a.c1} blue={a.c2} />
      </span>
      <span style={{ position: "absolute", left: 0, top: 0, opacity: aFront ? 0 : 1, ...fade }}>
        <BoltBoil height={SOLO_ICON_H} red={b.c1} blue={b.c2} />
      </span>
    </span>
  );
}


/** What the chapter line calls the house: its letters when we have them, else its name. */
function chapterDisplay(c: StoredChapter): string {
  // THE ORG'S NAME, never its Greek letters and never a chapter designation. The line is a
  // sentence a student reads ("for ALPHA DELTA PI at OLE MISS"), and letters there read as a code;
  // the letters already do their work as the card's icon directly above it. Nickname first,
  // because that is what people call the house.
  // The FULL name, not the nickname: this line is set in caps, and caps turn "ADPi" into "ADPI",
  // which is not what anyone calls that house. "ALPHA DELTA PI" survives the treatment.
  return c.name.toUpperCase();
}

/** THE CARD'S CONTEXT LINE — "for OLE MISS students ⇄". The same type treatment the hero line used
 *  before it moved in here, so nothing about the page's voice changed, only where it speaks from.
 *  It is its OWN control: the card body does nothing, the button is the door, and this opens a
 *  picker that rebrands in place (p11 §1/§2). */
function CardSwitcher({ label, name, tail, campusId, color, dim, onClick, aria }: {
  label: string;
  name: string;
  tail: string;
  /** Derive the ink from a known campus. Ignored when `color` is given. */
  campusId?: string | null;
  /** Explicit ink — the carousel passes the campus it is currently showing, which is not the
   *  campus the page is themed for. */
  color?: string;
  /** Dip to transparent through a carousel swap, so the name changes with the bolt rather than
   *  snapping a beat apart from it. */
  dim?: boolean;
  onClick: () => void;
  aria: string;
}) {
  const c = campusId ? boltFor(campusId) : null;
  const ink = color ?? (c ? readableCampusInk(c.c1, c.c2) : undefined);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      title={aria}
      className="sa-card-switch inline-flex items-center gap-1 rounded-full focus-visible:ring-2"
      style={{ background: "none", border: 0, cursor: "pointer", paddingInline: 6, minHeight: 30 }}
    >
      <span
        className="sa-campus-line"
        // DIPS, never disappears. Fading the name fully out for the swap left the line blank for a
        // sixth of every cycle, and a label that vanishes reads as a glitch rather than a change.
        style={{ fontFamily: BRAND_DISPLAY, margin: 0, opacity: dim ? 0.15 : 1, transition: "opacity 210ms ease" }}
      >
        {label ? <span className="sa-campus-line-for">{label} </span> : null}
        <span className="sa-campus-line-em" style={ink ? { color: ink } : undefined}>{name}</span>
        {tail ? <span className="sa-campus-line-for"> {tail}</span> : null}
      </span>
      <ArrowLeftRight size={12} aria-hidden style={{ color: "var(--text-muted)", flex: "none" }} />
    </button>
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
    <div className="fixed inset-0 z-[240] grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(5,8,16,0.72)" }} role="dialog" aria-modal="true" aria-label={`Exam 1 — free, coming ${EXAM1_LAUNCH_LABEL.toLowerCase()}`}>
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
          FREE · COMING {EXAM1_LAUNCH_LABEL.toUpperCase()}
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
/* NO RESTING FADE (p9 §6). The bolt used to sit at half strength until a campus was known, which
   made the brand mark look switched-off on the very first screen a stranger sees. Fading belongs
   to the SWITCH, not to the default: with no campus it is simply the full-colour brand bolt. */
.sa-door-bolt { transition: opacity 260ms ease; }
@keyframes sa-bolt-arrive { 0% { opacity: 0.15; transform: scale(0.72); } 62% { transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
.sa-door-bolt--arrive { animation: sa-bolt-arrive 320ms cubic-bezier(.2,.9,.3,1.2) both; }
@media (prefers-reduced-motion: reduce) { .sa-door-bolt--arrive { animation: none; } }

/* POINT AT THE DOOR AFTER A SWITCH (p11 §4). Changing school or chapter rebrands the page in place
   and nothing else moves, so the next step is easy to miss; the card whose context just changed
   pulses its button for about a second. Temporary — never a state the button stays in. */
@keyframes sa-door-btn-pulse {
  0%   { transform: scale(1);     box-shadow: 0 0 0 0 rgba(252,163,17,0.55); }
  45%  { transform: scale(1.035); box-shadow: 0 0 0 10px rgba(252,163,17,0); }
  100% { transform: scale(1);     box-shadow: 0 0 0 0 rgba(252,163,17,0); }
}
.sa-door-btn--pulse { animation: sa-door-btn-pulse 1050ms ease-out 2; }
@media (prefers-reduced-motion: reduce) { .sa-door-btn--pulse { animation: none; } }

/* The card's own context line — quiet until touched, like the hero swap it replaced. */
.sa-card-switch { transition: opacity 140ms ease; opacity: 0.9; }
.sa-card-switch:hover { opacity: 1; }

`;
