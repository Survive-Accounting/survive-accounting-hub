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
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ChevronDown, GraduationCap, MessageCircle, Plus, Search, X } from "lucide-react";

import { fetchStudentTree, type StudentSet, type StudentTopic } from "@/lib/student.functions";
import { listCampusExams } from "@/lib/campus-exams.functions";
import { getChapterNames, listDefaultExamUnits } from "@/lib/default-map.functions";
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
type School = { campusId: string; id: string; name: string; code?: string; codeVerified?: boolean };
const SCHOOLS: School[] = [
  { campusId: "7b92a320-b196-43f2-a241-77a0805816fe", id: "ole-miss", name: "Ole Miss", code: "ACCY 201", codeVerified: true },
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

// A resolved Exam topic: its display name/number + its live free set (if any).
type ResolvedTopic = { key: string; name: string; num: number | null; set: StudentSet | null };

export function LandingPage() {
  const [school, setSchool] = useState<School | null>(null);
  const [theater, setTheater] = useState<{ school: School; mode: "full" | "short" } | null>(null);
  const firstPick = useRef(false);
  // A single monotonic "pulse" the Try-Exam-1 CTA bumps: scrolls to the player and rings the gate
  // picker once (no loop). The gated CampusSelector reacts to the change; nothing else does.
  const [pickerPulse, setPickerPulse] = useState(0);
  const onTryFree = () => { document.getElementById("exam1")?.scrollIntoView({ behavior: "smooth" }); setPickerPulse((p) => p + 1); };

  const theme = useMemo(() => {
    if (!school) return DEFAULT_FRAME_THEME;
    const c = boltFor(school.id);
    return { ...DEFAULT_FRAME_THEME, boltPrimary: c.c1, boltSecondary: c.c2 }; // recolor bolt (contrast-safe); keep the gold accent
  }, [school]);

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

  const unitByName = (re: RegExp) => intro1?.units.find((x) => re.test(x.name));
  const exam1Topics = useMemo<StudentTopic[]>(() => { if (!intro1) return []; return (unitByName(/exam\s*1|test\s*1/i) ?? intro1.units[0])?.topics ?? intro1.topics ?? []; }, [intro1]);
  const exam2Topics = useMemo(() => unitByName(/exam\s*2|test\s*2/i)?.topics ?? [], [intro1]);
  const exam3Topics = useMemo(() => unitByName(/exam\s*3|test\s*3/i)?.topics ?? [], [intro1]);
  const finalTopics = useMemo(() => unitByName(/final|review/i)?.topics ?? [], [intro1]);

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
    return { num: d ? parseInt(d, 10) : (/final|review/i.test(e.name) ? 99 : 999), chapterIds: e.chapter_ids };
  }), [mappedQ.data]);

  // Default map (0106) — used for the Exam-1 player when a campus is unmapped (Foundations order).
  const defaultMapQ = useQuery({ queryKey: ["landing-default-map"], queryFn: () => listDefaultExamUnits(), staleTime: 600_000, networkMode: "always" });
  const defaultUnits = defaultMapQ.data ?? [];

  // Every chapter id any exam references (map + default), resolved to names DIRECTLY from the
  // chapters table — immune to course de-dup, so a mapped topic never shows a bare "Topic".
  const allTopicIds = useMemo(() => { const s = new Set<string>(); mappedExams.forEach((e) => e.chapterIds.forEach((id) => s.add(id))); defaultUnits.forEach((u) => s.add(u.unit_id)); return [...s]; }, [mappedExams, defaultUnits]);
  const namesQ = useQuery({ queryKey: ["landing-chapter-names", allTopicIds], queryFn: () => getChapterNames({ data: { ids: allTopicIds } }), enabled: allTopicIds.length > 0, networkMode: "always", staleTime: 600_000 });
  const nameById = useMemo(() => { const m = new Map<string, { name: string; number: number | null }>(); for (const r of namesQ.data ?? []) m.set(r.id, { name: r.name, number: r.number }); return m; }, [namesQ.data]);

  // Resolve an exam's topics: campus map (if mapped) → default map → student tree → static. Each
  // topic carries its live free set (if any). Free content is never gated by mapping status.
  const liveSetOf = (st: StudentTopic | undefined) => st?.sets.find((s) => s.access !== "paid" && s.playbackId) ?? null;
  const resolveExam = (num: number, treeTopics: StudentTopic[], statics: string[]): ResolvedTopic[] => {
    const m = mappedExams.find((e) => e.num === num);
    const ids = m ? m.chapterIds : defaultUnits.filter((u) => u.exam_number === num).map((u) => u.unit_id);
    if (ids.length) return ids.map((cid) => { const nm = nameById.get(cid), ch = chapterById.get(cid), st = treeTopicById.get(cid); return { key: cid, name: nm?.name ?? ch?.name ?? st?.name ?? "Topic", num: nm?.number ?? ch?.number ?? st?.number ?? null, set: liveSetOf(st) }; });
    if (treeTopics.length) return treeTopics.map((t) => ({ key: t.id, name: t.name, num: t.number, set: liveSetOf(t) }));
    return statics.map((n) => ({ key: n, name: n, num: null, set: null }));
  };
  const exam1R = useMemo(() => resolveExam(1, exam1Topics, STATIC_EXAM1), [mappedExams, defaultUnits, nameById, chapterById, treeTopicById, exam1Topics]);
  const exam2R = useMemo(() => resolveExam(2, exam2Topics, STATIC_EXAM2), [mappedExams, defaultUnits, nameById, chapterById, treeTopicById, exam2Topics]);
  const exam3R = useMemo(() => resolveExam(3, exam3Topics, STATIC_EXAM3), [mappedExams, defaultUnits, nameById, chapterById, treeTopicById, exam3Topics]);
  const finalR = useMemo(() => resolveExam(99, finalTopics, STATIC_FINAL), [mappedExams, defaultUnits, nameById, chapterById, treeTopicById, finalTopics]);
  const anyExam1Live = useMemo(() => exam1R.some((t) => !!t.set?.playbackId), [exam1R]);

  const pickSchool = (s: School) => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
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
        <Hero school={school} onPick={pickSchool} livePromise={anyExam1Live} onTryFree={onTryFree} />
        {school && <StatusStrip school={school} mapped={mapped} />}
        <ExamSection exam1={exam1R} exam2={exam2R} exam3={exam3R} final={finalR} school={school} onPick={pickSchool} pickerPulse={pickerPulse} />
        <TestimonialsSlider />
        <LeeSection />
        <GreekStrip />
        <Footer />
      </main>

      {theater && <Theater school={theater.school} mode={theater.mode} onDone={() => setTheater(null)} />}
      <FloatingPill />
    </div>
  );
}

// ---- HERO -------------------------------------------------------------------------------------
function Hero({ school, onPick, livePromise, onTryFree }: { school: School | null; onPick: (s: School) => void; livePromise: boolean; onTryFree: () => void }) {
  return (
    <section className="flex flex-col items-center pt-16 pb-8 text-center sm:pt-24">
      <SurviveWordmark size={92} />
      <h1 className="mt-6 text-[26px] font-black sm:text-[34px]" style={{ letterSpacing: "-0.01em" }}>Only what's on your exam.</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed sm:text-[17px]" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
        Get cram videos for Intro Financial Accounting — built for your school's exams.
      </p>
      <button onClick={onTryFree} className="mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-[15.5px] font-black transition-transform hover:scale-[1.03]" style={{ background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}>
        Try Exam 1 Free ⚡
      </button>
      <div className="mt-6 w-full max-w-md"><CampusSelector school={school} onPick={onPick} /></div>
      <SchoolTicker />
      <p className="mt-6 text-[13.5px] font-semibold" style={{ color: "var(--accent)" }}>{livePromise ? "Exam 1 is free. Just press play and start studying." : "Exam 1 is free. First videos land this week."}</p>
    </section>
  );
}

// Slow marquee of SEC school names in build-priority order. Muted, pausable on hover; reduced-motion
// collapses to a static first-three line. Track duplicates the row and slides -50% for a seamless loop.
function SchoolTicker() {
  const reduce = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  if (reduce) {
    return <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Ole Miss · LSU · Alabama · +13 SEC schools</p>;
  }
  const row = SCHOOLS.map((s) => s.name).join(" · ");
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
function CampusSelector({ school, onPick, schools = SCHOOLS, pulse, openOnPulse }: { school: School | null; onPick: (s: School) => void; schools?: School[]; pulse?: number; openOnPulse?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [ring, setRing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const firstPulse = useRef(true);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-transform hover:scale-[1.01]"
        style={{ background: "rgba(245,239,230,0.06)", border: `2px solid ${school ? "var(--bolt-primary)" : "var(--accent)"}`, boxShadow: "0 20px 55px -22px rgba(0,0,0,0.7)", animation: ring ? "sa-picker-pulse 0.9s ease" : undefined, borderRadius: 16 }}
      >
        <GraduationCap className="h-6 w-6 shrink-0" style={{ color: "var(--accent)" }} />
        <span className="min-w-0 flex-1 text-[17px] font-bold" style={{ color: "var(--brand-cream)" }}>{school ? school.name : "Pick your school"}</span>
        <ChevronDown className="h-5 w-5 shrink-0 opacity-70" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl" style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.14)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)" }}>
          <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
            <Search className="h-4 w-4 opacity-50" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 16 SEC schools…" className="w-full bg-transparent text-[14px] outline-none" style={{ color: "var(--brand-cream)" }} />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {results.length === 0 && <div className="px-4 py-3 text-[13px] italic" style={{ color: "var(--text-muted)" }}>No SEC school by that name.</div>}
            {results.map((s) => { const c = boltFor(s.id); return (
              <button key={s.id} onClick={() => { onPick(s); setOpen(false); setQ(""); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5">
                <span className="grid h-6 w-4 shrink-0 place-items-center"><Bolt c1={c.c1} c2={c.c2} /></span>
                <span className="flex-1 text-[14.5px] font-semibold" style={{ color: "var(--brand-cream)" }}>{s.name}</span>
                {s.codeVerified && s.code && <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: "var(--text-muted)" }}>{s.code}</span>}
              </button>
            ); })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- CAMPUS STATUS STRIP (directly under the selector) ---------------------------------------
function StatusStrip({ school, mapped }: { school: School; mapped: boolean }) {
  if (mapped) {
    const code = school.codeVerified && school.code ? `${school.code}, ` : "";
    return (
      <div className="mx-auto mb-6 max-w-3xl rounded-xl px-4 py-2.5 text-center text-[13px] font-semibold" style={{ background: "rgba(59,245,160,0.10)", border: "1px solid rgba(59,245,160,0.3)", color: "#8DF5C4" }}>
        Your course is mapped — {code}exams organized below.
      </div>
    );
  }
  return (
    <div className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-xl px-4 py-2.5 text-center text-[13px]" style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.32)", color: "var(--brand-cream)" }}>
      <span>Paid exams open once your course is mapped. Exam 1 stays free.</span>
      <a href="/order" className="rounded-lg px-3 py-1 text-[12.5px] font-bold" style={{ background: "var(--accent)", color: "#0B1220" }}>Send my syllabus</a>
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
    <div className="fixed inset-0 z-[200] grid place-items-center" style={{ background: full ? "var(--brand-navy)" : "rgba(17,26,50,0.82)", animation: `sa-land-fade ${dur}ms ease forwards` }} onClick={onDone}>
      <style>{`@keyframes sa-land-fade{0%{opacity:0}18%{opacity:1}72%{opacity:1}100%{opacity:0}}`}</style>
      <div className="flex flex-col items-center gap-4">
        <BoltBoil height={full ? 280 : 170} red={c.c1} blue={c.c2} />
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

// ---- EXAM SECTION: Exam-1 hero + player · muted 2/3/Final row · Semester bar ------------------
function ExamSection({ exam1, exam2, exam3, final, school, onPick, pickerPulse }: { exam1: ResolvedTopic[]; exam2: ResolvedTopic[]; exam3: ResolvedTopic[]; final: ResolvedTopic[]; school: School | null; onPick: (s: School) => void; pickerPulse: number }) {
  const [openMuted, setOpenMuted] = useState<number | null>(null);
  const muted: [string, ResolvedTopic[]][] = [["Exam 2", exam2], ["Exam 3", exam3], ["Final", final]];
  return (
    <section id="exam1" className="mb-8 scroll-mt-6">
      <Exam1Hero topics={exam1} school={school} onPick={onPick} pickerPulse={pickerPulse} />
      {/* muted paid row — three small cards in one row (mobile too); [+] expands in place */}
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
        {muted.map(([title, tp], i) => <MutedExamCard key={title} title={title} topics={tp} expanded={openMuted === i} onToggle={() => setOpenMuted((cur) => (cur === i ? null : i))} />)}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl px-5 py-4" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
        <span className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>Semester Pass</span>
        <span className="text-[15px] font-black" style={{ color: "var(--accent)" }}>$150</span>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>— every exam, all semester</span>
      </div>
    </section>
  );
}

function Exam1Hero({ topics, school, onPick, pickerPulse }: { topics: ResolvedTopic[]; school: School | null; onPick: (s: School) => void; pickerPulse: number }) {
  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(252,163,17,0.45)" }}>
      <div className="flex items-baseline justify-between px-4 pt-3.5 pb-1">
        <span className="text-[15px] font-black uppercase tracking-wide" style={{ color: "var(--brand-cream)" }}>⚡ Exam 1</span>
        <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: "var(--accent)" }}>Free</span>
      </div>
      <Exam1Player topics={topics} school={school} onPick={onPick} pickerPulse={pickerPulse} />
    </div>
  );
}

const PLAYER_TABS = [["video", "Video"], ["questions", "Questions"], ["practice", "Practice"]] as const;
type PlayerTab = (typeof PLAYER_TABS)[number][0];

function Exam1Player({ topics, school, onPick, pickerPulse }: { topics: ResolvedTopic[]; school: School | null; onPick: (s: School) => void; pickerPulse: number }) {
  const [idx, setIdx] = useState(0);
  const [tab, setTab] = useState<PlayerTab>("video");
  const [menu, setMenu] = useState(false);
  const gated = !school;
  // On school pick, land on the FIRST live Exam-1 topic (autoplays); if none is live yet, land on
  // the first topic's poster — never a blank frame. Keyed on the school id so it runs once per pick.
  useEffect(() => {
    if (!school) return;
    const firstLive = topics.findIndex((t) => !!t.set?.playbackId);
    setIdx(firstLive >= 0 ? firstLive : 0);
    setTab("video");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id]);
  const safeIdx = Math.min(idx, Math.max(0, topics.length - 1));
  const cur = topics[safeIdx] ?? null;
  const step = (d: -1 | 1) => { setMenu(false); setIdx(() => Math.max(0, Math.min(topics.length - 1, safeIdx + d))); };
  return (
    <div>
      {/* TOPIC STRIP */}
      <div className="relative flex items-center gap-2 border-y px-3 py-2" style={{ borderColor: "rgba(245,239,230,0.1)", background: "rgba(0,0,0,0.2)" }}>
        <button onClick={() => step(-1)} disabled={safeIdx <= 0} className="grid h-6 w-6 place-items-center rounded text-[16px] disabled:opacity-30" style={{ color: "var(--brand-cream)" }} title="Previous topic">‹</button>
        <div className="min-w-0 flex-1 text-center">
          <span className="text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>{cur?.name ?? "—"}</span>
          {cur && !cur.set && <span className="ml-2 text-[10.5px]" style={{ color: "var(--text-muted)" }}>(coming)</span>}
        </div>
        <button onClick={() => step(1)} disabled={safeIdx >= topics.length - 1} className="grid h-6 w-6 place-items-center rounded text-[16px] disabled:opacity-30" style={{ color: "var(--brand-cream)" }} title="Next topic">›</button>
        <button onClick={() => setMenu((v) => !v)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/10" style={{ color: "var(--accent)" }} title="All Exam 1 topics"><ChevronDown className="h-4 w-4" /></button>
        {menu && (
          <div className="absolute right-2 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg" style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.14)", boxShadow: "0 20px 50px -16px rgba(0,0,0,0.85)" }}>
            {topics.map((t, i) => (
              <button key={t.key} onClick={() => { setIdx(i); setMenu(false); setTab("video"); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-white/5" style={{ opacity: t.set ? 1 : 0.55, color: i === safeIdx ? "var(--accent)" : "var(--brand-cream)" }}>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {!t.set && <span className="shrink-0 text-[10px]" style={{ color: "var(--text-muted)" }}>coming</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MAIN AREA (16:9) — active tab content. Until a school is picked the poster shows BLURRED
          under a centered "pick your school to start" gate; selecting a school unblurs + autoplays. */}
      <div className="relative w-full" style={{ aspectRatio: "16 / 9", background: "#000" }}>
        {gated ? (
          <>
            <div className="absolute inset-0" style={{ filter: "blur(9px)", transform: "scale(1.06)", opacity: 0.65 }} aria-hidden>
              <Poster school={null} topicName="Exam 1" queued={false} />
            </div>
            <div className="absolute inset-0 grid place-items-center px-5" style={{ background: "rgba(11,18,32,0.6)" }}>
              <div className="flex w-full max-w-sm flex-col items-center gap-3">
                <p className="text-center text-[16px] font-black sm:text-[18px]" style={{ color: "var(--brand-cream)" }}>Pick your school to start</p>
                <div className="w-full"><CampusSelector school={null} onPick={onPick} pulse={pickerPulse} openOnPulse /></div>
                <p className="text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Exam 1 is free. No account required.</p>
              </div>
            </div>
          </>
        ) : (
          <>
            {tab === "video" && (cur?.set?.playbackId
              ? <HeroVideo key={cur.set.playbackId} playbackId={cur.set.playbackId} />
              : <Poster school={school} topicName={cur?.name ?? "Exam 1"} queued={!!cur} />)}
            {tab === "questions" && <PlayerPlaceholder text="Practice questions land with the video." />}
            {tab === "practice" && <PlayerPlaceholder text="Interactive practice coming." />}
          </>
        )}
      </div>

      {/* TABS */}
      <div className="flex items-stretch border-t" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
        {PLAYER_TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="flex-1 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: tab === k ? "var(--accent)" : "var(--text-muted)", borderBottom: `2px solid ${tab === k ? "var(--accent)" : "transparent"}` }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// Muted autoplay per browser rules; the user unmutes via the native controls. 16:9 only.
function HeroVideo({ playbackId }: { playbackId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    const src = `https://stream.mux.com/${playbackId}.m3u8`;
    let hls: { destroy: () => void } | null = null, cancelled = false;
    if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; }
    else void import("hls.js").then(({ default: Hls }) => { if (cancelled || !ref.current) return; if (Hls.isSupported()) { const h = new Hls(); h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr(true); }); h.loadSource(src); h.attachMedia(ref.current); hls = h; } else ref.current.src = src; }).catch(() => setErr(true));
    v.muted = true; void v.play().catch(() => { /* user can press play */ });
    return () => { cancelled = true; hls?.destroy(); };
  }, [playbackId]);
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

function PlayerPlaceholder({ text }: { text: string }) {
  return <div className="grid h-full w-full place-items-center px-6 text-center text-[13px]" style={{ background: "var(--brand-navy)", color: "var(--text-muted)" }}>{text}</div>;
}

// Muted paid cards (Exam 2 / Exam 3 / Final) — name · $50 · [+]; expand-in-place, one open at a time.
function MutedExamCard({ title, topics, expanded, onToggle }: { title: string; topics: ResolvedTopic[]; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl" style={{ background: "rgba(245,239,230,0.035)", border: "1px solid rgba(245,239,230,0.1)", opacity: expanded ? 1 : 0.7 }}>
      <button onClick={onToggle} className="flex w-full items-center gap-1.5 px-2.5 py-2.5 text-left">
        <span className="min-w-0 flex-1 truncate text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--brand-cream)" }}>{title}</span>
        <span className="shrink-0 text-[11px] font-bold" style={{ color: "var(--accent)" }}>$50</span>
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded" style={{ color: "var(--text-muted)" }}>{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</span>
      </button>
      {expanded && (
        <ul className="px-3 pb-2.5" style={{ borderTop: "1px solid rgba(245,239,230,0.08)" }}>
          {topics.map((t) => <li key={t.key} className="truncate py-0.5 text-[12px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>· {t.name}</li>)}
        </ul>
      )}
    </div>
  );
}

// ---- THE LEE SECTION (the one section allowed to run warm) ------------------------------------
function LeeSection() {
  return (
    <section className="mx-auto mb-12 max-w-3xl rounded-3xl p-7 sm:p-10" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
      <div className="flex flex-col gap-7 sm:flex-row sm:items-start">
        <div className="shrink-0"><LeePortrait /></div>
        {/* Body uses the UI/text face (Rubik is a display face — headlines only). */}
        <div className="min-w-0" style={{ fontFamily: BRAND_SANS, color: "var(--brand-cream)", maxWidth: "60ch" }}>
          <h2 style={{ fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: 21, letterSpacing: "-0.01em", color: "var(--brand-cream)", marginBottom: 18 }}>Why I built Survive Accounting</h2>

          {/* two student voices — italic, regular, muted, staggered indents */}
          <div className="space-y-2.5">
            <p className="italic" style={{ fontWeight: 400, fontSize: 14.5, opacity: 0.7, lineHeight: 1.5, marginLeft: 0 }}>“My exam looked nothing like my notes.”</p>
            <p className="italic" style={{ fontWeight: 400, fontSize: 14.5, opacity: 0.7, lineHeight: 1.5, marginLeft: 20 }}>“I studied for weeks and still failed.”</p>
          </div>

          {/* the one headline moment */}
          <p style={{ marginTop: 20, fontWeight: 600, fontSize: 18.5, color: "var(--brand-cream)" }}>Sound familiar?</p>

          <p style={{ marginTop: 20, fontWeight: 400, fontSize: 15.5, lineHeight: 1.65, opacity: 0.88 }}>Here's what I tell my students:</p>

          {/* the thesis couplet — own two lines, air above/below, bold on "about" and "do" only */}
          <p style={{ marginTop: 16, marginBottom: 20, fontWeight: 400, fontSize: 16.5, lineHeight: 1.55, color: "var(--brand-cream)" }}>
            Lectures teach you <b style={{ fontWeight: 700 }}>about</b> accounting.<br />
            The exam tests whether you can <b style={{ fontWeight: 700 }}>do</b> accounting.
          </p>

          <p style={{ fontWeight: 400, fontSize: 15.5, lineHeight: 1.65, opacity: 0.88 }}>
            So that's what my cram videos are: reps. Real exam-style questions, worked start to
            finish, so you're always walking into exams ready.
          </p>

          <p style={{ marginTop: 16, fontWeight: 400, fontSize: 15.5, lineHeight: 1.65, opacity: 0.88 }}>
            This course is tough — but so are you. Give my videos a try (Exam 1 is free). I know
            you'll love them.
          </p>
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
      <img
        src="/lee-beach.webp" alt="Lee Ingram" loading="lazy"
        style={{ width: 200, aspectRatio: "4 / 5", objectFit: "cover", objectPosition: "center 28%", borderRadius: 16, border: "3px solid var(--brand-cream)", display: "block" }}
      />
      <figcaption className="mt-3 text-center" style={{ fontFamily: BRAND_SANS }}>
        <span className="block" style={{ fontWeight: 600, fontSize: 16, color: "var(--brand-cream)" }}>Lee Ingram</span>
        <span className="mt-0.5 block text-[12px]" style={{ fontWeight: 400, opacity: 0.6, color: "var(--brand-cream)" }}>Ole Miss accounting grad · Tutor since 2015</span>
      </figcaption>
    </figure>
  );
}

// ---- TESTIMONIALS (own slider — navy/cream/bolt; no white cards / stars / verified badges) ----
// Curated top-10 from testimonials.csv, best-first. long=1 → truncate + "show more". Initials only
// (no photos). Auto-advances 6s; ANY interaction stops it permanently; reduced-motion = manual only.
type Testimonial = { name: string; school: string; long: boolean; quote: string };
const TESTIMONIALS: Testimonial[] = [
  { name: "Zach Parker", school: "Ole Miss", long: false, quote: "Lee your videos saved me on multiple choice. Everything you thought would be on there was." },
  { name: "George L.", school: "Ole Miss", long: false, quote: "If it weren’t for Lee, I wouldn’t have made A’s in both intro courses." },
  { name: "Tyler K.", school: "Ole Miss", long: false, quote: "Lee's exam prep videos are better than any tutor I’ve ever had." },
  { name: "James L.", school: "Ole Miss", long: false, quote: "Feel like I got an A purely because of Lee's videos." },
  { name: "Claire Ficek", school: "Ole Miss", long: false, quote: "Survive Accounting is literally the only reason that I got through Accounting 201! A bunch of my friends used it and said it was so helpful." },
  { name: "Ryan M.", school: "Ole Miss", long: false, quote: "Lee's videos were a lifesaver. I would've failed without them." },
  { name: "Nic Ripson", school: "Ole Miss", long: false, quote: "Survive Accounting helped me better understand the content I needed to learn. My quiz average was a 45% and after using this platform to study I got an 84.5% on my first intermediate exam." },
  { name: "Brace R.", school: "Ole Miss", long: false, quote: "I enjoyed how he broke everything down to very simple terms that weren’t necessarily explained in class." },
  { name: "Nate K.", school: "Ole Miss", long: true, quote: "Survive accounting is the sole reason that I got through both accounting courses at ole miss. Lee does an exceptional job breaking every little piece down as much as possible and makes it super easy to follow along. He is very enthusiastic and not only is he a great accounting tutor but he is also a genuinely great guy. If you need assistance in your accounting class I highly recommend Survive Accounting." },
  { name: "Daniel B.", school: "Ole Miss", long: true, quote: "Survive Accounting helped with my homework, test preparation, and the overall understanding of accounting. Having the ability to see how Lee went step by step in problems helped me grasp super confusing concepts. He was also very friendly over email and even gave me specific pointers about assignments I emailed to him which was a huge help. If you are going to dedicate time to studying, I would highly recommend using Survive Accounting to optimize your understanding of the material and give yourself a greater chance of receiving a high grade in the class!" },
];
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

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
      <h2 className="mb-6 text-center text-[22px] font-black sm:text-[26px]" style={{ color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>Real students. Real exams.</h2>

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
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-black" style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.18)", color: "var(--accent)" }}>{initialsOf(t.name)}</span>
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

// ---- GREEK + FOOTER (bolt + text only, no illustration) --------------------------------------
function GreekStrip() {
  return (
    <section className="mx-auto mb-10 max-w-2xl rounded-xl px-5 py-4 text-center" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
      <p className="text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>Chapters: Exam 1 is free for your whole house.</p>
      <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>One link, every member. <a href={`sms:${TEL}`} style={{ color: "var(--accent)", fontWeight: 700 }}>Text me</a> and I'll set it up.</p>
    </section>
  );
}

function Footer() {
  return (
    <footer id="site-footer" className="flex flex-col items-center gap-4 border-t py-12 text-center" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
      <span className="inline-block h-9 w-6"><Bolt c1="var(--bolt-primary)" c2="var(--bolt-secondary)" /></span>
      <p className="text-[15px] font-bold" style={{ color: "var(--brand-cream)" }}>Questions? Text me — I read every message myself.</p>
      <a href={`sms:${TEL}`} className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-black" style={{ background: "var(--accent)", color: "#0B1220" }}>
        <MessageCircle className="h-4 w-4" /> Text Lee {PHONE}
      </a>
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>surviveaccounting.com · Only what's on your exam.</p>
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

