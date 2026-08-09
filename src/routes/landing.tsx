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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, GraduationCap, MessageCircle, Play, Search, X } from "lucide-react";

import { fetchStudentTree, type StudentSet, type StudentTopic } from "@/lib/student.functions";
import { listCampusExams } from "@/lib/campus-exams.functions";
import { DEFAULT_FRAME_THEME, FrameBackground, IntroSting, frameThemeVars } from "@/components/frames";
import { BoltBoil, SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { Bolt, BRAND_BLUE, BRAND_DISPLAY, BRAND_RED, SEC_SCHOOLS } from "@/components/canvas/brand";
import Reviews from "@/components/landing/Reviews";

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

// Coming-soon / month labels — Lee sets these; rendered VERBATIM (e.g. "Coming October"). Absent →
// free-exam unbuilt topics default to "(queued)"; paid topics show no label unless set here.
const COMING_LABELS: Record<string, string> = {};
const comingFree = (name: string): string => COMING_LABELS[name] ?? "(queued)";
const comingPaid = (name: string): string | undefined => COMING_LABELS[name];

const setName = (n?: string) => (n ?? "Set").replace(/^\s*ch\s*\d+\s*·\s*/i, "").trim() || "Set";

type ExamItem = { key: string; label: string; num?: number | null; play?: () => void; coming?: string };

export function LandingPage() {
  const [school, setSchool] = useState<School | null>(null);
  const [theater, setTheater] = useState<{ school: School; mode: "full" | "short" } | null>(null);
  const [playing, setPlaying] = useState<{ set: StudentSet; chip: string } | null>(null);
  const firstPick = useRef(false);

  const theme = useMemo(() => {
    if (!school) return DEFAULT_FRAME_THEME;
    const c = boltFor(school.id);
    return { ...DEFAULT_FRAME_THEME, boltPrimary: c.c1, boltSecondary: c.c2 }; // recolor bolt (contrast-safe); keep the gold accent
  }, [school]);

  const treeQ = useQuery({ queryKey: ["landing-tree", school?.campusId ?? null], queryFn: () => fetchStudentTree({ data: school ? { campusId: school.campusId } : {} }), networkMode: "always", staleTime: 300_000 });
  const intro1 = useMemo(() => (treeQ.data ?? []).find((c) => c.family === "intro_1" || c.name.trim().toLowerCase() === "intro 1") ?? null, [treeQ.data]);

  const mappedQ = useQuery({
    queryKey: ["landing-mapped", school?.campusId ?? null, intro1?.id ?? null],
    queryFn: async () => { try { return await listCampusExams({ data: { campus_id: school!.campusId, course_id: intro1!.id } }); } catch { return []; } },
    enabled: !!school && !!intro1, networkMode: "always",
  });
  const mapped = (mappedQ.data ?? []).some((e) => e.status === "active");

  const unitByName = (re: RegExp) => intro1?.units.find((x) => re.test(x.name));
  const exam1Topics = useMemo<StudentTopic[]>(() => { if (!intro1) return []; return (unitByName(/exam\s*1|test\s*1/i) ?? intro1.units[0])?.topics ?? intro1.topics ?? []; }, [intro1]);
  const exam2Topics = useMemo(() => unitByName(/exam\s*2|test\s*2/i)?.topics ?? [], [intro1]);
  const exam3Topics = useMemo(() => unitByName(/exam\s*3|test\s*3/i)?.topics ?? [], [intro1]);
  const finalTopics = useMemo(() => unitByName(/final|review/i)?.topics ?? [], [intro1]);

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
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.34} animate /></div>

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px" }}>
        <Hero school={school} onPick={pickSchool} />
        {school && <StatusStrip school={school} mapped={mapped} />}
        <ExamSection exam1={exam1Topics} exam2={exam2Topics} exam3={exam3Topics} final={finalTopics} school={school} mapped={mapped} onPlay={(set, chip) => setPlaying({ set, chip })} />
        <LeeSection />
        <TestimonialStrip />
        <GreekStrip />
        <Footer />
      </main>

      {theater && <Theater school={theater.school} mode={theater.mode} onDone={() => setTheater(null)} />}
      {playing && <VideoModal set={playing.set} chipText={playing.chip} onClose={() => setPlaying(null)} />}
      <FloatingPill />
    </div>
  );
}

// ---- HERO -------------------------------------------------------------------------------------
function Hero({ school, onPick }: { school: School | null; onPick: (s: School) => void }) {
  return (
    <section className="flex flex-col items-center pt-16 pb-8 text-center sm:pt-24">
      <SurviveWordmark size={92} />
      <p className="mt-3 text-[14px] font-medium" style={{ color: "var(--brand-cream)", opacity: 0.7, letterSpacing: "0.01em" }}>Cram videos by Lee Ingram</p>
      <h1 className="mt-5 text-[26px] font-black sm:text-[34px]" style={{ letterSpacing: "-0.01em" }}>Only what's on your exam.</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed sm:text-[17px]" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
        Free cram videos for Intro Financial Accounting — built around your school's exams.
      </p>
      <div className="mt-8 w-full max-w-md"><CampusSelector school={school} onPick={onPick} /></div>
      <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Ole Miss · LSU · Alabama · +13 SEC schools</p>
      <p className="mt-6 text-[13.5px] font-semibold" style={{ color: "var(--accent)" }}>Exam 1 is free. No account, no email — just press play and start studying.</p>
    </section>
  );
}

// ---- CAMPUS SELECTOR -------------------------------------------------------------------------
function CampusSelector({ school, onPick }: { school: School | null; onPick: (s: School) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const results = SCHOOLS.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-transform hover:scale-[1.01]"
        style={{ background: "rgba(245,239,230,0.06)", border: `2px solid ${school ? "var(--bolt-primary)" : "var(--accent)"}`, boxShadow: "0 20px 55px -22px rgba(0,0,0,0.7)" }}
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

// ---- EXAM SECTION: four cards in a row + Semester Pass bar ------------------------------------
function ExamSection({ exam1, exam2, exam3, final, school, mapped, onPlay }: {
  exam1: StudentTopic[]; exam2: StudentTopic[]; exam3: StudentTopic[]; final: StudentTopic[];
  school: School | null; mapped: boolean; onPlay: (set: StudentSet, chip: string) => void;
}) {
  const unmapped = !!school && !mapped;
  const priceLine = unmapped ? "opens when your course is mapped" : "$50";

  const freeItems: ExamItem[] = exam1.length
    ? exam1.flatMap((t): ExamItem[] => t.sets.length
        ? t.sets.map((s): ExamItem => {
            const label = setName(s.name) || t.name;
            const playable = s.access !== "paid" && !!s.playbackId;
            return { key: s.id, label, num: t.number, play: playable ? () => onPlay(s, t.shortLabel || t.name) : undefined, coming: playable ? undefined : comingFree(label) };
          })
        : [{ key: t.id, label: t.name, num: t.number, coming: comingFree(t.name) }])
    : STATIC_EXAM1.map((n): ExamItem => ({ key: n, label: n, coming: comingFree(n) }));

  const paidItems = (topics: StudentTopic[], statics: string[]): ExamItem[] =>
    (topics.length ? topics.map((t) => t.name) : statics).map((n) => ({ key: n, label: n, coming: comingPaid(n) }));

  return (
    <section id="exam1" className="mb-8 scroll-mt-6">
      <p className="mb-4 text-center text-[14px]" style={{ color: "var(--brand-cream)", opacity: 0.8 }}>Watch in order or jump around.</p>
      {/* Desktop: 4 across. Mobile: horizontal scroll, next card peeking (~18%). No dots, no concealing. */}
      <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible" style={{ scrollSnapType: "x mandatory" }}>
        <div className="min-w-[82%] sm:min-w-0" style={{ scrollSnapAlign: "start" }}><ExamCard title="Exam 1" free items={freeItems} /></div>
        <div className="min-w-[82%] sm:min-w-0" style={{ scrollSnapAlign: "start" }}><ExamCard title="Exam 2" priceLine={priceLine} items={paidItems(exam2, STATIC_EXAM2)} /></div>
        <div className="min-w-[82%] sm:min-w-0" style={{ scrollSnapAlign: "start" }}><ExamCard title="Exam 3" priceLine={priceLine} items={paidItems(exam3, STATIC_EXAM3)} /></div>
        <div className="min-w-[82%] sm:min-w-0" style={{ scrollSnapAlign: "start" }}><ExamCard title="Final Review" priceLine={priceLine} items={paidItems(final, STATIC_FINAL)} /></div>
      </div>
      {/* Semester Pass — full-width bar beneath */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl px-5 py-4" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
        <span className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>Semester Pass</span>
        <span className="text-[15px] font-black" style={{ color: "var(--accent)" }}>$150</span>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>— every exam, all semester</span>
      </div>
    </section>
  );
}

function ExamCard({ title, free, priceLine, items }: { title: string; free?: boolean; priceLine?: string; items: ExamItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 5);
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl" style={{ background: "rgba(245,239,230,0.05)", border: `1px solid ${free ? "rgba(252,163,17,0.45)" : "rgba(245,239,230,0.12)"}` }}>
      <div className="flex items-baseline justify-between gap-2 px-4 pt-4 pb-2">
        <span className="text-[14px] font-black uppercase tracking-wide" style={{ color: "var(--brand-cream)" }}>{title}</span>
        {free ? (
          <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: "var(--accent)" }}>Free</span>
        ) : (
          <span className="text-right text-[11px] font-bold" style={{ color: priceLine && priceLine.startsWith("$") ? "var(--accent)" : "var(--text-muted)" }}>{priceLine}</span>
        )}
      </div>
      <div className="flex-1">
        {shown.map((it) => <ExamItemRow key={it.key} item={it} />)}
      </div>
      {items.length > 5 && (
        <button onClick={() => setExpanded((v) => !v)} className="border-t px-4 py-2 text-left text-[11.5px] font-semibold" style={{ borderColor: "rgba(245,239,230,0.08)", color: "var(--text-muted)" }}>
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function ExamItemRow({ item }: { item: ExamItem }) {
  const playable = !!item.play;
  return (
    <button
      disabled={!playable}
      onClick={item.play}
      className="flex w-full items-center gap-2.5 border-b px-4 py-2.5 text-left last:border-b-0"
      style={{ borderColor: "rgba(245,239,230,0.06)", cursor: playable ? "pointer" : "default", opacity: item.coming ? 0.66 : 1 }}
      title={item.label}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]" style={{ background: playable ? "var(--accent)" : "transparent", border: playable ? "none" : "1px solid rgba(245,239,230,0.3)", color: "#0B1220" }}>
        {playable ? <Play className="h-2.5 w-2.5" style={{ fill: "#0B1220" }} /> : <span style={{ color: "var(--brand-cream)", opacity: 0.55 }}>○</span>}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" style={{ color: "var(--brand-cream)" }}>{item.label}</span>
      {playable ? (
        <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>▶</span>
      ) : item.coming ? (
        <span className="shrink-0 text-[10.5px]" style={{ color: "var(--text-muted)" }}>{item.coming}</span>
      ) : null}
    </button>
  );
}

// ---- THE LEE SECTION (the one section allowed to run warm) ------------------------------------
function LeeSection() {
  return (
    <section className="mx-auto mb-12 max-w-3xl rounded-3xl p-7 sm:p-10" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
      <div className="flex flex-col gap-7 sm:flex-row sm:items-start">
        <div className="shrink-0"><LeePortrait /></div>
        <div className="min-w-0 space-y-5 text-[15.5px] leading-relaxed" style={{ color: "var(--brand-cream)" }}>
          <div>
            <p className="text-[20px] font-black leading-snug sm:text-[23px]">“It was nothing like what we did in class.”</p>
            <p className="mt-1 text-[14px]" style={{ color: "var(--text-muted)" }}>My students tell me this every semester.</p>
          </div>

          {/* the about/do couplet — own lines, bold on the two words */}
          <p className="text-[16.5px] leading-snug">
            Lectures teach you <b>about</b> accounting.<br />
            Exams test whether you can <b>do</b> accounting.
          </p>

          <p style={{ opacity: 0.92 }}>
            I've watched students study hard, understand the material, and still fail — and retaking
            this course costs thousands. I'd rather see you spend that money enjoying college. Helping
            students beat this class is my full-time job, and I love it.
          </p>

          <p style={{ opacity: 0.92 }}>
            I release cram videos one topic at a time, as fast as I can film them. If what you need
            isn't up yet, tell me — that's how I pick what's next.
          </p>
        </div>
      </div>
    </section>
  );
}

// Lee's portrait (public/lee-portrait.svg — a single currentColor path). An <img> can't inherit
// our cream, so we paint it as a CSS mask over a cream fill. Heavy path stays a cached static asset.
function LeePortrait() {
  return (
    <div
      role="img" aria-label="Portrait of Lee Ingram"
      className="mx-auto sm:mx-0"
      style={{
        width: 184, height: 260, background: "var(--brand-cream)",
        WebkitMaskImage: "url(/lee-portrait.svg)", maskImage: "url(/lee-portrait.svg)",
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
        WebkitMaskPosition: "center", maskPosition: "center",
        WebkitMaskSize: "contain", maskSize: "contain",
      }}
    />
  );
}

// ---- TESTIMONIALS ----------------------------------------------------------------------------
function TestimonialStrip() {
  return (
    <section className="mx-auto mb-12 max-w-3xl">
      <h2 className="mb-5 text-center text-[13px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>What students say</h2>
      <div className="[&_h2]:hidden [&_h3]:hidden"><Reviews /></div>
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

// ---- ON-PAGE PLAYER (silent IntroSting pre-roll → HLS video), lifted from /learn -------------
function VideoModal({ set, chipText, onClose }: { set: StudentSet; chipText: string; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  const [preroll, setPreroll] = useState(true);
  const portrait = set.orientation === "portrait";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    const v = ref.current, pid = set.playbackId;
    if (!v || !pid) return;
    const src = `https://stream.mux.com/${pid}.m3u8`;
    if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; return; }
    let hls: { destroy: () => void } | null = null, cancelled = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !ref.current) return;
      if (Hls.isSupported()) { const h = new Hls(); h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr(true); }); h.loadSource(src); h.attachMedia(ref.current); hls = h; }
      else ref.current.src = src;
    }).catch(() => setErr(true));
    return () => { cancelled = true; hls?.destroy(); };
  }, [set.playbackId]);
  useEffect(() => { if (!preroll) void ref.current?.play().catch(() => { /* user can hit play */ }); }, [preroll]);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" style={{ background: "rgba(4,7,14,0.92)" }} onClick={onClose}>
      <div className="relative w-full" style={{ maxWidth: portrait ? 460 : 1100 }} onClick={(e) => e.stopPropagation()}>
        <button className="absolute -top-9 right-0 grid h-8 w-8 place-items-center rounded-full" style={{ color: "#e8ecf5", border: "1px solid rgba(255,255,255,0.2)" }} onClick={onClose} title="Close (Esc)"><X className="h-4 w-4" /></button>
        <div className="mb-2 text-[13px] font-bold" style={{ color: "#e8ecf5" }}>{setName(set.name)}</div>
        {err ? (
          <div className="grid place-items-center rounded-xl text-[12px]" style={{ aspectRatio: portrait ? "9 / 16" : "16 / 9", background: "#0b1020", border: "1px solid rgba(255,92,110,0.4)", color: "#F3C6CC" }}>Couldn't load this video. Try again shortly.</div>
        ) : (
          <div className="relative overflow-hidden rounded-xl" style={{ background: "#000", aspectRatio: portrait ? "9 / 16" : "16 / 9" }}>
            <video ref={ref} controls playsInline className="h-full w-full" style={{ objectFit: "contain", background: "#000" }} />
            <span className="pointer-events-none absolute right-3 top-3 inline-block h-6 w-4 opacity-80"><Bolt c1={BRAND_RED} c2={BRAND_BLUE} /></span>
            {preroll && <PreRoll chipText={chipText} onDone={() => setPreroll(false)} />}
          </div>
        )}
      </div>
    </div>
  );
}

function PreRoll({ chipText, onDone }: { chipText: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.24);
  useLayoutEffect(() => { const el = ref.current; if (el && el.clientWidth) setScale(el.clientWidth / 1920); }, []);
  useEffect(() => { const t = window.setTimeout(onDone, 1500); return () => window.clearTimeout(t); }, [onDone]);
  return (
    <div ref={ref} className="absolute inset-0 z-10 grid place-items-center overflow-hidden" style={{ background: "#0A1220" }}>
      <IntroSting topicChip={chipText || undefined} scale={scale} />
    </div>
  );
}
