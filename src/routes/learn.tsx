// /learn — v3 (09-03): YouTube's bones, in the Blackboard.
//
// HOME: skinny rail (content types; hamburger = the path) · frozen top (brand, who you are, the
// reminder) · topic chips · three plan cards with a live study time · Start · rows per type.
// PLAYER (?set=<id>): the Shorts view — one vertical video, actions hugging it, Practice as a
// drawer (the real PracticeStage), Ask Lee, Share, Got it; ↑↓ / swipe through the exam.
// The accent is the school's colour when readable on black, lime otherwise (learn-theme.ts).
//
// KEPT: magic-link auth, per-set progress (localStorage signed-out / student_set_progress
// signed-in), entitlements + the honest paywall, the Greek share funnel (LearnCta's sheets,
// useShareContext), ?demo=1, and the deep links /learn?campus=<id>&set=<id>.
//
// THE PHONE PASS (Lee, 2026-09-10): no admin pills on a student page (the LearnStateSwitcher
// mount is gone — ?test=A..F still forces a CTA state from the address, which is all it ever
// did); ONE loading screen (LearnLoading: the brand splash IS the loading screen, skipped on a
// repeat visit in the session); "pick school" opens LearnSchoolSheet in place and re-themes the
// page via /learn?campus=<id>; the email gate on every topic after Easy Points (LearnHome); the
// reminder block and a one-line footer at the bottom of the page and of the path drawer.
//
// THE DESKTOP PASS (Lee, 2026-09-10: "/learn on desktop is showing up like the mobile version").
// Three tiers from useTier (narrow < 640 / mid / wide ≥ 1024) replace the one `narrow` flag; the
// home is a centred 1280 column with an entrance (the campus bolt, "Like Reels for exam prep.",
// the real average video length, Start) and grid rows — see LearnHome / LearnEntrance. The loading
// screen is a moment (LearnLoading: strike, settle, wipe). ?look=navy renders the room in the home
// page's palette for a side-by-side (learn-theme's themeFor(school, look)); default stays black.
//
// THE REDESIGN (Lee, 2026-09-11 — docs/LEARN-REDESIGN-PROPOSAL-2026-09-11.md, built as written).
// ONE COLUMN: the rail, the bottom tabs and the narrow "Your path" drawer are no longer mounted on
// any tier (LearnRail.tsx stays in the tree; nothing renders it). The navbar (LearnTop) carries the
// big campus bolt with the chapter's letters over it, "survive", the campus over "ACCY 201 ·
// Exam 1", the exam pills (Exam 2/3 locked → the $50 waitlist sheet), Leave a review · Share ·
// a hamburger (share, reminders, home, sign in/out, Greek chapter, rep program). The hero is
// centred with one "Get started" (LearnEntrance); the rows carry their own counts only
// (LearnHome); Text Lee floats bottom-right on every tier (LearnTextLee). Black stays the palette;
// ?look=navy still renders the side-by-side.
//
// THE LOOK CANDIDATES (Lee, 2026-09-11: "give me a bunch of possible options to try with ?look=.
// I want to pick only the best one"). Eight looks in learn-theme's LOOKS — black, navy, cream,
// paper, chalk, charcoal, split, mono — behind ?look=<name>; ?looks=1 mounts LearnLookPicker,
// a floating bottom-left strip that rewrites ?look= so every look can be flipped through on one
// page with a school picked. Default stays black until Lee picks. In every look the navbar is the
// shell's own ground and the campus shows only in the bolt, the hairline and the accent.
//
// Wireframes and the decisions behind this: the "Learn Dashboard Wireframes" canvas, Round 5.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Lock, Mail, X } from "lucide-react";

import { useDismiss } from "@/lib/use-dismiss";
import { joinPricingWaitlist } from "@/lib/pricing-api";
import { fetchStudentTree, type PracticeQuestion, type StudentCourse, type StudentSet, type StudentTopic } from "@/lib/student.functions";
import { isPlayable } from "@/lib/set-flow";
import type { SetStage } from "@/lib/set-flow";
import { listOverrideCampuses, type CampusOpt } from "@/lib/campus-overrides.functions";
import { claimMyOrders, fetchMyUnlockedTopics, getSetPlayback } from "@/lib/entitlements.functions";
import { campusOgImageV, campusShareOg, ogMeta } from "@/lib/og";
import { supabase } from "@/integrations/supabase/client";
import { useStudentAuth } from "@/lib/use-student-auth";
import type { ExamTabState } from "@/components/learn/ExamRail";
import { LearnCta, openLearnCta } from "@/components/learn/LearnCta";
import { useShareContext } from "@/components/learn/ShareBanner";
import { LearnLoading } from "@/components/learn/LearnLoading";
import { LearnSchoolSheet } from "@/components/learn/LearnSchoolSheet";
import { readUnlocked } from "@/components/learn/learn-gate";
import { rememberCampus } from "@/lib/campus-prefs";
import { LearnTop, usePickedChapter } from "@/components/learn/LearnTop";
import type { RailKey } from "@/components/learn/LearnRail";
import { LearnHome, type HomeSet, type Plan } from "@/components/learn/LearnHome";
import { LearnTextLee } from "@/components/learn/LearnTextLee";
import { LearnLookPicker } from "@/components/learn/LearnLookPicker";
import { CramPlayer, type PlayerItem } from "@/components/learn/CramPlayer";
import { LearnAsksBar } from "@/components/learn/LearnAsksBar";
import { isLook, LK, LEARN_CSS, themeFor, themeStyle, type Look } from "@/components/learn/learn-theme";
import { useTier } from "@/components/learn/use-tier";
import { DEMO_PLAYBACK, LAST_SET_KEY, type Prog, type ProgressState } from "@/components/learn/cram-media";
import { daysUntil, EXAM_DATE_EVENT, readExamDate } from "@/components/learn/exam-date";
import { schoolByCampusId, schoolBySlug, type School } from "@/lib/schools";
import { isContactRef } from "@/lib/contact-ref";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

type LearnSearch = {
  campus?: string; topic?: string; set?: string; stage?: SetStage; demo?: boolean;
  // ── GREEK SHARE FUNNEL (learn-share-flow) ──────────────────────────────────────────────────
  // ref = the contact WE messaged (recipient). by = a PERSON who forwarded the link (sharer;
  // shows the "sent by" line). g = the campus slug the /s/<campus> hop resolved. test = force a
  // CTA state (A–F) or the banner, client-side, no DB.
  ref?: string; by?: string; g?: string; test?: string;
  /** ?look=<name> — one of learn-theme's LOOKS instead of the Blackboard. */
  look?: Look;
  /** ?looks=1 — mount the floating look picker (LearnLookPicker). */
  looks?: true;
};

export const Route = createFileRoute("/learn")({
  validateSearch: (s: Record<string, unknown>): LearnSearch => ({
    campus: typeof s.campus === "string" && s.campus ? s.campus : undefined,
    topic: typeof s.topic === "string" && s.topic ? s.topic : undefined,
    // ?set=<id> opens the player on that set; ?stage=practice opens its practice drawer.
    set: typeof s.set === "string" && s.set ? s.set : undefined,
    stage: s.stage === "cram" || s.stage === "practice" || s.stage === "review" ? s.stage : undefined,
    demo: s.demo === true || s.demo === 1 || s.demo === "1" || s.demo === "true" ? true : undefined,
    ref: typeof s.ref === "string" && isContactRef(s.ref) ? s.ref : undefined,
    by: typeof s.by === "string" && isContactRef(s.by) ? s.by : undefined,
    g: typeof s.g === "string" && s.g ? s.g : undefined,
    test: typeof s.test === "string" && s.test ? s.test : undefined,
    look: isLook(s.look) && s.look !== "black" ? s.look : undefined,
    looks: s.looks === true || s.looks === 1 || s.looks === "1" || s.looks === "true" ? true : undefined,
  }),
  // A SHARED /s/<campus> LINK LANDS HERE. That route is a redirect, so the preview a chat app
  // builds comes from THIS page's tags — and with only a title it previewed as the generic site
  // tile, which is the least useful version of the one link most likely to be pasted into a group
  // chat. Resolved in a loader because head() has no access to search; the lookup is a synchronous
  // map hit against the static school table, so this adds no request work.
  loaderDeps: ({ search }: { search: LearnSearch }) => ({ campus: search.campus, g: search.g }),
  loader: ({ deps }: { deps: { campus?: string; g?: string } }) => ({
    // campus is an id (the /s/ hop's deep link); g is the slug it also carries. Either resolves.
    ogSchool: schoolByCampusId(deps.campus) ?? schoolBySlug(deps.g) ?? null,
  }),
  // noindex STAYS either way: a deep-linked study surface has no business in search results, and
  // noindex governs indexing, not the preview a chat app builds.
  head: ({ loaderData }) => {
    const school = (loaderData as { ogSchool?: { slug: string; name: string; courseCode: string | null } | null } | undefined)?.ogSchool ?? null;
    return {
      meta: [
        ...(school
          ? ogMeta({
              ...campusShareOg(school.courseCode, school.name),
              path: `/s/${school.slug}`,
              image: campusOgImageV(school.slug),
            })
          : [{ title: "⚡ Learn — Survive Accounting" }]),
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: LearnShell,
});

// ---- DEMO (?demo=1) — a placeholder tree + canned questions so the surface can be walked before
//      any real video ships. Pure client-side; demo ids never reach the DB. -----------------------
const DEMO_QUESTIONS: PracticeQuestion[] = [
  { id: "dq1", prompt: "A company pays $1,200 on Oct 1 for a 12-month insurance policy. What does the Oct 1 entry debit?", shorthand: "Prepaid → expense", choices: [
    { id: "a", text: "Insurance Expense", correct: false, feedback: "Not yet — nothing is used up on day one. Watch for the words 'pays in advance'." },
    { id: "b", text: "Prepaid Insurance", correct: true, feedback: "Paying in advance buys an ASSET; it becomes expense as months pass." },
    { id: "c", text: "Cash", correct: false, feedback: "Cash is the CREDIT here — it's what leaves." },
  ] },
  { id: "dq2", prompt: "Which pair keeps the accounting equation in balance after buying supplies on account?", shorthand: "A = L + E", choices: [
    { id: "a", text: "Assets up, Liabilities up", correct: true, feedback: "Supplies (asset) rise, Accounts Payable (liability) rises — balanced." },
    { id: "b", text: "Assets up, Equity up", correct: false, feedback: "'On account' means a payable, not owner money." },
  ] },
];
function demoTree(): StudentCourse[] {
  const set = (id: string, name: string, o: Partial<StudentSet> = {}): StudentSet => ({ id: `demo-${id}`, name, access: "free", orientation: "portrait", playbackId: DEMO_PLAYBACK, ceqCount: 0, runtimeSec: null, hasReview: false, reviewPlaybackId: null, reviewRuntimeSec: null, firstStem: null, shortLabel: null, ...o });
  return [{
    id: "demo-intro1", name: "Intro 1", family: "intro",
    units: [
      { id: "demo-exam1", name: "Exam 1", topics: [
        { id: "demo-t1", name: "Easy Points", shortLabel: "Easy", number: 1, sets: [
          set("s1", "Internal vs. external users", { runtimeSec: 102, ceqCount: 8, firstStem: "Which of the following is a user of financial accounting information?", shortLabel: "Users of accounting" }),
          set("s2", "Financial vs. managerial accounting", { runtimeSec: 98, ceqCount: 8, shortLabel: "Financial vs. managerial" }),
          set("s3", "Principles & assumptions", { runtimeSec: 120, ceqCount: 11, shortLabel: "Principles" }),
          set("s4", "Standards & regulation", { runtimeSec: 115, ceqCount: 13, shortLabel: "Standards" }),
          // Not posted yet (playbackId null) — so the demo walks the partial-topic state: a grey
          // card in the first row and the "Get notified when these drop." box under it.
          set("s5", "Accounting careers", { playbackId: null, ceqCount: 10, shortLabel: "Careers" }),
        ] },
        { id: "demo-t2", name: "Analyzing Transactions", shortLabel: "Analyzing", number: 2, sets: [
          set("s6", "Account classification", { runtimeSec: 89, ceqCount: 12, shortLabel: "Classify accounts" }),
          set("s7", "Equation effects", { runtimeSec: 65, ceqCount: 9, orientation: "landscape", shortLabel: "Equation effects" }),
          set("s8", "Trial balance", { playbackId: null, ceqCount: 4, shortLabel: "Trial balance" }),
        ] },
        // A topic with NOTHING posted yet: black-and-white heading, grey cards, the waitlist ask.
        { id: "demo-t3", name: "Adjusting Entries", shortLabel: "Adjusting", number: 3, sets: [
          set("s9a", "Accruals", { playbackId: null, ceqCount: 7, shortLabel: "Accruals" }),
          set("s9b", "Deferrals", { playbackId: null, ceqCount: 6, shortLabel: "Deferrals" }),
          set("s9c", "Depreciation", { playbackId: null, ceqCount: 5, shortLabel: "Depreciation" }),
        ] },
      ] },
      { id: "demo-exam2", name: "Exam 2", topics: [
        { id: "demo-t4", name: "Merchandising", shortLabel: "Merch", number: 4, sets: [set("s10", "Perpetual vs Periodic", { access: "paid", playbackId: null, runtimeSec: 455, ceqCount: 8 })] },
      ] },
    ],
    topics: [],
  }];
}

// Magic-link sign-in — for a student who already has an account. Never a password field.
function SignInDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  useDismiss<HTMLDivElement>(onClose, { outside: false });
  const send = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setState("error"); setMsg("Enter a valid email."); return; }
    setState("sending");
    const redirect = typeof window !== "undefined" ? `${window.location.origin}/learn` : undefined;
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect } });
    if (error) { setState("error"); setMsg(error.message); return; }
    setState("sent");
  };
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="lk-in w-full max-w-sm rounded-2xl p-5" style={{ background: LK.surface, border: `1px solid ${LK.border}`, color: LK.text }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2"><Mail className="h-4 w-4" style={{ color: "var(--lk-acc)" }} /><span className="lk-disp" style={{ fontSize: 18 }}>Pick up where you left off</span><button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid h-8 w-8 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button></div>
        {state === "sent" ? (
          <p className="text-[13px] leading-relaxed" style={{ color: LK.muted }}>Check <b style={{ color: LK.text }}>{email}</b> and tap the link. That's it.</p>
        ) : (
          <>
            <input type="email" autoFocus inputMode="email" autoComplete="email" placeholder="the email you used" className="lk-field" value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} />
            {state === "error" && <p className="mt-1.5 text-[12px]" style={{ color: LK.red }}>{msg}</p>}
            <button type="button" disabled={state === "sending"} className="lk-btn lk-btn-acc mt-3 w-full disabled:opacity-50" style={{ minHeight: 46 }} onClick={() => void send()}>{state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send me in</button>
          </>
        )}
      </div>
    </div>
  );
}

// NOTIFY-NOT-PAY: no checkout yet, so a locked topic captures an email into the pricing waitlist.
function Paywall({ topic, campusName, campusId, demo, onClose, onRestore, restoring }: { topic: StudentTopic; campusName: string | null; campusId: string | null; demo: boolean; onClose: () => void; onRestore?: () => void; restoring?: boolean }) {
  const n = topic.sets.length;
  const key = `sa-notify-topic-${topic.id}`;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"open" | "busy" | "done" | "error">(() => { try { return localStorage.getItem(key) === "done" ? "done" : "open"; } catch { return "open"; } });
  const submit = async () => {
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || state === "busy") return;
    setState("busy");
    try {
      if (!demo) await joinPricingWaitlist({ email: e, campus: campusName, campusId, course: topic.name, tier: "test_pass" });
      setState("done"); try { localStorage.setItem(key, "done"); } catch { /* ignore */ }
    } catch { setState("error"); }
  };
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="lk-in w-full max-w-md rounded-2xl p-5" style={{ background: LK.surface, border: `1px solid ${LK.border}`, color: LK.text }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2"><Lock className="h-4 w-4" style={{ color: LK.muted }} /><span className="lk-disp" style={{ fontSize: 18 }}>{topic.name} is coming</span></div>
        <p className="text-[13px] leading-relaxed" style={{ color: LK.muted }}>{n} cram {n === 1 ? "video" : "videos"} in <b style={{ color: LK.text }}>{topic.name}</b>{topic.sets.slice(0, 3).length > 0 && <> — {topic.sets.slice(0, 3).map((s) => s.name).join(", ")}{n > 3 ? `, +${n - 3} more` : ""}</>}.</p>
        <div className="mt-4 flex flex-col gap-2">
          {state === "done" ? (
            <p className="text-[13px] font-semibold">✓ You're on the list — I'll email you the day {topic.name} opens.</p>
          ) : (
            <>
              <input value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("open"); }} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu" className="lk-field" />
              <button type="button" onClick={() => void submit()} disabled={state === "busy"} className="lk-btn lk-btn-acc disabled:opacity-50" style={{ minHeight: 46 }}>{state === "busy" ? "…" : `Tell me when ${topic.name} is ready`}</button>
              {state === "error" && <p className="text-[12px]" style={{ color: LK.red }}>Couldn't save that — try again in a moment.</p>}
            </>
          )}
        </div>
        {onRestore && <button type="button" className="lk-btn mt-2 w-full disabled:opacity-50" style={{ background: "transparent", color: "var(--lk-acc)" }} disabled={restoring} onClick={onRestore}>{restoring ? "Checking…" : "Already have access? Restore it"}</button>}
        <button type="button" className="lk-btn mt-1 w-full" style={{ background: "transparent", color: LK.muted }} onClick={onClose}>Keep cramming</button>
      </div>
    </div>
  );
}

const examNumOf = (unitName: string): number | null => { const m = /exam\s*(\d+)/i.exec(unitName); return m ? Number(m[1]) : /final/i.test(unitName) ? 4 : null; };
const PLAN_KEY = "sa-learn-plan";
// STUDY SHELL SIMPLIFICATION (2026-09-09) — the persistent bottom promotional/CTA banner
// (fraternity/sorority pitch, campus-rep pitch, syllabus ask) is hidden from the ordinary student
// view; it read as a sales interruption on a study page. The component, its dismiss-for-session
// behaviour, and its three asks are unchanged and not deleted — only this flag, and therefore the
// mount point below, is off. Flip back to true to restore it.
const SHOW_ASKS_BAR = false;

function LearnShell() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const demo = !!search.demo;
  const shareCtx = useShareContext({ by: search.by, ref: search.ref, test: search.test });
  const [campusId, setCampusId] = useState<string | null>(() => { if (search.campus) return search.campus; try { return localStorage.getItem("sa-learn-campus"); } catch { return null; } });
  useEffect(() => { try { if (campusId) localStorage.setItem("sa-learn-campus", campusId); else localStorage.removeItem("sa-learn-campus"); } catch { /* ignore */ } }, [campusId]);
  // THE LINK WINS. A shared /s/<campus> link carries ?g; it must beat whatever campus this browser
  // last studied (a Bama link opened by someone who once looked at Ole Miss is a Bama link).
  useEffect(() => { if (search.g) { const s = schoolBySlug(search.g); if (s?.campusId && s.campusId !== campusId) setCampusId(s.campusId); } }, [campusId, search.g]);
  // ?campus= CHANGING UNDER A MOUNTED PAGE (2026-09-10): the in-place school picker rewrites the
  // address without remounting, so the state seeded from search.campus above has to follow it.
  useEffect(() => { if (search.campus && search.campus !== campusId) setCampusId(search.campus); }, [campusId, search.campus]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickSchool = (s: School) => {
    setPickerOpen(false);
    if (!s.campusId) return;
    // The site-wide "last used campus" cookie/key — so the homepage agrees with the pick, the way
    // it does when the pick is made there.
    rememberCampus(s.id);
    setCampusId(s.campusId);
    // ?g (a shared link's slug) would outrank the new campus — see THE LINK WINS — so it goes;
    // so do set/stage/topic, which belong to the old campus's tree. ref/by/test/demo ride along.
    void navigate({ search: (p: LearnSearch) => ({ ...p, campus: s.campusId, g: undefined, set: undefined, stage: undefined, topic: undefined }), replace: true });
  };
  // THE EMAIL GATE (learn-gate.ts) — passed once on this device, or never shown to a signed-in
  // student. Read in an effect: storage is client-only.
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(readUnlocked()); }, []);
  const campusesQ = useQuery({ queryKey: ["override-campuses"], queryFn: () => listOverrideCampuses(), staleTime: 300_000, networkMode: "always", enabled: !demo });
  const campuses: CampusOpt[] = campusesQ.data ?? [];
  const q = useQuery({ queryKey: ["student-tree", campusId], queryFn: () => fetchStudentTree({ data: { campusId: campusId ?? undefined } }), staleTime: 120_000, networkMode: "always", enabled: !demo });
  const demoCourses = useMemo(() => (demo ? demoTree() : null), [demo]);
  const courses: StudentCourse[] = useMemo(() => demoCourses ?? q.data ?? [], [demoCourses, q.data]);
  const isLoading = !demo && q.isLoading;
  const isError = !demo && q.isError;
  const [paywallTopic, setPaywallTopic] = useState<StudentTopic | null>(null);
  const tier = useTier();
  const isNarrow = tier === "narrow";
  const [pickedExam, setExamNum] = useState<number | null>(null);

  const school = schoolBySlug(search.g) ?? schoolByCampusId(campusId);
  const campusSlug = search.g ?? school?.slug ?? null;
  const campusName = school?.name ?? campuses.find((c) => c.id === campusId)?.name ?? null;
  const look: Look = search.look ?? "black";
  const theme = useMemo(() => themeFor(school, look), [school, look]);
  const pickLook = useCallback((next: Look) => {
    void navigate({ search: (p: LearnSearch) => ({ ...p, look: next === "black" ? undefined : next }), replace: true });
  }, [navigate]);

  // AUTH + PROGRESS — unchanged model: localStorage signed-out / student_set_progress signed-in.
  const { userId, email, signOut } = useStudentAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [progress, setProgress] = useState<Record<string, Prog>>({});
  const localKey = demo ? "sa-learn-progress-demo" : "sa-learn-progress";
  const useLocal = demo || !userId;
  useEffect(() => {
    if (useLocal) { try { setProgress(JSON.parse(localStorage.getItem(localKey) ?? "{}") as Record<string, Prog>); } catch { setProgress({}); } return; }
    let active = true;
    void (async () => {
      let r = await (supabase.from("student_set_progress" as never) as any).select("set_id,state,position_sec,duration_sec,updated_at");
      if (r.error && /position_sec|column/i.test(String(r.error.message ?? ""))) r = await (supabase.from("student_set_progress" as never) as any).select("set_id,state,updated_at");
      if (!active) return;
      const m: Record<string, Prog> = {};
      for (const row of (r.data ?? []) as { set_id: string; state: ProgressState; position_sec?: number | null; duration_sec?: number | null; updated_at?: string }[]) m[row.set_id] = { state: row.state, positionSec: row.position_sec ?? 0, durationSec: row.duration_sec ?? null, updatedAt: row.updated_at ? Date.parse(row.updated_at) : 0 };
      setProgress(m);
    })();
    return () => { active = false; };
  }, [userId, useLocal, localKey]);
  const writeRow = useCallback((setId: string, p: Prog) => {
    if (!userId) return;
    const t = supabase.from("student_set_progress" as never) as any;
    void t.upsert({ user_id: userId, set_id: setId, state: p.state, position_sec: p.positionSec, duration_sec: p.durationSec, updated_at: new Date().toISOString() }, { onConflict: "user_id,set_id" })
      .then((r: { error: { message?: string } | null }) => { if (r.error && /position_sec|duration_sec|column/i.test(String(r.error.message ?? ""))) void t.upsert({ user_id: userId, set_id: setId, state: p.state }, { onConflict: "user_id,set_id" }); });
  }, [userId]);
  const persist = useCallback((m: Record<string, Prog>, setId: string) => { if (useLocal) { try { localStorage.setItem(localKey, JSON.stringify(m)); } catch { /* ignore */ } } else writeRow(setId, m[setId]); }, [useLocal, localKey, writeRow]);
  const markProgress = useCallback((setId: string, next: ProgressState) => {
    setProgress((prev) => {
      const cur = prev[setId];
      if (cur?.state === "complete" && next === "in_progress") return prev;
      if (cur?.state === next && next === "in_progress") return prev;
      const p: Prog = { state: next, positionSec: next === "complete" ? 0 : (cur?.positionSec ?? 0), durationSec: cur?.durationSec ?? null, updatedAt: Date.now() };
      const m = { ...prev, [setId]: p }; persist(m, setId); return m;
    });
  }, [persist]);
  const markPosition = useCallback((setId: string, positionSec: number, durationSec: number | null) => {
    setProgress((prev) => {
      const cur = prev[setId];
      if (cur?.state === "complete") return prev;
      const p: Prog = { state: cur?.state ?? "in_progress", positionSec, durationSec: durationSec ?? cur?.durationSec ?? null, updatedAt: Date.now() };
      const m = { ...prev, [setId]: p }; persist(m, setId); return m;
    });
  }, [persist]);
  const onStarted = useCallback((id: string) => markProgress(id, "in_progress"), [markProgress]);
  const onComplete = useCallback((id: string) => markProgress(id, "complete"), [markProgress]);

  // ENTITLEMENTS
  const unlockedQ = useQuery({ queryKey: ["my-unlocked-topics", userId], queryFn: () => fetchMyUnlockedTopics(), enabled: !!userId && !demo, networkMode: "always" });
  const unlockedTopics = useMemo(() => new Set(unlockedQ.data ?? []), [unlockedQ.data]);
  const [restoring, setRestoring] = useState(false);
  const restore = async () => { setRestoring(true); try { await claimMyOrders(); await unlockedQ.refetch(); } finally { setRestoring(false); } };
  const [note, setNote] = useState<string | null>(null);
  const resolvePlayback = useCallback(async (set: StudentSet): Promise<string | null> => {
    const r = await getSetPlayback({ data: { setId: set.id, stage: "cram" } });
    if (r.status === "ok") return r.playbackId;
    if (r.status === "unpublished") setNote("This video isn't published yet — check back soon.");
    return null;
  }, []);

  // ── EXAMS ───────────────────────────────────────────────────────────────────────────────────
  const examTabs = useMemo<ExamTabState[]>(() => {
    const byNum = new Map<number, number>();
    for (const c of courses) for (const u of c.units) { const num = examNumOf(u.name); if (num == null) continue; byNum.set(num, (byNum.get(num) ?? 0) + u.topics.reduce((n, t) => n + t.sets.filter(isPlayable).length, 0)); }
    return [1, 2, 3, 4].map((n) => ({ num: n, label: n === 4 ? "Final" : `Exam ${n}`, available: (byNum.get(n) ?? 0) > 0, videoCount: byNum.get(n) ?? 0 }));
  }, [courses]);
  const examNum = pickedExam ?? examTabs.find((e) => e.available)?.num ?? null;
  const exam = examTabs.find((e) => e.num === examNum) ?? null;

  // ── THE SETS of the picked exam, in path order ──────────────────────────────────────────────
  const sets = useMemo<HomeSet[]>(() => {
    const out: HomeSet[] = [];
    const seen = new Set<string>();
    for (const c of courses) for (const u of c.units) {
      if (examNumOf(u.name) !== examNum) continue;
      for (const t of u.topics) {
        const inTopic = t.sets.filter((s) => isPlayable(s));
        inTopic.forEach((set, i) => {
          if (seen.has(set.id)) return; seen.add(set.id);
          const p = progress[set.id];
          out.push({ set, topic: t, n: i + 1, of: inTopic.length, locked: set.access === "paid" && !unlockedTopics.has(t.id), done: p?.state === "complete", watched: p?.durationSec ? Math.min(1, p.positionSec / p.durationSec) : 0, started: !!p && p.state !== "unstarted", playable: true });
        });
      }
    }
    return out;
  }, [courses, examNum, unlockedTopics, progress]);
  const topics = useMemo(() => Array.from(new Map(sets.map((s) => [s.topic.id, s.topic])).values()), [sets]);

  // The player walks every set with a cram video (locked ones show the paywall face).
  const playerItems = useMemo<PlayerItem[]>(() => sets.filter((s) => !!s.set.playbackId || s.locked).map((s) => ({ set: s.set, topic: s.topic, n: s.n, of: s.of, locked: s.locked })), [sets]);
  const playerIndex = search.set ? playerItems.findIndex((i) => i.set.id === search.set) : -1;
  const inPlayer = playerIndex >= 0;
  const [practice, setPractice] = useState(false);
  useEffect(() => { if (search.stage === "practice" && inPlayer) setPractice(true); }, [search.stage, inPlayer]);
  const openSet = (setId: string, withPractice = false) => {
    setPractice(withPractice);
    try { localStorage.setItem(LAST_SET_KEY, setId); } catch { /* ignore */ }
    void navigate({ search: (p: LearnSearch) => ({ ...p, set: setId, stage: withPractice ? "practice" : undefined }), replace: inPlayer });
  };
  const exitPlayer = () => { setPractice(false); void navigate({ search: (p: LearnSearch) => ({ ...p, set: undefined, stage: undefined }) }); };
  useEffect(() => { if (inPlayer && search.set) { try { localStorage.setItem(LAST_SET_KEY, search.set); } catch { /* ignore */ } } }, [inPlayer, search.set]);

  // THE PLAN — remembered per browser.
  const [plan, setPlanState] = useState<Plan>({ practice: false, review: false });
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(PLAN_KEY) ?? "null") as Plan | null; if (v) setPlanState(v); } catch { /* ignore */ } }, []);
  const setPlan = (p: Plan) => { setPlanState(p); try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch { /* ignore */ } };
  const [examDate, setExamDate] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setExamDate(examNum != null ? readExamDate(examNum) : null);
    read();
    window.addEventListener(EXAM_DATE_EVENT, read);
    return () => window.removeEventListener(EXAM_DATE_EVENT, read);
  }, [examNum]);
  const daysOut = examDate ? daysUntil(examDate) : null;

  // WHO-BLOCK + share
  const chapter = usePickedChapter(campusSlug, !demo);
  const ctaMounted = !demo && (!!campusSlug || !!search.test);
  // STUDY SHELL SIMPLIFICATION (2026-09-09) — LearnCta's own persistent bar (state C "Set up
  // <chapter>", D "<chapter> · N members · Join") is a scholarship-chair claim/setup ask, which
  // belongs on the dedicated Greek chapter landing page, not sitting under a student's study feed.
  // `ctaOwnBar` used to flip LearnCta into rendering that bar once a chapter was picked; it is
  // permanently false now, so LearnCta always renders `bare` (sheets only — pick/setup/share),
  // reachable exactly as before from the header's "Not your chapter?" / "which chapter are you
  // in?" links and the "Share with a friend" action. Nothing about the picking, joining, or
  // sharing FLOW changed — only the always-visible bar is gone.
  const ctaOwnBar = false;
  const share = async () => {
    if (ctaMounted) { openLearnCta("share"); return; }
    const ok = await copyToClipboard(`${window.location.origin}/learn`);
    setNote(ok ? "Link copied — send it to anyone who needs it." : "Couldn't copy — the link is surviveaccounting.com/learn");
  };

  // THE ROWS' SCROLL TARGETS (the rail that used them is unmounted; the first row still registers
  // itself as "cram" so Get started can land on it).
  const homeRef = useRef<HTMLDivElement>(null);
  const rowEls = useRef<Partial<Record<RailKey, HTMLElement>>>({});
  const rowRef = useCallback((key: RailKey) => (el: HTMLElement | null) => { if (el) rowEls.current[key] = el; }, []);
  const [chip, setChip] = useState<string | null>(null);
  const start = () => { const first = sets.find((s) => !!s.set.playbackId && !s.locked && !s.done) ?? sets.find((s) => !!s.set.playbackId && !s.locked); if (first) openSet(first.set.id); };

  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPaywallTopic(null); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  const contactRef = search.by ?? search.ref ?? null;

  return (
    <div className="lk-root fixed inset-0 flex flex-col" style={themeStyle(theme)}>
      <style>{LEARN_CSS}</style>
      {/* ONE loading screen: the brand splash stays up while the tree loads (and for its beat on a
          first visit), so there is never a second "loading" view behind it. */}
      <LearnLoading loading={isLoading} school={school} />

      <LearnTop
        school={school} campusId={campusId} campusName={campusName}
        exams={examTabs} examNum={examNum} onPickExam={setExamNum}
        chapter={chapter.slug ? { name: chapter.name, letters: chapter.letters, members: chapter.members } : null}
        theme={theme}
        onPickSchool={() => setPickerOpen(true)}
        onShare={() => void share()}
        you={{ email, userId, onSignIn: () => setSignInOpen(true), signOut }}
        demo={demo} narrow={isNarrow}
      />

      {/* ONE COLUMN — no rail on any tier (redesign, 2026-09-11). */}
      <div className="flex min-h-0 flex-1">
        {isError ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-[13px]" style={{ color: LK.red }}>Something went wrong loading videos. <button type="button" className="ml-1 underline" style={{ background: "transparent", border: 0, color: LK.text, cursor: "pointer" }} onClick={() => q.refetch()}>Retry</button></div>
        ) : isLoading ? (
          // Blank on purpose: LearnLoading covers this while the tree loads. A second spinner
          // here is the flash-between-two-screens Lee asked to remove.
          <div className="flex-1" aria-busy="true" />
        ) : sets.length === 0 ? (
          <div className="grid flex-1 place-items-center p-6 text-center"><div><p className="lk-disp" style={{ fontSize: 18 }}>Cram videos are on the way.</p><p className="mt-1 text-[13px]" style={{ color: LK.muted }}>Nothing is live for {exam?.label ?? "this exam"} yet — check back soon.</p></div></div>
        ) : inPlayer ? (
          <CramPlayer
            items={playerItems} index={playerIndex}
            onIndex={(i) => { const it = playerItems[i]; if (it) { setPractice(false); void navigate({ search: (p: LearnSearch) => ({ ...p, set: it.set.id, stage: undefined }), replace: true }); } }}
            progress={progress} onStarted={onStarted} onComplete={onComplete} onPosition={markPosition} resolvePlayback={resolvePlayback}
            demo={demo} narrow={isNarrow} theme={theme}
            practice={practice} onPractice={setPractice}
            campusName={campusName} campusSlug={campusSlug} contactRef={contactRef}
            onShare={() => void share()} onLocked={setPaywallTopic} onExit={exitPlayer}
            demoQuestions={DEMO_QUESTIONS}
          />
        ) : (
          <LearnHome
            ref={homeRef}
            sets={sets} topics={topics}
            chip={chip} onChip={setChip}
            plan={plan} onPlan={setPlan} daysOut={daysOut} examLabel={exam?.label ?? "Exam 1"}
            theme={theme} tier={tier}
            onStart={start} onOpenSet={openSet} onLocked={setPaywallTopic} rowRef={rowRef}
            signedIn={!!userId}
            campusId={campusId} demo={demo}
            unlocked={unlocked} onUnlocked={() => setUnlocked(true)}
            school={school}
          />
        )}
      </div>

      {SHOW_ASKS_BAR && !inPlayer && !isLoading && !isError && sets.length > 0 && (
        <LearnAsksBar theme={theme} campusName={campusName} campusId={campusId} campusSlug={campusSlug} courseCode={school?.courseCode ?? null} greekEnabled={ctaMounted && !ctaOwnBar} council={shareCtx.isCouncil} onGreek={() => openLearnCta("pick")} narrow={isNarrow} demo={demo} />
      )}
      {/* TEXT LEE, floating bottom-right on every tier of the home (not over the player's own
          action column). */}
      {!inPlayer && !isLoading && <LearnTextLee narrow={isNarrow} />}

      {pickerOpen && <LearnSchoolSheet current={school} onClose={() => setPickerOpen(false)} onPick={pickSchool} />}
      {search.looks && <LearnLookPicker look={look} onPick={pickLook} />}

      {paywallTopic && <Paywall topic={paywallTopic} campusName={campusName} campusId={campusId} demo={demo} onClose={() => setPaywallTopic(null)} onRestore={userId ? restore : undefined} restoring={restoring} />}
      {signInOpen && <SignInDialog onClose={() => setSignInOpen(false)} />}
      {note && (
        <div className="fixed bottom-4 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold shadow-xl" style={{ background: LK.surface, border: `1px solid ${LK.border}`, color: LK.text }}>
          <span>{note}</span>
          <button type="button" style={{ background: "transparent", border: 0, color: LK.muted, cursor: "pointer" }} onClick={() => setNote(null)}>✕</button>
        </div>
      )}
      {ctaMounted && <LearnCta bare={!ctaOwnBar} campusSlug={campusSlug ?? "your-campus"} campusName={campusName ?? campusSlug ?? "your campus"} sharerBy={contactRef} sharerIsCouncil={shareCtx.isCouncil} test={search.test} />}
      {/* The admin "CTA states" pill (LearnStateSwitcher) is no longer mounted — a student page
          shows no admin controls. ?test=A..F in the address still forces a CTA state. */}
    </div>
  );
}
