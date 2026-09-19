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
import { ArrowUp, Check, ChevronLeft, Loader2, Lock, Maximize2, Pause, Play, Volume2, VolumeX, X } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { PracticeStage } from "@/components/site/PracticeStage";
import { CramCardsPanel } from "@/components/learn/CramCards";
import { submitIntake } from "@/lib/intake.functions";
import type { PracticeQuestion, StudentSet, StudentTopic } from "@/lib/student.functions";
import { LK, type LearnTheme } from "@/components/learn/learn-theme";
import { DEMO_PLAYBACK, muxThumb, SOUND_KEY, type Prog } from "@/components/learn/cram-media";
import { BreatherCard } from "@/components/learn/BreatherCard";
import { PracticeEndCard } from "@/components/learn/PracticeEndCard";
import { PANEL_BG, PANEL_EDGE, PANEL_INK, SetPanel, tabsOf, type SetTab } from "@/components/learn/SetPanel";

/** ONE PART OF A SET (2026-09-11): a set filmed as five splits is five items in the player and
 *  five cards in the rail — Lee: "I've posted all 5 videos but only seeing first one." `key` is
 *  the part's publish key (student-shorts' partKey) and the key its progress is kept under. */
export type PlayerPart = { index: number; of: number; name: string; playbackId: string | null; coverUrl: string | null; key: string; endCta?: "try" | "unlock" | null;
  /** When the practice slide comes up, in seconds — the stitch recorded it. Absent = as the last slide arrives. */
  ctaAtS?: number | null;
  /** "practice80" — the recap: it waits for the other videos and an 80% practice run (lib/practice-score.ts). */
  gate?: "practice80" | null };
export type PlayerItem = { set: StudentSet; topic: StudentTopic; n: number; of: number; locked: boolean; part: PlayerPart };

// SOUND IS ON when a video is opened (Lee, 2026-09-16: "ensure that the videos have sound on when clicked to play.
// Sound is off only for autoplay in the background / on hover"). The player opens from a tap, which is the gesture
// browsers want; only a student's own mute sticks for the visit.
const readSound = () => { try { return sessionStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } };
const writeSound = (on: boolean) => { try { sessionStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* ignore */ } };
const SHARE_DISMISS = "sa-player-share-dismissed";
/** m:ss on the control bar. */
const clockOf = (s: number): string => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");


export function CramPlayer({
  items, index, onIndex, progress, onStarted, onComplete, onPosition, resolvePlayback, demo, narrow, theme,
    practice, onPractice, campusName, campusSlug, chapterSlug = null, contactRef, onShare, onLocked, demoQuestions, onExit,
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
  /** The chapter the student is on — a shared score points at their chapter's page (2026-09-17). */
  chapterSlug?: string | null;
  contactRef: string | null;
  onShare: () => void | Promise<boolean>;
  onLocked: (topic: StudentTopic) => void;
  demoQuestions?: PracticeQuestion[];
}) {
  const item = items[index];
    const [soundOn, setSoundOn] = useState(true);
  useEffect(() => { setSoundOn(readSound()); }, []);
  /** Parts whose practice offer has already been made this visit — the end of the video then rolls on. */
  const offered = useRef(new Set<string>());
    const [ask, setAsk] = useState(false);
  // THE SET SCREEN (2026-09-16, SetPanel.tsx): Watch · Practice (· Bonus) beside the video on a desk, always; the
  // sheet a tab bar opens on a phone. `practice` (the shell's ?stage=practice) is the Practice tab being open.
  const [tab, setTab] = useState<SetTab>("watch");
  const [sheet, setSheet] = useState(false);
  useEffect(() => { if (practice) { setTab("practice"); setSheet(true); } }, [practice]);
  const pickTab = (t: SetTab) => { setTab(t); setSheet(true); onPractice(t === "practice"); };
  const closeSheet = () => { setSheet(false); onPractice(false); };
  // BREATHER (2026-09-14): a recap beat after this part, before the next one — only on the way
  // forward at the end of a video. Tap skips; it never shows twice for the same part in a visit.
  const [breather, setBreather] = useState<{ key: string; heading: string; body: string; position: string } | null>(null);
  /** The part whose practice end screen is up (PracticeEndCard), by key — moving to another part drops it. */
    const [endCta, setEndCta] = useState<string | null>(null);
  // THE RECAP LOCK IS GONE (Lee, 2026-09-16: "drop the recap video lock"). The 80% gate moved to the Bonus tab.
  const seenBreathers = useRef(new Set<string>());
  // CRAM CARDS (2026-09-03): video → cards → practice. Same drawer as practice.
  const [cards, setCards] = useState(false);
  const [shareCard, setShareCard] = useState(true);
  useEffect(() => { try { setShareCard(sessionStorage.getItem(SHARE_DISMISS) !== "1"); } catch { /* ignore */ } }, []);
  // "Know someone in this class?" (Lee, 2026-09-11): only from the THIRD video on, one button.
  const [shareCopied, setShareCopied] = useState(false);
  const copyShare = async () => { const ok = await onShare(); if (ok !== false) { setShareCopied(true); window.setTimeout(() => setShareCopied(false), 2200); } };
  const hasPrev = index > 0, hasNext = index < items.length - 1;
  // THE NEXT TOPIC (2026-09-11): the first item after this one in a different topic — what the
  // practice drawer's "Next topic →" opens. -1 on the last topic, where it becomes "Back to the
  // videos" (the exit).
  const nextTopicIndex = items.findIndex((it, j) => j > index && it.topic.id !== items[index]?.topic.id);
  const go = useCallback((d: 1 | -1) => { const j = index + d; if (j >= 0 && j < items.length) { onIndex(j); setAsk(false); } }, [index, items.length, onIndex]);
  // A breather belongs to the part it follows: moving anywhere else clears it.
  useEffect(() => { setBreather(null); }, [index]);

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

  // scroll wheel (desktop): one notch past the threshold moves one video, then a short lockout
  // so a single flick never skips two (Lee, 2026-09-11, later: "scrollable vs. swipeable on a
  // desktop").
  const wheelLock = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    // A DESK SCROLLS, A PHONE SWIPES (Lee, 2026-09-16: "when scrolling on desktop/laptop it is thinking im on
    // mobile and it changes to next video"): the wheel only pages on a coarse pointer (a touchpad-less tablet).
    if (typeof window !== "undefined" && !window.matchMedia?.("(pointer: coarse)").matches) return;
    if (Math.abs(e.deltaY) < 24) return;
    const now = Date.now();
    if (now < wheelLock.current) return;
    wheelLock.current = now + 650;
    go(e.deltaY > 0 ? 1 : -1);
  };

  // swipe (phone)
  const touchY = useRef<number | null>(null);
  // THE VIDEO FOLLOWS THE THUMB (Lee, 2026-09-11: "make it where the whole thumbnail is swiping
  // with it … it's not visually clear"): the stage translates with the finger, slides off when
  // the swipe passes the threshold (then the next video mounts at rest), and springs back when
  // it does not. A swipe with nowhere to go moves a quarter as far, which reads as "that's the end".
  const [drag, setDrag] = useState<{ y: number; settle: boolean }>({ y: 0, settle: false });
  const dragging = useRef(false);
  const onTouchStart = (e: React.TouchEvent) => { touchY.current = e.touches[0].clientY; dragging.current = false; };
  const onTouchMove = (e: React.TouchEvent) => {
        if (touchY.current == null || sheet || cards || ask) return;
    const dy = e.touches[0].clientY - touchY.current;
    if (!dragging.current && Math.abs(dy) < 8) return;
    dragging.current = true;
    const can = dy < 0 ? hasNext : hasPrev;
    setDrag({ y: can ? dy : dy * 0.25, settle: false });
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchY.current == null) return;
    const dy = e.changedTouches[0].clientY - touchY.current; touchY.current = null; dragging.current = false;
    const can = dy < 0 ? hasNext : hasPrev;
    if (Math.abs(dy) > 70 && can) {
      const h = typeof window !== "undefined" ? window.innerHeight : 800;
      setDrag({ y: dy < 0 ? -h : h, settle: true });
      window.setTimeout(() => { go(dy < 0 ? 1 : -1); setDrag({ y: 0, settle: false }); }, 190);
    } else setDrag({ y: 0, settle: true });
  };

  if (!item) return null;
  const { set, topic, n, of, locked, part } = item;
  const toggleSound = () => setSoundOn((v) => { writeSound(!v); return !v; });
  // The caption: a multi-part set counts its parts ("Assets · 1 of 5"); a single video counts sets.
  const cap = part.of > 1 ? { n: part.index + 1, of: part.of, name: part.name || set.name } : { n, of, name: set.name };

    const breatherCard = breather && (
    <BreatherCard heading={breather.heading} body={breather.body} position={breather.position} onDone={() => { setBreather(null); go(1); }} />
  );
  // THE PRACTICE END SCREEN (2026-09-14, PracticeEndCard.tsx): a video that ends on a practice slide stops
  // on it with the real buttons, and waits — practice or skip is the student's call.
  // THE OFFER IS A GATE (Lee, 2026-09-15: "no more countdown. Just force them to either click Try Practice
  // Problems or Keep Watching"). It arrives with the practice slide — not at the end of the video — and the
  // picture holds until they choose.
  const endCard = endCta === part.key && part.endCta && (
    <PracticeEndCard variant={part.endCta}
      onPractice={() => { setEndCta(null); onPractice(true); }}
      onSkip={() => { setEndCta(null); const v = document.querySelector<HTMLVideoElement>("[data-sa-cram-video]"); if (v && !v.ended) void v.play().catch(() => { /* the glyph invites the tap */ }); else if (hasNext) go(1); }} />
  );
  const video = (
    <Video
      key={part.key} set={set} part={part} locked={locked} demo={demo} soundOn={soundOn} onToggleSound={toggleSound}
            prog={progress[part.key]} narrow={narrow} shrink={!narrow} theme={theme}
      onStarted={() => onStarted(part.key)} onComplete={() => onComplete(part.key)} onPosition={(p, d) => onPosition(part.key, p, d)}
      onEnded={() => {
        if (practice || cards || ask) return;
        if (endCta === part.key) return; // the offer is up — hold here until they choose
                // THE PRACTICE OFFER shows once per part — at its slide (onCta), or here if the slide's moment wasn't
        // known. Once it's been answered, the end of the video rolls straight on (Lee, 2026-09-16: "We want it to
        // automatically go to the next video in series").
        if (part.endCta && !offered.current.has(part.key)) { offered.current.add(part.key); setEndCta(part.key); return; }
        if (!hasNext) return;
        const b = set.breathers?.find((x) => x.afterIndex === part.index);
        const nextSameSet = items[index + 1]?.set.id === set.id;
        if (b && nextSameSet && !seenBreathers.current.has(part.key)) {
          seenBreathers.current.add(part.key);
          setBreather({ key: part.key, heading: b.heading, body: b.body, position: `${part.index + 1} of ${part.of}` });
          return;
        }
        window.setTimeout(() => go(1), 1200);
      }}
            onCta={() => { offered.current.add(part.key); setEndCta(part.key); }}
            // A PHONE'S practice sheet covers the picture, so the video pauses under it (Lee, 2026-09-17:
      // "practice opens while the video keeps playing with sound"). On a desk they sit side by side and it plays on.
      onLocked={() => onLocked(topic)} resolvePlayback={resolvePlayback} paused={ask || (narrow && sheet && tab === "practice")}
      caption={{ topic: topic.name, n: cap.n, of: cap.of, name: cap.name }}
      overlay={breatherCard || endCard || null}
    />
  );

  const askCard = ask && (
    <AskLee set={set} topic={topic} campusName={campusName} campusSlug={campusSlug} contactRef={contactRef} demo={demo} narrow={narrow} onClose={() => setAsk(false)} />
  );

  const cardsPanel = cards && !practice && (
    <div className={narrow ? "flex min-h-0 flex-1 flex-col" : "lk-in flex flex-col overflow-hidden rounded-2xl"} style={narrow ? { background: LK.surface, borderTop: `1px solid ${LK.border}` } : { width: 420, maxHeight: "78vh", background: LK.surface, border: `1px solid ${LK.border}` }}>
      <div className="flex shrink-0 items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${LK.border}` }}>
        <span className="lk-disp" style={{ fontSize: 15 }}>Cram cards</span>
        <span className="min-w-0 truncate text-[12px]" style={{ color: LK.muted }}>{set.name}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => setCards(false)} className="grid h-8 w-8 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }} aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CramCardsPanel setId={set.id} demo={demo} practiceCount={set.ceqCount} onPractice={() => { setCards(false); onPractice(true); }} />
      </div>
    </div>
  );

    // THE SET SCREEN (2026-09-16, SetPanel.tsx) on the school picker's navy (Lee, 2026-09-15: "it needs to match the
  // vibe of the school picker"): the whole set in order, the practice, the bonus, Ask Lee. Always beside the video on
  // a desk; the sheet the tab bar opens on a phone.
  const panelOpen = !narrow || sheet;
  const setPanel = panelOpen && (
    <div className={narrow ? "flex min-h-0 flex-1 flex-col" : "lk-in flex flex-col overflow-hidden rounded-2xl"} style={narrow ? { background: PANEL_BG, borderTop: `1px solid ${PANEL_EDGE}`, borderRadius: "18px 18px 0 0", color: PANEL_INK } : { width: "min(520px, 44vw)", height: "min(700px, calc(100dvh - 110px))", background: PANEL_BG, border: `1px solid ${PANEL_EDGE}`, color: PANEL_INK, boxShadow: "0 30px 70px -30px rgba(0,0,0,0.85)" }}>
      <SetPanel
        items={items} index={index} onIndex={(i) => { onIndex(i); setAsk(false); }} progress={progress}
        tab={tab} onTab={pickTab} narrow={narrow} onClose={narrow ? closeSheet : undefined}
        demo={demo} demoQuestions={demoQuestions} campusName={campusName} campusSlug={campusSlug} chapterSlug={chapterSlug}
        guidance={nextTopicIndex >= 0
          ? { nextLabel: "Next topic →", onNext: () => { onPractice(false); setTab("watch"); setSheet(false); setAsk(false); onIndex(nextTopicIndex); } }
          : { nextLabel: "Back to the videos", onNext: () => { onPractice(false); onExit(); } }}
        onPracticeDone={() => { onPractice(false); setTab("watch"); setSheet(false); if (hasNext) go(1); }}
      />
    </div>
  );
  const tabLabel = (t: SetTab) => (t === "watch" ? "Videos" : t === "practice" ? "Practice" : "Bonus");

  if (narrow) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col" style={{ background: "#000", overflow: "hidden" }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchY.current = null; dragging.current = false; setDrag({ y: 0, settle: true }); }}>
                <div className={sheet || cards || ask ? "shrink-0" : "min-h-0 flex-1"} style={{ ...(sheet || cards || ask ? { height: 220 } : {}), transform: `translateY(${drag.y}px)`, transition: drag.settle ? "transform 190ms ease-out" : "none", willChange: "transform" }}>{video}</div>
        <button type="button" onClick={onExit} className="absolute left-3 top-3 z-[2] inline-flex h-9 items-center gap-1 rounded-full pl-2 pr-3.5 text-[12.5px] font-extrabold" style={{ background: "rgba(0,0,0,0.72)", color: "#FFFFFF", border: "1px solid rgba(255,255,255,0.4)", cursor: "pointer", backdropFilter: "blur(6px)" }} aria-label="Back to all videos"><ChevronLeft className="h-4 w-4" /> All videos</button>
        {!sheet && !cards && !ask && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 p-4" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))", paddingBottom: 62 }}>
            <div className="min-w-0 flex-1 pb-1">
              <div className="text-[10px] font-extrabold uppercase" style={{ letterSpacing: "0.14em", color: theme.accent }}>{topic.name} · {cap.n} of {cap.of}</div>
              <div className="lk-disp" style={{ fontSize: 19, lineHeight: 1.1, marginTop: 4, color: "#F6F2E9", textShadow: "0 1px 10px rgba(0,0,0,0.65)" }}>{cap.name}</div>
              {hasNext && <div className="lk-swipe mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(255,255,255,0.14)", color: "#F2EFE6" }}><ArrowUp className="lk-swipe-arrow h-3.5 w-3.5" /> Swipe up for the next video</div>}
              {/* THE TAB BAR (2026-09-16): Videos · Practice · Bonus open the set screen as a sheet. */}
              <div className="pointer-events-auto mt-2.5 flex gap-1.5">
                {tabsOf(set.bonus).map((t) => (
                  <button key={t} type="button" onClick={() => pickTab(t)} className="rounded-full px-3 py-1.5 text-[12px] font-extrabold" style={{ background: t === "practice" ? theme.accent : "rgba(0,0,0,0.6)", color: t === "practice" ? theme.accentInk : "#F2EFE6", border: t === "practice" ? 0 : "1px solid rgba(255,255,255,0.35)", cursor: "pointer", minHeight: 34 }}>
                    {tabLabel(t)}{t === "practice" && set.ceqCount > 0 ? ` · ${set.ceqCount}` : ""}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {cardsPanel}
        {setPanel}
        {askCard}
      </div>
    );
  }

  // THE SIMPLE PLAYER (Lee, 2026-09-11: "remove the side HUB for now … Just simple player for
  // now"): the stage, "All videos", and — from the third video on — one small card. A click on
  // anything that is not the stage closes it (the lightbox's own rule).
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center" style={{ gap: 16, padding: "16px 32px" }} onClick={(e) => { if (e.target === e.currentTarget) onExit(); }} onWheel={onWheel}>
      <button type="button" onClick={onExit} className="lk-btn lk-btn-ghost absolute left-8 top-5" style={{ padding: "8px 14px 8px 10px", fontSize: 12 }}><ChevronLeft className="h-4 w-4" /> All videos</button>
      {!practice && !cards && !ask && shareCard && index >= 2 && (
        <div className="lk-card lk-in absolute bottom-6 left-8 flex w-[260px] flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[13.5px] font-bold leading-snug">Know someone in this class?</div>
            <button type="button" onClick={() => { setShareCard(false); try { sessionStorage.setItem(SHARE_DISMISS, "1"); } catch { /* ignore */ } }} className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }} aria-label="Dismiss"><X className="h-3 w-3" /></button>
          </div>
          <div className="text-[12.5px] leading-relaxed" style={{ color: LK.muted }}>Send them this. Exam 1 is free for them, too.</div>
          <button type="button" onClick={() => void copyShare()} className="lk-btn lk-btn-acc self-start" style={{ padding: "7px 12px", fontSize: 11 }}>{shareCopied ? <><Check className="h-3.5 w-3.5" /> Copied</> : "Copy share link"}</button>
        </div>
      )}
            {video}
      {cardsPanel}
      {setPanel}
      {askCard}
    </div>
  );
}

// ── the video ──────────────────────────────────────────────────────────────────────────────────
// THE STAGE (Lee, 2026-09-11, an hour before launch: "clicking the video doesn't play it. Major
// problem. The player also should be very much simplified"). No native control bar any more —
// it fought the caption for the bottom of the frame and a click on the picture did nothing in
// some browsers. Now: the whole picture is the play/pause button (a soft play glyph shows while
// paused), a thin progress bar along the foot you can tap to seek, the sound pill at the top,
// fullscreen bottom-right on a desk, and a check with "Crammed" when it ends. Autoplays muted
// the moment it can (the browser rule), resumes where it left off, keeps writing its position.
function Video({ set, part, locked, demo, soundOn, onToggleSound, prog, narrow, shrink, theme, onStarted, onComplete, onPosition, onEnded, onCta, onLocked, resolvePlayback, paused, caption, overlay }: {
  /** Drawn over the picture — the breather between this video and the next. */
  overlay?: React.ReactNode;
  /** The practice slide is on screen — the picture holds and the offer goes up. */
  onCta?: () => void;
  set: StudentSet; part: PlayerPart; locked: boolean; demo: boolean; soundOn: boolean; onToggleSound: () => void; prog: Prog | undefined; narrow: boolean; shrink: boolean; theme: LearnTheme;
  onStarted: () => void; onComplete: () => void; onPosition: (p: number, d: number | null) => void; onEnded: () => void; onLocked: () => void;
  resolvePlayback: (set: StudentSet) => Promise<string | null>; paused: boolean;
  caption: { topic: string; n: number; of: number; name: string };
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState(false);
  const [ended, setEnded] = useState(false);
  const [playing, setPlaying] = useState(false);
  // TRUE until the stream can play, and again whenever it stalls — drives the loading wheel.
  const [buffering, setBuffering] = useState(true);
    const [pct, setPct] = useState(0);
  const [at, setAt] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [vol, setVol] = useState(1);
  const [barOpen, setBarOpen] = useState(false);
  /** The practice offer has been made on this part — once only. */
  const ctaDone = useRef(false);
  useEffect(() => { ctaDone.current = false; }, [part.key]);
  const [fetched, setFetched] = useState<string | null>(null);
  const pid = part.playbackId ?? set.playbackId ?? fetched;
  const isDemo = demo || pid === DEMO_PLAYBACK;
  const portrait = set.orientation === "portrait";
  const poster = part.coverUrl ?? (part.index === 0 ? set.coverUrl : null) ?? (pid && !isDemo ? muxThumb(pid, portrait ? 480 : 960) : undefined);
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
    // hls.js FIRST (Lee, 2026-09-11: "Videos still aren't playing"). Chrome answers "maybe" to
    // canPlayType("application/vnd.apple.mpegurl") and then cannot play the raw .m3u8 (media
    // error 4). Native HLS is only for the browsers hls.js cannot run in — iOS Safari.
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !ref.current) return;
      if (Hls.isSupported()) { const h = new Hls(); h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr(true); }); h.loadSource(src); h.attachMedia(ref.current); hls = h; }
      else if (ref.current.canPlayType("application/vnd.apple.mpegurl")) ref.current.src = src;
      else setErr(true);
    }).catch(() => setErr(true));
    return () => { cancelled = true; hls?.destroy(); };
  }, [pid, isDemo, locked]);
  const startAt = prog?.state === "in_progress" ? prog.positionSec : 0;
  useEffect(() => {
    const v = ref.current;
    if (!v || isDemo || locked || !pid) return;
    if (paused) { v.pause(); return; }
    const go = () => { if (startAt > 5 && (!v.duration || startAt < v.duration - 10) && v.currentTime < 1) v.currentTime = startAt; void v.play().catch(() => { /* the glyph invites the tap */ }); };
    const arm = () => { if (v.readyState >= 1) go(); else v.addEventListener("loadedmetadata", go, { once: true }); };
    // NEVER START IN A TAB NOBODY IS LOOKING AT (Lee, 2026-09-19: "I keep having this random video
    // starting randomly on my computer"). The player autoplays WITH SOUND — soundOn defaults true —
    // and every route in lands here: ?play=1 from the home page whose tree resolves late in a
    // background tab, and a /learn?set=… tab the browser restores on startup. Chrome permits the
    // sound because OUR media-engagement score is high, so it bit Lee and would not have bitten a
    // first-time student. The intent is kept, not dropped: it starts the moment the tab is looked at.
    if (document.visibilityState === "visible") { arm(); return () => v.removeEventListener("loadedmetadata", go); }
    const onVis = () => { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", onVis); arm(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); v.removeEventListener("loadedmetadata", go); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, isDemo, locked, paused]);
    useEffect(() => { const v = ref.current; if (v) { v.muted = !soundOn; if (soundOn && v.volume === 0) { v.volume = 1; setVol(1); } } }, [soundOn]);
  const lastWrite = useRef(0);
  const flush = () => { const v = ref.current; if (v && v.currentTime > 0) onPosition(Math.floor(v.currentTime), v.duration ? Math.floor(v.duration) : null); };
  useEffect(() => () => { const v = ref.current; if (v && !isDemo && v.currentTime > 0 && !v.ended) onPosition(Math.floor(v.currentTime), v.duration ? Math.floor(v.duration) : null); }, [isDemo, onPosition]);
  const finish = () => { onComplete(); setEnded(true); setPlaying(false); onEnded(); };
  const toggle = () => { const v = ref.current; if (!v) return; if (v.paused || v.ended) { if (v.ended) v.currentTime = 0; setEnded(false); void v.play().catch(() => {}); } else v.pause(); };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { e.stopPropagation(); const v = ref.current; if (!v || !v.duration) return; const r = e.currentTarget.getBoundingClientRect(); v.currentTime = Math.max(0, Math.min(v.duration, ((e.clientX - r.left) / r.width) * v.duration)); };
  const fullscreen = (e: React.MouseEvent) => { e.stopPropagation(); const el = box.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); };

  // Desktop: the Shorts proportion, sized to whatever height the viewport actually has (the top
  // bar takes ~72px, the padding ~30) — a 746px video on a 720px laptop must shrink, not clip.
  // Centered and as large as the viewport allows (King, 2026-09-11: "displayed larger and
  // centered in the middle of the screen by default").
    // Beside the set screen (shrink) the picture matches the panel's height.
  const h = narrow ? "100%" : shrink ? "min(700px, calc(100dvh - 110px))" : "min(900px, calc(100dvh - 48px))";
  const w = narrow ? "100%" : shrink ? "calc(min(700px, calc(100dvh - 110px)) * 9 / 16)" : "calc(min(900px, calc(100dvh - 48px)) * 9 / 16)";
  const pill = { background: "rgba(28,28,28,0.85)", color: "#F2EFE6", border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer" } as const;
  return (
    <div ref={box} className="relative overflow-hidden" style={{ width: w, height: h, borderRadius: narrow ? 0 : 16, background: "#000", flexShrink: 0, transition: "width 160ms ease, height 160ms ease", containerType: "inline-size" }}>
      {overlay}
      {locked ? (
        <button type="button" onClick={onLocked} className="grid h-full w-full place-items-center text-center" style={{ background: LK.surface2, border: 0, color: LK.text, cursor: "pointer" }}>
          <div><Lock className="mx-auto h-7 w-7" style={{ color: LK.muted }} /><div className="mt-2 text-[13px] font-bold">{caption.topic} isn't open yet</div><div className="mt-0.5 text-[11.5px]" style={{ color: LK.muted }}>tap to get notified</div></div>
        </button>
      ) : isDemo ? (
        <div className="grid h-full w-full place-items-center text-center" style={{ background: "radial-gradient(60% 40% at 50% 45%, #2A2A2A 0%, #000 70%)" }}>
          <div><div className="mx-auto mb-3 inline-block"><BoltBoil height={56} /></div><div className="text-[11px] font-semibold" style={{ color: LK.muted, fontFamily: "monospace" }}>[ cram video plays here ]</div>{!ended && <button type="button" className="lk-btn lk-btn-acc mt-4" onClick={finish}>Finish the video</button>}</div>
        </div>
      ) : err ? (
        <div className="grid h-full w-full place-items-center px-6 text-center text-[13px]" style={{ color: LK.red }}>Couldn't load this video. Try again shortly.</div>
      ) : !pid ? (
        <div className="grid h-full w-full place-items-center text-center" style={{ background: LK.surface2 }}><div><div className="mx-auto mb-2 inline-block"><BoltBoil height={48} /></div><div className="text-[12px] font-semibold" style={{ color: LK.muted }}>Loading…</div></div></div>
      ) : (
        <>
          {/* THE PICTURE IS THE BUTTON. */}
          <div role="button" tabIndex={0} aria-label={playing ? "Pause" : "Play"} onClick={toggle} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } }} className="absolute inset-0" style={{ cursor: "pointer", outline: "none" }}>
            <video ref={ref} playsInline muted={!soundOn} preload="auto" poster={poster} className="h-full w-full" style={{ objectFit: "contain", background: "#000", pointerEvents: "none" }}
              onPlay={() => { setEnded(false); setPlaying(true); onStarted(); }} onPause={() => { setPlaying(false); flush(); }}
              onWaiting={() => setBuffering(true)} onStalled={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onCanPlay={() => setBuffering(false)}
                            onTimeUpdate={() => {
                const v = ref.current;
                if (!v) return;
                if (v.duration) { setPct(v.currentTime / v.duration); setDur(v.duration); }
                setAt(v.currentTime);
                // THE PRACTICE SLIDE (2026-09-15): at the moment the stitch recorded, else as the last slide
                // arrives. The picture holds there until they choose — the offer is a gate, not a countdown.
                if (onCta && part.endCta && !ctaDone.current && v.duration) {
                  const mark = part.ctaAtS != null && part.ctaAtS > 0 && part.ctaAtS < v.duration - 0.4 ? part.ctaAtS : Math.max(0, v.duration - 4);
                  // No pause (Lee, 2026-09-16: "the try the practice questions button is pausing the easy points
                  // video #1. We don't want that") — the offer rides over the picture; the end holds on it.
                  if (v.currentTime >= mark) { ctaDone.current = true; onCta(); }
                }
                const now = Date.now(); if (now - lastWrite.current > 5000) { lastWrite.current = now; flush(); }
              }}
              onLoadedMetadata={() => { const v = ref.current; if (v?.duration) setDur(v.duration); }}
              data-sa-cram-video
              onEnded={finish} onError={() => setErr(true)} />
            {/* THE LOADING WHEEL (Lee, 2026-09-11: "ensure there's a loading animation … since it
                feels like it's a bit stuck otherwise") — while the stream is buffering, in place
                of the play glyph. */}
            {buffering && !ended && !err && (
              <span aria-hidden className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full" style={{ width: 76, height: 76, background: "rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.35)", color: "#fff" }}>
                <Loader2 className="h-8 w-8 animate-spin" />
              </span>
            )}
            {!playing && !ended && !buffering && (
              <span aria-hidden className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full" style={{ width: 76, height: 76, background: "rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.85)", color: "#fff" }}>
                <Play className="h-8 w-8" style={{ marginLeft: 4 }} fill="currentColor" />
              </span>
            )}
            {ended && (
              <span aria-hidden className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center" style={{ gap: 8 }}>
                <span className="grid place-items-center rounded-full" style={{ width: 64, height: 64, background: LK.green, color: "#0B1220" }}><Check className="h-8 w-8" /></span>
                <span className="lk-disp" style={{ fontSize: 15, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,.8)" }}>Crammed</span>
              </span>
            )}
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onToggleSound(); }} className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-extrabold shadow-lg" style={soundOn ? pill : { ...pill, background: theme.accent, color: theme.accentInk, border: 0 }}>
            {soundOn ? <><Volume2 className="h-3.5 w-3.5" /> Sound on</> : <><VolumeX className="h-3.5 w-3.5" /> Tap for sound</>}
          </button>
          {!narrow && (
            <button type="button" onClick={fullscreen} aria-label="Full screen" className="absolute grid place-items-center rounded-full" style={{ ...pill, right: 10, bottom: 14, width: 34, height: 34, padding: 0 }}><Maximize2 className="h-4 w-4" /></button>
          )}
                    {/* THE CONTROLS (Lee, 2026-09-15: "we need more controls with the videos. More like a video player… I
              need a way to seek, change video speed, play/pause, volume"). Over the foot of the picture; they fade
              in on hover and stay put on a phone or while paused, and never cover the caption. */}
          <div onClick={(e) => e.stopPropagation()} onMouseEnter={() => setBarOpen(true)} onMouseLeave={() => setBarOpen(false)}
            className="absolute inset-x-0 bottom-0" style={{ padding: "20px 10px 6px", background: "linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0))", opacity: barOpen || !playing || narrow ? 1 : 0, transition: "opacity 160ms ease" }}>
            <input type="range" aria-label="Seek" min={0} max={Math.max(0.1, dur)} step={0.05} value={Math.min(at, dur || 0)}
              onChange={(e) => { const v = ref.current; if (!v) return; const t = Number(e.target.value); v.currentTime = t; setAt(t); if (v.duration) setPct(t / v.duration); }}
              style={{ width: "100%", accentColor: theme.accent, height: 18, cursor: "pointer" }} />
            <div className="flex items-center" style={{ gap: 7, color: "#F2EFE6", fontSize: 11.5, fontWeight: 700, marginTop: -2 }}>
              <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} style={{ ...pill, borderRadius: 999, width: 30, height: 30, display: "grid", placeItems: "center", padding: 0 }}>
                {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" style={{ marginLeft: 2 }} fill="currentColor" />}
              </button>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{clockOf(at)} / {clockOf(dur)}</span>
              <span className="flex-1" />
              <button type="button" title="Playback speed" aria-label={`Speed ${rate}×`} style={{ ...pill, borderRadius: 999, padding: "4px 9px" }}
                onClick={() => { const next = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : rate === 1.5 ? 2 : rate === 2 ? 0.75 : 1; setRate(next); const v = ref.current; if (v) v.playbackRate = next; }}>{rate}×</button>
              <button type="button" onClick={onToggleSound} aria-label={soundOn ? "Mute" : "Unmute"} style={{ ...pill, borderRadius: 999, width: 30, height: 30, display: "grid", placeItems: "center", padding: 0 }}>
                {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
              <input type="range" aria-label="Volume" min={0} max={1} step={0.05} value={soundOn ? vol : 0}
                onChange={(e) => { const n = Number(e.target.value); setVol(n); const v = ref.current; if (v) v.volume = n; if (n > 0 && !soundOn) onToggleSound(); }}
                style={{ width: 64, accentColor: theme.accent, cursor: "pointer" }} />
            </div>
          </div>
        </>
      )}
      {!narrow && !shrink && !locked && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 pb-8 pt-10" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))" }}>
          <div className="text-[10px] font-extrabold uppercase" style={{ letterSpacing: "0.14em", color: theme.accent }}>{caption.topic} · {caption.n} of {caption.of}</div>
          <div className="lk-disp" style={{ fontSize: 18, lineHeight: 1.1, marginTop: 3, color: "#F2EFE6" }}>{caption.name}</div>
        </div>
      )}
      {shrink && <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 pb-7 pt-8" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))" }}><div className="lk-disp" style={{ fontSize: 14, color: "#F2EFE6" }}>{caption.name}</div></div>}
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
        <span className="min-w-0 truncate text-[12px]" style={{ color: LK.muted }}>about {set.name}</span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }} aria-label="Close"><X className="h-3.5 w-3.5" /></button>
      </div>
      {done ? (
        <div className="rounded-xl px-4 py-4 text-center" style={{ background: "rgba(78,232,180,0.12)", border: `1px solid ${LK.green}` }}><Check className="mx-auto h-5 w-5" style={{ color: LK.green }} /><p className="mt-1 text-[13.5px] font-bold">Got it. I read every one, usually same day.</p></div>
      ) : (
        <>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} placeholder="What's tripping you up?" className="lk-field" style={{ resize: "none", fontSize: 15 }} autoFocus />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="your number or email, so I can answer" className="lk-field" style={{ fontSize: 15 }} />
          <div className="flex items-center gap-3"><button type="button" onClick={() => void send()} disabled={!ok || busy} className="lk-btn lk-btn-acc disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send</button><span className="text-[11.5px]" style={{ color: LK.muted }}>I read every one. Usually same day.</span></div>
          {err && <p role="alert" className="text-[12px]" style={{ color: LK.red }}>{err}</p>}
        </>
      )}
    </>
  );
  if (narrow) return <div className="lk-in flex min-h-0 flex-1 flex-col gap-3 p-4" style={{ background: LK.surface, borderTop: `1px solid ${LK.border}`, borderRadius: "18px 18px 0 0" }}>{body}</div>;
  return <div className="lk-card lk-in flex w-[380px] flex-col gap-3 self-end p-4" style={{ marginBottom: "min(120px, 12vh)" }}>{body}</div>;
}
