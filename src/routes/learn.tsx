// STUDENT SHELL (#7) — skeleton. A sibling of Study Canvas: same navy + bolt + tokens, a
// left Course › Topic › CEQ-Set outline and a main video-poster grid. Signed-out students
// browse; free sets play, paid sets show a paywall (checkout is a STUB — no Stripe this pass).
// Only status='live' sets ever arrive (filtered server-side in fetchStudentTree). Progression
// (per-set completion) + magic-link auth + the silent DOM pre-roll land in the next pass; the
// data model + shell + player + paywall are here, with empty / loading / error on every screen.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Circle, CircleCheck, CircleDot, Lock, LogOut, Mail, Play, X, Loader2 } from "lucide-react";

import { fetchStudentTree, type StudentCourse, type StudentSet, type StudentTopic } from "@/lib/student.functions";
import { NEON } from "@/components/canvas/theme";
import { BrandLogo, Bolt } from "@/components/canvas/brand";
import { BoltBoil, SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { supabase } from "@/integrations/supabase/client";

type ProgressState = "unstarted" | "in_progress" | "complete";

export const Route = createFileRoute("/learn")({
  head: () => ({ meta: [{ title: "⚡ Learn — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: LearnShell,
});

const LAST_TOPIC_KEY = "sa-learn-last-topic";
const chip = (t: StudentTopic) => (t.shortLabel?.trim() || t.name || "Topic").slice(0, 22);

// ---- SILENT DOM PRE-ROLL (#7) — bolt boils, wordmark snaps in, topic chip; ~1.5s, NO audio.
//      A player component, NOT stitched into the video file. onDone reveals the player. --------
function PreRoll({ chipText, onDone }: { chipText: string; onDone: () => void }) {
  useEffect(() => { const t = window.setTimeout(onDone, 1500); return () => window.clearTimeout(t); }, [onDone]);
  return (
    <div className="absolute inset-0 z-10 grid place-items-center overflow-hidden" style={{ background: "#0A1220" }}>
      <style>{`@keyframes sa-pr-word{from{opacity:0;transform:translateY(8px) scale(0.96)}to{opacity:1;transform:none}}@keyframes sa-pr-chip{from{opacity:0}to{opacity:1}}`}</style>
      <div className="flex flex-col items-center gap-3">
        <BoltBoil height={92} />
        <div style={{ animation: "sa-pr-word 200ms cubic-bezier(0.2,0.7,0.3,1) 640ms both" }}><SurviveWordmark size={40} /></div>
        {chipText && <div className="max-w-[80%] truncate rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider" style={{ color: "#0B1322", background: NEON.yellow, animation: "sa-pr-chip 220ms ease 1040ms both" }}>{chipText}</div>}
      </div>
    </div>
  );
}

// ---- Mux/HLS player (reuse the app's hls.js path; @mux/mux-player isn't a dep) ------------
function VideoPlayer({ set, chipText, onClose, onStarted, onComplete }: { set: StudentSet; chipText: string; onClose: () => void; onStarted: () => void; onComplete: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  const [preroll, setPreroll] = useState(true);
  const portrait = set.orientation === "portrait";
  useEffect(() => {
    const v = ref.current, pid = set.playbackId;
    if (!v || !pid) return;
    const src = `https://stream.mux.com/${pid}.m3u8`;
    let hls: { destroy: () => void } | null = null;
    if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; return; }
    let cancelled = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !ref.current) return;
      if (Hls.isSupported()) { const h = new Hls(); h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr(true); }); h.loadSource(src); h.attachMedia(ref.current); hls = h; }
      else { ref.current.src = src; }
    }).catch(() => setErr(true));
    return () => { cancelled = true; hls?.destroy(); };
  }, [set.playbackId, set.orientation]);
  // The video autoplays only AFTER the silent pre-roll ends (so the pre-roll stays silent).
  useEffect(() => { if (!preroll) void ref.current?.play().catch(() => { /* user can hit play */ }); }, [preroll]);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" style={{ background: "rgba(4,7,14,0.92)" }} onClick={onClose}>
      <div className="relative w-full" style={{ maxWidth: portrait ? 460 : 1100 }} onClick={(e) => e.stopPropagation()}>
        <button className="absolute -top-9 right-0 grid h-8 w-8 place-items-center rounded-full" style={{ color: "#e8ecf5", border: "1px solid rgba(255,255,255,0.2)" }} onClick={onClose} title="Close (Esc)"><X className="h-4 w-4" /></button>
        <div className="text-[13px] font-bold" style={{ color: "#e8ecf5", marginBottom: 8 }}>{set.name}</div>
        {err ? (
          <div className="grid place-items-center rounded-xl text-[12px]" style={{ aspectRatio: portrait ? "9 / 16" : "16 / 9", background: "#0b1020", border: "1px solid rgba(255,92,110,0.4)", color: "#F3C6CC" }}>Couldn't load this video. Try again shortly.</div>
        ) : (
          // DOM watermark (bolt only) overlays the video — burned-in stays out of the file.
          <div className="relative overflow-hidden rounded-xl" style={{ background: "#000", aspectRatio: portrait ? "9 / 16" : "16 / 9" }}>
            <video ref={ref} controls playsInline className="h-full w-full" style={{ objectFit: "contain", background: "#000" }} onPlay={onStarted} onEnded={onComplete} />
            <span className="pointer-events-none absolute right-3 top-3 inline-block h-6 w-4 opacity-80"><Bolt c1="#C62828" c2="#1565C0" /></span>
            {preroll && <PreRoll chipText={chipText} onDone={() => setPreroll(false)} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Supabase MAGIC-LINK auth (no password ever) + student session -----------------------
function useStudentAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (!active) return; setUserId(data.session?.user?.id ?? null); setEmail(data.session?.user?.email ?? null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { setUserId(session?.user?.id ?? null); setEmail(session?.user?.email ?? null); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  return { userId, email, signOut: () => void supabase.auth.signOut() };
}

// Magic-link sign-in dialog — email in, link out, one tap. NEVER a password field.
function SignInDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
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
        <div className="mb-1 flex items-center gap-2"><Mail className="h-4 w-4" style={{ color: NEON.yellow }} /><span className="text-[14px] font-black uppercase tracking-wide">Sign in</span></div>
        {state === "sent" ? (
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: NEON.muted }}>Check <b style={{ color: NEON.text }}>{email}</b> — we sent a one-tap sign-in link. No password needed.</p>
        ) : (
          <>
            <p className="mt-1 mb-3 text-[12px]" style={{ color: NEON.muted }}>We email you a link — no password, ever.</p>
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

// ---- one set poster: navy, static bolt (boils on hover), topic chip. No thumbnail art ------
function SetPoster({ set, topicChip, accent, state, onOpen }: { set: StudentSet; topicChip: string; accent: string; state: ProgressState; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const locked = set.access === "paid";
  const comingSoon = !set.playbackId;
  const footLabel = locked ? "Paid" : comingSoon ? "Soon" : state === "complete" ? "Done ✓" : state === "in_progress" ? "Resume" : "Free";
  const footColor = locked ? "#F0B24A" : comingSoon ? NEON.muted : state === "complete" ? "#3BF5A0" : state === "in_progress" ? NEON.cyan : "#3BF5A0";
  return (
    <button
      className="group relative flex flex-col overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5"
      style={{ background: "linear-gradient(160deg, #12203E, #070C1A)", border: `1px solid ${NEON.borderSoft}`, boxShadow: "0 12px 30px -16px rgba(0,0,0,0.8)" }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      title={locked ? `Locked — ${set.name}` : comingSoon ? `${set.name} — coming soon` : `Play ${set.name}`}
    >
      {/* poster face — generated from topic + accent, not per-video art */}
      <div className="relative grid place-items-center" style={{ aspectRatio: "16 / 9", borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <span className="inline-block" style={{ height: 68 }}>{hover && !locked ? <BoltBoil height={68} /> : <span className="inline-block h-full" style={{ width: Math.round(68 * 0.62) }}><Bolt c1="#C62828" c2="#1565C0" /></span>}</span>
        <span className="absolute left-2.5 top-2.5 truncate rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider" style={{ maxWidth: "80%", color: "#0B1322", background: accent }}>{topicChip}</span>
        {locked && <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full" style={{ background: "rgba(4,7,14,0.7)", border: `1px solid ${NEON.borderSoft}`, color: "#F0B24A" }}><Lock className="h-3.5 w-3.5" /></span>}
        {!locked && !comingSoon && state === "complete" && <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full" style={{ background: "rgba(4,7,14,0.7)", border: `1px solid rgba(59,245,160,0.5)`, color: "#3BF5A0" }}><CircleCheck className="h-3.5 w-3.5" /></span>}
        {!locked && !comingSoon && state !== "complete" && <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100" style={{ background: "rgba(4,7,14,0.7)", border: `1px solid ${NEON.borderSoft}`, color: state === "in_progress" ? NEON.cyan : "#3BF5A0" }}><Play className="h-3.5 w-3.5" /></span>}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold" style={{ color: NEON.text }}>{set.name}</span>
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide" style={{ color: footColor }}>{footLabel}</span>
      </div>
    </button>
  );
}

function Paywall({ topic, onClose }: { topic: StudentTopic; onClose: () => void }) {
  const n = topic.sets.length;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" style={{ background: "rgba(4,7,14,0.9)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#0b1020", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2"><Lock className="h-4 w-4" style={{ color: "#F0B24A" }} /><span className="text-[14px] font-black uppercase tracking-wide">Unlock {topic.name}</span></div>
        {/* Specific, not "unlock full access": the topic name + what's behind the lock. */}
        <p className="text-[12.5px] leading-relaxed" style={{ color: NEON.muted }}>
          {n} cram {n === 1 ? "video" : "videos"} in <b style={{ color: NEON.text }}>{topic.name}</b>{topic.sets.slice(0, 3).length > 0 && <> — including {topic.sets.slice(0, 3).map((s) => s.name).join(", ")}{n > 3 ? `, +${n - 3} more` : ""}</>}.
        </p>
        <button className="mt-4 w-full rounded-xl px-3 py-2.5 text-[12.5px] font-black uppercase tracking-wide" style={{ color: "#0B1322", background: NEON.yellow }} onClick={() => { window.location.assign("/order"); }}>Get access →</button>
        <button className="mt-2 w-full rounded-xl px-3 py-2 text-[11px] font-bold" style={{ color: NEON.muted }} onClick={onClose}>Keep browsing</button>
      </div>
    </div>
  );
}

function LearnShell() {
  const q = useQuery({ queryKey: ["student-tree"], queryFn: () => fetchStudentTree(), staleTime: 120_000, networkMode: "always" });
  const courses: StudentCourse[] = q.data ?? [];
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(() => { try { return localStorage.getItem(LAST_TOPIC_KEY); } catch { return null; } });
  const [playing, setPlaying] = useState<{ set: StudentSet; topic: StudentTopic } | null>(null);
  const [paywallTopic, setPaywallTopic] = useState<StudentTopic | null>(null);

  // AUTH (magic link) + per-set PROGRESSION. Progress rows are read/written with the anon
  // client under RLS (student sees + writes only their own). Signed-out = local-only, no rows.
  const { userId, email, signOut } = useStudentAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [progress, setProgress] = useState<Record<string, ProgressState>>({});
  useEffect(() => {
    if (!userId) { setProgress({}); return; }
    let active = true;
    void (async () => {
      const { data } = await (supabase.from("student_set_progress" as never) as any).select("set_id,state");
      if (!active) return;
      const m: Record<string, ProgressState> = {};
      for (const r of (data ?? []) as { set_id: string; state: ProgressState }[]) m[r.set_id] = r.state;
      setProgress(m);
    })();
    return () => { active = false; };
  }, [userId]);
  const markProgress = (setId: string, next: ProgressState) => {
    // 'complete' never downgrades to 'in_progress'.
    if (progress[setId] === "complete" && next === "in_progress") return;
    setProgress((p) => ({ ...p, [setId]: next }));
    if (userId) void (supabase.from("student_set_progress" as never) as any).upsert({ user_id: userId, set_id: setId, state: next }, { onConflict: "user_id,set_id" });
  };

  const allTopics = useMemo(() => courses.flatMap((c) => c.topics.map((t) => ({ c, t }))), [courses]);
  // Restore last topic (or first) once data arrives.
  useEffect(() => {
    if (!courses.length || (topicId && allTopics.some((x) => x.t.id === topicId))) { if (courses.length && !openCourse) { const owner = allTopics.find((x) => x.t.id === topicId)?.c ?? courses[0]; setOpenCourse(owner.id); } return; }
    const first = allTopics[0]; if (first) { setTopicId(first.t.id); setOpenCourse(first.c.id); }
  }, [courses, allTopics, topicId, openCourse]);
  useEffect(() => { if (topicId) try { localStorage.setItem(LAST_TOPIC_KEY, topicId); } catch { /* ignore */ } }, [topicId]);

  const current = allTopics.find((x) => x.t.id === topicId);
  const accent = NEON.yellow;

  const openSet = (t: StudentTopic, s: StudentSet) => { if (s.access === "paid") { setPaywallTopic(t); return; } if (!s.playbackId) return; setPlaying({ set: s, topic: t }); };
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setPlaying(null); setPaywallTopic(null); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "#070B14", color: NEON.text, fontFamily: "'Rubik', system-ui, sans-serif" }}>
      {/* NAVBAR — mirrors the Study Canvas navbar shell */}
      <div className="flex h-11 shrink-0 items-center gap-2 px-3" style={{ background: "rgba(9,14,26,0.97)", borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <span className="inline-block h-5 w-4"><BrandLogo mode="bolt" c1="#C62828" c2="#1565C0" size={20} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.12em]" style={{ color: NEON.text }}>Survive · Learn</span>
        <div className="min-w-0 flex-1" />
        {userId ? (
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[180px] truncate text-[11px] sm:inline" style={{ color: NEON.muted }} title={email ?? undefined}>{email}</span>
            <button className="grid h-7 w-7 place-items-center rounded-lg" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={signOut} title="Sign out"><LogOut className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold" style={{ color: "#0B1322", background: NEON.yellow }} onClick={() => setSignInOpen(true)}><Mail className="h-3.5 w-3.5" /> Sign in</button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* OUTLINE — Course › Topic › CEQ Set (live only), accordion */}
        <aside className="w-[264px] shrink-0 overflow-y-auto px-1.5 py-2" style={{ borderRight: `1px solid ${NEON.borderSoft}`, background: "rgba(9,14,26,0.6)" }}>
          <div className="px-1 pb-1 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: NEON.muted }}>Course map</div>
          {q.isLoading && <p className="flex items-center gap-1.5 px-1.5 py-2 text-[11px] italic" style={{ color: NEON.muted }}><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>}
          {q.isError && <p className="px-1.5 py-2 text-[11px]" style={{ color: "#F3C6CC" }}>Couldn't load the course map. <button className="underline" onClick={() => q.refetch()}>Retry</button></p>}
          {!q.isLoading && !q.isError && courses.length === 0 && <p className="px-1.5 py-2 text-[11px] italic leading-snug" style={{ color: NEON.muted }}>No live videos yet — check back soon.</p>}
          {courses.map((c) => {
            const cOpen = openCourse === c.id;
            return (
              <div key={c.id} className="mb-0.5">
                <button className="flex w-full items-center gap-1 rounded px-1 py-1 text-left hover:bg-white/5" style={{ color: NEON.yellow }} onClick={() => setOpenCourse((k) => (k === c.id ? null : c.id))}>
                  {cOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate text-[12px] font-black uppercase tracking-wide">{c.name}</span>
                </button>
                {cOpen && (
                  <div className="ml-2 border-l pl-2" style={{ borderColor: NEON.borderSoft }}>
                    {c.topics.map((t) => {
                      const active = t.id === topicId;
                      const locked = t.sets.length > 0 && t.sets.every((s) => s.access === "paid");
                      return (
                        <button key={t.id} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-white/5" style={{ background: active ? "rgba(252,163,17,0.10)" : "transparent" }} onClick={() => setTopicId(t.id)} title={`${t.name} · ${t.sets.length} video${t.sets.length === 1 ? "" : "s"}`}>
                          {(() => { const done = t.sets.filter((s) => progress[s.id] === "complete").length; const allDone = done > 0 && done === t.sets.length; return locked ? <Lock className="h-3 w-3 shrink-0" style={{ color: "#F0B24A" }} /> : allDone ? <CircleCheck className="h-3 w-3 shrink-0" style={{ color: "#3BF5A0" }} /> : done > 0 ? <CircleDot className="h-3 w-3 shrink-0" style={{ color: NEON.cyan }} /> : <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: "rgba(147,160,180,0.5)" }} />; })()}
                          <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: active ? NEON.yellow : NEON.text }}>{t.name}</span>
                          {(() => { const done = t.sets.filter((s) => progress[s.id] === "complete").length; return <span className="shrink-0 text-[9px] tabular-nums" style={{ color: done > 0 ? "#3BF5A0" : NEON.muted }}>{done > 0 ? `${done}/${t.sets.length}` : t.sets.length}</span>; })()}
                        </button>
                      );
                    })}
                    {c.topics.length === 0 && <div className="px-1.5 py-1 text-[10px] italic" style={{ color: NEON.muted }}>No topics yet</div>}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        {/* MAIN — the selected topic's video-poster grid */}
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {q.isLoading && <div className="grid h-full place-items-center text-[12px]" style={{ color: NEON.muted }}><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your videos…</div>}
          {q.isError && <div className="grid h-full place-items-center text-[12px]" style={{ color: "#F3C6CC" }}>Something went wrong loading videos. <button className="ml-1 underline" onClick={() => q.refetch()}>Retry</button></div>}
          {!q.isLoading && !q.isError && !current && courses.length > 0 && <div className="grid h-full place-items-center text-[12px]" style={{ color: NEON.muted }}>Pick a topic from the course map.</div>}
          {!q.isLoading && !q.isError && courses.length === 0 && (
            <div className="grid h-full place-items-center text-center">
              <div><div className="mx-auto mb-3 inline-block h-16"><BoltBoil height={64} /></div><p className="text-[13px] font-bold" style={{ color: NEON.text }}>Cram videos are on the way.</p><p className="mt-1 text-[11.5px]" style={{ color: NEON.muted }}>Nothing is live yet — check back soon.</p></div>
            </div>
          )}
          {current && (
            <>
              <div className="mb-4 flex items-baseline gap-2">
                <h1 className="text-[20px] font-black" style={{ color: NEON.text }}>{current.t.name}</h1>
                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>{current.c.name} · {current.t.sets.length} video{current.t.sets.length === 1 ? "" : "s"}</span>
              </div>
              {current.t.sets.length === 0 ? (
                <div className="grid place-items-center rounded-2xl py-16 text-center text-[12px]" style={{ border: `1px dashed ${NEON.borderSoft}`, color: NEON.muted }}>No videos in this topic yet.</div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                  {current.t.sets.map((s) => <SetPoster key={s.id} set={s} topicChip={chip(current.t)} accent={accent} state={progress[s.id] ?? "unstarted"} onOpen={() => openSet(current.t, s)} />)}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {playing && <VideoPlayer set={playing.set} chipText={chip(playing.topic)} onClose={() => setPlaying(null)} onStarted={() => markProgress(playing.set.id, "in_progress")} onComplete={() => markProgress(playing.set.id, "complete")} />}
      {paywallTopic && <Paywall topic={paywallTopic} onClose={() => setPaywallTopic(null)} />}
      {signInOpen && <SignInDialog onClose={() => setSignInOpen(false)} />}
    </div>
  );
}
