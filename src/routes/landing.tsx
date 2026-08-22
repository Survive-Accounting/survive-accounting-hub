// LANDING (preview) — the surviveaccounting.com rebuild in the intro-frame design language:
// navy/cream, boiling bolt, orbital background, one page, no nav bar. Built as a NEW route so the
// live homepage is untouched; promote to "/" (index.tsx) when approved.
//
// Free Exam-1 block reads fetchStudentTree (same server gate students hit — only status='live'
// sets, free playback resolved, paid withheld) and plays on the page via the shared HLS player +
// silent IntroSting pre-roll. Picking a school recolors the bolt (full takeover on the first pick
// this visit, a short beat after) and flips the campus status strip once a map exists (campus_exams,
// 0105). No checkout exists yet — paid exams show topics + a mapping-gated line, not purchasable.
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, GraduationCap, Lock, MessageCircle, X } from "lucide-react";

import { fetchStudentTree, type StudentSet, type StudentTopic } from "@/lib/student.functions";
import { isPlayable, nextStep, setIndexOf, stagesOf, type SetStage } from "@/lib/set-flow";
import { PracticeStage, readCoverage } from "@/components/site/PracticeStage";
import { StagePills } from "@/components/site/StagePills";
import { cramRequest, examRequest, notifyNote, passRequest, reviewRequest, type NotifyReq } from "@/lib/notify-request";
import { resolveStudentMap, type MapLevel } from "@/lib/map-resolver.functions";
import { getChapterNames, listCampusIntroCodes } from "@/lib/default-map.functions";
import { logSchoolDemand, submitExamAsk, submitSyllabus , submitNotify } from "@/lib/syllabus.functions";
import { searchOrderProfessors, type ProfessorLite } from "@/lib/orders.functions";
import { tagChapterMember } from "@/lib/greek-go.functions";
import { openClaimStep, SEAT_MINIMUM, SEAT_PRICE } from "@/components/site/ChapterAccess";
import { revealInContainer, scrollToId } from "@/lib/ui-scroll";
import { CourtesyLine } from "@/components/site/CourtesyLine";
import { SearchPicker } from "@/components/site/SearchPicker";
import { SmsConsentNote } from "@/components/landing/SmsConsentBanner";
import { useDismiss } from "@/lib/use-dismiss";
import { fetchCourseOptions } from "@/lib/je-api";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { BoltBoil, SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { FitWordmark, SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { PickerSheet } from "@/components/site/PickerSheet";
import { logCampusCodeDemand } from "@/lib/campus-demand.functions";
import { ALL_SCHOOLS, searchSchools } from "@/lib/schools";
import { ANIMATED_BOLT_CSS, type BoltHeroStop } from "@/components/site/AnimatedBolt";
import {
  FeatureValueStrip, MARKETING_CSS, MARKETING_HERO_ID, MarketingHero, MarketingUtilityLinks,
  SocialProofSection, StickyFooterBar, TutorBioModal, TutorCard, type GreekMarketing,
} from "@/components/site/Marketing";
import { CampusProvider, useCampus } from "@/lib/campus-context";
import { readStoredCampus, rememberCampus, rememberProfSkip, SKIPPED, NOT_LISTED } from "@/lib/campus-prefs";
import { Footer } from "@/components/site/SiteFooter";
import { TestimonialsSlider } from "@/components/site/Testimonials";
import { contactKind, LAUNCH_LINE, LAUNCH_WINDOW } from "@/lib/launch";
import { Bolt, BRAND_BLUE, BRAND_DISPLAY, BRAND_RED, BRAND_SANS, SEC_SCHOOLS } from "@/components/canvas/brand";

// PROMOTED TO "/" on 2026-08-13. This path 301s to the homepage so every link, QR and bookmark
// already in the wild keeps working, and the two URLs never compete for the same content.
// The PAGE still lives in this module: index.tsx imports LandingPage, and /chapters, /c/$slug and
// /expand import CampusSelector / Footer / SCHOOLS from here.
export const Route = createFileRoute("/landing")({
  beforeLoad: () => { throw redirect({ to: "/", statusCode: 301 }); },
});

// The exam section's anchor. Shared so a campus-page navigation lands at the player rather
// than the top of a page the student has already read.
const EXAM_ANCHOR_ID = "exam1";
const PHONE = "(662) 565-8818";
const TEL = "+16625658818";
/** The home hero's colour-cycle leaders, in build-priority order (the brief's original trio). */
const ROTATION_LEAD = ["ole-miss", "lsu", "tennessee"];

// THE SCHOOL LIST — derived from the generated table, never hand-maintained here.
//
// This was a third hardcoded copy of the SEC 16, alongside schools.ts and brand.tsx, and the three
// drifted: this one still called Missouri "Missouri" after the canonical name became "Mizzou".
// One source now — src/lib/schools.ts, generated from the campuses table.
//
// WHY NOT ALL 945 CAMPUSES: the list is the SEC 16 plus the hand-verified seed. A student who
// picks a school with no course code gets a worse experience than one asked to tell us about it,
// so everything else goes through "My school isn't listed".
export type School = {
  campusId: string; id: string; name: string; slug: string; isSec: boolean;
  /** Matched in search, NEVER displayed. */
  aliases: string[];
  code?: string; codeVerified?: boolean;
};
export const SCHOOLS: School[] = ALL_SCHOOLS.map((s) => ({
  campusId: s.campusId, id: s.id, name: s.name, slug: s.slug, isSec: s.isSec, aliases: s.aliases,
  // The generated code is a build snapshot shown immediately; listCampusIntroCodes still
  // overrides it at runtime, so a mid-semester change never needs a deploy.
  code: s.courseCode ?? undefined, codeVerified: !!s.courseCode,
}));
// SEC colours come from brand.tsx (SEC_SCHOOLS); the seeded campuses carry their own from the
// database. Falling back to brand red/blue rather than inventing a colour for an unknown id.
const COLOR_BY_ID = new Map<string, { c1: string; c2: string }>([
  ...SEC_SCHOOLS.map((s: { id: string; c1: string; c2: string }) => [s.id, { c1: s.c1, c2: s.c2 }] as const),
  ...ALL_SCHOOLS.filter((s) => s.c1 && s.c2).map((s) => [s.id, { c1: s.c1!, c2: s.c2! }] as const),
]);
const schoolColors = (id: string) => COLOR_BY_ID.get(id) ?? { c1: BRAND_RED, c2: BRAND_BLUE };

// EXACT BRAND HEX, nothing else. An earlier version pushed every low-contrast colour toward
// white (Ole Miss navy #14213D became slate #697183, Auburn navy and Georgia black went grey) and
// then reordered c1/c2 by brightness so light secondaries became the main fill — on the theory
// that a dark bolt would vanish into the navy page. The white keyline and the two-colour banded
// gradient make that unnecessary, and Lee could see the colours were wrong. A school's colours
// are its colours.
const boltFor = (id: string) => schoolColors(id);

// Static fallbacks when live data isn't published yet (the menu IS the marketing).
const STATIC_EXAM1 = ["Types of Accounts", "A = L + E", "Debits & Credits", "Journal Entries", "Adjusting Entries", "Closing Entries"];
const STATIC_EXAM2 = ["Merchandising", "Inventory (FIFO / LIFO)", "Multi-step Income Statement", "Internal Controls", "Receivables"];
const STATIC_EXAM3 = ["Long-Term Assets", "Current Liabilities", "Long-Term Liabilities", "Equity", "Statement of Cash Flows"];
const STATIC_FINAL = ["Full Accounting Cycle", "Financial Statements", "Ratios & Analysis", "Comprehensive Problems"];

// A resolved Exam topic: its display name/number + ALL its sets (the outline lists them; today one
// set per topic, but the shape supports more). A topic with no sets is "coming" (poster).
type ResolvedTopic = { key: string; name: string; num: number | null; sets: StudentSet[] };

/** `goChapter` replaces the old flat `chapterSlug`. A chapter is identified by (school, chapter)
 *  now — the /c/ single-slug namespace is redirect-only — and this pair is what the claim writes
 *  against. */
// PROVIDER SHELL. The /go/ route knows the school from the URL; everything under here reads it
// from campus context rather than re-deriving it, which is what let the hero cycle through other
// schools' colourways on a chapter page that named one school in its banner.
interface LandingProps {
  initialCampusId?: string;
  /** Campus slug straight from the URL. Resolves campus context on the FIRST render,
   *  before any chapter fetch — see the note atop go.$school.$chapter.tsx. */
  campusSlug?: string;
  /** Course code resolved server-side, so the headline never gains it a beat later. */
  initialCourseCode?: string | null;
  /** Rendered INSTEAD of the video on Greek chapter pages until the visitor has an account.
   *  A seat is an entitlement and an entitlement needs a user_id, so this is what makes the
   *  paid product deliverable — not a marketing gate. Never set on the solo page. */
  videoGate?: React.ReactNode;
  /** The chapter-access section, rendered after the player (never between a visitor and it). */
  chapterAccess?: React.ReactNode;
  /** Greek chapter name. Its presence IS the Greek variant switch. */
  greekOrg?: string;
  /** Greek marketing context — org name, display letters, claim state, access anchor. Replaces
   *  the old chapterTop hero SLOT: the /go/ route passes DATA and the ONE configurable
   *  MarketingHero renders it, so greek pages can never grow a separately designed hero again. */
  greek?: GreekMarketing;
  /** Greek member attribution, fired from the hero CTAs (was ChapterTop's onStartExam). */
  onStartExam?: () => void;
  /** Chapter-page navbar: same-page anchors + the exec CTA. The /go/ route passes its own
   *  anchor ids here so the navbar and the sections can never disagree about them. */
  greekNav?: { examAnchor: string; accessAnchor: string };
  goChapter?: { schoolSlug: string; chapterSlug: string };
  /** Greek chapters known at this campus — drives the "For fraternities & sororities" secondary
   *  CTA on campus pages (hidden at 0, where it would invite people to an empty list). */
  chapterCount?: number;
  /** The visitor's remembered campus, read from the request cookie by the route loader (a picker
   *  id, or the SKIPPED / NOT_LISTED sentinel). Lets the SERVER render the returning visitor's
   *  page — campus hero, pre-matched player, right <title> — instead of swapping to it after
   *  hydration. See lib/campus-prefs.ts. */
  storedCampusId?: string | null;
  /** School id whose professor question this visitor already skipped (cookie). */
  profSkipFor?: string | null;
}

export function LandingPage(props: LandingProps = {}) {
  const { campusSlug, goChapter, initialCampusId, initialCourseCode, storedCampusId } = props;
  return (
    <CampusProvider urlSchoolSlug={campusSlug ?? goChapter?.schoolSlug ?? null} accountCampusId={initialCampusId ?? null} initialCode={initialCourseCode ?? null} initialStoredId={storedCampusId ?? null}>
      <LandingPageInner {...props} />
    </CampusProvider>
  );
}

function LandingPageInner({ initialCampusId, goChapter, chapterAccess, campusSlug, greek, onStartExam, chapterCount, greekOrg, greekNav, videoGate, storedCampusId, profSkipFor }: LandingProps) {
  // M1.4 — paint html/body navy so Safari's overscroll rubber-band matches the page instead
  // of flashing the light default at the top and bottom edges.
  useNavyDocument();
  const navigate = useNavigate();
  // M2.3 — which topic the notify modal was opened from (null = closed).
  // THE ONE NOTIFY INTERACTION (08-21). Every "tell me when it's ready" in the player — a muted
  // Cram/Review pill, a locked set on a future exam, the Poster CTA, the Semester Pass bracket —
  // builds a NotifyReq and opens this single modal. There are no persistent email forms in the
  // player any more; signup appears when the student expresses intent.
  const [notifyReq, setNotifyReq] = useState<NotifyReq | null>(null);
  // /c/<slug> pre-selects the chapter's school. If it's one of the 16 SEC schools we pre-pick it;
  // otherwise we drop into "not listed" (default map) so the player still unblurs and plays.
  const campus = useCampus();
  // The resolved campus's bolt colours, published on the page root. One source; no component
  // picks its own. Null when campus is unknown, which leaves the cycling hero to set its own.
  const campusBolt = useMemo(() => (campus.school ? boltFor(campus.school.id) : null), [campus.school]);
  const preSchool = useMemo(() => (initialCampusId ? SCHOOLS.find((s) => s.campusId === initialCampusId) ?? null : null), [initialCampusId]);
  // INITIAL SCHOOL IS WHATEVER THE SERVER ALREADY KNOWS — the URL's campus or the cookie's stored
  // one, both of which campus context resolved before this render on BOTH sides. Initialising
  // from it (instead of null + an effect) is what lets a returning visitor's first paint show the
  // matched player rather than "Pick your school" for a frame.
  const [school, setSchool] = useState<School | null>(() => preSchool ?? (campus.school ? SCHOOLS.find((s) => s.id === campus.school!.id) ?? null : null));
  // "My school isn't listed" / "Skip for now" — unblur with the DEFAULT map + brand navy (no school
  // colors). Everything else behaves like an unmapped-campus session. The cookie sentinels seed it
  // so a skipper's return visit server-renders the generic player, not the school question again.
  const [notListed, setNotListed] = useState((!!initialCampusId && !preSchool) || storedCampusId === SKIPPED || storedCampusId === NOT_LISTED);
  const [theater, setTheater] = useState<{ school: School; mode: "full" | "short" } | null>(null);
  const firstPick = useRef(false);
  // A single monotonic "pulse" the Try-Exam-1 CTA bumps: scrolls to the player and rings the gate
  // picker once (no loop). The gated CampusSelector reacts to the change; nothing else does.
  // THE ONE DOOR. Scroll to the player and bump focusSignal so it opens the first topic and starts
  // playing. It no longer rings a school picker: there is no gate to ring. Content first, matching
  // later — the student sees the thing before being asked anything about themselves.
  const [focusSignal, setFocusSignal] = useState(0);
  const onStart = () => { document.getElementById("exam1")?.scrollIntoView({ behavior: "smooth" }); setFocusSignal((f) => f + 1); };
  // The hero primary CTA also carries greek member attribution (the /go/ route's tagMember —
  // saying "start Exam 1" on a chapter's own URL IS the attribution, exactly as before).
  const heroStart = () => { onStartExam?.(); onStart(); };
  // The full Lee bio — a modal now, opened by the "pro tutor" trust chip and the tutor card.
  const [bioOpen, setBioOpen] = useState(false);
  const [syllabusOpen, setSyllabusOpen] = useState(false);
  // Optional custom lead line for the syllabus modal (e.g. the unlisted-professor follow-up:
  // "Don't see Prof. X yet — send me anything from the class and I'll map it."). Null = default copy.
  const [syllabusFraming, setSyllabusFraming] = useState<string | null>(null);
  const openSyllabus = (framing?: string) => { setSyllabusFraming(framing ?? null); setSyllabusOpen(true); };
  // Professor rung (confidence ladder step 2) — persisted ACROSS visits (localStorage; the earlier
  // session-only rule was for in-chat artifacts). Personalizes labels only, never gates.
  const [professor, setProfessor] = useState<ProfessorLite | null>(null);
  const pickProfessor = (p: ProfessorLite | null) => { setProfessor(p); try { if (p) localStorage.setItem("sa-landing-prof", JSON.stringify(p)); else localStorage.removeItem("sa-landing-prof"); } catch { /* ignore */ } };
  // Clears BOTH the stored professor and the legacy skip flag: the skip rung no longer exists,
  // but old visitors still carry the key and it must not outlive a school change.
  const resetProfessor = () => { setProfessor(null); try { localStorage.removeItem("sa-landing-prof"); localStorage.removeItem("sa-landing-prof-skip"); } catch { /* ignore */ } };
  // THE FULL RESET. Both "Change" in the panel and "← Change school" in the sheet run this, and it
  // clears school, the not-listed flag AND the professor together. A partial reset — new school,
  // professor left over from the old one — would silently attach a student to another campus's
  // faculty, which is a worse failure than being asked the question twice.
  // A deliberate Reset must WIN over the campus-context adoption effect below, which would
  // otherwise hand the school straight back (URL / stored pick) and leave the player stuck on
  // the professor rung. The flag clears on the next explicit pick.
  const [manualReset, setManualReset] = useState(false);
  //
  // RESET IS SITE-WIDE, NOT PLAYER-WIDE. It used to clear only the player's own school while the
  // hero, bolt and headline kept reading "ACCY 201 at Ole Miss" from campus context — a page half
  // about a school the visitor had just said they were not at. Now it clears campus context too
  // (session + stored + storage key), so the whole page drops to the generic version in one step.
  // On a page whose URL names the school (/<school>, /go/…) the URL would simply re-assert it, so
  // that case goes home — the generic page is the only honest "no school" there is.
  //
  // ROUTE CONTEXT IS IMMUTABLE (08-21). On /<school> or /go/<school>/<chapter> the URL named
  // the school (and chapter/course); Reset must never send that visitor back to the school
  // picker or off the page. There it resets ONLY the player session: professor + the
  // professor-skip cookie are cleared (the next state is "Pick your professor to start", with
  // Skip), the topic/set selection and the practice session are dropped via resetSeq, and
  // school / course / chapter stay exactly as the route provided them. The generic homepage is
  // the only place a Reset returns to school selection. Precedence everywhere: route-provided
  // context → this session's pick → stored last-used → the generic picker.
  const routeLocked = !!campusSlug || !!goChapter || !!greekOrg;
  const [resetSeq, setResetSeq] = useState(0);
  const resetMatch = () => {
    setResetSeq((n) => n + 1);
    resetProfessor();
    rememberProfSkip(null);
    if (routeLocked) {
      // Back to the route's own school — a stored or session pick never outranks the URL here.
      setNotListed(false);
      if (preSchool) setSchool(preSchool);
      return;
    }
    setManualReset(true);
    setSchool(null);
    setNotListed(false);
    campus.clearSchool();
  };
  // "Not your school?" on a campus/chapter page. Picking a school on the homepage navigates to
  // /<school>, so a wrong pick lands on a route-locked page where Reset keeps the school by
  // design. This is the deliberate exit: forget the stored campus and go to the generic picker.
  const changeSchool = () => {
    setManualReset(true);
    resetProfessor();
    rememberProfSkip(null);
    campus.clearSchool();
    void navigate({ to: "/", hash: EXAM_ANCHOR_ID });
  };
  // ADOPT THE URL'S SCHOOL. preSchool is derived from initialCampusId, which arrives from the
  // chapter QUERY — so on a /go/ page it is still null during the first render, and
  // useState(preSchool) captured that null and never looked again. The player then asked "Pick
  // your school" on a URL that had already named the school.
  //
  // Campus context resolves the slug synchronously from the school table, with no request, so it
  // is right on the very first render. Only fills an EMPTY choice: a visitor who picks a different
  // school in the player outranks the URL and must not be overwritten.
  useEffect(() => {
    if (school || notListed || manualReset || !campus.school) return;
    const s = SCHOOLS.find((x) => x.id === campus.school!.id);
    if (s) setSchool(s);
  }, [campus.school, school, notListed, manualReset]);

  // RETURNING VISITOR — restore school (or "not listed") + professor + skip AFTER mount (never in an
  // initializer: this route SSRs, and a server/client mismatch there breaks hydration). A /c/<slug>
  // link's pre-selection wins over storage. Legacy sessionStorage values migrate forward once.
  useEffect(() => {
    if (initialCampusId) return; // chapter-link sessions keep their own preselection
    try {
      const id = readStoredCampus();
      if (id === NOT_LISTED || id === SKIPPED) setNotListed(true);
      else if (id) { const s = SCHOOLS.find((x) => x.id === id); if (s) { setSchool(s); firstPick.current = true; } } // change → short beat
      const rawProf = localStorage.getItem("sa-landing-prof") ?? sessionStorage.getItem("sa-landing-prof");
      if (rawProf) setProfessor(JSON.parse(rawProf) as ProfessorLite);
    } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // "change" on the identity line — back to the gate (picker rings open); the next pick re-runs the
  // short recolor beat via the normal pickSchool path and the professor line resets.

  const theme = useMemo(() => {
    if (!school) return DEFAULT_FRAME_THEME;
    const c = boltFor(school.id);
    return { ...DEFAULT_FRAME_THEME, boltPrimary: c.c1, boltSecondary: c.c2 }; // recolor bolt (contrast-safe); keep the gold accent
  }, [school]);

  // Course codes for ALL schools up front (one call on mount), so every dropdown row can show its
  // VERIFIED code without a per-selection round-trip. Codes come only from the DB — a school with no
  // code in campuses.course_family_codes_json.intro_1 simply renders no code (never a guess).
  const codesQ = useQuery({ queryKey: ["landing-campus-codes"], queryFn: () => listCampusIntroCodes({ data: { ids: SCHOOLS.map((s) => s.campusId) } }), staleTime: 600_000, networkMode: "always" });
  const schoolsWithCodes = useMemo<School[]>(() => {
    // UNTIL THE LIVE ANSWER ARRIVES, THE STATIC SNAPSHOT STANDS. The old version mapped every
    // school to `code: undefined` while the query was in flight, which wiped the generated
    // build-time codes for one render — the hero plate visibly flashed "for · OLE MISS" and
    // grew its course code a beat later. Once codesQ.data EXISTS its absence is authoritative
    // (a code removed from the DB should vanish); while it is loading, absence means nothing.
    if (!codesQ.data) return SCHOOLS;
    const m = new Map(codesQ.data.map((r) => [r.campusId, r.code]));
    return SCHOOLS.map((s) => { const code = m.get(s.campusId); return code ? { ...s, code, codeVerified: true } : { ...s, code: undefined, codeVerified: false }; });
  }, [codesQ.data]);

  // MARKETING CONTEXT — which of the three page kinds this render is, and the code/school the
  // copy interpolates. Greek wins; a known campus (URL, account, or a returning visitor's stored
  // pick) reads as a campus page; otherwise general. Campus/greek bolts inherit the page root's
  // --sa-bolt vars; the GENERAL hero rotates through every school colourway (below).
  const heroSchoolName = school?.name ?? campus.school?.name ?? null;
  const heroKind: "general" | "campus" | "greek" = greek ? "greek" : heroSchoolName ? "campus" : "general";
  const heroCode = campus.code ?? (school?.codeVerified && school.code ? school.code : null);

  // HOME ROTATION — Ole Miss, LSU and Tennessee lead (build-priority order), the rest follow in
  // picker order; AnimatedBoltHero cycles through ALL of them continuously (~5s each).
  // Codes ride along ONLY when verified, so the plate can never print a plausible wrong one.
  const rotationStops = useMemo<BoltHeroStop[]>(() => {
    const rank = (id: string) => { const i = ROTATION_LEAD.indexOf(id); return i < 0 ? ROTATION_LEAD.length : i; };
    return schoolsWithCodes
      .slice()
      .sort((a, b) => rank(a.id) - rank(b.id))
      .map((s) => ({ id: s.id, name: s.name, code: s.code ?? null, ...boltFor(s.id) }));
  }, [schoolsWithCodes]);

  const treeQ = useQuery({ queryKey: ["landing-tree", school?.campusId ?? null], queryFn: () => fetchStudentTree({ data: school ? { campusId: school.campusId } : {} }), networkMode: "always", staleTime: 300_000 });
  const intro1 = useMemo(() => (treeQ.data ?? []).find((c) => c.family === "intro_1" || c.name.trim().toLowerCase() === "intro 1") ?? null, [treeQ.data]);

  // Intro-1 course id from the canonical `courses` table — the SAME source the campus map was
  // created under (the outline). Decoupled from fetchStudentTree, which only returns courses that
  // have LIVE sets, so mapped-detection works even before any Intro-1 video is published.
  const courseOptQ = useQuery({ queryKey: ["landing-courses"], queryFn: () => fetchCourseOptions(), staleTime: 600_000, networkMode: "always" });

  // THE RESOLVER (map system) — the ONE path that answers "what are this student's exams/topics":
  // professor map → campus map → Starter Map, resolved server-side. No landing code queries
  // campus_exams / default_exam_units directly anymore.
  //
  // A WRITE-IN professor (a campus with no faculty listed yet) carries a non-uuid id ("") so it can
  // never own a map — only a real, uuid faculty row does. The resolver validates professorId as a
  // uuid, so sending "" would throw; strip any non-uuid id to null here and let it resolve at the
  // campus/starter level, which is exactly right for a professor we don't have a map for.
  const profMapId = professor && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(professor.id) ? professor.id : null;
  const mapQ = useQuery({
    queryKey: ["landing-map", school?.campusId ?? null, profMapId],
    queryFn: () => resolveStudentMap({ data: { campusId: school?.campusId ?? null, professorId: profMapId } }),
    networkMode: "always", staleTime: 120_000,
  });
  const resolvedMap = mapQ.data ?? null;
  // HONEST-TRUST-LINE: which level actually SERVED the map — the professor-syllabus trust claim
  // is only allowed when the professor's own map won resolution, not a campus/starter fallback.
  const resolvedExams = useMemo(() => resolvedMap?.exams ?? [], [resolvedMap]);
  const coverageByNum = useMemo(() => new Map(resolvedExams.map((e) => [e.num, e.coveragePct])), [resolvedExams]);

  // Real-map plumbing: chapter(id→name/number) from the canonical courses table, live sets by
  // chapter id from the student tree, and the resolved exams (num + ordered chapter ids).
  const chapterById = useMemo(() => {
    const cs = courseOptQ.data ?? [];
    const c = cs.find((x) => x.course_family === "intro_1") ?? cs.find((x) => (x.course_name ?? "").trim().toLowerCase() === "intro 1");
    const m = new Map<string, { name: string; number: number | null }>();
    for (const ch of c?.chapters ?? []) m.set(ch.id, { name: ch.name ?? "Topic", number: ch.number ?? null });
    return m;
  }, [courseOptQ.data]);
  const treeTopicById = useMemo(() => {
    const m = new Map<string, StudentTopic>();
    if (intro1) { for (const t of intro1.topics) m.set(t.id, t); for (const u of intro1.units) for (const t of u.topics) m.set(t.id, t); }
    return m;
  }, [intro1]);

  // Every chapter id any resolved exam references, named DIRECTLY from the chapters table —
  // immune to course de-dup, so a mapped topic never shows a bare "Topic".
  const allTopicIds = useMemo(() => { const s = new Set<string>(); resolvedExams.forEach((e) => e.chapterIds.forEach((id) => s.add(id))); return [...s]; }, [resolvedExams]);
  const namesQ = useQuery({ queryKey: ["landing-chapter-names", allTopicIds], queryFn: () => getChapterNames({ data: { ids: allTopicIds } }), enabled: allTopicIds.length > 0, networkMode: "always", staleTime: 600_000 });
  const nameById = useMemo(() => { const m = new Map<string, { name: string; number: number | null }>(); for (const r of namesQ.data ?? []) m.set(r.id, { name: r.name, number: r.number }); return m; }, [namesQ.data]);

  // Resolve an exam's topic LIST strictly from the MAP: campus exam map (if mapped) → default map →
  // static. It must NEVER list the whole course — the old fallback pulled intro1.units[0]/intro1.topics
  // (every chapter, incl. Exam-2/3 topics like "Long Term Liabilities") whenever a map wasn't found,
  // which is exactly the bug. Live free sets still attach per chapter id via the student tree
  // (treeTopicById), so free content is never gated by mapping — only the LIST comes from the map.
  // `paidTab`: the FREE tab never lists a paid set; PAID tabs keep them — their stems arrive from the
  // server already ░-redacted (fetchStudentTree), so the locked tease is the shape, never the words.
  const resolveExam = (num: number, statics: string[], paidTab: boolean): ResolvedTopic[] => {
    const ids = resolvedExams.find((e) => e.num === num)?.chapterIds ?? [];
    if (ids.length) return ids.map((cid) => { const nm = nameById.get(cid), ch = chapterById.get(cid), st = treeTopicById.get(cid); return { key: cid, name: nm?.name ?? ch?.name ?? st?.name ?? "Topic", num: nm?.number ?? ch?.number ?? st?.number ?? null, sets: (st?.sets ?? []).filter((s) => paidTab || s.access !== "paid") }; });
    return statics.map((n) => ({ key: n, name: n, num: null, sets: [] }));
  };
  const exam1R = useMemo(() => resolveExam(1, STATIC_EXAM1, false), [resolvedExams, nameById, chapterById, treeTopicById]);
  const exam2R = useMemo(() => resolveExam(2, STATIC_EXAM2, true), [resolvedExams, nameById, chapterById, treeTopicById]);
  const exam3R = useMemo(() => resolveExam(3, STATIC_EXAM3, true), [resolvedExams, nameById, chapterById, treeTopicById]);
  const finalR = useMemo(() => resolveExam(99, STATIC_FINAL, true), [resolvedExams, nameById, chapterById, treeTopicById]);
  const exams = useMemo<ExamTab[]>(() => [
    { num: 1, label: "Exam 1", price: null, topics: exam1R, coveragePct: coverageByNum.get(1) ?? null },
    { num: 2, label: "Exam 2", price: PAID_EXAM_PRICE, topics: exam2R, coveragePct: coverageByNum.get(2) ?? null },
    { num: 3, label: "Exam 3", price: PAID_EXAM_PRICE, topics: exam3R, coveragePct: coverageByNum.get(3) ?? null },
    { num: 99, label: "Final", price: PAID_EXAM_PRICE, topics: finalR, coveragePct: coverageByNum.get(99) ?? null },
  ], [exam1R, exam2R, exam3R, finalR, coverageByNum]);

  const pickSchool = (s: School) => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setManualReset(false);
    setNotListed(false);
    if (school?.id !== s.id) resetProfessor(); // new school → professor line resets (spec: ladder resets with school)
    setSchool(s);
    campus.setSessionSchool(s.id);   // persists AND raises campus context to session priority

    // A SCHOOL WITH NO COURSE CODE IS A DEMAND SIGNAL, not an error. It is a student telling us
    // which code to find next, so it is logged before anything else happens — and best-effort,
    // because a logging failure must never cost someone their exam.
    if (!s.codeVerified || !s.code) {
      void logCampusCodeDemand({ data: { campusId: s.campusId, campusSlug: s.slug, campusName: s.name, source: campusSlug ? "campus-page" : "landing" } }).catch(() => {});
    }

    // NAVIGATE TO THE CAMPUS PAGE when we are not already on it. That page is this same player
    // with the school applied, plus a headline naming their course — so the pick lands somewhere
    // shareable and indexable rather than in a state only this tab knows about.
    if (s.slug && campusSlug !== s.slug) {
      void navigate({ to: "/$school", params: { school: s.slug }, hash: EXAM_ANCHOR_ID });
      return;
    }

    if (reduce) return; // instant swap, no takeover
    const mode = firstPick.current ? "short" : "full";
    firstPick.current = true;
    setTheater({ school: s, mode });
  };

  return (
    <div style={{ ...frameThemeVars(theme), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "clip", ...(campusBolt ? { ["--sa-bolt-1"]: campusBolt.c1, ["--sa-bolt-2"]: campusBolt.c2 } as React.CSSProperties : {}) }}>
      <style>{ANIMATED_BOLT_CSS}</style>
      <style>{MARKETING_CSS}</style>
      <style>{`
        @keyframes sa-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        /* AMBIENT, not attention-grabbing: 96s per loop under the entry overlay — slow enough to
           be ignorable, still alive. Hover/focus pause + edge fade masks are already on it. */
        .sa-marquee-track { animation: sa-marquee 96s linear infinite; }
        .sa-marquee:hover .sa-marquee-track { animation-play-state: paused; }
        /* Pause on FOCUS too, not just hover: a keyboard user tabbing into a moving strip would
           otherwise be chasing the thing they are focused on. */
        .sa-marquee:focus-within .sa-marquee-track { animation-play-state: paused; }
        .sa-tick-item { cursor: pointer; background: none; border: 0; padding: 0 4px; min-height: 44px; min-width: 44px; border-radius: 4px; transition: color 140ms, text-shadow 140ms; }
        .sa-tick-item:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
        .sa-tick-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; color: var(--accent); }
        /* sa-picker-pulse moved to styles.css — it was defined only here, so the ring was
           dead on /chapters and /expand, which render the same CampusSelector. */
        .sa-chg { opacity: 0; transition: opacity 120ms; }
        .sa-idrow:hover .sa-chg, .sa-chg:focus-visible { opacity: 1; }
        @media (hover: none) { .sa-chg { opacity: 1; } }
        @keyframes sa-meter-in { from { transform: translateY(-6px); opacity: 0; } to { transform: none; opacity: 1; } }
        .sa-meter-in { animation: sa-meter-in 200ms ease; }
        /* ENTRY OVERLAY → CONTENT: the revealed player fades in rather than snapping. */
        @keyframes sa-reveal { from { opacity: 0; } to { opacity: 1; } }
        .sa-reveal { animation: sa-reveal 420ms ease; }
        /* The entry overlay card — floats over the preview media, dark enough to stay readable
           when the placeholder becomes real footage. */
        .sa-entry-card { background: color-mix(in srgb, var(--bg-overlay) 94%, transparent); border: 1px solid var(--border-default); border-radius: 16px; padding: 18px 16px; box-shadow: 0 24px 60px -24px rgba(0,0,0,0.8); backdrop-filter: blur(6px); }
        @media (prefers-reduced-motion: reduce) { .sa-meter-in, .sa-reveal { animation: none; } }
      `}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.34} animate /></div>

      {/* M1.5 — the persistent way home. On / it is the brand anchor; on /c/<slug> and the
          other pages that reuse LandingPage it is the only route back. Chapter pages swap the
          homepage links for same-page anchors via greekNav. */}
      <SiteHeader chapterNav={greekNav} onLanding />

      {/* maxWidth + overflow-x guard (M1.1): `padding: 0 20px` on a 1040-wide box is fine on
          desktop, but any child that ignores the box (a nowrap lockup, a fixed-width panel)
          used to push the document sideways. Clamping here contains it at the source. */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px", width: "100%", overflowX: "clip" }}>
        {/* ONE HERO for every marketing page — the kind + context select the copy and CTAs.
            heroStart = the primary CTA, the bolt, AND the "Built for exam week" chip: scroll to
            the player, plus greek member attribution when the route wired it. */}
        <MarketingHero
          kind={heroKind}
          code={heroCode}
          schoolShort={heroSchoolName}
          rotationStops={rotationStops}
          onBoltPick={(id) => { const s = schoolsWithCodes.find((x) => x.id === id); if (s) pickSchool(s); else onStart(); }}
          greek={greek}
          onStart={heroStart}
          secondaryLabel={greek ? (greek.claimed ? `Use ${greek.letters} access →` : `Set up ${greek.letters} access →`) : "For fraternities & sororities →"}
          secondaryHref={greek ? undefined : school ? `/chapters?school=${encodeURIComponent(school.slug)}` : "/chapters"}
          onSecondary={greek ? () => { if (greek.claimed) scrollToId(EXAM_ANCHOR_ID); else { openClaimStep(); scrollToId(greek.accessAnchor); } } : undefined}
          showSecondary={greek ? true : heroKind !== "campus" || (chapterCount ?? 0) > 0}
          onOpenBio={() => setBioOpen(true)}
          courtesy={greek && goChapter ? <CourtesyLine schoolSlug={goChapter.schoolSlug} chapterSlug={goChapter.chapterSlug} chapterName={greek.orgName} /> : undefined}
        />
        <ExamPlayer videoGate={videoGate} greekOrg={greekOrg} exams={exams} school={school ? (schoolsWithCodes.find((x) => x.id === school.id) ?? school) : null} onPick={pickSchool} focusSignal={focusSignal} schools={schoolsWithCodes} onSyllabus={openSyllabus} professor={professor} onPickProfessor={pickProfessor} notListed={notListed} onNotListed={() => { setNotListed(true); void logCampusCodeDemand({ data: { source: "write-in" } }).catch(() => {}); rememberCampus(NOT_LISTED); }} onSkipSchool={() => { setNotListed(true); rememberCampus(SKIPPED); }} schoolSkipped={notListed && !school} initialProfSkipped={!!school && !!profSkipFor && profSkipFor === school.id} onReset={resetMatch} resetSeq={resetSeq} resetLabel={routeLocked ? "Start over" : "Reset"} onChangeSchool={routeLocked ? changeSchool : undefined} theater={theater} onTheaterDone={() => setTheater(null)} onNotify={(r) => setNotifyReq(r)} />

        {/* Value strip AFTER the player: the product proves the claims, the strip reinforces. */}
        <FeatureValueStrip code={heroCode} />

        {/* CHAPTER ACCESS still after the product, never before it. */}
        {chapterAccess}

        {/* Greek pages put proof before the FAQ (reviews answer "is this real?", which an exec
            asks before the operational questions). The student page keeps its existing order. */}
        {greekOrg ? null : <Faq greek={undefined} />}
        <SectionDivider />
        {/* sa-anchor (not a hardcoded scroll-mt): the offset tracks the real measured header
            height via --sa-header-h, same as #exam1 and #chapter-access. The #lee anchor lives
            on the tutor column inside the row. */}
        <div id="reviews" className="sa-anchor" />
        <SocialProofSection
          testimonials={<TestimonialsSlider />}
          tutor={<TutorCard onMore={() => setBioOpen(true)} />}
        />
        <SectionDivider />
        {greekOrg ? <Faq greek={greekOrg} /> : null}
        {/* Utility requests live at the FOOT of the persuasion flow — after proof, before the
            footer — instead of interrupting the pitch mid-page. */}
        <MarketingUtilityLinks
          kind={heroKind}
          onProfessorAsk={() => openSyllabus("Don't see your professor? Tell me who teaches your class and I'll map them.")}
        />
      </main>
      {/* OUTSIDE <main> on purpose: the footer surface is full-bleed, its CONTENT is centred by
          the footer's own max-w-[1040px] rows. Inside main it inherited main's max width and the
          navy band stopped 20px short of each edge. */}
      <Footer onLanding />

      {bioOpen && <TutorBioModal onClose={() => setBioOpen(false)} />}
      {/* The sticky footer slides up once the hero is gone and away again at the real footer. */}
      <StickyFooterBar
        heroId={MARKETING_HERO_ID}
        tel={TEL}
        phone={PHONE}
        links={[
          { label: "Cram Exam 1 Free", href: "#exam1" },
          { label: "Reviews", href: "#reviews" },
          { label: "Meet your tutor", href: "#lee" },
          greek ? { label: "Chapter Access", href: `#${greek.accessAnchor}` } : { label: "For Greeks", href: "/chapters" },
        ]}
      />

      {syllabusOpen && <SyllabusModal school={school} framing={syllabusFraming} onClose={() => { setSyllabusOpen(false); setSyllabusFraming(null); }} />}
      {notifyReq && <NotifyModal req={notifyReq} school={school} professorName={professor ? (professor.last || professor.name) : null} onClose={() => setNotifyReq(null)} />}
    </div>
  );
}

// The old Hero / CampusTop / ChapterTop trio is GONE — MarketingHero in components/site/Marketing
// renders the one configurable hero for all three page kinds. See that file for the layout rules
// (mobile bolt-below-CTA order, promise-over-description weighting, greek eyebrow).

// Slow marquee of SEC school names in build-priority order. Muted, pausable on hover; reduced-motion
// collapses to a static first-three line. Track duplicates the row and slides -50% for a seamless loop.
// `reduce` is read in an EFFECT, never during render. Calling matchMedia while rendering is a real
// hydration hazard on this SSR'd route: the server always takes the animated branch while a
// reduced-motion client takes the static one, so the two trees disagree on the first paint.
function SchoolTicker({ size = 14, className = "mt-3 w-full max-w-md", onPick }: { size?: number; className?: string; onPick?: (s: School) => void } = {}) {
  const [reduce, setReduce] = useState(false);
  useEffect(() => { setReduce(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);

  // PASS 6 — the names are buttons now. The ticker sits directly under the picker to answer "is my
  // school here?", so a student who spots theirs was already being asked to look away and find it
  // again in a dropdown. Falls back to plain text when no onPick is supplied, so the marquee can
  // still be used decoratively elsewhere without pretending to be interactive.
  const names = SCHOOLS.map((s) => s.name);
  const Item = ({ s }: { s: School }) => onPick
    ? <button type="button" onClick={() => onPick(s)} className="sa-tick-item" style={{ font: "inherit", color: "inherit" }}>{s.name}</button>
    : <span>{s.name}</span>;

  const Row = ({ hidden = false }: { hidden?: boolean }) => (
    <span aria-hidden={hidden || undefined}>
      {SCHOOLS.map((s, n) => (
        <span key={s.id}>{n > 0 && <span style={{ opacity: 0.5 }}> · </span>}<Item s={s} /></span>
      ))}
      <span style={{ opacity: 0.5 }}> · + your school</span>
    </span>
  );

  if (reduce) {
    // Reduced motion: still a list, still clickable, just not moving.
    return (
      <p className={className} style={{ color: "var(--text-muted)", fontSize: size, textAlign: "center" }}>
        {onPick ? <Row /> : names.join(" · ") + " · + your school"}
      </p>
    );
  }
  return (
    <div className={`sa-marquee overflow-hidden ${className}`} style={{ WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)", maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)" }}>
      <div className="sa-marquee-track whitespace-nowrap" style={{ display: "inline-block", color: "var(--text-muted)", fontSize: size }}>
        <Row />
        <span style={{ opacity: 0.5 }}> · </span>
        {/* The duplicate exists only so the marquee can loop seamlessly. Its copies are
            aria-hidden and NOT focusable, or every school would be in the tab order twice. */}
        <Row hidden />
      </div>
    </div>
  );
}

// ---- BELOW THE FOLD, IN ORDER: proof -> how -> price ----------------------------------------


/** THE FAQ (Pass 5) — replaces the single objection block and its button.
 *
 *  Ordered biggest-objection-first and ending warm, which is why 'still feel lost' is last: the
 *  section closes on a person, not a policy. The CTA is gone on purpose — the answer to Q1 tells
 *  the student to use the player ABOVE, so a button here would send them past the thing it is
 *  pointing at. Lee's voice, two sentences max, and the list is built to grow. */
const FAQS: { q: string; a: string }[] = [
  {
    q: "Will this match my professor's exam?",
    a: "That's the whole point — pick your school and professor above, send what you've got, and I'll match my videos to your course.",
  },
  {
    q: "Do you do 1-on-1 tutoring?",
    a: "A little — most of my week goes to filming new cram videos, but I keep 10 hours open for Zoom sessions at $120/hr. Text me and we'll find a time.",
  },
  {
    q: "When do Exams 2, 3, and the Final come out?",
    a: "I film through the semester, ahead of each exam. Drop your email on any exam tab and I'll tell you the day it lands.",
  },
  {
    q: "Is this allowed?",
    a: "Yes — this is tutoring, same as any campus tutor or study guide. I teach you how to do the problems; exam day is still all you.",
  },
  {
    q: "What if you don't have my school?",
    a: "Intro accounting is nearly the same course everywhere, so these videos will still carry you — and I add schools as students ask. Hit \"Don't see your school?\" and tell me.",
  },
  {
    q: "What if I watch everything and still feel lost?",
    a: "Text me. I read every message myself — I'll do everything I can to get you from lost to confident.",
  },
];


// THE GREEK FAQ — the questions an exec, an advisor or a member actually has about the CHAPTER
// program. The student FAQ above answers "is this any good for me"; on a chapter page the open
// questions are about money, coverage and whether anyone will use it.
//
// Two student questions are deliberately absent here and kept on the student page: 1-on-1 tutoring
// availability and "what if I still feel lost?". Both are about Lee's personal time, which is not
// what a chapter is being asked to buy.
//
// EVERY CAPABILITY NAMED HERE EXISTS TODAY: the roster, the sharing kit and the joined/active/
// completed figures are the three the exec dashboard already renders. Nothing is promised that
// would have to be built before an exec could see it.
const GREEK_FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How does this work?",
    a: "Every member gets Exam 1 free. They choose their professor and start cramming. If your chapter wants full-semester access, chapter seats unlock Exams 2, 3 and the Final. Exec also gets a private roster, sharing tools, and a dashboard showing who is actually using it.",
  },
  {
    q: "Will this match our professors?",
    a: "That's the whole point. Members choose their school and professor, and I build the cram videos around what's actually being taught and tested. If I need something from your course, I'll ask for the syllabus, study guide, or exam topics.",
  },
  {
    q: "What does chapter access cost?",
    a: `$${SEAT_PRICE} per member, per semester, with a ${SEAT_MINIMUM}-seat minimum. Exam 1 stays free either way. Chapter seats unlock Exams 2, 3 and the Final.`,
  },
  {
    q: "Can we see whether members actually use it?",
    a: "Yes. Chapter access includes a private dashboard showing who joined, recent activity, and study progress — so you're not paying for a perk nobody uses.",
  },
];

function Faq({ greek }: { greek?: string }) {
  // One question open on load, the rest behind a toggle. Seven stacked cards was a wall of text
  // between the player and the testimonials, and the first question is the one nearly everybody
  // actually has. On a chapter page that first question is "How does this work?", which is the
  // whole program in one paragraph.
  const list = greek ? GREEK_FAQS : FAQS;
  const [open, setOpen] = useState(false);
  // Greek keeps one question up front; the student page shows two.
  const upFront = greek ? 1 : 2;
  const shown = list.slice(0, upFront);
  const rest = list.slice(upFront);
  return (
    <section className="py-10">
      <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
        {greek ? "CHAPTER QUESTIONS" : "FREQUENTLY ASKED QUESTIONS"}
      </p>
      <div className="mx-auto mt-5 max-w-[640px] space-y-4">
        {/* TWO questions up front, both CLOSED. The answer used to be expanded by default,
            which is a paragraph nobody asked for; and one question alone read as though there
            were only one. Greek pages still open their first answer — "How does this work?"
            IS the program, and an exec needs it without a click. */}
        {shown.map((f, i) => <FaqCard key={f.q} f={f} defaultOpen={!!greek && i === 0} />)}
        {open && rest.map((f) => <FaqCard key={f.q} f={f} />)}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-[14px] font-bold"
            style={{ minHeight: 44, color: "var(--accent)" }}
          >
            {open ? "× Show less" : `+ Show more (${rest.length})`}
          </button>
        </div>
      </div>
    </section>
  );
}

/** A REAL ACCORDION. This used to render the question and the answer together, always — so
 *  "+ Show more" opened six full answers at once, which is the wall of text the toggle existed
 *  to prevent. Collapsed by default now, with the first one open so the page never shows a row
 *  of closed questions and no answer at all.
 *
 *  The whole header is the control (a <button>, so Enter/Space, focus rings and screen-reader
 *  semantics come free), and aria-expanded/aria-controls tie it to the panel. */
function FaqCard({ f, defaultOpen = false }: { f: { q: string; a: string }; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = `faq-${f.q.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40)}`;
  return (
    <div className="rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        style={{ minHeight: 52 }}
      >
        <span className="text-[14.5px] font-black" style={{ color: "var(--brand-cream)" }}>{f.q}</span>
        <span aria-hidden className="shrink-0 transition-transform" style={{ color: "var(--accent)", transform: open ? "rotate(180deg)" : "none", fontSize: 12 }}>▾</span>
      </button>
      {open && (
        <p id={id} className="px-4 pb-3.5 text-[14px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.72 }}>{f.a}</p>
      )}
    </div>
  );
}


// ---- CAMPUS SELECTOR -------------------------------------------------------------------------
// `schools` overrides the static list (so a code-enriched list from the dropdown payload can be
// passed in). `pulse` bumps → a one-shot attention ring; with `openOnPulse` it also opens.
export function CampusSelector({ school, onPick, schools = SCHOOLS, pulse, openOnPulse, onNotListed, cue }: {
  school: School | null;
  onPick: (s: School) => void;
  schools?: School[];
  pulse?: number;
  openOnPulse?: boolean;
  onNotListed?: () => void;
  /** Bump to glow the picker once, ~2s. Distinct from `pulse`, which also OPENS the sheet. */
  cue?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [ring, setRing] = useState(false);
  // THE ARRIVAL CUE (Pass 7) — separate from `pulse`, which also OPENS the sheet. This one only
  // glows: after a CTA scroll the student is looking at a player they did not ask to be scrolled
  // to, and opening a modal on top of that would take the decision away rather than point at it.
  const [cued, setCued] = useState(false);
  const lastCue = useRef(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const firstPulse = useRef(true);
  const firstCue = useRef(true);
  const close = () => { setOpen(false); setQ(""); };

  useEffect(() => {
    if (pulse == null) return;
    // Swallow ONLY the genuine initial mount, which is the one where `pulse` is still 0.
    // "Change school" sets school=null, which flips `gated` and REMOUNTS this component with
    // pulse ALREADY bumped — so the old blanket skip meant the primary door into this picker
    // neither rang nor opened anything.
    if (firstPulse.current) { firstPulse.current = false; if (!pulse) return; }
    setRing(true);
    if (openOnPulse) setOpen(true);
    const t = window.setTimeout(() => setRing(false), 950);
    return () => window.clearTimeout(t);
  }, [pulse, openOnPulse]);

  useEffect(() => {
    if (cue == null) return;
    // Never on a plain page load — cue starts at 0 and only a CTA/anchor click bumps it.
    if (firstCue.current) { firstCue.current = false; return; }
    // Already chosen? Nothing to point at. A returning student mid-flow gets no glow.
    if (school) return;
    // Mashing the CTA should not restart the glow over and over.
    const now = performance.now();
    if (now - lastCue.current < 3000) return;
    lastCue.current = now;
    setCued(true);
    const t = window.setTimeout(() => setCued(false), 2000);
    return () => window.clearTimeout(t);
  }, [cue, school]);

  // SEARCH ACROSS NAMES AND ALIASES, ignoring grouping — typing "purd" finds Purdue, "Bama"
  // finds Alabama, "UIUC" finds Illinois. Aliases are matched, never rendered: a student who
  // typed a nickname still sees the school under the one name the rest of the app uses.
  // The course code is matched too, but only a code the student can actually SEE, or searching
  // "ACCY 201" would surface a school whose row shows no code.
  const needle = q.trim().toLowerCase();
  const matched = searchSchools(q, schools);
  const results = needle
    ? (matched.length ? matched
       : schools.filter((s) => !!s.codeVerified && !!s.code && s.code.toLowerCase().includes(needle)))
    : schools;

  // GROUPING. Ole Miss is pinned above the headers as the launch campus, and is NOT repeated
  // inside SEC — one row per school, so the count in the placeholder and the rows on screen
  // agree. Headers survive filtering, so a search result still says which group it came from.
  const PINNED = "ole-miss";
  const pinned = results.filter((s) => s.id === PINNED);
  const secGroup = results.filter((s) => s.id !== PINNED && s.isSec);
  const otherGroup = results.filter((s) => s.id !== PINNED && !s.isSec);

  return (
    <div className="relative">
      {/* setOpen(true), NOT a toggle: the scrim's pointerdown already closes, and a toggle
          re-opens the sheet when the compatibility click lands back on this button. */}
      <button
        ref={btnRef}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-transform hover:scale-[1.01]${cued ? " sa-cue" : ""}`}
        style={{ background: "var(--bg-surface)", border: `2px solid ${school ? "var(--bolt-primary)" : "var(--accent)"}`, boxShadow: "0 20px 55px -22px rgba(0,0,0,0.7)", animation: ring ? "sa-picker-pulse 0.9s ease" : undefined, borderRadius: 16 }}
      >
        <GraduationCap className="h-6 w-6 shrink-0" style={{ color: "var(--accent)" }} />
        <span className="min-w-0 flex-1 text-[17px] font-bold" style={{ color: "var(--brand-cream)" }}>{school ? school.name : "Pick your school to start"}</span>
        <ChevronDown className="h-5 w-5 shrink-0 opacity-70" />
      </button>

      {open && (
        <PickerSheet
          anchor={btnRef}
          onClose={close}
          label="Pick your school"
          // The count is `schools.length`, never a literal — the list can be overridden by
          // the caller, and a hardcoded 16 becomes a lie the moment it is.
          search={{ value: q, onChange: setQ, placeholder: `Search ${schools.length} schools…` }}
          footer={onNotListed ? (
            <button type="button" className="sa-row sa-row--plain" onClick={() => { onNotListed(); close(); }}>
              <span className="sa-row-name" style={{ color: "var(--accent)", fontSize: 15 }}>Don&apos;t see your school?</span>
            </button>
          ) : undefined}
        >
          {results.length === 0 && <p className="sa-picker-empty">No school by that name — try &ldquo;My school isn&rsquo;t listed&rdquo; below.</p>}
          {/* The code cell is ALWAYS rendered, empty string and all: it holds its grid track
              open so the row does not jump sideways when listCampusIntroCodes resolves. */}
          {pinned.map((s) => { const c = boltFor(s.id); return (
            <button key={s.id} type="button" className="sa-row" onClick={() => { onPick(s); close(); }}>
              <span className="sa-row-bolt" aria-hidden><Bolt c1={c.c1} c2={c.c2} /></span>
              <span className="sa-row-name">{s.name}</span>
              <span className="sa-row-code">{s.codeVerified && s.code ? s.code : ""}</span>
            </button>
          ); })}
          {secGroup.length > 0 && <p className="sa-picker-group">SEC</p>}
          {secGroup.map((s) => { const c = boltFor(s.id); return (
            <button key={s.id} type="button" className="sa-row" onClick={() => { onPick(s); close(); }}>
              <span className="sa-row-bolt" aria-hidden><Bolt c1={c.c1} c2={c.c2} /></span>
              <span className="sa-row-name">{s.name}</span>
              <span className="sa-row-code">{s.codeVerified && s.code ? s.code : ""}</span>
            </button>
          ); })}
          {otherGroup.length > 0 && <p className="sa-picker-group">Other schools</p>}
          {otherGroup.map((s) => { const c = boltFor(s.id); return (
            <button key={s.id} type="button" className="sa-row" onClick={() => { onPick(s); close(); }}>
              <span className="sa-row-bolt" aria-hidden><Bolt c1={c.c1} c2={c.c2} /></span>
              <span className="sa-row-name">{s.name}</span>
              <span className="sa-row-code">{s.codeVerified && s.code ? s.code : ""}</span>
            </button>
          ); })}
        </PickerSheet>
      )}
    </div>
  );
}

/** GET NOTIFIED (M2.3) — one field, email or phone, one button.
 *
 *  No account, no password, no second field: asking a student to pick a channel before they
 *  have committed to anything is friction for nothing. The topic they were looking at rides
 *  along, so the eventual "it's live" message can be specific rather than a blast. Writes
 *  through submitNotify into the same private table every other landing capture uses. */
function NotifyModal({ req, school, professorName, onClose }: { req: NotifyReq; school: School | null; professorName?: string | null; onClose: () => void }) {
  const topic = req.topic;
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = contactKind(contact) !== "unknown";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    try {
      await submitNotify({ data: { contact: contact.trim(), topic, campusId: school?.campusId ?? null, campusName: school?.name ?? null, professorName: professorName ?? null, want: req.want, examNum: req.examNum ?? null, courseCode: school?.codeVerified && school.code ? school.code : null, note: notifyNote(req) } });
      setDone(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "That didn't send — try again?"); }
    finally { setBusy(false); }
  };

  return createPortal(
    /* BOTTOM SHEET on phones (items-end), centred card from sm up — one component, one pattern. */
    <div className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4" style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "rgba(5,8,16,0.72)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-label={req.headline}
        className="w-full max-w-[380px] rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="py-4 text-center">
            <p className="text-[17px] font-black" style={{ color: "var(--brand-cream)" }}>You&apos;re on the list. ⚡</p>
            <button onClick={onClose} className="mt-4 w-full rounded-xl text-[13.5px] font-black" style={{ minHeight: 46, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Close</button>
          </div>
        ) : (
          <>
            <p className="text-[16px] font-black leading-snug" style={{ color: "var(--brand-cream)" }}>{req.headline}</p>
            <p className="mt-1 text-[14px]" style={{ color: "var(--text-muted)" }}>{req.sub}</p>
            {/* the context line — so the student can see exactly what this signup is for */}
            {(req.examLabel || school) && (
              <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--text-muted)", opacity: 0.8 }}>
                {[school?.name, school?.codeVerified && school.code ? school.code : null, professorName ? `Prof. ${professorName}` : null, req.examLabel].filter(Boolean).join(" · ")}
              </p>
            )}
            <input
              autoFocus
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              placeholder="Email or phone"
              className="mt-3 w-full rounded-xl px-3 text-[15px] outline-none"
              style={{ minHeight: 46, background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
            />
            {/* A2P: the field accepts a phone, so the consent essentials sit right under it; the
                full disclosure is one tap away under "Message terms". */}
            <SmsConsentNote compact />
            {err && <p className="mt-2 text-[14px]" style={{ color: "#FF8B9E" }}>{err}</p>}
            <button
              onClick={() => void send()}
              disabled={!valid || busy}
              className="mt-3 w-full rounded-xl text-[14px] font-black disabled:opacity-45"
              style={{ minHeight: 46, background: "var(--accent)", color: "#0B1220" }}
            >
              {busy ? "Sending…" : "Get notified"}
            </button>
            <button onClick={onClose} className="mt-2 w-full text-[14px]" style={{ minHeight: 44, color: "var(--text-muted)" }}>No thanks</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---- SYLLABUS MODAL — drag/drop file(s) + email → Supabase (bucket + table). Two inputs, no
// redirect. All "Send your syllabus" CTAs open this. Files post as base64 to the submitSyllabus fn.
type PendingFile = { name: string; type: string; dataUrl: string; size: number };
const ACCEPT = ".pdf,.doc,.docx,image/*";
function SyllabusModal({ school, framing, onClose }: { school: School | null; framing?: string | null; onClose: () => void }) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [email, setEmail] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const readFile = (f: File) => new Promise<PendingFile>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, type: f.type, dataUrl: String(r.result), size: f.size });
    r.onerror = () => rej(new Error("Couldn't read that file."));
    r.readAsDataURL(f);
  });
  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setErr(null);
    try {
      const read = await Promise.all([...list].slice(0, 5).map(readFile));
      setFiles((cur) => [...cur, ...read].slice(0, 5));
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read that file."); }
  };
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSend = emailOk && files.length > 0 && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true); setErr(null);
    try {
      await submitSyllabus({ data: { email: email.trim(), campusId: school?.campusId ?? null, campusName: school?.name ?? null, files: files.map((f) => ({ name: f.name, type: f.type, dataUrl: f.dataUrl })) } });
      setDone(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong — try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[210] grid place-items-center p-4" style={{ background: "rgba(6,10,20,0.72)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)", fontFamily: BRAND_SANS }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-[18px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Send everything you've got.</h3>
          <button onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)" }} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full text-[24px]" style={{ background: "rgba(0,107,166,0.25)" }}>⚡</div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--brand-cream)" }}>Got it. You'll hear from me soon — Lee.</p>
            <button onClick={onClose} className="mt-5 rounded-xl px-5 py-2.5 text-[13.5px] font-black" style={{ background: "var(--accent)", color: "#0B1220" }}>Done</button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[14px] leading-relaxed" style={{ color: framing ? "var(--brand-cream)" : "var(--text-muted)" }}>{framing ?? "Syllabus, study guides, old homework, notes — the more you send, the tighter I can match your exam. I review every submission myself."}</p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-xl px-4 py-6 text-center transition-colors"
              style={{ border: `2px dashed ${drag ? "var(--accent)" : "var(--border-default)"}`, background: drag ? "rgba(252,163,17,0.08)" : "var(--bg-input)" }}
            >
              <p className="text-[14px] font-semibold" style={{ color: "var(--brand-cream)" }}>Add files from your class</p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Syllabus or study guide · PDF, Word, or a photo</p>
              <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => void addFiles(e.target.files)} />
            </div>

            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[14px]" style={{ background: "var(--bg-surface)", color: "var(--brand-cream)" }}>
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-[11px]" style={{ color: "var(--text-muted)" }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                    <button onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-white/10" aria-label={`Remove ${f.name}`}><X className="h-3 w-3" /></button>
                  </li>
                ))}
              </ul>
            )}

            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com"
              className="mt-3 w-full rounded-xl px-4 py-3 text-[14px] outline-none"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
            />

            {err && <p className="mt-2 text-[14px]" style={{ color: "#F3C6CC" }}>{err}</p>}

            <button onClick={send} disabled={!canSend} className="mt-4 w-full rounded-xl py-3 text-[15px] font-black transition-opacity disabled:opacity-40" style={{ background: "var(--accent)", color: "#0B1220" }}>
              {busy ? "Sending…" : "Send it"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---- THEATER: full takeover on first pick, short recolor beat after -----------------------------
function Theater({ school, mode, onDone }: { school: School; mode: "full" | "short"; onDone: () => void }) {
  const c = boltFor(school.id);
  const full = mode === "full";
  const dur = full ? 1150 : 500;
  useEffect(() => {
    const t = window.setTimeout(onDone, dur);
    const cut = () => onDone();
    window.addEventListener("scroll", cut, { once: true });
    return () => { window.clearTimeout(t); window.removeEventListener("scroll", cut); };
  }, [onDone, dur]);
  const loading = school.codeVerified && school.code ? `Loading ${school.code}…` : "Loading…";
  return (
    <div className="absolute inset-0 z-40 grid place-items-center" style={{ background: full ? "var(--brand-navy)" : "rgba(17,26,50,0.82)", animation: `sa-land-fade ${dur}ms ease forwards` }} onClick={onDone}>
      <style>{`@keyframes sa-land-fade{0%{opacity:0}18%{opacity:1}72%{opacity:1}100%{opacity:0}}`}</style>
      <div className="flex flex-col items-center gap-3">
        <BoltBoil height={full ? 190 : 130} red={c.c1} blue={c.c2} />
        {full && (
          <>
            <div className="text-[17px] font-semibold tracking-wide" style={{ color: "var(--brand-cream)", opacity: 0.95 }}>{loading}</div>
            <div className="text-[13px]" style={{ color: "var(--brand-cream)", opacity: 0.5, letterSpacing: "0.05em" }}>surviveaccounting.com</div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- EXAM PLAYER — ONE player, FOUR exam tabs (Exam 1 free · 2/3/Final paid). The left outline
// lists each tab's topics → sets; the stage plays the selected free set or shows a poster. The ONLY
// school picker lives in this player's blurred gate. Replaces the old Exam-1 hero + paid row/popup.
type ExamTab = { num: number; label: string; price: number | null; topics: ResolvedTopic[]; coveragePct: number | null };
type Sel = { topicKey: string; setId: string | null };
const fmtRuntime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

// Student outline shows CURATED TOPICS ONLY, in teaching-flow order — never the textbook unit/chapter
// names (those are internal crosswalk metadata, not rendered anywhere student-facing). Capability,
// default OFF: on a MAPPED course a topic may show a muted "(Ch. N)" from the campus crosswalk. Flip
// this one flag to enable it. (Ships disabled; meaningful crosswalk numbers need the campus override.)
const SHOW_CHAPTER_NUM = false;

// Stats line under each exam tab, computed from data (never hardcoded): topics mapped to the exam ·
// CEQ questions summed across its LIVE sets · summed video runtime (omitted while zero — no durations
// wired yet). Updates automatically as sets go live.
const examStats = (tab: ExamTab): string => {
  const topics = tab.topics.length;
  const sets = tab.topics.reduce((a, t) => a + t.sets.length, 0);
  const questions = tab.topics.reduce((a, t) => a + t.sets.reduce((b, s) => b + s.ceqCount, 0), 0);
  const secs = tab.topics.reduce((a, t) => a + t.sets.reduce((b, s) => b + (s.runtimeSec ?? 0), 0), 0);
  const hrs = secs / 3600;
  // COMPUTED, never hardcoded: "7 topics · 19 sets · 206 questions"; video hours appear only once true.
  const parts = [`${topics} topic${topics === 1 ? "" : "s"}`];
  void sets; // sets are an internal unit — students see topics and questions
  if (questions > 0) parts.push(`${questions} question${questions === 1 ? "" : "s"}`);
  if (hrs >= 0.1) parts.push(`~${hrs.toFixed(1)}h video`);
  return parts.join(" · ");
};

// ---- MATCHING — the school/professor flow, moved OUT of the way ------------------------------
//
// This replaces the blurred gate. The gate asked "which school?" before showing anything, which
// made the student's own identity the price of admission to a free video. Matching is a
// REFINEMENT now: the player plays on the Starter Map immediately, and this chip offers to tune
// it. Everything here is skippable, and skipping costs the student nothing but tailoring.

// `type MatchStep` lived here to drive MatchSheet's step machine. MatchSheet is gone and the rungs
// is a plain boolean on MatchPanel now (profDone), so the type went with it.

/** THE PREVIEW SURFACE — the right panel's media stage, with the entry overlay floating on it.
 *
 *  Layered deliberately for the future: MEDIA (a branded placeholder today — swap the first
 *  child for a `<video muted autoPlay loop playsInline>` when the silent preview loop exists) →
 *  SCRIM (keeps the overlay readable over any future footage) → CONTENT (the entry card +
 *  marquee). Nothing above the media layer needs to change when real preview video lands. */
function PreviewSurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid w-full flex-1 place-items-center self-stretch overflow-hidden px-5 py-8" style={{ background: "var(--sa-surface-2)", minHeight: "var(--sa-panel-min)" }}>
      {/* MEDIA LAYER (placeholder): a deep navy field with the brand bolt as a faint watermark —
          reads as a player at rest, not an empty box. */}
      <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(155deg, #101A31 0%, #0B1220 55%, #0D1526 100%)" }}>
        <div className="absolute" style={{ right: "-6%", top: "-12%", width: "58%", opacity: 0.07, transform: "rotate(8deg)" }}>
          <Bolt c1="var(--sa-bolt-1)" c2="var(--sa-bolt-2)" />
        </div>
      </div>
      {/* SCRIM — between media and controls, so overlay text stays readable on future video. */}
      <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(5,8,16,0.25) 0%, rgba(5,8,16,0.55) 100%)" }} />
      <div className="relative z-[1] flex w-full max-w-sm flex-col items-center gap-4">{children}</div>
    </div>
  );
}

/** THE MATCH PANEL — Pass 4 moves the professor step onto CENTRE STAGE.
 *
 *  Every action now happens where the video will play, as sequential states, instead of hanging
 *  off a bar at the top. The panel is the stage: pick a school on it, pick a professor on it,
 *  then it becomes the content. The top bar is left holding only what is already TRUE.
 *
 *  `onReset` clears school AND professor together. A half-reset — new school, professor left
 *  over from the old one — would silently attach a student to another campus's faculty. */
function MatchPanel({ gateActive, school, professor, notListed, profDone, coveragePct, schools, cueSignal, onPick, onNotListed, onSkipSchool, onPickProfessor, onProfNotListed, onAddProfessor, onMaterials, onReset, onChangeSchool }: {
  /** True while the Greek gate is showing — the whole panel stands down. */
  gateActive?: boolean;
  school: School | null;
  professor: ProfessorLite | null;
  notListed: boolean;
  /** true once the professor rung is answered — picked OR declared unlisted. */
  profDone: boolean;
  /** true once the materials gate has been answered either way. */
  /** Real resolver number for the active exam, or null. Never invented. */
  coveragePct: number | null;
  /** Bumped by the hero CTA so the picker can glow on arrival. */
  cueSignal?: number;
  schools: School[];
  onPick: (s: School) => void;
  onNotListed: () => void;
  /** The school question is OPTIONAL: skipping serves the Starter Map's Exam 1 with generic copy. */
  onSkipSchool: () => void;
  onPickProfessor: (p: ProfessorLite) => void;
  onProfNotListed: () => void;
  /** Reopens the professor rung from the confirmed bar — for a student who skipped it. */
  onAddProfessor: () => void;
  onMaterials: () => void;
  onReset: () => void;
  /** Route-locked pages only: the explicit way to a different school (navigates home). */
  onChangeSchool?: () => void;
}) {
  const matched = !!school || notListed;
  const code = school?.codeVerified && school.code ? school.code : null;

  // STATE 1 — no school yet: the ENTRY OVERLAY on the preview surface. The overlay card floats
  // over the (placeholder) preview media; the marquee sits beneath it, ambient.
  if (!matched) {
    return (
      <PreviewSurface>
        <div className="sa-entry-card w-full max-w-sm">
          {/* ONE INSTRUCTION, ONCE (Pass 6 §4, restored). The heading that used to sit here said
              the same sentence as the dropdown's own label directly beneath it. */}
          <CampusSelector school={null} onPick={onPick} schools={schools} onNotListed={onNotListed} cue={cueSignal} />
          {/* The school is OPTIONAL. A muted way past the question: the Starter Map serves Exam 1
              with generic copy, and the picker stays one tap away in the confirmed bar. */}
          <button type="button" onClick={onSkipSchool} className="mt-1 w-full text-[14px] font-bold" style={{ minHeight: 44, color: "var(--text-muted)" }}>
            Skip for now →
          </button>
        </div>
        {/* The marquee lives HERE and nowhere else — under the picker it answers "is my school
            here?" at the moment the question is asked. Ambient by design (96s loop). */}
        <SchoolTicker onPick={onPick} />
      </PreviewSurface>
    );
  }

  // STATE 2 — school known, professor rung unanswered: same surface, professor overlay.
  // GREEK: the professor question waits until the video is unlocked. Before that the visitor
  // has not agreed to anything, and asking which professor they have — a question only a
  // student mid-decision cares about — sits in front of the thing they came for.
  if (gateActive) return null;

  if (!profDone) {
    return (
      <PreviewSurface>
        <div className="sa-entry-card w-full max-w-sm">
          <ProfessorStage
            school={school}
            onPick={onPickProfessor}
            onNotListed={onProfNotListed}
          />
        </div>
        {/* The course is PRESET by the page — stated quietly so nobody looks for a course
            selector that deliberately isn't there. */}
        {code && school && (
          <p className="text-center text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Course preset: {code} at {school.name}
            {onChangeSchool && <> · <button type="button" onClick={onChangeSchool} className="underline underline-offset-2" style={{ color: "var(--text-muted)", minHeight: 28 }}>Not your school?</button></>}
          </p>
        )}
      </PreviewSurface>
    );
  }

  // THE MATERIALS GATE IS GONE FROM THE PAGE FLOW (it was STATE 3).
  //
  // It occupied the entire player panel and stood between a student who had just named their
  // professor and the videos they came for — to ask them to go find a syllabus. The coverage
  // number is genuinely useful and the materials ask is genuinely worth making, but neither is
  // worth blocking the product on. Both live in the confirmed bar below now: the coverage reads
  // as a chip, and pressing it opens the existing syllabus modal.

  // STATE 4 — confirmed. The context (school · course · professor · coverage · reset) now lives
  // at the TOP OF THE SIDEBAR (SidebarContext), so the question panel carries nothing but the
  // question. This bar is gone.
  return null;
}

/** The professor rung, rendered inline on the stage rather than in a sheet.
 *
 *  Pass 4 removed "Skip this" on instruction: "Don't see your professor?" is the only alternate
 *  path, and it still reaches the same next step, so nobody is trapped. "Change school" is
 *  deliberately demoted to small muted text under the list — it is a correction, not a choice. */
/** A WRITE-IN professor — a campus with no faculty rows yet, or a student whose professor isn't in
 *  the list. It personalizes labels and capture (Notify/exam-ask read professor.name) exactly like a
 *  picked one, but its id is deliberately NON-uuid ("") so it can never be mistaken for a real
 *  faculty row and never owns a map — see profMapId in the route. */
const writeInProfessor = (name: string): ProfessorLite => ({ id: "", name, first: "", last: name });

/** PROFESSOR PICKER — the shared SearchPicker, with a free-text WRITE-IN fallback.
 *
 *  The hand-rolled combobox this replaces had two defects that only show up in place: its popup was
 *  an absolute child inside the player card (`overflow-hidden rounded-2xl`), so the list was
 *  CLIPPED at the card's edge; and clicking elsewhere left it open, which reads as broken. Both are
 *  gone by using the shared component, which portals its popup and shares the dismissal hook.
 *
 *  WRITE-IN: many campuses have no faculty listed yet, so the picker would open onto "0 professors /
 *  No matches" — a dead end. When the roster is empty we show a free-text field instead of the empty
 *  picker; when the roster has names but not theirs, "Don't see your professor?" reveals the same
 *  field. Either way the typed name is captured as a write-in professor. A muted skip stays available
 *  so nobody is trapped by a field they can't (or won't) fill. */
function ProfessorStage({ school, onPick, onNotListed }: {
  school: School | null;
  onPick: (p: ProfessorLite) => void;
  onNotListed: () => void;
}) {
  const campusId = school?.campusId ?? null;
  const profQ = useQuery({
    queryKey: ["landing-profs", campusId],
    queryFn: () => searchOrderProfessors({ data: { campusId: campusId! } }),
    enabled: !!campusId, networkMode: "always", staleTime: 300_000,
  });
  const roster = useMemo(() => profQ.data ?? [], [profQ.data]);
  const sorted = useMemo(
    () => roster.slice().sort((a, b) => (a.last || a.name).localeCompare(b.last || b.name) || (a.first || "").localeCompare(b.first || "")),
    [roster],
  );

  // The roster is empty once loading finishes with no names — that campus has no faculty yet, so
  // the list would be a dead end and we go straight to write-in.
  const rosterEmpty = !profQ.isLoading && sorted.length === 0;
  const [manual, setManual] = useState(false);
  const [name, setName] = useState("");
  // A new campus starts fresh: never carry one school's typed name or write-in mode to the next.
  useEffect(() => { setManual(false); setName(""); }, [campusId]);
  const writeIn = rosterEmpty || manual;
  const submit = () => { const n = name.trim(); if (n) onPick(writeInProfessor(n)); };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-stretch gap-2.5">
      <p className="text-center text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Pick your professor to start</p>
      {writeIn ? (
        <>
          {rosterEmpty && (
            <p className="text-center text-[14px]" style={{ color: "var(--text-muted)" }}>
              No professors listed for {school?.name ?? "your school"} yet — type yours in.
            </p>
          )}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="Type your professor's name"
            autoCorrect="off" autoCapitalize="words" spellCheck={false}
            aria-label="Type your professor's name"
            className="w-full rounded-xl px-3.5 outline-none focus-visible:ring-2"
            // 16px keeps iOS from zooming the page on focus (matches SearchPicker's input).
            style={{ fontSize: 16, minHeight: 52, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className="w-full rounded-xl text-[14.5px] font-black transition-opacity disabled:opacity-45"
            style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220" }}
          >
            Use this professor
          </button>
          {!rosterEmpty && (
            <button type="button" onClick={() => setManual(false)} className="text-[14px] font-bold" style={{ minHeight: 44, color: "var(--text-muted)" }}>
              ← Back to the list
            </button>
          )}
          <button type="button" onClick={onNotListed} className="text-[14px] font-bold" style={{ minHeight: 44, color: "var(--text-muted)" }}>
            Skip for now →
          </button>
        </>
      ) : (
        <>
          <SearchPicker
            items={sorted.map((x) => ({ value: x.id, label: profDisplay(x) }))}
            value={null}
            placeholder={profQ.isLoading ? "Loading professors…" : "Search your professor…"}
            searchPlaceholder={`Search ${sorted.length} professors…`}
            disabled={profQ.isLoading}
            onPick={(id) => { const x = sorted.find((r) => r.id === id); if (x) onPick(x); }}
            ariaLabel={`Search ${school?.name ?? "your school"} professors`}
          />
          <button type="button" onClick={() => setManual(true)} className="text-[14px] font-bold" style={{ minHeight: 44, color: "var(--accent)" }}>
            Don&apos;t see your professor?
          </button>
          {/* Professor selection is OPTIONAL — the explicit low-friction way past the question,
              in the list state too (the write-in state already had one). */}
          <button type="button" onClick={onNotListed} className="text-[14px] font-bold" style={{ minHeight: 44, color: "var(--text-muted)" }}>
            Skip for now →
          </button>
        </>
      )}
    </div>
  );
}
// MatchSheet DELETED in Pass 5. It portalled to document.body, so the materials step rendered as
// a detached panel at the top-left of the viewport instead of inside the player — and opening it
// on a professor pick is what made school/professor selection feel broken. Every step of the flow
// now lives in MatchPanel, inside the right panel, where the student is already looking.


function ExamPlayer({ videoGate, greekOrg, exams, school, onPick, focusSignal, schools, onSyllabus, professor, onPickProfessor, notListed, onNotListed, onSkipSchool, schoolSkipped, initialProfSkipped, onReset, resetSeq, resetLabel, onChangeSchool, theater, onTheaterDone, onNotify }: { resetSeq: number; resetLabel: string; onChangeSchool?: () => void; videoGate?: React.ReactNode; greekOrg?: string; exams: ExamTab[]; school: School | null; onPick: (s: School) => void; focusSignal: number; schools: School[]; onSyllabus: (framing?: string) => void; professor: ProfessorLite | null; onPickProfessor: (p: ProfessorLite | null) => void; notListed: boolean; onNotListed: () => void; onSkipSchool: () => void; /** No school named (skipped / not listed): the professor rung is moot and the player goes straight to content. */ schoolSkipped: boolean; /** The cookie says this visitor already skipped the professor question for this school. */ initialProfSkipped: boolean; onReset: () => void; theater: { school: School; mode: "full" | "short" } | null; onTheaterDone: () => void; onNotify: (r: NotifyReq) => void }) {
  const [activeNum, setActiveNum] = useState(1);
  const [selById, setSelById] = useState<Record<number, Sel>>({});
  const [openTopics, setOpenTopics] = useState<Set<string>>(() => new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The match sheet. It is the ONLY place school/professor are chosen now — there is no gate.
  // The materials gate is a STATE of the panel now, not a modal. It shows once the professor
  // rung is answered and clears when the student acts on it either way.
  // The professor rung is "answered" once a professor is picked OR declared unlisted. Without
  // this the stage would sit on the professor step forever for anyone who has no listed prof.
  // Seeded from the cookie (server-known) so a returning skipper is not asked again — and not
  // shown the question for a frame before an effect hides it.
  const [profDone, setProfDone] = useState(() => initialProfSkipped || schoolSkipped);
  useEffect(() => { if (professor) setProfDone(true); }, [professor]);
  useEffect(() => { if (schoolSkipped) setProfDone(true); }, [schoolSkipped]);
  // A CHANGE of school re-asks; the mount does not (the initial value above already answered it).
  const prevSchoolId = useRef(school?.id);
  useEffect(() => { if (prevSchoolId.current !== school?.id) { prevSchoolId.current = school?.id; setProfDone(false); } }, [school?.id]);
  // RESET SIGNAL from the page. Drops the session — exam tab, topic/set selection, open topics,
  // drawer — and re-asks the (skippable) professor question. On a route-locked page the school
  // is untouched, so the school-change effect above never fires; this one does that work.
  const prevReset = useRef(resetSeq);
  useEffect(() => {
    if (prevReset.current === resetSeq) return;
    prevReset.current = resetSeq;
    setActiveNum(1); setSelById({}); setOpenTopics(new Set()); setDrawerOpen(false);
    setProfDone(schoolSkipped);
  }, [resetSeq, schoolSkipped]);
  // "Skip for now" on the professor rung is REMEMBERED per school — asking a returning student the
  // same optional question on every visit was the most-repeated step in the whole flow.
  const skipProfessor = () => { setProfDone(true); rememberProfSkip(school?.id ?? null); };
  const chipRef = useRef<HTMLButtonElement>(null);
  // WARM THE ROSTER on the SAME query key the match sheet reads, the moment a school exists.
  // Without this the sheet step 2 opens empty and fills a second later - the prefetch used to
  // live in CourseMasthead, which this redesign deleted.
  useQuery({ queryKey: ["landing-profs", school?.campusId ?? null], queryFn: () => searchOrderProfessors({ data: { campusId: school!.campusId } }), enabled: !!school, networkMode: "always", staleTime: 300_000 });
  const active = exams.find((e) => e.num === activeNum) ?? exams[0];
  const isPaid = active.price != null;

  // TWO-SET EMAIL ASK — a set counts as completed at >=90% watched. After the 2nd distinct set, show
  // one quiet inline card (persist dismissal). The ONLY proactive email ask in the free flow.
  const [completedSets, setCompletedSets] = useState<Set<string>>(() => new Set());
  const [askDone, setAskDone] = useState(() => { try { return localStorage.getItem("sa-two-set-ask") === "done"; } catch { return false; } });
  const markComplete = (id: string) => setCompletedSets((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  const finishAsk = () => { setAskDone(true); try { localStorage.setItem("sa-two-set-ask", "done"); } catch { /* ignore */ } };
  // No longer conditioned on a school: a student who watched two sets earned the ask whether or
  // not they ever told us where they study.
  // ONE video earns the ask. Two was a threshold most visitors never reached, so the only
  // capture on the free flow almost never fired — and the moment someone finishes their first
  // video is exactly when 'save your progress' is a favour rather than a toll.
  //
  // NEVER on a Greek chapter page: that flow already took an account at the door, and asking a
  // signed-in member for their email again reads as a form that forgot it already met them.
  const showAsk = !greekOrg && completedSets.size >= 1 && !askDone;

  // Default selection for a tab: first topic with a LIVE set → first topic with any set → first
  // topic (poster) → null.
  const firstLiveSel = (tab: ExamTab): Sel | null => {
    for (const t of tab.topics) { const live = t.sets.find((s) => isPlayable(s)); if (live) return { topicKey: t.key, setId: live.id }; }
    return null;
  };
  // Fresh default (NOT persisted): first live set → first topic with any set → first topic (poster).
  // Recomputed each render so it always tracks the current topic order (the campus map loads async).
  const defaultSel = (tab: ExamTab): Sel | null => {
    const live = firstLiveSel(tab); if (live) return live;
    for (const t of tab.topics) if (t.sets[0]) return { topicKey: t.key, setId: t.sets[0].id };
    return tab.topics[0] ? { topicKey: tab.topics[0].key, setId: null } : null;
  };
  const cur: Sel | null = selById[active.num] ?? defaultSel(active);
  const curTopic = cur ? active.topics.find((t) => t.key === cur.topicKey) ?? null : null;
  const curSet = cur?.setId ? curTopic?.sets.find((s) => s.id === cur.setId) ?? null : null;

  // On the hero CTA (focusSignal) or a school pick: jump to Exam 1 and, ONLY if a live set exists,
  // persist it (autoplay) + open its topic. Never persist a poster default — that would freeze a
  // stale first topic before the campus map reorders; the fresh defaultSel handles display instead.
  //
  // The `if (!school) return;` guard is GONE. It was the last thing making the CTA useless to a
  // student who had not identified themselves: the whole point of the redesign is that one tap
  // lands on a playing topic, and the Starter Map resolves Exam 1 perfectly well with no campus.
  useEffect(() => {
    setActiveNum(1);
    const live = firstLiveSel(exams[0]);
    if (live) { setSelById((p) => ({ ...p, 1: live })); setOpenTopics((p) => new Set(p).add(live.topicKey)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id, focusSignal]);
  // FIRST TOPIC OPEN — the navigation teaches itself: whenever the active tab's topic list
  // (re)arrives, expand the current selection's topic (default = the first). Keyed on the first
  // topic's key so the async map load (static keys → chapter ids) re-opens with the REAL key.
  const firstTopicKey = active.topics[0]?.key ?? null;
  useEffect(() => {
    const k = cur?.topicKey ?? firstTopicKey;
    if (k) setOpenTopics((p) => (p.has(k) ? p : new Set(p).add(k)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.num, firstTopicKey]);

  // Every rung answered. In states 1-3 MatchPanel IS the panel; only here does it shrink to the
  // confirmed bar and hand the space to the video.
  // NO LONGER WAITS ON THE MATERIALS ANSWER. That step blocked the player to ask for a syllabus;
  // it is a chip and a modal now, so the videos unlock the moment the student has named their
  // school and professor — which is everything the player actually needs to pick a map.
  const flowDone = (!!school || notListed) && profDone;

  // Picking a topic while the professor overlay is up IS "skip for now" — the student has told
  // us what they want to watch, and a question about their professor should not stand in front
  // of it. The confirmed bar keeps an "+ Add professor" door for later.
  const pickSet = (topicKey: string, setId: string | null) => { setSelById((p) => ({ ...p, [active.num]: { topicKey, setId } })); setDrawerOpen(false); setProfDone(true); };
  const toggleTopic = (k: string) => setOpenTopics((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <section id="exam1" className="mt-8 scroll-mt-6 sm:mt-14">
      <div className="relative overflow-hidden rounded-2xl" style={{ background: "var(--sa-surface-1)", border: "1px solid rgba(252,163,17,0.45)" }}>
        <ExamTabs greek={!!greekOrg} exams={exams} activeNum={activeNum} onSelect={(n) => { setActiveNum(n); setDrawerOpen(false); }} />
        {/* HIDDEN ON CHAPTER PAGES. The Semester Pass is an INDIVIDUAL product ($150 for one
            student); beside a $100/member chapter offer it reads as a third, contradictory
            price for the same thing. It is untouched on the student page, where it is the only
            offer on screen. */}
        {!greekOrg && <SemesterPassLine onPass={() => onNotify(passRequest({ price: SEMESTER_PASS_PRICE, launchWindow: LAUNCH_WINDOW }))} />}


        {/* TOPIC ROW — the mobile topic switcher. No longer gated on a school: the outline it
            opens is populated by the Starter Map from the very first paint, so hiding the
            switcher until a school existed only hid working navigation. */}
        <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 sm:hidden" style={{ background: "rgba(0,0,0,0.2)" }}>
          <span className="text-[14px]" style={{ color: "var(--text-muted)" }}>Topic</span>
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            aria-expanded={drawerOpen}
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2.5 text-[14px] font-bold"
            style={{ minHeight: 44, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
          >
            <span className="min-w-0 truncate">{curTopic?.name ?? active.label}</span>
            <span className="shrink-0" style={{ color: "var(--accent)" }}>{drawerOpen ? "▴" : "▾"}</span>
          </button>
        </div>

        <div className="sa-player-min sm:flex">
          <div className={`${drawerOpen ? "block" : "hidden"} border-b sm:block sm:w-[42%] sm:max-w-[360px] sm:border-b-0 sm:border-r`} style={{ borderColor: "var(--border-default)", background: "var(--bg-player-sidebar)" }}>
            <ExamOutline tab={active} school={school} professor={professor} flowDone={flowDone} coveragePct={active.coveragePct} onAddProfessor={() => setProfDone(false)} onMaterials={() => onSyllabus()} onReset={onReset} resetLabel={resetLabel} stats={examStats(active)} isPaid={isPaid} curSetId={curSet?.id ?? null} curTopicKey={cur?.topicKey ?? null} openTopics={openTopics} onToggleTopic={toggleTopic} onPickSet={pickSet} onNotify={onNotify} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col" style={{ background: "var(--sa-surface-2)" }}>
            {/* RIGHT PANEL. Until a school exists the panel IS the picker; after that it carries
                the confirmed line above the content. The left outline stays populated the whole
                time, so this asks a question without hiding the catalogue behind it. */}
            {/* ONE STATE AT A TIME. `flowDone` is the whole ladder, not its first rung — see the
                note above sa-panel-min in styles.css for the height half of this. */}
            <div className="sa-panel-min relative w-full flex-1">
              <MatchPanel gateActive={!!videoGate} school={school} professor={professor} notListed={notListed} profDone={profDone} coveragePct={active.coveragePct} schools={schools} cueSignal={focusSignal} onPick={onPick} onNotListed={onNotListed} onSkipSchool={onSkipSchool} onPickProfessor={(pr) => { onPickProfessor(pr); setProfDone(true); }} onProfNotListed={skipProfessor} onAddProfessor={() => { setProfDone(false); rememberProfSkip(null); }} onMaterials={() => onSyllabus()} onReset={onReset} onChangeSchool={onChangeSchool} />
              {/* THE GATE STANDS IN FOR THE VIDEO, not for the page: tabs, topics and the
                  whole menu stay readable, because a visitor deciding whether to hand over an
                  email needs to see what they are unlocking. */}
              {videoGate ? (
                <div className="relative w-full" style={{ aspectRatio: "16 / 9", background: "var(--sa-surface-2)" }}>{videoGate}</div>
              ) : flowDone && (
                curSet && isPlayable(curSet) && curTopic ? (
                  // A playable set walks its stages: Cram Blast → Practice → Review (shared
                  // set-flow model — same walk as /learn, homepage-sized shell around it).
                  <SetFlowPanel key={`${curSet.id}:${resetSeq}`} topic={curTopic} set={curSet} exam={active} school={school} surface={greekOrg ? "greek" : school ? "campus" : "home"} onCramComplete={() => markComplete(curSet!.id)} onPickSet={(sid) => pickSet(curTopic!.key, sid)} onNotify={onNotify} />
                ) : (
                  // NOT A FIXED 16:9 BOX. The unpublished state carries a line of copy and the
                  // notify field, which a phone-width 16:9 panel (~190px tall) cannot hold.
                  <div className="sa-reveal relative w-full" style={{ minHeight: "min(56.25vw, 300px)" }}>
                    <Poster school={school} exam={active} topicName={curTopic?.name ?? active.label} stem={curSet?.firstStem ?? null} onNotify={() => onNotify(examRequest({ examNum: active.num, examLabel: active.label, topicName: curTopic?.name ?? null, setName: curSet?.name ?? null, launchWindow: LAUNCH_WINDOW, free: active.price == null }))} />
                  </div>
                )
              )}
            </div>

            {/* Two sets down — the ONLY proactive email ask in the free flow (quiet inline card). */}
            {showAsk && <TwoSetAsk school={school} professor={professor} onDone={finishAsk} />}

            {/* The "Let's tailor this / Send your syllabus" pair that used to live here is gone.
                It asked for work before the student had a reason to do any, and it appeared in
                THREE places at once (here, the masthead, and the unlisted block). The syllabus
                ask is now the last, optional rung of the match sheet - reached only by someone
                who has already said where they study. */}
          </div>
        </div>

        {/* school-select takeover - SCOPED to the player frame (absolute, clipped by the card) */}
        {theater && <Theater school={theater.school} mode={theater.mode} onDone={onTheaterDone} />}
      </div>
    </section>
  );
}

// Exam 1 (the current exam) takes ~1/3 of the bar with type one step up; the paid tabs share the
// rest. Same component, same underline — the asymmetry reads as emphasis, not a different control.
/** SEMESTER PASS — the bundle. Presented at the foot of the exam list rather than as a
 *  fifth exam, because it is a different KIND of thing: Final is a product ($50, like
 *  Exams 2 and 3); the Pass is all of them together. Renaming Final to a bundle name
 *  would have deleted a product from the lineup and made the bundle ambiguous. */
const SEMESTER_PASS_PRICE = 150;

/** What one paid exam costs. Hoisted out of the exams array so the pricing block below the fold
 *  and the exam list inside the player read the SAME number and cannot drift. */
export const PAID_EXAM_PRICE = 50;

// EXAM1_STATUS_LABEL ("Filming this week!") was deleted in Pass 6, not moved. It belongs inside
// the video player, next to the thing being filmed; the brief says explicitly not to relocate it
// yet. Leaving the export behind would have been a string nothing renders, which the next person
// would reasonably assume is live copy.

/** THE EXAM TABS (Pass 2) — the older four-tab row, restored.
 *
 *  The dropdown this replaces hid three of the four products behind a tap, on the theory that
 *  prices before the free thing read as an obstacle. In practice it also hid the SHAPE of the
 *  offer: a student could not see that Exam 1 being free is one quarter of a semester, not the
 *  whole product. Tabs show the lineup and the prices at once.
 *
 *  Horizontally scrollable rather than compressed: the price is the load-bearing half of each
 *  label, so at 320px the row scrolls instead of truncating '$50' away. */
function ExamTabs({ exams, activeNum, onSelect, greek }: { exams: ExamTab[]; activeNum: number; onSelect: (n: number) => void; greek?: boolean }) {
  const lockedSelected = !!exams.find((e) => e.num === activeNum)?.price;
  return (
    <>
    <div
      className="flex items-stretch overflow-x-auto"
      style={{ background: "rgba(0,0,0,0.22)", scrollbarWidth: "none", borderBottom: "1px solid var(--border-default)" }}
      role="tablist"
      aria-label="Choose an exam"
    >
      {exams.map((e) => {
        const on = e.num === activeNum;
        // GREEK PAGES DO NOT QUOTE $50. Showing per-exam student pricing beside a $100/member
        // chapter offer made the page read as two contradictory prices for the same thing. The
        // individual purchase path still exists everywhere else — it is simply not what this
        // page is selling.
        // GREEK PAGES DO NOT QUOTE $50 — per-exam student pricing beside a $100/member chapter
        // offer read as two contradictory prices. The individual path still exists elsewhere.
        const locked = e.price != null;
        const price = !locked ? "FREE" : greek ? "🔒 CHAPTER" : `$${e.price}`;

        return (
          <button
            key={e.num}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(e.num)}
            className="shrink-0 grow basis-0 px-2 py-2.5 text-center transition-opacity"
            style={{ minWidth: greek ? 78 : 64, borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, opacity: on ? 1 : 0.62 }}
          >
            {/* TWO LINES, not one. As "EXAM 1 — $50" the row needed 92px a tab, so at 390px the
                fourth tab sat off-screen behind a horizontal scroll and the Final's price — the
                half of the label that actually does the selling — was the part hidden. Stacked,
                a tab needs 64px and all four fit with the prices visible. */}
            <span className="block text-[11.5px] font-black uppercase tracking-wide" style={{ color: on ? "var(--accent)" : "var(--brand-cream)" }}>
              {e.label}
            </span>
            <span className="mt-0.5 block text-[10.5px] font-black leading-tight" style={{ color: on ? "var(--accent)" : "var(--brand-cream)", opacity: on ? 0.9 : 0.7 }}>
              {price}
            </span>
          </button>
        );
      })}
    </div>
      {/* NO PRICE HERE. This row is read by MEMBERS, and "$100/member per semester" on a page
          that just promised a free exam reads as though the student personally owes $100 —
          a bait-and-switch at exactly the moment we ask for their email. The member needs the
          promise; the exec needs the maths, and gets it in the chapter-access section. */}
      {/* The PRICE line appears ONLY when a locked exam (2/3/Final) is actually selected. On the
          default Exam-1 tab there is NO line: its own tab already says FREE, so the old
          "unlock when your chapter joins — Exam 1 is free either way" reminder was redundant. */}
      {greek && lockedSelected && exams.some((e) => e.price != null) && (
        <p className="px-3 pb-2 pt-0.5 text-center text-[11.5px]" style={{ background: "rgba(0,0,0,0.22)", color: "var(--text-muted)" }}>
          🔒 Exams 2, 3 and the Final unlock with chapter access — <span style={{ color: "var(--accent)", fontWeight: 800 }}>${SEAT_PRICE} per member, per semester</span>.
        </p>
      )}
    </>
  );
}

/** THE SEMESTER PASS, two states (08-21).
 *
 *  EXPANDED (first visit): one quiet line — "Save with the Semester Pass — Exams 2, 3 + Final for
 *  $150." — with a real, thumb-sized × (44px, always visible). It used to be a full strip that
 *  competed with the exam tabs, and its × was hover-revealed and small.
 *
 *  COLLAPSED (after dismissal, remembered in localStorage like the other UI preferences): a
 *  subtle BRACKET under the three paid tabs — Exam 2 → Exam 3 → Final — labelled
 *  "Semester Pass · $150". It is product architecture ("these three come together"), not an
 *  advertisement: ~18px tall, never over the tabs, clickable (→ the notify modal), and it does
 *  not come back as a banner. The expanded line and the bracket both open the same modal. */
const PASS_DISMISS_KEY = "sa-pass-line-dismissed";

function SemesterPassLine({ onPass }: { onPass: () => void }) {
  // null until the effect reads storage — the server and the first client paint must agree.
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  useEffect(() => { try { setCollapsed(localStorage.getItem(PASS_DISMISS_KEY) === "1"); } catch { setCollapsed(false); } }, []);
  const dismiss = () => {
    setCollapsed(true);
    try { localStorage.setItem(PASS_DISMISS_KEY, "1"); } catch { /* private mode */ }
  };
  if (collapsed === null) return null;
  if (collapsed) {
    // THE BRACKET. Four equal columns mirror the four equal-width tabs above; the bracket
    // occupies columns 2–4 (the paid exams). Exam 1 is free, so its column stays empty.
    return (
      <div className="grid px-0" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", background: "rgba(0,0,0,0.22)" }} aria-hidden={false}>
        <span />
        <button
          type="button"
          onClick={onPass}
          aria-label={`Semester Pass — Exams 2, 3 and the Final together for $${SEMESTER_PASS_PRICE}`}
          className="relative col-span-3 mx-2 mb-1 flex items-start justify-center"
          style={{ height: 18, borderLeft: "1px solid rgba(252,163,17,0.45)", borderRight: "1px solid rgba(252,163,17,0.45)", borderBottom: "1px solid rgba(252,163,17,0.45)", borderRadius: "0 0 6px 6px", marginTop: -1 }}
        >
          <span className="-translate-y-1/2 whitespace-nowrap rounded-full px-2 text-[9.5px] font-black uppercase tracking-[0.1em] leading-[14px]" style={{ background: "var(--sa-surface-1)", color: "var(--accent)", border: "1px solid rgba(252,163,17,0.35)", marginTop: 9 }}>
            Semester Pass · ${SEMESTER_PASS_PRICE}
          </span>
        </button>
      </div>
    );
  }
  return (
    <div className="relative flex items-center gap-1 px-2 py-1" style={{ background: "rgba(0,0,0,0.12)" }}>
      <button onClick={onPass} className="min-w-0 flex-1 truncate py-1.5 text-center text-[12.5px] hover:opacity-90" style={{ color: "var(--text-muted)", minHeight: 36 }}>
        Save with the <span className="font-bold" style={{ color: "var(--accent)" }}>Semester Pass</span>{` — Exams 2, 3 + Final for $${SEMESTER_PASS_PRICE}.`}
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss the Semester Pass message"
        className="grid shrink-0 place-items-center rounded-lg hover:bg-white/10"
        style={{ width: 44, height: 40, color: "var(--brand-cream)" }}
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

/** "Barton's" — natural possessive from the professor's last name (Smith's, Jones'). */
const possessive = (p: ProfessorLite | null): string | null => {
  const last = (p?.last || p?.name || "").trim().split(/\s+/).pop() ?? "";
  if (!last) return null;
  return /s$/i.test(last) ? `${last}'` : `${last}'s`;
};

/** SIDEBAR CONTEXT — school · course, professor, coverage, reset. Moved here from the bar that
 *  used to sit above the question; the sidebar is where a student understands what's on the
 *  exam, so this is where "whose exam" belongs. Only renders once the flow is confirmed. */
function SidebarContext({ school, professor, coveragePct, onAddProfessor, onMaterials, onReset, resetLabel }: { school: School | null; professor: ProfessorLite | null; coveragePct: number | null; onAddProfessor: () => void; onMaterials: () => void; onReset: () => void; resetLabel: string }) {
  const code = school?.codeVerified && school.code ? school.code : null;
  return (
    <div className="mb-3 border-b px-1 pb-3" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-black" style={{ color: "var(--brand-cream)" }}>{[school ? school.name : "Your school", code].filter(Boolean).join(" · ")}</div>
          {professor ? (
            <div className="text-[12px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>Prof. {professor.last || professor.name}</div>
          ) : school ? (
            <button type="button" onClick={onAddProfessor} className="text-[12px] font-bold" style={{ color: "var(--accent)", minHeight: 28 }}>+ Add professor</button>
          ) : null}
        </div>
        {/* "Reset" on the generic page (back to the school picker); "Start over" on a campus or
            chapter page, where the school stays and only professor + session restart. */}
        <button onClick={onReset} className="shrink-0 text-[11px]" style={{ color: "var(--text-muted)", minHeight: 28 }}>{resetLabel}</button>
      </div>
      {/* COVERAGE, inspectable but never in the way. Only when the resolver returned a real number. */}
      {coveragePct != null && (
        <button type="button" onClick={onMaterials} className="mt-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-black" style={{ background: "rgba(252,163,17,0.14)", color: "var(--accent)", minHeight: 28 }}>
          ~{coveragePct}% covered
        </button>
      )}
    </div>
  );
}

function ExamOutline({ tab, school, professor, flowDone, coveragePct, onAddProfessor, onMaterials, onReset, resetLabel, onNotify, stats, isPaid, curSetId, curTopicKey, openTopics, onToggleTopic, onPickSet }: { tab: ExamTab; school: School | null; professor: ProfessorLite | null; flowDone: boolean; coveragePct: number | null; onAddProfessor: () => void; onMaterials: () => void; onReset: () => void; resetLabel: string; onNotify: (r: NotifyReq) => void; stats: string; isPaid: boolean; curSetId: string | null; curTopicKey: string | null; openTopics: Set<string>; onToggleTopic: (k: string) => void; onPickSet: (topicKey: string, setId: string | null) => void }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  // revealInContainer, NOT scrollIntoView: block:"nearest" also scrolls the DOCUMENT, which on a
  // /go/ page dragged the chapter banner under the sticky navbar on load. See lib/ui-scroll.ts.
  useEffect(() => { revealInContainer(activeRef.current); }, [curSetId, curTopicKey]);
  // A LOCKED ROW TAP (peak intent) opens the ONE notify modal with that exam/topic/set as its
  // context. Browsing the tab itself never asks for anything.
  return (
    /* NO INTERNAL SCROLLBAR ON DESKTOP (Pass 5). This used to be a hard `sm:max-h-[380px]` cap, so
       once the outline grew past ~6 rows — or the notify box was added under the stats line — the
       sidebar started scrolling INSIDE the player: two nested scroll surfaces on one screen, and
       the notify box (the whole point of the panel) fell below the fold of a box most students
       never realise is scrollable. At sm and up the column is now its natural height and the PAGE
       scrolls. Below sm the outline is a drop-down drawer stacked above the video, where capping
       it is correct — an unbounded drawer would push the video off-screen. */
    <div className="max-h-[60vh] overflow-y-auto p-3 sm:max-h-none sm:overflow-visible">
      {flowDone && <SidebarContext school={school} professor={professor} coveragePct={coveragePct} onAddProfessor={onAddProfessor} onMaterials={onMaterials} onReset={onReset} resetLabel={resetLabel} />}
      {/* Sidebar header, restored in Pass 2. It was cut on the theory that the rows below already
          ARE the questions — true, but the header is also the only thing naming what the left
          column IS once the right panel stops being a video. On a locked tab it carries the
          release label. */}
      <div className="mb-2 flex items-center justify-between px-1">
        {/* "Common exam questions" was internal vocabulary (CEQ) leaking into student-facing UI.
            A student does not care what we call the format — they care what is ON the exam. */}
        {/* DYNAMIC: "What's on Barton's Exam 1?" once a professor is picked; "What's on Exam 1?" otherwise. */}
        <span className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>What&apos;s on {possessive(professor) ? `${possessive(professor)} ` : ""}{tab.label === "Final" ? "the Final" : tab.label}?</span>
        {/* The "Filming this week!" label is gone: it belongs inside the video player, next to the
            thing being filmed, not in a list header. Not relocated here — see the brief. */}
        {isPaid && <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>Opens {LAUNCH_WINDOW}</span>}
      </div>
      {tab.topics.map((t) => (
        <TopicRow key={t.key} topic={t} isPaid={isPaid} price={tab.price} open={openTopics.has(t.key)} onToggle={() => onToggleTopic(t.key)} curSetId={curSetId} curTopicKey={curTopicKey} activeRef={activeRef} onPickSet={onPickSet} onPaidClick={(setName) => onNotify(examRequest({ examNum: tab.num, examLabel: tab.label, topicName: t.name, setName, launchWindow: LAUNCH_WINDOW }))} />
      ))}
      {/* the quiet sum — where the eye lands after scanning the list, not a headline */}
      <div className="mt-2 border-t px-1 pt-2 text-[10.5px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>{stats}</div>
      {/* NO WAITLIST BOX HERE ANY MORE (08-21). The sidebar and the media panel each carried a
          permanent email form; now the student asks by clicking the thing that isn't ready. */}
    </div>
  );
}

/** PLACEHOLDER runtime for topics with no built sets. There is NO real duration source yet
 *  (student.functions runtimeSec is null until the Mux duration backfill lands) — these are
 *  deliberately estimates, deterministic per topic name so they never flicker between renders,
 *  in the honest 11–22 min band real sets run. REPLACE THE BODY with real data when durations
 *  exist; every caller already renders whatever number this returns. */
const estTopicMin = (name: string): number => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 11 + (h % 12);
};

function TopicRow({ topic, isPaid, price, open, onToggle, curSetId, curTopicKey, activeRef, onPickSet, onPaidClick }: { topic: ResolvedTopic; isPaid: boolean; price: number | null; open: boolean; onToggle: () => void; curSetId: string | null; curTopicKey: string | null; activeRef: RefObject<HTMLButtonElement | null>; onPickSet: (topicKey: string, setId: string | null) => void; onPaidClick: (setName: string) => void }) {
  const built = topic.sets.length > 0;
  const totalCeq = topic.sets.reduce((a, s) => a + s.ceqCount, 0);
  const posterActive = curTopicKey === topic.key && !curSetId;
  if (!built) {
    // Unbuilt topic — muted, estimated runtime, selectable → poster state. "coming" told a
    // student nothing about the product's shape; a runtime says what studying this topic costs.
    return (
      <button ref={posterActive ? activeRef : undefined} onClick={() => onPickSet(topic.key, null)} className="mb-0.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-2.5 text-left hover:bg-white/5" style={{ opacity: 0.55, background: posterActive ? "rgba(0,107,166,0.28)" : "transparent" }}>
        <span className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold" style={{ color: posterActive ? "var(--accent-info-text)" : "var(--brand-cream)" }}>{topic.name}</span>
        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>~{estTopicMin(topic.name)} min</span>
      </button>
    );
  }
  return (
    <div className="mb-1">
      <button onClick={onToggle} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2.5 text-left hover:bg-white/5">
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} style={{ color: "var(--text-muted)" }} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>{topic.name}</span>
        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{totalCeq} Qs</span>
      </button>
      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5">
          {topic.sets.map((s, i) => <SetRow key={s.id} set={s} refLabel={`${topic.num ?? "?"}.${i + 1}`} isPaid={isPaid} price={price} active={s.id === curSetId} activeRef={activeRef} onPick={() => onPickSet(topic.key, s.id)} onPaidClick={() => onPaidClick(s.name)} />)}
        </div>
      )}
    </div>
  );
}

// The set row is the product shelf: the first question's STEM, truncated at ~40ch — the truncation
// is the tease; the full stem shows in the player when selected. Paid-tab stems arrive from the
// server already ░-redacted. Counts language: topics · questions · video time (never "sets"/"stems").
function SetRow({ set, refLabel, isPaid, active, activeRef, onPick, onPaidClick }: { set: StudentSet; refLabel: string; isPaid: boolean; price: number | null; active: boolean; activeRef: RefObject<HTMLButtonElement | null>; onPick: () => void; onPaidClick: () => void }) {
  // PLAYABLE = has a cram video OR questions (the CEQ release ships questions before videos).
  const live = isPlayable(set);
  // The BASE STEM is the set's title; the variations only ever appear one at a time in cram mode.
  const stem = set.name.replace(/^"|"$/g, "");
  const tease = stem.length > 44 ? `${stem.slice(0, 44).trimEnd()}…` : stem;
  const meta = `${set.ceqCount} Q${set.ceqCount === 1 ? "" : "s"}${set.runtimeSec ? ` · ${fmtRuntime(set.runtimeSec)}` : ""}`;
  void refLabel; // the curriculum reference stays in the data model; students don't see it
  const covered = useCoverage(set.id);
  const frac = set.ceqCount > 0 ? Math.min(1, covered / set.ceqCount) : 0;
  // LOCK-NOT-BROKEN: paid rows keep FULL opacity (dim = disabled = "broken") and wear a lock in
  // the same slot free rows wear ▶. PAID-TAB-CAPTURE: tapping one points at the notify panel.
  const onClick = () => { if (isPaid) { onPaidClick(); return; } onPick(); };
  return (
    <button ref={active ? activeRef : undefined} onClick={onClick} className="relative flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/5" style={{ background: active ? "rgba(0,107,166,0.28)" : "transparent", opacity: !isPaid && !live ? 0.7 : 1 }}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold" style={{ color: active ? "var(--accent-info-text)" : "var(--brand-cream)" }}>{tease}</span>
        <span className="block text-[10.5px]" style={{ color: "var(--text-muted)" }}>{meta}{!live && !isPaid ? " · coming" : ""}</span>
        {/* COVERAGE (questions attempted), never accuracy — progress, not a score. */}
        {frac > 0 && <span className="mt-1 block h-[3px] overflow-hidden rounded-full" style={{ background: "rgba(245,239,230,0.1)" }}><span className="block h-full rounded-full" style={{ width: `${Math.round(frac * 100)}%`, background: frac >= 1 ? "#3BF5A0" : "var(--accent)" }} /></span>}
      </span>
      {live && !isPaid && <span className="shrink-0 text-[11px]" style={{ color: "var(--accent)" }}>▶</span>}
      {isPaid && <Lock className="h-3 w-3 shrink-0" style={{ color: "var(--accent)" }} />}
    </button>
  );
}

/** Questions attempted in a set (localStorage, updated live by cram mode). */
function useCoverage(setId: string): number {
  const [n, setN] = useState(() => (typeof window === "undefined" ? 0 : (readCoverage()[setId]?.length ?? 0)));
  useEffect(() => {
    const on = () => setN(readCoverage()[setId]?.length ?? 0);
    on();
    window.addEventListener("sa-coverage", on);
    return () => window.removeEventListener("sa-coverage", on);
  }, [setId]);
  return n;
}

// "Last, First" display — students know last names; falls back to the full name when last is absent.
const profDisplay = (p: ProfessorLite): string => (p.last ? `${p.last}${p.first ? `, ${p.first}` : ""}` : p.name);

// `school` is nullable now: the ask fires on two watched sets whether or not the student ever
// matched a campus, so the payload records what is actually known instead of requiring an
// identity the flow no longer collects up front.
function TwoSetAsk({ school, professor, onDone }: { school: School | null; professor: ProfessorLite | null; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try { await submitExamAsk({ data: { email: email.trim(), campusId: school?.campusId ?? null, campusName: school?.name ?? null, professorName: professor ? professor.name : null, source: "two_set_ask" } }); setSent(true); window.setTimeout(onDone, 1400); }
    catch { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-2 border-t px-3 py-3 sm:flex-row sm:items-center" style={{ borderColor: "var(--border-default)", background: "rgba(252,163,17,0.06)" }}>
      {sent ? (
        <span className="text-[14px] font-semibold" style={{ color: "var(--brand-cream)" }}>Saved — I'll tell you when Exam 2 lands.</span>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-[14px]" style={{ color: "var(--brand-cream)" }}>Nice — save your progress and get told when Exam 2 lands?</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="rounded-lg px-3 py-2.5 text-[14px] outline-none" style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", minWidth: 0 }} />
          <button onClick={send} disabled={!ok || busy} className="shrink-0 rounded-lg px-3 py-2.5 text-[14px] font-black disabled:opacity-40" style={{ background: "var(--accent)", color: "#0B1220" }}>{busy ? "…" : "Send"}</button>
          <button onClick={onDone} className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-muted)" }} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
        </>
      )}
    </div>
  );
}

// Muted autoplay per browser rules, with a clearly visible "Tap for sound" chip — the chip unmutes
// on tap and fades after the FIRST interaction of any kind (chip, native controls, or unmuting).
// No intro/branding card before content: the baked-in 1.5s pre-roll IS the intro. 16:9 only.
// onComplete fires once when the viewer has watched >=90% (the "set completed" signal, Prompt 3).
function HeroVideo({ playbackId, onComplete }: { playbackId: string; onComplete?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  const [chip, setChip] = useState(true); // fades (then unmounts) on first interaction
  const [chipFading, setChipFading] = useState(false);
  const fired = useRef(false);
  const dismissChip = () => { setChipFading(true); window.setTimeout(() => setChip(false), 350); };
  // Parent passes an inline arrow, so onComplete's identity changes every render — read it through a
  // ref so the player effect below doesn't tear down/rebuild hls (restarting the video) on re-renders.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    const src = `https://stream.mux.com/${playbackId}.m3u8`;
    let hls: { destroy: () => void } | null = null, cancelled = false;
    if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; }
    else void import("hls.js").then(({ default: Hls }) => { if (cancelled || !ref.current) return; if (Hls.isSupported()) { const h = new Hls(); h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr(true); }); h.loadSource(src); h.attachMedia(ref.current); hls = h; } else ref.current.src = src; }).catch(() => setErr(true));
    v.muted = true; void v.play().catch(() => { /* user can press play */ });
    const onTime = () => { if (!fired.current && v.duration > 0 && v.currentTime / v.duration >= 0.9) { fired.current = true; onCompleteRef.current?.(); } };
    v.addEventListener("timeupdate", onTime);
    return () => { cancelled = true; v.removeEventListener("timeupdate", onTime); hls?.destroy(); };
  }, [playbackId]);
  if (err) return <div className="grid h-full w-full place-items-center text-[12px]" style={{ color: "#F3C6CC" }}>Couldn't load this video. Try again shortly.</div>;
  return (
    <div className="relative h-full w-full" onPointerDownCapture={() => { if (chip && !chipFading) dismissChip(); }}>
      <video ref={ref} controls playsInline muted onVolumeChange={() => { if (chip && !chipFading && ref.current && !ref.current.muted) dismissChip(); }} className="h-full w-full" style={{ objectFit: "contain", background: "#000" }} />
      {chip && (
        <button
          onClick={() => { const v = ref.current; if (v) { v.muted = false; void v.play().catch(() => { /* keep state */ }); } dismissChip(); }}
          className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold"
          style={{ background: "rgba(11,18,32,0.82)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", opacity: chipFading ? 0 : 1, transition: "opacity 320ms ease", pointerEvents: chipFading ? "none" : "auto" }}
        >
          <span aria-hidden>🔊</span> Tap for sound
        </button>
      )}
    </div>
  );
}

/** SET FLOW PANEL — the homepage-sized shell around the shared Cram → Practice → Review walk
 *  (set-flow.ts, the same model /learn uses). Keyed by set id from the caller, so a new set
 *  always mounts fresh at CRAM — each set begins with its own Cram Blast.
 *
 *  Kept deliberately small: a strip (SET n OF m + stage pills) over the same 16:9 stage the
 *  video always used. Stage transitions are overlay CTAs, not new screens — this is still the
 *  low-friction discovery player, not a dashboard. Paid sets never reach here (no playbackId
 *  in the free tree), so there is no entitlement logic on this surface. */
function SetFlowPanel({ topic, set, exam, school, surface, onCramComplete, onPickSet, onNotify }: { topic: ResolvedTopic; set: StudentSet; exam: ExamTab; school: School | null; surface: "home" | "campus" | "greek"; onCramComplete: () => void; onPickSet: (setId: string) => void; onNotify: (r: NotifyReq) => void }) {
  // Entry = the set's FIRST available stage: cram when its video exists, else straight to
  // practice (the CEQ release ships questions before videos). The cram slot stays in the shell
  // as a "coming soon" strip so a published video fills it with no layout change.
  const [stage, setStage] = useState<SetStage>(() => stagesOf(set)[0]);
  // The end-of-video overlay per stage ("Practice this set →" / "Next set →").
  const [stageEnded, setStageEnded] = useState(false);
  const stages = stagesOf(set);
  // AVAILABILITY comes from the set itself (the content model), never a stored flag: a cram
  // video → Cram, question cards → Practice, a shipped review video → Review. The moment a
  // video is published the pill un-mutes on its own.
  const available: Record<SetStage, boolean> = { cram: !!set.playbackId, practice: set.ceqCount > 0, review: set.hasReview };
  const { n, of } = setIndexOf(topic.sets, set.id);
  const askFor = (st: SetStage) => {
    const a = { examNum: exam.num, examLabel: exam.label, topicName: topic.name, setName: set.name };
    onNotify(st === "cram" ? cramRequest(a) : st === "review" ? reviewRequest(a) : examRequest({ ...a, launchWindow: LAUNCH_WINDOW, free: true }));
  };
  const after = nextStep(topic.sets, set.id, stage);
  const nextSetName = after && after.setId !== set.id ? (topic.sets.find((s) => s.id === after.setId)?.name ?? "Next set") : null;
  const goto = (pos: { setId: string; stage: SetStage } | null) => {
    if (!pos) return;
    if (pos.setId === set.id) { setStage(pos.stage); setStageEnded(false); }
    else onPickSet(pos.setId); // remount via key → the next set starts at its own Cram
  };
  const forwardLabel = after ? (after.setId === set.id ? (after.stage === "practice" ? "Practice this set →" : "Review with Lee →") : "Next set →") : null;
  void stages;
  return (
    <div className="sa-reveal w-full">
      {/* THE STAGE STRIP — "SET n OF m" + Cram / Practice / Review, always. A stage without
          content stays visible and clickable (muted, SOON) so the student reads Practice as
          one step of a workflow: see what's coming → try it → watch Lee work it. */}
      {/* flex-wrap: at phone widths the three pills drop to their own row (still one row of
          three, easy to tap) instead of pushing the card wider than the screen. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5" style={{ background: "rgba(0,0,0,0.24)", borderBottom: "1px solid rgba(245,239,230,0.08)" }}>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em] tabular-nums" style={{ color: "var(--text-muted)" }}>Set {n} of {of}</span>
        <div className="ml-auto">
          <StagePills current={stage} available={available} onSelect={(st) => { setStage(st); setStageEnded(false); }} onUnavailable={askFor} />
        </div>
      </div>
      {/* VIDEO stages keep the 16:9 stage; PRACTICE takes its natural height (a question, four
          choices, the coming-soon line and the ask box must never scroll inside a video box). */}
      <div className="relative w-full" style={stage === "practice" ? { minHeight: 360, background: "#000" } : { aspectRatio: "16 / 9", background: "#000" }}>
        {stage === "practice" ? (
          <div className="flex w-full flex-col" style={{ background: "var(--sa-surface-2)", minHeight: 360 }}>
            <div className="min-h-0 flex-1">
              <PracticeStage
                setId={set.id}
                reference={{ topic: topic.num, set: n }}
                setName={set.name.replace(/^"|"$/g, "")}
                campusName={school?.name ?? null}
                campusSlug={school?.slug ?? null}
                surface={surface}
                statusLabel=""
                doneLabel={forwardLabel ?? "Done →"}
                onDone={() => goto(after)}
                onReview={set.reviewPlaybackId ? () => goto({ setId: set.id, stage: "review" }) : undefined}
              />
            </div>
          </div>
        ) : stage === "review" && !set.reviewPlaybackId ? (
          // Should be unreachable (the pill only renders when hasReview), but never dead-end.
          <div className="grid h-full w-full place-items-center px-6 text-center text-[12.5px]" style={{ background: "var(--sa-surface-2)", color: "var(--text-muted)" }}>
            <div>
              The review video for this set isn't published yet.
              {after && <button className="mt-3 block w-full rounded-xl px-4 py-2 text-[12px] font-black uppercase tracking-wide" style={{ background: "var(--accent)", color: "#0B1220" }} onClick={() => goto(after)}>{forwardLabel}</button>}
            </div>
          </div>
        ) : (
          <>
            <HeroVideo
              key={`${stage}:${stage === "review" ? set.reviewPlaybackId : set.playbackId}`}
              playbackId={(stage === "review" ? set.reviewPlaybackId : set.playbackId)!}
              onComplete={() => { if (stage === "cram") onCramComplete(); setStageEnded(true); }}
            />
            {stageEnded && after && (
              <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 px-3 py-2" style={{ background: "linear-gradient(0deg, rgba(5,8,16,0.92) 0%, rgba(5,8,16,0.0) 100%)" }}>
                <span className="min-w-0 truncate text-[11.5px] font-semibold" style={{ color: "var(--brand-cream)" }}>
                  {after.setId === set.id ? (after.stage === "practice" ? "Now try it yourself" : "Now watch Lee work it") : `Up next: ${nextSetName}`}
                </span>
                <button className="shrink-0 rounded-xl px-3.5 py-1.5 text-[12px] font-black uppercase tracking-wide" style={{ background: "var(--accent)", color: "#0B1220" }} onClick={() => goto(after)}>{forwardLabel}</button>
              </div>
            )}
            {stageEnded && !after && (
              <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2 text-[11.5px] font-semibold" style={{ color: "var(--brand-cream)", background: "linear-gradient(0deg, rgba(5,8,16,0.92) 0%, rgba(5,8,16,0.0) 100%)" }}>
                ✓ You finished {topic.name} — pick your next topic on the left.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** THE UNPUBLISHED-VIDEO STATE. Until a set's video is published this is what a topic opens onto,
 *  so it has to read as a deliberate "not yet", never as a player that failed to load: the bolt in
 *  the school's colours, the topic name, one plain line saying the videos for this set are coming,
 *  and the notify field — the only action there is until they publish — right here in the media
 *  panel on every breakpoint (the sidebar copy of it was invisible inside the mobile drawer). */
function Poster({ school, exam, topicName, stem, onNotify }: { school: School | null; exam: ExamTab; topicName: string; stem?: string | null; onNotify: () => void }) {
  const c = school ? boltFor(school.id) : { c1: BRAND_RED, c2: BRAND_BLUE };
  return (
    <div className="grid h-full w-full place-items-center py-5" style={{ background: "var(--sa-surface-2)" }}>
      <div className="flex w-full max-w-sm flex-col items-center gap-3 px-5 text-center">
        <span className="inline-block h-16 w-11"><Bolt c1={c.c1} c2={c.c2} /></span>
        <span className="rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-wide" style={{ background: "var(--accent)", color: "#0B1220" }}>{topicName}</span>
        {/* the FULL stem — the outline row's 40ch truncation is the tease, this is the payoff */}
        {stem && <p className="max-w-md text-[14px] font-semibold leading-snug" style={{ color: "var(--brand-cream)" }}>{stem}</p>}
        <p className="text-[14px] leading-snug" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>
          {exam.price != null
            ? `${exam.label === "Final" ? "The Final" : exam.label} opens ${LAUNCH_WINDOW} — ${topicName} is on the list.`
            : `Videos for ${topicName} are coming — Lee is filming this set now.`}
        </p>
        {/* ONE CTA → the ONE notify modal. No embedded form: browsing a future exam is allowed
            without being asked for an email; the ask waits for a click. */}
        <button type="button" onClick={onNotify} className="rounded-xl px-4 text-[13px] font-black" style={{ minHeight: 44, background: "var(--accent)", color: "#0B1220" }}>
          Notify me when it&apos;s ready →
        </button>
      </div>
    </div>
  );
}

// ---- THE LEE SECTION (the one section allowed to run warm) ------------------------------------
// Collapsed by default: photo + "Why I built Survive Accounting" + the two student quotes stay
// visible; a "Read more" toggle expands the rest in place. Expanded state persists for the browser
// session; prefers-reduced-motion gets an instant (un-animated) expand.
// LeeSection + LeePortrait moved to components/site/Marketing (TutorCard + TutorBioModal + the
// portrait). The bio is a MODAL now — opened by the pro-tutor trust chip and the tutor card.

// Testimonials moved to components/site/Testimonials — the partner pages show the same student
// proof, and a route file cannot be imported by a component.

function SectionDivider() {
  return <div aria-hidden className="mx-auto my-12 h-px w-full max-w-[200px]" style={{ background: "var(--bg-surface)" }} />;
}

// Four stacked layers, each on its own row so they collapse cleanly at 360px:
//  1) the text-me moment (a ghost boiling bolt sits behind it), 2) a quiet link row,
//  3) monochrome social icons (placeholders — TODO real hrefs), 4) the baseline + memorial line.
// Shared with /expand (which passes no onSyllabus — that page must not open an email-capture modal,
// so the syllabus item drops out and the text-me block carries the whole "reach Lee" job).
/** Footer links — the same set as the hamburger, because a student who scrolled to the bottom
 *  should not have to scroll back up to navigate. Kept in one array so the two menus cannot
 *  drift apart. */
/** Column 2 of the footer. Four in-page anchors; the Greek link is its own thing and lives in
 *  column 3, next to the other "reach a human" routes. */
// The FOOTER lives in components/site/SiteFooter — every marketing page needs it, including the
// partner pages, and a route file is the wrong home for something imported that widely.


