// LANDING (preview) — the surviveaccounting.com rebuild in the intro-frame design language:
// navy/cream, boiling bolt, orbital background, one page, no nav bar. Built as a NEW route so the
// live homepage is untouched; promote to "/" (index.tsx) when approved.
//
// Free Exam-1 block reads fetchStudentTree (same server gate students hit — only status='live'
// sets, free playback resolved, paid withheld) and plays on the page via the shared HLS player +
// silent IntroSting pre-roll. Picking a school recolors the bolt (full takeover on the first pick
// this visit, a short beat after) and flips the campus status strip once a map exists (campus_exams,
// 0105). No checkout exists yet — paid exams show topics + a mapping-gated line, not purchasable.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, GraduationCap, Lock, MessageCircle, Plus, X } from "lucide-react";

import { fetchStudentTree, type StudentSet, type StudentTopic } from "@/lib/student.functions";
import { resolveStudentMap, type MapLevel } from "@/lib/map-resolver.functions";
import { joinPricingWaitlist } from "@/lib/pricing-api";
import { getChapterNames, listCampusIntroCodes } from "@/lib/default-map.functions";
import { logSchoolDemand, submitExamAsk, submitSyllabus , submitNotify } from "@/lib/syllabus.functions";
import { searchOrderProfessors, type ProfessorLite } from "@/lib/orders.functions";
import { tagChapterMember } from "@/lib/greek-go.functions";
import { revealInContainer } from "@/lib/ui-scroll";
import { useDismiss } from "@/lib/use-dismiss";
import { fetchCourseOptions } from "@/lib/je-api";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { BoltBoil, SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { FitWordmark, SiteHeader, SITE_NAVY, useNavyDocument } from "@/components/site/SiteHeader";
import { PickerSheet } from "@/components/site/PickerSheet";
import { ExamPaper, EXAM_PAPER_CSS, paperStops, type PaperStop } from "@/components/site/ExamPaper";
import { CampusProvider, useCampus } from "@/lib/campus-context";
import { contactKind, LAUNCH_LINE, LAUNCH_WINDOW } from "@/lib/launch";
import { Bolt, BRAND_BLUE, BRAND_DISPLAY, BRAND_RED, BRAND_SANS, SEC_SCHOOLS } from "@/components/canvas/brand";

// PROMOTED TO "/" on 2026-08-13. This path 301s to the homepage so every link, QR and bookmark
// already in the wild keeps working, and the two URLs never compete for the same content.
// The PAGE still lives in this module: index.tsx imports LandingPage, and /chapters, /c/$slug and
// /expand import CampusSelector / Footer / SCHOOLS from here.
export const Route = createFileRoute("/landing")({
  beforeLoad: () => { throw redirect({ to: "/", statusCode: 301 }); },
});

const PHONE = "(662) 565-8818";
const TEL = "+16625658818";

// SEC-16 in build priority (Ole Miss · LSU first). campusId = the real campus row; colors come from
// SEC_SCHOOLS by slug. `code` renders ONLY when `codeVerified` — never guess a course code.
export type School = { campusId: string; id: string; name: string; code?: string; codeVerified?: boolean };
export const SCHOOLS: School[] = [
  { campusId: "7b92a320-b196-43f2-a241-77a0805816fe", id: "ole-miss", name: "Ole Miss" },
  { campusId: "698dd98f-dd92-46c1-8f28-e930568cb15d", id: "lsu", name: "LSU" },
  { campusId: "b3af67c6-99a5-4677-83d5-aa7d11a89c17", id: "alabama", name: "Alabama" },
  { campusId: "9c4775be-7d82-4a3e-840c-349c5e15d8e8", id: "tennessee", name: "Tennessee" },
  { campusId: "e631c8de-37a3-4aae-a948-a64bd20ea4c5", id: "arkansas", name: "Arkansas" },
  { campusId: "5f5bd18d-b92f-4d56-aced-23bce4c983d5", id: "south-carolina", name: "South Carolina" },
  { campusId: "3f570e37-5394-4058-baab-508948befedb", id: "georgia", name: "Georgia" },
  { campusId: "ae339230-577e-4569-a7d1-d1e45d1cfe91", id: "kentucky", name: "Kentucky" },
  { campusId: "e330e87c-5467-4c05-9d3d-6cd2398de036", id: "auburn", name: "Auburn" },
  { campusId: "95246fc8-1ce6-409e-b454-d03c82766719", id: "mississippi-state", name: "Mississippi State" },
  { campusId: "f16686c2-edc6-43f8-9638-6890f52c829a", id: "missouri", name: "Missouri" },
  { campusId: "91e62f9c-43b0-41f3-a84d-002824754da6", id: "oklahoma", name: "Oklahoma" },
  { campusId: "92e4a5d9-eeb3-4065-ac8a-5a4390fbc584", id: "texas-am", name: "Texas A&M" },
  { campusId: "4c5126b1-3fe0-48fe-a1db-1e41d06e4642", id: "florida", name: "Florida" },
  { campusId: "faad6039-be72-4f5c-8ad5-ca7b95e2889f", id: "texas", name: "Texas" },
  { campusId: "972451c3-bc5e-48d7-9f88-868a55378efa", id: "vanderbilt", name: "Vanderbilt" },
];
const COLOR_BY_ID = new Map(SEC_SCHOOLS.map((s: { id: string; c1: string; c2: string }) => [s.id, s]));
const schoolColors = (id: string) => COLOR_BY_ID.get(id) ?? { c1: BRAND_RED, c2: BRAND_BLUE };

// Bolt colors must READ on the navy page. Dark school primaries (Ole Miss navy #14213D, Auburn,
// Georgia) blend into the background, so lift any low-contrast color toward white until it's
// visible, preserving hue (navy → steel-blue, still "their color").
const PAGE_NAVY = SITE_NAVY; // ONE navy — must equal the meta theme-color (M3)
function hx(hex: string): [number, number, number] { const h = hex.replace("#", ""); const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h; const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toHex(r: number, g: number, b: number) { const t = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0"); return `#${t(r)}${t(g)}${t(b)}`; }
function lum([r, g, b]: [number, number, number]) { const f = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function contrast(a: [number, number, number], b: [number, number, number]) { const la = lum(a) + 0.05, lb = lum(b) + 0.05; return la > lb ? la / lb : lb / la; }
function readable(hex: string, min = 2.6): string {
  const bg = hx(PAGE_NAVY), rgb = hx(hex);
  if (contrast(rgb, bg) >= min) return hex;
  for (let t = 0.18; t <= 1.0001; t += 0.18) {
    const m: [number, number, number] = [rgb[0] + (255 - rgb[0]) * t, rgb[1] + (255 - rgb[1]) * t, rgb[2] + (255 - rgb[2]) * t];
    if (contrast(m, bg) >= min) return toHex(m[0], m[1], m[2]);
  }
  return "#E8ECF5";
}
const boltFor = (id: string) => { const c = schoolColors(id); const a = readable(c.c1), b = readable(c.c2); return lum(hx(b)) > lum(hx(a)) ? { c1: b, c2: a } : { c1: a, c2: b }; };

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
export function LandingPage({ initialCampusId, goChapter, chapterTop, chapterAccess, campusSlug, greekOrg, initialCourseCode }: {
  initialCampusId?: string;
  /** Campus slug straight from the URL. Resolves campus context on the FIRST render,
   *  before any chapter fetch — see the note atop go.$school.$chapter.tsx. */
  campusSlug?: string;
  /** Course code resolved server-side, so the headline never gains it a beat later. */
  initialCourseCode?: string | null;
  /** The chapter-access section, rendered after the player (never between a visitor and it). */
  chapterAccess?: React.ReactNode;
  /** Greek chapter name. Its presence IS the Greek variant switch. */
  greekOrg?: string;
  goChapter?: { schoolSlug: string; chapterSlug: string };
  /** Rendered directly beneath the chapter banner. A SLOT rather than an import, so this
   *  route file keeps knowing nothing about Greek claims — /go/ owns that concern and passes
   *  the component in. */
  /** Replaces the generic student hero on a chapter page. A /go/ visitor arrived from THEIR
   *  chapter's flyer, so leading with copy written for an anonymous student wastes the one
   *  thing that page knows. Omitted everywhere else, so the normal landing page is unchanged. */
  chapterTop?: React.ReactNode;
} = {}) {
  return (
    <CampusProvider urlSchoolSlug={campusSlug ?? goChapter?.schoolSlug ?? null} accountCampusId={initialCampusId ?? null} initialCode={initialCourseCode ?? null}>
      <LandingPageInner initialCampusId={initialCampusId} goChapter={goChapter} chapterTop={chapterTop} chapterAccess={chapterAccess} campusSlug={campusSlug} greekOrg={greekOrg} initialCourseCode={initialCourseCode} />
    </CampusProvider>
  );
}

function LandingPageInner({ initialCampusId, goChapter, chapterTop, chapterAccess, campusSlug, greekOrg, initialCourseCode }: {
  initialCampusId?: string;
  /** Campus slug straight from the URL. Resolves campus context on the FIRST render,
   *  before any chapter fetch — see the note atop go.$school.$chapter.tsx. */
  campusSlug?: string;
  /** Course code resolved server-side, so the headline never gains it a beat later. */
  initialCourseCode?: string | null;
  /** The chapter-access section, rendered after the player (never between a visitor and it). */
  chapterAccess?: React.ReactNode;
  /** Greek chapter name. Its presence IS the Greek variant switch. */
  greekOrg?: string;
  goChapter?: { schoolSlug: string; chapterSlug: string };
  /** Rendered directly beneath the chapter banner. A SLOT rather than an import, so this
   *  route file keeps knowing nothing about Greek claims — /go/ owns that concern and passes
   *  the component in. */
  chapterTop?: React.ReactNode;
}) {
  // M1.4 — paint html/body navy so Safari's overscroll rubber-band matches the page instead
  // of flashing the light default at the top and bottom edges.
  useNavyDocument();
  // M2.3 — which topic the notify modal was opened from (null = closed).
  const [notifyTopic, setNotifyTopic] = useState<string | null>(null);
  // /c/<slug> pre-selects the chapter's school. If it's one of the 16 SEC schools we pre-pick it;
  // otherwise we drop into "not listed" (default map) so the player still unblurs and plays.
  const campus = useCampus();
  // The resolved campus's bolt colours, published on the page root. One source; no component
  // picks its own. Null when campus is unknown, which leaves the cycling hero to set its own.
  const campusBolt = useMemo(() => (campus.school ? boltFor(campus.school.id) : null), [campus.school]);
  const preSchool = useMemo(() => (initialCampusId ? SCHOOLS.find((s) => s.campusId === initialCampusId) ?? null : null), [initialCampusId]);
  const [school, setSchool] = useState<School | null>(preSchool);
  // "My school isn't listed" — unblur with the DEFAULT map + brand navy (no school colors), plus an
  // optional "what school?" demand field. Everything else behaves like an unmapped-campus session.
  const [notListed, setNotListed] = useState(!!initialCampusId && !preSchool);
  const [theater, setTheater] = useState<{ school: School; mode: "full" | "short" } | null>(null);
  const firstPick = useRef(false);
  // A single monotonic "pulse" the Try-Exam-1 CTA bumps: scrolls to the player and rings the gate
  // picker once (no loop). The gated CampusSelector reacts to the change; nothing else does.
  // THE ONE DOOR. Scroll to the player and bump focusSignal so it opens the first topic and starts
  // playing. It no longer rings a school picker: there is no gate to ring. Content first, matching
  // later — the student sees the thing before being asked anything about themselves.
  const [focusSignal, setFocusSignal] = useState(0);
  const onStart = () => { document.getElementById("exam1")?.scrollIntoView({ behavior: "smooth" }); setFocusSignal((f) => f + 1); };
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
  const resetMatch = () => {
    setSchool(null);
    setNotListed(false);
    resetProfessor();
    try { localStorage.removeItem("sa-landing-school"); } catch { /* ignore */ }
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
    if (school || notListed || !campus.school) return;
    const s = SCHOOLS.find((x) => x.id === campus.school!.id);
    if (s) setSchool(s);
  }, [campus.school, school, notListed]);

  // RETURNING VISITOR — restore school (or "not listed") + professor + skip AFTER mount (never in an
  // initializer: this route SSRs, and a server/client mismatch there breaks hydration). A /c/<slug>
  // link's pre-selection wins over storage. Legacy sessionStorage values migrate forward once.
  useEffect(() => {
    if (initialCampusId) return; // chapter-link sessions keep their own preselection
    try {
      const id = localStorage.getItem("sa-landing-school");
      if (id === "__notlisted__") setNotListed(true);
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
    const m = new Map((codesQ.data ?? []).map((r) => [r.campusId, r.code]));
    return SCHOOLS.map((s) => { const code = m.get(s.campusId); return code ? { ...s, code, codeVerified: true } : { ...s, code: undefined, codeVerified: false }; });
  }, [codesQ.data]);

  // The hero cycles school COLOURWAYS only — no course code, no campus name (Pass 8). It still
  // reads the code-enriched list so the two stay in sync if the graphic ever shows type again.
  // HERO LOCK. One stop means no cycle — ExamPaper only starts its interval at stops.length >= 2,
  // so a known campus pins the bolt to its own colourway with no extra machinery. Unknown campus
  // still gets the full rotation, which is the whole point of the rotation.
  const stops = useMemo(() => {
    const all = paperStops(schoolsWithCodes, boltFor);
    if (!campus.school) return all;
    const mine = all.find((x) => x.id === campus.school!.id);
    return mine ? [mine] : all;
  }, [schoolsWithCodes, campus.school]);

  const treeQ = useQuery({ queryKey: ["landing-tree", school?.campusId ?? null], queryFn: () => fetchStudentTree({ data: school ? { campusId: school.campusId } : {} }), networkMode: "always", staleTime: 300_000 });
  const intro1 = useMemo(() => (treeQ.data ?? []).find((c) => c.family === "intro_1" || c.name.trim().toLowerCase() === "intro 1") ?? null, [treeQ.data]);

  // Intro-1 course id from the canonical `courses` table — the SAME source the campus map was
  // created under (the outline). Decoupled from fetchStudentTree, which only returns courses that
  // have LIVE sets, so mapped-detection works even before any Intro-1 video is published.
  const courseOptQ = useQuery({ queryKey: ["landing-courses"], queryFn: () => fetchCourseOptions(), staleTime: 600_000, networkMode: "always" });

  // THE RESOLVER (map system) — the ONE path that answers "what are this student's exams/topics":
  // professor map → campus map → Starter Map, resolved server-side. No landing code queries
  // campus_exams / default_exam_units directly anymore.
  const mapQ = useQuery({
    queryKey: ["landing-map", school?.campusId ?? null, professor?.id ?? null],
    queryFn: () => resolveStudentMap({ data: { campusId: school?.campusId ?? null, professorId: professor?.id ?? null } }),
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
    setNotListed(false);
    if (school?.id !== s.id) resetProfessor(); // new school → professor line resets (spec: ladder resets with school)
    setSchool(s);
    campus.setSessionSchool(s.id);   // persists AND raises campus context to session priority
    if (reduce) return; // instant swap, no takeover
    const mode = firstPick.current ? "short" : "full";
    firstPick.current = true;
    setTheater({ school: s, mode });
  };

  return (
    <div style={{ ...frameThemeVars(theme), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "clip", ...(campusBolt ? { ["--sa-bolt-1"]: campusBolt.c1, ["--sa-bolt-2"]: campusBolt.c2 } as React.CSSProperties : {}) }}>
      <style>{EXAM_PAPER_CSS}</style>
      <style>{`
        @keyframes sa-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .sa-marquee-track { animation: sa-marquee 42s linear infinite; }
        .sa-marquee:hover .sa-marquee-track { animation-play-state: paused; }
        /* Pause on FOCUS too, not just hover: a keyboard user tabbing into a moving strip would
           otherwise be chasing the thing they are focused on. */
        .sa-marquee:focus-within .sa-marquee-track { animation-play-state: paused; }
        .sa-tick-item { cursor: pointer; background: none; border: 0; padding: 0 1px; border-radius: 4px; transition: color 140ms, text-shadow 140ms; }
        .sa-tick-item:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
        .sa-tick-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; color: var(--accent); }
        /* sa-picker-pulse moved to styles.css — it was defined only here, so the ring was
           dead on /chapters and /expand, which render the same CampusSelector. */
        .sa-chg { opacity: 0; transition: opacity 120ms; }
        .sa-idrow:hover .sa-chg, .sa-chg:focus-visible { opacity: 1; }
        @media (hover: none) { .sa-chg { opacity: 1; } }
        @keyframes sa-meter-in { from { transform: translateY(-6px); opacity: 0; } to { transform: none; opacity: 1; } }
        .sa-meter-in { animation: sa-meter-in 200ms ease; }
        @media (prefers-reduced-motion: reduce) { .sa-meter-in { animation: none; } }
      `}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.34} animate /></div>

      {/* M1.5 — the persistent way home. On / it is the brand anchor; on /c/<slug> and the
          other pages that reuse LandingPage it is the only route back. */}
      <SiteHeader />

      {/* maxWidth + overflow-x guard (M1.1): `padding: 0 20px` on a 1040-wide box is fine on
          desktop, but any child that ignores the box (a nowrap lockup, a fixed-width panel)
          used to push the document sideways. Clamping here contains it at the source. */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px", width: "100%", overflowX: "clip" }}>
        {chapterTop ?? <Hero onStart={onStart} stops={stops} />}
        <ExamPlayer greekOrg={greekOrg} exams={exams} school={school ? (schoolsWithCodes.find((x) => x.id === school.id) ?? school) : null} onPick={pickSchool} focusSignal={focusSignal} schools={schoolsWithCodes} onSyllabus={openSyllabus} professor={professor} onPickProfessor={pickProfessor} notListed={notListed} onNotListed={() => { setNotListed(true); try { localStorage.setItem("sa-landing-school", "__notlisted__"); } catch { /* ignore */ } }} onReset={resetMatch} theater={theater} onTheaterDone={() => setTheater(null)} onNotify={(t) => setNotifyTopic(t)} />
        {/* CHAPTER ACCESS sits AFTER the product, never before it: a visitor who pressed
            "Start Exam 1 free" must not land on a sales section. */}
        {chapterAccess}

        {/* Greek pages put proof before the FAQ (reviews answer "is this real?", which an exec
            asks before the operational questions). The student page keeps its existing order. */}
        {greekOrg ? null : <Faq greek={undefined} />}
        <SectionDivider />
        <div id="reviews" className="scroll-mt-20" />
        <TestimonialsSlider />
        <SectionDivider />
        {greekOrg ? <Faq greek={greekOrg} /> : null}
        <div id="lee" className="scroll-mt-16" />
        <LeeSection />
        <SectionDivider />
        <Footer />
      </main>

      {syllabusOpen && <SyllabusModal school={school} framing={syllabusFraming} onClose={() => { setSyllabusOpen(false); setSyllabusFraming(null); }} />}
      {notifyTopic !== null && <NotifyModal topic={notifyTopic} school={school} professorName={professor ? (professor.last || professor.name) : null} onClose={() => setNotifyTopic(null)} />}
    </div>
  );
}

// ---- HERO — EXACTLY FOUR THINGS: headline, subhead, CTA, trust badges.
//
// Pass 2 removes the wordmark from here. The navbar's compact lockup is now the ONLY wordmark
// on the page, so repeating it 200px below was the same brand statement twice — and it was the
// single tallest thing on the first screen, pushing the actual promise down.
//
// The badges are the only new element. They answer the question the headline provokes ("says
// who?") without a paragraph, and they are the reason the subhead can stay one line.
const TRUST_BADGES = ["Created by a pro tutor", "1,000+ students helped"];

function Hero({ onStart, stops }: { onStart: () => void; stops: PaperStop[] }) {
  return (
    // Pass 3: two columns from 1024px, single centred column below it. The vertical padding is
    // deliberately short of a full viewport now — the player's tab row should PEEK at the bottom
    // on a 1080p screen, because a half-visible control is a better scroll cue than any arrow.
    <section className="sa-hero3 grid items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-14">
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <h1 className="text-[30px] font-black leading-[1.08] sm:text-[42px] lg:text-[52px]" style={{ letterSpacing: "-0.015em" }}>
          Cram what&apos;s on your exam.
        </h1>

        <p className="mt-4 max-w-[22ch] text-[16px] leading-snug sm:max-w-[42ch] sm:text-[18px]" style={{ color: "var(--brand-cream)", opacity: 0.66 }}>
          On-demand tutoring videos for your first accounting course. Built for last-minute strugglers and anyone chasing easy extra points.
        </p>

        <button
          onClick={onStart}
          className="mt-8 inline-flex items-center gap-2 rounded-xl px-7 py-4 text-[16px] font-black transition-transform hover:scale-[1.03]"
          style={{ background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)", minHeight: 52 }}
        >
          Cram Exam 1 Free ⚡
        </button>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
          {TRUST_BADGES.map((b) => (
            <span
              key={b}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{ background: "rgba(245,239,230,0.07)", border: "1px solid rgba(245,239,230,0.13)", color: "var(--brand-cream)", opacity: 0.8 }}
            >
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* THE GRAPHIC — bolt only. `order-first` on mobile puts it above the H1 as specified; the
          width is capped so it cannot push the CTA under the fold on a 390x844 phone. See
          .sa-hero3-paper in styles.css, where the measured mobile decision is recorded. */}
      <div className="order-first flex flex-col items-center lg:order-none lg:items-end">
        {stops.length > 0 && <ExamPaper stops={stops} onActivate={onStart} className="sa-hero3-paper" />}
        {/* The bolt cycles SEC colourways, which can still read as "only these schools". One
            line, doing the job the deleted campus-name text used to make necessary. */}
        {stops.length > 0 && (
          <p className="sa-paper-caption text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
            Covers any intro accounting course, nationwide.
          </p>
        )}
      </div>
    </section>
  );
}

// Slow marquee of SEC school names in build-priority order. Muted, pausable on hover; reduced-motion
// collapses to a static first-three line. Track duplicates the row and slides -50% for a seamless loop.
// `reduce` is read in an EFFECT, never during render. Calling matchMedia while rendering is a real
// hydration hazard on this SSR'd route: the server always takes the animated branch while a
// reduced-motion client takes the static one, so the two trees disagree on the first paint.
function SchoolTicker({ size = 12.5, className = "mt-3 w-full max-w-md", onPick }: { size?: number; className?: string; onPick?: (s: School) => void } = {}) {
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
    q: "Is Exam 1 really free?",
    a: "Yep — every Exam 1 topic, completely free, no card required. If it helps, come back for Exam 2!",
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
    q: "What if my school isn't listed?",
    a: "Intro accounting is nearly the same course everywhere, so these videos will still carry you — and I add schools as students ask. Hit \"My school isn't listed\" and tell me.",
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
    q: "Is Exam 1 really free for everyone?",
    a: "Yes. Every member can use Exam 1 free with no card required. Your chapter can try it before spending anything.",
  },
  {
    q: "What does chapter access cost?",
    a: "$100 per member for the semester, with a 10-seat minimum. Exam 1 stays free either way. Chapter seats unlock Exams 2, 3 and the Final.",
  },
  {
    q: "Can we see whether members actually use it?",
    a: "Yes. Chapter access includes a private dashboard showing who joined, recent activity, and study progress — so you're not paying for a perk nobody uses.",
  },
  {
    q: "When do the later exams come out?",
    a: "I film throughout the semester ahead of each exam. Students can leave their email on an upcoming exam and I'll let them know when the cram videos are ready.",
  },
  {
    q: "Is this allowed?",
    a: "Yes. This is tutoring and exam preparation. I teach students how to solve the accounting problems themselves; students still take their own exams.",
  },
  {
    q: "What if our professor or school isn't listed?",
    a: "Members can tell me what's missing. Intro Accounting overlaps heavily across universities, and I prioritize new professor and course mappings based on student requests and course materials.",
  },
];

function Faq({ greek }: { greek?: string }) {
  // One question open on load, the rest behind a toggle. Seven stacked cards was a wall of text
  // between the player and the testimonials, and the first question is the one nearly everybody
  // actually has. On a chapter page that first question is "How does this work?", which is the
  // whole program in one paragraph.
  const list = greek ? GREEK_FAQS : FAQS;
  const [open, setOpen] = useState(false);
  const [first, ...rest] = list;
  return (
    <section className="py-10">
      <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
        {greek ? "CHAPTER QUESTIONS" : "FREQUENTLY ASKED QUESTIONS"}
      </p>
      <div className="mx-auto mt-5 max-w-[640px] space-y-4">
        <FaqCard f={first} defaultOpen />
        {open && rest.map((f) => <FaqCard key={f.q} f={f} />)}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-[13px] font-bold"
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
    <div className="rounded-xl" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.09)" }}>
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
        <p id={id} className="px-4 pb-3.5 text-[13.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.72 }}>{f.a}</p>
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

  // Match on the name, the slug, and the course code — but only a code the student can
  // actually SEE, or searching "ACCY 201" would surface a school whose row shows no code.
  const needle = q.trim().toLowerCase();
  const results = schools.filter((s) =>
    s.name.toLowerCase().includes(needle) || s.id.includes(needle) || (!!s.codeVerified && !!s.code && s.code.toLowerCase().includes(needle)));

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
        style={{ background: "rgba(245,239,230,0.06)", border: `2px solid ${school ? "var(--bolt-primary)" : "var(--accent)"}`, boxShadow: "0 20px 55px -22px rgba(0,0,0,0.7)", animation: ring ? "sa-picker-pulse 0.9s ease" : undefined, borderRadius: 16 }}
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
          search={{ value: q, onChange: setQ, placeholder: `Search ${schools.length} SEC schools…` }}
          footer={onNotListed ? (
            <button type="button" className="sa-row sa-row--plain" onClick={() => { onNotListed(); close(); }}>
              <span className="sa-row-name" style={{ color: "var(--accent)", fontSize: 15 }}>My school isn&apos;t listed →</span>
            </button>
          ) : undefined}
        >
          {results.length === 0 && <p className="sa-picker-empty">No SEC school by that name.</p>}
          {results.map((s) => { const c = boltFor(s.id); return (
            // The code cell is ALWAYS rendered, empty string and all: it holds its grid track
            // open so the row does not jump sideways when listCampusIntroCodes resolves.
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
function NotifyModal({ topic, school, professorName, onClose }: { topic: string | null; school: School | null; professorName?: string | null; onClose: () => void }) {
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
      await submitNotify({ data: { contact: contact.trim(), topic, campusId: school?.campusId ?? null, campusName: school?.name ?? null, professorName: professorName ?? null } });
      setDone(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "That didn't send — try again?"); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[240] grid place-items-center px-4" style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "rgba(5,8,16,0.72)" }} onClick={onClose}>
      <div
        className="w-full max-w-[380px] rounded-2xl p-5"
        style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.14)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="py-4 text-center">
            <p className="text-[17px] font-black" style={{ color: "var(--brand-cream)" }}>You&apos;re on the list. ⚡</p>
            <button onClick={onClose} className="mt-4 w-full rounded-xl text-[13.5px] font-black" style={{ minHeight: 46, background: "rgba(245,239,230,0.12)", color: "var(--brand-cream)" }}>Close</button>
          </div>
        ) : (
          <>
            <p className="text-[16px] font-black" style={{ color: "var(--brand-cream)" }}>{LAUNCH_LINE}</p>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              {topic ? `I'll tell you the moment ${topic} is up.` : "I'll tell you the moment it's up."}
            </p>
            <input
              autoFocus
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              placeholder="Email or phone"
              className="mt-3 w-full rounded-xl px-3 text-[15px] outline-none"
              style={{ minHeight: 46, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }}
            />
            {err && <p className="mt-2 text-[12px]" style={{ color: "#FF8B9E" }}>{err}</p>}
            <button
              onClick={() => void send()}
              disabled={!valid || busy}
              className="mt-3 w-full rounded-xl text-[14px] font-black disabled:opacity-45"
              style={{ minHeight: 46, background: "var(--accent)", color: "#0B1220" }}
            >
              {busy ? "Sending…" : "Get notified"}
            </button>
            <button onClick={onClose} className="mt-2 w-full text-[12.5px]" style={{ minHeight: 44, color: "var(--text-muted)" }}>No thanks</button>
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
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.14)", boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)", fontFamily: BRAND_SANS }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-[18px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Send everything you've got.</h3>
          <button onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)" }} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full text-[24px]" style={{ background: "rgba(59,245,160,0.14)" }}>⚡</div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--brand-cream)" }}>Got it. You'll hear from me soon — Lee.</p>
            <button onClick={onClose} className="mt-5 rounded-xl px-5 py-2.5 text-[13.5px] font-black" style={{ background: "var(--accent)", color: "#0B1220" }}>Done</button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[13px] leading-relaxed" style={{ color: framing ? "var(--brand-cream)" : "var(--text-muted)" }}>{framing ?? "Syllabus, study guides, old homework, notes — the more you send, the tighter I can match your exam. I review every submission myself."}</p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-xl px-4 py-6 text-center transition-colors"
              style={{ border: `2px dashed ${drag ? "var(--accent)" : "rgba(245,239,230,0.25)"}`, background: drag ? "rgba(252,163,17,0.08)" : "rgba(245,239,230,0.03)" }}
            >
              <p className="text-[13.5px] font-semibold" style={{ color: "var(--brand-cream)" }}>Add files from your class</p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Syllabus or study guide · PDF, Word, or a photo</p>
              <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => void addFiles(e.target.files)} />
            </div>

            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "rgba(245,239,230,0.05)", color: "var(--brand-cream)" }}>
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
              style={{ background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }}
            />

            {err && <p className="mt-2 text-[12.5px]" style={{ color: "#F3C6CC" }}>{err}</p>}

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
  const questions = tab.topics.reduce((a, t) => a + t.sets.reduce((b, s) => b + s.ceqCount, 0), 0);
  const secs = tab.topics.reduce((a, t) => a + t.sets.reduce((b, s) => b + (s.runtimeSec ?? 0), 0), 0);
  const hrs = secs / 3600;
  const parts = [`${topics} topic${topics === 1 ? "" : "s"}`];
  if (questions > 0) parts.push(`${questions} questions`);
  if (hrs > 0) parts.push(`${hrs.toFixed(1)} hrs video time`);
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

/** THE MATCH PANEL — Pass 4 moves the professor step onto CENTRE STAGE.
 *
 *  Every action now happens where the video will play, as sequential states, instead of hanging
 *  off a bar at the top. The panel is the stage: pick a school on it, pick a professor on it,
 *  then it becomes the content. The top bar is left holding only what is already TRUE.
 *
 *  `onReset` clears school AND professor together. A half-reset — new school, professor left
 *  over from the old one — would silently attach a student to another campus's faculty. */
function MatchPanel({ school, professor, notListed, profDone, coveragePct, schools, cueSignal, onPick, onNotListed, onPickProfessor, onProfNotListed, onMaterials, onReset }: {
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
  onPickProfessor: (p: ProfessorLite) => void;
  onProfNotListed: () => void;
  onMaterials: () => void;
  onReset: () => void;
}) {
  const matched = !!school || notListed;
  const code = school?.codeVerified && school.code ? school.code : null;

  // STATE 1 — no school yet.
  if (!matched) {
    return (
      <div className="grid h-full w-full place-items-center px-5 py-6" style={{ background: "var(--sa-surface-2)" }}>
        <div className="flex w-full max-w-sm flex-col items-center gap-3">
          <div className="w-full"><CampusSelector school={null} onPick={onPick} schools={schools} onNotListed={onNotListed} cue={cueSignal} /></div>
          {/* The marquee lives HERE and nowhere else — under the picker it answers "is my school
              here?" at the moment the question is asked. */}
          <SchoolTicker onPick={onPick} />
        </div>
      </div>
    );
  }

  // STATE 2 — school known, professor rung unanswered. Centre stage, inline list.
  if (!profDone) {
    return (
      <div className="w-full px-5 py-6" style={{ background: "var(--sa-surface-2)" }}>
        <ProfessorStage
          school={school}
          onPick={onPickProfessor}
          onNotListed={onProfNotListed}
        />
      </div>
    );
  }

  // THE MATERIALS GATE IS GONE FROM THE PAGE FLOW (it was STATE 3).
  //
  // It occupied the entire player panel and stood between a student who had just named their
  // professor and the videos they came for — to ask them to go find a syllabus. The coverage
  // number is genuinely useful and the materials ask is genuinely worth making, but neither is
  // worth blocking the product on. Both live in the confirmed bar below now: the coverage reads
  // as a chip, and pressing it opens the existing syllabus modal.

  // STATE 4 — confirmed. The bar states what is TRUE and offers one way back.
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "rgba(245,239,230,0.1)", background: "rgba(0,0,0,0.18)" }}>
      <span className="shrink-0 text-[12px]" style={{ color: "#3BF5A0" }}>✓</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold" style={{ color: "var(--brand-cream)" }}>
        {[school ? school.name : "Your school", code, professor ? `Prof. ${professor.last || professor.name}` : null].filter(Boolean).join(" · ")}
      </span>
      {/* COVERAGE, inspectable but never in the way. Only rendered when the resolver returned a
          real number — no percentage is invented to fill the slot. */}
      {coveragePct != null && (
        <button
          type="button"
          onClick={() => onMaterials()}
          className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-black"
          style={{ background: "rgba(252,163,17,0.14)", color: "var(--accent)", minHeight: 32 }}
        >
          ~{coveragePct}% covered
        </button>
      )}
      {/* "Reset", not "Change": it returns to the very beginning, so the label should say so. */}
      <button onClick={onReset} className="shrink-0 text-[12px]" style={{ color: "var(--text-muted)" }}>Reset</button>
    </div>
  );
}

/** The professor rung, rendered inline on the stage rather than in a sheet.
 *
 *  Pass 4 removed "Skip this" on instruction: "My professor isn't listed" is the only alternate
 *  path, and it still reaches the same next step, so nobody is trapped. "Change school" is
 *  deliberately demoted to small muted text under the list — it is a correction, not a choice. */
/** PROFESSOR COMBOBOX.
 *
 *  Was a search box above a permanently-open 190px scrolling list — a database dumped on screen
 *  before the visitor had watched anything. The list is now a POPUP that only exists once you
 *  type or focus, so the resting state is one field.
 *
 *  "Change school" is GONE. On /go/<school>/<chapter> the visitor is already somewhere specific;
 *  offering to change school there invites them out of the context the whole page is built on.
 *  The foot-of-page self-report ("Not in FarmHouse?") is the remaining, correctly-quiet path.
 *
 *  Keyboard: ArrowUp/Down move, Enter picks, Escape closes, Home/End jump. aria-activedescendant
 *  keeps screen readers on the highlighted option without moving DOM focus off the input. */
function ProfessorStage({ school, onPick, onNotListed }: {
  school: School | null;
  onPick: (p: ProfessorLite) => void;
  onNotListed: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const campusId = school?.campusId ?? null;
  const profQ = useQuery({
    queryKey: ["landing-profs", campusId],
    queryFn: () => searchOrderProfessors({ data: { campusId: campusId! } }),
    enabled: !!campusId, networkMode: "always", staleTime: 300_000,
  });
  const roster = profQ.data ?? [];
  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    const sorted = roster.slice().sort((a, b) => (a.last || a.name).localeCompare(b.last || b.name) || (a.first || "").localeCompare(b.first || ""));
    if (!needle) return sorted;
    return sorted.filter((x) => {
      const first = (x.first || "").toLowerCase(), last = (x.last || "").toLowerCase(), full = x.name.toLowerCase();
      return full.includes(needle) || `${last}, ${first}`.includes(needle) || `${last} ${first}`.includes(needle);
    });
  }, [roster, needle]);

  // Clamp the highlight whenever the result set changes, so filtering can never leave it pointing
  // past the end of the list.
  useEffect(() => { setActive((i) => Math.min(i, Math.max(0, results.length - 1))); }, [results.length]);
  useDismiss<HTMLDivElement>(() => setOpen(false), { enabled: open, esc: false });

  const choose = (x: ProfessorLite) => { setOpen(false); setQ(""); onPick(x); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(results.length - 1); }
    else if (e.key === "Enter") { const x = results[active]; if (x) { e.preventDefault(); choose(x); } }
  };

  // Keep the highlighted row visible INSIDE the popup — revealInContainer never scrolls the page.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="1"]');
    revealInContainer(el);
  }, [active, open]);

  const listId = "prof-listbox";
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-stretch gap-2.5">
      <p className="text-center text-[16px] font-black" style={{ color: "var(--brand-cream)" }}>Pick your professor</p>

      <div ref={boxRef} className="relative">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `prof-opt-${results[active].id}` : undefined}
          aria-label={`Search ${school?.name ?? "your school"} professors`}
          placeholder={`Search ${school?.name ?? "your school"} professors`}
          autoCorrect="off" autoCapitalize="none" spellCheck={false}
          className="w-full rounded-lg px-3 outline-none focus:ring-2"
          // 16px explicitly — under it iOS zooms the page on focus and never zooms back.
          style={{ fontSize: 16, minHeight: 48, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }}
        />
        {open && (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-[220px] overflow-y-auto rounded-lg py-1"
            style={{ background: "var(--sa-surface-1, #1B2B4D)", border: "1px solid rgba(245,239,230,0.16)", boxShadow: "0 18px 40px rgba(0,0,0,0.45)" }}
          >
            {profQ.isLoading && <li className="px-3 py-2 text-[13px] italic" style={{ color: "var(--text-muted)" }}>Loading…</li>}
            {results.map((x, i) => (
              <li key={x.id} role="option" id={`prof-opt-${x.id}`} aria-selected={i === active} data-active={i === active ? "1" : undefined}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(x)}
                  className="block w-full px-3 text-left text-[14px]"
                  style={{ minHeight: 44, color: "var(--brand-cream)", background: i === active ? "rgba(252,163,17,0.14)" : "transparent" }}
                >
                  {profDisplay(x)}
                </button>
              </li>
            ))}
            {!profQ.isLoading && results.length === 0 && <li className="px-3 py-2 text-[13px] italic" style={{ color: "var(--text-muted)" }}>No matches.</li>}
          </ul>
        )}
      </div>

      <button type="button" onClick={onNotListed} className="text-[14px] font-bold" style={{ minHeight: 44, color: "var(--accent)" }}>
        My professor isn&apos;t listed →
      </button>
    </div>
  );
}
// MatchSheet DELETED in Pass 5. It portalled to document.body, so the materials step rendered as
// a detached panel at the top-left of the viewport instead of inside the player — and opening it
// on a professor pick is what made school/professor selection feel broken. Every step of the flow
// now lives in MatchPanel, inside the right panel, where the student is already looking.


function ExamPlayer({ greekOrg, exams, school, onPick, focusSignal, schools, onSyllabus, professor, onPickProfessor, notListed, onNotListed, onReset, theater, onTheaterDone, onNotify }: { greekOrg?: string; exams: ExamTab[]; school: School | null; onPick: (s: School) => void; focusSignal: number; schools: School[]; onSyllabus: (framing?: string) => void; professor: ProfessorLite | null; onPickProfessor: (p: ProfessorLite | null) => void; notListed: boolean; onNotListed: () => void; onReset: () => void; theater: { school: School; mode: "full" | "short" } | null; onTheaterDone: () => void; onNotify: (topic: string) => void }) {
  const [activeNum, setActiveNum] = useState(1);
  const [selById, setSelById] = useState<Record<number, Sel>>({});
  const [openTopics, setOpenTopics] = useState<Set<string>>(() => new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The match sheet. It is the ONLY place school/professor are chosen now — there is no gate.
  // The materials gate is a STATE of the panel now, not a modal. It shows once the professor
  // rung is answered and clears when the student acts on it either way.
  // The professor rung is "answered" once a professor is picked OR declared unlisted. Without
  // this the stage would sit on the professor step forever for anyone who has no listed prof.
  const [profDone, setProfDone] = useState(false);
  useEffect(() => { if (professor) setProfDone(true); }, [professor]);
  useEffect(() => { setProfDone(false); }, [school?.id]);
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
  const showAsk = completedSets.size >= 2 && !askDone;

  // Default selection for a tab: first topic with a LIVE set → first topic with any set → first
  // topic (poster) → null.
  const firstLiveSel = (tab: ExamTab): Sel | null => {
    for (const t of tab.topics) { const live = t.sets.find((s) => s.playbackId); if (live) return { topicKey: t.key, setId: live.id }; }
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

  const pickSet = (topicKey: string, setId: string | null) => { setSelById((p) => ({ ...p, [active.num]: { topicKey, setId } })); setDrawerOpen(false); };
  const toggleTopic = (k: string) => setOpenTopics((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <section id="exam1" className="mt-8 scroll-mt-6 sm:mt-14">
      <div className="relative overflow-hidden rounded-2xl" style={{ background: "var(--sa-surface-1)", border: "1px solid rgba(252,163,17,0.45)" }}>
        <ExamTabs greek={!!greekOrg} exams={exams} activeNum={activeNum} onSelect={(n) => { setActiveNum(n); setDrawerOpen(false); }} />
        {/* HIDDEN ON CHAPTER PAGES. The Semester Pass is an INDIVIDUAL product ($150 for one
            student); beside a $100/member chapter offer it reads as a third, contradictory
            price for the same thing. It is untouched on the student page, where it is the only
            offer on screen. */}
        {!greekOrg && <SemesterPassLine onPass={() => onNotify("Semester Pass")} />}


        {/* TOPIC ROW — the mobile topic switcher. No longer gated on a school: the outline it
            opens is populated by the Starter Map from the very first paint, so hiding the
            switcher until a school existed only hid working navigation. */}
        <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 sm:hidden" style={{ background: "rgba(0,0,0,0.2)" }}>
          <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>Topic</span>
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            aria-expanded={drawerOpen}
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold"
            style={{ minHeight: 40, background: "rgba(245,239,230,0.08)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }}
          >
            <span className="min-w-0 truncate">{curTopic?.name ?? active.label}</span>
            <span className="shrink-0" style={{ color: "var(--accent)" }}>{drawerOpen ? "▴" : "▾"}</span>
          </button>
        </div>

        <div className="sa-player-min sm:flex">
          <div className={`${drawerOpen ? "block" : "hidden"} border-b sm:block sm:w-[42%] sm:max-w-[360px] sm:border-b-0 sm:border-r`} style={{ borderColor: "rgba(245,239,230,0.1)" }}>
            <ExamOutline tab={active} school={school} stats={examStats(active)} isPaid={isPaid} curSetId={curSet?.id ?? null} curTopicKey={cur?.topicKey ?? null} openTopics={openTopics} onToggleTopic={toggleTopic} onPickSet={pickSet} />
          </div>

          <div className="min-w-0 flex-1" style={{ background: "var(--sa-surface-2)" }}>
            {/* RIGHT PANEL. Until a school exists the panel IS the picker; after that it carries
                the confirmed line above the content. The left outline stays populated the whole
                time, so this asks a question without hiding the catalogue behind it. */}
            {/* ONE STATE AT A TIME. `flowDone` is the whole ladder, not its first rung — see the
                note above sa-panel-min in styles.css for the height half of this. */}
            <div className="sa-panel-min relative w-full">
              <MatchPanel school={school} professor={professor} notListed={notListed} profDone={profDone} coveragePct={active.coveragePct} schools={schools} cueSignal={focusSignal} onPick={onPick} onNotListed={onNotListed} onPickProfessor={(pr) => { onPickProfessor(pr); setProfDone(true); }} onProfNotListed={() => setProfDone(true)} onMaterials={() => onSyllabus()} onReset={onReset} />
              {flowDone && (
                <div className="relative w-full" style={{ aspectRatio: "16 / 9", background: "#000" }}>
                  {curSet?.playbackId ? (
                    <HeroVideo key={curSet.playbackId} playbackId={curSet.playbackId} onComplete={() => markComplete(curSet!.id)} />
                  ) : (
                    <Poster school={school} topicName={curTopic?.name ?? active.label} stem={curSet?.firstStem ?? null} />
                  )}
                </div>
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
  return (
    <div
      className="flex items-stretch overflow-x-auto"
      style={{ background: "rgba(0,0,0,0.22)", scrollbarWidth: "none", borderBottom: "1px solid rgba(245,239,230,0.1)" }}
      role="tablist"
      aria-label="Choose an exam"
    >
      {exams.map((e) => {
        const on = e.num === activeNum;
        // GREEK PAGES DO NOT QUOTE $50. Showing per-exam student pricing beside a $100/member
        // chapter offer made the page read as two contradictory prices for the same thing. The
        // individual purchase path still exists everywhere else — it is simply not what this
        // page is selling.
        const price = e.price == null ? "FREE" : greek ? "CHAPTER ACCESS" : `$${e.price}`;
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
  );
}

/** The Semester Pass line, now dismissible.
 *
 *  It is the only always-on upsell in the player, so a student who has decided against it should
 *  be able to put it away — and it should STAY away, or dismissing it is theatre. The x is
 *  hover-revealed on pointer devices and permanently visible (small, muted) on touch, where
 *  there is no hover to reveal it with.
 *
 *  Dismissal is a UI preference in localStorage, read in an effect: reading storage during
 *  render would make the server (always visible) and the client (maybe hidden) disagree. */
const PASS_DISMISS_KEY = "sa-pass-line-dismissed";

function SemesterPassLine({ onPass }: { onPass: () => void }) {
  const [gone, setGone] = useState(false);
  useEffect(() => { try { if (localStorage.getItem(PASS_DISMISS_KEY) === "1") setGone(true); } catch { /* private mode */ } }, []);
  if (gone) return null;
  const dismiss = () => {
    setGone(true);
    try { localStorage.setItem(PASS_DISMISS_KEY, "1"); } catch { /* private mode */ }
  };
  return (
    <div className="sa-passline group relative px-3 py-2 text-center" style={{ background: "rgba(0,0,0,0.12)" }}>
      <button onClick={onPass} className="block w-full px-7 text-[12.5px] hover:opacity-90" style={{ color: "var(--text-muted)" }}>
        Or grab the{" "}
        <span className="font-bold" style={{ color: "var(--accent)" }}>Semester Pass</span>
        {` — everything, all semester, for $${SEMESTER_PASS_PRICE}.`}
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss the Semester Pass offer"
        className="sa-passline-x absolute right-1.5 top-1/2 grid -translate-y-1/2 place-items-center rounded"
        style={{ width: 28, height: 28, color: "var(--text-muted)" }}
      >
        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>×</span>
      </button>
    </div>
  );
}

function ExamOutline({ tab, school, stats, isPaid, curSetId, curTopicKey, openTopics, onToggleTopic, onPickSet }: { tab: ExamTab; school: School | null; stats: string; isPaid: boolean; curSetId: string | null; curTopicKey: string | null; openTopics: Set<string>; onToggleTopic: (k: string) => void; onPickSet: (topicKey: string, setId: string | null) => void }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  // revealInContainer, NOT scrollIntoView: block:"nearest" also scrolls the DOCUMENT, which on a
  // /go/ page dragged the chapter banner under the sticky navbar on load. See lib/ui-scroll.ts.
  useEffect(() => { revealInContainer(activeRef.current); }, [curSetId, curTopicKey]);
  // PAID-TAB-CAPTURE: a paid-row tap (peak intent) points at the persistent notify panel below
  // instead of flashing a self-destructing tooltip.
  const [notifyPulse, setNotifyPulse] = useState(0);
  return (
    /* NO INTERNAL SCROLLBAR ON DESKTOP (Pass 5). This used to be a hard `sm:max-h-[380px]` cap, so
       once the outline grew past ~6 rows — or the notify box was added under the stats line — the
       sidebar started scrolling INSIDE the player: two nested scroll surfaces on one screen, and
       the notify box (the whole point of the panel) fell below the fold of a box most students
       never realise is scrollable. At sm and up the column is now its natural height and the PAGE
       scrolls. Below sm the outline is a drop-down drawer stacked above the video, where capping
       it is correct — an unbounded drawer would push the video off-screen. */
    <div className="max-h-[60vh] overflow-y-auto p-3 sm:max-h-none sm:overflow-visible">
      {/* Sidebar header, restored in Pass 2. It was cut on the theory that the rows below already
          ARE the questions — true, but the header is also the only thing naming what the left
          column IS once the right panel stops being a video. On a locked tab it carries the
          release label. */}
      <div className="mb-2 flex items-center justify-between px-1">
        {/* "Common exam questions" was internal vocabulary (CEQ) leaking into student-facing UI.
            A student does not care what we call the format — they care what is ON the exam. */}
        <span className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>What&apos;s on {tab.label === "Final" ? "the Final" : tab.label}</span>
        {/* The "Filming this week!" label is gone: it belongs inside the video player, next to the
            thing being filmed, not in a list header. Not relocated here — see the brief. */}
        {isPaid && <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>Opens {LAUNCH_WINDOW}</span>}
      </div>
      {tab.topics.map((t) => (
        <TopicRow key={t.key} topic={t} isPaid={isPaid} price={tab.price} open={openTopics.has(t.key)} onToggle={() => onToggleTopic(t.key)} curSetId={curSetId} curTopicKey={curTopicKey} activeRef={activeRef} onPickSet={onPickSet} onPaidClick={() => setNotifyPulse((p) => p + 1)} />
      ))}
      {/* the quiet sum — where the eye lands after scanning the list, not a headline */}
      <div className="mt-2 border-t px-1 pt-2 text-[10.5px]" style={{ borderColor: "rgba(245,239,230,0.08)", color: "var(--text-muted)" }}>{stats}</div>
      {/* PAID-TAB-CAPTURE: the persistent next step at the moment of maximum purchase intent */}
      {/* Pass 3: the notify box is on ALL four tabs. Exam 1 used to advertise its launch state
          twice — a line on the poster AND a link — while collecting nothing. Same box, same
          shape, one place to leave an email, whichever exam the student came for. */}
      <PaidNotifyRow exam={tab} school={school} pulse={notifyPulse} />
    </div>
  );
}

// PAID-TAB-CAPTURE — "Exam 2 · $50 — opens soon" + one email field into the existing pricing
// waitlist (campus_waitlist, tier test_pass). Joined state persists per exam so it asks once.
function PaidNotifyRow({ exam, school, pulse }: { exam: ExamTab; school: School | null; pulse: number }) {
  const key = `sa-notify-exam-${exam.num}`;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"open" | "busy" | "done" | "error">(() => { try { return localStorage.getItem(key) === "done" ? "done" : "open"; } catch { return "open"; } });
  const [flash, setFlash] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pulse) return;
    revealInContainer(boxRef.current, "smooth");
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [pulse]);
  const submit = async () => {
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || state === "busy") return;
    setState("busy");
    try {
      // examNum is carried explicitly: all four tabs collect emails now, so "which exam did
      // this person ask for" is no longer inferable from the fact that a row exists at all.
      await joinPricingWaitlist({ email: e, campus: school?.name ?? null, course: `${exam.label}${school?.code ? ` · ${school.code}` : ""}`, tier: "test_pass", examNum: exam.num });
      setState("done"); try { localStorage.setItem(key, "done"); } catch { /* ignore */ }
    } catch { setState("error"); }
  };
  return (
    /* Compacted in Pass 5 (px-3 py-2.5 → px-2.5 py-2, 11.5px label → 11px, mt-1.5 → mt-1). It is the
       last thing in a column that no longer scrolls, so every pixel it spends is a pixel the sidebar
       grows past the video beside it. */
    <div ref={boxRef} className="mt-2 rounded-xl px-2.5 py-2" style={{ border: `1px solid ${flash ? "var(--accent)" : "rgba(252,163,17,0.35)"}`, background: flash ? "rgba(252,163,17,0.14)" : "rgba(252,163,17,0.06)", transition: "background 300ms, border-color 300ms" }}>
      {state === "done" ? (
        <p className="text-[11px] font-semibold" style={{ color: "var(--brand-cream)" }}>✓ You're on the list — I'll email you the day {exam.label} opens.</p>
      ) : (
        <>
          <p className="text-[11px] font-bold" style={{ color: "var(--brand-cream)" }}>Get notified once {exam.label} is ready</p>
          <div className="mt-1 flex gap-1.5">
            <input value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("open"); }} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} type="email" placeholder="you@school.edu" className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[12px] outline-none" style={{ background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
            <button onClick={() => void submit()} disabled={state === "busy"} className="shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-black disabled:opacity-50" style={{ background: "var(--accent)", color: "#0B1220" }}>{state === "busy" ? "…" : "Notify me"}</button>
          </div>
          {state === "error" && <p className="mt-1 text-[10.5px]" style={{ color: "#F3C6CC" }}>Couldn't save that — try again in a moment.</p>}
        </>
      )}
    </div>
  );
}

function TopicRow({ topic, isPaid, price, open, onToggle, curSetId, curTopicKey, activeRef, onPickSet, onPaidClick }: { topic: ResolvedTopic; isPaid: boolean; price: number | null; open: boolean; onToggle: () => void; curSetId: string | null; curTopicKey: string | null; activeRef: RefObject<HTMLButtonElement | null>; onPickSet: (topicKey: string, setId: string | null) => void; onPaidClick: () => void }) {
  const built = topic.sets.length > 0;
  const totalCeq = topic.sets.reduce((a, s) => a + s.ceqCount, 0);
  const posterActive = curTopicKey === topic.key && !curSetId;
  if (!built) {
    // Unbuilt topic — muted, "(coming)", selectable → poster state.
    return (
      <button ref={posterActive ? activeRef : undefined} onClick={() => onPickSet(topic.key, null)} className="mb-0.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/5" style={{ opacity: 0.55, background: posterActive ? "rgba(252,163,17,0.12)" : "transparent" }}>
        <span className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: posterActive ? "var(--accent)" : "var(--brand-cream)" }}>{topic.name}</span>
        <span className="shrink-0 text-[11px]" style={{ color: "var(--text-muted)" }}>coming</span>
      </button>
    );
  }
  return (
    <div className="mb-1">
      <button onClick={onToggle} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/5">
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} style={{ color: "var(--text-muted)" }} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: "var(--brand-cream)" }}>{topic.name}{SHOW_CHAPTER_NUM && topic.num != null && <span className="ml-1 font-normal opacity-60">(Ch. {topic.num})</span>}</span>
        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{totalCeq} question{totalCeq === 1 ? "" : "s"}</span>
      </button>
      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5">
          {topic.sets.map((s) => <SetRow key={s.id} set={s} isPaid={isPaid} price={price} active={s.id === curSetId} activeRef={activeRef} onPick={() => onPickSet(topic.key, s.id)} onPaidClick={onPaidClick} />)}
        </div>
      )}
    </div>
  );
}

// The set row is the product shelf: the first question's STEM, truncated at ~40ch — the truncation
// is the tease; the full stem shows in the player when selected. Paid-tab stems arrive from the
// server already ░-redacted. Counts language: topics · questions · video time (never "sets"/"stems").
function SetRow({ set, isPaid, active, activeRef, onPick, onPaidClick }: { set: StudentSet; isPaid: boolean; price: number | null; active: boolean; activeRef: RefObject<HTMLButtonElement | null>; onPick: () => void; onPaidClick: () => void }) {
  const live = !!set.playbackId;
  const stem = set.firstStem?.trim() || set.name;
  const tease = stem.length > 40 ? `${stem.slice(0, 40).trimEnd()}…` : stem;
  const meta = `${set.ceqCount} question${set.ceqCount === 1 ? "" : "s"}${set.runtimeSec ? ` · ${fmtRuntime(set.runtimeSec)}` : ""}`;
  // LOCK-NOT-BROKEN: paid rows keep FULL opacity (dim = disabled = "broken") and wear a lock in
  // the same slot free rows wear ▶. PAID-TAB-CAPTURE: tapping one points at the notify panel.
  const onClick = () => { if (isPaid) { onPaidClick(); return; } onPick(); };
  return (
    <button ref={active ? activeRef : undefined} onClick={onClick} className="relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5" style={{ background: active ? "rgba(252,163,17,0.12)" : "transparent", opacity: !isPaid && !live ? 0.7 : 1 }}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold" style={{ color: active ? "var(--accent)" : "var(--brand-cream)" }}>{tease}</span>
        <span className="block text-[10.5px]" style={{ color: "var(--text-muted)" }}>{meta}{!live && !isPaid ? " · coming" : ""}</span>
      </span>
      {live && !isPaid && <span className="shrink-0 text-[11px]" style={{ color: "var(--accent)" }}>▶</span>}
      {isPaid && <Lock className="h-3 w-3 shrink-0" style={{ color: "var(--accent)" }} />}
    </button>
  );
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
    <div className="flex flex-col gap-2 border-t px-3 py-3 sm:flex-row sm:items-center" style={{ borderColor: "rgba(245,239,230,0.1)", background: "rgba(252,163,17,0.06)" }}>
      {sent ? (
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--brand-cream)" }}>Got it — I'll be in touch. — Lee</span>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: "var(--brand-cream)" }}>Two down. What else is on your exam?</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="rounded-lg px-3 py-1.5 text-[12.5px] outline-none" style={{ background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)", minWidth: 0 }} />
          <button onClick={send} disabled={!ok || busy} className="shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-black disabled:opacity-40" style={{ background: "var(--accent)", color: "#0B1220" }}>{busy ? "…" : "Send"}</button>
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
          style={{ background: "rgba(11,18,32,0.82)", border: "1px solid rgba(245,239,230,0.28)", color: "var(--brand-cream)", opacity: chipFading ? 0 : 1, transition: "opacity 320ms ease", pointerEvents: chipFading ? "none" : "auto" }}
        >
          <span aria-hidden>🔊</span> Tap for sound
        </button>
      )}
    </div>
  );
}

function Poster({ school, topicName, stem }: { school: School | null; topicName: string; stem?: string | null }) {
  const c = school ? boltFor(school.id) : { c1: BRAND_RED, c2: BRAND_BLUE };
  return (
    <div className="grid h-full w-full place-items-center" style={{ background: "var(--sa-surface-2)" }}>
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <span className="inline-block h-16 w-11"><Bolt c1={c.c1} c2={c.c2} /></span>
        <span className="rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-wide" style={{ background: "var(--accent)", color: "#0B1220" }}>{topicName}</span>
        {/* the FULL stem — the outline row's 40ch truncation is the tease, this is the payoff */}
        {stem && <p className="max-w-md text-[13.5px] font-semibold leading-snug" style={{ color: "var(--brand-cream)" }}>{stem}</p>}
        {/* Pass 3 removed the launch line and the Get-notified link from here. Both now live in
            the sidebar notify box, which actually captures the email — the poster was announcing
            the same fact a second time and sending the student somewhere else to act on it. */}
      </div>
    </div>
  );
}

// ---- THE LEE SECTION (the one section allowed to run warm) ------------------------------------
// Collapsed by default: photo + "Why I built Survive Accounting" + the two student quotes stay
// visible; a "Read more" toggle expands the rest in place. Expanded state persists for the browser
// session; prefers-reduced-motion gets an instant (un-animated) expand.
function LeeSection() {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("lee-bio-open") === "1";
  });
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setReduce(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);
  const toggle = () => setOpen((v) => { const next = !v; try { window.sessionStorage.setItem("lee-bio-open", next ? "1" : "0"); } catch { /* private mode */ } return next; });

  return (
    <section className="mx-auto max-w-3xl rounded-3xl p-7 sm:p-10" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
      <div className="flex flex-col gap-7 sm:flex-row sm:items-start">
        <div className="shrink-0"><LeePortrait /></div>
        {/* Body uses the UI/text face (Rubik is a display face — headlines only). */}
        <div className="min-w-0" style={{ fontFamily: BRAND_SANS, color: "var(--brand-cream)", maxWidth: "54ch" }}>
          {/* Student-facing header. "Why I built Survive Accounting" is about ME; a stranger
              scanning this page is looking for who is going to teach them. The story keeps its
              name as a sub-heading inside the expanded body. */}
          <h2 style={{ fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: 20, lineHeight: 1.15, color: "var(--brand-cream)", marginBottom: 16 }}>Meet your tutor</h2>

          {/* two student voices — heavier, H3-scale (always visible) */}
          <div className="space-y-1.5">
            <h3 style={{ fontWeight: 700, fontSize: 17.5, lineHeight: 1.3, color: "var(--brand-cream)" }}>“My exam looked nothing like my notes.”</h3>
            <h3 style={{ fontWeight: 700, fontSize: 17.5, lineHeight: 1.3, color: "var(--brand-cream)" }}>“I studied for weeks and still failed.”</h3>
          </div>

          {/* the one headline moment — stays visible in the collapsed state, right above Read more */}
          <p style={{ marginTop: 16, fontWeight: 600, fontSize: 18, color: "var(--brand-cream)" }}>Sound familiar?</p>

          {/* collapsible remainder — max-height clip animates height (grid-rows fr transitions are
              unreliable in some engines); reduced-motion skips the animation. 640px comfortably
              clears the content; it's only a ceiling, so the box still sits at its natural height. */}
          <div style={{ overflow: "hidden", maxHeight: open ? 640 : 0, opacity: open ? 1 : 0, transition: reduce ? "none" : "max-height 340ms ease, opacity 260ms ease" }}>
            <div>
              {/* The story keeps its name HERE, as a sub-heading — the section header above is
                  student-facing ("Meet your tutor"), which is what a stranger is actually
                  scanning for. Both can be true without competing. */}
              <p style={{ marginTop: 14, fontSize: 12.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55 }}>
                Why I built Survive Accounting
              </p>

              <p style={{ marginTop: 10, marginBottom: 16, fontWeight: 400, fontSize: 16, lineHeight: 1.5, color: "var(--brand-cream)" }}>
                Lectures teach you <i>about</i> accounting. Exams test whether you can <i>do</i> it.
              </p>

              <p style={{ fontWeight: 400, fontSize: 15, lineHeight: 1.6, opacity: 0.88 }}>
                So my cram videos are real exam-style questions, worked start to finish — you walk
                into the exam having already done the problems.
              </p>

              <p style={{ marginTop: 14, fontWeight: 400, fontSize: 15, lineHeight: 1.6, opacity: 0.88 }}>
                This course is tough. So are you. Exam 1 is free — see for yourself.
              </p>
            </div>
          </div>

          <button
            onClick={toggle}
            aria-expanded={open}
            className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-bold transition-colors hover:text-[var(--accent)]"
            style={{ color: "var(--accent)" }}
          >
            <Plus className="h-3.5 w-3.5 transition-transform" style={{ transform: open ? "rotate(45deg)" : "none" }} />
            {open ? "Show less" : "Read more"}
          </button>
        </div>
      </div>
    </section>
  );
}

// Lee's real photo — a 4:5 crop centered on the face, rounded + cream border + a slight tilt, with
// a small caption. No cutout / edge blur / filters. (The old cream SVG portrait is retired here and
// reserved for the video intro/outro frames.)
function LeePortrait() {
  return (
    <figure className="mx-auto sm:mx-0" style={{ width: 200, transform: "rotate(1.5deg)" }}>
      {/* Clip frame + scaled image = zoom into the face (crops the long arm + thighs). */}
      <div style={{ width: 200, aspectRatio: "4 / 5", borderRadius: 16, border: "3px solid var(--brand-cream)", overflow: "hidden" }}>
        <img
          src="/lee-beach.webp" alt="Lee Ingram"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%", transform: "scale(1.42)", transformOrigin: "50% 22%", display: "block" }}
        />
      </div>
      <figcaption className="mt-3 text-center" style={{ fontFamily: BRAND_SANS }}>
        <span className="block" style={{ fontWeight: 600, fontSize: 16, color: "var(--brand-cream)" }}>Lee Ingram</span>
        <span className="mt-0.5 block text-[12px]" style={{ fontWeight: 400, opacity: 0.6, color: "var(--brand-cream)" }}>Ole Miss accounting grad</span>
        <span className="block text-[12px]" style={{ fontWeight: 400, opacity: 0.6, color: "var(--brand-cream)" }}>Tutor since 2015</span>
      </figcaption>
    </figure>
  );
}

// ---- TESTIMONIALS (own slider — navy/cream/bolt; no white cards / stars / verified badges) ----
// Curated top-10 from testimonials.csv, best-first. long=1 → truncate + "show more". Auto-advances
// 6s; ANY interaction stops it permanently; reduced-motion = manual only. `avatar` is our RE-HOSTED
// Supabase URL (testimonial-avatars bucket) — the original testimonial.to Firebase avatars are never
// hotlinked; a person with no source avatar (or a broken load) falls back to initials.
const AV = "https://unvxagsledbsdoremqeb.supabase.co/storage/v1/object/public/testimonial-avatars";
// `code` is the student's OWN course code, optional. None of the current rows have one, so they
// all render campus-only. Do NOT backfill it from the campus: the code a student took in 2019 is
// not necessarily the code that campus uses now, and that is a fact about a real person.
type Testimonial = { name: string; school: string; long: boolean; quote: string; avatar?: string; code?: string };
const TESTIMONIALS: Testimonial[] = [
  { name: "Zach Parker", school: "Ole Miss", long: false, quote: "Lee your videos saved me on multiple choice. Everything you thought would be on there was." },
  { name: "George L.", school: "Ole Miss", long: false, quote: "If it weren’t for Lee, I wouldn’t have made A’s in both intro courses.", avatar: `${AV}/george-l.jpg` },
  { name: "Tyler K.", school: "Ole Miss", long: false, quote: "Lee's exam prep videos are better than any tutor I’ve ever had.", avatar: `${AV}/tyler-k.jpg` },
  { name: "James L.", school: "Ole Miss", long: false, quote: "Feel like I got an A purely because of Lee's videos." },
  { name: "Claire Ficek", school: "Ole Miss", long: false, quote: "Survive Accounting is literally the only reason that I got through Accounting 201! A bunch of my friends used it and said it was so helpful." },
  { name: "Ryan M.", school: "Ole Miss", long: false, quote: "Lee's videos were a lifesaver. I would've failed without them.", avatar: `${AV}/ryan-m.jpg` },
  { name: "Nic Ripson", school: "Ole Miss", long: false, quote: "Survive Accounting helped me better understand the content I needed to learn. My quiz average was a 45% and after using this platform to study I got an 84.5% on my first intermediate exam." },
  { name: "Brace R.", school: "Ole Miss", long: false, quote: "I enjoyed how he broke everything down to very simple terms that weren’t necessarily explained in class.", avatar: `${AV}/brace-r.jpg` },
  { name: "Nate K.", school: "Ole Miss", long: true, quote: "Survive accounting is the sole reason that I got through both accounting courses at ole miss. Lee does an exceptional job breaking every little piece down as much as possible and makes it super easy to follow along. He is very enthusiastic and not only is he a great accounting tutor but he is also a genuinely great guy. If you need assistance in your accounting class I highly recommend Survive Accounting.", avatar: `${AV}/nate-k.jpg` },
  { name: "Daniel B.", school: "Ole Miss", long: true, quote: "Survive Accounting helped with my homework, test preparation, and the overall understanding of accounting. Having the ability to see how Lee went step by step in problems helped me grasp super confusing concepts. He was also very friendly over email and even gave me specific pointers about assignments I emailed to him which was a huge help. If you are going to dedicate time to studying, I would highly recommend using Survive Accounting to optimize your understanding of the material and give yourself a greater chance of receiving a high grade in the class!", avatar: `${AV}/daniel-b.jpg` },
];
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// Avatar: our re-hosted image when present, initials otherwise (and on any load error — never a
// hotlink, never a broken image).
function TestimonialAvatar({ name, src }: { name: string; src?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    // Eager (not lazy): the slider translates cards off-screen, and lazy never fires for a
    // transformed off-screen <img>. These are 2–5KB each, so eager load is cheap and reliable.
    return <img src={src} alt={name} onError={() => setBroken(true)} className="h-12 w-12 shrink-0 rounded-full object-cover" style={{ border: "1px solid rgba(245,239,230,0.18)" }} />;
  }
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-[14px] font-black" style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.18)", color: "var(--accent)" }}>{initialsOf(name)}</span>;
}

function TestimonialsSlider() {
  const reduce = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const n = TESTIMONIALS.length;
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(!reduce); // manual control always wins — never resume once stopped
  const [hover, setHover] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const stop = () => setAuto(false);
  const go = (d: -1 | 1) => { setIdx((i) => (i + d + n) % n); };
  useEffect(() => { setExpanded(false); }, [idx]);
  useEffect(() => {
    if (!auto || hover || reduce) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % n), 6000);
    return () => window.clearInterval(t);
  }, [auto, hover, reduce, n]);

  // pointer drag / swipe (covers touch); a swipe past threshold advances AND stops auto-play.
  const start = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const onDown = (e: RPointerEvent) => { start.current = e.clientX; };
  const onMove = (e: RPointerEvent) => { if (start.current != null) setDx(e.clientX - start.current); };
  const end = () => { const d = dx; start.current = null; setDx(0); if (Math.abs(d) > 40) { go(d < 0 ? 1 : -1); stop(); } };

  return (
    <section className="mx-auto mb-12 max-w-2xl" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <h2 className="mb-6 text-center text-[22px] font-black sm:text-[26px]" style={{ color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>What students are saying</h2>

      <div className="relative select-none overflow-hidden rounded-2xl" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)", touchAction: "pan-y" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerLeave={() => { if (start.current != null) { start.current = null; setDx(0); } }}>
        <div className="flex" style={{ width: `${n * 100}%`, transform: `translateX(calc(-${idx * (100 / n)}% + ${dx}px))`, transition: start.current != null ? "none" : "transform 420ms ease" }}>
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="flex flex-col items-center justify-center px-6 py-7 text-center sm:px-8" style={{ width: `${100 / n}%`, minHeight: 210 }}>
              <span aria-hidden className="mb-1 font-serif leading-none" style={{ color: "var(--brand-cream)", opacity: 0.16, fontSize: 44 }}>“</span>
              <blockquote className="max-w-[52ch] text-[14.5px] leading-relaxed sm:text-[15.5px]" style={{ color: "var(--brand-cream)", ...(t.long && !expanded ? { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" } : {}) }}>
                {t.quote}
              </blockquote>
              {t.long && (
                <button onClick={() => { setExpanded((v) => !v); stop(); }} className="mt-2 text-[12.5px] font-semibold" style={{ color: "var(--accent)", minHeight: 44, paddingBlock: 4 }}>{expanded ? "show less" : "+ show more"}</button>
              )}
              <figcaption className="mt-4 flex items-center gap-3">
                <TestimonialAvatar name={t.name} src={t.avatar} />
                <span className="text-left">
                  <span className="block text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>{t.name}</span>
                  <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>{[t.school, t.code].filter(Boolean).join(" · ")}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      {/* controls — every one stops auto-play permanently */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <button onClick={() => { go(-1); stop(); }} className="grid h-8 w-8 place-items-center rounded-full text-[18px] hover:bg-white/5" style={{ color: "var(--brand-cream)", border: "1px solid rgba(245,239,230,0.2)" }} aria-label="Previous testimonial">‹</button>
        <div className="flex items-center gap-1.5">
          {TESTIMONIALS.map((t, i) => (
            <button key={t.name} onClick={() => { setIdx(i); stop(); }} aria-label={`Go to testimonial ${i + 1}`} className="h-2 rounded-full transition-all" style={{ width: i === idx ? 18 : 8, background: i === idx ? "var(--accent)" : "rgba(245,239,230,0.3)" }} />
          ))}
        </div>
        <button onClick={() => { go(1); stop(); }} className="grid h-8 w-8 place-items-center rounded-full text-[18px] hover:bg-white/5" style={{ color: "var(--brand-cream)", border: "1px solid rgba(245,239,230,0.2)" }} aria-label="Next testimonial">›</button>
      </div>
    </section>
  );
}

// ---- CHAPTER BANNER + CLAIM (on /go/<school>/<chapter> links) --------------------------------
// The chapter strip + an optional claim (name + phone -> member row). Never gates:
// the player already works; claiming just registers the member so the chapter dashboard counts them.
// ChapterBanner and ClaimModal were DELETED here.
//
// The banner repeated what the chapter header now says in type (chapter, school, course code),
// and its "Claim your free access" modal was the only thing that opened ClaimModal. Member
// attribution did not go with them — it moved to the "Start Exam 1 free" press, which is the
// same signal without a form in front of the free product.

// ---- SECTION RHYTHM — a quiet 1px breath between major sections (my-12 → ~96px gap) --------------
function SectionDivider() {
  return <div aria-hidden className="mx-auto my-12 h-px w-full max-w-[200px]" style={{ background: "rgba(245,239,230,0.08)" }} />;
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
const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: "Cram Exam 1 Free", href: "#exam1" },
  { label: "Reviews", href: "#reviews" },
  { label: "Meet your tutor", href: "#lee" },
  { label: "Contact", href: "#contact" },
];

export function Footer() {
  return (
    <footer id="site-footer" className="border-t pt-8 pb-6 sm:pt-10 sm:pb-8" style={{ borderColor: "rgba(245,239,230,0.1)", fontFamily: BRAND_SANS }}>
      {/* PASS 6 — three columns instead of one tall centred stack. The old footer ran ~3 screens of
          scrolling on a phone to say four things; a student who reached the bottom looking for a
          phone number had to scroll past the whole nav to find it. Columns also let the "reach
          Lee" block sit at the same level as navigation rather than above it, which is what it
          actually is: one option among several, not a headline. */}
      <div className="mx-auto grid max-w-[1040px] gap-6 px-5 sm:grid-cols-3 sm:gap-8">

        {/* COLUMN 1 — brand. Hidden below sm: the header already shows the wordmark a swipe away,
            and this tagline is repeated VERBATIM in the bottom row, so on a phone the two would sit
            a few hundred pixels apart saying the same sentence twice. */}
        <div className="hidden sm:block">
          {/* FitWordmark hard-centres (alignItems: "center") because that is right in a navbar.
              In a footer COLUMN it put the mark 83px right of the tagline under it and out of line
              with NAVIGATE / REACH LEE. The component spreads `style` last, so overriding the
              alignment is the whole fix — no wrapper, and the navbar lockup is untouched. */}
          <FitWordmark size={54} style={{ alignItems: "flex-start" }} />
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Cram what&apos;s on your exam.</p>
        </div>

        {/* COLUMN 2 — navigate */}
        <nav>
          <p className="mb-2 hidden text-[11px] font-black uppercase sm:block" style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}>Navigate</p>
          <ul className="space-y-1.5">
            {FOOTER_LINKS.map((it) => (
              <li key={it.label}>
                <a href={it.href} className="text-[13.5px] font-semibold transition-colors hover:text-[var(--accent)]" style={{ color: "var(--brand-cream)" }}>{it.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        {/* COLUMN 3 — reach Lee. The ghost bolt that used to boil behind this block is gone: at
            column width it was a texture nobody could read as a bolt. */}
        <div id="contact" className="scroll-mt-16">
          <p className="mb-2 hidden text-[11px] font-black uppercase sm:block" style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}>Reach Lee</p>
          <p className="text-[13px] font-bold" style={{ color: "var(--brand-cream)" }}>Questions? Text me — I read every message myself.</p>
          <a href={`sms:${TEL}`} className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-black" style={{ background: "var(--accent)", color: "#0B1220" }}>
            <MessageCircle className="h-4 w-4" /> Text Lee {PHONE}
          </a>
          <a href="/chapters" className="mt-3 flex flex-col transition-colors hover:text-[var(--accent)]" style={{ color: "var(--brand-cream)" }}>
            <span className="text-[13.5px] font-semibold">For Fraternities &amp; Sororities</span>
            <span className="text-[11.5px] font-bold" style={{ color: "var(--accent)" }}>⚡ Boost chapter GPAs</span>
          </a>
        </div>
      </div>

      {/* BOTTOM ROW — full width, centred. Text and ORDER unchanged: the memorial line is the last
          thing on the page and stays that way. */}
      <div className="mx-auto mt-6 flex max-w-[1040px] flex-col items-center gap-1 border-t px-5 pt-5 text-center sm:mt-9 sm:gap-1.5 sm:pt-6" style={{ borderColor: "rgba(245,239,230,0.08)" }}>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>surviveaccounting.com · Cram what&apos;s on your exam.</p>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>© 2026 Earned Wisdom LLC</p>
        <p className="text-[11.5px] italic" style={{ color: "rgba(245,239,230,0.42)", letterSpacing: "0.01em" }}>In memory of Ben Ingram, 1993–2017</p>
      </div>
    </footer>
  );
}


