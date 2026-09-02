// /learn — THE CRAM FEED (09-02). Where a student lands to cram.
//
// Cram is already running when you arrive: the first unwatched cram video autoplays in a feed of
// one card per set, snap-scrolled, ~25 videos, under an hour. A persistent header says who you are
// (school-coloured bolt · course code · campus · exam · chapter · who sent you) and how much cram
// is left. Practice and Review are LATER extensions of a card — no mode switcher, no exam lock
// cards up top. The finish card carries rewatch, share, and the Exam 2 email capture.
//
// KEPT FROM THE PREVIOUS SHELL (unchanged in spirit): magic-link auth, per-set progress
// (localStorage signed-out / student_set_progress signed-in), entitlements + the honest paywall,
// the Greek share funnel (LearnCta, ShareBanner context, LearnStateSwitcher), ?demo=1, and the
// deep links: /learn?campus=<id>&set=<id> (the set now scrolls the feed to its card).
//
// WIREFRAMES + the decisions behind this layout: the "Learn Dashboard Wireframes" canvas (09-02).
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Lock, Mail, X } from "lucide-react";

import { useDismiss } from "@/lib/use-dismiss";
import { joinPricingWaitlist } from "@/lib/pricing-api";
import { fetchStudentTree, type StudentCourse, type StudentSet, type StudentTopic } from "@/lib/student.functions";
import { isPlayable } from "@/lib/set-flow";
import type { SetStage } from "@/lib/set-flow";
import { listOverrideCampuses, type CampusOpt } from "@/lib/campus-overrides.functions";
import { claimMyOrders, fetchMyUnlockedTopics, getSetPlayback } from "@/lib/entitlements.functions";
import { NEON } from "@/components/canvas/theme";
import { LearnIntro } from "@/components/brand/LearnIntro";
import { supabase } from "@/integrations/supabase/client";
import { useStudentAuth } from "@/lib/use-student-auth";
import { LEARN_MODE_CSS, modeStyle } from "@/components/learn/learn-modes";
import { VideoCard } from "@/components/learn/VideoCard";
import { ExamWaitlist, type ExamTabState } from "@/components/learn/ExamRail";
import { LearnCta, openLearnCta } from "@/components/learn/LearnCta";
import { useShareContext } from "@/components/learn/ShareBanner";
import { LearnStateSwitcher } from "@/components/learn/LearnStateSwitcher";
import { LearnHeader, usePickedChapter, type HeaderProgress } from "@/components/learn/LearnHeader";
import { CramFeed, DEMO_PLAYBACK, LAST_SET_KEY, muxThumb, scrollFeedToSet, type FeedItem, type Prog, type ProgressState } from "@/components/learn/CramFeed";
import { schoolByCampusId, schoolBySlug } from "@/lib/schools";
import { Spine, useVisibleTopic, type SpineTopic } from "@/components/learn/Spine";
import { isContactRef } from "@/lib/contact-ref";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

type LearnSearch = {
  campus?: string; topic?: string; set?: string; stage?: SetStage; demo?: boolean;
  // ── GREEK SHARE FUNNEL (learn-share-flow) ──────────────────────────────────────────────────
  // ref = the contact WE messaged (recipient; no banner, CTA context only). by = a PERSON who
  // forwarded the link (sharer; shows the vouched line in the header). g = the campus slug the
  // /s/<campus> hop resolved. test = force a CTA state (A–F) or the banner, client-side, no DB.
  ref?: string; by?: string; g?: string; test?: string;
};

export const Route = createFileRoute("/learn")({
  validateSearch: (s: Record<string, unknown>): LearnSearch => ({
    campus: typeof s.campus === "string" && s.campus ? s.campus : undefined,
    topic: typeof s.topic === "string" && s.topic ? s.topic : undefined,
    // DEEP LINK into a set — the feed scrolls to its card. `stage` is accepted for old links but
    // the feed is cram-only today.
    set: typeof s.set === "string" && s.set ? s.set : undefined,
    stage: s.stage === "cram" || s.stage === "practice" || s.stage === "review" ? s.stage : undefined,
    demo: s.demo === true || s.demo === 1 || s.demo === "1" || s.demo === "true" ? true : undefined,
    ref: typeof s.ref === "string" && isContactRef(s.ref) ? s.ref : undefined,
    by: typeof s.by === "string" && isContactRef(s.by) ? s.by : undefined,
    g: typeof s.g === "string" && s.g ? s.g : undefined,
    test: typeof s.test === "string" && s.test ? s.test : undefined,
  }),
  head: () => ({ meta: [{ title: "⚡ Learn — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: LearnShell,
});

// ---- DEMO TREE (?demo=1) — placeholder content so the feed can be previewed populated.
//      Pure client-side stand-in: demo set ids never reach the DB and "videos" are stubs. ------
function demoTree(): StudentCourse[] {
  const set = (id: string, name: string, o: Partial<StudentSet> = {}): StudentSet => ({ id: `demo-${id}`, name, access: "free", orientation: "portrait", playbackId: DEMO_PLAYBACK, ceqCount: 0, runtimeSec: null, hasReview: false, reviewPlaybackId: null, reviewRuntimeSec: null, firstStem: null, shortLabel: null, ...o });
  return [
    {
      id: "demo-intro1", name: "Intro 1", family: "intro",
      units: [
        {
          id: "demo-exam1", name: "Exam 1",
          topics: [
            { id: "demo-t1", name: "The Accounting Cycle", shortLabel: "Cycle", number: 1, sets: [
              set("s1", "The Big Picture", { runtimeSec: 112, ceqCount: 6, firstStem: "Which of the following is a user of financial accounting information?", shortLabel: "Users of accounting" }),
              set("s2", "Assets = Liabilities + Equity", { runtimeSec: 98, ceqCount: 9 }),
              set("s3", "The Cycle, Start to Finish", { runtimeSec: 117, ceqCount: 7 }),
            ] },
            { id: "demo-t2", name: "Analyzing Transactions", shortLabel: "Analyzing", number: 2, sets: [
              set("s4", "Debits & Credits", { runtimeSec: 89, ceqCount: 8 }),
              set("s5", "T-Accounts", { runtimeSec: 65, ceqCount: 5, orientation: "landscape" }),
              set("s6", "Trial Balance", { playbackId: null, ceqCount: 4 }), // no cram yet — not in the feed
            ] },
            { id: "demo-t3", name: "Recording & Adjusting", shortLabel: "Recording", number: 3, sets: [
              set("s8", "Adjusting Entries", { runtimeSec: 101, ceqCount: 10 }),
            ] },
          ],
        },
        {
          id: "demo-exam2", name: "Exam 2",
          topics: [
            { id: "demo-t4", name: "Merchandising", shortLabel: "Merch", number: 4, sets: [
              set("s10", "Perpetual vs Periodic", { access: "paid", playbackId: null, runtimeSec: 455, ceqCount: 8 }),
            ] },
          ],
        },
      ],
      topics: [],
    },
  ];
}

// Magic-link sign-in dialog — email in, link out, one tap. NEVER a password field.
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
    <div className="fixed inset-0 z-[110] grid place-items-center p-4" style={{ background: "rgba(4,7,14,0.9)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#0b1020", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2"><Mail className="h-4 w-4" style={{ color: NEON.yellow }} /><span className="text-[14px] font-black uppercase tracking-wide">Sign in</span><button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid h-7 w-7 place-items-center rounded-full hover:bg-white/10" style={{ color: NEON.text }}><span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span></button></div>
        {state === "sent" ? (
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: NEON.muted }}>Check <b style={{ color: NEON.text }}>{email}</b> — we sent a one-tap sign-in link. No password needed.</p>
        ) : (
          <>
            <p className="mt-1 mb-3 text-[12px]" style={{ color: NEON.muted }}>Save your progress across devices. We email you a link — no password, ever.</p>
            <input
              type="email" autoFocus inputMode="email" autoComplete="email" placeholder="you@school.edu"
              className="w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ background: "#0e131b", color: "#e7ecf3", border: `1px solid ${NEON.borderSoft}` }}
              value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            />
            {state === "error" && <p className="mt-1.5 text-[11px]" style={{ color: "#F3C6CC" }}>{msg}</p>}
            <button disabled={state === "sending"} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-black uppercase tracking-wide disabled:opacity-50" style={{ color: "#0B1322", background: NEON.yellow }} onClick={() => void send()}>
              {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Email me a link
            </button>
          </>
        )}
        <button className="mt-2 w-full rounded-xl px-3 py-2 text-[11px] font-bold" style={{ color: NEON.muted }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// NOTIFY-NOT-PAY: there is no checkout yet, so a locked topic captures an email into the SAME
// pricing waitlist the homepage's paid tabs use (campus_waitlist, tier test_pass).
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
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" style={{ background: "rgba(4,7,14,0.9)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#0b1020", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2"><Lock className="h-4 w-4" style={{ color: "#F0B24A" }} /><span className="text-[14px] font-black uppercase tracking-wide">{topic.name} is coming</span></div>
        <p className="text-[12.5px] leading-relaxed" style={{ color: NEON.muted }}>
          {n} cram {n === 1 ? "video" : "videos"} in <b style={{ color: NEON.text }}>{topic.name}</b>{topic.sets.slice(0, 3).length > 0 && <> — including {topic.sets.slice(0, 3).map((s) => s.name).join(", ")}{n > 3 ? `, +${n - 3} more` : ""}</>}.
        </p>
        <div className="mt-4 rounded-xl px-3 py-2.5" style={{ border: "1px solid rgba(252,163,17,0.35)", background: "rgba(252,163,17,0.06)" }}>
          {state === "done" ? (
            <p className="text-[11.5px] font-semibold">✓ You're on the list — I'll email you the day {topic.name} opens.</p>
          ) : (
            <>
              <p className="text-[11.5px] font-bold">Get notified once {topic.name} is ready</p>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("open"); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                  type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu"
                  className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                  style={{ background: "#0e131b", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                />
                <button onClick={() => void submit()} disabled={state === "busy"} className="shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-black disabled:opacity-50" style={{ background: NEON.yellow, color: "#0B1322" }}>{state === "busy" ? "…" : "Notify me"}</button>
              </div>
              {state === "error" && <p className="mt-1 text-[10.5px]" style={{ color: "#F3C6CC" }}>Couldn't save that — try again in a moment.</p>}
            </>
          )}
        </div>
        {onRestore && <button className="mt-2 w-full rounded-xl px-3 py-2 text-[11px] font-bold disabled:opacity-50" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} disabled={restoring} onClick={onRestore}>{restoring ? "Checking…" : "Already have access? Restore it"}</button>}
        <button className="mt-2 w-full rounded-xl px-3 py-2 text-[11px] font-bold" style={{ color: NEON.muted }} onClick={onClose}>Keep cramming</button>
      </div>
    </div>
  );
}

// Narrow-viewport detector — one column, full-height cards, the course map behind a sheet.
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 719px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 719px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

const examNumOf = (unitName: string): number | null => {
  const m = /exam\s*(\d+)/i.exec(unitName);
  return m ? Number(m[1]) : /final/i.test(unitName) ? 4 : null;
};

function LearnShell() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const demo = !!search.demo;
  // GREEK SHARE FUNNEL — resolve the sharer/recipient once: the header's "sent by" line (by) and
  // the CTA bar's council state (by or ref). ?test=banner uses a fixture.
  const shareCtx = useShareContext({ by: search.by, ref: search.ref, test: search.test });
  // CAMPUS — ?campus=<id> wins over the stored choice (the school picker / campus pages hand off).
  const [campusId, setCampusId] = useState<string | null>(() => { if (search.campus) return search.campus; try { return localStorage.getItem("sa-learn-campus"); } catch { return null; } });
  useEffect(() => { try { if (campusId) localStorage.setItem("sa-learn-campus", campusId); else localStorage.removeItem("sa-learn-campus"); } catch { /* ignore */ } }, [campusId]);
  // A ?g slug with no stored campus id → adopt that school's campus id so the tree numbers itself.
  useEffect(() => { if (!campusId && search.g) { const s = schoolBySlug(search.g); if (s?.campusId) setCampusId(s.campusId); } }, [campusId, search.g]);
  const campusesQ = useQuery({ queryKey: ["override-campuses"], queryFn: () => listOverrideCampuses(), staleTime: 300_000, networkMode: "always", enabled: !demo });
  const campuses: CampusOpt[] = campusesQ.data ?? [];
  const q = useQuery({ queryKey: ["student-tree", campusId], queryFn: () => fetchStudentTree({ data: { campusId: campusId ?? undefined } }), staleTime: 120_000, networkMode: "always", enabled: !demo });
  const demoCourses = useMemo(() => (demo ? demoTree() : null), [demo]);
  const courses: StudentCourse[] = useMemo(() => demoCourses ?? q.data ?? [], [demoCourses, q.data]);
  const isLoading = !demo && q.isLoading;
  const isError = !demo && q.isError;
  const [paywallTopic, setPaywallTopic] = useState<StudentTopic | null>(null);
  const isNarrow = useIsNarrow();
  const [mapOpen, setMapOpen] = useState(false);
  // The picked exam; null = "the first exam that has videos", resolved in render (not an effect)
  // so the server-rendered frame already carries the feed instead of flashing an empty state.
  const [pickedExam, setExamNum] = useState<number | null>(null);

  const school = schoolByCampusId(campusId) ?? schoolBySlug(search.g);
  const campusSlug = search.g ?? school?.slug ?? null;
  const campusName = school?.name ?? campuses.find((c) => c.id === campusId)?.name ?? null;

  // AUTH (magic link) + per-set PROGRESSION. Signed-in rows live in student_set_progress under
  // RLS. Signed-out (and demo) persists to localStorage — local only, nothing merges up.
  const { userId, email, signOut } = useStudentAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [progress, setProgress] = useState<Record<string, Prog>>({});
  const localKey = demo ? "sa-learn-progress-demo" : "sa-learn-progress";
  const useLocal = demo || !userId;
  useEffect(() => {
    if (useLocal) {
      try { setProgress(JSON.parse(localStorage.getItem(localKey) ?? "{}") as Record<string, Prog>); } catch { setProgress({}); }
      return;
    }
    let active = true;
    void (async () => {
      let r = await (supabase.from("student_set_progress" as never) as any).select("set_id,state,position_sec,duration_sec,updated_at");
      if (r.error && /position_sec|column/i.test(String(r.error.message ?? ""))) r = await (supabase.from("student_set_progress" as never) as any).select("set_id,state,updated_at");
      if (!active) return;
      const m: Record<string, Prog> = {};
      for (const row of (r.data ?? []) as { set_id: string; state: ProgressState; position_sec?: number | null; duration_sec?: number | null; updated_at?: string }[]) {
        m[row.set_id] = { state: row.state, positionSec: row.position_sec ?? 0, durationSec: row.duration_sec ?? null, updatedAt: row.updated_at ? Date.parse(row.updated_at) : 0 };
      }
      setProgress(m);
    })();
    return () => { active = false; };
  }, [userId, useLocal, localKey]);
  const writeRow = useCallback((setId: string, p: Prog) => {
    if (!userId) return;
    const t = supabase.from("student_set_progress" as never) as any;
    void t
      .upsert({ user_id: userId, set_id: setId, state: p.state, position_sec: p.positionSec, duration_sec: p.durationSec, updated_at: new Date().toISOString() }, { onConflict: "user_id,set_id" })
      .then((r: { error: { message?: string } | null }) => {
        if (r.error && /position_sec|duration_sec|column/i.test(String(r.error.message ?? ""))) void t.upsert({ user_id: userId, set_id: setId, state: p.state }, { onConflict: "user_id,set_id" });
      });
  }, [userId]);
  const persist = useCallback((m: Record<string, Prog>, setId: string) => {
    if (useLocal) { try { localStorage.setItem(localKey, JSON.stringify(m)); } catch { /* ignore */ } }
    else writeRow(setId, m[setId]);
  }, [useLocal, localKey, writeRow]);
  const markProgress = useCallback((setId: string, next: ProgressState) => {
    setProgress((prev) => {
      const cur = prev[setId];
      if (cur?.state === "complete" && next === "in_progress") return prev; // never downgrades
      if (cur?.state === next && next === "in_progress") return prev;
      const p: Prog = { state: next, positionSec: next === "complete" ? 0 : (cur?.positionSec ?? 0), durationSec: cur?.durationSec ?? null, updatedAt: Date.now() };
      const m = { ...prev, [setId]: p };
      persist(m, setId);
      return m;
    });
  }, [persist]);
  const markPosition = useCallback((setId: string, positionSec: number, durationSec: number | null) => {
    setProgress((prev) => {
      const cur = prev[setId];
      if (cur?.state === "complete") return prev; // a finished set doesn't regain a resume point
      const p: Prog = { state: cur?.state ?? "in_progress", positionSec, durationSec: durationSec ?? cur?.durationSec ?? null, updatedAt: Date.now() };
      const m = { ...prev, [setId]: p };
      persist(m, setId);
      return m;
    });
  }, [persist]);
  const onStarted = useCallback((id: string) => markProgress(id, "in_progress"), [markProgress]);
  const onComplete = useCallback((id: string) => markProgress(id, "complete"), [markProgress]);

  // ENTITLEMENTS — topics the signed-in student has unlocked. An unlocked paid set's withheld
  // playback id is fetched securely when its card nears.
  const unlockedQ = useQuery({ queryKey: ["my-unlocked-topics", userId], queryFn: () => fetchMyUnlockedTopics(), enabled: !!userId && !demo, networkMode: "always" });
  const unlockedTopics = useMemo(() => new Set(unlockedQ.data ?? []), [unlockedQ.data]);
  const [restoring, setRestoring] = useState(false);
  const restore = async () => { setRestoring(true); try { await claimMyOrders(); await unlockedQ.refetch(); } finally { setRestoring(false); } };
  const [fetchNote, setFetchNote] = useState<{ msg: string; retry?: () => void } | null>(null);
  const resolvePlayback = useCallback(async (set: StudentSet): Promise<string | null> => {
    const r = await getSetPlayback({ data: { setId: set.id, stage: "cram" } });
    if (r.status === "ok") return r.playbackId;
    if (r.status === "unpublished") setFetchNote({ msg: "This video isn't published yet — check back soon." });
    return null;
  }, []);

  // ── THE EXAMS — units ARE the exams. Anything live is pickable; the rest are "coming". ─────
  const examTabs = useMemo<ExamTabState[]>(() => {
    const byNum = new Map<number, { label: string; videos: number }>();
    for (const c of courses) for (const u of c.units) {
      const num = examNumOf(u.name);
      if (num == null) continue;
      // Anything a student can enter counts — a set whose cram video is still rendering shows as a
      // "coming soon" card in the feed rather than hiding the whole exam.
      const videos = u.topics.reduce((n, t) => n + t.sets.filter(isPlayable).length, 0);
      const prev = byNum.get(num);
      byNum.set(num, { label: num === 4 ? "Final" : `Exam ${num}`, videos: (prev?.videos ?? 0) + videos });
    }
    return [1, 2, 3, 4].map((n) => ({ num: n, label: n === 4 ? "Final" : `Exam ${n}`, available: (byNum.get(n)?.videos ?? 0) > 0, videoCount: byNum.get(n)?.videos ?? 0 }));
  }, [courses]);
  const examNum = pickedExam ?? examTabs.find((e) => e.available)?.num ?? null;
  const exam = examTabs.find((e) => e.num === examNum) ?? null;
  const nextExam = examTabs.find((e) => !e.available && e.num > (examNum ?? 0)) ?? null;

  // ── THE FEED — every set with a cram video (or a paid, withheld one) in the picked exam. ─────
  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    const seen = new Set<string>();
    for (const c of courses) for (const u of c.units) {
      if (examNumOf(u.name) !== examNum) continue;
      for (const t of u.topics) {
        const inFeed = t.sets.filter(isPlayable);
        inFeed.forEach((set, i) => {
          if (seen.has(set.id)) return; seen.add(set.id);
          out.push({ set, topic: t, unitLabel: u.name, locked: set.access === "paid" && !unlockedTopics.has(t.id), n: i + 1, of: inFeed.length });
        });
      }
    }
    return out;
  }, [courses, examNum, unlockedTopics]);

  const headerProgress = useMemo<HeaderProgress>(() => {
    // Only sets with a cram video count toward "min of cram left" — a coming-soon card is not
    // something the student can watch yet.
    const open = items.filter((i) => !i.locked && !!i.set.playbackId);
    const done = open.filter((i) => progress[i.set.id]?.state === "complete");
    const left = open.filter((i) => progress[i.set.id]?.state !== "complete");
    const secondsLeft = left.every((i) => i.set.runtimeSec != null) ? left.reduce((a, i) => a + (i.set.runtimeSec ?? 0), 0) : null;
    return { total: open.length, done: done.length, secondsLeft };
  }, [items, progress]);

  // ── THE SPINE follows the feed's scroll. ────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const { visibleTopicId, registerCard } = useVisibleTopic(scrollRef);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const activeTopicId = visibleTopicId ?? items.find((i) => i.set.id === activeSetId)?.topic.id ?? items[0]?.topic.id ?? null;
  const spineTopics = useMemo<SpineTopic[]>(() => {
    const out: SpineTopic[] = [];
    for (const c of courses) for (const u of c.units) for (const t of u.topics) {
      out.push({
        // NO CHAPTER PREFIX (Lee, 09-03): topics only, until syllabi map textbook chapters properly.
        id: t.id, label: t.name,
        groupId: u.id, groupLabel: u.name,
        total: t.sets.filter(isPlayable).length || t.sets.length,
        done: t.sets.filter((x) => progress[x.id]?.state === "complete").length,
        locked: t.sets.length > 0 && t.sets.every((x) => x.access === "paid") && !unlockedTopics.has(t.id),
      });
    }
    return out;
  }, [courses, progress, unlockedTopics]);
  const spinePosition = useMemo(() => { const i = spineTopics.findIndex((t) => t.id === activeTopicId); return i >= 0 ? { index: i + 1, total: spineTopics.length } : null; }, [spineTopics, activeTopicId]);
  const pendingJump = useRef<string | null>(null);
  const jumpToTopic = (topicId: string) => {
    setMapOpen(false);
    const hit = items.find((i) => i.topic.id === topicId);
    if (hit) { scrollFeedToSet(scrollRef.current, hit.set.id); return; }
    // The topic sits in another exam — switch, then scroll once its cards exist.
    for (const c of courses) for (const u of c.units) if (u.topics.some((t) => t.id === topicId)) { const n = examNumOf(u.name); if (n != null && examTabs.find((e) => e.num === n)?.available) { pendingJump.current = topicId; setExamNum(n); } }
  };
  useEffect(() => {
    if (!pendingJump.current) return;
    const hit = items.find((i) => i.topic.id === pendingJump.current);
    if (hit) { pendingJump.current = null; requestAnimationFrame(() => scrollFeedToSet(scrollRef.current, hit.set.id, "instant")); }
  }, [items]);

  // RESUME — ?set= wins, else the last card this browser was on.
  const [initialSetId] = useState<string | null>(() => { if (search.set) return search.set; try { return localStorage.getItem(LAST_SET_KEY); } catch { return null; } });

  // ── THE WHO-BLOCK: chapter (the CTA bar's pick) + sender (?by). ─────────────────────────────
  const chapter = usePickedChapter(campusSlug, !demo);
  const sender = search.by || (search.test ?? "").toLowerCase() === "banner" ? shareCtx.contact : null;
  const ctaMounted = !demo && (!!campusSlug || !!search.test);
  const share = async () => {
    if (ctaMounted) { openLearnCta("share"); return; }
    // No campus known → nothing chapter-shaped to open; copy the plain link instead.
    const ok = await copyToClipboard(`${window.location.origin}/learn`);
    setFetchNote({ msg: ok ? "Link copied — send it to anyone who needs it." : "Couldn't copy — the link is surviveaccounting.com/learn" });
  };

  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setPaywallTopic(null); setMapOpen(false); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  const activeIdx = items.findIndex((i) => i.set.id === activeSetId);
  const upNext = items.slice(activeIdx < 0 ? 1 : activeIdx + 1, (activeIdx < 0 ? 1 : activeIdx + 1) + 6);

  const spineBlock = (
    <>
      {isLoading ? (
        <p className="flex items-center gap-1.5 px-1.5 py-2 text-[11px] italic" style={{ color: "var(--lm-muted)" }}><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
      ) : spineTopics.length === 0 ? (
        <p className="px-1.5 py-2 text-[11px] italic leading-snug" style={{ color: "var(--lm-muted)" }}>No live videos yet — check back soon.</p>
      ) : (
        <Spine topics={spineTopics} activeId={activeTopicId} position={spinePosition} onPick={jumpToTopic} />
      )}
      {/* EXAMS STILL TO COME — under the map, not as lock cards up top. */}
      {examTabs.some((e) => !e.available) && (
        <div className="mt-3 border-t px-1.5 pt-3" style={{ borderColor: "var(--lm-border)" }}>
          <div className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--lm-muted)" }}>Coming</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {examTabs.filter((e) => !e.available).map((e) => <span key={e.num} className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ color: "var(--lm-muted)", border: "1px solid var(--lm-border)" }}>{e.label}</span>)}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="lm-root fixed inset-0 flex flex-col" style={{ ...modeStyle("cram"), fontFamily: "'Rubik', system-ui, sans-serif" }}>
      <style>{LEARN_MODE_CSS}</style>
      <LearnIntro />

      <LearnHeader
        school={school}
        campusName={campusName}
        exams={examTabs}
        examNum={examNum}
        onPickExam={setExamNum}
        chapter={chapter.slug ? { name: chapter.name, members: chapter.members } : null}
        sender={sender}
        progress={headerProgress}
        onShare={() => void share()}
        onPickChapter={ctaMounted ? () => openLearnCta("pick") : null}
        onOpenMap={() => setMapOpen(true)}
        auth={{ email, userId, signOut, onSignIn: () => setSignInOpen(true) }}
        demo={demo}
        narrow={isNarrow}
      />

      <div className="flex min-h-0 flex-1">
        {/* ── LEFT: the course map, following the feed. ───────────────────────────────────── */}
        {!isNarrow && (
          <aside className="lm-surface flex w-[248px] shrink-0 flex-col overflow-y-auto px-2 py-3" style={{ borderRight: "1px solid var(--lm-border)" }}>
            {spineBlock}
          </aside>
        )}

        {/* ── CENTRE: the feed. ───────────────────────────────────────────────────────────── */}
        {isError ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-[12.5px]" style={{ color: "#F3C6CC" }}>
            Something went wrong loading videos. <button className="ml-1 underline" onClick={() => q.refetch()}>Retry</button>
          </div>
        ) : isLoading ? (
          <div className="grid flex-1 place-items-center text-[12.5px]" style={{ color: "var(--lm-muted)" }}><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading your cram videos…</span></div>
        ) : items.length === 0 ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div><p className="text-[14px] font-bold" style={{ color: "var(--lm-text)" }}>Cram videos are on the way.</p><p className="mt-1 text-[12px]" style={{ color: "var(--lm-muted)" }}>Nothing is live for {exam?.label ?? "this exam"} yet — check back soon.</p></div>
          </div>
        ) : (
          <CramFeed
            items={items}
            progress={progress}
            demo={demo}
            narrow={isNarrow}
            scrollRef={scrollRef}
            registerCard={registerCard}
            examLabel={exam?.label ?? "Exam 1"}
            nextExam={nextExam}
            campusId={campusId}
            campusName={campusName}
            courseCode={school?.courseCode ?? null}
            initialSetId={initialSetId}
            onActive={setActiveSetId}
            onStarted={onStarted}
            onComplete={onComplete}
            onPosition={markPosition}
            onLocked={setPaywallTopic}
            resolvePlayback={resolvePlayback}
            onShare={() => void share()}
          />
        )}

        {/* ── RIGHT: up next + the house slot. ────────────────────────────────────────────── */}
        {!isNarrow && (
          <aside className="lm-surface w-[300px] shrink-0 overflow-y-auto px-3 py-3" style={{ borderLeft: "1px solid var(--lm-border)" }}>
            <div className="pb-2 text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--lm-muted)" }}>Up next</div>
            {upNext.length === 0 ? (
              <p className="px-1 py-2 text-[11.5px] italic" style={{ color: "var(--lm-muted)" }}>{items.length ? "That's the last one." : "Nothing yet."}</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {upNext.map(({ set, topic, locked }) => (
                  <VideoCard
                    key={set.id}
                    title={set.name}
                    thumbUrl={set.playbackId && set.playbackId !== DEMO_PLAYBACK ? muxThumb(set.playbackId) : null}
                    durationSec={set.runtimeSec}
                    meta={topic.shortLabel || topic.name}
                    locked={locked}
                    complete={progress[set.id]?.state === "complete"}
                    watched={progress[set.id]?.durationSec ? Math.min(1, progress[set.id].positionSec / progress[set.id].durationSec!) : 0}
                    onOpen={() => (locked ? setPaywallTopic(topic) : scrollFeedToSet(scrollRef.current, set.id))}
                    compact
                  />
                ))}
              </div>
            )}
            {/* THE HOUSE SLOT — the rail's ad space, filled with our own asks until there is a sponsor. */}
            {nextExam && !demo && (
              <div className="mt-5">
                <ExamWaitlist examNum={nextExam.num} label={nextExam.label} campusId={campusId} campusName={campusName} courseCode={school?.courseCode ?? null} />
              </div>
            )}
            <a href="/rep/join" className="mt-4 block text-center text-[11.5px] font-bold underline underline-offset-4" style={{ color: "var(--lm-muted)" }}>Want to run this at your campus? Become a campus rep →</a>
          </aside>
        )}
      </div>

      {/* NARROW course-map sheet. */}
      {isNarrow && mapOpen && (
        <div className="fixed inset-0 z-[95] flex flex-col" style={{ background: "rgba(4,7,14,0.96)" }}>
          <div className="flex h-11 shrink-0 items-center gap-2 px-3" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
            <span className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: NEON.muted }}>Course map</span>
            <button className="ml-auto grid h-8 w-8 place-items-center rounded-full" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setMapOpen(false)} title="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{spineBlock}</div>
        </div>
      )}

      {paywallTopic && <Paywall topic={paywallTopic} campusName={campusName} campusId={campusId} demo={demo} onClose={() => setPaywallTopic(null)} onRestore={userId ? restore : undefined} restoring={restoring} />}
      {signInOpen && <SignInDialog onClose={() => setSignInOpen(false)} />}
      {fetchNote && (
        <div className="fixed bottom-4 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold shadow-xl" style={{ background: "#141a2c", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>
          <span>{fetchNote.msg}</span>
          {fetchNote.retry && <button className="rounded-lg px-2.5 py-1 text-[11.5px] font-black uppercase tracking-wide" style={{ background: NEON.yellow, color: "#0B1322" }} onClick={fetchNote.retry}>Retry</button>}
          <button className="text-[11px] font-bold" style={{ color: NEON.muted }} onClick={() => setFetchNote(null)}>✕</button>
        </div>
      )}
      {/* GREEK SHARE FUNNEL — the adaptive CTA bar. Shows when a campus is known (or ?test forces
          a state). Never in demo mode. Also the home of the share sheet the header opens. */}
      {ctaMounted && (
        <LearnCta campusSlug={campusSlug ?? "your-campus"} campusName={campusName ?? campusSlug ?? "your campus"} sharerBy={search.by ?? search.ref ?? null} sharerIsCouncil={shareCtx.isCouncil} test={search.test} />
      )}
      {!demo && <LearnStateSwitcher current={search.test} onSelect={(test) => void navigate({ search: (p: LearnSearch) => ({ ...p, test }), replace: true })} />}
    </div>
  );
}
