// LANDING (preview) — the surviveaccounting.com rebuild in the intro-frame design language:
// navy/cream, boiling bolt, orbital background, one page, no nav bar. Built as a NEW route so the
// live homepage is untouched; promote to "/" (index.tsx) when approved.
//
// Free Exam-1 block reads fetchStudentTree (same server gate students hit — only status='live'
// sets, free playback resolved, paid withheld) and plays on the page via the shared HLS player +
// silent IntroSting pre-roll. Picking a school recolors the bolt (full takeover on the first pick
// this visit, a short beat after) and flips the campus status strip once a map exists (campus_exams,
// 0105). No checkout exists yet — paid exams show topics + a mapping-gated line, not purchasable.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, GraduationCap, Instagram, MessageCircle, Plus, Search, X, Youtube } from "lucide-react";

import { fetchStudentTree, type StudentSet, type StudentTopic } from "@/lib/student.functions";
import { listCampusExams } from "@/lib/campus-exams.functions";
import { getChapterNames, listCampusIntroCodes, listDefaultExamUnits } from "@/lib/default-map.functions";
import { logSchoolDemand, submitExamAsk, submitSyllabus } from "@/lib/syllabus.functions";
import { searchOrderProfessors, type ProfessorLite } from "@/lib/orders.functions";
import { claimChapterAccess } from "@/lib/greek-chapters.functions";
import { fetchCourseOptions } from "@/lib/je-api";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { BoltBoil, SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { Bolt, BRAND_BLUE, BRAND_DISPLAY, BRAND_RED, BRAND_SANS, SEC_SCHOOLS } from "@/components/canvas/brand";

export const Route = createFileRoute("/landing")({
  head: () => ({ meta: [{ title: "⚡ Survive Accounting — Only what's on your exam" }, { name: "robots", content: "noindex" }] }),
  component: LandingPage,
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
const PAGE_NAVY = "#111A32";
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

export function LandingPage({ initialCampusId, chapterBanner, chapterSlug }: { initialCampusId?: string; chapterBanner?: string; chapterSlug?: string } = {}) {
  // /c/<slug> pre-selects the chapter's school. If it's one of the 16 SEC schools we pre-pick it;
  // otherwise we drop into "not listed" (default map) so the player still unblurs and plays.
  const preSchool = useMemo(() => (initialCampusId ? SCHOOLS.find((s) => s.campusId === initialCampusId) ?? null : null), [initialCampusId]);
  const [school, setSchool] = useState<School | null>(preSchool);
  // "My school isn't listed" — unblur with the DEFAULT map + brand navy (no school colors), plus an
  // optional "what school?" demand field. Everything else behaves like an unmapped-campus session.
  const [notListed, setNotListed] = useState(!!initialCampusId && !preSchool);
  const [theater, setTheater] = useState<{ school: School; mode: "full" | "short" } | null>(null);
  const firstPick = useRef(false);
  // A single monotonic "pulse" the Try-Exam-1 CTA bumps: scrolls to the player and rings the gate
  // picker once (no loop). The gated CampusSelector reacts to the change; nothing else does.
  const [pickerPulse, setPickerPulse] = useState(0);
  // Try-Exam-1: scroll to the player, ring the gate picker (if no school), and bump focusSignal so
  // the player opens the first topic + starts playback when a school IS already picked.
  const [focusSignal, setFocusSignal] = useState(0);
  const onTryFree = () => { document.getElementById("exam1")?.scrollIntoView({ behavior: "smooth" }); setPickerPulse((p) => p + 1); setFocusSignal((f) => f + 1); };
  const [syllabusOpen, setSyllabusOpen] = useState(false);
  // Professor rung (confidence ladder step 2) — session-persisted; personalizes labels only, never gates.
  const [professor, setProfessor] = useState<ProfessorLite | null>(() => { try { const s = sessionStorage.getItem("sa-landing-prof"); return s ? (JSON.parse(s) as ProfessorLite) : null; } catch { return null; } });
  const pickProfessor = (p: ProfessorLite | null) => { setProfessor(p); try { if (p) sessionStorage.setItem("sa-landing-prof", JSON.stringify(p)); else sessionStorage.removeItem("sa-landing-prof"); } catch { /* ignore */ } };

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

  const treeQ = useQuery({ queryKey: ["landing-tree", school?.campusId ?? null], queryFn: () => fetchStudentTree({ data: school ? { campusId: school.campusId } : {} }), networkMode: "always", staleTime: 300_000 });
  const intro1 = useMemo(() => (treeQ.data ?? []).find((c) => c.family === "intro_1" || c.name.trim().toLowerCase() === "intro 1") ?? null, [treeQ.data]);

  // Intro-1 course id from the canonical `courses` table — the SAME source the campus map was
  // created under (the outline). Decoupled from fetchStudentTree, which only returns courses that
  // have LIVE sets, so mapped-detection works even before any Intro-1 video is published.
  const courseOptQ = useQuery({ queryKey: ["landing-courses"], queryFn: () => fetchCourseOptions(), staleTime: 600_000, networkMode: "always" });
  const intro1CourseId = useMemo(() => {
    const cs = courseOptQ.data ?? [];
    return (cs.find((c) => c.course_family === "intro_1") ?? cs.find((c) => (c.course_name ?? "").trim().toLowerCase() === "intro 1"))?.id ?? null;
  }, [courseOptQ.data]);

  const mappedQ = useQuery({
    queryKey: ["landing-mapped", school?.campusId ?? null, intro1CourseId],
    queryFn: async () => { try { return await listCampusExams({ data: { campus_id: school!.campusId, course_id: intro1CourseId! } }); } catch { return []; } },
    enabled: !!school && !!intro1CourseId, networkMode: "always",
  });
  const mapped = (mappedQ.data ?? []).some((e) => e.status === "active");

  // Real-map plumbing: chapter(id→name/number) from the canonical courses table, live sets by
  // chapter id from the student tree, and the campus's exams (num + ordered chapter ids).
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
  const mappedExams = useMemo(() => (mappedQ.data ?? []).filter((e) => e.status === "active").map((e) => {
    const d = e.name.replace(/\D/g, "");
    return { num: d ? parseInt(d, 10) : (/final|review/i.test(e.name) ? 99 : 999), chapterIds: e.chapter_ids, coverage: e.coverage_pct ?? 80 };
  }), [mappedQ.data]);
  const coverageByNum = useMemo(() => new Map(mappedExams.map((e) => [e.num, e.coverage])), [mappedExams]);

  // Default map (0106) — used for the Exam-1 player when a campus is unmapped (Foundations order).
  const defaultMapQ = useQuery({ queryKey: ["landing-default-map"], queryFn: () => listDefaultExamUnits(), staleTime: 600_000, networkMode: "always" });
  const defaultUnits = defaultMapQ.data ?? [];

  // Every chapter id any exam references (map + default), resolved to names DIRECTLY from the
  // chapters table — immune to course de-dup, so a mapped topic never shows a bare "Topic".
  const allTopicIds = useMemo(() => { const s = new Set<string>(); mappedExams.forEach((e) => e.chapterIds.forEach((id) => s.add(id))); defaultUnits.forEach((u) => s.add(u.unit_id)); return [...s]; }, [mappedExams, defaultUnits]);
  const namesQ = useQuery({ queryKey: ["landing-chapter-names", allTopicIds], queryFn: () => getChapterNames({ data: { ids: allTopicIds } }), enabled: allTopicIds.length > 0, networkMode: "always", staleTime: 600_000 });
  const nameById = useMemo(() => { const m = new Map<string, { name: string; number: number | null }>(); for (const r of namesQ.data ?? []) m.set(r.id, { name: r.name, number: r.number }); return m; }, [namesQ.data]);

  // Resolve an exam's topic LIST strictly from the MAP: campus exam map (if mapped) → default map →
  // static. It must NEVER list the whole course — the old fallback pulled intro1.units[0]/intro1.topics
  // (every chapter, incl. Exam-2/3 topics like "Long Term Liabilities") whenever a map wasn't found,
  // which is exactly the bug. Live free sets still attach per chapter id via the student tree
  // (treeTopicById), so free content is never gated by mapping — only the LIST comes from the map.
  const resolveExam = (num: number, statics: string[]): ResolvedTopic[] => {
    const m = mappedExams.find((e) => e.num === num);
    const ids = m ? m.chapterIds : defaultUnits.filter((u) => u.exam_number === num).map((u) => u.unit_id);
    if (ids.length) return ids.map((cid) => { const nm = nameById.get(cid), ch = chapterById.get(cid), st = treeTopicById.get(cid); return { key: cid, name: nm?.name ?? ch?.name ?? st?.name ?? "Topic", num: nm?.number ?? ch?.number ?? st?.number ?? null, sets: (st?.sets ?? []).filter((s) => s.access !== "paid") }; });
    return statics.map((n) => ({ key: n, name: n, num: null, sets: [] }));
  };
  const exam1R = useMemo(() => resolveExam(1, STATIC_EXAM1), [mappedExams, defaultUnits, nameById, chapterById, treeTopicById]);
  const exam2R = useMemo(() => resolveExam(2, STATIC_EXAM2), [mappedExams, defaultUnits, nameById, chapterById, treeTopicById]);
  const exam3R = useMemo(() => resolveExam(3, STATIC_EXAM3), [mappedExams, defaultUnits, nameById, chapterById, treeTopicById]);
  const finalR = useMemo(() => resolveExam(99, STATIC_FINAL), [mappedExams, defaultUnits, nameById, chapterById, treeTopicById]);
  const exams = useMemo<ExamTab[]>(() => [
    { num: 1, label: "Exam 1", price: null, topics: exam1R, coveragePct: coverageByNum.get(1) ?? 80 },
    { num: 2, label: "Exam 2", price: 50, topics: exam2R, coveragePct: coverageByNum.get(2) ?? 80 },
    { num: 3, label: "Exam 3", price: 50, topics: exam3R, coveragePct: coverageByNum.get(3) ?? 80 },
    { num: 99, label: "Final", price: 50, topics: finalR, coveragePct: coverageByNum.get(99) ?? 80 },
  ], [exam1R, exam2R, exam3R, finalR, coverageByNum]);

  const pickSchool = (s: School) => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setNotListed(false);
    setSchool(s);
    if (reduce) return; // instant swap, no takeover
    const mode = firstPick.current ? "short" : "full";
    firstPick.current = true;
    setTheater({ school: s, mode });
  };

  return (
    <div style={{ ...frameThemeVars(theme), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <style>{`
        @keyframes sa-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .sa-marquee-track { animation: sa-marquee 42s linear infinite; }
        .sa-marquee:hover .sa-marquee-track { animation-play-state: paused; }
        @keyframes sa-picker-pulse { 0% { box-shadow: 0 0 0 0 rgba(252,163,17,0.55); } 70% { box-shadow: 0 0 0 16px rgba(252,163,17,0); } 100% { box-shadow: 0 0 0 0 rgba(252,163,17,0); } }
      `}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.34} animate /></div>

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px" }}>
        {chapterBanner && <ChapterBanner name={chapterBanner} slug={chapterSlug} />}
        <Hero onTryFree={onTryFree} />
        <ExamPlayer exams={exams} school={school} onPick={pickSchool} pickerPulse={pickerPulse} focusSignal={focusSignal} schools={schoolsWithCodes} mapped={mapped} onSyllabus={() => setSyllabusOpen(true)} professor={professor} onPickProfessor={pickProfessor} notListed={notListed} onNotListed={() => setNotListed(true)} theater={theater} onTheaterDone={() => setTheater(null)} />
        <SectionDivider />
        <TestimonialsSlider />
        <SectionDivider />
        <LeeSection />
        <SectionDivider />
        <Footer onSyllabus={() => setSyllabusOpen(true)} />
      </main>

      {syllabusOpen && <SyllabusModal school={school} onClose={() => setSyllabusOpen(false)} />}
      <FloatingPill />
    </div>
  );
}

// ---- HERO — wordmark, tagline, CTA, subhead, school ticker. No picker (the ONE picker lives in the
// player gate); the marquee answers "is this for my school?", the gate converts it.
function Hero({ onTryFree }: { onTryFree: () => void }) {
  return (
    <section className="flex flex-col items-center pt-16 pb-8 text-center sm:pt-24">
      <SurviveWordmark size={92} />
      <h1 className="mt-6 text-[26px] font-black sm:text-[34px]" style={{ letterSpacing: "-0.01em" }}>Only what's on your exam.</h1>
      <button onClick={onTryFree} className="mt-7 inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-[15.5px] font-black transition-transform hover:scale-[1.03]" style={{ background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}>
        Try Exam 1 Free ⚡
      </button>
      <p className="mt-5 max-w-xl text-[15px] leading-relaxed sm:text-[17px]" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
        Get cram videos for Intro Financial Accounting — built for your school's exams.
      </p>
    </section>
  );
}

// Slow marquee of SEC school names in build-priority order. Muted, pausable on hover; reduced-motion
// collapses to a static first-three line. Track duplicates the row and slides -50% for a seamless loop.
function SchoolTicker() {
  const reduce = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  if (reduce) {
    return <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Ole Miss · LSU · Alabama · +13 SEC schools · + your school</p>;
  }
  const row = SCHOOLS.map((s) => s.name).join(" · ") + " · + your school";
  return (
    <div className="sa-marquee mt-3 w-full max-w-md overflow-hidden" style={{ WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)", maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)" }}>
      <div className="sa-marquee-track whitespace-nowrap text-[12.5px]" style={{ display: "inline-block", color: "var(--text-muted)" }}>
        <span>{row}</span>
        <span aria-hidden>{" · " + row + " · "}</span>
      </div>
    </div>
  );
}

// ---- CAMPUS SELECTOR -------------------------------------------------------------------------
// `schools` overrides the static list (so a code-enriched list from the dropdown payload can be
// passed in). `pulse` bumps → a one-shot attention ring; with `openOnPulse` it also opens.
export function CampusSelector({ school, onPick, schools = SCHOOLS, pulse, openOnPulse, onNotListed }: { school: School | null; onPick: (s: School) => void; schools?: School[]; pulse?: number; openOnPulse?: boolean; onNotListed?: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [ring, setRing] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstPulse = useRef(true);
  // The dropdown renders in a PORTAL (position: fixed) so it can't be clipped by the player's
  // overflow-hidden — the full school list must be scannable. Anchored to the button's rect.
  const place = () => { const r = btnRef.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 8, width: r.width }); };
  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => { const t = e.target as Node; if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false); };
    const reflow = () => place();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("resize", reflow);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("scroll", reflow, true); window.removeEventListener("resize", reflow); };
  }, [open]);
  useEffect(() => {
    if (pulse == null) return;
    if (firstPulse.current) { firstPulse.current = false; return; } // ignore initial mount
    setRing(true);
    if (openOnPulse) setOpen(true);
    const t = window.setTimeout(() => setRing(false), 950);
    return () => window.clearTimeout(t);
  }, [pulse, openOnPulse]);
  const results = schools.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-transform hover:scale-[1.01]"
        style={{ background: "rgba(245,239,230,0.06)", border: `2px solid ${school ? "var(--bolt-primary)" : "var(--accent)"}`, boxShadow: "0 20px 55px -22px rgba(0,0,0,0.7)", animation: ring ? "sa-picker-pulse 0.9s ease" : undefined, borderRadius: 16 }}
      >
        <GraduationCap className="h-6 w-6 shrink-0" style={{ color: "var(--accent)" }} />
        <span className="min-w-0 flex-1 text-[17px] font-bold" style={{ color: "var(--brand-cream)" }}>{school ? school.name : "Pick your school"}</span>
        <ChevronDown className="h-5 w-5 shrink-0 opacity-70" />
      </button>
      {open && rect && typeof document !== "undefined" && createPortal(
        // The portal renders at document.body, OUTSIDE the themed landing root — so re-declare the
        // theme CSS vars here, or every var(--brand-cream)/accent inside would be undefined (dark text).
        <div ref={menuRef} className="fixed z-[220] overflow-hidden rounded-xl" style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), left: rect.left, top: rect.top, width: rect.width, background: "#0B1220", border: "1px solid rgba(245,239,230,0.14)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)" }}>
          <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
            <Search className="h-4 w-4 opacity-50" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 16 SEC schools…" className="w-full bg-transparent text-[14px] outline-none" style={{ color: "var(--brand-cream)" }} />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {results.length === 0 && <div className="px-4 py-3 text-[13px] italic" style={{ color: "var(--text-muted)" }}>No SEC school by that name.</div>}
            {results.map((s) => { const c = boltFor(s.id); return (
              <button key={s.id} onClick={() => { onPick(s); setOpen(false); setQ(""); }} className="group flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/10">
                <span className="grid h-6 w-4 shrink-0 place-items-center"><Bolt c1={c.c1} c2={c.c2} /></span>
                <span className="flex-1 text-[14.5px] font-semibold group-hover:text-[var(--accent)]" style={{ color: "#F5EFE6" }}>{s.name}</span>
                {s.codeVerified && s.code && <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: "rgba(245,239,230,0.65)" }}>{s.code}</span>}
              </button>
            ); })}
            {onNotListed && (
              <button onClick={() => { onNotListed(); setOpen(false); setQ(""); }} className="flex w-full items-center gap-3 border-t px-4 py-2.5 text-left hover:bg-white/10" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
                <span className="flex-1 text-[13.5px] font-semibold" style={{ color: "var(--accent)" }}>My school isn't listed →</span>
              </button>
            )}
          </div>
        </div>, document.body)}
    </div>
  );
}

// ---- SYLLABUS MODAL — drag/drop file(s) + email → Supabase (bucket + table). Two inputs, no
// redirect. All "Send your syllabus" CTAs open this. Files post as base64 to the submitSyllabus fn.
type PendingFile = { name: string; type: string; dataUrl: string; size: number };
const ACCEPT = ".pdf,.doc,.docx,image/*";
function SyllabusModal({ school, onClose }: { school: School | null; onClose: () => void }) {
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
            <p className="mb-3 text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>Syllabus, study guides, old homework, notes — the more you send, the tighter I can match your exam. I review every submission myself.</p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-xl px-4 py-6 text-center transition-colors"
              style={{ border: `2px dashed ${drag ? "var(--accent)" : "rgba(245,239,230,0.25)"}`, background: drag ? "rgba(252,163,17,0.08)" : "rgba(245,239,230,0.03)" }}
            >
              <p className="text-[13.5px] font-semibold" style={{ color: "var(--brand-cream)" }}>Drag files here, or click to browse</p>
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
type ExamTab = { num: number; label: string; price: number | null; topics: ResolvedTopic[]; coveragePct: number };
const RELEASE_LABEL = "Opens soon"; // no release-date field in the data yet — placeholder for paid tabs
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
  if (hrs > 0) parts.push(`${hrs.toFixed(1)} hrs of video`);
  return parts.join(" · ");
};

function ExamPlayer({ exams, school, onPick, pickerPulse, focusSignal, schools, mapped, onSyllabus, professor, onPickProfessor, notListed, onNotListed, theater, onTheaterDone }: { exams: ExamTab[]; school: School | null; onPick: (s: School) => void; pickerPulse: number; focusSignal: number; schools: School[]; mapped: boolean; onSyllabus: () => void; professor: ProfessorLite | null; onPickProfessor: (p: ProfessorLite | null) => void; notListed: boolean; onNotListed: () => void; theater: { school: School; mode: "full" | "short" } | null; onTheaterDone: () => void }) {
  const [activeNum, setActiveNum] = useState(1);
  const [selById, setSelById] = useState<Record<number, Sel>>({});
  const [openTopics, setOpenTopics] = useState<Set<string>>(() => new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = exams.find((e) => e.num === activeNum) ?? exams[0];
  const isPaid = active.price != null;
  const gated = !school && !notListed; // "not listed" unblurs with the default map + brand navy
  const live = !!school || notListed; // school-like session (mapped campus OR "not listed")

  // TWO-SET EMAIL ASK — a set counts as completed at >=90% watched. After the 2nd distinct set, show
  // one quiet inline card (persist dismissal). The ONLY proactive email ask in the free flow.
  const [completedSets, setCompletedSets] = useState<Set<string>>(() => new Set());
  const [askDone, setAskDone] = useState(() => { try { return localStorage.getItem("sa-two-set-ask") === "done"; } catch { return false; } });
  const markComplete = (id: string) => setCompletedSets((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  const finishAsk = () => { setAskDone(true); try { localStorage.setItem("sa-two-set-ask", "done"); } catch { /* ignore */ } };
  const showAsk = !!school && completedSets.size >= 2 && !askDone;

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

  // On school pick / Try-Exam-1 (focusSignal): jump to Exam 1 and, ONLY if a live set exists,
  // persist it (autoplay) + open its topic. Never persist a poster default — that would freeze a
  // stale first topic before the campus map reorders; the fresh defaultSel handles display instead.
  useEffect(() => {
    if (!school) return;
    setActiveNum(1);
    const live = firstLiveSel(exams[0]);
    if (live) { setSelById((p) => ({ ...p, 1: live })); setOpenTopics((p) => new Set(p).add(live.topicKey)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id, focusSignal]);
  // Keep the active selection's topic open when the tab changes.
  useEffect(() => {
    if (cur) setOpenTopics((p) => (p.has(cur.topicKey) ? p : new Set(p).add(cur.topicKey)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.num]);

  const pickSet = (topicKey: string, setId: string | null) => { setSelById((p) => ({ ...p, [active.num]: { topicKey, setId } })); setDrawerOpen(false); };
  const toggleTopic = (k: string) => setOpenTopics((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <section id="exam1" className="scroll-mt-6">
      <div className="relative overflow-hidden rounded-2xl" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(252,163,17,0.45)" }}>
        <ExamTabs exams={exams} activeNum={activeNum} onSelect={(n) => { setActiveNum(n); setDrawerOpen(false); }} />

        {/* stats line — computed from data, updates as sets go live */}
        <div className="border-b px-3 py-1.5 text-center text-[11px] font-semibold tracking-wide" style={{ borderColor: "rgba(245,239,230,0.1)", color: "var(--text-muted)", background: "rgba(0,0,0,0.12)" }}>{examStats(active)}</div>

        {/* gap meter — per exam (mapped, unmapped, or "not listed"); % is a manual mapper field (default 80) */}
        {live && (
          <button onClick={onSyllabus} className="w-full border-b px-3 py-1.5 text-center text-[11.5px] hover:bg-white/5" style={{ borderColor: "rgba(245,239,230,0.1)", color: "var(--brand-cream)" }}>
            Covering <b>~{active.coveragePct}%</b> of {professor ? `Prof. ${professor.last || professor.name}'s` : "a typical"} {active.label} — <span className="font-bold" style={{ color: "var(--accent)" }}>help me get the rest →</span>
          </button>
        )}

        {/* "My school isn't listed" — one optional demand field (skippable), logged with a timestamp */}
        {notListed && <SchoolDemandField />}

        {/* professor rung (skippable) — school sessions only (needs a campusId for the picker) */}
        {school && <ProfessorRung campusId={school.campusId} code={school.codeVerified && school.code ? school.code : null} professor={professor} onPick={onPickProfessor} />}

        {/* mobile-only drawer toggle for the outline */}
        <button onClick={() => setDrawerOpen((v) => !v)} className="flex w-full items-center justify-between border-b px-3 py-2 text-[12px] font-bold uppercase tracking-wide sm:hidden" style={{ borderColor: "rgba(245,239,230,0.1)", color: "var(--brand-cream)", background: "rgba(0,0,0,0.2)" }}>
          <span>Common Exam Questions</span><span style={{ color: "var(--accent)" }}>{drawerOpen ? "Hide ▴" : "Browse ▾"}</span>
        </button>

        <div className="sm:flex">
          <div className={`${drawerOpen ? "block" : "hidden"} border-b sm:block sm:w-[42%] sm:max-w-[360px] sm:border-b-0 sm:border-r`} style={{ borderColor: "rgba(245,239,230,0.1)" }}>
            <ExamOutline tab={active} isPaid={isPaid} curSetId={curSet?.id ?? null} curTopicKey={cur?.topicKey ?? null} openTopics={openTopics} onToggleTopic={toggleTopic} onPickSet={pickSet} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative w-full" style={{ aspectRatio: "16 / 9", background: "#000" }}>
              {gated ? (
                <>
                  <div className="absolute inset-0" style={{ filter: "blur(9px)", transform: "scale(1.06)", opacity: 0.65 }} aria-hidden><Poster school={null} topicName="Exam 1" queued={false} /></div>
                  <div className="absolute inset-0 grid place-items-center px-5" style={{ background: "rgba(11,18,32,0.6)" }}>
                    <div className="flex w-full max-w-sm flex-col items-center gap-3">
                      <p className="text-center text-[16px] font-black sm:text-[18px]" style={{ color: "var(--brand-cream)" }}>Pick your school to start</p>
                      <div className="w-full"><CampusSelector school={null} onPick={onPick} schools={schools} pulse={pickerPulse} openOnPulse onNotListed={onNotListed} /></div>
                      {/* ticker answers "is my school here?" right at the moment of the question */}
                      <SchoolTicker />
                    </div>
                  </div>
                </>
              ) : curSet?.playbackId ? (
                <HeroVideo key={curSet.playbackId} playbackId={curSet.playbackId} onComplete={() => markComplete(curSet!.id)} />
              ) : (
                <Poster school={school} topicName={curTopic?.name ?? active.label} queued={!isPaid && !!curTopic} />
              )}
            </div>

            {/* Two sets down — the ONLY proactive email ask in the free flow (quiet inline card). */}
            {showAsk && <TwoSetAsk school={school} professor={professor} onDone={finishAsk} />}

            {/* Unmapped campus / "not listed": Exam 1 still plays (default map); offer to tailor. */}
            {((school && !mapped) || notListed) && (
              <div className="border-t px-3 py-2 text-center" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
                <button onClick={onSyllabus} className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Help me tailor this to your exact course — <span className="font-bold" style={{ color: "var(--accent)" }}>Send your syllabus</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* school-select takeover — SCOPED to the player frame (absolute, clipped by the card) */}
        {theater && <Theater school={theater.school} mode={theater.mode} onDone={onTheaterDone} />}
      </div>
    </section>
  );
}

function ExamTabs({ exams, activeNum, onSelect }: { exams: ExamTab[]; activeNum: number; onSelect: (n: number) => void }) {
  return (
    <div className="flex items-stretch" style={{ background: "rgba(0,0,0,0.22)" }}>
      {exams.map((e) => {
        const on = e.num === activeNum; const paid = e.price != null;
        return (
          <button key={e.num} onClick={() => onSelect(e.num)} className="flex-1 px-1 py-2.5 text-center transition-opacity" style={{ borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, opacity: on ? 1 : paid ? 0.5 : 0.8 }}>
            <span className="block text-[11.5px] font-black uppercase tracking-wide" style={{ color: on ? "var(--accent)" : "var(--brand-cream)" }}>{e.label}</span>
            <span className="block text-[9.5px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{paid ? `$${e.price}` : "Free"}</span>
          </button>
        );
      })}
    </div>
  );
}

function ExamOutline({ tab, isPaid, curSetId, curTopicKey, openTopics, onToggleTopic, onPickSet }: { tab: ExamTab; isPaid: boolean; curSetId: string | null; curTopicKey: string | null; openTopics: Set<string>; onToggleTopic: (k: string) => void; onPickSet: (topicKey: string, setId: string | null) => void }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [curSetId, curTopicKey]);
  return (
    <div className="max-h-[300px] overflow-y-auto p-3 sm:max-h-[380px]">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: "var(--brand-cream)" }}>Common Exam Questions</span>
        {isPaid && <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>{RELEASE_LABEL}</span>}
      </div>
      {tab.topics.map((t) => (
        <TopicRow key={t.key} topic={t} isPaid={isPaid} price={tab.price} open={openTopics.has(t.key)} onToggle={() => onToggleTopic(t.key)} curSetId={curSetId} curTopicKey={curTopicKey} activeRef={activeRef} onPickSet={onPickSet} />
      ))}
    </div>
  );
}

function TopicRow({ topic, isPaid, price, open, onToggle, curSetId, curTopicKey, activeRef, onPickSet }: { topic: ResolvedTopic; isPaid: boolean; price: number | null; open: boolean; onToggle: () => void; curSetId: string | null; curTopicKey: string | null; activeRef: RefObject<HTMLButtonElement | null>; onPickSet: (topicKey: string, setId: string | null) => void }) {
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
          {topic.sets.map((s) => <SetRow key={s.id} set={s} isPaid={isPaid} price={price} active={s.id === curSetId} activeRef={activeRef} onPick={() => onPickSet(topic.key, s.id)} />)}
        </div>
      )}
    </div>
  );
}

// The set row is the product shelf: name written like a menu item + "N CEQs" (+ runtime when known).
function SetRow({ set, isPaid, price, active, activeRef, onPick }: { set: StudentSet; isPaid: boolean; price: number | null; active: boolean; activeRef: RefObject<HTMLButtonElement | null>; onPick: () => void }) {
  const [tip, setTip] = useState(false);
  const live = !!set.playbackId;
  const meta = `${set.ceqCount} CEQ${set.ceqCount === 1 ? "" : "s"}${set.runtimeSec ? ` · ${fmtRuntime(set.runtimeSec)}` : ""}`;
  const onClick = () => { if (isPaid) { setTip(true); window.setTimeout(() => setTip(false), 1800); return; } onPick(); };
  return (
    <button ref={active ? activeRef : undefined} onClick={onClick} className="relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5" style={{ background: active ? "rgba(252,163,17,0.12)" : "transparent", opacity: isPaid ? 0.6 : live ? 1 : 0.7 }}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold" style={{ color: active ? "var(--accent)" : "var(--brand-cream)" }}>{set.name}</span>
        <span className="block text-[10.5px]" style={{ color: "var(--text-muted)" }}>{meta}{!live && !isPaid ? " · coming" : ""}</span>
      </span>
      {live && !isPaid && <span className="shrink-0 text-[11px]" style={{ color: "var(--accent)" }}>▶</span>}
      {isPaid && tip && <span className="absolute right-2 top-full z-20 mt-1 whitespace-nowrap rounded px-2 py-1 text-[10.5px] font-bold" style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.2)", color: "var(--brand-cream)" }}>Opens soon — ${price}</span>}
    </button>
  );
}

// "My school isn't listed" demand field — one optional free-text input, skippable, logged with a
// timestamp so Lee sees where to expand next. Never blocks the session.
function SchoolDemandField() {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const submit = async () => { const t = text.trim(); if (t) { try { await logSchoolDemand({ data: { text: t } }); } catch { /* ignore */ } } setDone(true); };
  if (done) return <div className="border-b px-3 py-1.5 text-center text-[11px]" style={{ borderColor: "rgba(245,239,230,0.1)", color: "var(--text-muted)" }}>Thanks — noted. Enjoy Exam 1, free.</div>;
  return (
    <div className="flex flex-col gap-1.5 border-b px-3 py-2 sm:flex-row sm:items-center" style={{ borderColor: "rgba(245,239,230,0.1)", background: "rgba(0,0,0,0.12)" }}>
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>What school? <span className="opacity-70">(helps me decide where to expand next)</span></span>
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} placeholder="Your school…" className="min-w-0 flex-1 rounded-lg px-3 py-1 text-[12.5px] outline-none" style={{ background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
      <button onClick={() => void submit()} className="shrink-0 rounded-lg px-3 py-1 text-[12px] font-bold" style={{ background: "var(--accent)", color: "#0B1220" }}>Send</button>
      <button onClick={() => setDone(true)} className="shrink-0 text-[10.5px]" style={{ color: "var(--text-muted)" }}>skip</button>
    </div>
  );
}

// Professor rung (confidence ladder step 2) — a small skippable picker after school selection. On
// select, "Prof. [name] · [code]" locks top-left. Never gates content — labels + gap meter only.
function ProfessorRung({ campusId, code, professor, onPick }: { campusId: string; code: string | null; professor: ProfessorLite | null; onPick: (p: ProfessorLite | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [skipped, setSkipped] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const profQ = useQuery({ queryKey: ["landing-profs", campusId, q], queryFn: () => searchOrderProfessors({ data: { campusId, q } }), enabled: open, networkMode: "always", staleTime: 120_000 });
  useEffect(() => { if (!open) return; const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc); }, [open]);

  if (professor) {
    return (
      <div className="flex items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: "rgba(245,239,230,0.1)", background: "rgba(0,0,0,0.12)" }}>
        <span className="text-[11.5px] font-bold" style={{ color: "var(--brand-cream)" }}>Prof. {professor.last || professor.name}{code ? ` · ${code}` : ""}</span>
        <button onClick={() => onPick(null)} className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>change</button>
      </div>
    );
  }
  if (skipped) return null;
  const results = profQ.data ?? [];
  return (
    <div ref={ref} className="relative border-b px-3 py-1.5" style={{ borderColor: "rgba(245,239,230,0.1)", background: "rgba(0,0,0,0.12)" }}>
      <div className="flex items-center gap-2">
        <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Who's your professor?</span>
        <button onClick={() => setOpen((v) => !v)} className="text-[11.5px] font-bold" style={{ color: "var(--accent)" }}>{open ? "close" : "pick →"}</button>
        <button onClick={() => setSkipped(true)} className="ml-auto text-[10.5px]" style={{ color: "var(--text-muted)" }}>skip</button>
      </div>
      {open && (
        <div className="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-lg" style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.14)", boxShadow: "0 20px 50px -16px rgba(0,0,0,0.85)" }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your professor…" className="w-full border-b bg-transparent px-3 py-2 text-[13px] outline-none" style={{ borderColor: "rgba(245,239,230,0.1)", color: "var(--brand-cream)" }} />
          <div className="max-h-52 overflow-y-auto py-1">
            {profQ.isLoading && <div className="px-3 py-2 text-[12px] italic" style={{ color: "var(--text-muted)" }}>Loading…</div>}
            {!profQ.isLoading && results.length === 0 && <div className="px-3 py-2 text-[12px] italic" style={{ color: "var(--text-muted)" }}>No professors listed — you can skip.</div>}
            {results.map((p) => (
              <button key={p.id} onClick={() => { onPick(p); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/5" style={{ color: "var(--brand-cream)" }}>{p.name}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// "Two sets down" — a quiet inline email ask (NOT a modal). Stores email + campus + professor to the
// submissions table via submitExamAsk. Shown once, dismissal persisted by ExamPlayer.
function TwoSetAsk({ school, professor, onDone }: { school: School; professor: ProfessorLite | null; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try { await submitExamAsk({ data: { email: email.trim(), campusId: school.campusId, campusName: school.name, professorName: professor ? professor.name : null, source: "two_set_ask" } }); setSent(true); window.setTimeout(onDone, 1400); }
    catch { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-2 border-t px-3 py-3 sm:flex-row sm:items-center" style={{ borderColor: "rgba(245,239,230,0.1)", background: "rgba(252,163,17,0.06)" }}>
      {sent ? (
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--brand-cream)" }}>Got it — I'll be in touch. — Lee</span>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: "var(--brand-cream)" }}>Two sets down. Tell me what your exam covers and I'll make sure you're set.</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="rounded-lg px-3 py-1.5 text-[12.5px] outline-none" style={{ background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)", minWidth: 0 }} />
          <button onClick={send} disabled={!ok || busy} className="shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-black disabled:opacity-40" style={{ background: "var(--accent)", color: "#0B1220" }}>{busy ? "…" : "Send"}</button>
          <button onClick={onDone} className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-muted)" }} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
        </>
      )}
    </div>
  );
}

// Muted autoplay per browser rules; the user unmutes via the native controls. 16:9 only.
// onComplete fires once when the viewer has watched >=90% (the "set completed" signal, Prompt 3).
function HeroVideo({ playbackId, onComplete }: { playbackId: string; onComplete?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    const src = `https://stream.mux.com/${playbackId}.m3u8`;
    let hls: { destroy: () => void } | null = null, cancelled = false;
    if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; }
    else void import("hls.js").then(({ default: Hls }) => { if (cancelled || !ref.current) return; if (Hls.isSupported()) { const h = new Hls(); h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr(true); }); h.loadSource(src); h.attachMedia(ref.current); hls = h; } else ref.current.src = src; }).catch(() => setErr(true));
    v.muted = true; void v.play().catch(() => { /* user can press play */ });
    const onTime = () => { if (!fired.current && v.duration > 0 && v.currentTime / v.duration >= 0.9) { fired.current = true; onComplete?.(); } };
    v.addEventListener("timeupdate", onTime);
    return () => { cancelled = true; v.removeEventListener("timeupdate", onTime); hls?.destroy(); };
  }, [playbackId, onComplete]);
  if (err) return <div className="grid h-full w-full place-items-center text-[12px]" style={{ color: "#F3C6CC" }}>Couldn't load this video. Try again shortly.</div>;
  return <video ref={ref} controls playsInline muted className="h-full w-full" style={{ objectFit: "contain", background: "#000" }} />;
}

function Poster({ school, topicName, queued }: { school: School | null; topicName: string; queued: boolean }) {
  const c = school ? boltFor(school.id) : { c1: BRAND_RED, c2: BRAND_BLUE };
  return (
    <div className="grid h-full w-full place-items-center" style={{ background: "var(--brand-navy)" }}>
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <span className="inline-block h-16 w-11"><Bolt c1={c.c1} c2={c.c2} /></span>
        <span className="rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-wide" style={{ background: "var(--accent)", color: "#0B1220" }}>{topicName}</span>
        {queued && <a href="/order" className="text-[12.5px] font-semibold" style={{ color: "var(--brand-cream)", opacity: 0.9 }}>This one's queued — want it sooner? <span style={{ color: "var(--accent)" }}>Tell me →</span></a>}
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
          <h2 style={{ fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: 20, lineHeight: 1.15, color: "var(--brand-cream)", marginBottom: 16 }}>Why I built Survive Accounting</h2>

          {/* two student voices — heavier, H3-scale (always visible) */}
          <div className="space-y-1.5">
            <h3 style={{ fontWeight: 700, fontSize: 17.5, lineHeight: 1.3, color: "var(--brand-cream)" }}>“My exam looked nothing like my notes.”</h3>
            <h3 style={{ fontWeight: 700, fontSize: 17.5, lineHeight: 1.3, color: "var(--brand-cream)" }}>“I studied for weeks and still failed.”</h3>
          </div>

          {/* collapsible remainder — max-height clip animates height (grid-rows fr transitions are
              unreliable in some engines); reduced-motion skips the animation. 640px comfortably
              clears the content; it's only a ceiling, so the box still sits at its natural height. */}
          <div style={{ overflow: "hidden", maxHeight: open ? 640 : 0, opacity: open ? 1 : 0, transition: reduce ? "none" : "max-height 340ms ease, opacity 260ms ease" }}>
            <div>
              {/* the one headline moment */}
              <p style={{ marginTop: 16, fontWeight: 600, fontSize: 18, color: "var(--brand-cream)" }}>Sound familiar?</p>

              {/* the thesis couplet — own two lines, bold on "about" and "DO" only */}
              <p style={{ marginTop: 14, marginBottom: 16, fontWeight: 400, fontSize: 16, lineHeight: 1.5, color: "var(--brand-cream)" }}>
                Lectures teach you <b style={{ fontWeight: 700 }}>about</b> accounting.<br />
                The exam tests whether you can <b style={{ fontWeight: 700 }}>DO</b> accounting.
              </p>

              <p style={{ fontWeight: 400, fontSize: 15, lineHeight: 1.6, opacity: 0.88 }}>
                This is how my cram videos help. Real exam-style questions, worked start to finish, so
                you're always walking into exams ready to DO the problems, not just understand them.
              </p>

              <p style={{ marginTop: 14, fontWeight: 400, fontSize: 15, lineHeight: 1.6, opacity: 0.88 }}>
                This course is tough, but so are you. Give my Exam 1 videos a try — they're completely
                free.
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
        <span className="mt-0.5 block text-[12px]" style={{ fontWeight: 400, opacity: 0.6, color: "var(--brand-cream)" }}>Ole Miss accounting grad · Tutor since 2015</span>
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
type Testimonial = { name: string; school: string; long: boolean; quote: string; avatar?: string };
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
    return <img src={src} alt={name} onError={() => setBroken(true)} className="h-9 w-9 shrink-0 rounded-full object-cover" style={{ border: "1px solid rgba(245,239,230,0.18)" }} />;
  }
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-black" style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.18)", color: "var(--accent)" }}>{initialsOf(name)}</span>;
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
            <figure key={t.name} className="flex flex-col items-center justify-center px-6 py-10 text-center sm:px-10" style={{ width: `${100 / n}%`, minHeight: 260 }}>
              <span aria-hidden className="mb-1 font-serif leading-none" style={{ color: "var(--brand-cream)", opacity: 0.16, fontSize: 64 }}>“</span>
              <blockquote className="text-[16px] leading-relaxed sm:text-[18px]" style={{ color: "var(--brand-cream)", ...(t.long && !expanded ? { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" } : {}) }}>
                {t.quote}
              </blockquote>
              {t.long && (
                <button onClick={() => { setExpanded((v) => !v); stop(); }} className="mt-2 text-[12.5px] font-semibold" style={{ color: "var(--accent)" }}>{expanded ? "show less" : "+ show more"}</button>
              )}
              <figcaption className="mt-5 flex items-center gap-2.5">
                <TestimonialAvatar name={t.name} src={t.avatar} />
                <span className="text-left">
                  <span className="block text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>{t.name}</span>
                  <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>{t.school}</span>
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

// ---- CHAPTER BANNER + CLAIM (on /c/<slug> links) ---------------------------------------------
// "Free Exam 1, courtesy of [Chapter]" + an optional claim (name + phone → member row). Never gates:
// the player already works; claiming just registers the member so the chapter dashboard counts them.
function ChapterBanner({ name, slug }: { name: string; slug?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl px-4 py-2 text-center text-[13px] font-bold" style={{ background: "rgba(252,163,17,0.12)", border: "1px solid rgba(252,163,17,0.4)", color: "var(--brand-cream)" }}>
        <span>⚡ Free Exam 1, courtesy of {name}</span>
        {slug && <button onClick={() => setOpen(true)} className="rounded-lg px-2.5 py-1 text-[12px] font-black" style={{ background: "var(--accent)", color: "#0B1220" }}>Claim your free access →</button>}
      </div>
      {open && slug && <ClaimModal slug={slug} chapter={name} onClose={() => setOpen(false)} />}
    </>
  );
}

function ClaimModal({ slug, chapter, onClose }: { slug: string; chapter: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const ok = name.trim().length > 1 && phone.replace(/\D/g, "").length >= 10;
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try { await claimChapterAccess({ data: { slug, name: name.trim(), phone: phone.trim() } }); setDone(true); } catch { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[210] grid place-items-center p-4" style={{ background: "rgba(6,10,20,0.72)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.14)", fontFamily: BRAND_SANS }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Claim your free Exam 1</h3>
          <button onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)" }} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {done ? (
          <div className="py-4 text-center">
            <p className="text-[14.5px] font-semibold" style={{ color: "var(--brand-cream)" }}>You're in — courtesy of {chapter}. Enjoy Exam 1, free.</p>
            <button onClick={onClose} className="mt-4 rounded-xl px-5 py-2.5 text-[13.5px] font-black" style={{ background: "var(--accent)", color: "#0B1220" }}>Start studying ⚡</button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Just your name and mobile — no cost, no account.</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="mb-2 w-full rounded-xl px-4 py-2.5 text-[14px] outline-none" style={{ background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Mobile number" className="w-full rounded-xl px-4 py-2.5 text-[14px] outline-none" style={{ background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
            <button onClick={submit} disabled={!ok || busy} className="mt-4 w-full rounded-xl py-3 text-[15px] font-black transition-opacity disabled:opacity-40" style={{ background: "var(--accent)", color: "#0B1220" }}>{busy ? "…" : "Get free access"}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---- SECTION RHYTHM — a quiet 1px breath between major sections (my-12 → ~96px gap) --------------
function SectionDivider() {
  return <div aria-hidden className="mx-auto my-12 h-px w-full max-w-[200px]" style={{ background: "rgba(245,239,230,0.08)" }} />;
}

// Four stacked layers, each on its own row so they collapse cleanly at 360px:
//  1) the text-me moment (a ghost boiling bolt sits behind it), 2) a quiet link row,
//  3) monochrome social icons (placeholders — TODO real hrefs), 4) the baseline + memorial line.
function Footer({ onSyllabus }: { onSyllabus: () => void }) {
  return (
    <footer id="site-footer" className="border-t pt-14 pb-10" style={{ borderColor: "rgba(245,239,230,0.1)", fontFamily: BRAND_SANS }}>
      {/* Layer 1 — the text-me moment, ghost bolt boiling behind the words */}
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-4 px-5 text-center">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.06]" style={{ zIndex: 0 }}>
          <BoltBoil height={150} red="var(--bolt-primary)" blue="var(--bolt-secondary)" />
        </div>
        <p className="relative text-[15px] font-bold" style={{ zIndex: 1, color: "var(--brand-cream)" }}>Questions? Text me — I read every message myself.</p>
        <a href={`sms:${TEL}`} className="relative inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-black" style={{ zIndex: 1, background: "var(--accent)", color: "#0B1220" }}>
          <MessageCircle className="h-4 w-4" /> Text Lee {PHONE}
        </a>
      </div>

      {/* Layer 2 — link row */}
      <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px]">
        <a href="/chapters" className="px-1.5 py-0.5 font-semibold transition-colors hover:text-[var(--accent)]" style={{ color: "var(--brand-cream)" }}>For Greek orgs</a>
        <span aria-hidden style={{ color: "rgba(245,239,230,0.28)" }}>·</span>
        <button onClick={onSyllabus} className="px-1.5 py-0.5 font-semibold transition-colors hover:text-[var(--accent)]" style={{ color: "var(--brand-cream)" }}>Send your syllabus</button>
        <span aria-hidden style={{ color: "rgba(245,239,230,0.28)" }}>·</span>
        <a href={`sms:${TEL}`} className="px-1.5 py-0.5 font-semibold transition-colors hover:text-[var(--accent)]" style={{ color: "var(--brand-cream)" }}>Text Lee</a>
      </nav>

      {/* Layer 3 — social (monochrome cream ~50%, placeholders) */}
      <div className="mt-6 flex items-center justify-center gap-5">
        <a href="#" aria-label="YouTube (coming soon)" className="transition-opacity hover:opacity-90" style={{ color: "var(--brand-cream)", opacity: 0.5 }}>
          <Youtube className="h-[22px] w-[22px]" strokeWidth={1.75} />
        </a>
        <a href="#" aria-label="Instagram (coming soon)" className="transition-opacity hover:opacity-90" style={{ color: "var(--brand-cream)", opacity: 0.5 }}>
          <Instagram className="h-[22px] w-[22px]" strokeWidth={1.75} />
        </a>
      </div>

      {/* Layer 4 — baseline + memorial (its own quiet line) */}
      <div className="mt-8 flex flex-col items-center gap-2 px-5 text-center">
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>surviveaccounting.com · Only what's on your exam.</p>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>© 2026 Earned Wisdom LLC</p>
        <p className="text-[11.5px] italic" style={{ color: "rgba(245,239,230,0.42)", letterSpacing: "0.01em" }}>In memory of Ben Ingram, 1993–2017</p>
      </div>
    </footer>
  );
}

// ---- FLOATING PILL — appears after the Exam-1 block, hides over the footer --------------------
function FloatingPill() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const anchor = document.getElementById("exam1");
    const footer = document.getElementById("site-footer");
    if (!anchor) return;
    let past = false, footerVis = false;
    const upd = () => setShow(past && !footerVis);
    const o1 = new IntersectionObserver(([e]) => { past = !e.isIntersecting && e.boundingClientRect.top < 0; upd(); });
    o1.observe(anchor);
    let o2: IntersectionObserver | undefined;
    if (footer) { o2 = new IntersectionObserver(([e]) => { footerVis = e.isIntersecting; upd(); }); o2.observe(footer); }
    return () => { o1.disconnect(); o2?.disconnect(); };
  }, []);
  if (dismissed || !show) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[90] flex items-center gap-2 rounded-full py-2 pl-4 pr-2" style={{ background: "var(--accent)", color: "#0B1220", boxShadow: "0 12px 30px -8px rgba(0,0,0,0.6)" }}>
      <button onClick={() => document.getElementById("exam1")?.scrollIntoView({ behavior: "smooth" })} className="text-[13.5px] font-black">Start studying ⚡</button>
      <button onClick={() => setDismissed(true)} className="grid h-5 w-5 place-items-center rounded-full" style={{ background: "rgba(11,18,32,0.18)" }} title="Dismiss"><X className="h-3 w-3" /></button>
    </div>
  );
}

