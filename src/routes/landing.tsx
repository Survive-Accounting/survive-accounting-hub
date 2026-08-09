// LANDING (preview) — the surviveaccounting.com rebuild in the intro-frame design language:
// navy/cream, boiling bolt, orbital background, one page, no nav bar. Krug rules: the hero answers
// "free? for me? what do I do?" without reading. Built as a NEW route so the live homepage is
// untouched; promote to "/" (index.tsx) when approved.
//
// Data is real where it can be: the free Exam-1 block reads fetchStudentTree (the same server gate
// students hit — only status='live' sets, free playback ids resolved, paid ids withheld) and plays
// on the page via the shared HLS player + silent IntroSting pre-roll. Picking a school recolors the
// bolt to that school (one-beat takeover, once per visitor) and, once a campus's exam map exists
// (campus_exams, 0105), flips the unmapped banner off. No checkout exists yet — the paid exams are
// shown as "coming soon", not purchasable.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, GraduationCap, Lock, Mail, MessageCircle, Play, Search, X } from "lucide-react";

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
const EMAIL = "lee@surviveaccounting.com";
const THEATER_KEY = "sa-landing-theater-seen";

// SEC-16 in build priority (Ole Miss · LSU first). campusId = the real campus row; colors come from
// SEC_SCHOOLS by slug. schoolId doubles as the bolt colorway key.
const SCHOOLS: { campusId: string; id: string; name: string }[] = [
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
type School = (typeof SCHOOLS)[number];
const COLOR_BY_ID = new Map(SEC_SCHOOLS.map((s: { id: string; c1: string; c2: string }) => [s.id, s]));
const schoolColors = (id: string) => COLOR_BY_ID.get(id) ?? { c1: BRAND_RED, c2: BRAND_BLUE };

// Bolt colors must READ on the navy page. Dark school primaries (Ole Miss navy #14213D, Auburn,
// Georgia) blend into the background and the bolt looks half-erased — so lift any low-contrast
// color toward white until it's visible, preserving hue (navy → steel-blue, still "their color").
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
// School bolt colors, contrast-guaranteed on navy. brighter of the two leads (primary), so the
// bolt's dominant tone is always the one that reads.
const boltFor = (id: string) => {
  const c = schoolColors(id);
  const a = readable(c.c1), b = readable(c.c2);
  return lum(hx(b)) > lum(hx(a)) ? { c1: b, c2: a } : { c1: a, c2: b };
};

// Static fallbacks for the topic lists when live data isn't published yet (the menu IS the marketing,
// so we never show an empty page — real sets replace these as they go live).
const STATIC_EXAM1 = ["Types of Accounts", "A = L + E", "Debits & Credits", "Journal Entries", "Adjusting Entries", "Closing Entries"];
const STATIC_EXAM2 = ["Merchandising", "Inventory (FIFO / LIFO)", "Multi-step Income Statement", "Internal Controls", "Receivables"];
const STATIC_EXAM3 = ["Long-Term Assets", "Current Liabilities", "Long-Term Liabilities", "Equity", "Statement of Cash Flows"];

const setName = (n?: string) => (n ?? "Set").replace(/^\s*ch\s*\d+\s*·\s*/i, "").trim() || "Set";

export function LandingPage() {
  const [school, setSchool] = useState<School | null>(null);
  const [theater, setTheater] = useState<School | null>(null);
  const [playing, setPlaying] = useState<{ set: StudentSet; chip: string } | null>(null);

  const theme = useMemo(() => {
    if (!school) return DEFAULT_FRAME_THEME;
    const c = boltFor(school.id);
    return { ...DEFAULT_FRAME_THEME, boltPrimary: c.c1, boltSecondary: c.c2 }; // recolor bolt (contrast-safe); keep the gold accent
  }, [school]);

  const treeQ = useQuery({ queryKey: ["landing-tree", school?.campusId ?? null], queryFn: () => fetchStudentTree({ data: school ? { campusId: school.campusId } : {} }), networkMode: "always", staleTime: 300_000 });
  const intro1 = useMemo(() => (treeQ.data ?? []).find((c) => c.family === "intro_1" || c.name.trim().toLowerCase() === "intro 1") ?? null, [treeQ.data]);

  // Mapped (State 3) vs unmapped (State 4): a campus is mapped once it has ≥1 active exam. The
  // 0105 tables may be unapplied → swallow the loud error and treat as unmapped.
  const mappedQ = useQuery({
    queryKey: ["landing-mapped", school?.campusId ?? null, intro1?.id ?? null],
    queryFn: async () => { try { return await listCampusExams({ data: { campus_id: school!.campusId, course_id: intro1!.id } }); } catch { return []; } },
    enabled: !!school && !!intro1, networkMode: "always",
  });
  const mapped = (mappedQ.data ?? []).some((e) => e.status === "active");

  // Exam-1 topics: the campus-adjusted tree already applies overrides + exam grouping server-side.
  const exam1Topics = useMemo<StudentTopic[]>(() => {
    if (!intro1) return [];
    const u = intro1.units.find((x) => /exam\s*1|test\s*1/i.test(x.name)) ?? intro1.units[0];
    return u?.topics ?? intro1.topics ?? [];
  }, [intro1]);
  const exam2Topics = useMemo(() => intro1?.units.find((x) => /exam\s*2|test\s*2/i.test(x.name))?.topics ?? [], [intro1]);
  const exam3Topics = useMemo(() => intro1?.units.find((x) => /exam\s*3|test\s*3|final/i.test(x.name))?.topics ?? [], [intro1]);

  const pickSchool = (s: School) => {
    setSchool(s);
    const seen = (() => { try { return localStorage.getItem(THEATER_KEY) === "1"; } catch { return false; } })();
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduce) return;
    try { localStorage.setItem(THEATER_KEY, "1"); } catch { /* ignore */ }
    setTheater(s);
  };

  return (
    <div style={{ ...frameThemeVars(theme), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      {/* orbital atmosphere, fixed behind everything */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.34} animate /></div>

      <main style={{ position: "relative", zIndex: 1, maxWidth: 940, margin: "0 auto", padding: "0 20px" }}>
        <Hero school={school} onPick={pickSchool} />
        <Exam1Block topics={exam1Topics} loading={treeQ.isLoading} onPlay={(set, chip) => setPlaying({ set, chip })} />
        <LockedExams exam2={exam2Topics} exam3={exam3Topics} />
        {school && !mapped && <UnmappedBanner school={school} />}
        {school && mapped && <div className="mx-auto mb-10 max-w-2xl rounded-xl px-4 py-3 text-center text-[13px]" style={{ background: "rgba(59,245,160,0.10)", border: "1px solid rgba(59,245,160,0.3)", color: "#8DF5C4" }}>✓ Reorganized around {school.name}'s exams — chapter numbers match your course.</div>}
        <LeeSection />
        <TestimonialStrip />
        <GreekStrip />
        <Footer />
      </main>

      {theater && <Theater school={theater} onDone={() => setTheater(null)} />}
      {playing && <VideoModal set={playing.set} chipText={playing.chip} onClose={() => setPlaying(null)} />}
    </div>
  );
}

// ---- HERO -------------------------------------------------------------------------------------
function Hero({ school, onPick }: { school: School | null; onPick: (s: School) => void }) {
  return (
    <section className="flex flex-col items-center pt-16 pb-10 text-center sm:pt-24">
      <SurviveWordmark size={92} />
      <h1 className="mt-5 text-[26px] font-black sm:text-[34px]" style={{ letterSpacing: "-0.01em" }}>Only what's on your exam.</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed sm:text-[17px]" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
        Free cram videos for Intro Financial Accounting — built around your school's exams, not the textbook.
      </p>
      <div className="mt-8 w-full max-w-md"><CampusSelector school={school} onPick={onPick} /></div>
      <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Ole Miss · LSU · Alabama · +13 SEC schools</p>
      <p className="mt-6 text-[13.5px] font-semibold" style={{ color: "var(--accent)" }}>Exam 1 is free. No account, no email, just press play.</p>
    </section>
  );
}

// ---- CAMPUS SELECTOR (the one piece of theater) ----------------------------------------------
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
                <span className="text-[14.5px] font-semibold" style={{ color: "var(--brand-cream)" }}>{s.name}</span>
              </button>
            ); })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- THEATER (State 2): navy floods, the bolt recolors center-screen, one beat, skippable -----
function Theater({ school, onDone }: { school: School; onDone: () => void }) {
  const c = boltFor(school.id);
  useEffect(() => {
    const t = window.setTimeout(onDone, 1150);
    const cut = () => onDone();
    window.addEventListener("scroll", cut, { once: true });
    return () => { window.clearTimeout(t); window.removeEventListener("scroll", cut); };
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center" style={{ background: "var(--brand-navy)", animation: "sa-land-fade 1150ms ease forwards" }} onClick={onDone}>
      <style>{`@keyframes sa-land-fade{0%{opacity:0}12%{opacity:1}78%{opacity:1}100%{opacity:0}}`}</style>
      <div className="flex flex-col items-center gap-6">
        <BoltBoil height={280} red={c.c1} blue={c.c2} />
        <div className="text-[22px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--brand-cream)" }}>{school.name}</div>
      </div>
    </div>
  );
}

// ---- EXAM 1 — FREE (real topic list, ungated, playable) --------------------------------------
function Exam1Block({ topics, loading, onPlay }: { topics: StudentTopic[]; loading: boolean; onPlay: (set: StudentSet, chip: string) => void }) {
  return (
    <section id="exam1" className="mx-auto mb-6 max-w-2xl scroll-mt-8">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-[13px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>⚡ Exam 1 — free, forever</span>
      </div>
      <p className="mb-4 text-[14px]" style={{ color: "var(--brand-cream)", opacity: 0.8 }}>Watch in order or jump to what's killing you.</p>
      <div className="overflow-hidden rounded-2xl" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
        {loading && <div className="px-5 py-6 text-[13px] italic" style={{ color: "var(--text-muted)" }}>Loading topics…</div>}
        {!loading && topics.length === 0 && STATIC_EXAM1.map((name, i) => <TopicRow key={i} label={name} state="soon" />)}
        {!loading && topics.flatMap((t) => {
          const rows = t.sets.map((s) => ({ topic: t, set: s }));
          if (rows.length === 0) return [<TopicRow key={t.id} label={t.name} num={t.number} state="soon" />];
          return rows.map(({ topic, set }) => (
            <TopicRow
              key={set.id}
              label={setName(set.name) || topic.name}
              num={topic.number}
              state={set.access === "paid" ? "locked" : set.playbackId ? "play" : "soon"}
              onPlay={() => onPlay(set, topic.shortLabel || topic.name)}
            />
          ));
        })}
      </div>
    </section>
  );
}

function TopicRow({ label, num, state, onPlay }: { label: string; num?: number | null; state: "play" | "soon" | "locked"; onPlay?: () => void }) {
  const playable = state === "play";
  return (
    <button
      disabled={!playable}
      onClick={onPlay}
      className="flex w-full items-center gap-3 border-b px-5 py-3.5 text-left last:border-b-0"
      style={{ borderColor: "rgba(245,239,230,0.08)", cursor: playable ? "pointer" : "default", opacity: state === "soon" ? 0.62 : 1 }}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px]" style={{ background: playable ? "var(--accent)" : "transparent", border: playable ? "none" : "1px solid rgba(245,239,230,0.3)", color: "#0B1220" }}>
        {playable ? <Play className="h-3 w-3" style={{ fill: "#0B1220" }} /> : state === "locked" ? <Lock className="h-3 w-3" style={{ color: "var(--brand-cream)" }} /> : <span style={{ color: "var(--brand-cream)", opacity: 0.6 }}>○</span>}
      </span>
      {num != null && <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>Ch {num}</span>}
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" style={{ color: "var(--brand-cream)" }}>{label}</span>
      {state === "soon" && <span className="shrink-0 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>coming soon</span>}
      {playable && <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Free ▶</span>}
    </button>
  );
}

// ---- EXAM 2 / 3 + Semester Pass — visible, not yet purchasable --------------------------------
function LockedExams({ exam2, exam3 }: { exam2: StudentTopic[]; exam3: StudentTopic[] }) {
  const n2 = exam2.length ? exam2.map((t) => t.name) : STATIC_EXAM2;
  const n3 = exam3.length ? exam3.map((t) => t.name) : STATIC_EXAM3;
  return (
    <section className="mx-auto mb-10 max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <LockedCard title="Exam 2" price="$50" topics={n2} />
        <LockedCard title="Exam 3" price="$50" topics={n3} />
      </div>
      <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl px-5 py-4" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
        <span className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>Semester Pass</span>
        <span className="text-[15px] font-black" style={{ color: "var(--accent)" }}>$150</span>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>— every exam, all semester</span>
      </div>
      <p className="mt-3 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Paid exams open once your course is mapped. Exam 1 stays free.</p>
    </section>
  );
}

function LockedCard({ title, price, topics }: { title: string; price: string; topics: string[] }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-5" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-[14px] font-black uppercase tracking-wide" style={{ color: "var(--brand-cream)" }}>{title}</span>
        <span className="text-[14px] font-black" style={{ color: "var(--accent)" }}>{price}</span>
      </div>
      {/* topics readable (the menu is the marketing); a blurred "stem" line stands in for questions */}
      <ul className="space-y-1.5">
        {topics.map((t, i) => (
          <li key={i} className="text-[13.5px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>· {t}</li>
        ))}
      </ul>
      <div className="mt-3 space-y-1.5" aria-hidden>
        {[0, 1].map((i) => <div key={i} className="h-2 rounded" style={{ width: i ? "70%" : "88%", background: "rgba(245,239,230,0.16)", filter: "blur(2px)" }} />)}
      </div>
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: "rgba(245,239,230,0.08)", color: "var(--text-muted)" }}>
        <Lock className="h-3 w-3" /> Coming soon
      </div>
    </div>
  );
}

// ---- UNMAPPED-CAMPUS BANNER (State 4) --------------------------------------------------------
function UnmappedBanner({ school }: { school: School }) {
  return (
    <section className="mx-auto mb-10 max-w-2xl rounded-2xl p-6" style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)" }}>
      <p className="text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)" }}>
        I haven't mapped <b>{school.name}</b>'s exams yet. Exam 1 is free for you anyway — and if you send your syllabus, I'll organize everything around your exact course.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a href="/order" className="rounded-xl px-4 py-2.5 text-[13.5px] font-bold" style={{ background: "var(--accent)", color: "#0B1220" }}>Send my syllabus</a>
        <button onClick={() => document.getElementById("exam1")?.scrollIntoView({ behavior: "smooth" })} className="rounded-xl px-4 py-2.5 text-[13.5px] font-bold" style={{ border: "1px solid rgba(245,239,230,0.3)", color: "var(--brand-cream)" }}>Just start watching</button>
      </div>
    </section>
  );
}

// ---- THE LEE SECTION (the one section allowed to run warm) ------------------------------------
function LeeSection() {
  return (
    <section className="mx-auto mb-12 max-w-3xl rounded-3xl p-7 sm:p-10" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="shrink-0"><LeePortrait /></div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>Ole Miss accounting grad · tutoring this course since 2015</p>
          <p className="mt-4 text-[20px] font-black leading-snug sm:text-[23px]" style={{ color: "var(--brand-cream)" }}>“It was nothing like what we did in class.”</p>
          <p className="mt-1 text-[13px] italic" style={{ color: "var(--text-muted)" }}>My students tell me this every semester. Ouch.</p>

          <div className="mt-5 space-y-4 text-[15px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.92 }}>
            <p><b style={{ opacity: 1 }}>That's because lectures only teach you <i>about</i> accounting. Exams test whether you can actually <i>do</i> accounting.</b> This platform helps you prep for that.</p>
            <p>I've seen students study 20+ hours, understand the material, and still fail — because on exam day you felt like a deer in headlights. If you fail even one exam it can be hard to come back: students retake this course every semester, spend thousands of dollars, waste time, and lose confidence. I'd rather see you spend that time and money enjoying college — and building confidence.</p>
            <p>That's why I'm building Survive Accounting. Think of it as exam insurance for Intro accounting — a growing library of cram videos, practice exams, and interactive solutions designed around the topics you're actually tested on. I do this full time (and love it), so I'm building out new topics every week. If your class covers something that isn't here yet, tell me — that's how I decide what to build next.</p>
            <p>Every cram video ends with interactive practice exams, so you're not just watching — you're practicing what you'll be expected to know on exam day.</p>
            <p>So I can serve you best, <a href="/order" style={{ color: "var(--accent)", fontWeight: 700 }}>upload your syllabus or exam study guide</a>. My team and I will reorganize the topics list to fit your exact course — reviewing syllabi is how I decide what to build next and how new campuses come online.</p>
            <p>I'm building Survive Accounting one topic at a time, with the goal of supporting students at every SEC business school — and eventually business schools across the country. I give away Exam 1 for free so you can get a feel for how this works before you buy anything. I really appreciate all the support.</p>
            <p>Email me anytime — I read and respond to every student.</p>
          </div>

          <div className="mt-6">
            <p className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>Lee Ingram</p>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Founder, SurviveAccounting.com · accounting grad, Ole Miss · tutored since 2015</p>
            <a href={`mailto:${EMAIL}`} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--accent)" }}><Mail className="h-3.5 w-3.5" /> {EMAIL}</a>
          </div>
        </div>
      </div>
    </section>
  );
}

// Lee's real portrait (public/lee-portrait.svg — a single currentColor path). An <img> can't
// inherit our cream, so we paint it as a CSS mask: the SVG shape masks a cream fill. Keeps the
// heavy path data out of the JS bundle (cached static asset) and stays on-brand cream.
function LeePortrait() {
  return (
    <div
      role="img" aria-label="Portrait of Lee Ingram"
      className="mx-auto sm:mx-0"
      style={{
        width: 132, height: 187, background: "var(--brand-cream)",
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

// ---- GREEK + FOOTER --------------------------------------------------------------------------
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
    <footer className="flex flex-col items-center gap-4 border-t py-12 text-center" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
      <span className="inline-block h-9 w-6"><Bolt c1="var(--bolt-primary)" c2="var(--bolt-secondary)" /></span>
      <p className="text-[15px] font-bold" style={{ color: "var(--brand-cream)" }}>Questions? Text me — I read every message myself.</p>
      <a href={`sms:${TEL}`} className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-black" style={{ background: "var(--accent)", color: "#0B1220" }}>
        <MessageCircle className="h-4 w-4" /> Text Lee {PHONE}
      </a>
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>surviveaccounting.com · Only what's on your exam.</p>
    </footer>
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
