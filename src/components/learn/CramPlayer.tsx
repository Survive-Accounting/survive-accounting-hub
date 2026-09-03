// THE PLAYER (learn v3, 09-03) — the Shorts view.
//
// One vertical video, centred, with the action column hugging its right edge: Practice · Tools ·
// Ask Lee · Share · Got it. Up/down (arrows, keys, swipe) move through the exam's cram videos in
// path order. Autoplay starts muted (the only autoplay a browser allows); the first tap on the
// sound pill unmutes for the whole session. When a video ends the next one rolls in, unless
// Practice is open.
//
// PRACTICE OPEN: the video slides left and shrinks to a pillar (still replayable), the drawer
// takes the centre with the real PracticeStage. ASK LEE: the video pauses and a compose card pops
// beside the column; it files a `question` intake with the set and the timestamp. On a phone the
// video is the screen, actions sit bottom-right, practice and ask are sheets.
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronLeft, Loader2, Lock, Volume2, VolumeX, X } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { PracticeStage } from "@/components/site/PracticeStage";
import { submitIntake } from "@/lib/intake.functions";
import type { PracticeQuestion, StudentSet, StudentTopic } from "@/lib/student.functions";
import { INK, type LearnTheme } from "@/components/learn/learn-theme";
import { RailIcon } from "@/components/learn/LearnRail";
import { DEMO_PLAYBACK, muxThumb, SOUND_KEY, type Prog } from "@/components/learn/cram-media";

export type PlayerItem = { set: StudentSet; topic: StudentTopic; n: number; of: number; locked: boolean };

const readSound = () => { try { return sessionStorage.getItem(SOUND_KEY) === "on"; } catch { return false; } };
const writeSound = (on: boolean) => { try { sessionStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* ignore */ } };
const SHARE_DISMISS = "sa-player-share-dismissed";

export function CramPlayer({
  items, index, onIndex, progress, onStarted, onComplete, onPosition, resolvePlayback, demo, narrow, theme,
  practice, onPractice, campusName, campusSlug, contactRef, onShare, onLocked, demoQuestions, onExit,
}: {
  /** Back to the home. */
  onExit: () => void;
  items: PlayerItem[];
  index: number;
  onIndex: (i: number) => void;
  progress: Record<string, Prog>;
  onStarted: (setId: string) => void;
  onComplete: (setId: string) => void;
  onPosition: (setId: string, positionSec: number, durationSec: number | null) => void;
  resolvePlayback: (set: StudentSet) => Promise<string | null>;
  demo: boolean;
  narrow: boolean;
  theme: LearnTheme;
  practice: boolean;
  onPractice: (open: boolean) => void;
  campusName: string | null;
  campusSlug: string | null;
  contactRef: string | null;
  onShare: () => void;
  onLocked: (topic: StudentTopic) => void;
  demoQuestions?: PracticeQuestion[];
}) {
  const item = items[index];
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => { setSoundOn(readSound()); }, []);
  const [ask, setAsk] = useState(false);
  const [shareCard, setShareCard] = useState(true);
  useEffect(() => { try { setShareCard(sessionStorage.getItem(SHARE_DISMISS) !== "1"); } catch { /* ignore */ } }, []);
  const hasPrev = index > 0, hasNext = index < items.length - 1;
  const go = useCallback((d: 1 | -1) => { const j = index + d; if (j >= 0 && j < items.length) { onIndex(j); setAsk(false); } }, [index, items.length, onIndex]);

  // keys: ↑↓ / j k move, space toggles play (when the drawer isn't focused)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [go]);

  // swipe (phone)
  const touchY = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchY.current = e.touches[0].clientY; };
  const onTouchEnd = (e: React.TouchEvent) => { if (touchY.current == null) return; const dy = e.changedTouches[0].clientY - touchY.current; touchY.current = null; if (Math.abs(dy) > 70) go(dy < 0 ? 1 : -1); };

  if (!item) return null;
  const { set, topic, n, of, locked } = item;
  const done = progress[set.id]?.state === "complete";
  const toggleSound = () => setSoundOn((v) => { writeSound(!v); return !v; });
  const gotIt = () => { onComplete(set.id); if (hasNext) window.setTimeout(() => go(1), 250); };

  const video = (
    <Video
      key={set.id} set={set} locked={locked} demo={demo} soundOn={soundOn} onToggleSound={toggleSound}
      prog={progress[set.id]} narrow={narrow} shrink={!narrow && practice} theme={theme}
      onStarted={() => onStarted(set.id)} onComplete={() => onComplete(set.id)} onPosition={(p, d) => onPosition(set.id, p, d)}
      onEnded={() => { if (!practice && !ask && hasNext) window.setTimeout(() => go(1), 1200); }}
      onLocked={() => onLocked(topic)} resolvePlayback={resolvePlayback} paused={ask}
      caption={{ topic: topic.name, n, of, name: set.name }}
    />
  );

  const actions = (
    <div className="flex flex-col items-center" style={{ gap: narrow ? 12 : 14 }}>
      <button type="button" className="lk-act" data-on={practice} onClick={() => { if (set.ceqCount > 0) { onPractice(!practice); setAsk(false); } }} disabled={set.ceqCount === 0} style={{ opacity: set.ceqCount ? 1 : 0.4 }} title={set.ceqCount ? `${set.ceqCount} practice questions` : "No questions for this set yet"}>
        <span className="lk-act-b">{set.ceqCount ? `${set.ceqCount} Qs` : "—"}</span>Practice
      </button>
      <button type="button" className="lk-act" disabled style={{ opacity: 0.4 }} title="Study tools — coming"><span className="lk-act-b"><RailIcon k="tools" /></span>Tools</button>
      <button type="button" className="lk-act" data-on={ask} onClick={() => { setAsk((v) => !v); if (!ask) onPractice(false); }}><span className="lk-act-b">?</span>Ask Lee</button>
      <button type="button" className="lk-act" onClick={onShare}><span className="lk-act-b"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 3v13M7 8l5-5 5 5" /></svg></span>Share</button>
      <button type="button" className="lk-act" data-on={done} onClick={gotIt} title={done ? "Crammed" : "Mark it crammed and move on"}><span className="lk-act-b"><Check className="h-4 w-4" /></span>{done ? "Crammed" : "Got it"}</button>
    </div>
  );

  const askCard = ask && (
    <AskLee set={set} topic={topic} campusName={campusName} campusSlug={campusSlug} contactRef={contactRef} demo={demo} narrow={narrow} onClose={() => setAsk(false)} />
  );

  const practicePanel = practice && set.ceqCount > 0 && (
    <div className={narrow ? "flex min-h-0 flex-1 flex-col" : "lk-in flex flex-col overflow-hidden rounded-2xl"} style={narrow ? { background: INK.surface, borderTop: `1px solid ${INK.border}`, borderRadius: "18px 18px 0 0" } : { width: "min(560px, 46vw)", height: "min(700px, calc(100dvh - 110px))", background: INK.surface, border: `1px solid ${INK.border}` }}>
      <div className="flex shrink-0 items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${INK.border}` }}>
        <span className="lk-disp" style={{ fontSize: 15 }}>Practice</span>
        <span className="min-w-0 truncate text-[12px]" style={{ color: INK.muted }}>{set.name}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => onPractice(false)} className="grid h-8 w-8 place-items-center rounded-full" style={{ background: INK.border, color: INK.text, border: 0, cursor: "pointer" }} aria-label="Close practice"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ display: "flex", flexDirection: "column" }}>
        <PracticeStage
          setId={set.id}
          questions={demo ? demoQuestions : undefined}
          reference={{ topic: topic.number, set: n }}
          setName={set.name}
          campusName={campusName}
          campusSlug={campusSlug}
          surface="learn"
          isTest={demo}
          doneLabel={hasNext ? "Next cram →" : "Back to the videos"}
          onDone={() => { onPractice(false); if (hasNext) go(1); }}
        />
      </div>
    </div>
  );

  if (narrow) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col" style={{ background: "#000" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className={practice || ask ? "shrink-0" : "min-h-0 flex-1"} style={practice || ask ? { height: 220 } : undefined}>{video}</div>
        <button type="button" onClick={onExit} className="absolute left-3 top-3 z-[2] grid h-9 w-9 place-items-center rounded-full" style={{ background: "rgba(28,28,28,0.85)", color: INK.text, border: 0, cursor: "pointer" }} aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
        {!practice && !ask && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 p-4" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))" }}>
            <div className="min-w-0 flex-1 pb-1">
              <div className="text-[10px] font-extrabold uppercase" style={{ letterSpacing: "0.14em", color: theme.accent }}>{topic.name} · {n} of {of}</div>
              <div className="lk-disp" style={{ fontSize: 19, lineHeight: 1.1, marginTop: 4 }}>{set.name}</div>
              <div className="mt-1.5 text-[11px]" style={{ color: INK.muted }}>swipe up for the next one</div>
            </div>
            <div className="pointer-events-auto">{actions}</div>
          </div>
        )}
        {practicePanel}
        {askCard}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 items-end justify-center" style={{ gap: 16, padding: "8px 32px 20px" }}>
      <button type="button" onClick={onExit} className="lk-btn lk-btn-ghost absolute left-8 top-3" style={{ padding: "7px 12px 7px 8px", fontSize: 11 }}><ChevronLeft className="h-4 w-4" /> All videos</button>
      {/* left: a dismissible share card, idle only */}
      {!practice && !ask && shareCard && (
        <div className="lk-card lk-in absolute bottom-6 left-8 flex w-[280px] flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[13.5px] font-bold leading-snug">Know someone in this class?</div>
            <button type="button" onClick={() => { setShareCard(false); try { sessionStorage.setItem(SHARE_DISMISS, "1"); } catch { /* ignore */ } }} className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: INK.border, color: INK.muted, border: 0, cursor: "pointer" }} aria-label="Dismiss"><X className="h-3 w-3" /></button>
          </div>
          <div className="text-[12.5px] leading-relaxed" style={{ color: INK.muted }}>Send them this. Exam 1 is free for them too, and free for your whole fraternity or sorority.</div>
          <button type="button" onClick={onShare} className="lk-btn lk-btn-ghost self-start" style={{ padding: "7px 12px", fontSize: 11 }}>Share with a friend</button>
        </div>
      )}
      {video}
      {actions}
      {practicePanel}
      {askCard}
      <div className="absolute right-8 top-1/2 flex -translate-y-1/2 flex-col gap-2.5">
        <button type="button" className="lk-act" onClick={() => go(-1)} disabled={!hasPrev} style={{ opacity: hasPrev ? 1 : 0.3 }} aria-label="Previous"><span className="lk-act-b"><ArrowUp className="h-4 w-4" /></span></button>
        <button type="button" className="lk-act" onClick={() => go(1)} disabled={!hasNext} style={{ opacity: hasNext ? 1 : 0.3 }} aria-label="Next"><span className="lk-act-b"><ArrowDown className="h-4 w-4" /></span></button>
      </div>
    </div>
  );
}

// ── the video ──────────────────────────────────────────────────────────────────────────────────
function Video({ set, locked, demo, soundOn, onToggleSound, prog, narrow, shrink, theme, onStarted, onComplete, onPosition, onEnded, onLocked, resolvePlayback, paused, caption }: {
  set: StudentSet; locked: boolean; demo: boolean; soundOn: boolean; onToggleSound: () => void; prog: Prog | undefined; narrow: boolean; shrink: boolean; theme: LearnTheme;
  onStarted: () => void; onComplete: () => void; onPosition: (p: number, d: number | null) => void; onEnded: () => void; onLocked: () => void;
  resolvePlayback: (set: StudentSet) => Promise<string | null>; paused: boolean;
  caption: { topic: string; n: number; of: number; name: string };
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  const [ended, setEnded] = useState(false);
  const [fetched, setFetched] = useState<string | null>(null);
  const pid = set.playbackId ?? fetched;
  const isDemo = demo || pid === DEMO_PLAYBACK;
  const portrait = set.orientation === "portrait";
  useEffect(() => {
    if (locked || pid || set.access !== "paid") return;
    let on = true;
    void resolvePlayback(set).then((id) => { if (on) setFetched(id); }).catch(() => { if (on) setErr(true); });
    return () => { on = false; };
  }, [locked, pid, set, resolvePlayback]);
  useEffect(() => {
    const v = ref.current;
    if (isDemo || locked || !v || !pid) return;
    const src = `https://stream.mux.com/${pid}.m3u8`;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; }
    else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !ref.current) return;
        if (Hls.isSupported()) { const h = new Hls(); h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr(true); }); h.loadSource(src); h.attachMedia(ref.current); hls = h; }
        else ref.current.src = src;
      }).catch(() => setErr(true));
    }
    return () => { cancelled = true; hls?.destroy(); };
  }, [pid, isDemo, locked]);
  const startAt = prog?.state === "in_progress" ? prog.positionSec : 0;
  useEffect(() => {
    const v = ref.current;
    if (!v || isDemo || locked || !pid) return;
    if (paused) { v.pause(); return; }
    const go = () => { if (startAt > 5 && (!v.duration || startAt < v.duration - 10) && v.currentTime < 1) v.currentTime = startAt; void v.play().catch(() => { /* tap play */ }); };
    if (v.readyState >= 1) go(); else v.addEventListener("loadedmetadata", go, { once: true });
    return () => v.removeEventListener("loadedmetadata", go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, isDemo, locked, paused]);
  useEffect(() => { const v = ref.current; if (v) v.muted = !soundOn; }, [soundOn]);
  const lastWrite = useRef(0);
  const flush = () => { const v = ref.current; if (v && v.currentTime > 0) onPosition(Math.floor(v.currentTime), v.duration ? Math.floor(v.duration) : null); };
  useEffect(() => () => { const v = ref.current; if (v && !isDemo && v.currentTime > 0 && !v.ended) onPosition(Math.floor(v.currentTime), v.duration ? Math.floor(v.duration) : null); }, [isDemo, onPosition]);
  const finish = () => { onComplete(); setEnded(true); onEnded(); };

  // Desktop: the Shorts proportion, sized to whatever height the viewport actually has (the top
  // bar takes ~72px, the padding ~30) — a 746px video on a 720px laptop must shrink, not clip.
  const h = narrow ? "100%" : shrink ? "min(533px, calc(100dvh - 110px))" : "min(746px, calc(100dvh - 110px))";
  const w = narrow ? "100%" : shrink ? "calc(min(533px, calc(100dvh - 110px)) * 9 / 16)" : "calc(min(746px, calc(100dvh - 110px)) * 9 / 16)";
  return (
    <div className="relative overflow-hidden" style={{ width: w, height: h, borderRadius: narrow ? 0 : 16, background: "#000", flexShrink: 0, transition: "width 160ms ease, height 160ms ease" }}>
      {locked ? (
        <button type="button" onClick={onLocked} className="grid h-full w-full place-items-center text-center" style={{ background: INK.surface2, border: 0, color: INK.text, cursor: "pointer" }}>
          <div><Lock className="mx-auto h-7 w-7" style={{ color: INK.muted }} /><div className="mt-2 text-[13px] font-bold">{caption.topic} isn't open yet</div><div className="mt-0.5 text-[11.5px]" style={{ color: INK.muted }}>tap to get notified</div></div>
        </button>
      ) : isDemo ? (
        <div className="grid h-full w-full place-items-center text-center" style={{ background: "radial-gradient(60% 40% at 50% 45%, #2A2A2A 0%, #000 70%)" }}>
          <div><div className="mx-auto mb-3 inline-block"><BoltBoil height={56} /></div><div className="text-[11px] font-semibold" style={{ color: INK.muted, fontFamily: "monospace" }}>[ cram video plays here ]</div>{!ended && <button type="button" className="lk-btn lk-btn-acc mt-4" onClick={finish}>Finish video (demo)</button>}</div>
        </div>
      ) : err ? (
        <div className="grid h-full w-full place-items-center px-6 text-center text-[13px]" style={{ color: INK.red }}>Couldn't load this video. Try again shortly.</div>
      ) : !pid ? (
        <div className="grid h-full w-full place-items-center text-center" style={{ background: INK.surface2 }}><div><div className="mx-auto mb-2 inline-block"><BoltBoil height={48} /></div><div className="text-[12px] font-semibold" style={{ color: INK.muted }}>Cram video coming soon</div></div></div>
      ) : (
        <>
          <video ref={ref} controls playsInline muted={!soundOn} preload="auto" poster={muxThumb(pid, portrait ? 480 : 960)} className="h-full w-full" style={{ objectFit: "contain", background: "#000" }}
            onPlay={() => { setEnded(false); onStarted(); }} onPause={flush}
            onTimeUpdate={() => { const now = Date.now(); if (now - lastWrite.current > 5000) { lastWrite.current = now; flush(); } }}
            onEnded={finish} />
          <button type="button" onClick={onToggleSound} className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-extrabold shadow-lg" style={{ background: soundOn ? "rgba(28,28,28,0.85)" : theme.accent, color: soundOn ? INK.text : theme.accentInk, border: 0, cursor: "pointer" }}>
            {soundOn ? <><Volume2 className="h-3.5 w-3.5" /> Sound on</> : <><VolumeX className="h-3.5 w-3.5" /> Tap for sound</>}
          </button>
        </>
      )}
      {!narrow && !shrink && !locked && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 pt-10" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))" }}>
          <div className="text-[10px] font-extrabold uppercase" style={{ letterSpacing: "0.14em", color: theme.accent }}>{caption.topic} · {caption.n} of {caption.of}</div>
          <div className="lk-disp" style={{ fontSize: 18, lineHeight: 1.1, marginTop: 3 }}>{caption.name}</div>
        </div>
      )}
      {shrink && <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 pt-8" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))" }}><div className="lk-disp" style={{ fontSize: 14 }}>{caption.name}</div><div className="text-[11px]" style={{ color: INK.muted }}>replay any time</div></div>}
    </div>
  );
}

// ── Ask Lee ────────────────────────────────────────────────────────────────────────────────────
function AskLee({ set, topic, campusName, campusSlug, contactRef, demo, narrow, onClose }: { set: StudentSet; topic: StudentTopic; campusName: string | null; campusSlug: string | null; contactRef: string | null; demo: boolean; narrow: boolean; onClose: () => void }) {
  const [msg, setMsg] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.trim());
  const isPhone = contact.trim().replace(/\D/g, "").length >= 10;
  const ok = msg.trim().length > 3 && (isEmail || isPhone);
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      if (!demo) await submitIntake({ data: { kind: "question", email: isEmail ? contact.trim() : null, phone: isPhone && !isEmail ? contact.trim() : null, campusName, campusSlug, topic: topic.name, chapter: set.name, note: msg.trim(), source: "ask-lee-cram", sourcePath: `cram:${set.id}`, adminLink: null, chapterLink: contactRef ? `by:${contactRef}` : null } });
      setDone(true);
    } catch { setErr("Couldn't send that — try again in a minute."); }
    finally { setBusy(false); }
  };
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="lk-disp whitespace-nowrap" style={{ fontSize: 16 }}>Ask Lee</span>
        <span className="min-w-0 truncate text-[12px]" style={{ color: INK.muted }}>about {set.name}</span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full" style={{ background: INK.border, color: INK.text, border: 0, cursor: "pointer" }} aria-label="Close"><X className="h-3.5 w-3.5" /></button>
      </div>
      {done ? (
        <div className="rounded-xl px-4 py-4 text-center" style={{ background: "rgba(78,232,180,0.12)", border: `1px solid ${INK.green}` }}><Check className="mx-auto h-5 w-5" style={{ color: INK.green }} /><p className="mt-1 text-[13.5px] font-bold">Got it. I read every one, usually same day.</p></div>
      ) : (
        <>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} placeholder="What's tripping you up?" className="lk-field" style={{ resize: "none", fontSize: 15 }} autoFocus />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="your number or email, so I can answer" className="lk-field" style={{ fontSize: 15 }} />
          <div className="flex items-center gap-3"><button type="button" onClick={() => void send()} disabled={!ok || busy} className="lk-btn lk-btn-acc disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send</button><span className="text-[11.5px]" style={{ color: INK.muted }}>I read every one. Usually same day.</span></div>
          {err && <p role="alert" className="text-[12px]" style={{ color: INK.red }}>{err}</p>}
        </>
      )}
    </>
  );
  if (narrow) return <div className="lk-in flex min-h-0 flex-1 flex-col gap-3 p-4" style={{ background: INK.surface, borderTop: `1px solid ${INK.border}`, borderRadius: "18px 18px 0 0" }}>{body}</div>;
  return <div className="lk-card lk-in flex w-[380px] flex-col gap-3 self-end p-4" style={{ marginBottom: "min(120px, 12vh)" }}>{body}</div>;
}
