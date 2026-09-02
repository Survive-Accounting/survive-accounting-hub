// THE CRAM FEED (learn feed, 09-02) — one set per card, cram is always on.
//
// ── THE MODEL ─────────────────────────────────────────────────────────────────────────────────
// Landing here means cram is already running: the first unwatched cram video autoplays (muted,
// which is the only autoplay a browser allows) the moment its card is centred. Scroll snaps card
// to card; whichever card is most in view is the one playing, every other one is paused. When a
// video ends the feed rolls to the next card. That is the whole product for the next few weeks:
// ~25 cram videos, ~2 minutes each, under an hour. Practice and review are LATER extensions of
// the same card — they are not modes, and there is no mode switcher.
//
// ── SOUND ─────────────────────────────────────────────────────────────────────────────────────
// Autoplay starts muted. The first tap on "Tap for sound" unmutes and the whole feed stays
// unmuted for the session (sessionStorage) — the YouTube Shorts rule. Native controls stay on so
// a student can scrub, pause, or fullscreen without learning anything.
//
// ── PORTRAIT vs LANDSCAPE ─────────────────────────────────────────────────────────────────────
// Cram videos are 9:16; anything landscape gets the full card width. A portrait video takes a
// fixed 300px pillar on desktop and the copy sits beside it; on a phone the card is the viewport.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Lock, Share2, Volume2, VolumeX } from "lucide-react";

import { NEON } from "@/components/canvas/theme";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { ExamWaitlist, type ExamTabState } from "@/components/learn/ExamRail";
import type { StudentSet, StudentTopic } from "@/lib/student.functions";

export type ProgressState = "unstarted" | "in_progress" | "complete";
/** One set's progress. positionSec/durationSec power resume; updatedAt orders recency. Signed-out
 *  lives in localStorage, signed-in in student_set_progress. */
export type Prog = { state: ProgressState; positionSec: number; durationSec: number | null; updatedAt: number };

export type FeedItem = {
  set: StudentSet;
  topic: StudentTopic;
  /** "Exam 1" — the unit the topic sits under. */
  unitLabel: string;
  /** Paid and not unlocked — the card is a locked face that opens the paywall. */
  locked: boolean;
  /** 1-based position of the set inside its topic, and the topic's size. */
  n: number;
  of: number;
};

export const DEMO_PLAYBACK = "__demo__";
/** Mux frame-accurate poster — free for every published video. */
export const muxThumb = (playbackId: string, width = 480) => `https://image.mux.com/${playbackId}/thumbnail.jpg?width=${width}&time=2`;
export const fmtRuntime = (sec: number) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, "0")}`; };

const SOUND_KEY = "sa-cram-sound";
export const LAST_SET_KEY = "sa-cram-last-set";
const readSound = () => { try { return sessionStorage.getItem(SOUND_KEY) === "on"; } catch { return false; } };
const writeSound = (on: boolean) => { try { sessionStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* ignore */ } };

/** Scroll the feed to a set's card. `instant` for the resume-on-load jump, smooth otherwise. */
export function scrollFeedToSet(root: HTMLElement | null, setId: string, behavior: ScrollBehavior = "smooth"): boolean {
  const el = root?.querySelector<HTMLElement>(`[data-set-id="${CSS.escape(setId)}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior, block: "start" });
  return true;
}

export function CramFeed({
  items, progress, demo, narrow, scrollRef, registerCard, examLabel, nextExam, campusId, campusName, courseCode,
  initialSetId, onActive, onStarted, onComplete, onPosition, onLocked, resolvePlayback, onShare,
}: {
  items: FeedItem[];
  progress: Record<string, Prog>;
  demo: boolean;
  narrow: boolean;
  /** The feed's own scroll container — the route owns the ref so the spine can watch it. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  registerCard: (topicId: string) => (el: HTMLElement | null) => void;
  examLabel: string;
  /** The next exam that is NOT available yet — the finish card's email capture. */
  nextExam: ExamTabState | null;
  campusId: string | null;
  campusName: string | null;
  courseCode: string | null;
  /** Where to land on load: ?set= or the last card this browser was on. */
  initialSetId: string | null;
  onActive: (setId: string) => void;
  onStarted: (setId: string) => void;
  onComplete: (setId: string) => void;
  onPosition: (setId: string, positionSec: number, durationSec: number | null) => void;
  onLocked: (topic: StudentTopic) => void;
  /** An UNLOCKED paid set has its playback id withheld from the tree — fetched when its card nears. */
  resolvePlayback: (set: StudentSet) => Promise<string | null>;
  onShare: () => void;
}) {
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => { setSoundOn(readSound()); }, []);
  const toggleSound = () => setSoundOn((v) => { writeSound(!v); return !v; });

  // ── WHICH CARD IS ACTIVE — the one most in view. IntersectionObserver against the feed's own
  //    scroll box; the card with the largest visible fraction (≥ 0.45) wins.
  const [activeId, setActiveId] = useState<string | null>(null);
  const ratios = useRef<Map<string, number>>(new Map());
  const cardEls = useRef<Map<string, HTMLElement>>(new Map());
  const ioRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.setId;
        if (id) ratios.current.set(id, e.intersectionRatio);
      }
      let best: string | null = null, bestR = 0.45;
      for (const [id, r] of ratios.current) if (r > bestR) { bestR = r; best = id; }
      if (best) setActiveId(best);
    }, { root, threshold: [0, 0.25, 0.45, 0.6, 0.8, 1] });
    ioRef.current = io;
    for (const el of cardEls.current.values()) io.observe(el);
    return () => { io.disconnect(); ioRef.current = null; };
  }, [scrollRef, items.length]);
  const attachCard = useCallback((setId: string, topicId: string) => (el: HTMLElement | null) => {
    const prev = cardEls.current.get(setId);
    if (prev && prev !== el) { ioRef.current?.unobserve(prev); cardEls.current.delete(setId); ratios.current.delete(setId); }
    if (el) { cardEls.current.set(setId, el); ioRef.current?.observe(el); registerCard(topicId)(el); }
  }, [registerCard]);

  useEffect(() => {
    if (!activeId) return;
    onActive(activeId);
    try { localStorage.setItem(LAST_SET_KEY, activeId); } catch { /* ignore */ }
  }, [activeId, onActive]);

  // RESUME — land on the card the student was on (or ?set=). Once, when the cards exist.
  const resumed = useRef(false);
  useLayoutEffect(() => {
    if (resumed.current || !items.length || !initialSetId) return;
    resumed.current = true;
    if (items[0].set.id !== initialSetId) scrollFeedToSet(scrollRef.current, initialSetId, "instant");
  }, [items, initialSetId, scrollRef]);

  const activeIdx = items.findIndex((i) => i.set.id === activeId);
  const goNext = (fromIdx: number) => {
    const next = items[fromIdx + 1];
    if (next) scrollFeedToSet(scrollRef.current, next.set.id);
  };
  const jumpTopic = (topicId: string) => { const hit = items.find((i) => i.topic.id === topicId); if (hit) scrollFeedToSet(scrollRef.current, hit.set.id); };
  // Only sets with a cram video are "watchable" — coming-soon cards hold a place, not a count.
  const watchable = items.filter((i) => !!i.set.playbackId && !i.locked);
  const firstUnwatched = watchable.find((i) => progress[i.set.id]?.state !== "complete") ?? null;
  const doneCount = watchable.filter((i) => progress[i.set.id]?.state === "complete").length;
  const totalSec = watchable.reduce((a, i) => a + (i.set.runtimeSec ?? 0), 0);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ scrollSnapType: "y proximity", scrollPaddingTop: narrow ? 0 : 14, fontFamily: BRAND_SANS }}
    >
      <div className={narrow ? "" : "mx-auto flex max-w-[860px] flex-col gap-4 px-4 py-4 pb-28"}>
        {items.map((item, idx) => {
          const topicEnds = idx === items.length - 1 || items[idx + 1].topic.id !== item.topic.id;
          const topicItems = watchable.filter((i) => i.topic.id === item.topic.id);
          const topicDone = topicItems.filter((i) => progress[i.set.id]?.state === "complete").length;
          return (
            <div key={item.set.id} className="contents">
              <CramCard
                item={item}
                idx={idx}
                active={item.set.id === activeId}
                near={activeIdx < 0 ? idx < 2 : Math.abs(idx - activeIdx) <= 1}
                prog={progress[item.set.id]}
                demo={demo}
                narrow={narrow}
                soundOn={soundOn}
                onToggleSound={toggleSound}
                attach={attachCard(item.set.id, item.topic.id)}
                onStarted={() => onStarted(item.set.id)}
                onComplete={() => onComplete(item.set.id)}
                onPosition={(p, d) => onPosition(item.set.id, p, d)}
                onEnded={() => goNext(idx)}
                onLocked={() => onLocked(item.topic)}
                resolvePlayback={resolvePlayback}
              />
              {topicEnds && idx < items.length - 1 && (
                <TopicBreak
                  topic={item.topic} done={topicDone} total={topicItems.length}
                  nextTopic={items[idx + 1].topic} courseCode={courseCode} narrow={narrow}
                  onShare={onShare} onNext={() => goNext(idx)}
                />
              )}
            </div>
          );
        })}

        {items.length > 0 && (
          <FinishCard
            examLabel={examLabel} done={doneCount} total={watchable.length} totalSec={totalSec}
            topics={Array.from(new Map(items.map((i) => [i.topic.id, i.topic])).values())}
            nextExam={nextExam} campusId={campusId} campusName={campusName} courseCode={courseCode}
            narrow={narrow}
            onShare={onShare} onJumpTopic={jumpTopic}
            onContinue={firstUnwatched ? () => scrollFeedToSet(scrollRef.current, firstUnwatched.set.id) : null}
          />
        )}
      </div>
    </div>
  );
}

// ── ONE CARD ─────────────────────────────────────────────────────────────────────────────────────
function CramCard({ item, idx, active, near, prog, demo, narrow, soundOn, onToggleSound, attach, onStarted, onComplete, onPosition, onEnded, onLocked, resolvePlayback }: {
  item: FeedItem; idx: number; active: boolean; near: boolean; prog: Prog | undefined; demo: boolean; narrow: boolean;
  soundOn: boolean; onToggleSound: () => void; attach: (el: HTMLElement | null) => void;
  onStarted: () => void; onComplete: () => void; onPosition: (p: number, d: number | null) => void; onEnded: () => void;
  onLocked: () => void; resolvePlayback: (set: StudentSet) => Promise<string | null>;
}) {
  const { set, topic, unitLabel, locked, n, of } = item;
  // A FREE set whose cram video hasn't shipped yet (questions authored, blast still rendering) is
  // a slim card, not a full-height empty frame: it holds the set's place in the run and fills in
  // the day the video publishes. It is never "active" — nothing to play.
  if (!locked && !set.playbackId && set.access === "free" && !demo) {
    return (
      <article
        ref={attach}
        data-set-id={set.id}
        data-idx={idx}
        className="lm-surface flex items-center gap-4 rounded-2xl border px-4 py-3"
        style={{ scrollSnapAlign: "start", margin: narrow ? "10px 12px" : 0, borderColor: "var(--lm-border)", borderWidth: 1, borderStyle: "dashed" }}
      >
        <div className="grid h-14 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}><BoltBoil height={26} opacity={0.6} /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: NEON.muted }}>{unitLabel} · {topic.name} · {n} of {of}</div>
          <div className="truncate text-[15px] font-black" style={{ color: NEON.text, fontFamily: BRAND_DISPLAY }}>{set.name}</div>
          <div className="text-[11.5px]" style={{ color: NEON.muted }}>Cram video coming soon{set.ceqCount > 0 ? ` · ${set.ceqCount} practice Qs authored` : ""}</div>
        </div>
      </article>
    );
  }
  return <CramVideoCard item={item} idx={idx} active={active} near={near} prog={prog} demo={demo} narrow={narrow} soundOn={soundOn} onToggleSound={onToggleSound} attach={attach} onStarted={onStarted} onComplete={onComplete} onPosition={onPosition} onEnded={onEnded} onLocked={onLocked} resolvePlayback={resolvePlayback} />;
}

function CramVideoCard({ item, idx, active, near, prog, demo, narrow, soundOn, onToggleSound, attach, onStarted, onComplete, onPosition, onEnded, onLocked, resolvePlayback }: {
  item: FeedItem; idx: number; active: boolean; near: boolean; prog: Prog | undefined; demo: boolean; narrow: boolean;
  soundOn: boolean; onToggleSound: () => void; attach: (el: HTMLElement | null) => void;
  onStarted: () => void; onComplete: () => void; onPosition: (p: number, d: number | null) => void; onEnded: () => void;
  onLocked: () => void; resolvePlayback: (set: StudentSet) => Promise<string | null>;
}) {
  const { set, topic, unitLabel, locked, n, of } = item;
  const portrait = set.orientation === "portrait";
  const complete = prog?.state === "complete";
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  const [ended, setEnded] = useState(false);
  // An unlocked PAID set arrives without its playback id — resolved when the card nears.
  const [fetched, setFetched] = useState<string | null>(null);
  const pid = set.playbackId ?? fetched;
  const isDemo = demo || pid === DEMO_PLAYBACK;
  useEffect(() => {
    if (!near || locked || pid || set.access !== "paid") return;
    let on = true;
    void resolvePlayback(set).then((id) => { if (on) setFetched(id); }).catch(() => { if (on) setErr(true); });
    return () => { on = false; };
  }, [near, locked, pid, set, resolvePlayback]);

  // hls.js is attached only while the card is near the active one — a 25-card feed must not open
  // 25 streams. Same path as the old SetPlayer (@mux/mux-player isn't a dep).
  useEffect(() => {
    const v = ref.current;
    if (!near || isDemo || locked || !v || !pid) return;
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
    return () => { cancelled = true; hls?.destroy(); if (v) { v.removeAttribute("src"); v.load(); } };
  }, [near, pid, isDemo, locked]);

  // ACTIVE → play (resume past 5s, never into the last 10s). INACTIVE → pause. Sound follows the
  // session flag; the muted attribute is bound below so the toggle is instant.
  const startAt = prog?.state === "in_progress" ? prog.positionSec : 0;
  useEffect(() => {
    const v = ref.current;
    if (!v || isDemo || locked || !pid) return;
    if (!active) { v.pause(); return; }
    setEnded(false);
    const go = () => {
      if (startAt > 5 && (!v.duration || startAt < v.duration - 10) && v.currentTime < 1) v.currentTime = startAt;
      void v.play().catch(() => { /* the student can hit play */ });
    };
    if (v.readyState >= 1) go(); else v.addEventListener("loadedmetadata", go, { once: true });
    return () => v.removeEventListener("loadedmetadata", go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pid, isDemo, locked]);
  useEffect(() => { const v = ref.current; if (v) v.muted = !soundOn; }, [soundOn]);

  const lastWrite = useRef(0);
  const flush = () => { const v = ref.current; if (v && v.currentTime > 0) onPosition(Math.floor(v.currentTime), v.duration ? Math.floor(v.duration) : null); };
  useEffect(() => () => { const v = ref.current; if (v && !isDemo && v.currentTime > 0 && !v.ended) onPosition(Math.floor(v.currentTime), v.duration ? Math.floor(v.duration) : null); }, [isDemo, onPosition]);

  const finish = () => { onComplete(); setEnded(true); window.setTimeout(onEnded, 1400); };

  const videoBox = (
    <div className="relative overflow-hidden bg-black" style={{ aspectRatio: portrait ? "9 / 16" : "16 / 9", borderRadius: narrow ? 0 : 14, width: "100%", maxHeight: narrow ? "calc(100dvh - 140px)" : undefined, margin: narrow ? "0 auto" : undefined }}>
      {locked ? (
        <button type="button" onClick={onLocked} className="grid h-full w-full place-items-center text-center" style={{ background: "linear-gradient(160deg, #12203E, #070C1A)" }}>
          <div>
            <Lock className="mx-auto h-7 w-7" style={{ color: "#F0B24A" }} />
            <div className="mt-2 text-[12px] font-bold" style={{ color: NEON.text }}>{topic.name} isn't open yet</div>
            <div className="mt-0.5 text-[11px]" style={{ color: NEON.muted }}>tap to get notified</div>
          </div>
        </button>
      ) : isDemo ? (
        <div className="grid h-full w-full place-items-center text-center" style={{ background: "#05080f" }}>
          <div>
            <div className="mx-auto mb-3 inline-block"><BoltBoil height={56} /></div>
            <div className="text-[11px] font-bold" style={{ color: NEON.muted, fontFamily: "monospace" }}>[ cram video plays here ]</div>
            {!complete && !ended && active && <button className="mt-4 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wide" style={{ color: "#0B1322", background: NEON.yellow }} onClick={finish}>Finish video (demo)</button>}
          </div>
        </div>
      ) : err ? (
        <div className="grid h-full w-full place-items-center px-4 text-center text-[12px]" style={{ background: "#0b1020", color: "#F3C6CC" }}>Couldn't load this video. Try again shortly.</div>
      ) : !pid ? (
        <div className="grid h-full w-full place-items-center text-center" style={{ background: "linear-gradient(160deg, #12203E, #070C1A)" }}>
          <div><div className="mx-auto mb-2 inline-block"><BoltBoil height={48} /></div><div className="text-[11.5px] font-bold" style={{ color: NEON.muted }}>Cram video coming soon</div></div>
        </div>
      ) : (
        <>
          <video
            ref={ref} controls playsInline muted={!soundOn} preload={near ? "auto" : "none"}
            poster={muxThumb(pid, portrait ? 480 : 960)}
            className="h-full w-full" style={{ objectFit: "contain", background: "#000" }}
            onPlay={() => { setEnded(false); onStarted(); }}
            onPause={flush}
            onTimeUpdate={() => { const now = Date.now(); if (now - lastWrite.current > 5000) { lastWrite.current = now; flush(); } }}
            onEnded={finish}
          />
          {!soundOn && active && (
            <button
              type="button" onClick={onToggleSound}
              className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-black shadow-lg"
              style={{ background: "rgba(252,163,17,0.95)", color: "#0B1322" }}
            >
              <VolumeX className="h-3.5 w-3.5" /> Tap for sound
            </button>
          )}
          {soundOn && active && (
            <button type="button" onClick={onToggleSound} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full" style={{ background: "rgba(4,7,14,0.6)", color: "#fff" }} title="Mute"><Volume2 className="h-4 w-4" /></button>
          )}
          {ended && (
            <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center">
              <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-black" style={{ background: "rgba(47,191,113,0.92)", color: "#04120F" }}><Check className="h-3.5 w-3.5" /> Crammed · next one <ChevronDown className="h-3.5 w-3.5" /></span>
            </div>
          )}
        </>
      )}
    </div>
  );

  const copy = (
    <div className="flex min-w-0 flex-col gap-2.5" style={{ padding: narrow ? "12px 16px 18px" : 0 }}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: NEON.muted }}>
        <span className="truncate">{unitLabel} · {topic.name}</span>
        <span className="shrink-0">· {n} of {of}</span>
        {complete && <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5" style={{ color: NEON.green, border: `1px solid rgba(47,191,113,0.45)` }}><Check className="h-3 w-3" /> Crammed</span>}
      </div>
      <h2 className="text-[19px] font-black leading-tight sm:text-[22px]" style={{ color: NEON.text, fontFamily: BRAND_DISPLAY }}>{set.name}</h2>
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]" style={{ color: NEON.muted }}>
        {set.runtimeSec != null && <span className="rounded-full px-2 py-0.5 tabular-nums" style={{ border: `1px solid ${NEON.borderSoft}` }}>Cram · {fmtRuntime(set.runtimeSec)}</span>}
        {set.shortLabel && <span className="rounded-full px-2 py-0.5" style={{ border: `1px solid ${NEON.borderSoft}` }}>{set.shortLabel}</span>}
        {set.ceqCount > 0 && <span className="rounded-full px-2 py-0.5" style={{ border: `1px dashed ${NEON.borderSoft}` }} title="The practice player lands here soon">Practice · {set.ceqCount} Qs · soon</span>}
      </div>
      {/* ON THE EXAM — the first question's stem, straight from the set's CEQs. Real, never
          invented; a set with no questions yet simply has no teaser. */}
      {set.firstStem && !narrow && (
        <div className="rounded-xl px-3.5 py-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${NEON.borderSoft}` }}>
          <div className="text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: NEON.yellow }}>Found on the exam</div>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: NEON.text }}>{set.firstStem}</p>
        </div>
      )}
    </div>
  );

  return (
    <article
      ref={attach}
      data-set-id={set.id}
      data-idx={idx}
      className={narrow ? "flex flex-col justify-center" : "lm-surface rounded-2xl border"}
      style={{
        scrollSnapAlign: "start",
        ...(narrow
          ? { minHeight: "calc(100dvh - 56px)", background: "#05080f", borderBottom: `1px solid ${NEON.borderSoft}` }
          : { borderColor: active ? NEON.yellow : "var(--lm-border)", borderWidth: 1, borderStyle: "solid", padding: 16, boxShadow: active ? `0 0 0 1px ${NEON.yellow}, 0 24px 60px -30px rgba(252,163,17,0.5)` : undefined, transition: "border-color 200ms, box-shadow 200ms" }),
      }}
    >
      {narrow ? (
        <>
          <div style={{ maxWidth: portrait ? "min(100vw, calc((100dvh - 140px) * 9 / 16))" : "100%", margin: "0 auto", width: "100%" }}>{videoBox}</div>
          {copy}
        </>
      ) : portrait ? (
        <div className="grid gap-5" style={{ gridTemplateColumns: "300px minmax(0, 1fr)" }}>
          {videoBox}
          {copy}
        </div>
      ) : (
        <div className="flex flex-col gap-4">{videoBox}{copy}</div>
      )}
    </article>
  );
}

// ── TOPIC BREAK — between topics: where the student is, and the one share ask. ───────────────────
function TopicBreak({ topic, done, total, nextTopic, courseCode, narrow, onShare, onNext }: {
  topic: StudentTopic; done: number; total: number; nextTopic: StudentTopic; courseCode: string | null; narrow: boolean; onShare: () => void; onNext: () => void;
}) {
  const finished = total > 0 && done === total;
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl px-5 py-4 sm:flex-row sm:items-center"
      style={{ scrollSnapAlign: "start", margin: narrow ? "0 12px" : 0, border: `1px dashed ${finished ? "rgba(47,191,113,0.5)" : NEON.borderSoft}`, background: "rgba(255,255,255,0.02)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13.5px] font-black" style={{ color: NEON.text, fontFamily: BRAND_DISPLAY }}>
          {finished && <Check className="h-4 w-4" style={{ color: NEON.green }} />}
          {finished ? `${topic.name} crammed.` : total === 0 ? `${topic.name} · cram videos coming soon` : `${topic.name} · ${done} of ${total}`}
        </div>
        <div className="mt-0.5 text-[12px]" style={{ color: NEON.muted }}>
          Know someone in {courseCode ?? "this class"} who needs this? Send it — it's free for them too.
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onShare} className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-black" style={{ background: "rgba(255,255,255,0.06)", color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}><Share2 className="h-3.5 w-3.5" /> Share with a friend</button>
        <button type="button" onClick={onNext} className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-black" style={{ background: NEON.yellow, color: "#0B1322" }}>Next: {nextTopic.shortLabel || nextTopic.name} <ChevronDown className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

// ── FINISH CARD — the feed's ending. Rewatch, share, and the Exam 2 capture live HERE. ───────────
function FinishCard({ examLabel, done, total, totalSec, topics, nextExam, campusId, campusName, courseCode, narrow, onShare, onJumpTopic, onContinue }: {
  examLabel: string; done: number; total: number; totalSec: number; topics: StudentTopic[];
  nextExam: ExamTabState | null; campusId: string | null; campusName: string | null; courseCode: string | null; narrow: boolean;
  onShare: () => void; onJumpTopic: (topicId: string) => void; onContinue: (() => void) | null;
}) {
  const all = done === total;
  const mins = Math.round(totalSec / 60);
  return (
    <section
      className="lm-surface flex flex-col items-center gap-4 rounded-2xl border px-5 py-8 text-center"
      style={{ scrollSnapAlign: "start", margin: narrow ? "12px 12px 110px" : 0, borderColor: all ? NEON.green : "var(--lm-border)", borderWidth: 1, borderStyle: "solid", minHeight: narrow ? "calc(100dvh - 56px)" : undefined, justifyContent: "center" }}
    >
      <BoltBoil height={72} />
      <h2 className="text-[22px] font-black leading-tight sm:text-[26px]" style={{ color: NEON.text, fontFamily: BRAND_DISPLAY }}>
        {all ? `You crammed ${examLabel}.` : `${done} of ${total} crammed.`}
      </h2>
      <p className="text-[13px]" style={{ color: NEON.muted }}>
        {total} cram video{total === 1 ? "" : "s"}{mins > 0 ? ` · ${mins} min` : ""}{all ? " · every one watched to the end" : ""}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {!all && onContinue && <button type="button" onClick={onContinue} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-black" style={{ background: NEON.yellow, color: "#0B1322" }}>Keep cramming <ChevronDown className="h-4 w-4" /></button>}
        <button type="button" onClick={onShare} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-black" style={{ background: all ? NEON.yellow : "rgba(255,255,255,0.06)", color: all ? "#0B1322" : NEON.text, border: all ? 0 : `1px solid ${NEON.borderSoft}` }}><Share2 className="h-4 w-4" /> Share with a friend</button>
      </div>

      {/* REWATCH — one chip per topic, jumps the feed back. */}
      <div className="mt-2 w-full max-w-[560px]">
        <div className="text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: NEON.muted }}>Rewatch a topic</div>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {topics.map((t) => (
            <button key={t.id} type="button" onClick={() => onJumpTopic(t.id)} className="rounded-full px-3 py-1 text-[11.5px] font-bold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}`, background: "rgba(255,255,255,0.03)" }}>{t.name}</button>
          ))}
        </div>
      </div>

      {/* THE EXAM 2 CAPTURE — the most motivated reader we get is one who just finished Exam 1. */}
      {nextExam && (
        <div className="mt-2 w-full max-w-[560px] text-left">
          <ExamWaitlist examNum={nextExam.num} label={nextExam.label} campusId={campusId} campusName={campusName} courseCode={courseCode} />
        </div>
      )}
    </section>
  );
}
